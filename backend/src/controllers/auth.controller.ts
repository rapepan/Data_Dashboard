import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthUnavailableError, loginThrottle, verifyLogin } from '../auth/auth.service';
import { auditLog } from '../auth/audit-log';
import { presence } from '../auth/presence';
import { allowedPages, canExport, canViewPage, canViewRevenueDetail, ROLE_LABEL, type PageKey, type SessionUser } from '../auth/roles';
import { clearSession, currentUser, issueSession, recordDenied, SESSION_IDLE_MINUTES } from '../middleware/auth';
import { cleanIp, logger } from '../utils/logger';

interface LoginBody {
  loginname?: string;
  password?: string;
}

interface ExportBody {
  page?: PageKey;
  detail?: string;
}

/** ข้อมูลที่ frontend ใช้แสดงชื่อ/บทบาท และซ่อน/แสดงเมนูตามสิทธิ์ — user = null คือผู้เยี่ยมชม */
function describe(user: SessionUser | null) {
  return {
    user: user && {
      ...user,
      roleLabel: ROLE_LABEL[user.role],
    },
    pages: allowedPages(user),
    canExport: canExport(user),
    canViewRevenueDetail: canViewRevenueDetail(user),
    idleMinutes: SESSION_IDLE_MINUTES,
  };
}

export const authController = {
  async login(req: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
    // ชื่อผู้ใช้ใน HOSxP ไม่ยาวเกิน 64 ตัว — ตัดไว้ก่อนบันทึกประวัติ/นับ login ผิด
    // ชื่อผู้ใช้ใน HOSxP ไม่ยาวเกิน 64 ตัว — ตัดไว้ก่อนบันทึกประวัติ/นับ login ผิด
    const loginname = String(req.body?.loginname ?? '').trim().slice(0, 64);
    const password = String(req.body?.password ?? '');
    if (!loginname || !password) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }

    if (await loginThrottle.ipBlocked(req.ip)) {
      logger.tally('loginFailed');
      logger.auth(false, `${cleanIp(req.ip)} ถูกพักการ login 5 นาที (เครื่องนี้กรอกผิดหลายบัญชี)`);
      return reply.status(429).send({ statusCode: 429, error: 'Too Many Requests', message: 'เครื่องนี้กรอกรหัสผ่านผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่' });
    }
    if (await loginThrottle.isBlocked(loginname, req.ip)) {
      logger.tally('loginFailed');
      logger.auth(false, `${loginname} ถูกพักการ login 5 นาที (ผิดหลายครั้ง) · ${cleanIp(req.ip)}`);
      auditLog.write({ loginname, action: 'login_blocked', detail: 'กรอกรหัสผ่านผิดหลายครั้ง — พัก 5 นาที', ip: req.ip });
      return reply.status(429).send({ statusCode: 429, error: 'Too Many Requests', message: 'กรอกรหัสผ่านผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่' });
    }

    let user: SessionUser | null;
    try {
      user = await verifyLogin(loginname, password);
    } catch (error) {
      if (error instanceof AuthUnavailableError) {
        return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: error.message });
      }
      throw error;
    }

    if (!user) {
      await loginThrottle.fail(loginname, req.ip);
      auditLog.write({ loginname, action: 'login_failed', ip: req.ip });
      logger.tally('loginFailed');
      logger.auth(false, `login ไม่สำเร็จ: ${loginname} · ${cleanIp(req.ip)}`);
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    await loginThrottle.reset(loginname, req.ip);
    await issueSession(reply, user);
    await presence.login(user, req.ip).catch(error => logger.warn(`[presence] บันทึกการ login ไม่ได้ — ${(error as Error).message}`));
    auditLog.write({ loginname: user.loginname, action: 'login', ip: req.ip });
    logger.tally('logins');
    logger.auth(true, `${user.loginname} เข้าสู่ระบบ (${ROLE_LABEL[user.role]}) · ${cleanIp(req.ip)}`);
    return describe(user);
  },

  logout(req: FastifyRequest, reply: FastifyReply) {
    // logout ได้แม้ session หมดอายุแล้ว — แค่ล้าง cookie
    clearSession(reply);
    const user = currentUser(req);
    if (user) {
      auditLog.write({ loginname: user.loginname, action: 'logout', ip: req.ip });
      void presence.offline(user.loginname).catch(() => undefined);
      logger.auth(true, `${user.loginname} ออกจากระบบ`);
    }
    return describe(null);
  },

  me(req: FastifyRequest) {
    return describe(currentUser(req));
  },

  /** frontend แจ้งเมื่อผู้ใช้กดส่งออก Excel — ใช้บันทึก audit log และตรวจสิทธิ์ส่งออก */
  logExport(req: FastifyRequest, reply: FastifyReply) {
    const body = (req.body ?? {}) as ExportBody;
    const page = body.page ?? 'dashboard';
    const user = currentUser(req);
    if (!user || !canExport(user) || !canViewPage(user, page)) {
      recordDenied(req, user?.loginname, `/api/audit/export (${page})`, 'ไม่มีสิทธิ์ส่งออก');
      return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'ไม่มีสิทธิ์ส่งออกข้อมูล' });
    }
    auditLog.write({ loginname: user.loginname, action: 'export', detail: String(body.detail ?? page).slice(0, 200), ip: req.ip });
    logger.export(user.loginname, cleanIp(req.ip), String(body.detail ?? page).slice(0, 200));
    return { ok: true };
  },
};
