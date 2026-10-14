import type { FastifyInstance } from 'fastify';
import { telepharmacyController } from '../controllers/telepharmacy.controller';

export async function telepharmacyRoutes(fastify: FastifyInstance) {
  fastify.get('/telepharmacy/report', telepharmacyController.report);
}
