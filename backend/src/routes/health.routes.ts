import type { FastifyInstance } from 'fastify';
import { healthController } from '../controllers/health.controller';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', healthController.check);
}
