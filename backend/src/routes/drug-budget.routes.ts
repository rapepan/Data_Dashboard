import type { FastifyInstance } from 'fastify';
import { drugBudgetController } from '../controllers/drug-budget.controller';

export async function drugBudgetRoutes(fastify: FastifyInstance) {
  fastify.get('/drug-budget/report', drugBudgetController.report);
  fastify.get('/drug-budget/compare', drugBudgetController.compare);
}
