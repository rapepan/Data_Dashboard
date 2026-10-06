import { opdTopDiseases } from './top-diseases-mock';
import { changePct, diffSeries, QUEUE_AVERAGE, QUEUE_STEPS, queueSeries, rangeSum, SERIES } from './real-series';
import type { AlertStatus, ErReport, IpdReport, LabelValue, Metric, OpdReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้า OPD / IPD / ER — ตัวเลขใกล้เคียงหน้าจอตัวอย่าง และแปรผันตามจำนวนวันที่เลือก
 * เมื่อต่อ HOSxP ให้แทนที่แต่ละฟังก์ชันด้วยการ query จริง โดยคง response shape เดิม (types/reports.types.ts)
 */
const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const jitter = (value: number, pct = 0.08) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));
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
  // ปริมาณงานเทียบ HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569):
  // ~6,300 ครั้ง/เดือน (~3,950 คน), วันทำการ 240-330 ครั้ง/วัน, เสาร์-อาทิตย์ ~65
  // ผู้ป่วยใหม่ (ไม่เคยมาก่อน) ~8% ของครั้ง · นัดมาตามนัด ~36% ของครั้ง · มาตามนัด ~70% ของนัดทั้งหมด
  const scale = daysBetween(start, end) / 30;
  // ยอดของช่วงวันที่จากยอดรายเดือนจริง (นอกช่วงข้อมูลใช้ค่าเฉลี่ย ~6,300/เดือน)
  const total = jitter(rangeSum(SERIES.opd, start, end) ?? 6300 * scale, 0.03);
  const newPatients = jitter(rangeSum(SERIES.newPatients, start, end) ?? total * 0.08, 0.03);

  // เฉลี่ยต่อวันทำการ รายชั่วโมง (ovst.vsttime 30 วันล่าสุด) — พีค 08:00 และรอบบ่าย 13:00
  const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const hourAvg = [15.0, 31.3, 53.9, 45.6, 28.6, 14.5, 9.8, 33.0, 16.1, 6.8, 5.3, 3.3];
  const hourTotal = hourAvg.map(v => jitter(v, 0.06));
  // ช่วงเช้าตรู่/บ่ายโมง เป็นผู้ป่วยนัดคลินิกมากกว่าช่วงอื่น
  const apptShare = [0.45, 0.45, 0.4, 0.36, 0.3, 0.25, 0.2, 0.42, 0.3, 0.25, 0.2, 0.15];
  const appointment = hourTotal.map((v, i) => Math.round(v * apptShare[i]));
  const walkin = hourTotal.map((v, i) => v - appointment[i]);
  const peakIndex = hourTotal.indexOf(Math.max(...hourTotal));


  // จำนวนผู้ป่วยที่ผ่านแต่ละจุด = สัดส่วนที่มีเวลาบันทึกใน service_time (30 วันล่าสุด)
  // ไม่ใช่ทุกคนผ่านทุกจุด เช่น ทันตกรรม/กายภาพ ไม่ผ่านแพทย์ · สิทธิที่ไม่ต้องจ่ายเงินไม่ผ่านการเงิน
  const flowRatios: [string, number][] = [
    ['ออกบัตร', 1], ['คัดกรองเสร็จ', 0.94], ['แพทย์ตรวจเสร็จ', 0.692], ['ห้องยา', 0.859], ['การเงิน', 0.517],
  ];

  // เวลารอแต่ละขั้นตอนจาก service_time (เฉลี่ย 12 เดือน วันทำการ) — เป้าหมายเป็นค่าที่ตั้งไว้ ไม่ใช่ข้อมูลในฐาน
  const TARGETS = [5, 15, 40, 20, 15];
  const waitSteps = QUEUE_STEPS.map((step, i) => ({ step, avgMinutes: Math.round(jitter(QUEUE_AVERAGE[i] * 10, 0.05) / 10), targetMinutes: TARGETS[i] }));
  // เวลารวมทั้งกระบวนการ (มาถึง → การเงิน) และเวลาจนแพทย์ตรวจเสร็จ (มาถึง → service5)
  const avgWait = waitSteps.reduce((sum, s) => sum + s.avgMinutes, 0);
  const avgDoctor = waitSteps.slice(0, 3).reduce((sum, s) => sum + s.avgMinutes, 0);

  // นัดทั้งหมด ≈ 52% ของจำนวนครั้ง, มาตามนัด ~70% ของนัด → ที่เหลือคือ ยกเลิก/เลื่อน + ไม่มาตามนัด
  const onTime = Math.round(total * 0.36);
  const walkinTotal = total - onTime;
  const appointments = Math.round(onTime / (rnd(68, 72) / 100));
  const cancelled = Math.round(appointments * 0.05);
  const noShow = Math.max(0, appointments - onTime - cancelled);
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
      total: metric(total, changePct(SERIES.opd, start, end)),
      newPatients: metric(newPatients, changePct(SERIES.newPatients, start, end)),
      oldPatients: metric(total - newPatients, changePct(diffSeries(SERIES.opd, SERIES.newPatients), start, end)),
      avgWait: metric(avgWait, changePct(queueSeries([0, 1, 2, 3, 4]), start, end, 'mean')),
      avgDoctor: metric(avgDoctor, changePct(queueSeries([0, 1, 2]), start, end, 'mean')),
      satisfaction: { value: satisfaction, change: 0.2, changeIsAbsolute: true },
    },
    byHour: { labels: hours, total: hourTotal, walkin, appointment, peakLabel: `${hours[peakIndex]} - ${hours[Math.min(peakIndex + 1, hours.length - 1)]}`, peakValue: hourTotal[peakIndex] },
    topDiseases: opdTopDiseases(scale),
    flow: flowRatios.map(([label, ratio]) => ({ label, value: Math.round(total * ratio) })),
    waitSteps,
    appointment: { walkin: walkinTotal, onTime, cancelled, noShow, onTimeRate: Math.round((onTime / appointments) * 100), onTimeRateChange: 2 },
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
  const scale = daysBetween(start, end) / 30;
  const wards = [
    { ward: 'Ward 2', beds: 28, used: rnd(22, 28) },
    { ward: 'Home Ward', beds: 15, used: rnd(2, 5) },
    { ward: 'SEMI ICU', beds: 2, used: rnd(0, 2) },
  ];
  const totalBeds = wards.reduce((sum, w) => sum + w.beds, 0);
  const usedBeds = wards.reduce((sum, w) => sum + w.used, 0);

  // admit / จำหน่าย รายเดือนจริง 9 เดือนล่าสุดนับถึงเดือนของวันสิ้นสุด (real-series) · เดือนสุดท้ายนับถึงวันสิ้นสุด
  // ผู้ป่วยคงค้าง ≈ admit × LOS ÷ 30
  const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const endDay = new Date(`${end}T00:00:00`);
  const trendMonths = Array.from({ length: 9 }, (_, i) => new Date(endDay.getFullYear(), endDay.getMonth() - 8 + i, 1));
  const monthValue = (series: Record<string, number | null>, d: Date, last: boolean, fallback: number) => {
    const v = series[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] ?? fallback;
    return jitter(last ? (v * endDay.getDate()) / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() : v, 0.03);
  };
  const months = trendMonths.map(d => TH_MONTHS[d.getMonth()]);
  const admissions = trendMonths.map((d, i) => monthValue(SERIES.admit, d, i === 8, 168));
  const discharges = trendMonths.map((d, i) => monthValue(SERIES.discharge, d, i === 8, 167));
  const current = admissions.map((v, i) => (i === admissions.length - 1 ? usedBeds : jitter((v * 3.67) / 30, 0.08)));

  const statusCounts: [string, number][] = [['รักษาต่อเนื่อง', 0.659], ['รอจำหน่าย', 0.159], ['รอผลตรวจ', 0.093], ['รอปรึกษาแพทย์', 0.058], ['อื่น ๆ', 0.031]];
  // an_stat.los: < 3 วัน 47.7% · 3-5 วัน 35.2% · 6-10 วัน 13.9% · > 10 วัน 3.3%
  const losBuckets: [string, number][] = [['< 3 วัน', 0.477], ['3 - 5 วัน', 0.352], ['6 - 10 วัน', 0.139], ['> 10 วัน', 0.033]];
  const readmission = Number((11.8 + Math.random() * 1.2).toFixed(1));
  const avgLos = Number((3.5 + Math.random() * 0.35).toFixed(1));
  const mainOcc = Math.round((wards[0].used / wards[0].beds) * 100);

  return {
    start, end,
    kpis: {
      current: metric(usedBeds, undefined),
      admissions: metric(jitter(rangeSum(SERIES.admit, start, end) ?? 168 * scale, 0.03), changePct(SERIES.admit, start, end)),
      discharges: metric(jitter(rangeSum(SERIES.discharge, start, end) ?? 167 * scale, 0.03), changePct(SERIES.discharge, start, end)),
      totalBeds,
      usedBeds,
      avgLos: metric(avgLos, changePct(SERIES.los, start, end, 'mean')),
      readmission30: { value: readmission },
    },
    trend: { labels: months, admissions, discharges, current },
    wards,
    patientStatus: statusCounts.map(([label, ratio]) => ({ label, value: Math.round(usedBeds * ratio) })),
    losBuckets: losBuckets.map(([label, ratio]) => ({ label, value: Math.round(usedBeds * ratio) })),
    flow: [
      // รับใหม่ ~5.3 ราย/วัน (ipt) · รอเตียง = คำขอ admit ที่ยังไม่ได้รับเข้า (ipt_admit_queue ส่วนใหญ่ได้เตียงภายในไม่ถึงชั่วโมง)
      // ไม่แสดง "รอผลตรวจ / รอจำหน่าย" — ช่องสถานะใน ipt ไม่มีการบันทึก
      { label: 'รับใหม่ (วันนี้)', value: rnd(3, 8) },
      { label: 'รอเตียง', value: rnd(0, 1) },
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
    // ipt_admit_queue 12 เดือน: 1,769 คำขอ (~4.9/วัน) · ขอจาก ER 79% (รอ ~7 นาที) / OPD 21% (รอ ~1.1 ชม.) · รอเฉลี่ยรวม ~0.32 ชม.
    waitingBed: { fromEr: rnd(0, 1), fromOpd: rnd(0, 1), avgWaitHours: Number((0.25 + Math.random() * 0.15).toFixed(2)) },
    profile: {
      // an_stat.pcode: บัตรผู้สูงอายุ 41.6% · UC 25.3% · เด็ก 0-12 ปี 10.5% · เบิกต้นสังกัด 5.9% · อื่น ๆ
      byRight: [{ label: 'บัตรผู้สูงอายุ', value: 42 }, { label: 'บัตรประกันสุขภาพถ้วนหน้า 30 บาท', value: 25 }, { label: 'เด็ก 0 - 12 ปี', value: 11 }, { label: 'เบิกหน่วยงานต้นสังกัด', value: 6 }, { label: 'อื่น ๆ', value: 16 }],
      byAge: [{ label: '0-18', value: 15 }, { label: '19-40', value: 12 }, { label: '41-60', value: 24 }, { label: '61-80', value: 40 }, { label: '> 80', value: 9 }],
      // กลุ่มโรคตามหมวดของการวินิจฉัยหลัก (J / I / E / A / R — % ของ admit) · ชื่อหมวดตาม icd11_chapter.chapter_name_thai
      topDiseases: [{ label: 'โรคของระบบหายใจ', value: 18 }, { label: 'โรคของระบบไหลเวียนโลหิต', value: 12 }, { label: 'โรคระบบต่อมไรท่อ โภชนาการ และเมตาบอลิซึม', value: 11 }, { label: 'โรคติดเชื้อหรือโรคจากพยาธิบางชนิด', value: 10 }, { label: 'อาการ อาการแสดง หรือผลการตรวจทางคลินิก ที่มิได้ระบุไว้ที่อื่น', value: 7 }],
    },
    alerts: [
      { issue: `อัตราครองเตียงสูง > 90% (${mainOcc}%)`, ward: 'Ward 2', status: mainOcc > 90 ? 'critical' : 'warning', action: 'เพิ่มการจำหน่าย / ใช้ Home Ward' },
      { issue: 'ระยะรอเตียงเฉลี่ย (ipt_admit_queue) ~20 นาที', ward: 'ER / OPD', status: 'ok', action: 'ติดตามต่อเนื่อง' },
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
const ER_HOURLY = [49, 22, 28, 18, 26, 17, 29, 210, 505, 719, 666, 304, 175, 692, 436, 295, 284, 274, 250, 193, 115, 96, 63, 33];
const ER_TRIAGE = [0.004, 0.024, 0.119, 0.334, 0.519];

export function generateErReport(start: string, end: string): ErReport {
  const days = daysBetween(start, end);
  const total = jitter(rangeSum(SERIES.er, start, end) ?? 61 * days, 0.03);
  // สัดส่วน (ระดับความรุนแรง / จำหน่าย) คงที่ → % เทียบช่วงก่อนเท่ากับของยอดรวม
  const erChange = changePct(SERIES.er, start, end);
  const labels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
  const shapeSum = ER_HOURLY.reduce((a, b) => a + b, 0);
  const perHour = ER_HOURLY.map(f => Math.round((total * f) / shapeSum));
  const triage1 = perHour.map(v => Math.round(v * ER_TRIAGE[0]));
  const triage2 = perHour.map(v => Math.round(v * ER_TRIAGE[1]));
  const triage3 = perHour.map(v => Math.round(v * ER_TRIAGE[2]));
  const triage45 = perHour.map((v, i) => Math.max(0, v - triage1[i] - triage2[i] - triage3[i]));
  const peakCount = perHour.slice(8, 11).reduce((a, b) => a + b, 0);

  const triage: LabelValue[] = [
    // ชื่อตาม er_emergency_type
    { label: '1: Resuscitate / Life threatening', value: Math.round(total * ER_TRIAGE[0]) },
    { label: '2: Emergency', value: Math.round(total * ER_TRIAGE[1]) },
    { label: '3: Urgency', value: Math.round(total * ER_TRIAGE[2]) },
    { label: '4: Semi Urgency / Acute', value: Math.round(total * ER_TRIAGE[3]) },
    { label: '5: Non Urgency / Non Acute', value: 0 },
  ];
  triage[4].value = total - triage.slice(0, 4).reduce((sum, t) => sum + t.value, 0);

  const waitDoctor = rnd(36, 48);
  const admit = Math.round(total * 0.066);
  const transfer = Math.round(total * 0.021);
  // ปริมาณในแต่ละขั้นตอนต่อวัน (สัดส่วนจากหน้าจอตัวอย่าง ปรับตามปริมาณจริง ~61 ครั้ง/วัน)
  const scaleCount = (v: number) => Math.round(v * days * (61 / 312));

  return {
    start, end,
    kpis: {
      total: metric(total, erChange),
      emergency: metric(triage[0].value + triage[1].value, erChange),
      avgWaitDoctor: metric(waitDoctor, undefined),
      admit: metric(admit, erChange),
      discharge: metric(total - admit - transfer, erChange),
      transfer: metric(transfer, erChange),
      satisfaction: { value: Number((4.3 + Math.random() * 0.3).toFixed(1)), change: 0.3, changeIsAbsolute: true },
    },
    byHour: { labels, triage1, triage2, triage3, triage45, peakLabel: '08:00 - 11:00', peakValue: peakCount, peakPct: Math.round((peakCount / total) * 100) },
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
      { label: 'กลับบ้าน', value: total - admit - transfer },
      { label: 'ส่งต่อสถานพยาบาลอื่น', value: transfer },
    ],
    losBuckets: [
      { label: '< 2 ชม.', value: Math.round(total * 0.24) },
      { label: '2 - 4 ชม.', value: Math.round(total * 0.36) },
      { label: '4 - 6 ชม.', value: Math.round(total * 0.27) },
      { label: '> 6 ชม.', value: Math.round(total * 0.13) },
    ],
    // อัตรากำลัง/ทรัพยากรไม่มีในฐาน — ประมาณตามขนาด รพ.ชุมชน (ER เวรละแพทย์ 1-2 คน)
    resources: [
      { label: 'แพทย์เวร', used: rnd(1, 2), total: 2 },
      { label: 'พยาบาล', used: rnd(3, 4), total: 4 },
      { label: 'เตียงสังเกตอาการ', used: rnd(2, 5), total: 6 },
      { label: 'ห้องตรวจ', used: rnd(1, 2), total: 2 },
    ],
    // การวินิจฉัยหลักของผู้ป่วย ER (vn_stat.pdx): ล้างแผล 29.5% · ไข้หวัด 4.6% · วัคซีนพิษสุนัขบ้า 3.7% · เวียนศีรษะ 2.6% · กระเพาะลำไส้อักเสบ 2.6%
    topCauses: [
      // ชื่อตาม icd101.tname
      { label: 'ล้างแผล', value: Math.round(total * 0.295) },
      { label: 'เยื่อบุจมูกและลำคออักเสบ (ไข้หวัด)', value: Math.round(total * 0.046) },
      { label: 'รับวัคซีนโรคกลัวน้ำ (พิษสุนัขบ้า)', value: Math.round(total * 0.037) },
      { label: 'เวียนศีรษะ', value: Math.round(total * 0.026) },
      { label: 'กระเพาะอาหารกับลำไส้อักเสบ และลำไส้ใหญ่อักเสบจากสาเหตุที่ไม่ระบุรายละเอียด', value: Math.round(total * 0.026) },
    ],
    alerts: [
      { issue: 'ผู้ป่วยรอพบแพทย์ > 60 นาที', status: 'critical' },
      { issue: 'Lab Turnaround Time สูง', status: 'warning' },
      { issue: 'ER LOS > 6 ชั่วโมง', status: 'warning' },
      { issue: 'จำนวนผู้ป่วยฉุกเฉินเพิ่มขึ้น', status: 'warning' },
      { issue: 'เตียงรับไว้ไม่เพียงพอ', status: 'critical' },
    ],
  };
}
