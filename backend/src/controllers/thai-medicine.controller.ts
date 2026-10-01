import type { FastifyReply, FastifyRequest } from 'fastify';
import { thaiMedicineService } from '../services/thai-medicine.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

export const thaiMedicineController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return thaiMedicineService.report(range.start, range.end);
  },
};
