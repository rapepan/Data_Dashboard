import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { feedbackStore } from '../src/feedback/feedback-store';
import { feedbackMessage } from '../src/services/notify.service';

/** ประเภท "ยืนยันข้อมูล" — ผู้ใช้ยืนยันว่าใช้ข้อมูลตามที่ระบบแสดง ไม่ต้องแก้ */
let app: FastifyInstance;
let userToken = '';
let adminToken = '';
const cookie = (token: string) => ({ cookie: `bsth_session=${token}` });
const post = (payload: object, ip: string) => app.inject({ method: 'POST', url: '/api/feedback', headers: cookie(userToken), remoteAddress: ip, payload });
const body = (extra: Record<string, unknown> = {}) => ({ category: 'confirm', page: 'ผู้ป่วยนอก (OPD)', message: '', position: 'งานผู้ป่วยนอก', phone: '0987564785', lineId: 'test.line', images: [], ...extra });

beforeAll(async () => {
  app = await buildApp({ logRequests: false });
  await app.ready();
  userToken = app.jwt.sign({ sub: '__test_confirm', name: 'ผู้ยืนยันทดสอบ', group: 'พยาบาล', pos: 'งานผู้ป่วยนอก' });
  adminToken = app.jwt.sign({ sub: '__test_admin', name: 'ผู้ดูแลทดสอบ', group: 'ผู้ดูแลระบบ', pos: '' });
});
afterAll(async () => { await app.close(); });

describe('ยืนยันข้อมูล', () => {
  it('ไม่กรอกข้อความได้ (ใช้ข้อความมาตรฐาน) · ปิดเรื่องทันที · ไม่รับรูปแนบ', async () => {
    const res = await post(body({ images: ['data:image/png;base64,AAAA'] }), '10.1.0.1');
    expect(res.statusCode).toBe(200);
    const saved = (await feedbackStore.list()).find(e => e.id === res.json().id)!;
    expect(saved).toMatchObject({ category: 'confirm', status: 'done', page: 'ผู้ป่วยนอก (OPD)', message: 'ตรวจสอบแล้ว ใช้ข้อมูลตามที่ระบบแสดงอยู่ ไม่ต้องแก้ไข' });
    expect(saved.doneAt).toBeTruthy();
    expect(saved.images ?? []).toHaveLength(0);
    expect(feedbackMessage(saved)).toContain('✅ <b>ยืนยันข้อมูล</b>');
    // ไม่ค้างในกระดิ่งผู้ดูแล
    const bell = (await app.inject({ method: 'GET', url: '/api/admin/feedback/summary', headers: cookie(adminToken) })).json();
    expect(bell.latest.some((e: { id: string }) => e.id === saved.id)).toBe(false);
  });

  it('ยังบังคับเบอร์โทร + LINE · ต้องเลือกหน้ารายงาน (ไม่ใช่ "ทั่วไป")', async () => {
    expect((await post(body({ phone: '' }), '10.1.0.2')).statusCode).toBe(400);
    expect((await post(body({ lineId: '' }), '10.1.0.3')).statusCode).toBe(400);
    expect((await post(body({ page: 'ทั่วไป / ทั้งระบบ' }), '10.1.0.4')).json().message).toContain('เลือกหน้า');
  });

  it('ผู้ดูแลเห็นสรุปรายหน้า', async () => {
    await post(body({ page: 'ทันตกรรม (Dental)', message: 'ตัวเลขตรงกับทะเบียนแผนก' }), '10.1.0.5');
    const list = (await app.inject({ method: 'GET', url: '/api/admin/feedback', headers: cookie(adminToken) })).json();
    const dental = list.confirmations.find((c: { page: string }) => c.page === 'ทันตกรรม (Dental)');
    expect(dental).toMatchObject({ count: 1, people: [{ name: 'ผู้ยืนยันทดสอบ', position: 'งานผู้ป่วยนอก' }] });
    expect(list.confirmations.map((c: { page: string }) => c.page)).toContain('ผู้ป่วยนอก (OPD)');
  });
});
