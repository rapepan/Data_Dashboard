import type { Minutes, QueueReport } from '../types/reports.types';
import { QUEUE_DAILY, QUEUE_MONTHLY, QUEUE_STEPS } from './real-series';

/**
 * ระยะเวลารอคอยคิว OPD — อิง service_time ของ HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, วันทำการ)
 * ลำดับจุดบริการอนุมานจากเวลาเฉลี่ยหลังมาถึง (ดู real-series.ts) · ขั้น "รอพบแพทย์ + ตรวจรักษา" แยกกันไม่ได้ในฐาน
 * - รายวัน: วันที่มีในข้อมูลจริง (45 วันล่าสุด, ตัดวันที่เวลาบันทึกไม่เรียงลำดับ) ใช้ค่าจริง · วันอื่นใช้ค่ารายเดือนจริงแกว่งเล็กน้อย
 * - รายเดือน: ค่าจริง 13 เดือนล่าสุด · เดือนที่ไม่มีข้อมูล = null
 */
const round1 = (value: number) => Math.round(value * 10) / 10;
const vary = (base: number, swing = 0.15) => Math.max(0.3, base * (1 + (Math.random() * 2 - 1) * swing));

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** ผลรวมเวลาทุกขั้น (ขั้นที่ไม่มีข้อมูลนับเป็น 0) */
function sum(values: Minutes[]) {
  return round1(values.reduce<number>((acc, v) => acc + (v ?? 0), 0));
}

export function generateQueueReport(start: string, end: string): QueueReport {
  const dates: string[] = [];
  for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(iso(d));
  }
  const perDate = dates.map(date => {
    const real = QUEUE_DAILY[date];
    if (real) return real;
    const month = QUEUE_MONTHLY[date.slice(0, 7)];
    return month ? month.map(v => round1(vary(v))) : QUEUE_STEPS.map(() => null);
  });
  const values: Minutes[][] = QUEUE_STEPS.map((_, si) => perDate.map(day => day[si]));
  const total = perDate.map(day => sum(day));

  const avg = (step: Minutes[]) => {
    const known = step.filter((v): v is number => v !== null);
    return known.length ? round1(known.reduce((a, v) => a + v, 0) / known.length) : null;
  };
  const averageSteps = values.map(avg);

  const endDate = new Date(`${end}T00:00:00`);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const key = iso(new Date(endDate.getFullYear(), endDate.getMonth() - i, 1)).slice(0, 7);
    const steps: Minutes[] = QUEUE_MONTHLY[key] ?? QUEUE_STEPS.map(() => null);
    return { month: key, steps, total: sum(steps) };
  });

  return {
    start,
    end,
    steps: QUEUE_STEPS,
    average: { steps: averageSteps, total: sum(averageSteps) },
    daily: { dates, values, total },
    monthly,
  };
}
