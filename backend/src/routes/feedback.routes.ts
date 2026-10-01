import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { feedbackController } from '../controllers/feedback.controller';
import { requireAuth } from '../middleware/auth';

const LINE_QR_FILE = path.resolve(__dirname, '../../assets/line-qr.jpg');

/** แจ้งปัญหา / ข้อเสนอแนะ — ต้อง login ทุกเส้นทาง (รู้ตัวผู้แจ้ง และติดตามสถานะเรื่องของตัวเองได้) */
export async function feedbackRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);
  // รูปแนบส่งมาเป็น data URL (สูงสุด 3 รูป × 5 MB ≈ 20 MB หลังเข้ารหัส) — ขยายขนาดรับเฉพาะ route นี้
  fastify.post('/feedback', { bodyLimit: 22 * 1024 * 1024 }, feedbackController.submit);
  fastify.get('/feedback/mine', feedbackController.mine);
  fastify.get('/feedback/mine/summary', feedbackController.mineSummary);
  fastify.post('/feedback/mine/seen', feedbackController.mineSeen);
  fastify.get('/feedback/mine/:id/images/:file', feedbackController.mineImage);
  // QR Code LINE ส่วนตัวของผู้พัฒนา — ไม่วางไว้ใน public ของหน้าเว็บ ให้เห็นเฉพาะผู้ที่ login
  // ไฟล์ไม่อยู่ใน git — เครื่องที่ยังไม่ได้วางไฟล์จะได้ 404 และหน้าเว็บซ่อนการ์ด LINE เอง
  fastify.get('/contact/line-qr', (_req, reply) => {
    if (!existsSync(LINE_QR_FILE)) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ยังไม่ได้ตั้งค่า QR Code LINE' });
    return reply.type('image/jpeg').header('Cache-Control', 'private, max-age=3600').send(readFileSync(LINE_QR_FILE));
  });
}
