import type { FastifyReply, FastifyRequest } from 'fastify';
import { postalDrugService } from '../services/postal-drug.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const postalDrugController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return postalDrugService.report(range.start, range.end);
  },
};
