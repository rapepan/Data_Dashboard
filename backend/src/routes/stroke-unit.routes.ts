import type { FastifyInstance } from 'fastify';
import { strokeUnitController } from '../controllers/stroke-unit.controller';

export async function strokeUnitRoutes(fastify: FastifyInstance) {
  fastify.get('/stroke-unit/status', strokeUnitController.status);
}
