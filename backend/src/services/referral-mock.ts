import { BD, icdName, rankItemsVec } from './breakdown';
import { dayValue, rangeTotal } from './daily';
import type { ReferralReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้าการส่งต่อผู้ป่วย (Refer Out) — ใช้ระหว่างยังไม่ดึงจาก HOSxP (referout)
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
export const POINTS = [
  { key: 'all', label: 'ทุกจุดส่งต่อ' },
  { key: 'opd', label: 'ผู้ป่วยนอก (OPD)' },
  { key: 'er', label: 'อุบัติเหตุ-ฉุกเฉิน (ER)' },
  { key: 'ipd', label: 'ผู้ป่วยใน (IPD)' },
];


function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}


export function generateReferralReport(start: string, end: string, point: string): ReferralReport {
  const pointKey = POINTS.some(p => p.key === point) ? point : 'all';
  const days = daysBetween(start, end);
  // ส่งต่อของช่วง = ยอดจริงรายวัน (daily-data.ts: referout แยกจุด OPD / ER / IPD)
  const col = ({ all: 0, opd: 1, er: 2, ipd: 3 } as Record<string, number>)[pointKey] ?? 0;
  const total = rangeTotal('refer', start, end, col);
  const avgPerDay = total / days;
  // รายการโรค: ยอดจริงรายเดือนต่อรหัส (referout.pdx 40 รหัสที่พบมากสุด) แยกจุดส่งต่อ · ชื่อไทยถ้ามี
  const vcol = ({ opd: 0, er: 1, ipd: 2, all: 3 } as Record<string, number>)[pointKey] ?? 3;
  const items = rankItemsVec(BD.referDx, start, end, 4, vcol)
    .slice(0, 15)
    .map(([code, v]) => { const n = icdName(code); return { code, name: n.nameTh ?? n.name, count: Math.round(v[vcol]) }; })
    .filter(item => item.count > 0);

  return {
    start,
    end,
    point: pointKey,
    points: POINTS,
    total,
    day: { date: end, count: Math.round(dayValue('refer', end, col)) },
    days,
    avgPerDay: Math.round(avgPerDay * 10) / 10,
    items,
  };
}
