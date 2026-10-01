import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parseEnv } from 'node:util';
import { afterAll } from 'vitest';

/**
 * ชุดทดสอบฐานข้อมูล: ใช้ค่าเชื่อมต่อ DASHBOARD_DB_* จาก backend/.env แต่ใช้ตารางชื่อขึ้นต้น zz_test_
 * ไฟล์ (รูป / ไฟล์พักรายการ) อยู่ในโฟลเดอร์ชั่วคราว · ปิด Telegram
 */
const env = parseEnv(readFileSync(path.resolve(__dirname, '../.env'), 'utf8'));
for (const key of ['DASHBOARD_DB_HOST', 'DASHBOARD_DB_PORT', 'DASHBOARD_DB_USER', 'DASHBOARD_DB_PASSWORD', 'DASHBOARD_DB_DATABASE']) {
  process.env[key] = env[key] ?? '';
}
process.env.DASHBOARD_DB_TABLE_PREFIX = 'zz_test_';

const dataDir = mkdtempSync(path.join(tmpdir(), 'bsth-dbtest-'));
process.env.DATA_DIR = dataDir;
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_CHAT_ID = '';
process.env.NO_COLOR = '1';

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});
