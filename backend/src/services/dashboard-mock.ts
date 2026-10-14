import { dayValue, rangeTotal } from './daily';
import { BD, rankItemsVec } from './breakdown';
import { opdVisits } from './rx-daily';
import type { DashboardRange, DashboardSnapshot } from '../types/dashboard.types';
import { generateOpdAppointments } from './opd-appointments-mock';
import { ipdTopDiseases, opdTopDiseases } from './top-diseases-mock';

function randomBetween(min: number, max: number) { return Math.round(min + Math.random() * (max - min)); }
const vary = (value: number, pct = 0.1) => Math.max(0, value * (1 + (Math.random() * 2 - 1) * pct));

const OPD_PER_HOUR = [1.1, 1.2, 1.4, 1, 1, 0.5, 14.1, 25.9, 41.3, 36.2, 23.8, 11.8, 8.3, 26.9, 13.4, 6.1, 4.5, 3.1, 2.5, 2.6, 1.8, 2.1, 1.2, 1.1];
const ER_SHAPE = [49, 22, 28, 18, 26, 17, 29, 210, 505, 719, 666, 304, 175, 692, 436, 295, 284, 274, 250, 193, 115, 96, 63, 33];
const IPD_SHAPE = [52, 39, 26, 24, 20, 22, 9, 3, 10, 43, 105, 193, 116, 245, 164, 184, 142, 94, 76, 99, 94, 89, 88, 81];
const BED_TOTAL = 45;
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


/** รายได้ผู้ป่วยนอกตามสิทธิ — สัดส่วนครั้งและรายได้ต่อครั้งจริง 30 วันล่าสุด (vn_stat) × จำนวนผู้ป่วยนอก (visits) */
function revenueByRight(visits: number) {
  const [from, to] = topRange();
  const rows = rankItemsVec(BD.opdRight, from, to, 2, 0).slice(0, 12);
  const all = rows.reduce((a, [, v]) => a + v[0], 0) || 1;
  return rows
    .map(([right, [n, income]]) => {
      const v = Math.round((n / all) * visits);
      return { right, visits: v, amount: Math.round(v * (n ? income / n : 0)) };
    })
    .filter(item => item.visits > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** สัดส่วนสิทธิผู้ป่วยนอก (%) 30 วันล่าสุด — 5 อันดับ + อื่น ๆ */
function paymentMix() {
  const COLORS = ['#4f46e5', '#818cf8', '#f59e0b', '#fb923c', '#e11d48'];
  const [from, to] = topRange();
  const rows = rankItemsVec(BD.opdRight, from, to, 2, 0);
  const all = rows.reduce((a, [, v]) => a + v[0], 0) || 1;
  const top = rows.slice(0, 5).map(([label, v], i) => ({ label, value: Math.round((v[0] / all) * 100), color: COLORS[i] }));
  return [...top, { label: 'อื่น ๆ', value: Math.max(0, 100 - top.reduce((a, b) => a + b.value, 0)), color: '#94a3b8' }];
}

/** ช่วงของอันดับโรคบนหน้าแรก: ตามตัวกรอง · ไม่ระบุ = 30 วันล่าสุดที่มีข้อมูล */
function topRange(start?: string, end?: string): [string, string] {
  if (start && end) return [start, end];
  const to = new Date(Date.now() + 7 * 3600e3 - 86400000);
  const from = new Date(to.getTime() - 29 * 86400000);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
}

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

export function generateDashboardSnapshot(range: DashboardRange = 'today', start?: string, end?: string): DashboardSnapshot {
  const scale = range === 'week' ? 6.5 : range === 'yesterday' ? 1.05 : 1;
  // ยอดทั้งวันที่คาดของวันนี้ = ค่าเฉลี่ยจริงของวันในสัปดาห์เดียวกัน (daily-data.ts / rx-daily-data.ts — วันนี้ยังไม่มีในข้อมูลที่ถ่าย)
  const today = todayIso();
  const yesterdayIso = isoDaysAgo(1);
  const opdPerDay = opdVisits(today, today).value;
  const opdShapeSum = OPD_PER_HOUR.reduce((a, b) => a + b, 0);

  const opdHourly = untilNow(OPD_PER_HOUR.map(v => (v / opdShapeSum) * opdPerDay * scale));
  const erHourly = untilNow(fromShape(ER_SHAPE, dayValue('er', today) * scale));
  const ipdHourly = untilNow(fromShape(IPD_SHAPE, dayValue('admit', today) * scale));

  const opdTotal = opdHourly.reduce((a, b) => a + b, 0);
  const erTotal = erHourly.reduce((a, b) => a + b, 0);
  const ipdAdmit = ipdHourly.reduce((a, b) => a + b, 0);
  // จำหน่ายวันนี้ ~ ค่าเฉลี่ยจริงของวันในสัปดาห์เดียวกัน ตามสัดส่วนเวลาที่ผ่านไป · ผู้ป่วยในคงค้าง = เมื่อวาน (จริง) + รับใหม่ − จำหน่าย
  const ipdDischarge = Math.round(dayValue('dch', today) * shareUntilNow(IPD_SHAPE));
  const ipdTotal = Math.max(0, Math.round(dayValue('census', yesterdayIso)) + ipdAdmit - ipdDischarge);
  const occupancyPct = Math.round((ipdTotal / BED_TOTAL) * 1000) / 10;
  const appts = generateOpdAppointments(todayIso()).today;
  // เมื่อวาน: ยอดจริงของเมื่อวาน (มีในข้อมูลที่ถ่ายแล้ว) · % เทียบยอดเมื่อวานถึงชั่วโมงเดียวกัน · นัดเทียบวันเดียวกันสัปดาห์ก่อน
  const opdYesterday = opdVisits(yesterdayIso, yesterdayIso).value;
  const erYesterday = Math.round(dayValue('er', yesterdayIso));
  const apptLastWeek = generateOpdAppointments(isoDaysAgo(7)).today.total;
  const revenue = revenueByRight(opdTotal);
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
    // referout: ค่าเฉลี่ยจริงของวันในสัปดาห์เดียวกัน × สัดส่วนของวันที่ผ่านไปแล้ว
    referral: { in: 0, out: Math.round(dayValue('refer', today) * Math.min(1, new Date().getHours() / 16)) },
    revenueOpd: revenue.reduce((sum, item) => sum + item.amount, 0),
    revenueByRight: revenue,
    // วันนอนสะสมเดือนนี้ = ผลรวมผู้ป่วยคงค้างรายวันจริง (ถึงเมื่อวาน) + วันนี้
    bed: { free: BED_TOTAL - ipdTotal, total: BED_TOTAL, occupancyPct, patientDays: rangeTotal('census', `${today.slice(0, 8)}01`, yesterdayIso < `${today.slice(0, 8)}01` ? `${today.slice(0, 8)}01` : yesterdayIso) + ipdTotal, days },
    // AdjRW เฉลี่ยของผู้ที่จำหน่ายเดือนนี้ (an_stat.rw จริง) — เดือนที่ยังจำหน่ายน้อยใช้เดือนก่อน
    adjrw: (() => {
      const months = Object.entries(BD.adjrw).filter(([, v]) => v[1] >= 30).sort();
      return Number((months[months.length - 1]?.[1][0] ?? 0.87).toFixed(3));
    })(),
    paymentMix: paymentMix(),
    topDiseases: {
      opd: opdTopDiseases(...topRange(start, end)).map(({ code, name, nameTh, patients }) => ({ code, name, nameTh, count: patients })).sort((a, b) => b.count - a.count),
      ipd: ipdTopDiseases(...topRange(start, end)).map(({ code, name, nameTh, patients }) => ({ code, name, nameTh, count: patients })).sort((a, b) => b.count - a.count),
    },
  };
}
