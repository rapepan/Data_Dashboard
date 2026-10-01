import type { FastifyInstance } from 'fastify';
import { referralController } from '../controllers/referral.controller';

export async function referralRoutes(fastify: FastifyInstance) {
  fastify.get('/referral/report', referralController.report);
}
