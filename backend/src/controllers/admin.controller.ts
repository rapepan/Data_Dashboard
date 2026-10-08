import type { FastifyRequest } from 'fastify';
import { auditLog, AUDIT_ACTIONS, type AuditWho } from '../auth/audit-log';
import { USAGE_RANGES, usageSummary, type UsageRange } from '../auth/usage-stats';
import { pageLabel } from '../utils/request-labels';

export const adminController = {
  async audit(req: FastifyRequest<{ Querystring: { limit?: string; loginname?: string; action?: string; who?: string } }>) {
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
    return {
      entries: (await auditLog.read({
        limit,
        loginname: req.query.loginname || undefined,
        action: req.query.action || undefined,
        who: (['all', 'user', 'guest'] as AuditWho[]).find(w => w === req.query.who) ?? 'all',
      })).map(e => {
        // เปิดดู: detail เป็น path ของ API → ชื่อหน้าภาษาไทย (ชุดเดียวกับข้อความในเทอร์มินัล)
        const label = e.action === 'view' && e.detail ? pageLabel(e.detail) : null;
        return label ? { ...e, label } : e;
      }),
      actions: AUDIT_ACTIONS,
      users: await auditLog.users(),
    };
  },

  /** สรุปการใช้งาน ?days=7|30|90 (ค่าเริ่มต้น 30) */
  async usage(req: FastifyRequest<{ Querystring: { days?: string } }>) {
    const days = USAGE_RANGES.find(d => d === Number(req.query.days)) ?? (30 as UsageRange);
    return usageSummary(days);
  },
};
