import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { notifyService } from '../services/notify.service';
import { logger } from '../utils/logger';
import { DATA_DIR } from '../utils/paths';
import { systemEvents } from './events';

/**
 * ปุ่ม "รีสตาร์ทระบบ" (หน้า ประกาศ / ปิดปรับปรุง) — backend ปิดตัวเองแบบนุ่มนวล แล้วตัวดูแล (systemd) เปิดใหม่ให้
 * - ใช้ได้เฉพาะเมื่อมีตัวเปิดใหม่: systemd ตั้ง INVOCATION_ID ให้ทุกครั้ง · ตัวดูแลอื่น (เช่น pm2 / ทดสอบ) ตั้ง RESTART_SUPERVISED=1
 *   ไม่มี = ไม่ปิดเด็ดขาด (ปิดแล้วไม่มีใครเปิดกลับ ระบบจะดับไปเฉย ๆ)
 * - ก่อนปิด: เขียนไฟล์บอกว่าใครสั่ง → ตัวใหม่อ่านตอนเปิด แจ้ง Telegram ว่ากลับมาแล้วใช้เวลาเท่าไร และจำไว้แสดงในหน้าผู้ดูแล
 */
const REQUEST_FILE = path.join(DATA_DIR, 'restart-request.json');
const LAST_FILE = path.join(DATA_DIR, 'restart-last.json');
/** กันกดซ้ำ */
const COOLDOWN_MS = 60_000;
/** รอให้ข้อความ "กำลังเริ่มใหม่" ถึงหน้าเว็บ + ตอบกลับคำสั่งก่อนค่อยปิด */
const CLOSE_DELAY_MS = 1_000;
/** ไฟล์คำสั่งเก่ากว่านี้ = ไม่ใช่รอบนี้ (เช่น ปิดค้างแล้วมาเปิดทีหลัง) — ไม่นับเวลากลับมา */
const STALE_MS = 10 * 60_000;

export interface RestartRecord {
  by: string;
  name: string;
  reason: string;
  /** สั่งเมื่อไร (ISO) */
  requestedAt: string;
  /** ตัวใหม่เปิดเสร็จเมื่อไร (ISO) — null = ไม่รู้ (ไฟล์คำสั่งเก่าเกิน) */
  backAt: string | null;
}

const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
let last: RestartRecord | null = null;
let lastRequestAt = 0;
let pending = false;
let shutdownHandler: ((reason: string) => void) | null = null;

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const thaiTime = (t: number) => new Date(t).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });

function readJson<T>(file: string): T | null {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : null; } catch { return null; }
}

export const systemRestart = {
  /** มีตัวดูแลที่จะเปิด backend กลับมาไหม */
  supported() {
    return Boolean(process.env.INVOCATION_ID) || process.env.RESTART_SUPERVISED === '1';
  },

  /** server.ts ส่งขั้นตอนปิดแบบนุ่มนวล (ตัวเดียวกับ SIGTERM) มาให้ */
  onShutdown(handler: (reason: string) => void) {
    shutdownHandler = handler;
  },

  info() {
    return { supported: this.supported(), pending, startedAt, last };
  },

  /** ตอนเปิด: ถ้ารอบก่อนปิดเพราะปุ่มรีสตาร์ท → จำไว้ + แจ้ง Telegram ว่ากลับมาแล้ว */
  loadOnStartup(now = Date.now()) {
    last = readJson<RestartRecord>(LAST_FILE);
    const request = readJson<Omit<RestartRecord, 'backAt'>>(REQUEST_FILE);
    if (!request) return;
    try { rmSync(REQUEST_FILE, { force: true }); } catch { /* ไม่เป็นไร */ }
    const asked = Date.parse(request.requestedAt);
    const fresh = Number.isFinite(asked) && now - asked < STALE_MS;
    last = { ...request, backAt: fresh ? new Date(now).toISOString() : null };
    try { writeFileSync(LAST_FILE, JSON.stringify(last)); } catch { /* แสดงไม่ได้หลังรีสตาร์ทรอบหน้า — ไม่เป็นไร */ }
    if (fresh) {
      const seconds = Math.max(1, Math.round((now - asked) / 1000));
      logger.info(`[system] เปิดกลับมาแล้วหลังรีสตาร์ทโดย ${request.by} (${seconds} วินาที)`);
      notifyService.alert(`✅ <b>DATA BSTH: รีสตาร์ทเสร็จ ระบบกลับมาใช้งานได้แล้ว</b>\nใช้เวลา ${seconds} วินาที · ${thaiTime(now)} น.`);
    }
  },

  /** ผู้ดูแลกดรีสตาร์ท — คืนข้อความ error หรือ null (ตอบกลับก่อน แล้วค่อยปิดใน 1 วินาที) */
  request(user: { loginname: string; name: string }, reason: string, now = Date.now()): string | null {
    if (!this.supported()) return 'รีสตาร์ทจากหน้าเว็บได้เฉพาะเมื่อรันด้วย systemd บนเครื่องจริง — เครื่องนี้ไม่มีตัวเปิดระบบกลับให้';
    if (!shutdownHandler) return 'ระบบยังเริ่มทำงานไม่เสร็จ กรุณาลองใหม่อีกครั้ง';
    if (pending) return 'กำลังรีสตาร์ทอยู่แล้ว';
    if (now - lastRequestAt < COOLDOWN_MS) return 'เพิ่งสั่งรีสตาร์ทไป กรุณารอ 1 นาทีแล้วลองใหม่';
    lastRequestAt = now;
    pending = true;

    const record = { by: user.loginname, name: user.name, reason, requestedAt: new Date(now).toISOString() };
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(REQUEST_FILE, JSON.stringify(record));
    } catch (error) {
      logger.warn(`[system] เขียนไฟล์คำสั่งรีสตาร์ทไม่ได้ — ${(error as Error).message} (ยังรีสตาร์ทต่อ แต่ตัวใหม่จะไม่รู้ว่าใครสั่ง)`);
    }
    logger.warn(`[system] ผู้ดูแล ${user.loginname} สั่งรีสตาร์ทระบบ${reason ? ` — ${reason}` : ''}`);
    notifyService.alert(`🔄 <b>DATA BSTH: ผู้ดูแลสั่งรีสตาร์ทระบบ</b>\nโดย ${esc(user.name || user.loginname)} (${esc(user.loginname)}) · ${thaiTime(now)} น.${reason ? `\nเหตุผล: ${esc(reason)}` : ''}`);
    systemEvents.restarting();
    const handler = shutdownHandler;
    setTimeout(() => handler(`รีสตาร์ทโดย ${user.loginname}`), CLOSE_DELAY_MS).unref();
    return null;
  },

  /** สำหรับชุดทดสอบ */
  _reset() {
    last = null; lastRequestAt = 0; pending = false; shutdownHandler = null;
  },
};
