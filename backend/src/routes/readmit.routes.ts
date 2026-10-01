import type { FastifyInstance } from 'fastify';
import { readmitController } from '../controllers/readmit.controller';

export async function readmitRoutes(fastify: FastifyInstance) {
  fastify.get('/readmit/report', readmitController.report);
}
