import type { FastifyInstance } from 'fastify';
import { ipdController } from '../controllers/ipd.controller';

export async function ipdRoutes(fastify: FastifyInstance) {
  fastify.get('/ipd/report', ipdController.report);
}
