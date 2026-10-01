import type { FastifyReply, FastifyRequest } from 'fastify';
import { icd10Service } from '../services/icd10.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const icd10Controller = {
  summary(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return icd10Service.summary(range.start, range.end);
  },
};
