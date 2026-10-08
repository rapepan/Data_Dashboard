import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { registerRoutes } from './routes';
import { registerErrorHandler } from './middleware/error-handler';
import { currentUser, isBackgroundRequest, registerAuth } from './middleware/auth';
import { describeRequest } from './utils/request-labels';
import { cleanIp, logger } from './utils/logger';

/**
 * สร้างแอป Fastify พร้อม plugin และ route ทั้งหมด (ยังไม่เปิดพอร์ต)
 * server.ts ใช้ตัวนี้แล้วสั่ง listen · ชุดทดสอบใช้ app.inject() ยิง request ได้โดยไม่ต้องเปิดพอร์ต
 * logRequests: false = ไม่พิมพ์ request ลงเทอร์มินัล (ใช้ตอนทดสอบ)
 */
export async function buildApp({ logRequests = true } = {}) {
  // trustProxy: เชื่อ X-Forwarded-For เฉพาะที่มาจากเครื่องตัวเอง (proxy ของ Vite) → req.ip เป็น IP เครื่องผู้ใช้จริง
  const app = Fastify({ logger: { level: 'warn' }, trustProxy: ['127.0.0.1', '::1'] });
  if (logRequests) {
    app.addHook('onResponse', async (req, reply) => {
      // ช่องสัญญาณสดเปิดค้างเป็นชั่วโมง — ไม่พิมพ์ (จำนวนที่ต่ออยู่ดูในสรุปรายชั่วโมง)
      if (req.url.startsWith('/api/system/events')) return;
      const purpose = typeof req.headers['x-purpose'] === 'string' ? req.headers['x-purpose'] : undefined;
      const info = describeRequest(req.method, req.url, isBackgroundRequest(req), purpose);
      logger.request(req.method, reply.statusCode, req.url, currentUser(req)?.loginname ?? 'guest', cleanIp(req.ip), Math.round(reply.elapsedTime), info);
    });
  }

  await app.register(helmet);
  await app.register(cors, {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(origin => origin.trim()),
    credentials: true,
  });
  await registerAuth(app);

  registerErrorHandler(app);
  await app.register(registerRoutes, { prefix: '/api' });
  return app;
}
