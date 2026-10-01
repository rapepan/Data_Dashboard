import type { FastifyInstance } from 'fastify';
import { adminController } from '../controllers/admin.controller';
import { usersController } from '../controllers/users.controller';
import { feedbackController } from '../controllers/feedback.controller';
import { cacheController } from '../controllers/cache.controller';

/** เฉพาะผู้ดูแลระบบ — สิทธิ์ถูกตรวจตอน register ใน routes/index.ts */
export async function adminRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/audit', adminController.audit);
  fastify.get('/admin/users', usersController.list);
  fastify.post('/admin/users/:loginname/logout', usersController.forceLogout);
  fastify.get('/admin/feedback', feedbackController.list);
  fastify.get('/admin/feedback/summary', feedbackController.summary);
  fastify.post('/admin/feedback/summary/seen', feedbackController.bellSeen);
  fastify.put('/admin/feedback/:id/status', feedbackController.setStatus);
  fastify.get('/admin/feedback/:id/images/:file', feedbackController.image);
  fastify.get('/admin/cache', cacheController.status);
  fastify.post('/admin/cache/refresh', cacheController.refresh);
}
