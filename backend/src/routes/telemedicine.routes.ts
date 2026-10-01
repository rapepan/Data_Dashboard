import type { FastifyInstance } from 'fastify';
import { telemedicineController } from '../controllers/telemedicine.controller';

export async function telemedicineRoutes(fastify: FastifyInstance) {
  fastify.get('/telemedicine/report', telemedicineController.report);
}
