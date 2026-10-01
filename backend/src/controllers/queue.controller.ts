import type { FastifyReply, FastifyRequest } from 'fastify';
import { queueService } from '../services/queue.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const queueController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return queueService.report(range.start, range.end);
  },
};
