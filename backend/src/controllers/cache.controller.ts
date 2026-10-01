import type { FastifyReply, FastifyRequest } from 'fastify';
import { reportCache } from '../cache/report-cache';
import { REPORTS } from '../cache/report-registry';
import { prewarm } from '../cache/prewarm';
import { hosxpRepository } from '../repositories/hosxp.repository';
import { auditLog } from '../auth/audit-log';
import { currentUser } from '../middleware/auth';

export const cacheController = {
  /** ผู้ดูแลระบบ: สถานะการดึงข้อมูล (หน้า "สถานะข้อมูล") */
  status() {
    const cache = reportCache.status();
    return {
      reports: REPORTS.map(r => ({ name: r.name, label: r.label, source: r.source, prewarm: Boolean(r.prewarm), ...(cache.byReport[r.name] ?? { entries: 0, fresh: 0, newest: null }) })),
      cache: { entries: cache.entries, running: cache.running, queued: cache.queued, stats: cache.stats, config: cache.config },
      prewarm: prewarm.status(),
      hosxp: { configured: hosxpRepository.isConfigured() },
    };
  },

  /** ผู้ดูแลระบบ: สั่งดึงข้อมูลใหม่ทันที (จำกัดทุก 10 นาที) */
  refresh(req: FastifyRequest, reply: FastifyReply) {
    const result = prewarm.requestManual();
    if (!result.ok) {
      const message = result.reason === 'running'
        ? 'กำลังดึงข้อมูลอยู่ กรุณารอให้รอบนี้เสร็จก่อน'
        : `เพิ่งสั่งดึงข้อมูลไป กดได้อีกครั้งเวลา ${new Date(result.retryAt!).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} น.`;
      return reply.status(429).send({ statusCode: 429, error: 'Too Many Requests', message });
    }
    const user = currentUser(req);
    auditLog.write({ loginname: user?.loginname ?? '-', action: 'cache_refresh', detail: 'สั่งดึงข้อมูลใหม่ทุกรายงาน', ip: req.ip });
    return { ok: true };
  },
};
