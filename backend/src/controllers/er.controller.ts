import type { FastifyReply, FastifyRequest } from 'fastify';
import { erService } from '../services/er.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const erController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return erService.report(range.start, range.end);
  },
};
