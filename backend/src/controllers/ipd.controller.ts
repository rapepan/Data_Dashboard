import type { FastifyReply, FastifyRequest } from 'fastify';
import { ipdService } from '../services/ipd.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const ipdController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return ipdService.report(range.start, range.end);
  },
};
