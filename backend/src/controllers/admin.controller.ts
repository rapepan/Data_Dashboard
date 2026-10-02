import type { FastifyRequest } from 'fastify';
import { auditLog, AUDIT_ACTIONS, type AuditWho } from '../auth/audit-log';
import { USAGE_RANGES, usageSummary, type UsageRange } from '../auth/usage-stats';

export const adminController = {
  async audit(req: FastifyRequest<{ Querystring: { limit?: string; loginname?: string; action?: string; who?: string } }>) {
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
    return {
      entries: await auditLog.read({
        limit,
        loginname: req.query.loginname || undefined,
        action: req.query.action || undefined,
        who: (['all', 'user', 'guest'] as AuditWho[]).find(w => w === req.query.who) ?? 'all',
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
