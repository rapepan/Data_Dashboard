import type { FastifyReply, FastifyRequest } from 'fastify';
import { dentalService } from '../services/dental.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const dentalController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return dentalService.report(range.start, range.end);
  },
};
