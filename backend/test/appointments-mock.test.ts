import { describe, expect, it } from 'vitest';
import { generateOpdAppointments } from '../src/services/opd-appointments-mock';

const sum = (rows: { total: number }[]) => rows.reduce((s, r) => s + r.total, 0);

describe('ข้อมูลจำลองนัดหมายรายคลินิก', () => {
  it('วันเดียวกันได้ตัวเลขเดิมเสมอ (ไม่แกว่งทุกครั้งที่โหลด)', () => {
    const a = generateOpdAppointments('2026-09-29');
    const b = generateOpdAppointments('2026-09-29');
    expect(a.today.clinics.map(c => [c.clinic, c.total])).toEqual(b.today.clinics.map(c => [c.clinic, c.total]));
  });

  it('ยอดรวมเท่ากับผลรวมรายคลินิก และเรียงจากมากไปน้อย', () => {
    const { today, tomorrow } = generateOpdAppointments('2026-09-29');
    expect(today.total).toBe(sum(today.clinics));
    expect(tomorrow.total).toBe(sum(tomorrow.clinics));
    const totals = today.clinics.map(c => c.total);
    expect(totals).toEqual([...totals].sort((x, y) => y - x));
  });

  it('วันที่ผ่านไปแล้ว: ผู้ป่วยมาตามนัดเกือบครบ และไม่เกินจำนวนนัด', () => {
    const { today } = generateOpdAppointments('2026-09-29');
    expect(today.arrived).toBeLessThanOrEqual(today.total);
    expect(today.arrived / today.total).toBeGreaterThan(0.7);
    for (const c of today.clinics) expect(c.arrived).toBeLessThanOrEqual(c.total);
  });

  it('วันพรุ่งนี้ยังไม่มีใครมา (arrived = 0)', () => {
    expect(generateOpdAppointments('2026-09-29').tomorrow.arrived).toBe(0);
  });

  it('แผงล่วงหน้าตรงกับแผงวันนี้ของวันเดียวกัน (จำนวนนัดเท่ากัน)', () => {
    const asToday = generateOpdAppointments('2026-09-30').today;
    const asTomorrow = generateOpdAppointments('2026-09-29').tomorrow;
    expect(asTomorrow.date).toBe('2026-09-30');
    expect(asTomorrow.total).toBe(asToday.total);
  });

  it('วันเสาร์-อาทิตย์ มีนัดน้อยมาก (เหลือแค่ ER)', () => {
    const saturday = generateOpdAppointments('2026-10-03').today;
    expect(saturday.clinics.every(c => c.clinic.includes('ER'))).toBe(true);
  });
});
