import type { FastifyInstance } from 'fastify';
import { dashboardController } from '../controllers/dashboard.controller';

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard/summary', dashboardController.summary);
}
