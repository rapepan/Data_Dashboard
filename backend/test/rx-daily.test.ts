import { describe, expect, it } from 'vitest';
import { opdPrescriptions } from '../src/services/rx-daily';
import { RX_DAILY } from '../src/services/rx-daily-data';

describe('ใบสั่งยาที่มียาต่อวัน (หน้า OPD)', () => {
  it('วันที่มีข้อมูลจริง → ใช้ค่าจริงตรงตัว', () => {
    const r = opdPrescriptions('2026-10-05', '2026-10-06'); // จันทร์–อังคาร
    const [v1, w1] = RX_DAILY['2026-10-05'];
    const [v2, w2] = RX_DAILY['2026-10-06'];
    expect(r.total).toBe(w1 + w2);
    expect(r.visits).toBe(v1 + v2);
    expect(r.daily.withDrug).toEqual([w1, w2]);
    expect(r.daily.noDrug).toEqual([v1 - w1, v2 - w2]);
    expect(r.workdays).toBe(2);
    expect(r.perWeekend).toBeNull();
    expect(r.perWorkday.value).toBe(Math.round(((w1 + w2) / 2) * 10) / 10);
  });

  it('แยกวันทำการ / เสาร์–อาทิตย์ · วันที่ไม่มีข้อมูล (อนาคต) ใช้ค่าเฉลี่ยตามวัน ไม่เป็น 0', () => {
    const r = opdPrescriptions('2026-10-03', '2026-10-09'); // ส.–ศ. · 07–09 ยังไม่มีในตาราง
    expect(r.workdays).toBe(5);
    expect(r.weekendDays).toBe(2);
    expect(r.daily.dates).toHaveLength(7);
    expect(r.daily.withDrug.every(n => n > 0)).toBe(true);
    expect(r.perWorkday.value).toBeGreaterThan(r.perWeekend!);
    expect(r.pct).toBeGreaterThan(30);
    expect(r.pct).toBeLessThan(80);
  });
});
