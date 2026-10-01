import type { FastifyInstance } from 'fastify';
import { thaiMedicineController } from '../controllers/thai-medicine.controller';

export async function thaiMedicineRoutes(fastify: FastifyInstance) {
  fastify.get('/thai-medicine/report', thaiMedicineController.report);
}
