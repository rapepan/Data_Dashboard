/**
 * ตรวจความพร้อมของเครื่อง server ก่อน/หลังติดตั้ง — npm run check:connections (โฟลเดอร์ backend)
 * - อ่านอย่างเดียว: HOSxP ใช้แค่ SELECT (session READ ONLY) · ฐาน data_dashboard แค่ดูรายชื่อตาราง
 * - ไม่ส่ง Telegram / ไม่เขียนข้อมูลใด ๆ (ยกเว้นไฟล์ทดสอบชั่วคราวในโฟลเดอร์ data แล้วลบทันที)
 * ผ่านทุกข้อ → exit 0 · มีข้อไม่ผ่าน → exit 1
 */
import '../src/env';
import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import mysql from 'mysql2/promise';
import { DATA_DIR } from '../src/utils/paths';

const DEV_SECRET = 'bsth-dev-secret-do-not-use-in-production';
let failed = 0;
const ok = (label: string, detail = '') => console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ''}`);
const warn = (label: string, detail: string) => console.log(`  ! ${label} — ${detail}`);
const fail = (label: string, detail: string) => { failed++; console.log(`  ✘ ${label} — ${detail}`); };

async function checkDb(label: string, opts: mysql.ConnectionOptions, run: (conn: mysql.Connection) => Promise<string>) {
  if (!opts.host || !opts.database) return fail(label, 'ยังไม่ได้ตั้งค่าใน backend/.env');
  const started = Date.now();
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({ ...opts, connectTimeout: 5000 });
    const detail = await run(conn);
    ok(label, `${opts.host}/${opts.database} · ${detail} · ${Date.now() - started} ms`);
  } catch (error) {
    const e = error as { code?: string; message: string };
    const hint = e.code === 'ETIMEDOUT' || e.code === 'EHOSTUNREACH' ? ' (ต่อเครื่องไม่ถึง — ตรวจ firewall / เครือข่ายระหว่าง server กับฐานข้อมูล)'
      : e.code === 'ER_ACCESS_DENIED_ERROR' ? ' (ชื่อผู้ใช้/รหัสผ่านผิด หรือบัญชีไม่อนุญาตให้ต่อจาก IP ของ server นี้)'
        : e.code === 'ECONNREFUSED' ? ' (เครื่องปลายทางไม่เปิดพอร์ตนี้)' : '';
    fail(label, `${opts.host}/${opts.database} · ${e.code ?? ''} ${e.message}${hint}`);
  } finally {
    await conn?.end().catch(() => undefined);
  }
}

async function main() {
  console.log('\nตรวจความพร้อมของเครื่อง\n');

  // เครื่อง
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 22) ok('Node.js', `v${process.versions.node}`); else fail('Node.js', `v${process.versions.node} — ต้องเป็น v22 ขึ้นไป (แนะนำ v24)`);
  const offset = -new Date().getTimezoneOffset() / 60;
  if (offset === 7) ok('เวลา', `${new Date().toLocaleString('th-TH', { hour12: false })} (UTC+7)`);
  else fail('เวลา', `ระบบใช้ UTC${offset >= 0 ? '+' : ''}${offset} — ต้องเป็นเวลาไทย (ตั้ง TZ=Asia/Bangkok)`);

  // ค่าตั้ง
  const secret = process.env.AUTH_SECRET ?? '';
  if (!secret || secret === DEV_SECRET) fail('AUTH_SECRET', 'ยังไม่ได้ตั้ง — สุ่มด้วย: openssl rand -hex 32');
  else if (secret.length < 32) warn('AUTH_SECRET', `สั้นเกินไป (${secret.length} ตัว) ควรยาว 32 ตัวขึ้นไป`);
  else ok('AUTH_SECRET', `ตั้งแล้ว (${secret.length} ตัว)`);
  if (process.env.NODE_ENV === 'production') ok('NODE_ENV', 'production'); else warn('NODE_ENV', `${process.env.NODE_ENV || '(ว่าง)'} — บนเครื่องจริงควรเป็น production`);
  if (process.env.COOKIE_SECURE === 'true') ok('COOKIE_SECURE', 'true (เปิดผ่าน https)');
  else warn('COOKIE_SECURE', 'false — ใช้ได้ถ้าเปิดเว็บผ่าน http ภายในโรงพยาบาล · ถ้าเปิดผ่าน https ให้ตั้งเป็น true');

  // โฟลเดอร์ข้อมูล
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, `.write-test-${process.pid}`);
    writeFileSync(probe, 'ok');
    rmSync(probe);
    accessSync(DATA_DIR, constants.W_OK);
    ok('โฟลเดอร์ข้อมูล', `${DATA_DIR} (เขียนได้)`);
  } catch (error) {
    fail('โฟลเดอร์ข้อมูล', `${DATA_DIR} เขียนไม่ได้ — ${(error as Error).message} (ตรวจเจ้าของโฟลเดอร์ให้ตรงกับบัญชีที่รัน backend)`);
  }

  // ฐานข้อมูล
  await checkDb('HOSxP (อ่านอย่างเดียว)', {
    host: process.env.HOSXP_HOST, port: Number(process.env.HOSXP_PORT || 3306),
    user: process.env.HOSXP_USER, password: process.env.HOSXP_PASSWORD, database: process.env.HOSXP_DATABASE,
    charset: process.env.HOSXP_DB_CHARSET || 'utf8mb4',
  }, async conn => {
    await conn.query('SET SESSION TRANSACTION READ ONLY');
    const [[v]] = await conn.query<mysql.RowDataPacket[]>('SELECT VERSION() AS v');
    const [[u]] = await conn.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM opduser');
    return `MySQL ${v.v} · ตาราง opduser อ่านได้ (${Number(u.n).toLocaleString('en-US')} บัญชี)`;
  });

  if (process.env.DASHBOARD_DB_HOST) {
    await checkDb('ฐาน data_dashboard', {
      host: process.env.DASHBOARD_DB_HOST, port: Number(process.env.DASHBOARD_DB_PORT || 3306),
      user: process.env.DASHBOARD_DB_USER, password: process.env.DASHBOARD_DB_PASSWORD, database: process.env.DASHBOARD_DB_DATABASE,
      charset: 'utf8mb4',
    }, async conn => {
      const [[v]] = await conn.query<mysql.RowDataPacket[]>('SELECT VERSION() AS v');
      const [tables] = await conn.query<mysql.RowDataPacket[]>('SHOW TABLES');
      return `MariaDB/MySQL ${v.v} · ${tables.length} ตาราง`;
    });
  } else {
    warn('ฐาน data_dashboard', 'ไม่ได้ตั้งค่า — ระบบจะเก็บข้อมูลเป็นไฟล์ในโฟลเดอร์ข้อมูลแทน');
  }

  console.log(failed ? `\n✘ ไม่ผ่าน ${failed} ข้อ — แก้ตามข้อความด้านบนแล้วรันใหม่\n` : '\n✔ พร้อมใช้งาน\n');
  process.exit(failed ? 1 : 0);
}

void main();
