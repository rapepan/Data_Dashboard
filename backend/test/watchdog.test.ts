import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyService } from '../src/services/notify.service';
import { watchdog } from '../src/system/watchdog';

/** แจ้งเตือนฐานข้อมูลล่ม — ไม่ส่งจริง (ชุดทดสอบปิด Telegram + ดักการเรียก) */
const MIN = 60_000;
const target = (ok: () => boolean) => ({ label: 'HOSxP', ping: async () => { if (!ok()) throw new Error('connect ETIMEDOUT'); }, downSince: null as number | null, alerted: false, error: '' });

afterEach(() => vi.restoreAllMocks());

describe('เฝ้าระบบ: แจ้งเมื่อฐานข้อมูลล่มเกิน 5 นาที', () => {
  it('ล่มไม่ถึง 5 นาทีไม่แจ้ง · ครบ 5 นาทีแจ้งครั้งเดียว · กลับมาแจ้งอีกครั้ง', async () => {
    const alert = vi.spyOn(notifyService, 'alert').mockImplementation(() => undefined);
    let up = false;
    const t = target(() => up);
    const t0 = Date.parse('2026-10-02T03:00:00Z');
    await watchdog._check(t, t0);
    await watchdog._check(t, t0 + 4 * MIN);
    expect(alert).not.toHaveBeenCalled();
    await watchdog._check(t, t0 + 5 * MIN);
    await watchdog._check(t, t0 + 6 * MIN);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toContain('ต่อ HOSxP ไม่ได้');
    expect(alert.mock.calls[0][0]).toContain('ETIMEDOUT');
    up = true;
    await watchdog._check(t, t0 + 12 * MIN);
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert.mock.calls[1][0]).toMatch(/กลับมาใช้งานได้แล้ว[\s\S]*12 นาที/);
  });

  it('ล่มสั้น ๆ แล้วกลับมาก่อนเกณฑ์ — ไม่แจ้งทั้งตอนล่มและตอนกลับ', async () => {
    const alert = vi.spyOn(notifyService, 'alert').mockImplementation(() => undefined);
    let up = false;
    const t = target(() => up);
    await watchdog._check(t, 0);
    up = true;
    await watchdog._check(t, 2 * MIN);
    expect(alert).not.toHaveBeenCalled();
    expect(t.downSince).toBeNull();
  });
});
