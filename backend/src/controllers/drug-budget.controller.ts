import type { FastifyReply, FastifyRequest } from 'fastify';
import { drugBudgetService } from '../services/drug-budget.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';
import { currentUser } from '../middleware/auth';
import type { DrugBudgetReport, DrugCompare, DrugGroupTotal } from '../types/reports.types';

/** ราคาทุน / ราคาขาย เห็นเฉพาะผู้ที่ login — ผู้เยี่ยมชมได้ 0 */
const noMoney = <T extends { value: number; cost?: number }>(x: T): T => ({ ...x, value: 0, ...(x.cost !== undefined ? { cost: 0 } : {}) });
const noMoneyTotal = (t: DrugGroupTotal): DrugGroupTotal => ({ ...t, value: 0, cost: 0 });
function hideMoney<T extends DrugBudgetReport>(r: T): T {
  return {
    ...r,
    showMoney: false,
    totals: { ...noMoneyTotal(r.totals), byType: { modern: noMoneyTotal(r.totals.byType.modern), thai: noMoneyTotal(r.totals.byType.thai), inhouse: noMoneyTotal(r.totals.byType.inhouse) }, ed: noMoneyTotal(r.totals.ed), ned: noMoneyTotal(r.totals.ned) },
    topDrugs: { modern: r.topDrugs.modern.map(noMoney), thai: r.topDrugs.thai.map(noMoney), inhouse: r.topDrugs.inhouse.map(noMoney) },
    monthly: { ...r.monthly, cost: r.monthly.cost.map(() => 0), sale: r.monthly.sale.map(() => 0) },
  };
}

export const drugBudgetController = {
  async report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (!range) return;
    const result = await drugBudgetService.report(range.start, range.end);
    return result && !currentUser(req) ? hideMoney(result) : result;
  },

  async compare(req: FastifyRequest<{ Querystring: DateRangeQuery & { code?: string } }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (!range) return;
    const result = await drugBudgetService.compare(String(req.query.code ?? ''), range.end);
    if (!result) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบรหัสยานี้' });
    return currentUser(req) ? result : { ...result, years: result.years.map(noMoney) } satisfies DrugCompare;
  },
};
