import type { FastifyReply, FastifyRequest } from 'fastify';
import { opdService } from '../services/opd.service';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';
import { todayIso } from '../cache/report-registry';

const badRequest = (reply: FastifyReply, message: string) => reply.status(400).send({ statusCode: 400, error: 'Bad Request', message });

export const opdController = {
  report(req: FastifyRequest<{ Querystring: DateRangeQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (range) return opdService.report(range.start, range.end);
  },

  appointments(req: FastifyRequest<{ Querystring: { date?: string; ahead?: string } }>, reply: FastifyReply) {
    const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
    const shift = (days: number) => { const d = new Date(`${todayIso()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

    if (req.query.ahead !== undefined) {
      const ahead = req.query.ahead;
      if (!isDate(ahead)) return badRequest(reply, 'รูปแบบวันที่ไม่ถูกต้อง');
      if (ahead < todayIso()) return badRequest(reply, 'ดูนัดหมายย้อนหลังในแผงนี้ไม่ได้ — เลือกได้ตั้งแต่วันนี้');
      if (ahead > shift(365)) return badRequest(reply, 'ดูล่วงหน้าได้ไม่เกิน 1 ปี');
      return opdService.appointmentsAhead(ahead);
    }

    const date = req.query.date || todayIso();
    if (!isDate(date)) return badRequest(reply, 'รูปแบบวันที่ไม่ถูกต้อง');
    if (date > todayIso()) return badRequest(reply, 'ดูนัดหมายล่วงหน้าไม่ได้ — เลือกได้ถึงวันนี้');
    if (date < '2015-01-01') return badRequest(reply, 'ดูย้อนหลังได้ถึงปี 2558');
    return opdService.appointments(date);
  },
};
