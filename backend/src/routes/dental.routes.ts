import type { FastifyInstance } from 'fastify';
import { dentalController } from '../controllers/dental.controller';

export async function dentalRoutes(fastify: FastifyInstance) {
  fastify.get('/dental/report', dentalController.report);
}
