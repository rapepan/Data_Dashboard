import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll } from 'vitest';

/**
 * ทุกไฟล์ทดสอบ: ใช้โฟลเดอร์ข้อมูลชั่วคราว (ไม่แตะ backend/data จริง) และปิดการส่ง Telegram
 * ตั้งค่าก่อน backend/.env ถูกโหลด — ค่าที่มีอยู่แล้วจะไม่ถูกทับ
 */
const dataDir = mkdtempSync(path.join(tmpdir(), 'bsth-test-'));
process.env.DATA_DIR = dataDir;
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_CHAT_ID = '';
process.env.APP_PUBLIC_URL = '';
process.env.AUTH_SECRET = 'test-secret-for-vitest-only';
process.env.NO_COLOR = '1';
// ไม่ใช้ฐาน data_dashboard จริง — ชุดทดสอบปกติเก็บเป็นไฟล์ในโฟลเดอร์ชั่วคราว (ชุดทดสอบฐานข้อมูลแยกไว้ที่ npm run test:db)
process.env.DASHBOARD_DB_HOST = '';
process.env.DASHBOARD_DB_DATABASE = '';

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});
