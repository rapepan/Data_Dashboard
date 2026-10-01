import type { FastifyInstance } from 'fastify';
import { clientErrorController } from '../controllers/client-error.controller';

/** รับ error จากเบราว์เซอร์ผู้ใช้ — เปิดให้ทุกคน (รวมผู้เยี่ยมชม) */
export async function clientErrorRoutes(fastify: FastifyInstance) {
  fastify.post('/client-error', clientErrorController.report);
}
