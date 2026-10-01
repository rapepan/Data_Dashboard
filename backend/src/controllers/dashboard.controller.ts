import type { FastifyReply, FastifyRequest } from 'fastify';
import { dashboardService } from '../services/dashboard.service';
import { currentUser } from '../middleware/auth';
import { canViewRevenueDetail } from '../auth/roles';
import { parseDateRange, type DateRangeQuery } from '../utils/date-range';

interface SummaryQuery extends DateRangeQuery {
  mode?: string;
}

export const dashboardController = {
  async summary(req: FastifyRequest<{ Querystring: SummaryQuery }>, reply: FastifyReply) {
    const range = parseDateRange(req.query, reply);
    if (!range) return;
    const mode = req.query.mode === 'fiscal' ? 'fiscal' : 'range';
    const snapshot = await dashboardService.summary(mode, range.start, range.end);
    if (!snapshot) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'ไม่พบข้อมูล' });
    // รายละเอียดค่ารักษาแยกตามสิทธิ์ (ข้อมูลการเงิน) ส่งเฉพาะผู้ที่มีสิทธิ์
    // ต้องสร้าง object ใหม่ — ห้ามแก้ตัวที่อยู่ใน cache (คนถัดไปที่มีสิทธิ์จะไม่เห็นข้อมูล)
    if (!canViewRevenueDetail(currentUser(req))) return { ...snapshot, revenueByRight: [] };
    return snapshot;
  },
};
