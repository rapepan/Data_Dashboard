import { dayValue, rangeTotal } from './daily';
import { BD, monthShares, rankItems, sumMonths } from './breakdown';
import type { DentalBreakdown, DentalReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้าทันตกรรม — ใช้ระหว่างยังไม่ดึงจาก HOSxP (dtmain / dttm)
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
/** กลุ่มหัตถการตาม dttm_group (4 กลุ่มใหญ่สุด + อื่น ๆ) */
const CATEGORIES = ['ตรวจ', 'ทันตกรรมหัตถการ', 'ปริทันต์', 'ทันตศัลยกรรม', 'อื่น ๆ'];

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}


/**
 * ผู้ป่วย (ครั้งที่มาทำฟัน · dtmain visit ไม่ซ้ำ) ของช่วงจากยอดจริงรายวัน
 * หัตถการแต่ละกลุ่ม = ผู้ป่วย × หัตถการต่อครั้งจริงของเดือนที่ทับกับช่วง (breakdown-data.ts dentalCat ÷ ครั้งของเดือนเดียวกัน)
 */
function breakdown(from: string, to: string): DentalBreakdown {
  const patients = from === to ? Math.round(dayValue('dental', to)) : rangeTotal('dental', from, to);
  const shares = monthShares(from, to);
  let visits = 0;
  for (const [m, f] of shares) visits += rangeTotal('dental', `${m}-01`, monthEnd(m)) * f;
  const perVisit = CATEGORIES.map(c => (visits ? sumMonths(BD.dentalCat[c], shares) / visits : 0));
  return { patients, counts: perVisit.map(r => Math.round(patients * r)) };
}
const monthEnd = (ym: string) => { const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0); return iso(d); };


export function generateDentalReport(start: string, end: string): DentalReport {
  const endDate = new Date(`${end}T00:00:00`);
  const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const monthEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
  // ปีงบประมาณเริ่ม 1 ต.ค.
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;

  const monthLabels = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
  // หัตถการรายเดือนจริงตามกลุ่ม (dtmain + dttm_group) · เดือนของวันสิ้นสุดนับถึงวันนั้น · เดือนที่ยังไม่ถึง = 0
  const fyStart = `${fyStartYear}-10-01`;
  const monthly = CATEGORIES.map(c => Array.from({ length: 12 }, (_, i) => {
    const d = new Date(fyStartYear, 9 + i, 1);
    const first = iso(d);
    if (first > end) return 0;
    const last = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return Math.round(sumMonths(BD.dentalCat[c], monthShares(first, last < end ? last : end)));
  }));
  const fiscalShare = monthly.map(series => series.reduce((a, b) => a + b, 0));

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    categories: CATEGORIES,
    range: breakdown(start, end),
    // นับถึงวันสิ้นสุดที่เลือก (วันหลังจากนั้นในเดือนยังไม่เกิดขึ้น)
    month: { ...breakdown(iso(monthStart), end), start: iso(monthStart), end: iso(monthEndDate) },
    day: { ...breakdown(end, end), date: end },
    fiscalShare,
    // อันดับหัตถการสะสมปีงบ (dtmain + dttm.name จริง)
    topProcedures: rankItems(BD.dentalProc, fyStart, end).slice(0, 15).map(([key, value]) => ({ label: key.slice(key.indexOf('|') + 1) || key, value: Math.round(value) })),
    monthly: { labels: monthLabels, counts: monthly },
  };
}
