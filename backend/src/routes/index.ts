import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { healthRoutes } from './health.routes';
import { authRoutes } from './auth.routes';
import { adminRoutes } from './admin.routes';
import { dashboardRoutes } from './dashboard.routes';
import { opdRoutes } from './opd.routes';
import { ipdRoutes } from './ipd.routes';
import { erRoutes } from './er.routes';
import { queueRoutes } from './queue.routes';
import { icd10Routes } from './icd10.routes';
import { dentalRoutes } from './dental.routes';
import { physioRoutes } from './physio.routes';
import { telemedicineRoutes } from './telemedicine.routes';
import { postalDrugRoutes } from './postal-drug.routes';
import { thaiMedicineRoutes } from './thai-medicine.routes';
import { readmitRoutes } from './readmit.routes';
import { referralRoutes } from './referral.routes';
import { drugBudgetRoutes } from './drug-budget.routes';
import { feedbackRoutes } from './feedback.routes';
import { clientErrorRoutes } from './client-error.routes';
import { currentUser, isBackgroundRequest, optionalAuth, requirePage } from '../middleware/auth';
import { auditLog, GUEST_NAME } from '../auth/audit-log';
import { presence } from '../auth/presence';
import type { PageKey } from '../auth/roles';
import { cleanIp, logger } from '../utils/logger';

/** หน้าผู้ดูแลระบบที่พิมพ์ในเทอร์มินัลทุกครั้งที่มีคนเปิดดู */
const ADMIN_PAGE_LABEL: Record<string, string> = {
  '/api/admin/audit': 'ประวัติการใช้งาน',
  '/api/admin/feedback': 'แจ้งปัญหา / ข้อเสนอแนะ',
  '/api/admin/cache': 'สถานะข้อมูลพักไว้',
  '/api/admin/users': 'ผู้ใช้งานระบบ',
};

/** route กลุ่มนี้เปิดได้เฉพาะผู้ที่มีสิทธิ์ดูหน้า `page` */
/** เปิดดูหน้าเดิมซ้ำภายในช่วงนี้ นับเป็นครั้งเดียวในประวัติการใช้งาน */
const VIEW_DEDUPE_MS = 10_000;
const recentViews = new Map<string, number>();

function isRepeatView(key: string) {
  const now = Date.now();
  if (recentViews.size > 2000) for (const [k, t] of recentViews) if (now - t > VIEW_DEDUPE_MS) recentViews.delete(k);
  const last = recentViews.get(key);
  recentViews.set(key, now);
  return last !== undefined && now - last < VIEW_DEDUPE_MS;
}

function guarded(page: PageKey, routes: FastifyPluginAsync): FastifyPluginAsync {
  return async fastify => {
    fastify.addHook('preHandler', requirePage(page));
    await fastify.register(routes);
  };
}

export async function registerRoutes(fastify: FastifyInstance) {
  await fastify.register(healthRoutes);
  await fastify.register(async app => {
    app.addHook('preHandler', optionalAuth);
    app.addHook('preHandler', async req => {
      const user = currentUser(req);
      if (user) presence.touch(user, req.ip, isBackgroundRequest(req));
      else presence.touchGuest(req.ip);
    });

    // บันทึกการเปิดดูข้อมูล — ทั้งผู้ที่ login และผู้เยี่ยมชม (guest + IP) ยกเว้น auto-refresh เบื้องหลัง และ /auth/*
    app.addHook('onResponse', async (req, reply) => {
      if (req.method !== 'GET' || reply.statusCode !== 200) return;
      if (isBackgroundRequest(req) || req.url.startsWith('/api/auth/')) return;
      const user = currentUser(req);
      const loginname = user?.loginname ?? GUEST_NAME;
      if (isRepeatView(`${loginname}|${req.ip}|${req.url.split('?')[0]}`)) return;
      const path = req.url.split('?')[0];
      auditLog.write({ loginname, action: 'view', detail: path, ip: req.ip });
      logger.pageView(path);
      if (ADMIN_PAGE_LABEL[path]) logger.adminView(loginname, cleanIp(req.ip), ADMIN_PAGE_LABEL[path]);
    });

    await app.register(authRoutes);
    await app.register(feedbackRoutes);
    await app.register(clientErrorRoutes);
    await app.register(guarded('dashboard', dashboardRoutes));
    await app.register(guarded('icd10', icd10Routes));
    await app.register(guarded('queue', queueRoutes));
    await app.register(guarded('opd', opdRoutes));
    await app.register(guarded('ipd', ipdRoutes));
    await app.register(guarded('er', erRoutes));
    // Stroke Unit ซ่อนไว้ชั่วคราว (ข้อมูลยังไม่แน่ชัด): await app.register(guarded('stroke', strokeUnitRoutes));
    await app.register(guarded('dental', dentalRoutes));
    await app.register(guarded('physio', physioRoutes));
    await app.register(guarded('tele', telemedicineRoutes));
    await app.register(guarded('postal', postalDrugRoutes));
    await app.register(guarded('thaimed', thaiMedicineRoutes));
    await app.register(guarded('readmit', readmitRoutes));
    await app.register(guarded('referral', referralRoutes));
    await app.register(guarded('drugbudget', drugBudgetRoutes));
    await app.register(guarded('admin', adminRoutes));
  });
}
