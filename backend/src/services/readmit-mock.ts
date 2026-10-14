import { BD, icdName, rankItemsVec } from './breakdown';
import { rangePersons, rangeTotal } from './daily';
import type { ReadmitReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้า Re-admit 28 วัน — ใช้ระหว่างยังไม่ดึงจาก HOSxP (an_stat: admit ซ้ำภายใน 28 วันหลังจำหน่าย)
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
export const WARDS = [
  { key: 'all', label: 'ทุกหอผู้ป่วย' },
  { key: '02', label: 'Ward 2' },
  { key: '07', label: 'Home Ward' },
];



export function generateReadmitReport(start: string, end: string, ward: string): ReadmitReport {
  const wardKey = WARDS.some(w => w.key === ward) ? ward : 'all';
  // re-admit ของช่วง = ยอดจริงรายวัน (daily-data.ts: admit ซ้ำ ≤ 28 วันหลังจำหน่าย) แยกหอได้
  const col = wardKey === '02' ? 1 : wardKey === '07' ? 2 : 0;
  const visits = rangeTotal('readmit', start, end, col);
  // รายการโรค: ยอดจริงรายเดือนต่อรหัส (an_stat.pdx ของ admit ซ้ำ) แยกหอ · ชื่อไทยถ้ามี
  const vcol = wardKey === '02' ? 0 : wardKey === '07' ? 1 : 2;
  const items = rankItemsVec(BD.readmitDx, start, end, 3, vcol)
    .slice(0, 15)
    .map(([code, v]) => { const n = icdName(code); return { code, name: n.nameTh ?? n.name, count: Math.round(v[vcol]) }; })
    .filter(item => item.count > 0);
  return {
    start,
    end,
    ward: wardKey,
    wards: WARDS,
    visits,
    // คนเดิมกลับมาซ้ำหลายครั้งได้ — อัตราคน/ครั้งจริงตามความยาวช่วง
    persons: Math.min(visits, Math.max(visits ? 1 : 0, Math.round(rangePersons('readmit', start, end) * (visits / Math.max(1, rangeTotal('readmit', start, end)))))),
    items,
  };
}
