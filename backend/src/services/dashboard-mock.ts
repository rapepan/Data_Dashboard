import type { DashboardRange, DashboardSnapshot } from '../types/dashboard.types';
import { generateOpdAppointments } from './opd-appointments-mock';
import { ipdTopDiseases, opdTopDiseases } from './top-diseases-mock';

function randomBetween(min: number, max: number) { return Math.round(min + Math.random() * (max - min)); }
const vary = (value: number, pct = 0.1) => Math.max(0, value * (1 + (Math.random() * 2 - 1) * pct));

const OPD_PER_HOUR = [1.1, 1.2, 1.4, 1, 1, 0.5, 14.1, 25.9, 41.3, 36.2, 23.8, 11.8, 8.3, 26.9, 13.4, 6.1, 4.5, 3.1, 2.5, 2.6, 1.8, 2.1, 1.2, 1.1];
const ER_SHAPE = [49, 22, 28, 18, 26, 17, 29, 210, 505, 719, 666, 304, 175, 692, 436, 295, 284, 274, 250, 193, 115, 96, 63, 33];
const IPD_SHAPE = [52, 39, 26, 24, 20, 22, 9, 3, 10, 43, 105, 193, 116, 245, 164, 184, 142, 94, 76, 99, 94, 89, 88, 81];
const ER_PER_DAY = 61;
const IPD_ADMIT_PER_DAY = 5.3;
const BED_TOTAL = 45;
// ค่าเฉลี่ยต่อวันจริงตามวันในสัปดาห์ (อาทิตย์ = 0) 90 วันล่าสุด — OPD จาก ovst, ER จาก er_regist
const OPD_DOW = [66, 283, 260, 239, 328, 308, 68];
const ER_DOW = [65.8, 59.6, 59.1, 61.3, 57.5, 56.1, 67.5];
const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : 0);
/** สัดส่วนของทั้งวันที่ผ่านไปแล้วถึงชั่วโมงปัจจุบัน (ตามรูปแบบรายชั่วโมงจริง) */
const shareUntilNow = (perHour: number[]) => {
  const h = new Date().getHours();
  const all = perHour.reduce((a, b) => a + b, 0) || 1;
  return perHour.slice(0, h + 1).reduce((a, b) => a + b, 0) / all;
};
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

function untilNow(perHour: number[]) {
  const currentHour = new Date().getHours();
  let expected = 0;
  let counted = 0;
  return perHour.map((v, hour) => {
    if (hour > currentHour) return 0;
    expected += vary(v, 0.2);
    const n = Math.max(0, Math.round(expected) - counted);
    counted += n;
    return n;
  });
}
const fromShape = (shape: number[], perDay: number) => {
  const sum = shape.reduce((a, b) => a + b, 0);
  return shape.map(v => (v / sum) * perDay);
};

const OPD_RIGHTS: [string, number, number][] = [
  ['บัตรผู้สูงอายุ', 69.5, 44453],
  ['บัตรประกันสุขภาพถ้วนหน้า 30 บาท', 63.8, 39408],
  ['เบิกหน่วยงานต้นสังกัด', 13.9, 11855],
  ['ชำระเงินเอง', 14.3, 6878],
  ['เด็ก 0 - 12 ปี', 16, 6548],
  ['บัตรชั่วคราว', 13.3, 6174],
  ['บัตรผู้พิการ', 5.5, 4373],
  ['ผู้ประกันตนตาม พรบ.ประกันสังคม', 4.1, 3266],
  ['บัตรผู้มีรายได้น้อย', 3.1, 2452],
  ['บัตรสุขภาพ อสม.', 2.5, 1399],
  ['บัตรนักเรียน', 2.9, 1249],
  ['บัตรประกันสุขภาพถ้วนหน้า(เดิม)', 2.2, 971],
];

function revenueByRight(scale: number) {
  return OPD_RIGHTS
    .map(([right, visits, amount]) => {
      const v = Math.max(0, Math.round(vary(visits * scale, 0.15)));
      return { right, visits: v, amount: Math.round(v * (amount / visits) * vary(1, 0.08)) };
    })
    .filter(item => item.visits > 0)
    .sort((a, b) => b.amount - a.amount);
}

function periodScale(start?: string, end?: string) {
  if (!start || !end) return 1;
  const days = Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1;
  return Math.max(1, days) / 30;
}

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

export function generateDashboardSnapshot(range: DashboardRange = 'today', start?: string, end?: string): DashboardSnapshot {
  const scale = range === 'week' ? 6.5 : range === 'yesterday' ? 1.05 : 1;

  const opdHourly = untilNow(OPD_PER_HOUR.map(v => v * scale));
  const erHourly = untilNow(fromShape(ER_SHAPE, ER_PER_DAY * scale));
  const ipdHourly = untilNow(fromShape(IPD_SHAPE, IPD_ADMIT_PER_DAY * scale));

  const opdTotal = opdHourly.reduce((a, b) => a + b, 0);
  const erTotal = erHourly.reduce((a, b) => a + b, 0);
  const ipdAdmit = ipdHourly.reduce((a, b) => a + b, 0);
  const ipdDischarge = Math.max(0, ipdAdmit + randomBetween(-2, 2));
  const ipdTotal = randomBetween(26, 35);
  const occupancyPct = Math.round((ipdTotal / BED_TOTAL) * 1000) / 10;
  const appts = generateOpdAppointments(todayIso()).today;
  // เมื่อวาน: ค่าเฉลี่ยจริงของวันในสัปดาห์นั้น · % เทียบยอดเมื่อวานถึงชั่วโมงเดียวกัน · นัดเทียบวันเดียวกันสัปดาห์ก่อน
  const yesterdayDow = (new Date().getDay() + 6) % 7;
  const opdYesterday = Math.round(vary(OPD_DOW[yesterdayDow], 0.08));
  const erYesterday = Math.round(vary(ER_DOW[yesterdayDow], 0.1));
  const apptLastWeek = generateOpdAppointments(isoDaysAgo(7)).today.total;
  const revenue = revenueByRight(scale);
  const days = new Date().getDate();
  const erRed = Math.round(erTotal * 0.004);
  const erPink = Math.round(erTotal * 0.024);
  const erYellow = Math.round(erTotal * 0.119);
  const erGreen = Math.round(erTotal * 0.334);

  return {
    range,
    generatedAt: new Date().toISOString(),
    hourly: {
      labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`),
      opd: opdHourly, ipd: ipdHourly, er: erHourly,
    },

    opd: { total: opdTotal, walkin: opdTotal - Math.min(appts.arrived, opdTotal), appointment: Math.min(appts.arrived, opdTotal), yesterday: opdYesterday, changePct: pct(opdTotal, opdYesterday * shareUntilNow(OPD_PER_HOUR)) },
    appointment: { total: appts.total, came: appts.arrived, missed: appts.total - appts.arrived, lastWeek: apptLastWeek, changePct: pct(appts.total, apptLastWeek) },
    er: { total: erTotal, red: erRed, pink: erPink, yellow: erYellow, green: erGreen, white: Math.max(0, erTotal - erRed - erPink - erYellow - erGreen), yesterday: erYesterday, changePct: pct(erTotal, erYesterday * shareUntilNow(ER_SHAPE)) },
    ipd: { total: ipdTotal, admit: ipdAdmit, discharge: ipdDischarge, yesterday: ipdTotal - ipdAdmit + ipdDischarge, occupancyPct, changePct: pct(ipdTotal, ipdTotal - ipdAdmit + ipdDischarge) },
    queue: { avgMinutes: randomBetween(18, 55), waiting: randomBetween(5, 40), done: randomBetween(80, 220), changePct: randomBetween(-15, 20) },
    referral: { in: 0, out: Math.round(vary(14.6 * Math.min(1, new Date().getHours() / 16), 0.3)) },
    revenueOpd: revenue.reduce((sum, item) => sum + item.amount, 0),
    revenueByRight: revenue,
    bed: { free: BED_TOTAL - ipdTotal, total: BED_TOTAL, occupancyPct, patientDays: Math.round(ipdTotal * days * vary(1, 0.05)), days },
    adjrw: Number((0.82 + Math.random() * 0.1).toFixed(3)),
    paymentMix: [
      { label: 'บัตรผู้สูงอายุ', value: randomBetween(31, 33), color: '#4f46e5' },
      { label: 'บัตรประกันสุขภาพถ้วนหน้า 30 บาท', value: randomBetween(27, 29), color: '#818cf8' },
      { label: 'ชำระเงินเอง', value: randomBetween(8, 10), color: '#f59e0b' },
      { label: 'เด็ก 0 - 12 ปี', value: randomBetween(6, 8), color: '#fb923c' },
      { label: 'เบิกหน่วยงานต้นสังกัด', value: randomBetween(5, 7), color: '#e11d48' },
      { label: 'อื่น ๆ', value: randomBetween(16, 19), color: '#94a3b8' },
    ],
    topDiseases: {
      opd: opdTopDiseases(periodScale(start, end)).map(({ code, name, nameTh, patients }) => ({ code, name, nameTh, count: patients })).sort((a, b) => b.count - a.count),
      ipd: ipdTopDiseases(periodScale(start, end)).map(({ code, name, nameTh, patients }) => ({ code, name, nameTh, count: patients })).sort((a, b) => b.count - a.count),
    },
  };
}
