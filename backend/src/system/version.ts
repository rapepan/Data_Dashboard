import { readFileSync } from 'node:fs';
import * as path from 'node:path';

/**
 * เลขเวอร์ชันระบบ — จุดเดียวคือ "version" ใน package.json ที่โฟลเดอร์หลัก (หน้าเว็บอ่านจากไฟล์เดียวกันตอน build)
 * อ่านใหม่ทุก 30 วินาที: แก้เลขเวอร์ชันแล้ว backend บอกหน้าเว็บที่เปิดค้างไว้ได้โดยไม่ต้องรีสตาร์ท
 */
const ROOT_PACKAGE = path.resolve(__dirname, '../../../package.json');
let cached: { at: number; version: string } | null = null;

export function appVersion(): string {
  if (cached && Date.now() - cached.at < 30_000) return cached.version;
  let version = '0.0.0';
  try { version = String((JSON.parse(readFileSync(ROOT_PACKAGE, 'utf8')) as { version?: string }).version ?? version); } catch { /* อ่านไม่ได้ใช้ค่าเดิม */ }
  cached = { at: Date.now(), version };
  return version;
}
