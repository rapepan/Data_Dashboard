import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import { logger } from '../utils/logger';
import { buildSystemStatus } from './status';

/**
 * ช่องสัญญาณสดถึงหน้าเว็บ (Server-Sent Events) — GET /api/system/events
 * หน้าเว็บเปิดค้างไว้ 1 เส้นต่อเบราว์เซอร์ (แท็บอื่นรับต่อผ่าน BroadcastChannel)
 * - ต่อแล้วได้สถานะปัจจุบันทันที · สถานะเปลี่ยน (ปิดปรับปรุง / ปิดรายหน้า / ประกาศ / เวอร์ชัน) → ส่งให้ทุกเส้นทันที
 * - ส่งสัญญาณกันสายหลุดทุก 25 วินาที · หลุดแล้วเบราว์เซอร์ต่อใหม่เอง (retry 3 วินาที)
 * - จำกัดจำนวนเส้น SSE_MAX_CLIENTS (ค่าเริ่มต้น 500)
 */
const MAX_CLIENTS = Number(process.env.SSE_MAX_CLIENTS) || 500;
const HEARTBEAT_MS = 25_000;

const clients = new Set<ServerResponse>();
let pending: NodeJS.Timeout | null = null;
let lastPayload = '';

function send(res: ServerResponse, chunk: string) {
  try { res.write(chunk); } catch { clients.delete(res); }
}

export const systemEvents = {
  count() {
    return clients.size;
  },

  /** เปิดช่องสัญญาณให้ 1 หน้าเว็บ */
  async connect(req: FastifyRequest, reply: FastifyReply) {
    if (clients.size >= MAX_CLIENTS) {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'การเชื่อมต่อสดเต็ม — หน้าเว็บจะตรวจสถานะแบบปกติแทน' });
    }
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // proxy หน้าบ้าน (nginx) ต้องไม่พักข้อมูลไว้ ไม่งั้นสัญญาณไม่ถึงทันที
      'X-Accel-Buffering': 'no',
    });
    const payload = JSON.stringify(await buildSystemStatus());
    // เส้นแรก = ยังไม่มีใครถือสถานะ → นับว่าสถานะล่าสุดที่ส่งคือก้อนนี้
    if (clients.size === 0) lastPayload = payload;
    clients.add(res);
    send(res, 'retry: 3000\n\n');
    send(res, `event: status\ndata: ${payload}\n\n`);

    const heartbeat = setInterval(() => send(res, ': ping\n\n'), HEARTBEAT_MS);
    heartbeat.unref();
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
      // ไม่มีใครต่ออยู่ = ไม่มีใครถือสถานะล่าสุด → ครั้งหน้าต้องส่งเสมอ
      if (clients.size === 0) lastPayload = '';
    });
  },

  /** สถานะเปลี่ยน → ส่งให้ทุกหน้าเว็บ (รวบการเปลี่ยนหลายครั้งในเวลาใกล้กันเป็นครั้งเดียว) */
  changed() {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      void systemEvents.broadcast();
    }, 50);
  },

  async broadcast(force = false) {
    if (clients.size === 0) return;
    try {
      const payload = JSON.stringify(await buildSystemStatus());
      if (!force && payload === lastPayload) return;
      lastPayload = payload;
      const chunk = `event: status\ndata: ${payload}\n\n`;
      for (const res of clients) send(res, chunk);
    } catch (error) {
      logger.warn(`[system] ส่งสถานะทางช่องสัญญาณสดไม่สำเร็จ — ${(error as Error).message}`);
    }
  },

  /** ปิดทุกเส้นตอนปิดเซิร์ฟเวอร์ (ไม่งั้นปิดเซิร์ฟเวอร์ค้างรอ) */
  closeAll() {
    for (const res of clients) { try { res.end(); } catch { /* ปิดไปแล้ว */ } }
    clients.clear();
  },
};
