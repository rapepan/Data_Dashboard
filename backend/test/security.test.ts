import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loginThrottle } from '../src/auth/auth.service';
import { systemEvents } from '../src/system/events';

/** ด่านกันเดารหัส / กันเปิดช่องสัญญาณสดท่วม — ไม่แตะ HOSxP (โดนพักก่อนถึงขั้นตรวจรหัส) */
let app: FastifyInstance;
let base = '';

beforeAll(async () => {
  app = await buildApp({ logRequests: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  systemEvents.closeAll();
  await app.close();
});

describe('login ผิดหลายบัญชีจากเครื่องเดียว', () => {
  it('ผิดครบ 30 ครั้ง (คนละชื่อ) → พักทั้งเครื่อง · เครื่องอื่นไม่โดน', async () => {
    const ip = '10.9.9.9';
    for (let i = 0; i < 29; i++) await loginThrottle.fail(`__spray${i}`, ip);
    expect(await loginThrottle.ipBlocked(ip)).toBe(false);
    expect(await loginThrottle.isBlocked('__spray0', ip)).toBe(false); // แต่ละชื่อผิดแค่ครั้งเดียว
    await loginThrottle.fail('__spray29', ip);
    expect(await loginThrottle.ipBlocked(ip)).toBe(true);
    expect(await loginThrottle.ipBlocked('10.9.9.10')).toBe(false);
  });

  it('เครื่องที่ถูกพัก login ได้ 429 ทันที (ไม่ส่งไปตรวจรหัสกับ HOSxP)', async () => {
    for (let i = 0; i < 30; i++) await loginThrottle.fail(`__spray${i}`, '127.0.0.1');
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.1', payload: { loginname: '__x', password: 'x' } });
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toContain('เครื่องนี้');
  });
});

describe('ช่องสัญญาณสด: จำกัดต่อเครื่อง', () => {
  it('เครื่องเดียวเปิดได้ 20 เส้น เส้นที่ 21 ได้ 429 · ปิดแล้วเปิดใหม่ได้', async () => {
    const aborts: AbortController[] = [];
    const open = async () => { const a = new AbortController(); aborts.push(a); return fetch(`${base}/api/system/events`, { signal: a.signal }); };
    for (let i = 0; i < 20; i++) expect((await open()).status).toBe(200);
    expect((await open()).status).toBe(429);
    aborts[0].abort();
    await new Promise(r => setTimeout(r, 100));
    expect((await open()).status).toBe(200);
    aborts.forEach(a => a.abort());
    await new Promise(r => setTimeout(r, 100));
    expect(systemEvents.count()).toBe(0);
  });
});
