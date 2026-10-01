import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { resolveSessionUser } from '../auth/auth.service';
import { canViewPage, type PageKey, type SessionUser } from '../auth/roles';
import { cleanIp, logger } from '../utils/logger';
import { auditLog, GUEST_NAME } from '../auth/audit-log';
import { presence } from '../auth/presence';
import { sessionRevocation } from '../auth/session-revocation';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    /** sub = loginname, name/group มาจาก opduser ตอน login (ไม่ต้องถาม HOSxP ทุก request) */
    payload: { sub: string; name: string; group: string; pos?: string };
    user: SessionUser;
  }
}

export const SESSION_COOKIE = 'bsth_session';
export const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 30);
export function isBackgroundRequest(request: FastifyRequest) {
  return request.headers['x-background'] === '1';
}

const DEV_SECRET = 'bsth-dev-secret-do-not-use-in-production';

export async function registerAuth(app: FastifyInstance) {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('ต้องตั้งค่า AUTH_SECRET ก่อนรัน production');
  if (!secret) app.log.warn('ยังไม่ได้ตั้ง AUTH_SECRET — ใช้ค่าทดสอบ (ห้ามใช้บนเครื่องจริง)');

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: secret || DEV_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: `${SESSION_IDLE_MINUTES}m` },
  });
}

export async function issueSession(reply: FastifyReply, user: SessionUser) {
  const token = await reply.jwtSign({ sub: user.loginname, name: user.displayName, group: user.groupname ?? '', pos: user.position ?? '' });
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: SESSION_IDLE_MINUTES * 60,
  });
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function currentUser(request: FastifyRequest): SessionUser | null {
  return (request.user as SessionUser | undefined) ?? null;
}

function expiredSessionOwner(token: string): string | null {
  const [head, body, signature] = token.split('.');
  if (!head || !body || !signature) return null;
  const expected = createHmac('sha256', process.env.AUTH_SECRET || DEV_SECRET).update(`${head}.${body}`).digest('base64url');
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { sub?: unknown; exp?: unknown };
    return typeof payload.sub === 'string' && typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now() ? payload.sub : null;
  } catch {
    return null;
  }
}

/** หน้าเว็บยิงหลาย request พร้อมกันด้วย cookie เดียวกัน — บันทึก session หมดอายุครั้งเดียวต่อ token */
const expiredSeen = new Map<string, number>();
function recordSessionExpired(request: FastifyRequest, token: string) {
  const owner = expiredSessionOwner(token);
  if (!owner) return;
  const key = token.slice(-24);
  const now = Date.now();
  for (const [k, t] of expiredSeen) if (now - t > 10 * 60 * 1000) expiredSeen.delete(k);
  if (expiredSeen.has(key)) return;
  expiredSeen.set(key, now);
  void presence.offline(owner).catch(() => undefined);
  auditLog.write({ loginname: owner, action: 'session_expired', detail: `ไม่ได้ใช้งานเกิน ${SESSION_IDLE_MINUTES} นาที`, ip: request.ip });
  logger.auth(false, `${owner} session หมดอายุ (ไม่ได้ใช้งานเกิน ${SESSION_IDLE_MINUTES} นาที) · ${cleanIp(request.ip)}`);
}

/** เข้าส่วนที่ไม่มีสิทธิ์ → เทอร์มินัล + ประวัติการใช้งาน (ไม่นับ request เบื้องหลัง) */
export function recordDenied(request: FastifyRequest, loginname: string | undefined, target: string, reason: string) {
  const who = loginname ?? GUEST_NAME;
  logger.denied(who, cleanIp(request.ip), target, reason);
  if (isBackgroundRequest(request)) return;
  auditLog.write({ loginname: who, action: 'denied', detail: `${target.split('?')[0]} · ${reason}`, ip: request.ip });
}

export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return;

  let user: SessionUser | undefined;
  try {
    const payload = await request.jwtVerify<{ sub: string; name?: string; group?: string; pos?: string; iat?: number }>({ onlyCookie: true });
    // ผู้ดูแลกด "บังคับออกจากระบบ" หลังบัตรนี้ออก → ใช้ไม่ได้ (หน้าเว็บแจ้งผู้ใช้ แล้วกลับเป็นผู้เยี่ยมชม)
    if (sessionRevocation.isRevoked(payload.sub, payload.iat)) {
      // jwtVerify ใส่ request.user ให้เองเมื่อบัตรถูกต้อง — ต้องล้างออก ไม่งั้นยังนับว่า login อยู่
      request.user = undefined as unknown as typeof request.user;
      clearSession(reply);
      reply.header('X-Session-Expired', '1');
      reply.header('X-Session-Revoked', '1');
      return;
    }
    // บทบาทคำนวณใหม่ทุก request — ผู้ดูแลระบบเปลี่ยนบทบาทแล้วมีผลทันที
    if (payload.name !== undefined) user = resolveSessionUser({ loginname: payload.sub, name: payload.name, groupname: payload.group ?? '', position: payload.pos ?? '' });
  } catch {
    user = undefined;
  }

  if (!user) {
    recordSessionExpired(request, token);
    clearSession(reply);
    reply.header('X-Session-Expired', '1');
    return;
  }

  request.user = user;
  if (!isBackgroundRequest(request) && !request.url.startsWith('/api/auth/logout')) await issueSession(reply, user);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!currentUser(request)) {
    recordDenied(request, undefined, request.url, 'ต้อง login');
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'กรุณาเข้าสู่ระบบ' });
  }
}

export function requirePage(page: PageKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = currentUser(request);
    if (canViewPage(user, page)) return;
    recordDenied(request, user?.loginname, request.url, user ? `ไม่มีสิทธิ์หน้า ${page}` : 'ต้อง login');
    if (!user) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'กรุณาเข้าสู่ระบบเพื่อดูข้อมูลส่วนนี้' });
    return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้' });
  };
}
