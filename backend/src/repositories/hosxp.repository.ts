import crypto from 'node:crypto';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.HOSXP_HOST,
      port: Number(process.env.HOSXP_PORT || 3306),
      user: process.env.HOSXP_USER,
      password: process.env.HOSXP_PASSWORD,
      database: process.env.HOSXP_DATABASE,
      connectionLimit: 3,
      connectTimeout: 5000,
      charset: process.env.HOSXP_DB_CHARSET || 'utf8mb4',
    });
  }
  return pool;
}

/* ---------- สถานะการเชื่อมต่อ (ข้อ 6) — แจ้งในเทอร์มินัลเฉพาะตอนเปลี่ยนสถานะ ไม่พิมพ์ซ้ำทุกครั้งที่ล้ม ---------- */
let connected: boolean | null = null;

/** error ที่แปลว่า ต่อฐานข้อมูลไม่ได้ (ไม่ใช่ SQL ผิด) */
const CONNECTION_ERRORS = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_CON_COUNT_ERROR']);

function markConnection(up: boolean, error?: unknown) {
  if (connected === up) return;
  const wasKnown = connected !== null;
  connected = up;
  if (up) {
    if (wasKnown) logger.hosxpStatus(true, 'เชื่อมต่อ HOSxP กลับมาได้แล้ว');
  } else {
    logger.hosxpStatus(false, `การเชื่อมต่อ HOSxP ขาด — ${(error as Error)?.message ?? 'ไม่ทราบสาเหตุ'}`);
  }
}

/** ทุก query ผ่านตรงนี้: จับเวลา (ข้อ 5) + ติดตามสถานะการเชื่อมต่อ (ข้อ 6) — label ห้ามมีค่าที่ผู้ใช้กรอก */
async function timedQuery<T extends RowDataPacket[]>(label: string, sql: string, params: unknown[] = []): Promise<T> {
  const started = performance.now();
  try {
    const [rows] = await getPool().query<T>(sql, params);
    markConnection(true);
    logger.query(label, Math.round(performance.now() - started), rows.length);
    return rows;
  } catch (error) {
    if (CONNECTION_ERRORS.has((error as { code?: string }).code ?? '')) markConnection(false, error);
    else logger.error(`[hosxp] query ล้มเหลว · ${label} — ${(error as Error).message}`);
    throw error;
  }
}

interface OpduserRow extends RowDataPacket {
  loginname: string;
  name: string | null;
  groupname: string | null;
  passweb: string | null;
  account_disable: string | null;
  department?: string | null;
  entryposition?: string | null;
}

export interface OpduserInfo {
  loginname: string;
  name: string;
  groupname: string;
  /** หน่วยงาน / ตำแหน่ง — opduser.department (ส่วนใหญ่ว่าง) ถ้าไม่มีใช้ entryposition */
  position: string;
}

function md5(input: string) {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex');
}

function isDisabled(row: OpduserRow) {
  return (row.account_disable ?? '').trim().toUpperCase() === 'Y';
}

function toInfo(row: OpduserRow): OpduserInfo {
  return {
    loginname: row.loginname,
    name: row.name?.trim() || row.loginname,
    groupname: row.groupname?.trim() ?? '',
    position: row.department?.trim() || row.entryposition?.trim() || '',
  };
}

export const hosxpRepository = {
  isConfigured(): boolean {
    return Boolean(process.env.HOSXP_HOST && process.env.HOSXP_USER && process.env.HOSXP_DATABASE);
  },

  /** ทดสอบการเชื่อมต่อ (SELECT 1) — ใช้ตอนเริ่มเซิร์ฟเวอร์ */
  async ping(): Promise<void> {
    try {
      await getPool().query('SELECT 1');
      markConnection(true);
    } catch (error) {
      markConnection(false, error);
      throw error;
    }
  },

  /** ตรวจการเชื่อมต่อทุก 5 นาที แม้ไม่มีคนใช้งาน — รู้ทันทีเมื่อ HOSxP ล่ม/กลับมา (SELECT 1 อ่านอย่างเดียว) */
  startHealthCheck() {
    const timer = setInterval(() => { this.ping().catch(() => undefined); }, 5 * 60 * 1000);
    timer.unref();
  },

  /** ปิด connection ที่เปิดค้างไว้ทั้งหมด — เรียกตอนปิดเซิร์ฟเวอร์ */
  async close(): Promise<void> {
    if (!pool) return;
    const current = pool;
    pool = null;
    await current.end();
  },

  async verifyOpduser(loginname: string, password: string): Promise<OpduserInfo | null> {
    const rows = await timedQuery<OpduserRow[]>(
      'opduser · ตรวจรหัสผ่าน (login)',
      'SELECT loginname, name, groupname, passweb, account_disable, department, entryposition FROM opduser WHERE loginname = ? LIMIT 1',
      [loginname],
    );
    const row = rows[0];
    if (!row?.passweb || isDisabled(row)) return null;
    if (row.loginname !== loginname) return null;
    return md5(password) === row.passweb.trim().toLowerCase() ? toInfo(row) : null;
  },

  /** ชื่อ/กลุ่ม/ตำแหน่งของหลายบัญชี (อ่านอย่างเดียว) — ใช้เติมชื่อในหน้า "ผู้ใช้งานระบบ" ให้คนที่เคย login ก่อนมีหน้านี้ */
  async findOpdusers(loginnames: string[]): Promise<OpduserInfo[]> {
    if (loginnames.length === 0) return [];
    const rows = await timedQuery<OpduserRow[]>(
      'opduser · ชื่อผู้ใช้หลายคน',
      'SELECT loginname, name, groupname, department, entryposition FROM opduser WHERE loginname IN (?)',
      [loginnames],
    );
    return rows.map(toInfo);
  },

  async findActiveOpduser(loginname: string): Promise<OpduserInfo | null> {
    const rows = await timedQuery<OpduserRow[]>(
      'opduser · หาผู้ใช้',
      'SELECT loginname, name, groupname, account_disable, department, entryposition FROM opduser WHERE loginname = ? LIMIT 1',
      [loginname],
    );
    const row = rows[0];
    return row && row.loginname === loginname && !isDisabled(row) ? toInfo(row) : null;
  },

  async listActiveByGroup(groupname: string): Promise<OpduserInfo[]> {
    const rows = await timedQuery<OpduserRow[]>(
      'opduser · รายชื่อตามกลุ่ม',
      "SELECT loginname, name, groupname, account_disable FROM opduser WHERE COALESCE(account_disable, '') <> 'Y'",
    );
    return rows
      .map(toInfo)
      .filter(info => info.groupname === groupname)
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  },
};
