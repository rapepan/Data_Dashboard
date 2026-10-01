import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { DATA_DIR } from '../utils/paths';

const LOG_FILE = path.join(DATA_DIR, 'audit-log.jsonl');
/** ประวัติที่เก่ากว่า AUDIT_KEEP_DAYS ย้ายไปเก็บที่นี่ แยกไฟล์รายเดือน (audit-log-2026-03.jsonl) */
export const ARCHIVE_DIR = path.join(DATA_DIR, 'audit-archive');
/** เก็บในไฟล์หลัก (หน้า "ประวัติการใช้งาน" อ่านจากไฟล์นี้) กี่วัน — ปรับได้ด้วย AUDIT_KEEP_DAYS */
export const AUDIT_KEEP_DAYS = Number(process.env.AUDIT_KEEP_DAYS) || 180;

export const AUDIT_ACTIONS = [
  'login', 'login_failed', 'login_blocked', 'logout', 'session_expired',
  'view', 'export', 'denied',
  'feedback_submit', 'feedback_status',
  'cache_refresh',
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

/** อ่านทุกรายการในไฟล์หลัก — ข้ามบรรทัดที่เสีย (เช่น เครื่องดับระหว่างเขียน) หน้าประวัติจะได้ไม่พังทั้งหน้า */
function readEntries(): AuditEntry[] {
  if (!existsSync(LOG_FILE)) return [];
  const entries: AuditEntry[] = [];
  for (const line of readFileSync(LOG_FILE, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const e = JSON.parse(line) as AuditEntry;
      if (e && typeof e.time === 'string' && typeof e.loginname === 'string') entries.push(e);
    } catch { /* ข้ามบรรทัดเสีย */ }
  }
  return entries;
}

export const auditLog = {
  /**
   * ย้ายรายการที่เก่ากว่า keepDays ออกจากไฟล์หลักไปไว้ในคลังรายเดือน — ไม่ลบทิ้ง เปิดอ่านไฟล์ในคลังได้เสมอ
   * ไฟล์หลักจึงไม่โตไปเรื่อย ๆ หน้าเว็บโหลดเร็ว · คืนจำนวนรายการที่ย้าย
   */
  archiveOld(keepDays = AUDIT_KEEP_DAYS, now = new Date()): number {
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
    // ต่อท้ายไฟล์คลังก่อน แล้วค่อยเขียนไฟล์หลักใหม่ (ผ่านไฟล์ชั่วคราว) — เครื่องดับกลางคันก็ไม่มีรายการหาย
    for (const [month, lines] of byMonth) appendFileSync(path.join(ARCHIVE_DIR, `audit-log-${month}.jsonl`), lines.map(l => l + '\n').join(''), 'utf8');
    const tmp = `${LOG_FILE}.tmp`;
    writeFileSync(tmp, keep.map(l => l + '\n').join(''), 'utf8');
    renameSync(tmp, LOG_FILE);
    return moved;
  },

  write(entry: Omit<AuditEntry, 'time'>) {
    mkdirSync(DATA_DIR, { recursive: true });
    const ip = entry.ip?.replace(/^::ffff:/, '');
    appendFileSync(LOG_FILE, JSON.stringify({ time: new Date().toISOString(), ...entry, ...(ip ? { ip } : {}) }) + '\n', 'utf8');
  },

  stats(): { entries: number; bytes: number } {
    if (!existsSync(LOG_FILE)) return { entries: 0, bytes: 0 };
    const text = readFileSync(LOG_FILE, 'utf8');
    return { entries: text.split('\n').filter(Boolean).length, bytes: statSync(LOG_FILE).size };
  },

  /** รายชื่อผู้ใช้ในประวัติ (ไม่รวม guest) + จำนวนรายการ + ใช้งานล่าสุด — ใช้ในช่องค้นหาชื่อ */
  users(): { loginname: string; count: number; last: string }[] {
    if (!existsSync(LOG_FILE)) return [];
    const map = new Map<string, { loginname: string; count: number; last: string }>();
    for (const e of readEntries()) {
      if (e.loginname === GUEST_NAME || !e.loginname) continue;
      const u = map.get(e.loginname) ?? { loginname: e.loginname, count: 0, last: e.time };
      u.count++;
      if (e.time > u.last) u.last = e.time;
      map.set(e.loginname, u);
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  },

  read({ limit = 200, loginname, action, who = 'all' }: { limit?: number; loginname?: string; action?: string; who?: AuditWho } = {}): AuditEntry[] {
    if (!existsSync(LOG_FILE)) return [];
    const entries = readEntries()
      // ชื่อผู้ใช้: พิมพ์บางส่วนก็เจอ (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
      .filter(e => (!loginname || e.loginname.toLowerCase().includes(loginname.toLowerCase())) && (!action || e.action === action))
      // guest = รายการของผู้ที่ไม่ได้ login (login_failed/login_blocked บันทึกชื่อที่คนพิมพ์มา จึงไม่นับเป็น guest)
      .filter(e => who === 'all' || (who === 'guest') === (e.loginname === GUEST_NAME));
    return entries.reverse().slice(0, limit);
  },
};
