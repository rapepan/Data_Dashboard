import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHIVE_DIR, auditLog } from '../src/auth/audit-log';
import { DATA_DIR } from '../src/utils/paths';

const LOG_FILE = path.join(DATA_DIR, 'audit-log.jsonl');
const line = (time: string, detail: string) => JSON.stringify({ time, loginname: 'tester', action: 'view', detail });
const readLines = (file: string) => readFileSync(file, 'utf8').split('\n').filter(Boolean);

describe('auditLog.archiveOld', () => {
  it('ใช้โฟลเดอร์ข้อมูลชั่วคราว ไม่ใช่ backend/data จริง', async () => {
    expect(DATA_DIR).not.toMatch(/backend[\\/]data$/);
  });

  it('ย้ายรายการเก่ากว่ากำหนดเข้าคลังรายเดือน และเก็บรายการใหม่ไว้ในไฟล์หลัก', async () => {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(LOG_FILE, [
      line('2026-01-15T03:00:00.000Z', 'old-jan'),
      line('2026-02-01T03:00:00.000Z', 'old-feb'),
      'บรรทัดเสีย ไม่ใช่ JSON',
      line('2026-09-20T03:00:00.000Z', 'recent'),
    ].join('\n') + '\n');

    const moved = await auditLog.archiveOld(180, new Date('2026-10-01T00:00:00Z'));

    expect(moved).toBe(2);
    const main = readLines(LOG_FILE);
    expect(main).toHaveLength(2); // รายการใหม่ + บรรทัดเสีย (ไม่ทิ้งข้อมูล)
    expect(main.some(l => l.includes('recent'))).toBe(true);
    expect(readLines(path.join(ARCHIVE_DIR, 'audit-log-2026-01.jsonl'))[0]).toContain('old-jan');
    expect(readLines(path.join(ARCHIVE_DIR, 'audit-log-2026-02.jsonl'))[0]).toContain('old-feb');
  });

  it('รันซ้ำไม่มีอะไรให้ย้าย → ไม่แตะไฟล์ และคืน 0', async () => {
    expect(await auditLog.archiveOld(180, new Date('2026-10-01T00:00:00Z'))).toBe(0);
    expect(readLines(path.join(ARCHIVE_DIR, 'audit-log-2026-01.jsonl'))).toHaveLength(1);
  });

  it('รอบถัดไปต่อท้ายไฟล์คลังเดิม ไม่เขียนทับ', async () => {
    writeFileSync(LOG_FILE, line('2026-01-20T03:00:00.000Z', 'old-jan-2') + '\n', { flag: 'a' });
    expect(await auditLog.archiveOld(180, new Date('2026-10-01T00:00:00Z'))).toBe(1);
    expect(readLines(path.join(ARCHIVE_DIR, 'audit-log-2026-01.jsonl'))).toHaveLength(2);
  });

  it('หน้าประวัติการใช้งานอ่านเฉพาะไฟล์หลัก', async () => {
    const details = (await auditLog.read({ limit: 100 })).map(e => e.detail);
    expect(details).toContain('recent');
    expect(details).not.toContain('old-jan');
    expect(existsSync(LOG_FILE)).toBe(true);
  });
});
