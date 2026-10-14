import { BD, hourly as hourlyOf, rankItems, scaleTo } from './breakdown';
import { dayValue, fiscalMonthly, monthStart, rangeTotal } from './daily';
import type { TelemedicineReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้าการแพทย์ทางไกล — ใช้ระหว่างยังไม่ดึงจาก HOSxP
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
/**
 * อิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน) — visit แผนก 055 (Telehealth / Telemedicine)
 * ครั้งรายเดือนจริง (fiscal-data.ts): ใช้น้อยช่วงต้นปีงบ 2569 แล้วเพิ่มขึ้นมากตั้งแต่ มิ.ย. (สูงสุด ส.ค. 237 ครั้ง) · ต.ค. 2569 ~27 ครั้งใน 5 วัน
 */


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
  // ยอดจริงรายวัน (daily-data.ts · visit แผนก 055) — ช่วงที่เลือก / เดือนนี้ / วันนี้ / รายเดือนของปีงบ
  const monthly = fiscalMonthly('tele', end);
  const workdays = workdaysBetween(start, end);
  const rangeSum = rangeTotal('tele', start, end);
  const dayTotal = Math.round(dayValue('tele', end));
  // มาจากนัด = visit ที่ผูกกับคลินิกนัด (oapp.visit_vn) — สัดส่วนจริงของเดือนนั้น
  const clinicMonth = rankItems(BD.teleClinic, end, end);
  const clinicSum = clinicMonth.reduce((a, [, v]) => a + v, 0);
  const apptShare = clinicSum ? clinicMonth.filter(([k]) => k !== 'ไม่ระบุคลินิก').reduce((a, [, v]) => a + v, 0) / clinicSum : 0.18;
  const fromAppointment = Math.round(dayTotal * apptShare);

  // รายชั่วโมงจริงของเดือนนั้น (ovst.vsttime แผนก 055) — ไม่มีข้อมูลใช้รูปแบบเดิม (บ่าย 13–14 น. มากสุด)
  const HOURLY = [0, 0, 0, 0, 0, 0, 6, 0, 16, 44, 29, 71, 66, 78, 146, 29, 0, 0, 0, 0, 0, 0, 0, 0];
  const monthHours = hourlyOf(BD.teleHour, end, end);
  const hourlyShape = monthHours.some(v => v > 0) ? monthHours : HOURLY;
  const shapeSum = hourlyShape.reduce((a, b) => a + b, 0);
  const hourly = hourlyShape.map(f => Math.round((dayTotal * f) / shapeSum));
  // ปัดเศษแล้วรวมไม่พอดี — ใส่ส่วนต่างไว้ชั่วโมงที่คนมากสุด (14:00)
  hourly[hourlyShape.indexOf(Math.max(...hourlyShape))] += dayTotal - hourly.reduce((a, b) => a + b, 0);

  const fiscalTotal = monthly.reduce((a, b) => a + b, 0);

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    day: { date: end, total: dayTotal, fromAppointment, walkin: dayTotal - fromAppointment },
    // ตรวจสอบสิทธิ (ovst_seq.pttype_check) ครบทุกครั้ง 488 / 488
    month: { total: rangeTotal('tele', monthStart(end), end), rightVerifiedPct: 100 },
    fiscal: { total: fiscalTotal },
    range: { total: rangeSum, workdays, avgPerDay: Number((rangeSum / workdays).toFixed(1)) },
    hourly: { labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`), values: hourly },
    // คลินิกของปีงบ (oapp.visit_vn → clinic จริง) ปรับให้รวมเท่ายอดปีงบ
    clinics: (() => {
      const items = rankItems(BD.teleClinic, `${fyStartYear}-10-01`, end).slice(0, 6);
      const values = scaleTo(items.map(([, v]) => v), fiscalTotal);
      return items.map(([label], i) => ({ label, value: values[i] }));
    })(),
    monthly: { labels: MONTHS, values: monthly },
  };
}
