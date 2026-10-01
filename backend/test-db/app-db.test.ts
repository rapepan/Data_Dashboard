import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appDb } from '../src/repositories/app-db';
import { importLegacyFiles } from '../src/repositories/app-db-migrate';
import { auditLog } from '../src/auth/audit-log';
import { feedbackStore } from '../src/feedback/feedback-store';
import { DATA_DIR } from '../src/utils/paths';
import { userSettings } from '../src/auth/user-settings';
import { loginThrottle } from '../src/auth/auth.service';
import { presence } from '../src/auth/presence';

const TABLES = ['feedback', 'feedback_history', 'audit_log', 'audit_log_archive', 'user_settings', 'login_failures', 'users_seen'] as const;
const dropTestTables = async () => {
  for (const name of TABLES) await appDb.exec(`DROP TABLE IF EXISTS ${appDb.t(name)}`);
};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeAll(async () => {
  expect(appDb.t('feedback')).toBe('`zz_test_feedback`'); // กันพลาดไปลบตารางจริง
  await dropTestTables();
  await appDb.ensureSchema();
});

afterAll(async () => {
  await dropTestTables();
  await appDb.close();
});

describe('ฐาน data_dashboard', () => {
  it('ใช้ฐานข้อมูล ไม่ใช่ไฟล์', () => {
    expect(appDb.isConfigured()).toBe(true);
  });

  it('สร้างตารางเป็น utf8mb4', async () => {
    const rows = await appDb.rows<RowDataPacket>(
      "SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'zz\\_test\\_%'");
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r.TABLE_COLLATION).toMatch(/^utf8mb4/);
  });
});

describe('เรื่องแจ้งปัญหา', () => {
  let id = '';

  it('บันทึกและอ่านกลับได้ครบ รวมภาษาไทยและอีโมจิ', async () => {
    const saved = await feedbackStore.add({
      category: 'bug', page: 'ผู้ป่วยนอก (OPD)', message: 'ทดสอบภาษาไทย ✓ และอีโมจิ 🙂', name: 'ผู้ทดสอบ', position: 'งานทดสอบ',
      contact: 'โทร 098-756-4785 · LINE ID: test.line', contactPhone: '098-756-4785', contactLine: 'test.line', loginname: '__test_db', ip: '10.0.0.1',
    });
    id = saved.id;
    const [back] = await feedbackStore.listByReporter('__test_db');
    expect(back.id).toBe(id);
    expect(back.message).toBe('ทดสอบภาษาไทย ✓ และอีโมจิ 🙂');
    expect(back.contactPhone).toBe('098-756-4785');
    expect(back.status).toBe('new');
    expect(back.time).toBe(saved.time); // เวลาไม่เลื่อน (เก็บเป็น UTC)
  });

  it('ผูกรูปแนบ / QR LINE', async () => {
    await feedbackStore.setImages(id, [{ file: '1.jpg', mime: 'image/jpeg', size: 100 }]);
    await feedbackStore.setLineQr(id, { file: 'line-qr.png', mime: 'image/png', size: 50 });
    const [back] = await feedbackStore.list();
    expect(back.images).toEqual([{ file: '1.jpg', mime: 'image/jpeg', size: 100 }]);
    expect(back.lineQr?.file).toBe('line-qr.png');
  });

  it('เปลี่ยนสถานะ → ไทม์ไลน์ + ข้อความตอบกลับ + ผู้แจ้งเห็นว่ามีความเคลื่อนไหวใหม่', async () => {
    const updated = await feedbackStore.setStatus(id, 'in_progress', { loginname: '__test_admin', name: 'ผู้ดูแล' }, 'รับเรื่องแล้ว');
    expect(updated?.status).toBe('in_progress');
    expect(updated?.history).toEqual([expect.objectContaining({ status: 'in_progress', by: '__test_admin', note: 'รับเรื่องแล้ว' })]);
    expect(updated?.updatedAt).toBeTruthy();
    expect(updated?.reporterSeenAt).toBeUndefined();

    const done = await feedbackStore.setStatus(id, 'done', { loginname: '__test_admin' });
    expect(done?.history).toHaveLength(2);
    expect(done?.doneAt).toBeTruthy();
    expect(await feedbackStore.list('new')).toHaveLength(0);
    expect(await feedbackStore.list('done')).toHaveLength(1);
  });

  it('ผู้แจ้งเปิดดูแล้ว → ไม่นับเป็นความเคลื่อนไหวใหม่', async () => {
    await wait(5);
    await feedbackStore.markSeenByReporter('__test_db');
    const [back] = await feedbackStore.listByReporter('__test_db');
    expect(back.reporterSeenAt! >= back.updatedAt!).toBe(true);
  });

  it('เรื่องที่ไม่มีอยู่ → null', async () => {
    expect(await feedbackStore.setStatus('nope0000', 'done', { loginname: 'x' })).toBeNull();
  });
});

describe('ประวัติการใช้งาน', () => {
  it('บันทึก (ไม่ต้องรอ) แล้วอ่าน / กรองได้', async () => {
    auditLog.write({ loginname: '__test_db', action: 'login', ip: '::ffff:10.0.0.2' });
    await wait(150);
    auditLog.write({ loginname: 'guest', action: 'view', detail: '/api/opd/report', ip: '10.0.0.3' });
    await wait(150);
    auditLog.write({ loginname: '__test_db', action: 'export', detail: 'Excel: ทดสอบ.xlsx', ip: '10.0.0.2' });
    await wait(400);
    const all = await auditLog.read();
    expect(all).toHaveLength(3);
    expect(all[0].action).toBe('export'); // ล่าสุดก่อน
    expect(all[0].detail).toBe('Excel: ทดสอบ.xlsx');
    expect(all.find(e => e.action === 'login')?.ip).toBe('10.0.0.2'); // ตัด ::ffff:
    expect(await auditLog.read({ who: 'guest' })).toHaveLength(1);
    expect(await auditLog.read({ who: 'user' })).toHaveLength(2);
    expect(await auditLog.read({ loginname: 'TEST_db' })).toHaveLength(2); // ค้นบางส่วน ไม่สนตัวพิมพ์
    expect(await auditLog.read({ action: 'export' })).toHaveLength(1);
    expect(await auditLog.users()).toEqual([expect.objectContaining({ loginname: '__test_db', count: 2 })]);
    expect((await auditLog.stats()).entries).toBe(3);
  });

  it('ย้ายรายการเก่าเข้าตารางคลัง', async () => {
    await appDb.exec(`INSERT INTO ${appDb.t('audit_log')} (time, loginname, action) VALUES (?, '__test_old', 'view')`, [new Date('2025-01-01T00:00:00Z')]);
    expect(await auditLog.archiveOld(180)).toBe(1);
    const [archived] = await appDb.rows<RowDataPacket>(`SELECT COUNT(*) AS n FROM ${appDb.t('audit_log_archive')} WHERE loginname = '__test_old'`);
    expect(Number(archived.n)).toBe(1);
    expect((await auditLog.read()).some(e => e.loginname === '__test_old')).toBe(false);
  });

  it('รายการที่พักไว้ตอนฐานล่ม ส่งเข้าฐานได้ครบ', async () => {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(path.join(DATA_DIR, 'audit-log-pending.jsonl'),
      JSON.stringify({ time: '2026-09-30T01:00:00.000Z', loginname: '__test_pending', action: 'view', detail: '/api/er/report' }) + '\n');
    expect(await auditLog.flushPending()).toBe(1);
    expect(existsSync(path.join(DATA_DIR, 'audit-log-pending.jsonl'))).toBe(false);
    expect(await auditLog.read({ loginname: '__test_pending' })).toHaveLength(1);
  });
});

describe('นำข้อมูลจากไฟล์เดิมเข้าฐาน', () => {
  it('นำเข้าครั้งเดียว แล้วเปลี่ยนชื่อไฟล์เดิมเป็น .imported', async () => {
    mkdirSync(path.join(DATA_DIR, 'audit-archive'), { recursive: true });
    writeFileSync(path.join(DATA_DIR, 'feedback.jsonl'), JSON.stringify({
      id: 'abcd1234', time: '2026-09-24T04:28:52.547Z', status: 'in_progress', category: 'suggestion', page: 'แพทย์แผนไทย', message: 'เรื่องเก่า',
      name: 'ผู้แจ้งเก่า', contact: 'ไลน์เก่า', loginname: '__test_legacy',
      history: [{ time: '2026-09-30T08:22:55.359Z', status: 'in_progress', by: 'admin', byName: 'ผู้ดูแล' }],
    }) + '\n');
    writeFileSync(path.join(DATA_DIR, 'audit-log.jsonl'), [
      JSON.stringify({ time: '2026-09-29T01:00:00.000Z', loginname: '__test_legacy', action: 'login', ip: '10.0.0.9' }),
      'บรรทัดเสีย',
      JSON.stringify({ time: '2026-09-29T01:01:00.000Z', loginname: '__test_legacy', action: 'view', detail: '/api/opd/report' }),
    ].join('\n') + '\n');
    writeFileSync(path.join(DATA_DIR, 'audit-archive', 'audit-log-2025-12.jsonl'),
      JSON.stringify({ time: '2025-12-01T00:00:00.000Z', loginname: '__test_legacy', action: 'view' }) + '\n');

    const result = await importLegacyFiles();
    expect(result).toEqual({ feedback: 1, audit: 2, archive: 1 });
    expect(existsSync(path.join(DATA_DIR, 'feedback.jsonl'))).toBe(false);
    expect(existsSync(path.join(DATA_DIR, 'feedback.jsonl.imported'))).toBe(true);
    expect(existsSync(path.join(DATA_DIR, 'audit-log.jsonl.imported'))).toBe(true);
    expect(existsSync(path.join(DATA_DIR, 'audit-archive.imported'))).toBe(true);

    const [legacy] = await feedbackStore.listByReporter('__test_legacy');
    expect(legacy.id).toBe('abcd1234');
    expect(legacy.time).toBe('2026-09-24T04:28:52.547Z');
    expect(legacy.history).toHaveLength(1);
    expect(await auditLog.read({ loginname: '__test_legacy' })).toHaveLength(2);

    // รันซ้ำ: ไม่มีไฟล์ให้นำเข้าแล้ว
    expect(await importLegacyFiles()).toEqual({ feedback: 0, audit: 0, archive: 0 });
  });
});

describe('ค่าตั้งของผู้ใช้ (กระดิ่ง)', () => {
  it('บันทึก / เขียนทับ / อ่านกลับ', async () => {
    expect(await userSettings.get('__test_admin', 'feedback_bell_seen')).toBeNull();
    await userSettings.set('__test_admin', 'feedback_bell_seen', '2026-10-01T03:00:00.000Z');
    await userSettings.set('__test_admin', 'feedback_bell_seen', '2026-10-01T04:00:00.000Z');
    expect(await userSettings.get('__test_admin', 'feedback_bell_seen')).toBe('2026-10-01T04:00:00.000Z');
  });
});

describe('นับ login ผิด (ตาราง login_failures)', () => {
  const [user, ip] = ['__test_user', '10.0.0.5'];
  it('ผิด 5 ครั้ง → ถูกพัก · login สำเร็จ (reset) → ปลดพัก', async () => {
    for (let i = 0; i < 4; i++) await loginThrottle.fail(user, ip);
    expect(await loginThrottle.isBlocked(user, ip)).toBe(false);
    await loginThrottle.fail(user, ip);
    expect(await loginThrottle.isBlocked(user, ip)).toBe(true);
    expect(await loginThrottle.isBlocked(user, '10.0.0.6')).toBe(false); // คนละ IP ไม่โดน
    await loginThrottle.reset(user, ip);
    expect(await loginThrottle.isBlocked(user, ip)).toBe(false);
  });

  it('ลบรายการที่เก่ากว่า 1 วัน', async () => {
    await appDb.exec(`INSERT INTO ${appDb.t('login_failures')} (loginname, ip, time) VALUES (?, ?, ?)`, [user, ip, new Date(Date.now() - 2 * 86_400_000)]);
    expect(await loginThrottle.cleanup()).toBe(1);
  });
});

describe('ผู้ใช้งานระบบ (ตาราง users_seen)', () => {
  const user = { loginname: '__test_presence', displayName: 'ผู้ทดสอบ ออนไลน์', role: 'user' as const, groupname: 'พยาบาล', position: 'งานทดสอบ' };

  it('login 2 ครั้ง → นับ 2 ครั้ง · ใช้งานอยู่', async () => {
    await presence.login(user, '::ffff:10.0.0.7');
    await presence.login(user, '10.0.0.7');
    const [row] = await appDb.rows<RowDataPacket>(`SELECT * FROM ${appDb.t('users_seen')} WHERE loginname = ?`, [user.loginname]);
    expect(Number(row.login_count)).toBe(2);
    expect(row.name).toBe('ผู้ทดสอบ ออนไลน์');
    expect(row.last_ip).toBe('10.0.0.7');
    const me = (await presence.list()).find(u => u.loginname === user.loginname);
    expect(me?.status).toBe('active');
  });

  it('สัญญาณเบื้องหลังบันทึกลงฐาน (flush) โดยไม่ทับเวลาใช้งานล่าสุด และไม่นับเป็น login', async () => {
    const [before] = await appDb.rows<RowDataPacket>(`SELECT last_active FROM ${appDb.t('users_seen')} WHERE loginname = ?`, [user.loginname]);
    await wait(20);
    presence.touch(user, '10.0.0.8', true);
    await presence.flush();
    const [row] = await appDb.rows<RowDataPacket>(`SELECT * FROM ${appDb.t('users_seen')} WHERE loginname = ?`, [user.loginname]);
    expect(Number(row.login_count)).toBe(2);
    expect((row.last_seen as Date).getTime()).toBeGreaterThan((before.last_active as Date).getTime());
    expect((row.last_active as Date).getTime()).toBe((before.last_active as Date).getTime());
    expect(row.last_ip).toBe('10.0.0.8');
  });

  it('logout → ออฟไลน์ และบันทึกเวลาออก', async () => {
    await presence.offline(user.loginname);
    const me = (await presence.list()).find(u => u.loginname === user.loginname);
    expect(me?.status).toBe('offline');
    expect(me?.loggedOutAt).toBeTruthy();
    expect(me?.name).toBe('ผู้ทดสอบ ออนไลน์'); // ชื่อไม่หาย
  });
});
