import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { appDb } from '../repositories/app-db';
import { hosxpRepository } from '../repositories/hosxp.repository';
import { notifyService } from '../services/notify.service';
import { logger } from '../utils/logger';
import { DATA_DIR } from '../utils/paths';

/**
 * เฝ้าระบบแล้วแจ้งผู้ดูแลทาง Telegram (TELEGRAM_ALERT_CHAT_ID หรือ TELEGRAM_CHAT_ID)
 * - HOSxP / ฐาน data_dashboard ต่อไม่ได้ติดกันเกิน ALERT_DOWN_MINUTES (ค่าเริ่มต้น 5) → แจ้ง · กลับมาแล้วแจ้งอีกครั้ง (บอกว่าล่มนานเท่าไร)
 *   ล่มสั้น ๆ ไม่ถึงเกณฑ์ไม่แจ้ง (กันแจ้งพร่ำเพรื่อตอนเครือข่ายสะดุด)
 * - backend ดับโดยไม่ได้ตั้งใจ (crash / เครื่องดับ) แล้วเปิดกลับมา → แจ้งตอนเปิด
 * - backend ล่มทั้งตัว แจ้งเองไม่ได้ — ใช้ deploy/scripts/watchdog.sh (cron บน server) แทน
 */
const CHECK_MS = 60_000;
const DOWN_MS = (Number(process.env.ALERT_DOWN_MINUTES) || 5) * 60_000;
const MARKER = path.join(DATA_DIR, '.backend-running');

interface Target { label: string; ping: () => Promise<unknown>; downSince: number | null; alerted: boolean; error: string }

const targets: Target[] = [];
let timer: NodeJS.Timeout | null = null;

const thaiTime = (t: number) => new Date(t).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function duration(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 60 ? `${min} นาที` : `${Math.floor(min / 60)} ชม. ${min % 60} นาที`;
}

/** ตรวจ 1 รอบ — now ส่งเข้ามาได้ (ใช้ในชุดทดสอบ) */
async function check(target: Target, now = Date.now()) {
  try {
    await target.ping();
    if (target.downSince !== null) {
      if (target.alerted) {
        notifyService.alert(`✅ <b>DATA BSTH: ${target.label} กลับมาใช้งานได้แล้ว</b>\nล่มไป ${duration(now - target.downSince)} (ตั้งแต่ ${thaiTime(target.downSince)} น.)`);
        logger.info(`[watchdog] ${target.label} กลับมาแล้ว — แจ้งผู้ดูแลแล้ว`);
      }
      target.downSince = null;
      target.alerted = false;
    }
  } catch (error) {
    target.error = (error as Error).message;
    target.downSince ??= now;
    if (!target.alerted && now - target.downSince >= DOWN_MS) {
      target.alerted = true;
      notifyService.alert(`🔴 <b>DATA BSTH: ต่อ ${target.label} ไม่ได้</b>\nตั้งแต่ ${thaiTime(target.downSince)} น. (${duration(now - target.downSince)})\nสาเหตุ: <code>${esc(target.error.slice(0, 200))}</code>\nจะแจ้งอีกครั้งเมื่อกลับมาใช้งานได้`);
      logger.warn(`[watchdog] ${target.label} ล่มเกิน ${DOWN_MS / 60_000} นาที — แจ้งผู้ดูแลแล้ว`);
    }
  }
}

export const watchdog = {
  start() {
    const production = process.env.NODE_ENV === 'production';
    // เครื่องพัฒนา: แจ้งฐานข้อมูลล่มเฉพาะเมื่อตั้ง ALERT_IN_DEV=1 (เช่น เปิดให้คนอื่นเทสผ่าน Forward port)
    if (!production && process.env.ALERT_IN_DEV !== '1') return;
    if (hosxpRepository.isConfigured()) targets.push({ label: 'HOSxP', ping: () => hosxpRepository.ping(), downSince: null, alerted: false, error: '' });
    if (appDb.isConfigured()) targets.push({ label: 'ฐาน data_dashboard', ping: () => appDb.ping(), downSince: null, alerted: false, error: '' });
    timer = setInterval(() => { for (const t of targets) void check(t); }, CHECK_MS);
    timer.unref();

    // ไฟล์บอกว่ากำลังทำงาน — ยังอยู่ตอนเปิด = รอบก่อนไม่ได้ปิดตามปกติ (crash / เครื่องดับ / ถูก kill)
    // เฉพาะเครื่องจริง — เครื่องพัฒนา backend ถูกรีสตาร์ทเองทุกครั้งที่แก้โค้ด จะแจ้งเข้ากลุ่มทุกครั้ง
    if (!production) return;
    try {
      if (existsSync(MARKER)) {
        const since = Number(readFileSync(MARKER, 'utf8')) || null;
        notifyService.alert(`⚠️ <b>DATA BSTH: backend เปิดใหม่หลังดับโดยไม่ได้ตั้งใจ</b>\n${since ? `ทำงานล่าสุดตั้งแต่ ${thaiTime(since)} น. · ` : ''}เปิดกลับมาเมื่อ ${thaiTime(Date.now())} น.\nดูสาเหตุ: journalctl -u bsth-dashboard --since "1 hour ago"`);
        logger.warn('[watchdog] รอบก่อน backend ไม่ได้ปิดตามปกติ — แจ้งผู้ดูแลแล้ว');
      }
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(MARKER, String(Date.now()));
    } catch { /* เขียนไม่ได้ไม่เป็นไร — แค่ไม่รู้ว่าดับไม่ปกติ */ }
  },

  /** ปิดตามปกติ (SIGTERM / SIGINT) — ลบไฟล์บอกสถานะ รอบหน้าจะไม่แจ้ง */
  stop() {
    if (timer) clearInterval(timer);
    try { rmSync(MARKER, { force: true }); } catch { /* ไม่เป็นไร */ }
  },

  /** สำหรับชุดทดสอบ */
  _check: check,
};
