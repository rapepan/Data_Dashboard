import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { todayIso } from '../src/cache/report-registry';
import { feedbackStore } from '../src/feedback/feedback-store';
import { notifyService } from '../src/services/notify.service';

let app: FastifyInstance;
const cookie = (token: string) => ({ cookie: `bsth_session=${token}` });
const shift = (days: number) => { const d = new Date(`${todayIso()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
let userToken = '';
let adminToken = '';

beforeAll(async () => {
  app = await buildApp({ logRequests: false });
  await app.ready();
  userToken = app.jwt.sign({ sub: '__test_user', name: 'ผู้ทดสอบ', group: 'พยาบาล', pos: 'งานทดสอบ' });
  adminToken = app.jwt.sign({ sub: '__test_admin', name: 'ผู้ดูแลทดสอบ', group: 'ผู้ดูแลระบบ', pos: '' });
});

afterAll(async () => {
  await app.close();
});

describe('ความปลอดภัยของชุดทดสอบ', () => {
  it('ไม่ส่ง Telegram ระหว่างทดสอบ', () => {
    expect(notifyService.isConfigured()).toBe(false);
  });
});

describe('GET /api/health', () => {
  it('ตอบ 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/opd/appointments', () => {
  const get = (query: string) => app.inject({ method: 'GET', url: `/api/opd/appointments${query}` });

  it('ไม่ระบุวัน = วันนี้ + พรุ่งนี้', async () => {
    const res = await get('');
    expect(res.statusCode).toBe(200);
    expect(res.json().today.date).toBe(todayIso());
    expect(res.json().tomorrow.date).toBe(shift(1));
  });

  it('?date= ดูย้อนหลังได้', async () => {
    const res = await get(`?date=${shift(-2)}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().today.date).toBe(shift(-2));
  });

  it('?date= ล่วงหน้าไม่ได้ / รูปแบบผิด / เก่ากว่าปี 2558 → 400', async () => {
    expect((await get(`?date=${shift(1)}`)).statusCode).toBe(400);
    expect((await get('?date=abc')).statusCode).toBe(400);
    expect((await get('?date=2014-12-31')).statusCode).toBe(400);
  });

  it('?ahead= วันนี้ถึง 1 ปีข้างหน้าได้ ผลอยู่ที่ tomorrow', async () => {
    const todayRes = await get(`?ahead=${todayIso()}`);
    expect(todayRes.statusCode).toBe(200);
    expect(todayRes.json().tomorrow.date).toBe(todayIso());
    const later = await get(`?ahead=${shift(14)}`);
    expect(later.json().tomorrow.date).toBe(shift(14));
  });

  it('?ahead= ย้อนหลัง / เกิน 1 ปี → 400', async () => {
    expect((await get(`?ahead=${shift(-1)}`)).statusCode).toBe(400);
    expect((await get(`?ahead=${shift(400)}`)).statusCode).toBe(400);
  });
});

describe('GET /api/opd/report', () => {
  it('วันเริ่มหลังวันสิ้นสุด → 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/opd/report?start=2026-09-10&end=2026-09-01' });
    expect(res.statusCode).toBe(400);
  });
});

describe('สิทธิ์การเข้าถึง', () => {
  it('ผู้เยี่ยมชมเข้าหน้าผู้ดูแลไม่ได้', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit' });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('ผู้ใช้ทั่วไปเข้าหน้าผู้ดูแลไม่ได้', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit', headers: cookie(userToken) });
    expect(res.statusCode).toBe(403);
  });

  it('ผู้ดูแลเข้าได้', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit', headers: cookie(adminToken) });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/feedback (แจ้งปัญหา)', () => {
  const body = (extra: Record<string, unknown>) => ({ category: 'bug', page: 'ทั่วไป', message: 'ทดสอบอัตโนมัติ', position: 'งานทดสอบ', images: [], lineId: 'test.line', ...extra });
  const post = (payload: object, token = userToken) => app.inject({ method: 'POST', url: '/api/feedback', headers: cookie(token), payload });

  it('ไม่ได้ login → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/feedback', payload: body({ phone: '0987564785' }) });
    expect(res.statusCode).toBe(401);
  });

  it('ไม่กรอกเบอร์ / เบอร์ผิด → 400', async () => {
    expect((await post(body({ phone: '' }))).statusCode).toBe(400);
    expect((await post(body({ phone: '098756' }))).statusCode).toBe(400);
  });

  it('ไม่มีทั้ง LINE ID และ QR → 400', async () => {
    expect((await post(body({ phone: '0987564785', lineId: '' }))).statusCode).toBe(400);
  });

  it('ส่งสำเร็จ และเก็บเบอร์เป็นรูปแบบเดียวกัน', async () => {
    const res = await post(body({ phone: '0987564785' }));
    expect(res.statusCode).toBe(200);
    const saved = feedbackStore.list().find(e => e.id === res.json().id);
    expect(saved?.contactPhone).toBe('098-756-4785');
    expect(saved?.contactLine).toBe('test.line');
  });
});
