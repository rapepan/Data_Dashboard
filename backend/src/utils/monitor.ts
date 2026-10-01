import { existsSync, readdirSync, statSync } from 'node:fs';
import { freemem, totalmem } from 'node:os';
import * as path from 'node:path';
import { DATA_DIR } from './paths';
import { color, logger } from './logger';

/**
 * เฝ้าระวังเซิร์ฟเวอร์ — error ที่หลุด, RAM, พื้นที่ข้อมูลใน backend/data
 * ค่าเตือนปรับได้ใน backend/.env:  MEM_WARN_MB (1024) · MEM_FREE_WARN_PCT (5) · DATA_WARN_MB (500) · LOG_IP_RATE_PER_MIN (300)
 */
const MEM_WARN_MB = Number(process.env.MEM_WARN_MB) || 1024;
const SYSTEM_FREE_WARN_PCT = Number(process.env.MEM_FREE_WARN_PCT) || 5;
const DATA_WARN_MB = Number(process.env.DATA_WARN_MB) || 500;

const MB = 1024 * 1024;
const toMb = (bytes: number) => (bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0);

/** ขนาดไฟล์/โฟลเดอร์ (รวมโฟลเดอร์ย่อย) */
function sizeOf(target: string): number {
  if (!existsSync(target)) return 0;
  const stat = statSync(target);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(target).reduce((sum, name) => sum + sizeOf(path.join(target, name)), 0);
}

export function dataUsage() {
  const audit = sizeOf(path.join(DATA_DIR, 'audit-log.jsonl'));
  const uploads = sizeOf(path.join(DATA_DIR, 'feedback-uploads'));
  const cache = sizeOf(path.join(DATA_DIR, 'report-cache.json'));
  const total = sizeOf(DATA_DIR);
  return { total, text: `รวม ${toMb(total)} MB (ประวัติการใช้งาน ${toMb(audit)} ${color.gray('·')} รูปแนบ ${toMb(uploads)} ${color.gray('·')} ข้อมูลพักไว้ ${toMb(cache)})` };
}

/** "3 วัน 4 ชม." / "2 ชม. 15 นาที" / "12 นาที" */
function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} วัน ${h} ชม.`;
  if (h) return `${h} ชม. ${m} นาที`;
  return `${m} นาที`;
}

function memoryText() {
  const rss = process.memoryUsage().rss;
  const freePct = Math.round((freemem() / totalmem()) * 100);
  const free = freePct < SYSTEM_FREE_WARN_PCT ? color.yellow(`เครื่องเหลือ ${freePct}%`) : `เครื่องเหลือ ${freePct}%`;
  const used = rss / MB > MEM_WARN_MB ? color.yellow(`${toMb(rss)} MB`) : `${toMb(rss)} MB`;
  return `RAM ใช้ ${used} ${color.gray('·')} ${free} ${color.gray('·')} รันมาแล้ว ${formatUptime(process.uptime())}`;
}

let lastMemWarn = 0;
let lastSystemWarn = 0;
let lastDataWarn = 0;

function checkMemory() {
  const now = Date.now();
  const rssMb = process.memoryUsage().rss / MB;
  // เตือนซ้ำได้ทุก 30 นาที
  if (rssMb > MEM_WARN_MB && now - lastMemWarn > 30 * 60_000) {
    lastMemWarn = now;
    logger.watch(`backend ใช้ RAM ${rssMb.toFixed(0)} MB (เกิน ${MEM_WARN_MB} MB) — ถ้าสูงขึ้นเรื่อย ๆ ให้ปิดแล้วเปิด backend ใหม่`);
  }
  const freePct = (freemem() / totalmem()) * 100;
  if (freePct < SYSTEM_FREE_WARN_PCT && now - lastSystemWarn > 30 * 60_000) {
    lastSystemWarn = now;
    logger.watch(`RAM ของเครื่องเหลือ ${freePct.toFixed(0)}% (${toMb(freemem())} MB) — เครื่องอาจช้าลง ลองปิดโปรแกรมที่ไม่ใช้`);
  }
}

function checkData() {
  const now = Date.now();
  const usage = dataUsage();
  // เตือนวันละครั้ง
  if (usage.total / MB > DATA_WARN_MB && now - lastDataWarn > 24 * 3_600_000) {
    lastDataWarn = now;
    logger.watch(`พื้นที่ข้อมูล backend/data เกิน ${DATA_WARN_MB} MB — ${usage.text}`);
  }
}

export const monitor = {
  /** error ที่ไม่มีจุดไหนดักไว้ — พิมพ์สาเหตุให้เห็นแทนการดับเงียบ */
  installCrashHandlers() {
    process.on('unhandledRejection', reason => {
      logger.crash('Promise ล้มโดยไม่มีที่ดัก error (unhandledRejection)', reason, false);
    });
    process.on('uncaughtException', (error, origin) => {
      // สถานะโปรแกรมอาจเสียไปแล้ว ทำงานต่อไม่ปลอดภัย — พิมพ์สาเหตุแล้วปิด
      logger.crash(`error ที่ไม่ได้ดักไว้ (${origin})`, error, true);
      setTimeout(() => process.exit(1), 200).unref();
    });
  },

  /** ตรวจ RAM ทุกนาที · พื้นที่ข้อมูลทุกชั่วโมง + ใส่ข้อมูลลงสรุปรายชั่วโมง/รายวัน */
  start() {
    setInterval(checkMemory, 60_000).unref();
    setInterval(checkData, 3_600_000).unref();
    setTimeout(checkData, 60_000).unref();
    logger.addHourlyPart(() => ['เซิร์ฟเวอร์', memoryText()]);
    logger.addDailyPart(() => ['พื้นที่ข้อมูล', dataUsage().text]);
  },

  limitsText() {
    return `RAM เกิน ${MEM_WARN_MB} MB ${color.gray('·')} ข้อมูลเกิน ${DATA_WARN_MB} MB ${color.gray('·')} IP เดียวเกิน ${Number(process.env.LOG_IP_RATE_PER_MIN) || 300} request/นาที`;
  },
};
