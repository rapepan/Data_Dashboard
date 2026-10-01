import type { FastifyInstance } from 'fastify';
import { erController } from '../controllers/er.controller';

export async function erRoutes(fastify: FastifyInstance) {
  fastify.get('/er/report', erController.report);
}
