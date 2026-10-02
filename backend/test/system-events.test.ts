import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { systemEvents } from '../src/system/events';
import { systemScheduler } from '../src/system/scheduler';

/** ช่องสัญญาณสด (SSE) — เปิดพอร์ตจริง เพราะ app.inject() อ่านข้อมูลที่ไหลค้างไม่ได้ */
let app: FastifyInstance;
let base = '';
let adminCookie = '';

beforeAll(async () => {
  app = await buildApp({ logRequests: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  adminCookie = `bsth_session=${app.jwt.sign({ sub: '__test_admin', name: 'ผู้ดูแลทดสอบ', group: 'ผู้ดูแลระบบ', pos: '' })}`;
});

afterAll(async () => {
  systemEvents.closeAll();
  await app.close();
});

/** ต่อช่องสัญญาณ แล้วอ่านทีละเหตุการณ์ 'status' */
async function connect() {
  const abort = new AbortController();
  const res = await fetch(`${base}/api/system/events`, { signal: abort.signal });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const next = async (timeoutMs = 2000): Promise<Record<string, any>> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const match = buffer.match(/event: status\ndata: (.*)\n\n/);
      if (match) {
        buffer = buffer.slice(match.index! + match[0].length);
        return JSON.parse(match[1]);
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('ไม่ได้รับเหตุการณ์ status ในเวลาที่กำหนด');
      const chunk = await Promise.race([reader.read(), new Promise<null>(r => setTimeout(() => r(null), left))]);
      if (chunk === null) continue;
      if (chunk.done) throw new Error('ช่องสัญญาณปิด');
      buffer += chunk.value;
    }
  };
  const close = () => { abort.abort(); return new Promise(r => setTimeout(r, 50)); };
  return { res, next, close };
}

const admin = (method: string, url: string, payload: object) => fetch(`${base}/api${url}`, {
  method, headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
});

describe('GET /api/system/events (ช่องสัญญาณสด)', () => {
  it('ต่อแล้วได้สถานะปัจจุบันทันที — ไม่ต้อง login', async () => {
    const live = await connect();
    expect(live.res.status).toBe(200);
    expect(live.res.headers.get('content-type')).toContain('text/event-stream');
    expect(live.res.headers.get('x-accel-buffering')).toBe('no');
    const first = await live.next();
    expect(first).toMatchObject({ maintenance: { on: false }, notices: [] });
    expect(typeof first.version).toBe('string');
    expect(systemEvents.count()).toBe(1);
    await live.close();
    expect(systemEvents.count()).toBe(0);
  });

  it('ผู้ดูแลเปิด/ปิดโหมดปิดปรับปรุง → หน้าเว็บที่เปิดค้างได้สถานะใหม่ทันที', async () => {
    const live = await connect();
    await live.next();
    await admin('PUT', '/admin/system/maintenance', { on: true, message: 'ทดสอบช่องสัญญาณสด' });
    expect((await live.next()).maintenance).toMatchObject({ on: true, message: 'ทดสอบช่องสัญญาณสด' });
    await admin('PUT', '/admin/system/maintenance', { on: false });
    expect((await live.next()).maintenance.on).toBe(false);
    await live.close();
  });

  it('ปิดรายหน้า / สร้าง-ลบประกาศ → ส่งทันที (ทุกเส้นได้เหมือนกัน)', async () => {
    const a = await connect();
    const b = await connect();
    await a.next(); await b.next();

    await admin('PUT', '/admin/system/page-maintenance', { pages: ['physio'], message: '' });
    expect((await a.next()).pageMaintenance.pages).toEqual(['physio']);
    expect((await b.next()).pageMaintenance.pages).toEqual(['physio']);
    await admin('PUT', '/admin/system/page-maintenance', { pages: [] });
    await a.next(); await b.next();

    const now = Date.now();
    const created = await admin('POST', '/admin/system/notices', {
      message: 'ประกาศทดสอบ SSE', level: 'info', startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 600_000).toISOString(),
    });
    const id = (await created.json()).id;
    expect((await a.next()).notices.map((n: { id: number }) => n.id)).toContain(id);
    await admin('DELETE', `/admin/system/notices/${id}`, {});
    expect((await a.next()).notices).toEqual([]);
    await a.close(); await b.close();
  });

  it('สถานะไม่เปลี่ยน → ไม่ส่งซ้ำ', async () => {
    const live = await connect();
    await live.next();
    await systemEvents.broadcast();
    await expect(live.next(300)).rejects.toThrow('ไม่ได้รับ');
    await live.close();
  });
});

describe('ตั้งเวลาตรวจครั้งถัดไปตรงเหตุการณ์', () => {
  it('เลือกเวลาที่ใกล้ที่สุดในอนาคต (รวมเวลาปิดปรับปรุงอัตโนมัติ)', async () => {
    const now = Date.now();
    const iso = (s: number) => new Date(now + s * 1000).toISOString();
    const res = await admin('POST', '/admin/system/notices', {
      message: 'ทดสอบตั้งเวลา', level: 'warning', startsAt: iso(-60), maintenanceStart: iso(120), maintenanceEnd: iso(300), autoMaintenance: true,
    });
    const id = (await res.json()).id;
    expect(await systemScheduler.scheduleNext(now)).toBe(Date.parse(iso(120)));
    expect(await systemScheduler.scheduleNext(now + 200_000)).toBe(Date.parse(iso(300)));
    expect(await systemScheduler.scheduleNext(now + 400_000)).toBeNull();
    await admin('DELETE', `/admin/system/notices/${id}`, {});
  });
});
