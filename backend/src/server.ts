import './env';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { SESSION_IDLE_MINUTES } from './middleware/auth';
import { loginThrottle } from './auth/auth.service';
import { hosxpRepository } from './repositories/hosxp.repository';
import { AUDIT_KEEP_DAYS, auditLog } from './auth/audit-log';
import { feedbackStore } from './feedback/feedback-store';
import { color, logger, printBlock } from './utils/logger';
import { dataUsage, monitor } from './utils/monitor';
import { notifyService } from './services/notify.service';
import { prewarm } from './cache/prewarm';
import { CACHE_CONFIG, reportCache } from './cache/report-cache';
import { appDb } from './repositories/app-db';
import { importLegacyFiles } from './repositories/app-db-migrate';
import { presence } from './auth/presence';
import { sessionRevocation } from './auth/session-revocation';
import { systemStore } from './system/system-store';
import { appVersion } from './system/version';
import { systemScheduler } from './system/scheduler';
import { systemEvents } from './system/events';

const REPORT_DATA_SOURCE: 'mock' | 'hosxp' = 'mock';

let app: FastifyInstance | null = null;

/**
 * ฐาน data_dashboard: สร้างตารางที่ยังไม่มี + นำข้อมูลจากไฟล์เดิมเข้าครั้งแรก — คืนข้อความสถานะสำหรับสรุปตอนเริ่ม
 * ต่อไม่ได้ก็เปิดเซิร์ฟเวอร์ต่อ (หน้ารายงานใช้ได้ปกติ ส่วนแจ้งปัญหา/ประวัติการใช้งานจะแจ้ง error จนกว่าฐานกลับมา)
 */
async function prepareAppDb(): Promise<string> {
  if (!appDb.isConfigured()) return color.gray('ไม่ได้ตั้งค่า (DASHBOARD_DB_*) — เก็บเป็นไฟล์ใน backend/data');
  try {
    await appDb.ensureSchema();
    const imported = await importLegacyFiles();
    const total = imported.feedback + imported.audit + imported.archive;
    if (total) logger.info(`[db] นำข้อมูลจากไฟล์เดิมเข้าฐานแล้ว: แจ้งปัญหา ${imported.feedback} เรื่อง ${color.gray('·')} ประวัติการใช้งาน ${imported.audit.toLocaleString()} รายการ ${color.gray('·')} คลัง ${imported.archive.toLocaleString()} รายการ (ไฟล์เดิมเปลี่ยนชื่อเป็น .imported)`);
    await auditLog.flushPending();
    return color.green(`✔ เชื่อมต่อได้ (${appDb.target()})`);
  } catch (error) {
    return color.red(`✖ เชื่อมต่อไม่ได้ (${appDb.target()}) — ${(error as Error).message}`);
  }
}

async function printStartupSummary(host: string, port: number, restoredCache: number, appDbStatus: string) {
  let hosxp: string;
  if (!hosxpRepository.isConfigured()) {
    hosxp = color.yellow('✖ ยังไม่ได้ตั้งค่า (HOSXP_* ใน backend/.env) — login ไม่ได้');
  } else {
    const target = `${process.env.HOSXP_HOST}/${process.env.HOSXP_DATABASE}`;
    try {
      await hosxpRepository.ping();
      hosxp = color.green(`✔ เชื่อมต่อได้ (${target})`);
    } catch (error) {
      hosxp = color.red(`✖ เชื่อมต่อไม่ได้ (${target}) — ${(error as Error).message}`);
    }
  }

  const dot = color.gray('·');
  // ฐานล่มตอนเริ่ม ก็ยังพิมพ์สรุปได้ (แสดงว่าอ่านไม่ได้)
  const pending = await feedbackStore.list('new').then(list => list.length).catch(() => null);
  const audit = await auditLog.stats().catch(() => null);
  logger.info('');
  printBlock(`พร้อมใช้งาน ➜ http://${host}:${port}/api`, [
    ['เวอร์ชัน', `v${appVersion()}${systemStore.maintenance().on ? ` ${color.gray('·')} ${color.red('โหมดปิดปรับปรุง')}` : ''}`],
    ['HOSxP', hosxp],
    ['ข้อมูลรายงาน', REPORT_DATA_SOURCE === 'mock' ? color.yellow('ข้อมูลจำลอง (mock)') : color.green('HOSxP จริง')],
    ['Session', `หมดอายุเมื่อไม่ใช้งาน ${SESSION_IDLE_MINUTES} นาที`],
    ['เตรียมข้อมูล', `ทุก ${CACHE_CONFIG.prewarmMinutes} นาที ${dot} ใช้ผลที่พักไว้ ${CACHE_CONFIG.ttlTodayMinutes} นาที (อดีต ${CACHE_CONFIG.ttlPastHours} ชม.) ${dot} query พร้อมกันสูงสุด ${CACHE_CONFIG.maxConcurrent} ${dot} ${restoredCache ? color.green(`โหลดจากไฟล์ ${restoredCache} ชุด`) : 'เริ่มใหม่'}`],
    ['แจ้งเตือนมือถือ', notifyService.isConfigured() ? color.green(`✔ Telegram (${notifyService.targetCount()} ปลายทาง)`) : color.gray('ยังไม่ได้ตั้งค่า (TELEGRAM_* ใน backend/.env)')],
    ['ฐานข้อมูลระบบ', appDbStatus],
    ['แจ้งปัญหาค้าง', pending === null ? color.red('อ่านไม่ได้') : pending ? color.yellow(`${pending} เรื่อง`) : color.green('ไม่มี')],
    ['ประวัติการใช้งาน', audit === null ? color.red('อ่านไม่ได้') : `${audit.entries.toLocaleString()} รายการ ${dot} เก็บ ${AUDIT_KEEP_DAYS} วัน เก่ากว่านั้นย้ายเข้าคลัง`],
    ['พื้นที่ข้อมูล', dataUsage().text],
    ['เตือนเมื่อ', monitor.limitsText()],
  ]);
}

async function bootstrap() {
  app = await buildApp();

  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || '127.0.0.1';
  await app.listen({ port, host });
  const restored = prewarm.start();
  const appDbStatus = await prepareAppDb();
  // โหมดปิดปรับปรุง — รีสตาร์ทระหว่างปิดปรับปรุงแล้วยังปิดอยู่ (จนกว่าผู้ดูแลจะกดปิดโหมด)
  const maintenance = await systemStore.loadMaintenance().catch(() => systemStore.maintenance());
  if (maintenance.on) logger.warn(`[system] ระบบอยู่ในโหมดปิดปรับปรุง (เปิดโดย ${maintenance.by ?? '-'}) — ผู้ใช้ทั่วไปเข้าไม่ได้ ผู้ดูแลกดปิดได้ที่หน้า ประกาศ / ปิดปรับปรุง`);
  const closedPages = await systemStore.loadPageMaintenance().catch(() => systemStore.pageMaintenance());
  // ประกาศที่ตั้ง "เปิดโหมดปิดปรับปรุงอัตโนมัติ" — ตรวจเวลาทุก 30 วินาที
  systemScheduler.start();
  if (closedPages.pages.length) logger.warn(`[system] หน้าที่ปิดปรับปรุงอยู่: ${closedPages.pages.join(', ')} (ผู้ดูแลเปิดกลับได้ที่หน้า ประกาศ / ปิดปรับปรุง)`);
  await printStartupSummary(host, port, restored, appDbStatus);
  // ประวัติการใช้งานที่พักไว้ตอนฐานล่ม — ส่งเข้าฐานเมื่อกลับมา
  setInterval(() => { auditLog.flushPending().catch(() => undefined); }, 2 * 60_000).unref();
  // หน้า "ผู้ใช้งานระบบ": ครั้งแรกสร้างรายชื่อจากประวัติการใช้งาน · บันทึกสถานะออนไลน์ทุก 1 นาที
  // รายชื่อที่ถูกบังคับออกจากระบบ — ต้องโหลดก่อน ไม่งั้นบัตรเก่ากลับมาใช้ได้หลังรีสตาร์ท
  await sessionRevocation.load().catch(error => logger.warn(`[auth] โหลดรายการบังคับออกจากระบบไม่ได้ — ${(error as Error).message}`));
  presence.backfill()
    .then(n => { if (n) logger.info(`[presence] สร้างรายชื่อผู้ใช้งานจากประวัติการใช้งานแล้ว ${n} คน`); })
    .catch(error => logger.warn(`[presence] สร้างรายชื่อผู้ใช้งานไม่สำเร็จ — ${(error as Error).message}`));
  setInterval(() => { presence.flush().catch(() => undefined); }, 60_000).unref();
  hosxpRepository.startHealthCheck();
  // รูปแนบของเรื่องที่ดำเนินการแล้วครบ 90 วัน ลบทิ้ง (ข้อความของเรื่องยังเก็บไว้)
  const purgeImages = async () => {
    try {
      const purged = await feedbackStore.purgeOldImages();
      if (purged) logger.info(`[feedback] ลบรูปแนบที่ครบกำหนดเก็บ ${purged} เรื่อง`);
    } catch (error) {
      logger.warn(`[feedback] ลบรูปแนบตามกำหนดไม่สำเร็จ — ${(error as Error).message}`);
    }
  };
  // ประวัติการใช้งานเก่ากว่า AUDIT_KEEP_DAYS ย้ายเข้าคลัง (ไม่ลบ) — ส่วนหลักไม่โตเรื่อย ๆ
  const archiveAudit = async () => {
    try {
      const moved = await auditLog.archiveOld();
      if (moved) logger.info(`[audit] ย้ายประวัติการใช้งานที่เก่ากว่า ${AUDIT_KEEP_DAYS} วันเข้าคลัง ${moved.toLocaleString()} รายการ (${appDb.isConfigured() ? 'ตาราง audit_log_archive' : 'data/audit-archive'})`);
    } catch (error) {
      logger.warn(`[audit] ย้ายประวัติเข้าคลังไม่สำเร็จ — ${(error as Error).message}`);
    }
  };
  // login ผิดที่หมดอายุแล้ว (ใช้นับแค่ 5 นาที) ลบทิ้ง ตารางจะได้ไม่โต
  const cleanupLoginFailures = () => loginThrottle.cleanup().catch(() => 0);
  const daily = () => { void purgeImages().then(archiveAudit).then(cleanupLoginFailures); };
  setTimeout(daily, 30_000).unref();
  setInterval(daily, 24 * 3_600_000).unref();
  logger.addHourlyPart(() => ['การเชื่อมต่อสด', systemEvents.count() ? `${systemEvents.count()} หน้าเว็บ (เบราว์เซอร์)` : null]);
  logger.addHourlyPart(() => {
    const rate = reportCache.hitRate();
    return ['ข้อมูลพักไว้', rate === null ? null : `ใช้ผลที่พักไว้ ${rate}%`];
  });
  monitor.start();
  logger.startSummaries();
}

function explainStartupError(error: NodeJS.ErrnoException) {
  const port = process.env.PORT || 4000;
  if (error.code === 'EADDRINUSE') {
    logger.error(`พอร์ต ${port} ถูกใช้อยู่ — มี backend รันค้างอยู่แล้ว ปิดตัวเก่าก่อน (หรือเปลี่ยน PORT ใน backend/.env)`);
  } else if (error.code === 'EACCES') {
    logger.error(`ไม่มีสิทธิ์เปิดพอร์ต ${port} — ลองใช้พอร์ตอื่นใน backend/.env`);
  } else if (error.code === 'EADDRNOTAVAIL') {
    logger.error(`ไม่พบ HOST ${process.env.HOST} บนเครื่องนี้ — ตรวจค่า HOST ใน backend/.env`);
  } else {
    logger.error(`เริ่มเซิร์ฟเวอร์ไม่สำเร็จ: ${error.message}`, error);
  }
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(color.gray(`ได้รับ ${signal} — กำลังปิดเซิร์ฟเวอร์...`));
  setTimeout(() => process.exit(1), 5000).unref();
  try {
    systemEvents.closeAll(); // ช่องสัญญาณสดค้างอยู่ ปิดก่อน ไม่งั้นปิดเซิร์ฟเวอร์ค้าง
    await app?.close();
    prewarm.stop();
    await hosxpRepository.close();
    await presence.flush().catch(() => undefined);
    await appDb.close();
    logger.info(color.gray('ปิดเซิร์ฟเวอร์และการเชื่อมต่อฐานข้อมูลแล้ว'));
    process.exit(0);
  } catch (error) {
    logger.error('ปิดเซิร์ฟเวอร์ไม่สมบูรณ์', error);
    process.exit(1);
  }
}

monitor.installCrashHandlers();
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

bootstrap().catch(async (error: NodeJS.ErrnoException) => {
  explainStartupError(error);
  await hosxpRepository.close().catch(() => undefined);
  process.exit(1);
});
