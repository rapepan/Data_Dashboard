import type { FastifyReply, FastifyRequest } from 'fastify';
import { readmitService } from '../services/readmit.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const readmitController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery & { ward?: string } }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return readmitService.report(range.start, range.end, String(req.query.ward ?? 'all'));
  },
};
