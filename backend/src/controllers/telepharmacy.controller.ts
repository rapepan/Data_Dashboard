import type { FastifyReply, FastifyRequest } from 'fastify';
import { telepharmacyService } from '../services/telepharmacy.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';
import { currentUser } from '../middleware/auth';
import type { TelepharmacyReport } from '../types/reports.types';

/** ทุน / ขาย เห็นเฉพาะผู้ที่ login — ผู้เยี่ยมชมได้ 0 (เหมือนหน้าปริมาณการใช้ยา) */
function hideMoney(r: TelepharmacyReport): TelepharmacyReport {
  return {
    ...r,
    showMoney: false,
    range: { ...r.range, cost: 0, sale: 0 },
    fiscal: { ...r.fiscal, sale: 0 },
    monthly: { ...r.monthly, cost: r.monthly.cost.map(() => 0), sale: r.monthly.sale.map(() => 0) },
    topDrugs: r.topDrugs.map(d => ({ ...d, value: 0, cost: 0 })),
  };
}

export const telepharmacyController = {
  async report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (!range) return;
    const result = await telepharmacyService.report(range.start, range.end);
    return result && !currentUser(req) ? hideMoney(result) : result;
  },
};
