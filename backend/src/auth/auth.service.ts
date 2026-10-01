import type { RowDataPacket } from 'mysql2/promise';
import { logger } from '../utils/logger';
import { appDb } from '../repositories/app-db';
import { hosxpRepository, type OpduserInfo } from '../repositories/hosxp.repository';
import { ADMIN_GROUPNAME, type SessionUser } from './roles';

export class AuthUnavailableError extends Error {}

export function resolveSessionUser(info: Pick<OpduserInfo, 'loginname' | 'name' | 'groupname'> & { position?: string }): SessionUser {
  const base = { loginname: info.loginname, displayName: info.name, groupname: info.groupname, position: info.position ?? '' };
  return { ...base, role: info.groupname === ADMIN_GROUPNAME ? 'admin' : 'user' };
}

export async function verifyLogin(loginname: string, password: string): Promise<SessionUser | null> {
  if (!hosxpRepository.isConfigured()) throw new AuthUnavailableError('ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP');
  let info: OpduserInfo | null;
  try {
    info = await hosxpRepository.verifyOpduser(loginname, password);
  } catch (error) {
    logger.error(`[auth] เชื่อมต่อ HOSxP ไม่ได้: ${(error as Error).message}`);
    throw new AuthUnavailableError('เชื่อมต่อฐานข้อมูล HOSxP ไม่ได้ กรุณาลองใหม่อีกครั้ง');
  }
  return info ? resolveSessionUser(info) : null;
}
 
const MAX_FAILS = 5;
const WINDOW_MS = 5 * 60 * 1000;
const failures = new Map<string, number[]>();

/* ตัวนับในหน่วยความจำ — ใช้เมื่อไม่ได้ตั้งค่าฐาน หรือฐานล่ม (ไม่ให้ฐานล่มแล้ว login ไม่ได้ / ไม่มีตัวกันเดารหัส) */
const memoryThrottle = {
  isBlocked(key: string) {
    const recent = (failures.get(key) ?? []).filter(t => Date.now() - t < WINDOW_MS);
    failures.set(key, recent);
    return recent.length >= MAX_FAILS;
  },
  fail(key: string) {
    failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
  },
  reset(key: string) {
    failures.delete(key);
  },
};

let dbThrottleWarned = false;
function warnDbThrottle(error: unknown) {
  if (dbThrottleWarned) return;
  dbThrottleWarned = true;
  logger.warn(`[auth] ใช้ฐานนับ login ผิดไม่ได้ — นับในหน่วยความจำแทนชั่วคราว (${(error as Error).message})`);
}

/**
 * login ผิด MAX_FAILS ครั้งใน 5 นาที (ต่อชื่อผู้ใช้ + IP) → พัก 5 นาที
 * ตั้งค่าฐานแล้วนับในตาราง login_failures (รีสตาร์ท backend ก็ยังนับต่อ · รันหลายตัวก็นับรวมกัน)
 */
const throttleParams = (loginname: string, ip: string) => [loginname.slice(0, 64), ip.replace(/^::ffff:/, '').slice(0, 45)];

export const loginThrottle = {
  async isBlocked(loginname: string, ip: string): Promise<boolean> {
    const key = `${loginname}|${ip}`;
    if (!appDb.isConfigured()) return memoryThrottle.isBlocked(key);
    try {
      const [row] = await appDb.rows<RowDataPacket>(
        `SELECT COUNT(*) AS n FROM ${appDb.t('login_failures')} WHERE loginname = ? AND ip = ? AND time > ?`,
        [...throttleParams(loginname, ip), new Date(Date.now() - WINDOW_MS)]);
      dbThrottleWarned = false;
      return Number(row.n) >= MAX_FAILS || memoryThrottle.isBlocked(key);
    } catch (error) {
      warnDbThrottle(error);
      return memoryThrottle.isBlocked(key);
    }
  },
  async fail(loginname: string, ip: string): Promise<void> {
    if (!appDb.isConfigured()) return memoryThrottle.fail(`${loginname}|${ip}`);
    try {
      await appDb.exec(`INSERT INTO ${appDb.t('login_failures')} (loginname, ip, time) VALUES (?, ?, ?)`, [...throttleParams(loginname, ip), new Date()]);
    } catch (error) {
      warnDbThrottle(error);
      memoryThrottle.fail(`${loginname}|${ip}`);
    }
  },
  async reset(loginname: string, ip: string): Promise<void> {
    memoryThrottle.reset(`${loginname}|${ip}`);
    if (!appDb.isConfigured()) return;
    await appDb.exec(`DELETE FROM ${appDb.t('login_failures')} WHERE loginname = ? AND ip = ?`, throttleParams(loginname, ip)).catch(warnDbThrottle);
  },
  /** ลบรายการที่หมดอายุแล้ว (เก่ากว่า 1 วัน) — เรียกวันละครั้ง */
  async cleanup(): Promise<number> {
    if (!appDb.isConfigured()) return 0;
    const result = await appDb.exec(`DELETE FROM ${appDb.t('login_failures')} WHERE time < ?`, [new Date(Date.now() - 86_400_000)]);
    return result.affectedRows;
  },
};
