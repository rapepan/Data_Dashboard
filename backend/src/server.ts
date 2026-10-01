import './env';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { SESSION_IDLE_MINUTES } from './middleware/auth';
import { hosxpRepository } from './repositories/hosxp.repository';
import { AUDIT_KEEP_DAYS, auditLog } from './auth/audit-log';
import { feedbackStore } from './feedback/feedback-store';
import { color, logger, printBlock } from './utils/logger';
import { dataUsage, monitor } from './utils/monitor';
import { notifyService } from './services/notify.service';
import { prewarm } from './cache/prewarm';
import { CACHE_CONFIG, reportCache } from './cache/report-cache';

const REPORT_DATA_SOURCE: 'mock' | 'hosxp' = 'mock';

let app: FastifyInstance | null = null;

async function printStartupSummary(host: string, port: number, restoredCache: number) {
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

  const pending = feedbackStore.list('new').length;
  const audit = auditLog.stats();
  const dot = color.gray('·');
  logger.info('');
  printBlock(`พร้อมใช้งาน ➜ http://${host}:${port}/api`, [
    ['HOSxP', hosxp],
    ['ข้อมูลรายงาน', REPORT_DATA_SOURCE === 'mock' ? color.yellow('ข้อมูลจำลอง (mock)') : color.green('HOSxP จริง')],
    ['Session', `หมดอายุเมื่อไม่ใช้งาน ${SESSION_IDLE_MINUTES} นาที`],
    ['เตรียมข้อมูล', `ทุก ${CACHE_CONFIG.prewarmMinutes} นาที ${dot} ใช้ผลที่พักไว้ ${CACHE_CONFIG.ttlTodayMinutes} นาที (อดีต ${CACHE_CONFIG.ttlPastHours} ชม.) ${dot} query พร้อมกันสูงสุด ${CACHE_CONFIG.maxConcurrent} ${dot} ${restoredCache ? color.green(`โหลดจากไฟล์ ${restoredCache} ชุด`) : 'เริ่มใหม่'}`],
    ['แจ้งเตือนมือถือ', notifyService.isConfigured() ? color.green(`✔ Telegram (${notifyService.targetCount()} ปลายทาง)`) : color.gray('ยังไม่ได้ตั้งค่า (TELEGRAM_* ใน backend/.env)')],
    ['แจ้งปัญหาค้าง', pending ? color.yellow(`${pending} เรื่อง`) : color.green('ไม่มี')],
    ['ประวัติการใช้งาน', `${audit.entries.toLocaleString()} รายการ ${dot} เก็บในไฟล์หลัก ${AUDIT_KEEP_DAYS} วัน เก่ากว่านั้นย้ายเข้าคลัง`],
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
  await printStartupSummary(host, port, restored);
  hosxpRepository.startHealthCheck();
  // รูปแนบของเรื่องที่ดำเนินการแล้วครบ 90 วัน ลบทิ้ง (ข้อความของเรื่องยังเก็บไว้)
  const purgeImages = () => {
    const purged = feedbackStore.purgeOldImages();
    if (purged) logger.info(`[feedback] ลบรูปแนบที่ครบกำหนดเก็บ ${purged} เรื่อง`);
  };
  // ประวัติการใช้งานเก่ากว่า AUDIT_KEEP_DAYS ย้ายเข้าคลังรายเดือน (ไม่ลบ) — ไฟล์หลักไม่โตเรื่อย ๆ
  const archiveAudit = () => {
    try {
      const moved = auditLog.archiveOld();
      if (moved) logger.info(`[audit] ย้ายประวัติการใช้งานที่เก่ากว่า ${AUDIT_KEEP_DAYS} วันเข้าคลัง ${moved.toLocaleString()} รายการ (data/audit-archive)`);
    } catch (error) {
      logger.warn(`[audit] ย้ายประวัติเข้าคลังไม่สำเร็จ — ${(error as Error).message}`);
    }
  };
  setTimeout(() => { purgeImages(); archiveAudit(); }, 30_000).unref();
  setInterval(() => { purgeImages(); archiveAudit(); }, 24 * 3_600_000).unref();
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
    await app?.close();
    prewarm.stop();
    await hosxpRepository.close();
    logger.info(color.gray('ปิดเซิร์ฟเวอร์และการเชื่อมต่อ HOSxP แล้ว'));
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
