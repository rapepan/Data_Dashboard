import type { FastifyInstance } from 'fastify';
import { systemController } from '../controllers/system.controller';
import { requireAuth } from '../middleware/auth';

/** ทุกคนเรียกได้ (ไม่ต้อง login) และเปิดได้แม้อยู่ในโหมดปิดปรับปรุง */
export async function systemRoutes(fastify: FastifyInstance) {
  fastify.get('/system/status', systemController.status);
  fastify.get('/system/events', systemController.events);
  // หน้าต่าง "มีอะไรใหม่" — จำตามบัญชี (ผู้เยี่ยมชมจำในเบราว์เซอร์แทน)
  fastify.get('/system/whats-new', { preHandler: requireAuth }, systemController.whatsNewSeen);
  fastify.post<{ Body: { version?: string } }>('/system/whats-new', { preHandler: requireAuth }, systemController.markWhatsNewSeen);
}
