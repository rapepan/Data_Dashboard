import type { FastifyReply, FastifyRequest } from 'fastify';
import { drugBudgetService } from '../services/drug-budget.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const drugBudgetController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return drugBudgetService.report(range.start, range.end);
  },

  async compare(req: FastifyRequest<{ Querystring: DateRangeQuery & { code?: string } }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (!range) return;
    const result = await drugBudgetService.compare(String(req.query.code ?? ''), range.end);
    if (!result) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบรหัสยานี้' });
    return result;
  },
};
