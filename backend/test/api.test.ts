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

describe('สถานะระบบ / ประกาศ / โหมดปิดปรับปรุง', () => {
  const asAdmin = () => cookie(adminToken);
  const status = async () => (await app.inject({ method: 'GET', url: '/api/system/status' })).json();
  const minutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  it('ทุกคนเรียกสถานะได้ — เวอร์ชันตรงกับ package.json ที่โฟลเดอร์หลัก', async () => {
    const { version } = JSON.parse(await import('node:fs').then(fs => fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')));
    const s = await status();
    expect(s.version).toBe(version);
    expect(s.maintenance.on).toBe(false);
  });

  it('ประกาศแสดงเฉพาะในช่วงเวลา · ตรวจข้อมูล · ผู้ใช้ทั่วไปสร้างไม่ได้', async () => {
    const post = (payload: object, headers = asAdmin()) => app.inject({ method: 'POST', url: '/api/admin/system/notices', headers, payload });
    const now = await post({ message: 'ปิดปรับปรุง 18:00 น.', level: 'warning', startsAt: minutes(-1), endsAt: minutes(60) });
    expect(now.statusCode).toBe(200);
    await post({ message: 'ประกาศล่วงหน้า', level: 'info', startsAt: minutes(60), endsAt: minutes(120) });
    expect((await status()).notices.map((n: { message: string }) => n.message)).toEqual(['ปิดปรับปรุง 18:00 น.']);

    expect((await post({ message: '', level: 'info', startsAt: minutes(0), endsAt: minutes(5) })).statusCode).toBe(400);
    expect((await post({ message: 'x', level: 'info', startsAt: minutes(5), endsAt: minutes(1) })).statusCode).toBe(400);
    expect((await post({ message: 'x', level: 'urgent', startsAt: minutes(0), endsAt: minutes(5) })).statusCode).toBe(400);
    expect((await post({ message: 'x', level: 'info', startsAt: minutes(0), endsAt: minutes(5) }, cookie(userToken))).statusCode).toBe(403);

    const id = now.json().id;
    const edited = await app.inject({ method: 'PUT', url: `/api/admin/system/notices/${id}`, headers: asAdmin(), payload: { message: 'แก้แล้ว', level: 'info', startsAt: minutes(-1), endsAt: minutes(30) } });
    expect(edited.json().message).toBe('แก้แล้ว');
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/system/notices/${id}`, headers: asAdmin() })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/system/notices/${id}`, headers: asAdmin() })).statusCode).toBe(404);
    expect((await status()).notices).toHaveLength(0);
  });

  it('มีเวลาปิดปรับปรุงแล้วไม่ต้องมีข้อความ · ไม่มีทั้งคู่ไม่ได้', async () => {
    const post = (payload: object) => app.inject({ method: 'POST', url: '/api/admin/system/notices', headers: asAdmin(), payload });
    const ok = await post({ message: '  ', level: 'warning', startsAt: minutes(-1), maintenanceStart: minutes(60), maintenanceEnd: minutes(90) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().message).toBe('');
    expect(ok.json().endsAt).toBe(ok.json().maintenanceStart);
    expect((await status()).notices.map((n: { id: number }) => n.id)).toContain(ok.json().id);
    const log = (await app.inject({ method: 'GET', url: '/api/admin/audit', headers: asAdmin() })).json();
    expect(JSON.stringify(log)).toMatch(new RegExp(`#${ok.json().id} · ปิดปรับปรุง \\d{2}/\\d{2}/25\\d{2} \\d{2}:\\d{2}–\\d{2}:\\d{2} น\\.`));

    expect((await post({ message: '', level: 'warning', startsAt: minutes(-1), endsAt: minutes(30) })).json().message).toBe('กรุณาพิมพ์ข้อความประกาศ');
    await app.inject({ method: 'DELETE', url: `/api/admin/system/notices/${ok.json().id}`, headers: asAdmin() });
  });

  it('โหมดปิดปรับปรุง: ผู้ใช้/ผู้เยี่ยมชมได้ 503 · ผู้ดูแลใช้ได้ · สถานะระบบและ login ยังเปิด', async () => {
    const set = (on: boolean) => app.inject({ method: 'PUT', url: '/api/admin/system/maintenance', headers: asAdmin(), payload: { on, message: 'อัปเดตระบบถึง 18:30 น.' } });
    expect((await set(true)).json().on).toBe(true);

    const guest = await app.inject({ method: 'GET', url: '/api/opd/appointments' });
    expect(guest.statusCode).toBe(503);
    expect(guest.json()).toMatchObject({ maintenance: true, message: 'อัปเดตระบบถึง 18:30 น.' });
    expect((await app.inject({ method: 'GET', url: '/api/opd/appointments', headers: cookie(userToken) })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/api/opd/appointments', headers: asAdmin() })).statusCode).toBe(200);
    expect((await status()).maintenance).toMatchObject({ on: true, message: 'อัปเดตระบบถึง 18:30 น.' });
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(200);

    await set(false);
    expect((await app.inject({ method: 'GET', url: '/api/opd/appointments' })).statusCode).toBe(200);
    const audit = (await app.inject({ method: 'GET', url: '/api/admin/audit?action=maintenance_on', headers: asAdmin() })).json();
    expect(audit.entries[0]).toMatchObject({ action: 'maintenance_on', detail: 'อัปเดตระบบถึง 18:30 น.' });
  });
});

describe('ปิดปรับปรุงเฉพาะหน้า', () => {
  const set = (pages: string[], token = adminToken) => app.inject({ method: 'PUT', url: '/api/admin/system/page-maintenance', headers: cookie(token), payload: { pages, message: 'ปรับปรุงข้อมูล OPD ถึง 16:00 น.' } });

  it('ปิดเฉพาะ OPD → OPD ได้ 503 แต่หน้าอื่นใช้ได้ · ผู้ดูแลเปิด OPD ได้', async () => {
    expect((await set(['opd'])).statusCode).toBe(200);
    const opd = await app.inject({ method: 'GET', url: '/api/opd/appointments' });
    expect(opd.statusCode).toBe(503);
    expect(opd.json()).toMatchObject({ maintenance: true, page: 'opd', message: 'ปรับปรุงข้อมูล OPD ถึง 16:00 น.' });
    expect((await app.inject({ method: 'GET', url: '/api/opd/appointments', headers: cookie(userToken) })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/api/er/report' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/opd/appointments', headers: cookie(adminToken) })).statusCode).toBe(200);
    const status = (await app.inject({ method: 'GET', url: '/api/system/status' })).json();
    expect(status.pageMaintenance).toEqual({ pages: ['opd'], message: 'ปรับปรุงข้อมูล OPD ถึง 16:00 น.', until: null });
  });

  it('เปิดทุกหน้ากลับ (รายการว่าง) → ใช้ได้ปกติ', async () => {
    await set([]);
    expect((await app.inject({ method: 'GET', url: '/api/opd/appointments' })).statusCode).toBe(200);
  });

  it('เลือกหน้าที่ห้ามปิด / ผู้ใช้ทั่วไปตั้งค่า → ไม่ได้', async () => {
    expect((await set(['contact'])).statusCode).toBe(400);
    expect((await set(['admin'])).statusCode).toBe(400);
    expect((await set(['opd'], userToken)).statusCode).toBe(403);
  });
});

describe('ปิดปรับปรุงเฉพาะหน้า — สัญญาณให้หน้าเว็บตรวจสถานะทันที', () => {
  it('API ของหน้าที่ปิดส่ง header X-Maintenance', async () => {
    await app.inject({ method: 'PUT', url: '/api/admin/system/page-maintenance', headers: cookie(adminToken), payload: { pages: ['physio'], message: '' } });
    const res = await app.inject({ method: 'GET', url: '/api/physio/report' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['x-maintenance']).toBe('1');
    await app.inject({ method: 'PUT', url: '/api/admin/system/page-maintenance', headers: cookie(adminToken), payload: { pages: [] } });
  });
});

describe('ประกาศ: เวลาปิดปรับปรุงจริง + เปิด/ปิดโหมดอัตโนมัติ', async () => {
  const { systemScheduler } = await import('../src/system/scheduler');
  const { systemStore } = await import('../src/system/system-store');
  const at = (m: number) => new Date(Date.now() + m * 60_000);
  const post = (payload: object) => app.inject({ method: 'POST', url: '/api/admin/system/notices', headers: cookie(adminToken), payload });
  const base = { message: 'ปิดปรับปรุงตามกำหนด', level: 'warning', startsAt: at(-10).toISOString(), endsAt: at(240).toISOString() };

  it('ตรวจข้อมูล: อัตโนมัติต้องมีเวลาปิดปรับปรุง · เวลาจบต้องหลังเวลาเริ่ม', async () => {
    expect((await post({ ...base, autoMaintenance: true })).statusCode).toBe(400);
    expect((await post({ ...base, maintenanceStart: at(60).toISOString(), maintenanceEnd: at(30).toISOString() })).statusCode).toBe(400);
  });

  it('สถานะระบบส่งเวลาปิดปรับปรุงจริงไปให้หน้าเว็บ', async () => {
    const res = await post({ ...base, maintenanceStart: at(120).toISOString(), maintenanceEnd: at(150).toISOString() });
    const status = (await app.inject({ method: 'GET', url: '/api/system/status' })).json();
    const n = status.notices.find((x: { id: number }) => x.id === res.json().id);
    expect(n.maintenanceStart).toBe(res.json().maintenanceStart);
    expect(n.maintenanceEnd).toBe(res.json().maintenanceEnd);
    await app.inject({ method: 'DELETE', url: `/api/admin/system/notices/${res.json().id}`, headers: cookie(adminToken) });
  });

  it('ถึงเวลาเริ่ม → เปิดโหมดเอง · ถึงเวลาจบ → ปิดโหมดเอง', async () => {
    const res = await post({ ...base, maintenanceStart: at(60).toISOString(), maintenanceEnd: at(90).toISOString(), autoMaintenance: true });
    const id = res.json().id;
    await systemScheduler.tick(at(30));
    expect(systemStore.maintenance().on).toBe(false); // ยังไม่ถึงเวลา
    await systemScheduler.tick(at(61));
    expect(systemStore.maintenance()).toMatchObject({ on: true, auto: id });
    expect((await app.inject({ method: 'GET', url: '/api/opd/appointments' })).statusCode).toBe(503);
    await systemScheduler.tick(at(91));
    expect(systemStore.maintenance().on).toBe(false);
    await app.inject({ method: 'DELETE', url: `/api/admin/system/notices/${id}`, headers: cookie(adminToken) });
  });

  it('ผู้ดูแลกดปิดก่อนเวลา → ระบบไม่เปิดซ้ำ · ผู้ดูแลเปิดเอง → หมดเวลาแล้วระบบไม่ปิดให้', async () => {
    const res = await post({ ...base, maintenanceStart: at(60).toISOString(), maintenanceEnd: at(90).toISOString(), autoMaintenance: true });
    const id = res.json().id;
    await systemScheduler.tick(at(61));
    expect(systemStore.maintenance().on).toBe(true);
    await app.inject({ method: 'PUT', url: '/api/admin/system/maintenance', headers: cookie(adminToken), payload: { on: false } });
    await systemScheduler.tick(at(65));
    expect(systemStore.maintenance().on).toBe(false);

    await app.inject({ method: 'PUT', url: '/api/admin/system/maintenance', headers: cookie(adminToken), payload: { on: true, message: 'เปิดเอง' } });
    await systemScheduler.tick(at(95));
    expect(systemStore.maintenance()).toMatchObject({ on: true, auto: null });
    await app.inject({ method: 'PUT', url: '/api/admin/system/maintenance', headers: cookie(adminToken), payload: { on: false } });
    await app.inject({ method: 'DELETE', url: `/api/admin/system/notices/${id}`, headers: cookie(adminToken) });
  });
});

describe('ประกาศอัตโนมัติ: แก้/ลบระหว่างที่ปิดปรับปรุงอยู่ (เวลาจริง)', async () => {
  const { systemScheduler } = await import('../src/system/scheduler');
  const { systemStore } = await import('../src/system/system-store');
  const at = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const wait = () => new Promise(r => setTimeout(r, 150));
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });
  // เวลาเริ่มปิดปรับปรุงผ่านมาแล้ว 1 นาที → อยู่ในช่วงปิดปรับปรุงตอนนี้
  const mStart = at(-1);
  const body = (mEnd: string, extra: object = {}) => ({ message: 'ปิดปรับปรุง', level: 'warning', startsAt: at(-10), endsAt: at(240), maintenanceStart: mStart, maintenanceEnd: mEnd, autoMaintenance: true, ...extra });
  const save = (payload: object, id?: number) => app.inject({
    method: id ? 'PUT' : 'POST', url: id ? `/api/admin/system/notices/${id}` : '/api/admin/system/notices', headers: cookie(adminToken), payload,
  });
  const remove = (id: number) => app.inject({ method: 'DELETE', url: `/api/admin/system/notices/${id}`, headers: cookie(adminToken) });

  it('แก้เวลาจบระหว่างปิดปรับปรุง → ข้อความเปลี่ยนตาม (โหมดยังเปิด) · ลบประกาศ → ปิดโหมดทันที', async () => {
    const id = (await save(body(at(60)))).json().id;
    await wait();
    const before = systemStore.maintenance();
    expect(before).toMatchObject({ on: true, auto: id });
    const newEnd = at(20);
    await save(body(newEnd), id);
    await wait();
    const after = systemStore.maintenance();
    expect(after.on).toBe(true);
    expect(after.since).toBe(before.since);
    expect(after.message).toBe(`ปิดปรับปรุงตามกำหนด ถึง ${hhmm(newEnd)} น.`);

    await remove(id);
    await wait();
    expect(systemStore.maintenance().on).toBe(false);
  });

  it('ผู้ดูแลกดปิดโหมดก่อนเวลา แล้วแก้ข้อความประกาศ → ระบบไม่เปิดซ้ำ · เอาติ๊กอัตโนมัติออก → ปิดโหมด', async () => {
    const id = (await save(body(at(60)))).json().id;
    await wait();
    expect(systemStore.maintenance().on).toBe(true);
    await app.inject({ method: 'PUT', url: '/api/admin/system/maintenance', headers: cookie(adminToken), payload: { on: false } });
    await save(body(at(60), { message: 'แก้ข้อความ' }), id);
    await wait();
    await systemScheduler.tick();
    expect(systemStore.maintenance().on).toBe(false);
    await remove(id);

    const id2 = (await save(body(at(60)))).json().id;
    await wait();
    expect(systemStore.maintenance()).toMatchObject({ on: true, auto: id2 });
    await save(body(at(60), { autoMaintenance: false }), id2);
    await wait();
    expect(systemStore.maintenance().on).toBe(false);
    await remove(id2);
  });
});

describe('ประกาศที่มีเวลาปิดปรับปรุง: เลิกแสดงประกาศ = เริ่มปิดปรับปรุง', () => {
  const at = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const post = (payload: object) => app.inject({ method: 'POST', url: '/api/admin/system/notices', headers: cookie(adminToken), payload });

  it('ระบบตั้งเวลาเลิกแสดงประกาศเป็นเวลาเริ่มปิดปรับปรุงให้เอง (ไม่สนค่าที่ส่งมา)', async () => {
    const mStart = at(120);
    const res = await post({ message: 'ปิดปรับปรุง', level: 'warning', startsAt: at(-5), endsAt: at(999), maintenanceStart: mStart, maintenanceEnd: at(150) });
    expect(res.statusCode).toBe(200);
    expect(res.json().endsAt).toBe(mStart);
    await app.inject({ method: 'DELETE', url: `/api/admin/system/notices/${res.json().id}`, headers: cookie(adminToken) });
  });

  it('เวลาเริ่มปิดปรับปรุงต้องหลังเวลาเริ่มแสดงประกาศ', async () => {
    const res = await post({ message: 'x', level: 'info', startsAt: at(60), maintenanceStart: at(30), maintenanceEnd: at(90) });
    expect(res.statusCode).toBe(400);
  });
});

describe('ตั้งเวลาปิดโหมดปิดปรับปรุง / เปิดหน้ากลับเอง', async () => {
  const { systemScheduler } = await import('../src/system/scheduler');
  const { systemStore } = await import('../src/system/system-store');
  const at = (m: number) => new Date(Date.now() + m * 60_000);
  const setMaint = (payload: object) => app.inject({ method: 'PUT', url: '/api/admin/system/maintenance', headers: cookie(adminToken), payload });
  const setPages = (payload: object) => app.inject({ method: 'PUT', url: '/api/admin/system/page-maintenance', headers: cookie(adminToken), payload });
  const status = async () => (await app.inject({ method: 'GET', url: '/api/system/status' })).json();

  it('ถึงเวลาที่ตั้งแล้วปิดโหมดเอง · ก่อนเวลายังเปิดอยู่ · หน้าเว็บเห็นเวลา', async () => {
    const until = at(2).toISOString();
    expect((await setMaint({ on: true, message: '', until })).statusCode).toBe(200);
    expect((await status()).maintenance).toMatchObject({ on: true, until });
    expect(await systemScheduler.scheduleNext()).toBe(Date.parse(until));
    await systemScheduler.tick(at(1));
    expect(systemStore.maintenance().on).toBe(true);
    await systemScheduler.tick(at(3));
    expect(systemStore.maintenance()).toMatchObject({ on: false, until: null });
  });

  it('เลื่อนเวลาได้ (เวลาเริ่มคงเดิม) · ยกเลิกเวลาได้ · กดปิดเองก่อนเวลาได้', async () => {
    await setMaint({ on: true, message: 'อัปเดต', until: at(2).toISOString() });
    const since = systemStore.maintenance().since;
    await setMaint({ on: true, message: 'อัปเดต', until: at(10).toISOString() });
    expect(systemStore.maintenance()).toMatchObject({ on: true, since, message: 'อัปเดต' });
    await systemScheduler.tick(at(3));
    expect(systemStore.maintenance().on).toBe(true); // เลื่อนแล้ว ยังไม่ถึงเวลา

    await setMaint({ on: true, message: 'อัปเดต', until: null });
    await systemScheduler.tick(at(60));
    expect(systemStore.maintenance()).toMatchObject({ on: true, until: null }); // ไม่มีเวลา = เปิดค้าง

    await setMaint({ on: false });
    expect(systemStore.maintenance()).toMatchObject({ on: false, until: null });
  });

  it('เวลาที่ตั้งต้องอยู่ในอนาคต และไม่เกิน 7 วัน', async () => {
    expect((await setMaint({ on: true, until: at(-1).toISOString() })).json().message).toBe('เวลาที่ตั้งต้องอยู่ในอนาคต');
    expect((await setMaint({ on: true, until: at(8 * 24 * 60).toISOString() })).statusCode).toBe(400);
    expect((await setMaint({ on: true, until: 'abc' })).statusCode).toBe(400);
    expect((await setPages({ pages: ['physio'], until: at(-1).toISOString() })).statusCode).toBe(400);
    expect(systemStore.maintenance().on).toBe(false);
    expect(systemStore.pageMaintenance().pages).toEqual([]);
  });

  it('ปิดเฉพาะหน้า: ถึงเวลาแล้วเปิดทุกหน้ากลับเอง', async () => {
    const until = at(2).toISOString();
    expect((await setPages({ pages: ['physio', 'dental'], message: '', until })).statusCode).toBe(200);
    const shown = (await status()).pageMaintenance;
    expect(shown.until).toBe(until);
    expect([...shown.pages].sort()).toEqual(['dental', 'physio']);
    await systemScheduler.tick(at(1));
    expect(systemStore.pageMaintenance().pages).toHaveLength(2);
    await systemScheduler.tick(at(3));
    expect(systemStore.pageMaintenance()).toMatchObject({ pages: [], until: null });
  });

  it('รีสตาร์ทแล้วยังจำเวลาที่ตั้งไว้', async () => {
    const until = at(5).toISOString();
    await setMaint({ on: true, message: '', until });
    await setPages({ pages: ['physio'], until });
    expect((await systemStore.loadMaintenance()).until).toBe(until);
    expect((await systemStore.loadPageMaintenance()).until).toBe(until);
    await setMaint({ on: false });
    await setPages({ pages: [] });
  });
});

describe('หน้าต่าง "มีอะไรใหม่" — จำตามบัญชี', () => {
  const get = (headers = {}) => app.inject({ method: 'GET', url: '/api/system/whats-new', headers });
  const post = (version: string, headers = {}) => app.inject({ method: 'POST', url: '/api/system/whats-new', headers, payload: { version } });

  it('ผู้เยี่ยมชมใช้ไม่ได้ (จำในเบราว์เซอร์แทน)', async () => {
    expect((await get()).statusCode).toBe(401);
    expect((await post('0.2.0')).statusCode).toBe(401);
  });

  it('กดปิดแล้วจำไว้ · คนอื่นยังไม่ถือว่าเห็น · เลขเวอร์ชันต้องถูกรูปแบบ', async () => {
    expect((await get(cookie(userToken))).json()).toEqual({ seen: null });
    expect((await post('0.2.0', cookie(userToken))).statusCode).toBe(200);
    expect((await get(cookie(userToken))).json()).toEqual({ seen: '0.2.0' });
    expect((await get(cookie(adminToken))).json()).toEqual({ seen: null });
    expect((await post('<script>', cookie(userToken))).statusCode).toBe(400);
    expect((await get(cookie(userToken))).json()).toEqual({ seen: '0.2.0' });
  });
});

describe('รายชื่อผู้พัฒนา (หน้าติดต่อผู้พัฒนา)', () => {
  it('ผู้เยี่ยมชมได้ 401 · login แล้วได้รายชื่อ', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/contact/people' })).statusCode).toBe(401);
    const res = await app.inject({ method: 'GET', url: '/api/contact/people', headers: cookie(userToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().people.length).toBeGreaterThan(0);
    expect(res.headers['cache-control']).toContain('no-store');
  });
});
