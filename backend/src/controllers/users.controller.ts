import type { FastifyReply, FastifyRequest } from 'fastify';
import { ACTIVE_MINUTES, OFFLINE_MINUTES, presence } from '../auth/presence';
import { sessionRevocation } from '../auth/session-revocation';
import { auditLog } from '../auth/audit-log';
import { currentUser } from '../middleware/auth';
import { cleanIp, logger } from '../utils/logger';

const TZ = 'Asia/Bangkok';
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

export const usersController = {
  /** ผู้ดูแลระบบ: ผู้ใช้ที่เคย login + สถานะออนไลน์ (เรียงตามสถานะ แล้วใช้งานล่าสุดก่อน) */
  async list() {
    const order = { active: 0, idle: 1, offline: 2 } as const;
    const users = (await presence.list()).sort((a, b) =>
      order[a.status] - order[b.status] || (b.lastActive ?? b.lastSeen ?? '').localeCompare(a.lastActive ?? a.lastSeen ?? ''));
    const today = dayOf(new Date().toISOString());
    // ผู้เยี่ยมชม (ไม่ได้ login) — นับเป็นจำนวนเครื่อง (IP) ไม่มีรายชื่อ · อ่านวันนี้ไม่ได้ก็ยังแสดงหน้าได้
    const guestsToday = await presence.guestsToday().catch(() => null);
    return {
      users,
      counts: {
        active: users.filter(u => u.status === 'active').length,
        idle: users.filter(u => u.status === 'idle').length,
        offline: users.filter(u => u.status === 'offline').length,
        today: users.filter(u => u.lastActive && dayOf(u.lastActive) === today).length,
        total: users.length,
        guestsOnline: presence.guestsOnline(),
        guestsToday,
      },
      thresholds: { activeMinutes: ACTIVE_MINUTES, offlineMinutes: OFFLINE_MINUTES },
    };
  },

  /** ผู้ดูแลระบบ: บังคับออกจากระบบ — ทุกเครื่องของคนนั้นหลุดใน request ถัดไป (ภายใน 1 นาที) · login ใหม่ได้ทันที */
  async forceLogout(req: FastifyRequest<{ Params: { loginname: string } }>, reply: FastifyReply) {
    const admin = currentUser(req)!;
    const target = String(req.params.loginname ?? '').trim().slice(0, 64);
    if (!target) return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'ไม่ระบุผู้ใช้' });
    if (target === admin.loginname) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'บังคับตัวเองออกไม่ได้ — ใช้ปุ่มออกจากระบบแทน' });
    }
    if (!(await presence.list()).some(u => u.loginname === target)) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบผู้ใช้นี้ในระบบ' });
    }
    await sessionRevocation.revoke(target);
    await presence.offline(target);
    auditLog.write({ loginname: admin.loginname, action: 'force_logout', detail: target, ip: req.ip });
    logger.auth(true, `${admin.loginname} บังคับ ${target} ออกจากระบบ · ${cleanIp(req.ip)}`);
    return { ok: true };
  },
};
