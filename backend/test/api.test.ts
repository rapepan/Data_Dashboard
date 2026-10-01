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
    const saved = (await feedbackStore.list()).find(e => e.id === res.json().id);
    expect(saved?.contactPhone).toBe('098-756-4785');
    expect(saved?.contactLine).toBe('test.line');
  });
});

describe('กระดิ่งผู้ดูแล — จำว่าดูถึงเรื่องไหนแล้ว (ทุกเครื่องตรงกัน)', () => {
  it('เริ่มต้นยังไม่เคยดู → บันทึกแล้วอ่านกลับได้', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/admin/feedback/summary', headers: cookie(adminToken) });
    expect(before.json().seenAt).toBe('');
    const seen = await app.inject({ method: 'POST', url: '/api/admin/feedback/summary/seen', headers: cookie(adminToken), payload: { time: '2026-10-01T03:00:00.000Z' } });
    expect(seen.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/admin/feedback/summary', headers: cookie(adminToken) });
    expect(after.json().seenAt).toBe('2026-10-01T03:00:00.000Z');
  });

  it('เวลาผิดรูปแบบ → 400 · ผู้ใช้ทั่วไปบันทึกไม่ได้ → 403', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/admin/feedback/summary/seen', headers: cookie(adminToken), payload: { time: 'abc' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/admin/feedback/summary/seen', headers: cookie(userToken), payload: { time: '2026-10-01T03:00:00.000Z' } })).statusCode).toBe(403);
  });
});

describe('ผู้ใช้งานระบบ (สถานะออนไลน์)', () => {
  const users = async () => (await app.inject({ method: 'GET', url: '/api/admin/users', headers: { ...cookie(adminToken), 'x-background': '1' } })).json();
  const find = async (loginname: string) => (await users()).users.find((u: { loginname: string }) => u.loginname === loginname);

  it('ผู้ใช้ที่ login แล้วเปิดหน้า → ใช้งานอยู่', async () => {
    await app.inject({ method: 'GET', url: '/api/opd/appointments', headers: cookie(userToken) });
    const me = await find('__test_user');
    expect(me.status).toBe('active');
    expect(me.name).toBe('ผู้ทดสอบ');
    expect((await users()).counts.active).toBeGreaterThanOrEqual(1);
  });

  it('ผู้เยี่ยมชมไม่ถูกนับ', async () => {
    await app.inject({ method: 'GET', url: '/api/opd/appointments' });
    expect((await users()).users.some((u: { loginname: string }) => u.loginname === 'guest')).toBe(false);
  });

  it('logout → ออฟไลน์ทันที', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: cookie(userToken) });
    await new Promise(r => setTimeout(r, 50));
    expect((await find('__test_user')).status).toBe('offline');
  });

  it('ผู้ใช้ทั่วไปเปิดหน้านี้ไม่ได้', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: cookie(userToken) })).statusCode).toBe(403);
  });
});

describe('บังคับออกจากระบบ', () => {
  let kickToken = '';
  const tokenFor = () => app.jwt.sign({ sub: '__test_kick', name: 'ผู้ถูกบังคับออก', group: 'พยาบาล', pos: '' });
  const kick = (loginname: string, token = adminToken) => app.inject({ method: 'POST', url: `/api/admin/users/${loginname}/logout`, headers: cookie(token) });

  it('ผู้ดูแลบังคับออก → บัตรเดิมใช้ไม่ได้ทันที และหน้าเว็บได้รับสัญญาณว่าถูกบังคับออก', async () => {
    // ออกบัตรก่อนหน้า 2 วินาที (บัตรที่ออกวินาทีเดียวกับตอนบังคับออกยังใช้ได้ — เผื่อ login ใหม่ทันที)
    kickToken = app.jwt.sign({ sub: '__test_kick', name: 'ผู้ถูกบังคับออก', group: 'พยาบาล', pos: '', iat: Math.floor(Date.now() / 1000) - 2 });
    await app.inject({ method: 'GET', url: '/api/opd/appointments', headers: cookie(kickToken) });
    expect((await kick('__test_kick')).statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/api/opd/appointments', headers: cookie(kickToken) });
    expect(after.headers['x-session-revoked']).toBe('1');
    expect(after.headers['x-session-expired']).toBe('1');
    const submit = await app.inject({ method: 'POST', url: '/api/feedback', headers: cookie(kickToken), payload: { category: 'bug', message: 'ทดสอบ', phone: '0987564785', lineId: 'x' } });
    expect(submit.statusCode).toBe(401);
  });

  it('สถานะเป็นออฟไลน์ และบันทึกในประวัติการใช้งาน', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/admin/users', headers: { ...cookie(adminToken), 'x-background': '1' } })).json();
    expect(list.users.find((u: { loginname: string }) => u.loginname === '__test_kick').status).toBe('offline');
    const audit = (await app.inject({ method: 'GET', url: '/api/admin/audit?action=force_logout', headers: cookie(adminToken) })).json();
    expect(audit.entries[0]).toMatchObject({ loginname: '__test_admin', action: 'force_logout', detail: '__test_kick' });
  });

  it('login ใหม่ (บัตรใหม่) ใช้งานได้ทันที', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/opd/appointments', headers: cookie(tokenFor()) });
    expect(res.headers['x-session-revoked']).toBeUndefined();
  });

  it('บังคับตัวเองไม่ได้ · ผู้ใช้ไม่มีอยู่ → 404 · ผู้ใช้ทั่วไปกดไม่ได้', async () => {
    expect((await kick('__test_admin')).statusCode).toBe(400);
    expect((await kick('nobody_here')).statusCode).toBe(404);
    expect((await kick('__test_kick', userToken)).statusCode).toBe(403);
  });
});

describe('ผู้เยี่ยมชมในหน้าผู้ใช้งานระบบ', () => {
  it('นับผู้เยี่ยมชมเป็นจำนวนเครื่อง (IP) ไม่มีในรายชื่อ', async () => {
    await app.inject({ method: 'GET', url: '/api/opd/appointments', remoteAddress: '10.9.9.1' });
    await app.inject({ method: 'GET', url: '/api/opd/appointments', remoteAddress: '10.9.9.1' });
    await app.inject({ method: 'GET', url: '/api/opd/appointments', remoteAddress: '10.9.9.2' });
    const res = (await app.inject({ method: 'GET', url: '/api/admin/users', headers: { ...cookie(adminToken), 'x-background': '1' } })).json();
    expect(res.counts.guestsOnline).toBeGreaterThanOrEqual(2);
    expect(typeof res.counts.guestsToday).toBe('number');
    expect(res.users.some((u: { loginname: string }) => u.loginname === 'guest')).toBe(false);
  });
});
