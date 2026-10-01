import type { FastifyInstance } from 'fastify';
import { opdController } from '../controllers/opd.controller';

export async function opdRoutes(fastify: FastifyInstance) {
  fastify.get('/opd/report', opdController.report);
  fastify.get('/opd/appointments', opdController.appointments);
}
