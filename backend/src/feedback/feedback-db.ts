import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { appDb } from '../repositories/app-db';
import { feedbackImages, IMAGE_RETENTION_DAYS, type FeedbackImage } from './feedback-images';
import type { FeedbackCategory, FeedbackEntry, FeedbackHistory, FeedbackStatus } from './feedback-store';

/** เรื่องแจ้งปัญหาในฐาน data_dashboard — ตาราง feedback + feedback_history (ไทม์ไลน์) */

interface FeedbackRow extends RowDataPacket {
  id: string;
  created_at: Date;
  status: FeedbackStatus;
  category: FeedbackCategory;
  page: string;
  message: string;
  name: string | null;
  position: string | null;
  loginname: string | null;
  ip: string | null;
  contact: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  line_qr: string | null;
  images: string | null;
  images_purged: number;
  done_at: Date | null;
  updated_at: Date | null;
  reporter_seen_at: Date | null;
}

interface HistoryRow extends RowDataPacket {
  feedback_id: string;
  time: Date;
  status: FeedbackStatus;
  by_login: string;
  by_name: string | null;
  note: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : undefined);
const toDate = (s?: string) => (s ? new Date(s) : null);

function parseJson<T>(text: string | null): T | undefined {
  if (!text) return undefined;
  try { return JSON.parse(text) as T; } catch { return undefined; }
}

/** แถวในฐาน → รูปแบบเดียวกับที่ระบบใช้ (เหมือนตอนเก็บเป็นไฟล์) — ช่องที่ว่างไม่ใส่ */
function toEntry(row: FeedbackRow, history: FeedbackHistory[]): FeedbackEntry {
  const entry: FeedbackEntry = {
    id: row.id,
    time: row.created_at.toISOString(),
    status: row.status,
    category: row.category,
    page: row.page,
    message: row.message,
  };
  const optional: Partial<FeedbackEntry> = {
    name: row.name ?? undefined,
    position: row.position ?? undefined,
    loginname: row.loginname ?? undefined,
    ip: row.ip ?? undefined,
    contact: row.contact ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    contactLine: row.contact_line ?? undefined,
    lineQr: parseJson<FeedbackImage>(row.line_qr),
    images: parseJson<FeedbackImage[]>(row.images),
    imagesPurged: row.images_purged ? true : undefined,
    doneAt: iso(row.done_at),
    updatedAt: iso(row.updated_at),
    reporterSeenAt: iso(row.reporter_seen_at),
    history: history.length ? history : undefined,
  };
  for (const [key, value] of Object.entries(optional)) if (value !== undefined) (entry as unknown as Record<string, unknown>)[key] = value;
  return entry;
}

/** อ่านเรื่องตามเงื่อนไข พร้อมไทม์ไลน์ — ล่าสุดก่อน */
async function select(where = '', params: unknown[] = [], conn?: PoolConnection): Promise<FeedbackEntry[]> {
  const run = async <T extends RowDataPacket>(sql: string, p: unknown[]) => (conn ? (await conn.query<T[]>(sql, p))[0] : appDb.rows<T>(sql, p));
  const rows = await run<FeedbackRow>(`SELECT * FROM ${appDb.t('feedback')} ${where} ORDER BY created_at DESC, id DESC`, params);
  if (rows.length === 0) return [];
  const historyRows = await run<HistoryRow>(`SELECT * FROM ${appDb.t('feedback_history')} WHERE feedback_id IN (?) ORDER BY time, id`, [rows.map(r => r.id)]);
  const byId = new Map<string, FeedbackHistory[]>();
  for (const h of historyRows) {
    const item: FeedbackHistory = { time: h.time.toISOString(), status: h.status, by: h.by_login, ...(h.by_name ? { byName: h.by_name } : {}), ...(h.note ? { note: h.note } : {}) };
    byId.set(h.feedback_id, [...(byId.get(h.feedback_id) ?? []), item]);
  }
  return rows.map(r => toEntry(r, byId.get(r.id) ?? []));
}

/** บันทึกเรื่อง 1 เรื่อง (ใช้ทั้งตอนแจ้งใหม่ และตอนนำเข้าจากไฟล์เดิม) — มี id นี้อยู่แล้วไม่เขียนทับ คืน true ถ้าเพิ่มใหม่ */
export async function insertFeedback(e: FeedbackEntry, conn?: PoolConnection): Promise<boolean> {
  const exec = async (sql: string, p: unknown[]) => (conn ? (await conn.query(sql, p))[0] : appDb.exec(sql, p)) as { affectedRows: number };
  const result = await exec(
    `INSERT IGNORE INTO ${appDb.t('feedback')}
      (id, created_at, status, category, page, message, name, position, loginname, ip, contact, contact_phone, contact_line,
       line_qr, images, images_purged, done_at, updated_at, reporter_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.id, new Date(e.time), e.status, e.category, e.page, e.message, e.name ?? null, e.position ?? null, e.loginname ?? null, e.ip ?? null,
      e.contact ?? null, e.contactPhone ?? null, e.contactLine ?? null, e.lineQr ? JSON.stringify(e.lineQr) : null,
      e.images?.length ? JSON.stringify(e.images) : null, e.imagesPurged ? 1 : 0, toDate(e.doneAt), toDate(e.updatedAt), toDate(e.reporterSeenAt)],
  );
  if (result.affectedRows === 0) return false;
  for (const h of e.history ?? []) {
    await exec(`INSERT INTO ${appDb.t('feedback_history')} (feedback_id, time, status, by_login, by_name, note) VALUES (?, ?, ?, ?, ?, ?)`,
      [e.id, new Date(h.time), h.status, h.by, h.byName ?? null, h.note ?? null]);
  }
  return true;
}

/** เรื่องใหม่ — status ไม่ระบุ = "ยังไม่ดำเนินการ" · ระบุ done = ปิดเรื่องทันที (เช่น ยืนยันข้อมูล) */
export type NewFeedback = Omit<FeedbackEntry, 'id' | 'time' | 'status'> & { status?: FeedbackStatus };

export function newEntry(entry: NewFeedback): FeedbackEntry {
  const time = new Date().toISOString();
  const status = entry.status ?? 'new';
  return { ...entry, id: randomUUID().slice(0, 8), time, status, ...(status === 'done' ? { doneAt: time } : {}) };
}

export const dbFeedbackStore = {
  async add(entry: NewFeedback): Promise<FeedbackEntry> {
    const saved = newEntry(entry);
    await insertFeedback(saved);
    return saved;
  },

  list(status?: FeedbackStatus) {
    return status ? select('WHERE status = ?', [status]) : select();
  },

  /** เปลี่ยนสถานะ + บันทึกไทม์ไลน์ ในชุดคำสั่งเดียว (ผู้ดูแล 2 คนกดพร้อมกันก็ไม่ทับกัน) */
  async setStatus(id: string, status: FeedbackStatus, by: { loginname: string; name?: string }, note?: string): Promise<FeedbackEntry | null> {
    return appDb.transaction(async conn => {
      const [found] = await conn.query<FeedbackRow[]>(`SELECT status FROM ${appDb.t('feedback')} WHERE id = ? FOR UPDATE`, [id]);
      if (found.length === 0) return null;
      const now = new Date();
      const doneAt = status === 'done' ? (found[0].status === 'done' ? undefined : now) : null;
      await conn.query(
        `UPDATE ${appDb.t('feedback')} SET status = ?, updated_at = ?${doneAt === undefined ? '' : ', done_at = ?'} WHERE id = ?`,
        doneAt === undefined ? [status, now, id] : [status, now, doneAt, id],
      );
      await conn.query(`INSERT INTO ${appDb.t('feedback_history')} (feedback_id, time, status, by_login, by_name, note) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, now, status, by.loginname, by.name ?? null, note ?? null]);
      return (await select('WHERE id = ?', [id], conn))[0] ?? null;
    });
  },

  listByReporter(loginname: string) {
    return select('WHERE loginname = ?', [loginname]);
  },

  async markSeenByReporter(loginname: string) {
    await appDb.exec(
      `UPDATE ${appDb.t('feedback')} SET reporter_seen_at = ?
       WHERE loginname = ? AND updated_at IS NOT NULL AND (reporter_seen_at IS NULL OR reporter_seen_at < updated_at)`,
      [new Date(), loginname],
    );
  },

  async setLineQr(id: string, lineQr: FeedbackImage) {
    await appDb.exec(`UPDATE ${appDb.t('feedback')} SET line_qr = ? WHERE id = ?`, [JSON.stringify(lineQr), id]);
  },

  async setImages(id: string, images: FeedbackImage[]) {
    await appDb.exec(`UPDATE ${appDb.t('feedback')} SET images = ? WHERE id = ?`, [images.length ? JSON.stringify(images) : null, id]);
  },

  /** ลบรูปของเรื่องที่ดำเนินการแล้วครบ IMAGE_RETENTION_DAYS วัน — ข้อความของเรื่องยังอยู่ */
  async purgeOldImages(): Promise<number> {
    const cutoff = new Date(Date.now() - IMAGE_RETENTION_DAYS * 86_400_000);
    const rows = await appDb.rows<FeedbackRow>(
      `SELECT id FROM ${appDb.t('feedback')} WHERE status = 'done' AND done_at < ? AND (images IS NOT NULL OR line_qr IS NOT NULL)`,
      [cutoff],
    );
    for (const { id } of rows) {
      feedbackImages.remove(id);
      await appDb.exec(`UPDATE ${appDb.t('feedback')} SET images = NULL, line_qr = NULL, images_purged = 1 WHERE id = ?`, [id]);
    }
    return rows.length;
  },
};
