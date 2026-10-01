import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { DATA_DIR } from '../utils/paths';
import { appDb } from '../repositories/app-db';
import { logger } from '../utils/logger';

/**
 * ประวัติการใช้งาน — ตั้งค่า DASHBOARD_DB_* แล้วเก็บในฐาน data_dashboard (ตาราง audit_log / audit_log_archive)
 * ไม่ตั้งค่า = เก็บเป็นไฟล์ backend/data/audit-log.jsonl + audit-archive/ เหมือนเดิม
 * ฐานล่มชั่วคราว: รายการใหม่พักไว้ในไฟล์ audit-log-pending.jsonl แล้วส่งเข้าฐานเองเมื่อกลับมา (ไม่มีรายการหาย)
 */
const LOG_FILE = path.join(DATA_DIR, 'audit-log.jsonl');
const PENDING_FILE = path.join(DATA_DIR, 'audit-log-pending.jsonl');
/** ประวัติที่เก่ากว่า AUDIT_KEEP_DAYS ย้ายไปเก็บที่นี่ แยกไฟล์รายเดือน (audit-log-2026-03.jsonl) */
export const ARCHIVE_DIR = path.join(DATA_DIR, 'audit-archive');
/** เก็บในส่วนหลัก (หน้า "ประวัติการใช้งาน" อ่านจากส่วนนี้) กี่วัน — ปรับได้ด้วย AUDIT_KEEP_DAYS */
export const AUDIT_KEEP_DAYS = Number(process.env.AUDIT_KEEP_DAYS) || 180;
/** ไฟล์ข้อมูลแบบเดิม — ใช้นำเข้าฐานครั้งแรก */
export const AUDIT_FILE = LOG_FILE;

export const AUDIT_ACTIONS = [
  'login', 'login_failed', 'login_blocked', 'logout', 'session_expired',
  'view', 'export', 'denied',
  'feedback_submit', 'feedback_status',
  'cache_refresh', 'force_logout',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** ชื่อที่ใช้บันทึกผู้เยี่ยมชม (ไม่ได้ login) */
export const GUEST_NAME = 'guest';

/** กรองตามประเภทผู้ใช้: user = เฉพาะที่ login, guest = เฉพาะผู้เยี่ยมชม */
export type AuditWho = 'all' | 'user' | 'guest';

export interface AuditEntry {
  time: string;
  loginname: string;
  action: AuditAction;
  detail?: string;
  ip?: string;
}

type ReadOptions = { limit?: number; loginname?: string; action?: string; who?: AuditWho };
type UserSummary = { loginname: string; count: number; last: string };

/** อ่านไฟล์ jsonl — ข้ามบรรทัดที่เสีย (เช่น เครื่องดับระหว่างเขียน) หน้าประวัติจะได้ไม่พังทั้งหน้า */
export function readAuditFile(file = LOG_FILE): AuditEntry[] {
  if (!existsSync(file)) return [];
  const entries: AuditEntry[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const e = JSON.parse(line) as AuditEntry;
      if (e && typeof e.time === 'string' && typeof e.loginname === 'string') entries.push(e);
    } catch { /* ข้ามบรรทัดเสีย */ }
  }
  return entries;
}

function newEntry(entry: Omit<AuditEntry, 'time'>): AuditEntry {
  const ip = entry.ip?.replace(/^::ffff:/, '');
  return { time: new Date().toISOString(), ...entry, ...(ip ? { ip } : {}) };
}

/* ---------------------------------- แบบไฟล์ ---------------------------------- */
const fileAudit = {
  write(e: AuditEntry) {
    mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify(e) + '\n', 'utf8');
  },

  /** ย้ายรายการเก่าเข้าคลังรายเดือน — ต่อท้ายคลังก่อน แล้วค่อยเขียนไฟล์หลักใหม่ผ่านไฟล์ชั่วคราว (เครื่องดับกลางคันก็ไม่หาย) */
  archiveOld(keepDays: number, now: Date): number {
    if (!existsSync(LOG_FILE)) return 0;
    const cutoff = new Date(now.getTime() - keepDays * 86_400_000).toISOString();
    const keep: string[] = [];
    const byMonth = new Map<string, string[]>();
    for (const line of readFileSync(LOG_FILE, 'utf8').split('\n')) {
      if (!line) continue;
      let time = '';
      try { time = String((JSON.parse(line) as AuditEntry).time ?? ''); } catch { /* บรรทัดเสีย เก็บไว้ในไฟล์หลักตามเดิม */ }
      if (time && time < cutoff) {
        const month = time.slice(0, 7);
        byMonth.set(month, [...(byMonth.get(month) ?? []), line]);
      } else keep.push(line);
    }
    const moved = [...byMonth.values()].reduce((n, lines) => n + lines.length, 0);
    if (moved === 0) return 0;
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    for (const [month, lines] of byMonth) appendFileSync(path.join(ARCHIVE_DIR, `audit-log-${month}.jsonl`), lines.map(l => l + '\n').join(''), 'utf8');
    const tmp = `${LOG_FILE}.tmp`;
    writeFileSync(tmp, keep.map(l => l + '\n').join(''), 'utf8');
    renameSync(tmp, LOG_FILE);
    return moved;
  },

  stats() {
    return { entries: readAuditFile().length, bytes: existsSync(LOG_FILE) ? statSync(LOG_FILE).size : 0 };
  },

  users(): UserSummary[] {
    const map = new Map<string, UserSummary>();
    for (const e of readAuditFile()) {
      if (e.loginname === GUEST_NAME || !e.loginname) continue;
      const u = map.get(e.loginname) ?? { loginname: e.loginname, count: 0, last: e.time };
      u.count++;
      if (e.time > u.last) u.last = e.time;
      map.set(e.loginname, u);
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  },

  read({ limit = 200, loginname, action, who = 'all' }: ReadOptions): AuditEntry[] {
    return readAuditFile()
      // ชื่อผู้ใช้: พิมพ์บางส่วนก็เจอ (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
      .filter(e => (!loginname || e.loginname.toLowerCase().includes(loginname.toLowerCase())) && (!action || e.action === action))
      // guest = รายการของผู้ที่ไม่ได้ login (login_failed/login_blocked บันทึกชื่อที่คนพิมพ์มา จึงไม่นับเป็น guest)
      .filter(e => who === 'all' || (who === 'guest') === (e.loginname === GUEST_NAME))
      .reverse()
      .slice(0, limit);
  },
};

/* ---------------------------------- แบบฐานข้อมูล ---------------------------------- */
interface AuditRow extends RowDataPacket {
  time: Date;
  loginname: string;
  action: AuditAction;
  detail: string | null;
  ip: string | null;
}

/** เพิ่มหลายรายการ — แบ่งชุดละ 200 แถว (เครื่องนี้รับได้ครั้งละไม่เกิน 1 MB) */
export async function insertAuditRows(entries: AuditEntry[], table: 'audit_log' | 'audit_log_archive' = 'audit_log') {
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    await appDb.exec(`INSERT INTO ${appDb.t(table)} (time, loginname, action, detail, ip) VALUES ?`, [
      chunk.map(e => [new Date(e.time), e.loginname.slice(0, 64), e.action, e.detail?.slice(0, 500) ?? null, e.ip ?? null]),
    ]);
  }
}

const dbAudit = {
  async archiveOld(keepDays: number, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - keepDays * 86_400_000);
    return appDb.transaction(async conn => {
      await conn.query(
        `INSERT INTO ${appDb.t('audit_log_archive')} (time, loginname, action, detail, ip)
         SELECT time, loginname, action, detail, ip FROM ${appDb.t('audit_log')} WHERE time < ? ORDER BY id`, [cutoff]);
      const [result] = await conn.query(`DELETE FROM ${appDb.t('audit_log')} WHERE time < ?`, [cutoff]);
      return (result as { affectedRows: number }).affectedRows;
    });
  },

  async stats() {
    const [count] = await appDb.rows<RowDataPacket>(`SELECT COUNT(*) AS n FROM ${appDb.t('audit_log')}`);
    return { entries: Number(count.n), bytes: 0 };
  },

  async users(): Promise<UserSummary[]> {
    const rows = await appDb.rows<RowDataPacket>(
      `SELECT loginname, COUNT(*) AS count, MAX(time) AS last FROM ${appDb.t('audit_log')}
       WHERE loginname <> ? AND loginname <> '' GROUP BY loginname ORDER BY last DESC`, [GUEST_NAME]);
    return rows.map(r => ({ loginname: r.loginname, count: Number(r.count), last: (r.last as Date).toISOString() }));
  },

  async read({ limit = 200, loginname, action, who = 'all' }: ReadOptions): Promise<AuditEntry[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (loginname) { where.push('loginname LIKE ?'); params.push(`%${loginname.replace(/[\\%_]/g, c => `\\${c}`)}%`); }
    if (action) { where.push('action = ?'); params.push(action); }
    if (who !== 'all') { where.push(who === 'guest' ? 'loginname = ?' : 'loginname <> ?'); params.push(GUEST_NAME); }
    const rows = await appDb.rows<AuditRow>(
      `SELECT time, loginname, action, detail, ip FROM ${appDb.t('audit_log')}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY time DESC, id DESC LIMIT ?`, [...params, limit]);
    return rows.map(r => ({ time: r.time.toISOString(), loginname: r.loginname, action: r.action, ...(r.detail ? { detail: r.detail } : {}), ...(r.ip ? { ip: r.ip } : {}) }));
  },
};

/* ---------------- พักรายการไว้ในไฟล์เมื่อฐานเขียนไม่ได้ แล้วส่งเข้าฐานทีหลัง ---------------- */
let dbWriteFailing = false;

function savePending(e: AuditEntry, error: unknown) {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(PENDING_FILE, JSON.stringify(e) + '\n', 'utf8');
  if (!dbWriteFailing) {
    dbWriteFailing = true;
    logger.warn(`[audit] บันทึกประวัติการใช้งานลงฐานไม่ได้ — พักไว้ในไฟล์ก่อน จะส่งเข้าฐานเองเมื่อเชื่อมต่อได้ (${(error as Error).message})`);
  }
}

export const auditLog = {
  /** บันทึก 1 รายการ — ไม่ต้องรอ (ฐานช้า/ล่มไม่ทำให้หน้าเว็บช้า) */
  write(entry: Omit<AuditEntry, 'time'>) {
    const e = newEntry(entry);
    if (!appDb.isConfigured()) return fileAudit.write(e);
    insertAuditRows([e]).catch(error => savePending(e, error));
  },

  /** ส่งรายการที่พักไว้เข้าฐาน — เรียกทุก 2 นาที (เปลี่ยนชื่อไฟล์ก่อน รายการที่เข้ามาระหว่างส่งจึงไม่หาย) */
  async flushPending(): Promise<number> {
    if (!appDb.isConfigured()) return 0;
    const leftovers = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).filter(f => f.startsWith('audit-log-pending.') && f.endsWith('.sending')) : [];
    if (existsSync(PENDING_FILE)) {
      const sending = `${PENDING_FILE.replace(/\.jsonl$/, '')}.${Date.now()}.sending`;
      renameSync(PENDING_FILE, sending);
      leftovers.push(path.basename(sending));
    }
    let sent = 0;
    for (const name of leftovers) {
      const file = path.join(DATA_DIR, name);
      const entries = readAuditFile(file);
      await insertAuditRows(entries);
      rmSync(file, { force: true });
      sent += entries.length;
    }
    if (sent || dbWriteFailing) {
      dbWriteFailing = false;
      if (sent) logger.info(`[audit] ส่งประวัติการใช้งานที่พักไว้เข้าฐานแล้ว ${sent.toLocaleString()} รายการ`);
    }
    return sent;
  },

  /** ย้ายรายการที่เก่ากว่า keepDays เข้าคลัง (ไม่ลบทิ้ง) — ส่วนหลักไม่โตเรื่อย ๆ หน้าเว็บโหลดเร็ว · คืนจำนวนที่ย้าย */
  async archiveOld(keepDays = AUDIT_KEEP_DAYS, now = new Date()): Promise<number> {
    return appDb.isConfigured() ? dbAudit.archiveOld(keepDays, now) : fileAudit.archiveOld(keepDays, now);
  },

  async stats(): Promise<{ entries: number; bytes: number }> {
    return appDb.isConfigured() ? dbAudit.stats() : fileAudit.stats();
  },

  /** รายชื่อผู้ใช้ในประวัติ (ไม่รวม guest) + จำนวนรายการ + ใช้งานล่าสุด — ใช้ในช่องค้นหาชื่อ */
  async users(): Promise<UserSummary[]> {
    return appDb.isConfigured() ? dbAudit.users() : fileAudit.users();
  },

  async read(options: ReadOptions = {}): Promise<AuditEntry[]> {
    return appDb.isConfigured() ? dbAudit.read(options) : fileAudit.read(options);
  },
};
