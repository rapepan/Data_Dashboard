import { logger } from '../utils/logger';
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

export const loginThrottle = {
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
