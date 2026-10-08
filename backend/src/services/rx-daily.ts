import { RX_DAILY } from './rx-daily-data';
import type { OpdReport } from '../types/reports.types';

/**
 * ใบสั่งยาที่มียา (ผู้ป่วยนอก) รายวัน — 1 ใบ = visit ผู้ป่วยนอก 1 ครั้งที่มีรายการยาอย่างน้อย 1 รายการ
 * (นิยามเดียวกับการ์ด "ผู้ป่วยนอกที่รับยา" หน้าปริมาณการใช้ยา)
 * วันที่มีในตารางจริงใช้ค่าจริง · วันที่ไม่มี (เช่น วันนี้) ใช้ค่าเฉลี่ยตามวันในสัปดาห์ของข้อมูลจริง
 */
const DAY = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const weekday = (iso: string) => toDate(iso).getUTCDay();
const isWeekend = (iso: string) => weekday(iso) === 0 || weekday(iso) === 6;

/** ค่าเฉลี่ยตามวันในสัปดาห์ (0 = อาทิตย์) จากข้อมูลจริงทั้งหมด */
const DOW_AVG = (() => {
  const sum = Array.from({ length: 7 }, () => ({ n: 0, visits: 0, withDrug: 0 }));
  for (const [iso, [visits, withDrug]] of Object.entries(RX_DAILY)) {
    const s = sum[weekday(iso)];
    s.n++; s.visits += visits; s.withDrug += withDrug;
  }
  return sum.map(s => (s.n ? [Math.round(s.visits / s.n), Math.round(s.withDrug / s.n)] : [0, 0]) as [number, number]);
})();

function dayValue(iso: string): [visits: number, withDrug: number] {
  return RX_DAILY[iso] ?? DOW_AVG[weekday(iso)];
}

function dates(start: string, end: string) {
  const out: string[] = [];
  for (let t = toDate(start).getTime(); t <= toDate(end).getTime(); t += DAY) out.push(isoOf(new Date(t)));
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function summarize(start: string, end: string) {
  const days = dates(start, end);
  const rows = days.map(d => ({ d, v: dayValue(d) }));
  const work = rows.filter(r => !isWeekend(r.d));
  const weekend = rows.filter(r => isWeekend(r.d));
  const total = rows.reduce((s, r) => s + r.v[1], 0);
  const visits = rows.reduce((s, r) => s + r.v[0], 0);
  return {
    rows, work, weekend, total, visits,
    perWorkday: work.length ? round1(work.reduce((s, r) => s + r.v[1], 0) / work.length) : 0,
    perWeekend: weekend.length ? round1(weekend.reduce((s, r) => s + r.v[1], 0) / weekend.length) : null,
  };
}

/** ช่วงก่อนหน้าที่ยาวเท่ากัน (สำหรับ % เทียบ) */
function previous(start: string, end: string) {
  const days = Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY) + 1;
  const prevEnd = toDate(start).getTime() - DAY;
  return { start: isoOf(new Date(prevEnd - (days - 1) * DAY)), end: isoOf(new Date(prevEnd)) };
}

/** visit ผู้ป่วยนอกทั้งหมดในช่วง (ยอดจริงรายวัน) + % เทียบช่วงก่อน — การ์ด "จำนวนผู้ป่วยทั้งหมด" ใช้ตัวนี้ ให้ตรงกับตัวหารของใบสั่งยา */
export function opdVisits(start: string, end: string): { value: number; previous: number; prevRange: { start: string; end: string }; change?: number } {
  const cur = summarize(start, end).visits;
  const prevRange = previous(start, end);
  const before = summarize(prevRange.start, prevRange.end).visits;
  return before ? { value: cur, previous: before, prevRange, change: Math.round(((cur - before) / before) * 100) } : { value: cur, previous: 0, prevRange };
}

export function opdPrescriptions(start: string, end: string): OpdReport['prescriptions'] {
  const cur = summarize(start, end);
  const prev = previous(start, end);
  const before = summarize(prev.start, prev.end);
  const change = before.perWorkday ? Math.round(((cur.perWorkday - before.perWorkday) / before.perWorkday) * 100) : undefined;
  return {
    perWorkday: change === undefined ? { value: cur.perWorkday } : { value: cur.perWorkday, change },
    perWeekend: cur.perWeekend,
    total: cur.total,
    visits: cur.visits,
    pct: cur.visits ? round1((cur.total / cur.visits) * 100) : 0,
    workdays: cur.work.length,
    weekendDays: cur.weekend.length,
    daily: {
      dates: cur.rows.map(r => r.d),
      withDrug: cur.rows.map(r => r.v[1]),
      noDrug: cur.rows.map(r => r.v[0] - r.v[1]),
    },
  };
}
