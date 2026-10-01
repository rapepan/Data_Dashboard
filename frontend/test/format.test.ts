import { describe, expect, it } from 'vitest';
import { fiscalYear, fiscalYearStart, formatDmy, formatDuration, formatThaiMonth, parseIsoDate, toIsoDate } from '../src/utils/format';

describe('วันที่ (พ.ศ. dd/mm/yyyy)', () => {
  it('formatDmy แปลงเป็นปี พ.ศ.', () => {
    expect(formatDmy('2026-09-23')).toBe('23/09/2569');
    expect(formatDmy('2026-01-05')).toBe('05/01/2569');
  });

  it('toIsoDate / parseIsoDate ไป-กลับได้วันเดิม (ไม่เลื่อนวันเพราะ timezone)', () => {
    expect(toIsoDate(parseIsoDate('2026-10-01'))).toBe('2026-10-01');
    expect(toIsoDate(new Date(2026, 1, 28))).toBe('2026-02-28');
  });

  it('formatThaiMonth', () => {
    expect(formatThaiMonth('2026-09')).toBe('ก.ย. 2569');
  });
});

describe('ปีงบประมาณ (เริ่ม 1 ต.ค.)', () => {
  it('ก.ย. ยังเป็นปีงบเดิม ต.ค. ขึ้นปีงบใหม่', () => {
    expect(fiscalYear(new Date(2026, 8, 30))).toBe(2569);
    expect(fiscalYear(new Date(2026, 9, 1))).toBe(2570);
  });

  it('วันเริ่มปีงบ', () => {
    expect(toIsoDate(fiscalYearStart(new Date(2026, 8, 30)))).toBe('2025-10-01');
    expect(toIsoDate(fiscalYearStart(new Date(2026, 9, 1)))).toBe('2026-10-01');
  });
});

describe('formatDuration', () => {
  it('นาที → ชม:นาที:วินาที', () => {
    expect(formatDuration(65.5)).toBe('01:05:30');
    expect(formatDuration(0)).toBe('00:00:00');
  });
});
