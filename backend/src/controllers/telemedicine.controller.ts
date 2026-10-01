import type { FastifyReply, FastifyRequest } from 'fastify';
import { telemedicineService } from '../services/telemedicine.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const telemedicineController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return telemedicineService.report(range.start, range.end);
  },
};
