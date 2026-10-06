import type { TelemedicineReport } from '../types/reports.types';
import { fiscalSeries } from './fiscal-series';
import { TELE_VISITS } from './fiscal-data';

/**
 * ข้อมูลจำลองหน้าการแพทย์ทางไกล — ใช้ระหว่างยังไม่ดึงจาก HOSxP
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
/**
 * อิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน) — visit แผนก 055 (Telehealth / Telemedicine)
 * ครั้งรายเดือนจริง (fiscal-data.ts): ใช้น้อยช่วงต้นปีงบ 2569 แล้วเพิ่มขึ้นมากตั้งแต่ มิ.ย. (สูงสุด ส.ค. 237 ครั้ง) · ต.ค. 2569 ~27 ครั้งใน 5 วัน
 */
/** คลินิกของนัดที่ผูกกับ visit (oapp.visit_vn → clinic) 12 เดือน: ส่วนใหญ่ไม่ได้ผูกนัดคลินิก 397 / 489 ครั้ง */
const CLINICS: [string, number][] = [['ไม่ระบุคลินิก', 397 / 489], ['Telemedicine', 53 / 489], ['ตรวจโรคทั่วไป', 20 / 489], ['โรคความดัน(HT)', 9 / 489], ['โรคไขมันในเลือดสูง', 4 / 489], ['อื่น ๆ', 6 / 489]];

const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const jitter = (value: number, pct = 0.1) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

function workdaysBetween(start: string, end: string) {
  let count = 0;
  for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count += 1;
  }
  return Math.max(1, count);
}

export function generateTelemedicineReport(start: string, end: string): TelemedicineReport {
  const endDate = new Date(`${end}T00:00:00`);
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;
  // เดือนในปีงบประมาณ (ต.ค. = 0) ของวันสิ้นสุด — เดือนหลังจากนั้นยังไม่เกิดขึ้น
  const currentFyMonth = (endDate.getMonth() + 3) % 12;
  // ยอดจริงรายเดือน · เดือนของวันสิ้นสุดนับถึงวันนั้น · เดือนที่ยังไม่ถึง = 0
  const monthly = fiscalSeries(fyStartYear, TELE_VISITS, end, 0.08);

  const workdays = workdaysBetween(start, end);
  const perDay = monthly[currentFyMonth] / Math.max(1, workdaysBetween(`${end.slice(0, 8)}01`, end));
  const rangeTotal = Math.round(perDay * workdays);
  const dayTotal = endDate.getDay() === 0 || endDate.getDay() === 6 ? 0 : rnd(Math.floor(perDay * 0.5), Math.ceil(perDay * 1.6));
  // มาจากนัด (ผูกกับ oapp.visit_vn) 90 / 488 ครั้ง (18%) ใน 12 เดือน
  const fromAppointment = Math.round(dayTotal * 0.18);

  // รายชั่วโมงจริง: ช่วงบ่าย 13-14 น. มากที่สุด
  const HOURLY = [0, 0, 0, 0, 0, 0, 6, 0, 16, 44, 29, 71, 66, 78, 146, 29, 0, 0, 0, 0, 0, 0, 0, 0];
  const hourlyShape = HOURLY;
  const shapeSum = hourlyShape.reduce((a, b) => a + b, 0);
  const hourly = hourlyShape.map(f => Math.round((dayTotal * f) / shapeSum));
  // ปัดเศษแล้วรวมไม่พอดี — ใส่ส่วนต่างไว้ชั่วโมงที่คนมากสุด (14:00)
  hourly[14] += dayTotal - hourly.reduce((a, b) => a + b, 0);

  const fiscalTotal = monthly.reduce((a, b) => a + b, 0);

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    day: { date: end, total: dayTotal, fromAppointment, walkin: dayTotal - fromAppointment },
    // ตรวจสอบสิทธิ (ovst_seq.pttype_check) ครบทุกครั้ง 488 / 488
    month: { total: monthly[currentFyMonth], rightVerifiedPct: 100 },
    fiscal: { total: fiscalTotal },
    range: { total: rangeTotal, workdays, avgPerDay: Number((rangeTotal / workdays).toFixed(1)) },
    hourly: { labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`), values: hourly },
    clinics: CLINICS.map(([label, share]) => ({ label, value: Math.round(fiscalTotal * share) })),
    monthly: { labels: MONTHS, values: monthly },
  };
}
