import { fiscalSeries } from './fiscal-series';
import { DENTAL_VISITS } from './fiscal-data';
import type { DentalBreakdown, DentalReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้าทันตกรรม — ใช้ระหว่างยังไม่ดึงจาก HOSxP (dtmain / dttm)
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
/** กลุ่มหัตถการตาม dttm_group (4 กลุ่มใหญ่สุด + อื่น ๆ) */
const CATEGORIES = ['ตรวจ', 'ทันตกรรมหัตถการ', 'ปริทันต์', 'ทันตศัลยกรรม', 'อื่น ๆ'];
/**
 * สัดส่วนหัตถการต่อผู้ป่วย 1 ราย (คนหนึ่งทำได้หลายหัตถการ) — อิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน)
 * dtmain: 17,134 รายการ / 6,956 ครั้ง (~28 คน/วันทำการ)
 * ตรวจ 7,518 · ทันตกรรมหัตถการ 2,738 · ปริทันต์ 2,281 · ทันตศัลยกรรม 2,240 · อื่น ๆ (ประดิษฐ์ ป้องกัน รังสี ฯลฯ) 2,357
 */
const PER_PATIENT = [1.08, 0.39, 0.33, 0.32, 0.34];
const PATIENTS_PER_DAY = 28;

const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const jitter = (value: number, pct = 0.12) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function breakdown(days: number): DentalBreakdown {
  const patients = jitter(PATIENTS_PER_DAY * days, 0.08);
  return { patients, counts: PER_PATIENT.map(ratio => jitter(patients * ratio)) };
}

/** หัตถการ 12 เดือน (dtmain + dttm.name ตามฐาน) */
const PROCEDURES: [string, number][] = [
  ['A- การตรวจและการประเมินสภาพช่องปากเฉพาะตำแหน่งหรือที่มีอาการฉุกเฉินรวมถึงการตรวจเพื่อติดตามผล (Limited Oral Evaluation  Problem Focused)', 3361],
  ['A- การตรวจและการประเมินสภาพช่องปากทั้งปาก และวางแผนการรักษา (Comprehensive Oral Evaluation)', 2264],
  ['J- ถอนฟัน - แท้(62101)', 1982],
  ['A- การตรวจคัดกรองมะเร็งช่องปาก', 1876],
  ['D- อุดฟันแท้หลัง, สีเหมือนฟัน, 1 ด้าน(67210)', 1350],
  ['F- ขูดหินน้ำลาย_lower arch(64101)', 1012],
  ['F- ขูดหินน้ำลาย_upper arch(64101)', 1000],
  ['D- อุดฟันแท้หน้า, สีเหมือนฟัน, 1 ด้าน (67210)', 510],
  ['D- อุดฟันแท้หลัง, สีเหมือนฟัน, 2 ด้าน(67211)', 481],
  ['B- การตรวจวินิจฉัย ภาพถ่ายรังสี(ฟันแท้), ที่ใช้เทคนิคภายในช่องปาก (Diagnostic Intraoral  Images)', 261],
  ['F- สอนแปรงฟัน', 233],
  ['J- ถอนฟัน - น้ำนม(62101)', 231],
  ['G- เคลือบฟันด้วยฟลูออไรด์(วานิช) - เด็ก', 208],
  ['J- ตัดไหมในช่องปาก', 147],
];

export function generateDentalReport(start: string, end: string): DentalReport {
  const endDate = new Date(`${end}T00:00:00`);
  const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const monthEnd = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
  // ปีงบประมาณเริ่ม 1 ต.ค.
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;

  const monthLabels = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
  // ผู้ป่วยทันตกรรมรายเดือนจริง (dtmain) × สัดส่วนหัตถการ · เดือนที่ยังไม่ถึง = 0
  const visits = fiscalSeries(fyStartYear, DENTAL_VISITS, end, 0);
  const monthly = CATEGORIES.map((_, ci) => visits.map(v => jitter(v * PER_PATIENT[ci], 0.1)));
  const fiscalShare = monthly.map(series => series.reduce((a, b) => a + b, 0));

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    categories: CATEGORIES,
    range: breakdown(daysBetween(start, end) * 0.7),
    // นับถึงวันสิ้นสุดที่เลือก (วันหลังจากนั้นในเดือนยังไม่เกิดขึ้น)
    month: { ...breakdown(endDate.getDate() * 0.7), start: iso(monthStart), end: iso(monthEnd) },
    day: { ...breakdown(rnd(55, 75) / 100), date: end },
    fiscalShare,
    topProcedures: PROCEDURES.map(([label, value]) => ({ label, value: jitter(value, 0.05) })).sort((a, b) => b.value - a.value),
    monthly: { labels: monthLabels, counts: monthly },
  };
}
