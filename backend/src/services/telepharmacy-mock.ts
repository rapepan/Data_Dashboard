import { dayValue, fiscalMonthly, fiscalStartYearOf, monthStart, rangePersons, rangeTotal, changeVsPrevious, dates } from './daily';
import { TELERX_DRUGS, TELERX_RIGHTS } from './telerx-data';
import type { DrugItem, TelepharmacyReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้า Telepharmacy — ระยะแรกแสดง "การจ่ายยาให้ผู้ป่วยที่รับบริการทางไกล" (visit แผนก 055 ที่มีรายการยา)
 * HOSxP ยังไม่มีบันทึกงานเภสัชกรให้บริการทางไกลโดยตรง (ตรวจ 07/10/2569) — เมื่อห้องยาเริ่มบันทึก ค่อยเพิ่มส่วนนั้น
 * ยอดจริงรายวัน: daily-data.ts ชุด telerx [ครั้ง, คน, รายการ, ชิ้น, ทุน, ขาย] · รายยา/สิทธิ: telerx-data.ts
 */
const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
const COL = { visits: 0, persons: 1, items: 2, qty: 3, cost: 4, sale: 5 } as const;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ยอดรวมของช่วง */
function totals(start: string, end: string) {
  return {
    visits: rangeTotal('telerx', start, end, COL.visits),
    persons: rangePersons('telerx', start, end, COL.persons),
    items: rangeTotal('telerx', start, end, COL.items),
    qty: rangeTotal('telerx', start, end, COL.qty),
    cost: rangeTotal('telerx', start, end, COL.cost),
    sale: rangeTotal('telerx', start, end, COL.sale),
  };
}

/** อันดับยาของช่วง — ยอดรายเดือนจริงของแต่ละยา × สัดส่วนวันของเดือนที่ทับกับช่วง */
function topDrugs(start: string, end: string): DrugItem[] {
  const overlap = new Map<string, number>();
  for (const d of dates(start, end)) {
    const m = d.slice(0, 7);
    const [y, mo] = m.split('-').map(Number);
    overlap.set(m, (overlap.get(m) ?? 0) + 1 / new Date(y, mo, 0).getDate());
  }
  return Object.entries(TELERX_DRUGS)
    .map(([code, [name, unit, months]]) => {
      let qty = 0; let cost = 0; let value = 0;
      for (const [m, share] of overlap) {
        const v = months[m];
        if (v) { qty += v[0] * share; cost += v[1] * share; value += v[2] * share; }
      }
      return { code, name, unit, qty: Math.round(qty), cost: Math.round(cost * 100) / 100, value: Math.round(value * 100) / 100 };
    })
    .filter(d => d.qty > 0)
    .sort((a, b) => b.value - a.value || b.qty - a.qty);
}

export function generateTelepharmacyReport(start: string, end: string): TelepharmacyReport {
  const endDate = new Date(`${end}T00:00:00`);
  const fyStart = `${fiscalStartYearOf(end)}-10-01`;
  const mStart = monthStart(end);
  const range = totals(start, end);
  const teleVisits = rangeTotal('tele', start, end);
  const rightsTotal = TELERX_RIGHTS.reduce((a, [, n]) => a + n, 0) || 1;

  return {
    start,
    end,
    fiscalYear: fiscalStartYearOf(end) + 1 + 543,
    showMoney: true,
    range: { ...range, teleVisits, change: changeVsPrevious('telerx', start, end) },
    month: { visits: rangeTotal('telerx', mStart, end), persons: rangePersons('telerx', mStart, end), start: mStart, end: iso(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)) },
    day: { date: end, visits: Math.round(dayValue('telerx', end)) },
    fiscal: { visits: rangeTotal('telerx', fyStart, end), sale: rangeTotal('telerx', fyStart, end, COL.sale) },
    monthly: {
      labels: MONTHS,
      withDrug: fiscalMonthly('telerx', end, COL.visits),
      teleVisits: fiscalMonthly('tele', end),
      cost: fiscalMonthly('telerx', end, COL.cost),
      sale: fiscalMonthly('telerx', end, COL.sale),
    },
    topDrugs: topDrugs(start, end),
    // สัดส่วนสิทธิจริงทั้งช่วงข้อมูล × ครั้งของช่วงที่เลือก
    rights: (() => {
      // ปัดเศษแล้วใส่ส่วนต่างไว้สิทธิที่มากสุด ผลรวมจะเท่าจำนวนครั้งพอดี
      const list = TELERX_RIGHTS.map(([label, n]) => ({ label, value: Math.round((n / rightsTotal) * range.visits) }));
      if (list.length) list[0].value += range.visits - list.reduce((sum, x) => sum + x.value, 0);
      return list.filter(x => x.value > 0);
    })(),
  };
}
