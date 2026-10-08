import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { notifyService } from '../src/services/notify.service';
import { systemRestart } from '../src/system/restart';
import { DATA_DIR } from '../src/utils/paths';

/** ปุ่มรีสตาร์ทระบบ — ไม่ปิด process จริง (ดักขั้นตอนปิดไว้) และไม่ส่ง Telegram จริง */
let app: FastifyInstance;
const cookie = (token: string) => ({ cookie: `bsth_session=${token}` });
let userToken = '';
let adminToken = '';
const REQUEST_FILE = path.join(DATA_DIR, 'restart-request.json');
const LAST_FILE = path.join(DATA_DIR, 'restart-last.json');
const restart = (token: string, payload: object = {}) => app.inject({ method: 'POST', url: '/api/admin/system/restart', headers: cookie(token), payload });

beforeAll(async () => {
  app = await buildApp({ logRequests: false });
  await app.ready();
  userToken = app.jwt.sign({ sub: '__test_user', name: 'ผู้ทดสอบ', group: 'พยาบาล', pos: '' });
  adminToken = app.jwt.sign({ sub: '__test_admin', name: 'ผู้ดูแลทดสอบ', group: 'ผู้ดูแลระบบ', pos: '' });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  systemRestart._reset();
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.RESTART_SUPERVISED;
  delete process.env.INVOCATION_ID;
});

describe('รีสตาร์ทระบบจากหน้าผู้ดูแล', () => {
  it('ไม่มีตัวเปิดระบบกลับ (เช่น npm run dev) → ปฏิเสธ ไม่ปิดเด็ดขาด', async () => {
    const shutdown = vi.fn();
    systemRestart.onShutdown(shutdown);
    const res = await restart(adminToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('systemd');
    vi.runAllTimers();
    expect(shutdown).not.toHaveBeenCalled();
  });

  it('ไม่ใช่ผู้ดูแล → 403 · ไม่ได้ login → 401', async () => {
    process.env.RESTART_SUPERVISED = '1';
    systemRestart.onShutdown(vi.fn());
    expect((await restart(userToken)).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/admin/system/restart', payload: {} })).statusCode).toBe(401);
  });

  it('ผู้ดูแลสั่ง (มี systemd) → ตอบกลับก่อน แล้วปิดใน 1 วินาที · แจ้ง Telegram + บันทึกใครสั่ง · กดซ้ำไม่ได้', async () => {
    process.env.INVOCATION_ID = 'test';
    const alert = vi.spyOn(notifyService, 'alert').mockImplementation(() => undefined);
    const shutdown = vi.fn();
    systemRestart.onShutdown(shutdown);

    const res = await restart(adminToken, { reason: 'แก้ค่า .env <ทดสอบ>' });
    expect(res.statusCode).toBe(200);
    expect(shutdown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(shutdown).toHaveBeenCalledTimes(1);

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toContain('สั่งรีสตาร์ท');
    expect(alert.mock.calls[0][0]).toContain('&lt;ทดสอบ&gt;'); // ข้อความผู้ใช้ถูก escape ก่อนส่ง HTML
    const saved = JSON.parse(readFileSync(REQUEST_FILE, 'utf8'));
    expect(saved).toMatchObject({ by: '__test_admin', reason: 'แก้ค่า .env <ทดสอบ>' });

    const again = await restart(adminToken);
    expect(again.statusCode).toBe(409);
    expect(again.json().message).toContain('กำลังรีสตาร์ท');
  });

  it('เปิดใหม่หลังกดรีสตาร์ท → แจ้งว่ากลับมาแล้วใช้กี่วินาที + จำไว้แสดงในหน้าผู้ดูแล · ไฟล์คำสั่งถูกลบ', () => {
    const alert = vi.spyOn(notifyService, 'alert').mockImplementation(() => undefined);
    const asked = Date.parse('2026-10-07T03:00:00Z');
    writeFileSync(REQUEST_FILE, JSON.stringify({ by: '__test_admin', name: 'ผู้ดูแลทดสอบ', reason: '', requestedAt: new Date(asked).toISOString() }));
    systemRestart.loadOnStartup(asked + 7_000);
    expect(existsSync(REQUEST_FILE)).toBe(false);
    expect(alert.mock.calls[0][0]).toMatch(/กลับมาใช้งานได้แล้ว[\s\S]*7 วินาที/);
    expect(systemRestart.info().last).toMatchObject({ by: '__test_admin', backAt: new Date(asked + 7_000).toISOString() });
    expect(JSON.parse(readFileSync(LAST_FILE, 'utf8')).by).toBe('__test_admin');
  });

  it('ไฟล์คำสั่งเก่าเกิน 10 นาที (ปิดค้างแล้วเปิดทีหลัง) → ไม่แจ้งว่ากลับมาแล้ว', () => {
    const alert = vi.spyOn(notifyService, 'alert').mockImplementation(() => undefined);
    const asked = Date.parse('2026-10-07T03:00:00Z');
    writeFileSync(REQUEST_FILE, JSON.stringify({ by: '__test_admin', name: '', reason: '', requestedAt: new Date(asked).toISOString() }));
    systemRestart.loadOnStartup(asked + 30 * 60_000);
    expect(alert).not.toHaveBeenCalled();
    expect(systemRestart.info().last?.backAt).toBeNull();
  });
});
