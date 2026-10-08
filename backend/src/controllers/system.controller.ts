import type { FastifyReply, FastifyRequest } from 'fastify';
import { auditLog } from '../auth/audit-log';
import { currentUser } from '../middleware/auth';
import { NOTICE_LEVELS, systemStore, type NoticeInput, type NoticeLevel } from '../system/system-store';
import { appVersion } from '../system/version';
import { MAINTAINABLE_PAGES } from '../auth/roles';
import { systemScheduler } from '../system/scheduler';
import { systemEvents } from '../system/events';
import { buildSystemStatus } from '../system/status';
import { logger } from '../utils/logger';
import { userSettings } from '../auth/user-settings';
import { systemRestart } from '../system/restart';

const badRequest = (reply: FastifyReply, message: string) => reply.status(400).send({ statusCode: 400, error: 'Bad Request', message });

type NoticeBody = {
  message?: string; level?: string; startsAt?: string; endsAt?: string;
  maintenanceStart?: string | null; maintenanceEnd?: string | null; autoMaintenance?: boolean;
};

/** ตรวจข้อมูลประกาศ — คืนข้อความ error หรือข้อมูลที่ใช้ได้ */
function parseNotice(body: NoticeBody | undefined): string | NoticeInput {
  const message = String(body?.message ?? '').trim();
  const level = body?.level as NoticeLevel;
  const starts = Date.parse(String(body?.startsAt ?? ''));
  // เวลาปิดปรับปรุงจริง (ไม่บังคับ) — ใส่ต้องใส่ทั้งเริ่มและจบ · มีเวลาแล้วไม่ต้องมีข้อความ (หน้าเว็บแสดงเวลาให้เอง)
  const hasWindow = Boolean(body?.maintenanceStart || body?.maintenanceEnd);
  if (!message && !hasWindow) return 'กรุณาพิมพ์ข้อความประกาศ';
  if (message.length > 500) return 'ข้อความประกาศยาวเกิน 500 ตัวอักษร';
  if (!NOTICE_LEVELS.includes(level)) return 'ระดับประกาศไม่ถูกต้อง';
  if (Number.isNaN(starts)) return 'กรุณาเลือกวัน-เวลาเริ่มแสดงประกาศ';

  const mStart = Date.parse(String(body?.maintenanceStart ?? ''));
  const mEnd = Date.parse(String(body?.maintenanceEnd ?? ''));
  if (hasWindow) {
    if (Number.isNaN(mStart) || Number.isNaN(mEnd)) return 'กรุณาเลือกวัน-เวลาเริ่มและสิ้นสุดของการปิดปรับปรุง';
    if (mEnd <= mStart) return 'เวลาสิ้นสุดการปิดปรับปรุงต้องหลังเวลาเริ่ม';
    if (mStart <= starts) return 'เวลาเริ่มปิดปรับปรุงต้องหลังเวลาเริ่มแสดงประกาศ';
  }
  if (body?.autoMaintenance && !hasWindow) return 'เปิดโหมดอัตโนมัติได้เมื่อระบุเวลาปิดปรับปรุงเท่านั้น';

  // มีเวลาปิดปรับปรุง → เลิกแสดงประกาศตอนเริ่มปิดปรับปรุง (ไม่ต้องตั้งแยก) · ไม่มี → ใช้เวลาที่ผู้ดูแลตั้ง
  const ends = hasWindow ? mStart : Date.parse(String(body?.endsAt ?? ''));
  if (Number.isNaN(ends)) return 'กรุณาเลือกวัน-เวลาเลิกแสดงประกาศ';
  if (ends <= starts) return 'เวลาเลิกแสดงประกาศต้องหลังเวลาเริ่ม';
  return {
    message, level, startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString(),
    maintenanceStart: hasWindow ? new Date(mStart).toISOString() : null,
    maintenanceEnd: hasWindow ? new Date(mEnd).toISOString() : null,
    autoMaintenance: hasWindow && body?.autoMaintenance === true,
  };
}

const UNTIL_MAX_DAYS = 7;

/** เวลาปิดเองที่ผู้ดูแลตั้ง (ไม่บังคับ) — คืน error เป็นข้อความ, null = ไม่ตั้ง, หรือ ISO */
function parseUntil(raw: unknown): { error: string } | { until: string | null } {
  if (raw === undefined || raw === null || raw === '') return { until: null };
  const t = Date.parse(String(raw));
  if (Number.isNaN(t)) return { error: 'เวลาที่ตั้งไม่ถูกต้อง' };
  if (t <= Date.now()) return { error: 'เวลาที่ตั้งต้องอยู่ในอนาคต' };
  if (t > Date.now() + UNTIL_MAX_DAYS * 86_400_000) return { error: `ตั้งเวลาล่วงหน้าได้ไม่เกิน ${UNTIL_MAX_DAYS} วัน` };
  return { until: new Date(t).toISOString() };
}

/** "10:30 น." ถ้าเป็นวันนี้ · "03/10/2569 10:30 น." ถ้าเป็นวันอื่น (เวลาไทย) */
function untilLabel(iso: string) {
  const opt = { timeZone: 'Asia/Bangkok', hour12: false } as const;
  const day = (d: Date) => d.toLocaleDateString('th-TH', { ...opt, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = new Date(iso).toLocaleTimeString('th-TH', { ...opt, hour: '2-digit', minute: '2-digit' });
  return day(new Date(iso)) === day(new Date()) ? `${time} น.` : `${day(new Date(iso))} ${time} น.`;
}

/** ข้อความในประวัติการใช้งาน — ไม่มีข้อความประกาศ → ใช้ช่วงเวลาปิดปรับปรุงแทน (dd/mm/พ.ศ. HH:mm–HH:mm น.) */
function noticeLabel(input: NoticeInput) {
  if (input.message) return input.message.slice(0, 80);
  const opt = { timeZone: 'Asia/Bangkok', hour12: false } as const;
  const date = new Date(input.maintenanceStart!).toLocaleDateString('th-TH', { ...opt, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { ...opt, hour: '2-digit', minute: '2-digit' });
  return `ปิดปรับปรุง ${date} ${time(input.maintenanceStart!)}–${time(input.maintenanceEnd!)} น.`;
}

export const systemController = {
  /** ทุกคน (ไม่ต้อง login): เวอร์ชัน + ประกาศที่แสดงตอนนี้ + โหมดปิดปรับปรุง — หน้าเว็บตรวจทุก 1 นาที */
  async status() {
    return buildSystemStatus();
  },

  /** ทุกคน: ช่องสัญญาณสด — สถานะเปลี่ยนแล้วหน้าเว็บรู้ทันที (ไม่ต้องรอรอบตรวจ / ไม่ต้องรีเฟรช) */
  events(req: FastifyRequest, reply: FastifyReply) {
    return systemEvents.connect(req, reply);
  },

  /** ผู้ที่ login: ดูหน้าต่าง "มีอะไรใหม่" ของเวอร์ชันไหนแล้ว — จำตามบัญชี (ทุกเครื่องเห็นครั้งเดียว) */
  async whatsNewSeen(req: FastifyRequest) {
    return { seen: await userSettings.get(currentUser(req)!.loginname, 'whats_new_seen') };
  },

  async markWhatsNewSeen(req: FastifyRequest<{ Body: { version?: string } }>, reply: FastifyReply) {
    const version = String(req.body?.version ?? '').trim();
    if (!/^\d+(\.\d+){0,3}$/.test(version)) return badRequest(reply, 'เลขเวอร์ชันไม่ถูกต้อง');
    await userSettings.set(currentUser(req)!.loginname, 'whats_new_seen', version);
    return { seen: version };
  },

  /** ผู้ดูแล: ประกาศทั้งหมด + สถานะโหมดปิดปรับปรุง */
  async admin() {
    return {
      version: appVersion(),
      maintenance: systemStore.maintenance(),
      pageMaintenance: systemStore.pageMaintenance(),
      maintainablePages: MAINTAINABLE_PAGES,
      notices: await systemStore.listNotices(),
      restart: systemRestart.info(),
      liveClients: systemEvents.count(),
    };
  },

  /** รีสตาร์ท backend — ตอบกลับก่อน แล้วปิดตัวเองใน 1 วินาที (systemd เปิดใหม่ให้) */
  async restart(req: FastifyRequest<{ Body: { reason?: string } }>, reply: FastifyReply) {
    const admin = currentUser(req)!;
    const reason = String(req.body?.reason ?? '').trim().slice(0, 200);
    const error = systemRestart.request({ loginname: admin.loginname, name: admin.displayName }, reason);
    if (error) return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: error });
    auditLog.write({ loginname: admin.loginname, action: 'system_restart', detail: reason || undefined, ip: req.ip });
    return { ok: true, startedAt: systemRestart.info().startedAt };
  },

  async createNotice(req: FastifyRequest<{ Body: NoticeBody }>, reply: FastifyReply) {
    const input = parseNotice(req.body);
    if (typeof input === 'string') return badRequest(reply, input);
    const admin = currentUser(req)!;
    const notice = await systemStore.addNotice(input, admin.loginname);
    auditLog.write({ loginname: admin.loginname, action: 'notice_create', detail: `#${notice.id} · ${noticeLabel(input)}`, ip: req.ip });
    systemScheduler.checkNow(); // มีผลกับโหมดอัตโนมัติทันที ไม่ต้องรอรอบ 30 วินาที
    logger.info(`[system] ประกาศใหม่ #${notice.id} โดย ${admin.loginname}`);
    return notice;
  },

  async updateNotice(req: FastifyRequest<{ Params: { id: string }; Body: NoticeBody }>, reply: FastifyReply) {
    const input = parseNotice(req.body);
    if (typeof input === 'string') return badRequest(reply, input);
    const notice = await systemStore.updateNotice(Number(req.params.id), input);
    if (!notice) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบประกาศ' });
    const admin = currentUser(req)!;
    auditLog.write({ loginname: admin.loginname, action: 'notice_update', detail: `#${notice.id} · ${noticeLabel(input)}`, ip: req.ip });
    systemScheduler.checkNow(); // มีผลกับโหมดอัตโนมัติทันที ไม่ต้องรอรอบ 30 วินาที
    return notice;
  },

  async deleteNotice(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const id = Number(req.params.id);
    if (!(await systemStore.deleteNotice(id))) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบประกาศ' });
    const admin = currentUser(req)!;
    auditLog.write({ loginname: admin.loginname, action: 'notice_delete', detail: `#${id}`, ip: req.ip });
    systemScheduler.checkNow(); // มีผลกับโหมดอัตโนมัติทันที ไม่ต้องรอรอบ 30 วินาที
    return { ok: true };
  },

  /** ปิดปรับปรุงเฉพาะบางหน้า — pages ว่าง = เปิดทุกหน้ากลับ · ระหว่างปิด ผู้ใช้ทั่วไปเปิดหน้านั้นไม่ได้ หน้าอื่นใช้ได้ปกติ */
  async setPageMaintenance(req: FastifyRequest<{ Body: { pages?: unknown; message?: string; until?: string | null } }>, reply: FastifyReply) {
    const raw = Array.isArray(req.body?.pages) ? (req.body.pages as unknown[]).map(String) : [];
    const invalid = raw.filter(p => !(MAINTAINABLE_PAGES as readonly string[]).includes(p));
    if (invalid.length) return badRequest(reply, `หน้านี้ปิดปรับปรุงเฉพาะหน้าไม่ได้: ${invalid.join(', ')}`);
    const pages = MAINTAINABLE_PAGES.filter(p => raw.includes(p));
    const message = String(req.body?.message ?? '').trim().slice(0, 300);
    const parsed = pages.length ? parseUntil(req.body?.until) : { until: null };
    if ('error' in parsed) return badRequest(reply, parsed.error);
    const admin = currentUser(req)!;
    const state = await systemStore.setPageMaintenance([...pages], message, admin.loginname, parsed.until);
    systemScheduler.checkNow(); // ทุกหน้าเว็บเห็นทันที + ตั้งเวลาเปิดหน้ากลับ
    const detail = pages.length
      ? `ปิด: ${pages.join(', ')}${parsed.until ? ` · เปิดกลับเองเวลา ${untilLabel(parsed.until)}` : ''}${message ? ` · ${message}` : ''}`
      : 'เปิดทุกหน้ากลับ';
    auditLog.write({ loginname: admin.loginname, action: 'page_maintenance', detail, ip: req.ip });
    logger.warn(`[system] ${pages.length ? `ปิดปรับปรุงเฉพาะหน้า: ${pages.join(', ')}` : 'เปิดทุกหน้ากลับแล้ว'} โดย ${admin.loginname}`);
    return state;
  },

  /** เปิด/ปิดโหมดปิดปรับปรุง — ระหว่างเปิด ผู้ใช้ทั่วไป/ผู้เยี่ยมชมเห็นหน้าปิดปรับปรุง ผู้ดูแลยังใช้งานได้ */
  async setMaintenance(req: FastifyRequest<{ Body: { on?: boolean; message?: string; until?: string | null } }>, reply: FastifyReply) {
    const admin = currentUser(req)!;
    const on = req.body?.on === true;
    const message = String(req.body?.message ?? '').trim().slice(0, 300);
    const parsed = on ? parseUntil(req.body?.until) : { until: null };
    if ('error' in parsed) return badRequest(reply, parsed.error);
    // เปิดอยู่แล้ว (ผู้ดูแลเปิดเอง) สั่งเปิดซ้ำ = เลื่อนเวลา / แก้ข้อความ
    const extend = on && systemStore.maintenance().on;
    const state = await systemStore.setMaintenance(on, message, admin.loginname, null, parsed.until);
    systemScheduler.checkNow(); // ทุกหน้าเว็บเห็นทันที + ตั้งเวลาปิดโหมด
    const detail = [
      extend ? (parsed.until ? `เลื่อนเวลาปิดเองเป็น ${untilLabel(parsed.until)}` : 'ยกเลิกเวลาปิดเอง (เปิดค้างไว้)') : parsed.until ? `ปิดเองเวลา ${untilLabel(parsed.until)}` : '',
      message,
    ].filter(Boolean).join(' · ');
    auditLog.write({ loginname: admin.loginname, action: on ? 'maintenance_on' : 'maintenance_off', detail: detail || undefined, ip: req.ip });
    logger.warn(`[system] ${extend ? 'แก้โหมดปิดปรับปรุง' : on ? 'เปิดโหมดปิดปรับปรุง' : 'ปิดโหมดปิดปรับปรุง'} โดย ${admin.loginname}${detail ? ` — ${detail}` : ''}`);
    return state;
  },
};
