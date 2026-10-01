import type { FastifyInstance } from 'fastify';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', authController.login);
  fastify.post('/auth/logout', authController.logout);
  // ผู้เยี่ยมชมเรียกได้ — ได้รายการหน้า/สิทธิ์ของผู้เยี่ยมชมกลับไป
  fastify.get('/auth/me', authController.me);
  fastify.post('/audit/export', { preHandler: requireAuth }, authController.logExport);
}
