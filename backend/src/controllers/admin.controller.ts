import type { FastifyRequest } from 'fastify';
import { auditLog, AUDIT_ACTIONS, type AuditWho } from '../auth/audit-log';

export const adminController = {
  audit(req: FastifyRequest<{ Querystring: { limit?: string; loginname?: string; action?: string; who?: string } }>) {
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
    return {
      entries: auditLog.read({
        limit,
        loginname: req.query.loginname || undefined,
        action: req.query.action || undefined,
        who: (['all', 'user', 'guest'] as AuditWho[]).find(w => w === req.query.who) ?? 'all',
      }),
      actions: AUDIT_ACTIONS,
      users: auditLog.users(),
    };
  },
};
