import type { FastifyReply, FastifyRequest } from 'fastify';
import { currentUser } from '../middleware/auth';
import { cleanIp, logger } from '../utils/logger';

interface ClientErrorBody {
  message?: string;
  stack?: string;
  page?: string;
}

/** กันเครื่องที่ error วนซ้ำส่งมาท่วม: ไม่เกิน 20 ครั้ง / 10 นาที ต่อ IP (เกินแล้วเงียบ ไม่ตอบ error) */
const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();

const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export const clientErrorController = {
  /** frontend แจ้ง error ที่เกิดในเบราว์เซอร์ผู้ใช้ → พิมพ์ในเทอร์มินัล (ไม่เก็บลงไฟล์) */
  report(req: FastifyRequest<{ Body: ClientErrorBody }>, reply: FastifyReply) {
    const ip = cleanIp(req.ip);
    const times = (recent.get(ip) ?? []).filter(t => Date.now() - t < WINDOW_MS);
    recent.set(ip, times);
    if (times.length >= LIMIT) return reply.status(204).send();
    times.push(Date.now());

    const message = clean(req.body?.message, 300);
    if (!message) return reply.status(204).send();
    // stack แสดงแค่ 4 บรรทัดแรกพอให้เห็นว่าพังตรงไหน
    const stack = clean(req.body?.stack, 2000).split('\n').slice(0, 4).join('\n') || undefined;
    logger.client(currentUser(req)?.loginname ?? 'guest', ip, clean(req.body?.page, 120) || '-', message, stack);
    return reply.status(204).send();
  },
};
