import { describe, expect, it } from 'vitest';
import { changeVsPrevious, dayValue, fiscalMonthly, rangePersons, rangeTotal } from '../src/services/daily';
import { DAILY, DAILY_FROM, DAILY_UPTO } from '../src/services/daily-data';

/** ข้อมูลจำลองอิงยอดจริงรายวัน (daily-data.ts) — ยอดของช่วงต้องตรงผลรวมของตาราง */
const sumOf = (key: keyof typeof DAILY, start: string, end: string, col = 0) =>
  Object.entries(DAILY[key] as Record<string, number[]>).filter(([d]) => d >= start && d <= end).reduce((s, [, v]) => s + (v[col] ?? 0), 0);

describe('ยอดของช่วงจากยอดจริงรายวัน', () => {
  it('ช่วงที่อยู่ในข้อมูล = ผลรวมของตารางตรงตัว (วันที่ไม่มีแถว = 0)', () => {
    expect(rangeTotal('er', DAILY_FROM, DAILY_UPTO)).toBe(sumOf('er', DAILY_FROM, DAILY_UPTO));
    expect(rangeTotal('refer', '2026-09-01', '2026-09-30', 2)).toBe(sumOf('refer', '2026-09-01', '2026-09-30', 2));
    expect(rangeTotal('postal', DAILY_FROM, DAILY_UPTO)).toBe(sumOf('postal', DAILY_FROM, DAILY_UPTO));
  });

  it('วันหลังข้อมูล (อนาคต) ใช้ค่าเฉลี่ยตามวันในสัปดาห์ ไม่เป็น 0 สำหรับบริการที่มีทุกวัน', () => {
    expect(dayValue('er', '2099-01-05')).toBeGreaterThan(0);
  });

  it('รายเดือนของปีงบรวมกันเท่ายอดทั้งปีงบ · เดือนที่ยังไม่ถึง = 0', () => {
    const months = fiscalMonthly('dental', '2026-09-30');
    expect(months.reduce((a, b) => a + b, 0)).toBe(rangeTotal('dental', '2025-10-01', '2026-09-30'));
    expect(fiscalMonthly('dental', '2026-10-13').slice(1).every(v => v === 0)).toBe(true);
  });

  it('คน 1 วัน = คนไม่ซ้ำของวันนั้น · ช่วงยาว คนน้อยกว่าผลรวมคนต่อวัน', () => {
    const [, p] = (DAILY.thai as Record<string, number[]>)['2026-09-01'] ?? [0, 0];
    expect(rangePersons('thai', '2026-09-01', '2026-09-01')).toBe(p);
    expect(rangePersons('thai', '2025-10-01', '2026-09-30')).toBeLessThan(rangeTotal('thai', '2025-10-01', '2026-09-30', 1));
  });

  it('% เทียบช่วงก่อนคิดจากยอดจริง', () => {
    const cur = rangeTotal('er', '2026-09-16', '2026-09-30');
    const prev = rangeTotal('er', '2026-09-01', '2026-09-15');
    expect(changeVsPrevious('er', '2026-09-16', '2026-09-30')).toBe(Math.round(((cur - prev) / prev) * 100));
  });
});
