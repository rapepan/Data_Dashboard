import type { FastifyInstance } from 'fastify';
import { queueController } from '../controllers/queue.controller';

export async function queueRoutes(fastify: FastifyInstance) {
  fastify.get('/queue/report', queueController.report);
}
