import type { FastifyReply, FastifyRequest } from 'fastify';
import { referralService } from '../services/referral.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const referralController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery & { point?: string } }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return referralService.report(range.start, range.end, String(req.query.point ?? 'all'));
  },
};
