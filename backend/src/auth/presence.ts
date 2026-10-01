import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { appDb } from '../repositories/app-db';
import { hosxpRepository } from '../repositories/hosxp.repository';
import { DATA_DIR } from '../utils/paths';
import { readAuditFile, GUEST_NAME, type AuditEntry } from './audit-log';
import { ADMIN_GROUPNAME, type SessionUser } from './roles';

/**
 * ผู้ใช้ที่เคย login + สถานะออนไลน์ (หน้า "ผู้ใช้งานระบบ") — นับเฉพาะผู้ที่ login ไม่นับผู้เยี่ยมชม
 *
 * หน้าเว็บของผู้ที่ login อยู่ตรวจกับ server แบบเบื้องหลังทุก 1 นาที (กระดิ่ง) → รู้ว่ายังเปิดเว็บอยู่
 *   ใช้งานอยู่  = เปิดหน้า/กดใช้งานภายใน ACTIVE_MINUTES นาที
 *   เปิดค้างไว้ = ยังมีสัญญาณจากหน้าเว็บ แต่ไม่ได้กดอะไรเกิน ACTIVE_MINUTES นาที
 *   ออฟไลน์    = logout / session หมดอายุ / ไม่มีสัญญาณเกิน OFFLINE_MINUTES นาที (ปิดเว็บไปแล้ว)
 *
 * สัญญาณทุกนาทีเก็บในหน่วยความจำ แล้วบันทึกลงที่เก็บทุก 1 นาที (ไม่เขียนฐานทุก request)
 * ที่เก็บ: ตาราง users_seen ในฐาน data_dashboard · ไม่ได้ตั้งค่าฐาน = ไฟล์ backend/data/users-seen.json
 */
export const ACTIVE_MINUTES = 5;
export const OFFLINE_MINUTES = 3;

export type PresenceStatus = 'active' | 'idle' | 'offline';

export interface UserPresence {
  loginname: string;
  name: string;
  groupname: string;
  position: string;
  role: string;
  firstLogin: string | null;
  lastLogin: string | null;
  loginCount: number;
  lastActive: string | null;
  lastSeen: string | null;
  lastIp: string | null;
  loggedOutAt: string | null;
}

type Live = { lastSeen: number; lastActive: number | null; ip: string; user: SessionUser };
const live = new Map<string, Live>();
const dirty = new Set<string>();
const loggedOut = new Map<string, number>();

const cleanIp = (ip: string) => ip.replace(/^::ffff:/, '');
const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const later = (a: string | null, b: number | null | undefined) => {
  const t = Math.max(a ? Date.parse(a) : 0, b ?? 0);
  return t ? new Date(t).toISOString() : null;
};

/* ---------------------------------- ที่เก็บ ---------------------------------- */
const FILE = path.join(DATA_DIR, 'users-seen.json');

function readFile(): Record<string, UserPresence> {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, UserPresence>; } catch { return {}; }
}

function writeFile(data: Record<string, UserPresence>) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function blank(user: Pick<SessionUser, 'loginname'> & Partial<SessionUser>): UserPresence {
  return {
    loginname: user.loginname, name: user.displayName ?? user.loginname, groupname: user.groupname ?? '', position: user.position ?? '', role: user.role ?? 'user',
    firstLogin: null, lastLogin: null, loginCount: 0, lastActive: null, lastSeen: null, lastIp: null, loggedOutAt: null,
  };
}

interface Row extends RowDataPacket {
  loginname: string; name: string | null; groupname: string | null; position: string | null; role: string | null;
  first_login: Date | null; last_login: Date | null; login_count: number; last_active: Date | null; last_seen: Date | null;
  last_ip: string | null; logged_out_at: Date | null;
}

const fromRow = (r: Row): UserPresence => ({
  loginname: r.loginname, name: r.name ?? r.loginname, groupname: r.groupname ?? '', position: r.position ?? '', role: r.role ?? 'user',
  firstLogin: iso(r.first_login), lastLogin: iso(r.last_login), loginCount: Number(r.login_count), lastActive: iso(r.last_active),
  lastSeen: iso(r.last_seen), lastIp: r.last_ip, loggedOutAt: iso(r.logged_out_at),
});

async function readAll(): Promise<UserPresence[]> {
  if (!appDb.isConfigured()) return Object.values(readFile());
  return (await appDb.rows<Row>(`SELECT * FROM ${appDb.t('users_seen')}`)).map(fromRow);
}

/** บันทึก/อัปเดต 1 คน — ช่องเวลาใช้ค่าที่ใหม่กว่าเสมอ (ไม่ถอยหลัง) */
async function upsert(p: UserPresence, addLogin = false) {
  if (!appDb.isConfigured()) {
    const data = readFile();
    const old = data[p.loginname];
    data[p.loginname] = {
      ...p,
      firstLogin: old?.firstLogin ?? p.firstLogin,
      loginCount: (old?.loginCount ?? 0) + (addLogin ? 1 : 0) || p.loginCount,
      lastLogin: later(old?.lastLogin ?? null, p.lastLogin ? Date.parse(p.lastLogin) : null),
      lastActive: later(old?.lastActive ?? null, p.lastActive ? Date.parse(p.lastActive) : null),
      lastSeen: later(old?.lastSeen ?? null, p.lastSeen ? Date.parse(p.lastSeen) : null),
      loggedOutAt: later(old?.loggedOutAt ?? null, p.loggedOutAt ? Date.parse(p.loggedOutAt) : null),
      lastIp: p.lastIp ?? old?.lastIp ?? null,
    };
    writeFile(data);
    return;
  }
  const d = (v: string | null) => (v ? new Date(v) : null);
  const newer = (col: string) => `${col} = IF(VALUES(${col}) IS NOT NULL AND (${col} IS NULL OR VALUES(${col}) > ${col}), VALUES(${col}), ${col})`;
  await appDb.exec(
    `INSERT INTO ${appDb.t('users_seen')}
      (loginname, name, groupname, position, role, first_login, last_login, login_count, last_active, last_seen, last_ip, logged_out_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      name = VALUES(name), groupname = VALUES(groupname), position = VALUES(position), role = VALUES(role),
      first_login = COALESCE(first_login, VALUES(first_login)),
      ${newer('last_login')},
      login_count = login_count + ?,
      ${newer('last_active')},
      ${newer('last_seen')},
      last_ip = COALESCE(VALUES(last_ip), last_ip),
      ${newer('logged_out_at')}`,
    [p.loginname, p.name, p.groupname, p.position, p.role, d(p.firstLogin), d(p.lastLogin), p.loginCount, d(p.lastActive), d(p.lastSeen), p.lastIp, d(p.loggedOutAt),
      addLogin ? 1 : 0],
  );
}

/* ---------------------------------- สถานะ ---------------------------------- */
export function statusOf(p: Pick<UserPresence, 'lastSeen' | 'lastActive' | 'loggedOutAt'>, now = Date.now()): PresenceStatus {
  const seen = p.lastSeen ? Date.parse(p.lastSeen) : 0;
  const out = p.loggedOutAt ? Date.parse(p.loggedOutAt) : 0;
  if (!seen || now - seen > OFFLINE_MINUTES * 60_000 || out >= seen) return 'offline';
  const active = p.lastActive ? Date.parse(p.lastActive) : 0;
  return now - active <= ACTIVE_MINUTES * 60_000 ? 'active' : 'idle';
}

/* ผู้เยี่ยมชม (ไม่ได้ login) — ไม่รู้ว่าเป็นใคร จึงนับเป็นจำนวนเครื่อง (IP) · เก็บในหน่วยความจำเท่านั้น */
const guestSeen = new Map<string, number>();

export const presence = {
  /** request ของผู้เยี่ยมชม (เรียกจาก hook) */
  touchGuest(ip: string) {
    const now = Date.now();
    guestSeen.set(cleanIp(ip), now);
    if (guestSeen.size > 5000) for (const [key, t] of guestSeen) if (now - t > ACTIVE_MINUTES * 60_000) guestSeen.delete(key);
  },

  /** ผู้เยี่ยมชมขณะนี้ = จำนวน IP ที่เปิดเว็บภายใน ACTIVE_MINUTES นาที */
  guestsOnline(now = Date.now()) {
    let count = 0;
    for (const [key, t] of guestSeen) {
      if (now - t <= ACTIVE_MINUTES * 60_000) count++;
      else guestSeen.delete(key);
    }
    return count;
  },

  /** ผู้เยี่ยมชมวันนี้ = จำนวน IP ผู้เยี่ยมชมในประวัติการใช้งานตั้งแต่เที่ยงคืน (เวลาไทย) — รีสตาร์ท backend ก็ไม่หาย */
  async guestsToday(): Promise<number> {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const since = new Date(`${today}T00:00:00+07:00`);
    if (appDb.isConfigured()) {
      const [row] = await appDb.rows<RowDataPacket>(
        `SELECT COUNT(DISTINCT ip) AS n FROM ${appDb.t('audit_log')} WHERE loginname = ? AND time >= ? AND ip IS NOT NULL`, [GUEST_NAME, since]);
      return Number(row.n);
    }
    const ips = new Set(readAuditFile().filter(e => e.loginname === GUEST_NAME && e.ip && Date.parse(e.time) >= since.getTime()).map(e => e.ip));
    return ips.size;
  },

  /** ทุก request ของผู้ที่ login (เรียกจาก hook) — background = การตรวจเบื้องหลัง ไม่นับเป็นการใช้งาน */
  touch(user: SessionUser, ip: string, background: boolean) {
    const now = Date.now();
    const entry = live.get(user.loginname);
    live.set(user.loginname, { lastSeen: now, lastActive: background ? (entry?.lastActive ?? null) : now, ip: cleanIp(ip), user });
    dirty.add(user.loginname);
  },

  /** login สำเร็จ — บันทึกทันที (นับจำนวนครั้ง) */
  async login(user: SessionUser, ip: string) {
    const now = Date.now();
    live.set(user.loginname, { lastSeen: now, lastActive: now, ip: cleanIp(ip), user });
    loggedOut.delete(user.loginname);
    const stamp = new Date(now).toISOString();
    await upsert({ ...blank(user), firstLogin: stamp, lastLogin: stamp, loginCount: 1, lastActive: stamp, lastSeen: stamp, lastIp: cleanIp(ip) }, true);
  },

  /** logout / session หมดอายุ → ออฟไลน์ทันที */
  async offline(loginname: string) {
    const now = Date.now();
    loggedOut.set(loginname, now);
    const entry = live.get(loginname);
    live.delete(loginname);
    dirty.delete(loginname);
    const base = entry ? blank(entry.user) : blank({ loginname });
    if (!entry && appDb.isConfigured()) {
      // ไม่มีในหน่วยความจำ (เช่น backend เพิ่งรีสตาร์ท) — อัปเดตแค่เวลาออก ไม่ทับชื่อด้วยค่าว่าง
      await appDb.exec(`UPDATE ${appDb.t('users_seen')} SET logged_out_at = ? WHERE loginname = ?`, [new Date(now), loginname]);
      return;
    }
    await upsert({
      ...base,
      lastSeen: entry ? new Date(entry.lastSeen).toISOString() : null,
      lastActive: entry?.lastActive ? new Date(entry.lastActive).toISOString() : null,
      lastIp: entry?.ip ?? null,
      loggedOutAt: new Date(now).toISOString(),
    });
  },

  /** บันทึกสัญญาณที่ค้างในหน่วยความจำ — เรียกทุก 1 นาที และตอนปิดเซิร์ฟเวอร์ */
  async flush() {
    const names = [...dirty];
    dirty.clear();
    for (const name of names) {
      const entry = live.get(name);
      if (!entry) continue;
      try {
        await upsert({
          ...blank(entry.user),
          lastSeen: new Date(entry.lastSeen).toISOString(),
          lastActive: entry.lastActive ? new Date(entry.lastActive).toISOString() : null,
          lastIp: entry.ip,
        });
      } catch {
        dirty.add(name); // ฐานล่ม — รอบหน้าลองใหม่
      }
    }
  },

  /** รายชื่อทั้งหมด + สถานะ (รวมสัญญาณล่าสุดในหน่วยความจำที่ยังไม่ได้บันทึก) */
  async list(): Promise<(UserPresence & { status: PresenceStatus })[]> {
    const now = Date.now();
    const stored = new Map((await readAll()).map(p => [p.loginname, p]));
    for (const [name, entry] of live) if (!stored.has(name)) stored.set(name, blank(entry.user));
    return [...stored.values()].map(p => {
      const entry = live.get(p.loginname);
      const merged: UserPresence = {
        ...p,
        ...(entry ? { name: entry.user.displayName || p.name, groupname: entry.user.groupname ?? p.groupname, position: entry.user.position ?? p.position, role: entry.user.role } : {}),
        lastSeen: later(p.lastSeen, entry?.lastSeen),
        lastActive: later(p.lastActive, entry?.lastActive),
        lastIp: entry?.ip ?? p.lastIp,
        loggedOutAt: later(p.loggedOutAt, loggedOut.get(p.loginname)),
      };
      return { ...merged, status: statusOf(merged, now) };
    });
  },

  /**
   * ครั้งแรกที่เปิดใช้: ยังไม่มีรายชื่อเลย → สร้างจากประวัติการใช้งาน (เฉพาะคนที่เคย login สำเร็จ) + เติมชื่อจาก HOSxP
   * คืนจำนวนคนที่เพิ่ม
   */
  async backfill(): Promise<number> {
    if ((await readAll()).length > 0) return 0;
    const entries: AuditEntry[] = appDb.isConfigured()
      ? (await appDb.rows<RowDataPacket>(
        `SELECT time, loginname, action, ip FROM ${appDb.t('audit_log')} WHERE loginname <> ? AND action NOT IN ('login_failed', 'login_blocked') ORDER BY time`, [GUEST_NAME]))
        .map(r => ({ time: (r.time as Date).toISOString(), loginname: r.loginname, action: r.action, ip: r.ip ?? undefined }))
      : readAuditFile().filter(e => e.loginname !== GUEST_NAME && e.action !== 'login_failed' && e.action !== 'login_blocked');

    const people = new Map<string, UserPresence>();
    for (const e of entries) {
      if (e.action === 'login' && !people.has(e.loginname)) people.set(e.loginname, blank({ loginname: e.loginname }));
    }
    for (const e of entries) {
      const p = people.get(e.loginname);
      if (!p) continue;
      if (e.action === 'login') {
        p.firstLogin ??= e.time;
        p.lastLogin = e.time;
        p.loginCount++;
      }
      if (e.action === 'logout' || e.action === 'session_expired') p.loggedOutAt = e.time;
      else p.lastActive = e.time;
      p.lastSeen = e.time;
      if (e.ip) p.lastIp = e.ip;
    }
    if (people.size === 0) return 0;

    try {
      for (const info of await hosxpRepository.findOpdusers([...people.keys()])) {
        const p = people.get(info.loginname);
        if (p) Object.assign(p, { name: info.name, groupname: info.groupname, position: info.position, role: info.groupname === ADMIN_GROUPNAME ? 'admin' : 'user' });
      }
    } catch { /* HOSxP ใช้ไม่ได้ตอนนี้ — ชื่อจะเติมเองเมื่อคนนั้น login ครั้งถัดไป */ }

    for (const p of people.values()) await upsert(p);
    return people.size;
  },
};
