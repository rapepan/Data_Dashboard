import type { FastifyInstance } from 'fastify';
import { postalDrugController } from '../controllers/postal-drug.controller';

export async function postalDrugRoutes(fastify: FastifyInstance) {
  fastify.get('/postal-drug/report', postalDrugController.report);
}
