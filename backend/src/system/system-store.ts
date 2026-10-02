import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { appDb } from '../repositories/app-db';
import { DATA_DIR } from '../utils/paths';

/**
 * ประกาศถึงผู้ใช้ + โหมดปิดปรับปรุง (หน้า "ประกาศ / ปิดปรับปรุง" ของผู้ดูแล)
 * ที่เก็บ: ตาราง system_notices / app_settings ในฐาน data_dashboard · ไม่ได้ตั้งค่าฐาน = ไฟล์ backend/data/system.json
 * โหมดปิดปรับปรุงต้องตรวจทุก request จึงจำไว้ในหน่วยความจำ (โหลดตอนเปิด backend · อัปเดตทันทีเมื่อผู้ดูแลเปลี่ยน)
 */
export type NoticeLevel = 'info' | 'warning';
export const NOTICE_LEVELS: NoticeLevel[] = ['info', 'warning'];

export interface SystemNotice {
  id: number;
  message: string;
  level: NoticeLevel;
  startsAt: string;
  endsAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  /** เวลาปิดปรับปรุงจริง (ไม่บังคับ) — แยกจากช่วงที่แสดงประกาศ (startsAt–endsAt) */
  maintenanceStart: string | null;
  maintenanceEnd: string | null;
  /** ถึงเวลาแล้วเปิดโหมดปิดปรับปรุงเอง และปิดโหมดเองเมื่อหมดเวลา */
  autoMaintenance: boolean;
  /** ระบบเปิดโหมดอัตโนมัติให้ประกาศนี้ไปแล้วเมื่อไร (เปิดแล้วไม่เปิดซ้ำ แม้ผู้ดูแลกดปิดก่อนเวลา) */
  autoStartedAt: string | null;
}

export type NoticeInput = Pick<SystemNotice, 'message' | 'level' | 'startsAt' | 'endsAt' | 'maintenanceStart' | 'maintenanceEnd' | 'autoMaintenance'>;

export interface MaintenanceState {
  on: boolean;
  message: string;
  since: string | null;
  by: string | null;
  /** เปิดอัตโนมัติจากประกาศ id นี้ (null = ผู้ดูแลกดเอง) — หมดเวลาแล้วระบบปิดให้เฉพาะที่เปิดอัตโนมัติ */
  auto: number | null;
  /** ผู้ดูแลตั้งเวลาปิดโหมดเอง (null = เปิดค้างจนกว่าจะกดปิด) */
  until: string | null;
}

const OFF: MaintenanceState = { on: false, message: '', since: null, by: null, auto: null, until: null };
let maintenance: MaintenanceState = OFF;

/** ปิดปรับปรุงเฉพาะบางหน้า — pages ว่าง = ไม่ได้ปิดหน้าไหน */
export interface PageMaintenanceState {
  pages: string[];
  message: string;
  since: string | null;
  by: string | null;
  /** เปิดทุกหน้ากลับเองเวลานี้ (null = ปิดค้างจนกว่าจะกดเปิด) */
  until: string | null;
}

const NO_PAGES: PageMaintenanceState = { pages: [], message: '', since: null, by: null, until: null };
let pageMaintenance: PageMaintenanceState = NO_PAGES;

/* ---------------------------------- แบบไฟล์ ---------------------------------- */
const FILE = path.join(DATA_DIR, 'system.json');
type FileData = { notices: SystemNotice[]; maintenance: MaintenanceState; pageMaintenance?: PageMaintenanceState; nextId: number };

function readFile(): FileData {
  if (!existsSync(FILE)) return { notices: [], maintenance: OFF, nextId: 1 };
  try { return { notices: [], maintenance: OFF, nextId: 1, ...JSON.parse(readFileSync(FILE, 'utf8')) }; } catch { return { notices: [], maintenance: OFF, nextId: 1 }; }
}

function writeFile(data: FileData) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

/* ---------------------------------- แบบฐาน ---------------------------------- */
interface NoticeRow extends RowDataPacket {
  id: number; message: string; level: NoticeLevel; starts_at: Date; ends_at: Date; created_by: string; created_at: Date; updated_at: Date | null;
  maintenance_start: Date | null; maintenance_end: Date | null; auto_maintenance: number; auto_started_at: Date | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const toDate = (s: string | null) => (s ? new Date(s) : null);

const fromRow = (r: NoticeRow): SystemNotice => ({
  id: r.id, message: r.message, level: r.level, startsAt: r.starts_at.toISOString(), endsAt: r.ends_at.toISOString(),
  createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: iso(r.updated_at),
  maintenanceStart: iso(r.maintenance_start), maintenanceEnd: iso(r.maintenance_end),
  autoMaintenance: Boolean(r.auto_maintenance), autoStartedAt: iso(r.auto_started_at),
});

/** ประกาศเก่า (ไฟล์) ที่สร้างก่อนมีช่องเวลาปิดปรับปรุง */
const withDefaults = (n: SystemNotice): SystemNotice => ({
  ...n,
  maintenanceStart: n.maintenanceStart ?? null,
  maintenanceEnd: n.maintenanceEnd ?? null,
  autoMaintenance: n.autoMaintenance ?? false,
  autoStartedAt: n.autoStartedAt ?? null,
});

export const systemStore = {
  /** ทุกประกาศ — ล่าสุดก่อน */
  async listNotices(): Promise<SystemNotice[]> {
    if (!appDb.isConfigured()) return readFile().notices.map(withDefaults).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return (await appDb.rows<NoticeRow>(`SELECT * FROM ${appDb.t('system_notices')} ORDER BY starts_at DESC, id DESC`)).map(fromRow);
  },

  /** ระบบเปิดโหมดอัตโนมัติให้ประกาศนี้แล้ว — กันเปิดซ้ำ */
  async markAutoStarted(id: number) {
    const now = new Date().toISOString();
    if (!appDb.isConfigured()) {
      const data = readFile();
      const notice = data.notices.find(n => n.id === id);
      if (notice) { notice.autoStartedAt = now; writeFile(data); }
      return;
    }
    await appDb.exec(`UPDATE ${appDb.t('system_notices')} SET auto_started_at = ? WHERE id = ?`, [new Date(now), id]);
  },

  /** ประกาศที่ต้องแสดงตอนนี้ (อยู่ในช่วงเวลาเริ่ม–จบ) — "เตือน" ขึ้นก่อน */
  async activeNotices(now = new Date()): Promise<SystemNotice[]> {
    const t = now.toISOString();
    const all = appDb.isConfigured()
      ? (await appDb.rows<NoticeRow>(`SELECT * FROM ${appDb.t('system_notices')} WHERE starts_at <= ? AND ends_at > ? ORDER BY starts_at`, [now, now])).map(fromRow)
      : readFile().notices.map(withDefaults).filter(n => n.startsAt <= t && n.endsAt > t);
    return all.sort((a, b) => (a.level === b.level ? a.startsAt.localeCompare(b.startsAt) : a.level === 'warning' ? -1 : 1));
  },

  async addNotice(input: NoticeInput, by: string): Promise<SystemNotice> {
    const now = new Date().toISOString();
    if (!appDb.isConfigured()) {
      const data = readFile();
      const notice: SystemNotice = { id: data.nextId, ...input, createdBy: by, createdAt: now, updatedAt: null, autoStartedAt: null };
      data.notices.push(notice);
      data.nextId++;
      writeFile(data);
      return notice;
    }
    const result = await appDb.exec(
      `INSERT INTO ${appDb.t('system_notices')}
        (message, level, starts_at, ends_at, maintenance_start, maintenance_end, auto_maintenance, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.message, input.level, new Date(input.startsAt), new Date(input.endsAt),
        toDate(input.maintenanceStart), toDate(input.maintenanceEnd), input.autoMaintenance ? 1 : 0, by, new Date(now)]);
    return { id: result.insertId, ...input, createdBy: by, createdAt: now, updatedAt: null, autoStartedAt: null };
  },

  /** null = ไม่พบประกาศ */
  async updateNotice(id: number, input: NoticeInput): Promise<SystemNotice | null> {
    const now = new Date().toISOString();
    if (!appDb.isConfigured()) {
      const data = readFile();
      const notice = data.notices.find(n => n.id === id);
      if (!notice) return null;
      // เปลี่ยนเวลาเริ่มปิดปรับปรุง = ตั้งเวลาใหม่ → เปิดโหมดอัตโนมัติได้อีกครั้ง
      // (แก้แค่ข้อความ/เวลาจบ ไม่รีเซ็ต — ไม่งั้นผู้ดูแลกดปิดโหมดก่อนเวลาแล้วระบบเปิดซ้ำ)
      const restart = (notice.maintenanceStart ?? null) !== input.maintenanceStart;
      Object.assign(notice, input, { updatedAt: now, ...(restart ? { autoStartedAt: null } : {}) });
      writeFile(data);
      return withDefaults(notice);
    }
    // auto_started_at ต้องอยู่ก่อน maintenance_start ใน SET (MariaDB ประมวลผลซ้ายไปขวา — เทียบกับค่าเดิม)
    const result = await appDb.exec(
      `UPDATE ${appDb.t('system_notices')} SET message = ?, level = ?, starts_at = ?, ends_at = ?,
        auto_started_at = IF(maintenance_start <=> ?, auto_started_at, NULL),
        maintenance_start = ?, maintenance_end = ?, auto_maintenance = ?, updated_at = ? WHERE id = ?`,
      [input.message, input.level, new Date(input.startsAt), new Date(input.endsAt),
        toDate(input.maintenanceStart), toDate(input.maintenanceStart), toDate(input.maintenanceEnd), input.autoMaintenance ? 1 : 0, new Date(now), id]);
    if (result.affectedRows === 0) return null;
    return fromRow((await appDb.rows<NoticeRow>(`SELECT * FROM ${appDb.t('system_notices')} WHERE id = ?`, [id]))[0]);
  },

  async deleteNotice(id: number): Promise<boolean> {
    if (!appDb.isConfigured()) {
      const data = readFile();
      const before = data.notices.length;
      data.notices = data.notices.filter(n => n.id !== id);
      writeFile(data);
      return data.notices.length < before;
    }
    return (await appDb.exec(`DELETE FROM ${appDb.t('system_notices')} WHERE id = ?`, [id])).affectedRows > 0;
  },

  /** สถานะโหมดปิดปรับปรุง (จากหน่วยความจำ — เรียกได้ทุก request) */
  maintenance(): MaintenanceState {
    return maintenance;
  },

  /** โหลดโหมดปิดปรับปรุงจากที่เก็บ — ตอนเปิด backend (รีสตาร์ทระหว่างปิดปรับปรุงก็ยังปิดอยู่) */
  async loadMaintenance(): Promise<MaintenanceState> {
    if (!appDb.isConfigured()) {
      maintenance = readFile().maintenance ?? OFF;
      return maintenance;
    }
    const rows = await appDb.rows<RowDataPacket>(`SELECT value FROM ${appDb.t('app_settings')} WHERE name = 'maintenance'`);
    try { maintenance = rows[0] ? { ...OFF, ...JSON.parse(rows[0].value as string) } : OFF; } catch { maintenance = OFF; }
    return maintenance;
  },

  /** หน้าที่ปิดปรับปรุงอยู่ (จากหน่วยความจำ — เรียกได้ทุก request) */
  pageMaintenance(): PageMaintenanceState {
    return pageMaintenance;
  },

  async loadPageMaintenance(): Promise<PageMaintenanceState> {
    if (!appDb.isConfigured()) {
      pageMaintenance = readFile().pageMaintenance ?? NO_PAGES;
      return pageMaintenance;
    }
    const rows = await appDb.rows<RowDataPacket>(`SELECT value FROM ${appDb.t('app_settings')} WHERE name = 'page_maintenance'`);
    try { pageMaintenance = rows[0] ? { ...NO_PAGES, ...JSON.parse(rows[0].value as string) } : NO_PAGES; } catch { pageMaintenance = NO_PAGES; }
    return pageMaintenance;
  },

  /** ตั้งรายการหน้าที่ปิดปรับปรุง (ว่าง = เปิดทุกหน้า) — หน้าที่ปิดอยู่แล้วคงเวลาเริ่มเดิม */
  async setPageMaintenance(pages: string[], message: string, by: string, until: string | null = null): Promise<PageMaintenanceState> {
    const next: PageMaintenanceState = pages.length
      ? { pages, message, since: pageMaintenance.pages.length ? pageMaintenance.since : new Date().toISOString(), by, until }
      : NO_PAGES;
    if (!appDb.isConfigured()) {
      const data = readFile();
      data.pageMaintenance = next;
      writeFile(data);
    } else {
      await appDb.exec(
        `INSERT INTO ${appDb.t('app_settings')} (name, value, updated_at, updated_by) VALUES ('page_maintenance', ?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
        [JSON.stringify(next), new Date(), by]);
    }
    pageMaintenance = next;
    return next;
  },

  /** เปลี่ยนเฉพาะข้อความของโหมดที่เปิดอยู่ (เวลาเริ่ม/ผู้เปิดคงเดิม) — ใช้เมื่อผู้ดูแลแก้เวลาจบของประกาศอัตโนมัติ */
  async updateMaintenanceMessage(message: string): Promise<MaintenanceState> {
    if (!maintenance.on) return maintenance;
    const next: MaintenanceState = { ...maintenance, message };
    if (!appDb.isConfigured()) {
      const data = readFile();
      data.maintenance = next;
      writeFile(data);
    } else {
      await appDb.exec(`UPDATE ${appDb.t('app_settings')} SET value = ?, updated_at = ? WHERE name = 'maintenance'`, [JSON.stringify(next), new Date()]);
    }
    maintenance = next;
    return next;
  },

  /**
   * auto = id ประกาศที่สั่งเปิดอัตโนมัติ (ผู้ดูแลกดเอง = null) · until = เวลาปิดเองที่ผู้ดูแลตั้ง
   * เปิดอยู่แล้วสั่งเปิดซ้ำ (เลื่อนเวลา/แก้ข้อความ) → เวลาเริ่มคงเดิม
   */
  async setMaintenance(on: boolean, message: string, by: string, auto: number | null = null, until: string | null = null): Promise<MaintenanceState> {
    const since = maintenance.on ? maintenance.since : new Date().toISOString();
    const next: MaintenanceState = on ? { on: true, message, since, by, auto, until } : OFF;
    if (!appDb.isConfigured()) {
      const data = readFile();
      data.maintenance = next;
      writeFile(data);
    } else {
      await appDb.exec(
        `INSERT INTO ${appDb.t('app_settings')} (name, value, updated_at, updated_by) VALUES ('maintenance', ?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
        [JSON.stringify(next), new Date(), by]);
    }
    maintenance = next;
    return next;
  },
};
