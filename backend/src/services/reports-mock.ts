import { opdTopDiseases } from './top-diseases-mock';
import { opdPrescriptions, opdVisits } from './rx-daily';
import { BD, hourly as hourlyOf, icdName, monthShares, rankItems, sumMonths, sumMonthsVec, workdaysIn } from './breakdown';
import { DAILY_FROM, DAILY_UPTO } from './daily-data';
import { generateQueueReport } from './queue-mock';
import { changeVsPrevious, dayValue, previousRange as visitsPrev, rangeTotal as dailyTotal } from './daily';
import { changePct, QUEUE_AVERAGE, QUEUE_STEPS, queueSeries, rangeMean, SERIES } from './real-series';
import type { AlertStatus, ErReport, IpdReport, LabelValue, Metric, OpdReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้า OPD / IPD / ER — ตัวเลขใกล้เคียงหน้าจอตัวอย่าง และแปรผันตามจำนวนวันที่เลือก
 * เมื่อต่อ HOSxP ให้แทนที่แต่ละฟังก์ชันด้วยการ query จริง โดยคง response shape เดิม (types/reports.types.ts)
 */
const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
/** ค่า + % เทียบช่วงก่อนที่คำนวณจากยอดรายเดือนจริง (real-series.ts) */
const metric = (value: number, change: number | undefined): Metric => (change === undefined ? { value } : { value, change });

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/** สถานะเทียบเป้า: เกินเป้า > 20% = วิกฤต, เกินเป้า = เฝ้าระวัง */
function statusAgainst(value: number, target: number, higherIsBad = true): AlertStatus {
  const ratio = higherIsBad ? value / target : target / value;
  if (ratio > 1.2) return 'critical';
  if (ratio > 1) return 'warning';
  return 'ok';
}

/* ------------------------------- OPD ------------------------------- */
export function generateOpdReport(start: string, end: string): OpdReport {
  // ทุกตัวเลขอิงยอดจริงของ HOSxP (daily-data.ts รายวัน · breakdown-data.ts รายเดือน) — ช่วงที่เลือกรวมจากยอดจริง
  // ยอดของช่วงวันที่ = visit จริงรายวัน (rx-daily-data.ts) — ตรงกับตัวหารของ "ใบสั่งยาที่มียา" ในหน้าเดียวกัน
  // วันที่ไม่มีข้อมูลใช้ค่าเฉลี่ยตามวันในสัปดาห์
  const visits = opdVisits(start, end);
  const total = visits.value;
  // ผู้ป่วยใหม่ (มาครั้งแรกในรอบ 5 ปี) — ยอดจริงรายวัน
  const newPatients = Math.min(total, dailyTotal('newpt', start, end));

  // เฉลี่ยต่อวันทำการ รายชั่วโมง 06:00–17:00 (ovst.vsttime วันทำการ ของเดือนที่ทับกับช่วง) · มาตามนัด = visit ที่ผูกกับ oapp
  const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const perHour = hourlyOf(BD.opdHour, start, end);
  const wd = Math.max(1, workdaysIn(start, end));
  const hourTotal = hours.map((_, i) => Math.round(perHour[i + 6][0] / wd));
  const appointment = hours.map((_, i) => Math.min(hourTotal[i], Math.round(perHour[i + 6][1] / wd)));
  const walkin = hourTotal.map((v, i) => v - appointment[i]);
  const peakIndex = hourTotal.indexOf(Math.max(...hourTotal));


  // จำนวนผู้ป่วยที่ผ่านแต่ละจุด = visit ที่มีเวลาบันทึกใน service_time ของช่วง (ยอดจริงรายวัน)
  // ไม่ใช่ทุกคนผ่านทุกจุด เช่น ทันตกรรม/กายภาพ ไม่ผ่านแพทย์ · สิทธิที่ไม่ต้องจ่ายเงินไม่ผ่านการเงิน
  const flow: LabelValue[] = [
    { label: 'ออกบัตร', value: dailyTotal('flow', start, end, 0) },
    { label: 'คัดกรองเสร็จ', value: dailyTotal('flow', start, end, 1) },
    { label: 'แพทย์ตรวจเสร็จ', value: dailyTotal('flow', start, end, 2) },
    { label: 'ห้องยา', value: dailyTotal('flow', start, end, 3) },
    { label: 'การเงิน', value: dailyTotal('flow', start, end, 4) },
  ];

  // เวลารอแต่ละขั้นตอน = ชุดเดียวกับหน้าระยะเวลารอคอยคิว (service_time จริงของช่วง) — เป้าหมายเป็นค่าที่ตั้งไว้ ไม่ใช่ข้อมูลในฐาน
  const TARGETS = [5, 15, 40, 20, 15];
  const queue = generateQueueReport(start, end);
  const waitSteps = QUEUE_STEPS.map((step, i) => ({ step, avgMinutes: Math.round(queue.average.steps[i] ?? QUEUE_AVERAGE[i]), targetMinutes: TARGETS[i] }));
  // เวลารวมทั้งกระบวนการ (มาถึง → การเงิน) และเวลาจนแพทย์ตรวจเสร็จ (มาถึง → service5)
  const avgWait = waitSteps.reduce((sum, s) => sum + s.avgMinutes, 0);
  const avgDoctor = waitSteps.slice(0, 3).reduce((sum, s) => sum + s.avgMinutes, 0);

  // นัดหมายของช่วง (oapp ตามวันนัด — ยอดจริงรายวัน): มาตามนัด = มี visit ผูกกับนัด · ยกเลิก = สถานะยกเลิก · ที่เหลือ = ไม่มาตามนัด
  const appointments = Math.max(1, dailyTotal('appt', start, end, 0));
  const onTime = Math.min(total, dailyTotal('appt', start, end, 1));
  const cancelled = dailyTotal('appt', start, end, 2);
  const noShow = Math.max(0, appointments - onTime - cancelled);
  const walkinTotal = total - onTime;
  const prevAppt = (() => {
    const p = visits.prevRange;
    const n = dailyTotal('appt', p.start, p.end, 0);
    return n ? Math.round((dailyTotal('appt', p.start, p.end, 1) / n) * 100) : null;
  })();
  const satisfaction = Number((4.4 + Math.random() * 0.3).toFixed(1));

  // ช่วง 07-08 ถึง 15-16 (เฉลี่ยต่อวันทำการ)
  const peakHours: LabelValue[] = hours.slice(1, 10).map((h, i) => ({ label: `${h.slice(0, 2)}-${hours[i + 2].slice(0, 2)}`, value: hourTotal[i + 1] }));

  const waitDoctor = waitSteps[2].avgMinutes;
  const waitDrug = waitSteps[3].avgMinutes;
  const peak = Math.max(...hourTotal);
  const noShowPct = Math.round((noShow / appointments) * 100);

  return {
    start, end,
    kpis: {
      total: metric(total, visits.change),
      newPatients: metric(newPatients, changeVsPrevious('newpt', start, end)),
      // ผู้ป่วยเก่า = ทั้งหมด − ใหม่ ทั้งช่วงนี้และช่วงก่อน (ยอดจริงรายวันทั้งคู่)
      oldPatients: metric(total - newPatients, (() => {
        const prevOld = visits.previous - dailyTotal('newpt', visits.prevRange.start, visits.prevRange.end);
        return prevOld > 0 ? Math.round(((total - newPatients - prevOld) / prevOld) * 100) : undefined;
      })()),
      avgWait: metric(avgWait, (() => { const p = generateQueueReport(visits.prevRange.start, visits.prevRange.end).average.total; return p ? Math.round(((queue.average.total - p) / p) * 100) : undefined; })()),
      avgDoctor: metric(avgDoctor, changePct(queueSeries([0, 1, 2]), start, end, 'mean')),
      satisfaction: { value: satisfaction, change: 0.2, changeIsAbsolute: true },
    },
    byHour: { labels: hours, total: hourTotal, walkin, appointment, peakLabel: `${hours[peakIndex]} - ${hours[Math.min(peakIndex + 1, hours.length - 1)]}`, peakValue: hourTotal[peakIndex] },
    topDiseases: opdTopDiseases(start, end),
    flow,
    waitSteps,
    appointment: { walkin: walkinTotal, onTime, cancelled, noShow, onTimeRate: Math.round((onTime / appointments) * 100), onTimeRateChange: prevAppt === null ? 0 : Math.round((onTime / appointments) * 100) - prevAppt },
    satisfaction: {
      score: satisfaction,
      change: 0.2,
      topics: [
        { label: 'ความสะดวกในการใช้บริการ', value: 4.7 },
        { label: 'ความสุภาพของเจ้าหน้าที่', value: 4.6 },
        { label: 'ระยะเวลารอคอย', value: 4.4 },
        { label: 'ความชัดเจนของข้อมูล', value: 4.5 },
        { label: 'ความสะอาดของพื้นที่', value: 4.7 },
      ],
    },
    peakHours,
    prescriptions: opdPrescriptions(start, end),
    alerts: [
      { issue: 'เวลารอพบแพทย์ + ตรวจรักษา', value: `${waitDoctor} นาที`, target: '≤ 40 นาที', status: statusAgainst(waitDoctor, 40) },
      { issue: 'เวลารอรับยา', value: `${waitDrug} นาที`, target: '≤ 20 นาที', status: statusAgainst(waitDrug, 20) },
      { issue: 'ผู้ป่วยหนาแน่นช่วงเช้า', value: `${peak.toLocaleString('en-US')} ราย/ชม.`, target: '≤ 50 ราย/ชม.', status: statusAgainst(peak, 50) === 'critical' ? 'warning' : statusAgainst(peak, 50) },
      { issue: 'อัตราไม่มาตามนัด (No-show)', value: `${noShowPct}%`, target: '≤ 20%', status: statusAgainst(noShowPct || 1, 20) },
      { issue: 'ความพึงพอใจผู้ป่วย', value: `${satisfaction}`, target: '≥ 4.5', status: satisfaction >= 4.5 ? 'ok' : 'warning' },
    ],
  };
}

/* ------------------------------- IPD ------------------------------- */
// ข้อมูลจำลองอิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน):
// หอที่เปิดใช้ 3 หอ รวม 45 เตียง · admit ~168/เดือน (~5.3/วัน) · LOS เฉลี่ย 3.67 วัน · CMI 0.869
// Re-admit ≤ 28 วัน 251 ครั้ง / 2,018 admit (12.4%)
export function generateIpdReport(start: string, end: string): IpdReport {
  // ผู้ป่วยคงค้าง ณ สิ้นวันสิ้นสุด (ยอดจริง: admit − จำหน่ายสะสม · daily-data.ts census) — วันที่ยังไม่มีข้อมูลใช้เมื่อวาน
  const refDay = end > DAILY_UPTO ? DAILY_UPTO : end;
  const census = (col: number) => Math.round(dayValue('census', refDay, col));
  // SEMI ICU ไม่มีผู้ป่วยลงหอนี้ในฐาน (ipt.ward มีแค่ 02 / 07)
  const wards = [
    { ward: 'Ward 2', beds: 28, used: census(1) },
    { ward: 'Home Ward', beds: 15, used: census(2) },
    { ward: 'SEMI ICU', beds: 2, used: 0 },
  ];
  const totalBeds = wards.reduce((sum, w) => sum + w.beds, 0);
  const usedBeds = wards.reduce((sum, w) => sum + w.used, 0);

  // admit / จำหน่าย รายเดือนจริง 9 เดือนล่าสุดนับถึงเดือนของวันสิ้นสุด (real-series) · เดือนสุดท้ายนับถึงวันสิ้นสุด
  // ผู้ป่วยคงค้าง ≈ admit × LOS ÷ 30
  const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const endDay = new Date(`${end}T00:00:00`);
  const trendMonths = Array.from({ length: 9 }, (_, i) => new Date(endDay.getFullYear(), endDay.getMonth() - 8 + i, 1));
  // ยอดจริงต่อเดือน (เดือนสุดท้ายนับถึงวันสิ้นสุด) · ผู้ป่วยคงค้าง = ค่า ณ สิ้นเดือน (เดือนสุดท้าย = วันสิ้นสุด)
  const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const monthRange = (d: Date, i: number): [string, string] => [isoOf(d), i === 8 ? end : isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  const months = trendMonths.map(d => TH_MONTHS[d.getMonth()]);
  const admissions = trendMonths.map((d, i) => dailyTotal('admit', ...monthRange(d, i)));
  const discharges = trendMonths.map((d, i) => dailyTotal('dch', ...monthRange(d, i)));
  const current = trendMonths.map((d, i) => {
    const last = monthRange(d, i)[1];
    return Math.round(dayValue('census', last > DAILY_UPTO ? DAILY_UPTO : last));
  });

  const statusCounts: [string, number][] = [['รักษาต่อเนื่อง', 0.659], ['รอจำหน่าย', 0.159], ['รอผลตรวจ', 0.093], ['รอปรึกษาแพทย์', 0.058], ['อื่น ๆ', 0.031]];
  // an_stat.los: < 3 วัน 47.7% · 3-5 วัน 35.2% · 6-10 วัน 13.9% · > 10 วัน 3.3%
  // LOS: ผู้ที่จำหน่ายในช่วงที่เลือก แยกตามจำนวนวันนอน (an_stat.los — ยอดจริงรายวัน)
  const losBuckets: [string, number][] = [['< 3 วัน', 2], ['3 - 5 วัน', 3], ['6 - 10 วัน', 4], ['> 10 วัน', 5]];
  // Re-admit 28 วัน = admit ซ้ำ ÷ admit ทั้งหมดของช่วง (ยอดจริง)
  const admitsInRange = dailyTotal('admit', start, end);
  const readmission = admitsInRange ? Number(((dailyTotal('readmit', start, end) / admitsInRange) * 100).toFixed(1)) : 0;
  // สัดส่วน % ของช่วง (สิทธิ / อายุ / หมวดโรค — an_stat ตามวันที่ admit)
  const pctList = (set: Record<string, Record<string, number>>, top: number, other = 'อื่น ๆ'): LabelValue[] => {
    const items = rankItems(set, start, end);
    const sum = items.reduce((a, [, v]) => a + v, 0) || 1;
    const head = items.slice(0, top).map(([label, v]) => ({ label, value: Math.round((v / sum) * 100) }));
    const rest = 100 - head.reduce((a, b) => a + b.value, 0);
    return rest > 0 && items.length > top ? [...head, { label: other, value: rest }] : head;
  };
  const AGES = ['0-18', '19-40', '41-60', '61-80', '> 80'];
  const ageTotals = AGES.map(a => sumMonths(BD.ipdAge[a], monthShares(start, end)));
  const ageSum = ageTotals.reduce((a, b) => a + b, 0) || 1;
  // รอเตียง (ipt_admit_queue): จำนวนขอ admit ของวันสิ้นสุด (ตามสัดส่วนเดือน) · เวลารอเฉลี่ยของช่วง
  const queue = sumMonthsVec(BD.admitQueue, monthShares(start, end), 4);
  const queueDayShare = sumMonthsVec(BD.admitQueue, monthShares(refDay, refDay), 4);
  // LOS เฉลี่ยจริงรายเดือน (an_stat) ของช่วงที่เลือก · เดือนที่จำหน่ายยังไม่ครบ (เดือนปัจจุบัน) ใช้เดือนล่าสุดที่ครบแทน
  const losMonths = Object.entries(SERIES.los).filter(([, v]) => v !== null);
  const avgLos = Number((rangeMean(SERIES.los, start, end) ?? losMonths[losMonths.length - 1]?.[1] ?? 3.7).toFixed(1));
  const mainOcc = Math.round((wards[0].used / wards[0].beds) * 100);

  return {
    start, end,
    kpis: {
      current: metric(usedBeds, undefined),
      // admit / จำหน่ายของช่วง = ยอดจริงรายวัน (daily-data.ts: ipt.regdate / ipt.dchdate)
      admissions: metric(dailyTotal('admit', start, end), changeVsPrevious('admit', start, end)),
      discharges: metric(dailyTotal('dch', start, end), changeVsPrevious('dch', start, end)),
      totalBeds,
      usedBeds,
      avgLos: metric(avgLos, changePct(SERIES.los, start, end, 'mean')),
      readmission30: { value: readmission },
    },
    trend: { labels: months, admissions, discharges, current },
    wards,
    // สถานะผู้ป่วยในปัจจุบัน — HOSxP ไม่มีสถานะนี้ จึงใช้สัดส่วนประมาณ × ผู้ป่วยคงค้างจริง
    patientStatus: statusCounts.map(([label, ratio]) => ({ label, value: Math.round(usedBeds * ratio) })),
    losBuckets: losBuckets.map(([label, col]) => ({ label, value: dailyTotal('dchDetail', start, end, col) })),
    flow: [
      { label: 'รับใหม่ (วันนี้)', value: Math.round(dayValue('admit', refDay)) },
      { label: 'รอเตียง', value: Math.round(queueDayShare[0] + queueDayShare[1]) },
      { label: 'อยู่ระหว่างการรักษา', value: usedBeds },
    ],
    dischargePlanning: {
      items: [
        { label: 'จำหน่ายตามแผน', value: rnd(140, 158) },
        { label: 'รอดำเนินการ', value: rnd(6, 12) },
        { label: 'เลื่อนจำหน่าย', value: rnd(2, 6) },
        { label: 'จำหน่ายฉุกเฉิน', value: rnd(1, 3) },
      ],
      avgTurnaroundHours: Number((2.2 + Math.random() * 0.8).toFixed(1)),
      targetHours: 4,
    },
    // รอเตียง (ipt_admit_queue จริง): จำนวนขอ admit ต่อวัน (ER / แผนกอื่น) · เวลารอเฉลี่ย (ขอ → admit) ของช่วง
    waitingBed: { fromEr: Math.round(queueDayShare[0]), fromOpd: Math.round(queueDayShare[1]), avgWaitHours: queue[3] ? Number((queue[2] / queue[3]).toFixed(2)) : 0 },
    profile: {
      // % ของ admit ในช่วง (an_stat จริง): สิทธิ 4 อันดับ + อื่น ๆ · ช่วงอายุ · หมวดโรค 5 อันดับ
      byRight: pctList(BD.ipdRight, 4),
      byAge: AGES.map((label, i) => ({ label, value: Math.round((ageTotals[i] / ageSum) * 100) })),
      topDiseases: pctList(BD.ipdChapter, 5).filter(d => d.label !== 'อื่น ๆ'),
    },
    alerts: [
      { issue: `อัตราครองเตียงสูง > 90% (${mainOcc}%)`, ward: 'Ward 2', status: mainOcc > 90 ? 'critical' : 'warning', action: 'เพิ่มการจำหน่าย / ใช้ Home Ward' },
      { issue: `ระยะรอเตียงเฉลี่ย (ipt_admit_queue) ~${queue[3] ? Math.round((queue[2] / queue[3]) * 60) : 0} นาที`, ward: 'ER / OPD', status: 'ok', action: 'ติดตามต่อเนื่อง' },
      { issue: 'LOS > 10 วัน (มากผิดปกติ)', ward: 'Ward 2', status: 'warning', action: 'ทบทวนแผนการรักษา' },
      { issue: 'รอผลตรวจนานกว่า 24 ชม.', ward: 'ห้องปฏิบัติการ', status: 'warning', action: 'ติดตามผลตรวจ' },
      { issue: 'ส่งต่อระหว่างนอน รพ. (By Transfer)', ward: 'Ward 2', status: 'ok', action: 'ติดตามผล' },
      { issue: `Re-admit 28 วัน ${readmission}%`, ward: 'Ward 2', status: readmission > 8 ? 'warning' : 'ok', action: 'วิเคราะห์สาเหตุ' },
    ],
  };
}

/* ------------------------------- ER -------------------------------- */
// ข้อมูลจำลองอิง HOSxP รพ.บางเสาธง (er_regist ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน):
// ~61 ครั้ง/วัน · ระดับความรุนแรง 1-5 = 0.4% / 2.4% / 11.9% / 33.4% / 51.8%
// จำหน่าย: กลับบ้าน ส่วนใหญ่ · Admit 6.6% · ส่งต่อ 2.1% · พีคช่วงเช้า 08-11 น. และบ่ายโมง (รวมผู้ป่วยทำแผล/ฉีดยานอกเวลา OPD)

export function generateErReport(start: string, end: string): ErReport {
  const days = daysBetween(start, end);
  // ผู้ป่วย ER ของช่วง = ยอดจริงรายวัน (daily-data.ts: er_regist)
  const total = dailyTotal('er', start, end);
  // สัดส่วน (ระดับความรุนแรง / จำหน่าย) คงที่ → % เทียบช่วงก่อนเท่ากับของยอดรวม
  const erChange = changeVsPrevious('er', start, end);
  const labels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
  // รายชั่วโมง × ระดับ (1 / 2 / 3 / 4–5) ของเดือนที่ทับกับช่วง (er_regist + ovst.vsttime) ปรับให้รวมเท่ายอดจริงของช่วง
  const hourLv = hourlyOf(BD.erHour, start, end);
  const hourSum = hourLv.reduce((a, v) => a + v[0] + v[1] + v[2] + v[3], 0) || 1;
  const fitHour = (v: number) => Math.round((v / hourSum) * total);
  const triage1 = hourLv.map(v => fitHour(v[0]));
  const triage2 = hourLv.map(v => fitHour(v[1]));
  const triage3 = hourLv.map(v => fitHour(v[2]));
  const triage45 = hourLv.map(v => fitHour(v[3]));
  const perHour = labels.map((_, h) => triage1[h] + triage2[h] + triage3[h] + triage45[h]);
  // ช่วง 3 ชั่วโมงที่หนาแน่นที่สุด
  const windows = labels.map((_, h) => (h <= 21 ? perHour[h] + perHour[h + 1] + perHour[h + 2] : -1));
  const peakStart = windows.indexOf(Math.max(...windows));
  const peakCount = Math.max(0, windows[peakStart]);

  // ระดับความเร่งด่วน / การจำหน่าย / ระยะเวลา — ยอดจริงรายวัน (er_emergency_type / er_dch_type / เวลาเข้า ER → แพทย์ตรวจ → เสร็จ)
  const lv = (i: number) => dailyTotal('erLevel', start, end, i);
  const triage: LabelValue[] = [
    // ชื่อตาม er_emergency_type
    { label: '1: Resuscitate / Life threatening', value: lv(0) },
    { label: '2: Emergency', value: lv(1) },
    { label: '3: Urgency', value: lv(2) },
    { label: '4: Semi Urgency / Acute', value: lv(3) },
    { label: '5: Non Urgency / Non Acute', value: lv(4) },
  ];
  const dch = (i: number) => dailyTotal('erDch', start, end, i);
  const admit = dch(2);
  const transfer = dch(1);
  // เวลารอแพทย์เฉลี่ยจริง (ลงเวลาใน HOSxP ค่อนข้างเร็วหลังเข้า ER)
  const waitN = dailyTotal('erTime', start, end, 1);
  const waitDoctor = waitN ? Math.round(dailyTotal('erTime', start, end, 0) / waitN) : 0;
  // ปริมาณในแต่ละขั้นตอนต่อวัน (สัดส่วนจากหน้าจอตัวอย่าง ปรับตามปริมาณจริง ~61 ครั้ง/วัน)
  const scaleCount = (v: number) => Math.round(v * days * (61 / 312));

  return {
    start, end,
    kpis: {
      total: metric(total, erChange),
      emergency: metric(triage[0].value + triage[1].value, (() => {
        const p = visitsPrev(start, end);
        const before = dailyTotal('erLevel', p.start, p.end, 0) + dailyTotal('erLevel', p.start, p.end, 1);
        return before ? Math.round(((triage[0].value + triage[1].value - before) / before) * 100) : undefined;
      })()),
      avgWaitDoctor: metric(waitDoctor, undefined),
      admit: metric(admit, changeVsPrevious('erDch', start, end, 2)),
      discharge: metric(dch(0), changeVsPrevious('erDch', start, end, 0)),
      transfer: metric(transfer, changeVsPrevious('erDch', start, end, 1)),
      satisfaction: { value: Number((4.3 + Math.random() * 0.3).toFixed(1)), change: 0.3, changeIsAbsolute: true },
    },
    byHour: { labels, triage1, triage2, triage3, triage45, peakLabel: `${labels[peakStart]} - ${labels[Math.min(23, peakStart + 3)] ?? '24:00'}`, peakValue: peakCount, peakPct: total ? Math.round((peakCount / total) * 100) : 0 },
    triage,
    stepTimes: [
      { step: 'ลงทะเบียน (Registration)', minutes: rnd(6, 10), targetMinutes: 10 },
      { step: 'คัดกรอง (Triage)', minutes: rnd(10, 14), targetMinutes: 15 },
      { step: 'รอพบแพทย์ (Waiting Doctor)', minutes: waitDoctor, targetMinutes: 30 },
      { step: 'ตรวจรักษา (Examination)', minutes: rnd(15, 20), targetMinutes: 20 },
      { step: 'ตรวจพิเศษ (Lab / X-Ray)', minutes: rnd(50, 60), targetMinutes: 45 },
      { step: 'รับการรักษา (Treatment)', minutes: rnd(20, 27), targetMinutes: 30 },
      { step: 'จำหน่าย/ส่งต่อ (Disposition)', minutes: rnd(8, 12), targetMinutes: 15 },
    ],
    flow: [
      { label: 'Arrival', value: total },
      { label: 'Registration', value: scaleCount(rnd(24, 32)) },
      { label: 'Triage', value: scaleCount(rnd(40, 50)) },
      { label: 'Waiting', value: scaleCount(rnd(78, 90)) },
      { label: 'Doctor', value: scaleCount(rnd(56, 66)) },
      { label: 'Lab/X-Ray', value: scaleCount(rnd(44, 52)) },
      { label: 'Treatment', value: scaleCount(rnd(36, 44)) },
      { label: 'Admit/Discharge', value: scaleCount(rnd(50, 58)) },
    ],
    // ชื่อตาม er_dch_type
    disposition: [
      { label: 'Admitted', value: admit },
      { label: 'กลับบ้าน', value: dch(0) },
      { label: 'ส่งต่อสถานพยาบาลอื่น', value: transfer },
      { label: 'รับไว้สังเกตอาการ', value: dch(4) },
      { label: 'เสียชีวิต', value: dch(3) },
      { label: 'ไม่ระบุ', value: dch(5) },
    ].filter(d => d.value > 0),
    // อยู่ใน ER (เวลาเข้า → เสร็จ) เฉพาะที่ลงเวลาครบ — ยอดจริงรายวัน
    losBuckets: [
      { label: '< 2 ชม.', value: dailyTotal('erTime', start, end, 2) },
      { label: '2 - 4 ชม.', value: dailyTotal('erTime', start, end, 3) },
      { label: '4 - 6 ชม.', value: dailyTotal('erTime', start, end, 4) },
      { label: '> 6 ชม.', value: dailyTotal('erTime', start, end, 5) },
    ],
    // อัตรากำลัง/ทรัพยากรไม่มีในฐาน — ประมาณตามขนาด รพ.ชุมชน (ER เวรละแพทย์ 1-2 คน)
    resources: [
      { label: 'แพทย์เวร', used: rnd(1, 2), total: 2 },
      { label: 'พยาบาล', used: rnd(3, 4), total: 4 },
      { label: 'เตียงสังเกตอาการ', used: rnd(2, 5), total: 6 },
      { label: 'ห้องตรวจ', used: rnd(1, 2), total: 2 },
    ],
    // การวินิจฉัยหลักของผู้ป่วย ER (vn_stat.pdx): ล้างแผล 29.5% · ไข้หวัด 4.6% · วัคซีนพิษสุนัขบ้า 3.7% · เวียนศีรษะ 2.6% · กระเพาะลำไส้อักเสบ 2.6%
    // ยอดจริงรายเดือนต่อรหัส (vn_stat.pdx ของผู้ป่วย ER) รวมตามช่วง · ชื่อตาม icd101 (ไทยถ้ามี)
    topCauses: (() => {
      const items = rankItems(BD.erDx, start, end).slice(0, 5);
      const all = rankItems(BD.erDx, start, end).reduce((a, [, v]) => a + v, 0);
      // ช่วงนอกข้อมูล: ปรับตามยอด ER จริงของช่วง
      const fit = all && (end < DAILY_FROM || start > DAILY_UPTO) ? total / all : 1;
      return items.map(([code, v]) => { const n = icdName(code); return { label: n.nameTh ?? n.name, value: Math.round(v * fit) }; });
    })(),
    alerts: [
      { issue: 'ผู้ป่วยรอพบแพทย์ > 60 นาที', status: 'critical' },
      { issue: 'Lab Turnaround Time สูง', status: 'warning' },
      { issue: 'ER LOS > 6 ชั่วโมง', status: 'warning' },
      { issue: 'จำนวนผู้ป่วยฉุกเฉินเพิ่มขึ้น', status: 'warning' },
      { issue: 'เตียงรับไว้ไม่เพียงพอ', status: 'critical' },
    ],
  };
}
