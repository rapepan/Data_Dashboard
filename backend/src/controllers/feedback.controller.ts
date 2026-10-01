import type { FastifyReply, FastifyRequest } from 'fastify';
import { currentUser } from '../middleware/auth';
import {
  FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, feedbackStore,
  type FeedbackCategory, type FeedbackEntry, type FeedbackStatus,
} from '../feedback/feedback-store';
import { logger } from '../utils/logger';
import { normalizeThaiPhone } from '../utils/phone';
import { auditLog, GUEST_NAME } from '../auth/audit-log';
import { notifyService } from '../services/notify.service';
import { feedbackImages, ImageError, parseImages } from '../feedback/feedback-images';

interface SubmitBody {
  category?: string;
  page?: string;
  message?: string;
  name?: string;
  position?: string;
  contact?: string;
  phone?: string;
  lineId?: string;
  /** QR Code LINE (data URL) */
  lineQr?: string;
  /** รูปแนบ (data URL) ไม่บังคับ — หน้าเว็บย่อรูปก่อนส่ง */
  images?: unknown;
}

/** กันส่งรัว: ไม่เกิน 10 ครั้ง/ชั่วโมง ต่อ IP */
const LIMIT_PER_HOUR = 10;
const recent = new Map<string, number[]>();

function tooMany(ip: string) {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const times = (recent.get(ip) ?? []).filter(t => t > hourAgo);
  recent.set(ip, times);
  if (times.length >= LIMIT_PER_HOUR) return true;
  times.push(Date.now());
  return false;
}

const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

const STATUS_LABEL: Record<FeedbackStatus, string> = { new: 'ยังไม่ดำเนินการ', in_progress: 'กำลังดำเนินการ', done: 'ดำเนินการแล้ว' };

/** ข้อมูลที่ผู้แจ้งเห็น — ไม่ส่ง IP และ loginname ของผู้ดูแล */
function toReporterView(e: FeedbackEntry) {
  const { ip: _ip, reporterSeenAt, history, ...rest } = e;
  return {
    ...rest,
    history: (history ?? []).map(({ by: _by, ...h }) => h),
    unread: Boolean(e.updatedAt && (!reporterSeenAt || reporterSeenAt < e.updatedAt)),
  };
}

const badRequest = (reply: FastifyReply, message: string) =>
  reply.status(400).send({ statusCode: 400, error: 'Bad Request', message });

export const feedbackController = {
  /** ต้อง login เท่านั้น (route ใช้ requireAuth) — จะได้รู้ว่าใครแจ้ง และผู้แจ้งติดตามสถานะได้ */
  submit(req: FastifyRequest<{ Body: SubmitBody }>, reply: FastifyReply) {
    const user = currentUser(req);
    if (!user) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'กรุณาเข้าสู่ระบบก่อนแจ้งปัญหา' });
    const category = clean(req.body?.category, 20) as FeedbackCategory;
    const message = clean(req.body?.message, 5000);
    if (!FEEDBACK_CATEGORIES.includes(category)) return badRequest(reply, 'กรุณาเลือกประเภท');
    if (message.length < 5) return badRequest(reply, 'กรุณาเล่ารายละเอียดอย่างน้อย 5 ตัวอักษร');

    const name = user.displayName;
    const position = user.position || clean(req.body?.position, 120);
    let contactPhone = clean(req.body?.phone, 20);
    const contactLine = clean(req.body?.lineId, 50);
    if (!name) return badRequest(reply, 'กรุณากรอกชื่อผู้แจ้ง');
    if (!position) return badRequest(reply, 'กรุณากรอกหน่วยงาน / ตำแหน่ง');
    if (!contactPhone) return badRequest(reply, 'กรุณากรอกเบอร์โทรติดต่อกลับ');
    const phone = normalizeThaiPhone(contactPhone);
    if (!phone) return badRequest(reply, 'เบอร์โทรไม่ถูกต้อง (ต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)');
    contactPhone = phone;
    let images: ReturnType<typeof parseImages>;
    let lineQr: ReturnType<typeof parseImages>[number] | undefined;
    try {
      images = parseImages(req.body?.images);
      lineQr = req.body?.lineQr ? parseImages([req.body.lineQr])[0] : undefined;
    } catch (error) {
      if (error instanceof ImageError) return badRequest(reply, error.message.replace('รูปที่ 1', 'QR Code LINE'));
      throw error;
    }
    if (!contactLine && !lineQr) return badRequest(reply, 'กรุณากรอก LINE ID หรือแนบ QR Code LINE');
    // เลือกอย่างใดอย่างหนึ่ง — ถ้าส่งมาทั้งคู่ ใช้ LINE ID
    if (contactLine) lineQr = undefined;
    const contact = [contactPhone && `โทร ${contactPhone}`, contactLine && `LINE ID: ${contactLine}`, lineQr && 'LINE: QR Code (แนบรูป)'].filter(Boolean).join(' · ');
    if (tooMany(req.ip)) {
      return reply.status(429).send({ statusCode: 429, error: 'Too Many Requests', message: 'ส่งหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' });
    }

    const saved = feedbackStore.add({
      category,
      page: clean(req.body?.page, 80) || 'ทั่วไป',
      message,
      name,
      position,
      contact,
      ...(contactPhone ? { contactPhone } : {}),
      ...(contactLine ? { contactLine } : {}),
      loginname: user.loginname,
      ip: req.ip.replace(/^::ffff:/, ''),
    });
    if (images.length) {
      saved.images = feedbackImages.save(saved.id, images);
      feedbackStore.setImages(saved.id, saved.images);
    }
    if (lineQr) {
      saved.lineQr = feedbackImages.saveLineQr(saved.id, lineQr);
      if (saved.lineQr) feedbackStore.setLineQr(saved.id, saved.lineQr);
    }
    // แจ้งเข้ามือถือ (Telegram) แบบไม่รอ — ส่งไม่สำเร็จก็ไม่กระทบการบันทึก
    notifyService.feedback(saved);
    auditLog.write({ loginname: user.loginname, action: 'feedback_submit', detail: `#${saved.id} · ${category} · ${saved.page}${saved.images?.length ? ` · รูป ${saved.images.length}` : ''}`, ip: req.ip });
    logger.tally('feedback');
    logger.info(`[feedback] ✉ ${saved.id} (${category}) · ${saved.page} · ${user.loginname}`);
    return { ok: true, id: saved.id };
  },

  /** ผู้ดูแลระบบ: รายการทั้งหมด */
  list(req: FastifyRequest<{ Querystring: { status?: string } }>) {
    const status = FEEDBACK_STATUSES.includes(req.query.status as FeedbackStatus) ? (req.query.status as FeedbackStatus) : undefined;
    const all = feedbackStore.list();
    return {
      entries: status ? all.filter(e => e.status === status) : all,
      counts: {
        all: all.length,
        new: all.filter(e => e.status === 'new').length,
        in_progress: all.filter(e => e.status === 'in_progress').length,
        done: all.filter(e => e.status === 'done').length,
      },
    };
  },

  /** ผู้ดูแลระบบ: กระดิ่งแจ้งเตือน — จำนวนเรื่องที่ยังไม่ดำเนินการ + 5 เรื่องล่าสุด (ข้อความตัดสั้น) */
  summary() {
    const pending = feedbackStore.list('new');
    return {
      newCount: pending.length,
      latest: pending.slice(0, 5).map(e => ({
        id: e.id,
        time: e.time,
        category: e.category,
        page: e.page,
        name: e.name,
        message: e.message.length > 90 ? `${e.message.slice(0, 90)}…` : e.message,
        imageCount: e.images?.length ?? 0,
      })),
    };
  },

  /** ผู้ดูแลระบบ: ดูรูปแนบ (ไม่มีลิงก์สาธารณะ) */
  image(req: FastifyRequest<{ Params: { id: string; file: string } }>, reply: FastifyReply) {
    const buffer = feedbackImages.read(req.params.id, req.params.file);
    if (!buffer) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบรูป (อาจถูกลบตามกำหนดเก็บ 90 วันแล้ว)' });
    return reply.type(feedbackImages.mimeOf(req.params.file)).header('Cache-Control', 'private, max-age=86400').send(buffer);
  },

  /** ผู้ดูแลระบบ: เปลี่ยนสถานะ + ข้อความถึงผู้แจ้ง (ไม่บังคับ) — บันทึกลงไทม์ไลน์ ผู้แจ้งเห็นในหน้า "เรื่องที่แจ้ง" */
  setStatus(req: FastifyRequest<{ Params: { id: string }; Body: { status?: string; note?: string } }>, reply: FastifyReply) {
    const status = req.body?.status as FeedbackStatus;
    if (!FEEDBACK_STATUSES.includes(status)) return badRequest(reply, 'สถานะไม่ถูกต้อง');
    const note = clean(req.body?.note, 1000) || undefined;
    const admin = currentUser(req);
    const updated = feedbackStore.setStatus(req.params.id, status, { loginname: admin?.loginname ?? '-', name: admin?.displayName }, note);
    if (!updated) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบรายการ' });
    auditLog.write({ loginname: admin?.loginname ?? GUEST_NAME, action: 'feedback_status', detail: `#${updated.id} → ${STATUS_LABEL[status]}${note ? ` · "${note.slice(0, 60)}"` : ''}`, ip: req.ip });
    logger.info(`[feedback] #${updated.id} → ${status}${note ? ' (มีข้อความ)' : ''} โดย ${admin?.loginname ?? '-'}`);
    return updated;
  },

  /* ---------- ผู้แจ้ง: ติดตามเรื่องของตัวเอง ---------- */

  /** เรื่องที่แจ้ง — พร้อมไทม์ไลน์ + ธงว่ามีความเคลื่อนไหวใหม่ที่ยังไม่เห็น */
  mine(req: FastifyRequest) {
    const user = currentUser(req)!;
    const entries = feedbackStore.listByReporter(user.loginname).map(toReporterView);
    return { entries, unread: entries.filter(e => e.unread).length };
  },

  /** กระดิ่ง/ป้ายเมนูของผู้แจ้ง (เรียกแบบเบื้องหลังทุก 1 นาที) */
  mineSummary(req: FastifyRequest) {
    const user = currentUser(req)!;
    const unread = feedbackStore.listByReporter(user.loginname).map(toReporterView).filter(e => e.unread);
    return {
      unread: unread.length,
      latest: unread.slice(0, 5).map(e => {
        const last = e.history?.[e.history.length - 1];
        return { id: e.id, status: e.status, updatedAt: e.updatedAt, page: e.page, category: e.category, note: last?.note };
      }),
    };
  },

  /** ผู้แจ้งเปิดหน้า "เรื่องที่แจ้ง" แล้ว → ความเคลื่อนไหวทั้งหมดถือว่าเห็นแล้ว */
  mineSeen(req: FastifyRequest) {
    feedbackStore.markSeenByReporter(currentUser(req)!.loginname);
    return { ok: true };
  },

  /** รูปแนบของเรื่องที่ตัวเองแจ้ง */
  mineImage(req: FastifyRequest<{ Params: { id: string; file: string } }>, reply: FastifyReply) {
    const user = currentUser(req)!;
    const own = feedbackStore.listByReporter(user.loginname).some(e => e.id === req.params.id);
    const buffer = own ? feedbackImages.read(req.params.id, req.params.file) : null;
    if (!buffer) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบรูป' });
    return reply.type(feedbackImages.mimeOf(req.params.file)).header('Cache-Control', 'private, max-age=86400').send(buffer);
  },
};
