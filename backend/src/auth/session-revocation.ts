import { userSettings } from './user-settings';

/**
 * บังคับออกจากระบบ — session เป็นบัตรผ่าน (JWT) ที่ server ไม่ได้จำไว้ จึงจำ "เวลาที่ถูกบังคับออก" ของแต่ละคนแทน
 * บัตรที่ออกก่อนเวลานั้นใช้ไม่ได้อีก (request ถัดไปของคนนั้นกลายเป็นผู้เยี่ยมชม) · login ใหม่ได้ทันที
 * เก็บใน user_settings (sessions_revoked_at) + จำในหน่วยความจำ เพราะต้องตรวจทุก request
 */
const revokedAt = new Map<string, number>();

export const sessionRevocation = {
  /** โหลดตอนเปิด backend */
  async load() {
    revokedAt.clear();
    for (const [loginname, value] of Object.entries(await userSettings.all('sessions_revoked_at'))) {
      const t = Date.parse(value);
      if (!Number.isNaN(t)) revokedAt.set(loginname, t);
    }
    return revokedAt.size;
  },

  async revoke(loginname: string) {
    const now = Date.now();
    revokedAt.set(loginname, now);
    await userSettings.set(loginname, 'sessions_revoked_at', new Date(now).toISOString());
  },

  /** iat = เวลาออกบัตร (วินาที) — บัตรที่ออกภายในวินาทีเดียวกับที่ถูกบังคับออก (login ใหม่ทันที) ยังใช้ได้ */
  isRevoked(loginname: string, iat: number | undefined) {
    const at = revokedAt.get(loginname);
    if (!at) return false;
    return iat === undefined || iat * 1000 + 999 < at;
  },
};
