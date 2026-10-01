import type { FastifyInstance } from 'fastify';
import { physioController } from '../controllers/physio.controller';

export async function physioRoutes(fastify: FastifyInstance) {
  fastify.get('/physio/report', physioController.report);
}
