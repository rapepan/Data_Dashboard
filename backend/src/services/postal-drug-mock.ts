import type { LabelValue, PostalDrugReport } from '../types/reports.types';
import { fiscalSeries } from './fiscal-series';
import { POSTAL_DELIVERIES } from './fiscal-data';

/**
 * ข้อมูลจำลองหน้าการส่งยาทางไปรษณีย์ — อิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569)
 * ตาราง prscrpt_delivery_med (สั่งส่งยาที่บ้าน) + prscrpt_delivery / _company / _add
 * ไม่แสดงสถานะการจัดส่ง — ในฐานยังไม่มีการบันทึกสถานะ
 * ของจริงยังใช้น้อย: 22 ครั้ง ตั้งแต่ พ.ย. 2567 (~1 ครั้ง/เดือน) · ยาเฉลี่ย 4.4 รายการ/ครั้ง
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
/** ปีงบ 2569 ส่ง 16 ครั้ง · ต.ค. 2569 ยังไม่มี (ยอดรายเดือนจริงอยู่ใน fiscal-data.ts) */
const PER_DAY = 16 / 365;
const ITEMS_PER_DELIVERY = 4.4;

/** สัดส่วนจากข้อมูลจริงทั้งหมด (ชื่อตามตารางในฐาน) */
const COMPANIES: [string, number][] = [['ไม่ระบุบริษัทขนส่ง', 18], ['Health Rider', 2], ['Health Rider(พัสดุ)', 2]]; // prscrpt_delivery_company
const DEPARTMENTS: [string, number][] = [['จุดซักประวัติผู้ป่วยนอก', 14], ['ห้องตรวจครรภ์และวางแผนครอบครัว', 4], ['ห้องฉุกเฉิน (ER)', 3], ['จิตเวชและยาเสพติด', 1]]; // kskdepartment ของ visit
const RIGHTS: [string, number][] = [['บัตรผู้สูงอายุ', 10], ['บัตรประกันสุขภาพถ้วนหน้า 30 บาท', 7], ['เด็ก 0 - 12 ปี', 3], ['บัตรชั่วคราว', 1], ['บัตรสุขภาพ อสม.', 1]]; // pcode
const DISTRICTS: [string, number][] = [['อ.บางเสาธง จ.สมุทรปราการ', 23], ['อ.พระประแดง จ.สมุทรปราการ', 1], ['อ.เมืองมุกดาหาร จ.มุกดาหาร', 1], ['อ.ประโคนชัย จ.บุรีรัมย์', 1]]; // thaiaddress ของที่อยู่จัดส่ง
/** โรคหลักของ visit ที่สั่งส่งยา (ชื่อตาม icd101 — ไทยถ้ามี) */
const DISEASES: [string, string, number][] = [
  ['E119', 'เบาหวานแบบที่ 2 ชนิดที่ไม่ต้องพึ่งอินสุลิน  ไม่มีภาวะแทรกซ้อน', 8],
  ['Z340', 'การดูแลการตั้งครรภ์ปกติ ครรภ์แรก', 3],
  ['M1097', 'ข้อเท้าและเท้า', 2],
  ['Z348', 'การดูแลการตั้งครรภ์ปกติ ครรภ์อื่น', 2],
  ['S5250', 'Fracture of the lower end of radius: closed', 1],
  ['J108', 'Influenza with other manifestations, seasonal  influenza virus identified', 1],
  ['O420', 'Premature rupture of membranes, onset of labour within 24 hours', 1],
  ['R104', 'ปวดท้องน้อยแบบอื่นและไม่ระบุรายละเอียด', 1],
];

const jitter = (value: number, pct = 0.3) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/** แบ่งยอดรวมตามน้ำหนัก ให้ผลรวมเท่ายอดรวมพอดี (ปัดเศษแบบเศษมากได้ก่อน) */
function allocate(total: number, weights: [string, number][]): LabelValue[] {
  const sum = weights.reduce((a, [, w]) => a + w, 0) || 1;
  const raw = weights.map(([label, w]) => ({ label, exact: (total * w) / sum }));
  const rows = raw.map(r => ({ label: r.label, value: Math.floor(r.exact), rest: r.exact - Math.floor(r.exact) }));
  let left = total - rows.reduce((a, r) => a + r.value, 0);
  for (const r of [...rows].sort((a, b) => b.rest - a.rest)) { if (left <= 0) break; r.value++; left--; }
  return rows.map(({ label, value }) => ({ label, value }));
}

export function generatePostalDrugReport(start: string, end: string): PostalDrugReport {
  const endDate = new Date(`${end}T00:00:00`);
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;
  const currentFyMonth = (endDate.getMonth() + 3) % 12;

  // ยอดจริงรายเดือน (จำนวนน้อย ไม่สุ่ม) · เดือนของวันสิ้นสุดนับถึงวันนั้น · เดือนที่ยังไม่ถึง = 0
  const monthly = fiscalSeries(fyStartYear, POSTAL_DELIVERIES, end, 0);
  const fiscalTotal = monthly.reduce((a, b) => a + b, 0);
  const rangeTotal = jitter(PER_DAY * daysBetween(start, end));
  const topTotal = Math.max(fiscalTotal, 1);

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    // คนเดิมรับยาทางไปรษณีย์ซ้ำได้ (จริง 22 ครั้ง / ~19 คน)
    range: { total: rangeTotal, patients: Math.min(rangeTotal, Math.round(rangeTotal * 0.86)), items: Math.round(rangeTotal * ITEMS_PER_DELIVERY) },
    month: { total: monthly[currentFyMonth], start: iso(new Date(endDate.getFullYear(), endDate.getMonth(), 1)), end: iso(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)) },
    fiscal: { total: fiscalTotal },
    itemsPerDelivery: ITEMS_PER_DELIVERY,
    monthly: { labels: MONTHS, values: monthly },
    // การแจกแจงทั้งหมดคิดจากยอดปีงบประมาณ (ยอดช่วงสั้นมีน้อยเกินกว่าจะเห็นสัดส่วน)
    companies: allocate(fiscalTotal, COMPANIES),
    departments: allocate(fiscalTotal, DEPARTMENTS),
    rights: allocate(fiscalTotal, RIGHTS),
    districts: allocate(fiscalTotal, DISTRICTS),
    topDiseases: allocate(topTotal, DISEASES.map(([code, , n]) => [code, n]))
      .map(({ label, value }) => ({ code: label, name: DISEASES.find(d => d[0] === label)![1], visits: value }))
      .filter(d => d.visits > 0)
      .sort((a, b) => b.visits - a.visits),
  };
}
