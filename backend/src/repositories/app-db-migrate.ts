import { existsSync, readdirSync, renameSync } from 'node:fs';
import * as path from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { appDb } from './app-db';
import { ARCHIVE_DIR, AUDIT_FILE, insertAuditRows, readAuditFile, type AuditEntry } from '../auth/audit-log';
import { FEEDBACK_FILE, readFeedbackFile } from '../feedback/feedback-store';
import { insertFeedback } from '../feedback/feedback-db';

/**
 * นำข้อมูลที่เคยเก็บเป็นไฟล์ (ก่อนใช้ฐาน data_dashboard) เข้าฐาน — ทำครั้งเดียวตอนเปิด backend
 * นำเข้าเสร็จแล้วเปลี่ยนชื่อไฟล์เดิมเป็น .imported (ไม่ลบ เก็บไว้เป็นสำรอง) รอบถัดไปจึงไม่นำเข้าซ้ำ
 */
function markImported(target: string) {
  let dest = `${target}.imported`;
  if (existsSync(dest)) dest = `${target}.imported-${Date.now()}`;
  renameSync(target, dest);
}

/** รายการสุดท้ายของไฟล์มีในฐานแล้ว = เคยนำเข้าไปแล้ว (เช่น รอบก่อนนำเข้าเสร็จแต่เปลี่ยนชื่อไฟล์ไม่ทัน) */
async function alreadyImported(table: 'audit_log' | 'audit_log_archive', last: AuditEntry) {
  const rows = await appDb.rows<RowDataPacket>(
    `SELECT 1 FROM ${appDb.t(table)} WHERE time = ? AND loginname = ? AND action = ? LIMIT 1`,
    [new Date(last.time), last.loginname.slice(0, 64), last.action],
  );
  return rows.length > 0;
}

async function importAuditFile(file: string, table: 'audit_log' | 'audit_log_archive') {
  const entries = readAuditFile(file);
  if (entries.length && !(await alreadyImported(table, entries[entries.length - 1]))) await insertAuditRows(entries, table);
  return entries.length;
}

export async function importLegacyFiles() {
  const result = { feedback: 0, audit: 0, archive: 0 };

  if (existsSync(FEEDBACK_FILE)) {
    // เรื่องที่มี id อยู่แล้วในฐานไม่เขียนทับ
    for (const entry of readFeedbackFile()) if (await insertFeedback(entry)) result.feedback++;
    markImported(FEEDBACK_FILE);
  }

  if (existsSync(AUDIT_FILE)) {
    result.audit = await importAuditFile(AUDIT_FILE, 'audit_log');
    markImported(AUDIT_FILE);
  }

  if (existsSync(ARCHIVE_DIR)) {
    for (const name of readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.jsonl')).sort()) {
      result.archive += await importAuditFile(path.join(ARCHIVE_DIR, name), 'audit_log_archive');
    }
    markImported(ARCHIVE_DIR);
  }
  return result;
}
