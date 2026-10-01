import type { FastifyReply, FastifyRequest } from 'fastify';
import { physioService } from '../services/physio.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const physioController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return physioService.report(range.start, range.end);
  },
};
