import { fiscalSeries } from './fiscal-series';
import { PHYSIO_APPT_CAME, PHYSIO_APPT_NOSHOW, PHYSIO_CLAIM, PHYSIO_IPD, PHYSIO_OPD, PHYSIO_SELFPAY, PHYSIO_WALKIN } from './fiscal-data';
import type { PhysioAppointments, PhysioBreakdown, PhysioCount, PhysioMoney, PhysioReport, PhysioRevenue, PhysioRightRevenue, RankedItem } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้ากายภาพบำบัด — ใช้ระหว่างยังไม่ดึงจาก HOSxP (physic_main / physic_plan_detail / physic_items)
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
/**
 * กลุ่มการรักษาตามฐาน (physic_group_treatment ที่บันทึกใน physic_main.type_text) — HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน)
 * รักษา 85.3% · รักษา + ฟื้นฟูสมรรถภาพ 7.5% · ฟื้นฟูสมรรถภาพ 4.3% · ส่งเสริมและป้องกัน 0.6% · ไม่ระบุ 2.3%
 */
const CATEGORIES = ['รักษา', 'รักษา + ฟื้นฟูสมรรถภาพ', 'ฟื้นฟูสมรรถภาพ', 'ส่งเสริมและป้องกัน', 'ไม่ระบุ'];
/** สัดส่วนจำนวนครั้งผู้ป่วยนอกตามกลุ่ม */
const VISIT_SHARE = [0.853, 0.075, 0.043, 0.006, 0.023];
/** ผู้ป่วยนอก physic_main: 4,752 ครั้ง / 706 คน (6.7 ครั้ง/คน) ใน 240 วันทำการ — อิง HOSxP รพ.บางเสาธง (ตรวจซ้ำ 05/10/2569, ย้อนหลัง 12 เดือน) */
const VISITS_PER_DAY = 20;
const OPD_VISITS_PER_PERSON = 6.8;
/** ผู้ป่วยใน physic_main_ipd: 429 ครั้ง / 116 คน (3.7 ครั้ง/คน) ใน 240 วันทำการ — ไม่ได้บันทึกกลุ่มการรักษา จึงอยู่กลุ่ม "ไม่ระบุ" */
const IPD_PER_DAY = 1.8;
const IPD_VISITS_PER_PERSON = 3.7;
const UNSPECIFIED = CATEGORIES.indexOf('ไม่ระบุ');
/** กลุ่มสิทธิหลัก (vn_stat.pcode): AG บัตรผู้สูงอายุ · UC 30 บาท · A2 เบิกต้นสังกัด */
const RIGHTS = ['บัตรผู้สูงอายุ', 'บัตรประกันสุขภาพถ้วนหน้า 30 บาท', 'เบิกหน่วยงานต้นสังกัด', 'อื่น ๆ'];
const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];

const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const jitter = (value: number, pct = 0.12) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function sum(counts: PhysioCount[]): PhysioCount {
  return counts.reduce((acc, c) => ({ persons: acc.persons + c.persons, visits: acc.visits + c.visits }), { persons: 0, visits: 0 });
}

/** days = จำนวนวันทำการโดยประมาณ, onlyIpd = เอาเฉพาะส่วนผู้ป่วยใน */
function breakdown(days: number, onlyIpd = false): PhysioBreakdown {
  // ช่วงสั้น (เช่น 1 วัน) คนแทบไม่ซ้ำ — ช่วงยาวคนเดิมมาหลายครั้งตามค่าเฉลี่ยจริง
  const persons = (visits: number, perPerson: number) => (visits ? Math.max(1, Math.round(visits / (days < 3 ? 1 : perPerson))) : 0);
  const ipdVisits = jitter(IPD_PER_DAY * days);
  const ipd = { visits: ipdVisits, persons: persons(ipdVisits, IPD_VISITS_PER_PERSON) };
  const opdCats = CATEGORIES.map((_, i) => {
    const visits = onlyIpd ? 0 : jitter(VISITS_PER_DAY * days * VISIT_SHARE[i]);
    return { visits, persons: persons(visits, OPD_VISITS_PER_PERSON) };
  });
  const all = opdCats.map((c, i) => (i === UNSPECIFIED ? { visits: c.visits + ipd.visits, persons: c.persons + ipd.persons } : c));
  const total = sum(all);
  return { total, categories: all, ipd, opd: { visits: total.visits - ipd.visits, persons: total.persons - ipd.persons } };
}

/** อันดับโรค OPD (vn_stat.pdx ของ visit กายภาพ) — [รหัส, ชื่อ (ไทยถ้ามี), ครั้ง/ปี, คน/ปี] · ย้อนหลัง 12 เดือน ถึง 05/10/2569 */
const OPD_DISEASES: [string, string, number, number][] = [
  ['I64', 'โรคอัมพาตฉับพลัน ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 380, 51],
  ['M4796', 'บรเวณเอว', 357, 50],
  ['M170', 'ข้อเข่าเสื่อมปฐมภูมิ  ทั้งสองข้าง', 328, 49],
  ['M179', 'ข้อเข่าเสื่อม   ที่มิได้ระบุรายละเอียด', 267, 39],
  ['M750', 'ถุงหุ้มข้อไหล่อีกเสบยึดติด', 234, 47],
  ['M6260', 'Multiple sites', 177, 33],
  ['M4722', 'บริเวณคอ', 173, 26],
  ['I694', 'ผลที่ตามของโรคลมอัมพาต ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 171, 27],
  ['M4792', 'บริเวณคอ', 163, 34],
  ['M751', 'กลุ่มอาการโรเตเตอร์ คัฟฟ์', 132, 26],
  ['G819', 'อัมพาตครึ่งซีก  ไม่ระบุรายละเอียด', 128, 24],
  ['M6261', 'Shoulder region', 123, 32],
];

/** อันดับโรค IPD (physic_main_ipd + an_stat.pdx) — [รหัส, ชื่อ (ไทยถ้ามี), ครั้ง/ปี, คน/ปี] · ย้อนหลัง 12 เดือน ถึง 05/10/2569 */
const IPD_DISEASES: [string, string, number, number][] = [
  ['I64', 'โรคอัมพาตฉับพลัน ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 99, 19],
  ['I639', 'เนื้อสมองตายเพราะขาดเลือด ไม่ระบุรายละเอียด', 92, 39],
  ['S1290', 'Fracture of neck, part unspecified: closed', 55, 1],
  ['J189', 'ปอดบวม', 21, 6],
  ['K750', 'โรคฝีในตับ', 11, 1],
  ['C61', 'มะเร็งต่อมลูกหมาก', 10, 2],
  ['I610', 'Intracerebral haemorrhage in hemisphere, subcortical', 10, 3],
  ['A86', 'สมองอักเสบจาดเชื้อไวรัส    ที่มิได้ระบุรายละเอียด', 9, 1],
  ['G459', 'โรคเลือดไปเลี้ยงสมองน้อยชั่วคราว  ที่มิได้ระบุรายละเอียด', 9, 6],
  ['I500', 'หัวใจล้มเหลวแบบมีน้ำคั่ง', 8, 2],
  ['I269', 'Pulmonary embolism without mintion of acute cor pulmonale', 7, 1],
  ['J690', 'โรคปอดอักเสบจากการสำลัก', 6, 1],
];

/** หัตถการ (physic_list + physic_items) — [รหัสรายการ, ชื่อ, ครั้ง/ปี] · ย้อนหลัง 12 เดือน ถึง 05/10/2569 */
const PROCEDURES: [string, string, number][] = [
  ['10', 'Hot pack', 2843],
  ['102', 'Peripheral magnetic stimulation (PMS)', 2509],
  ['2', 'US', 1879],
  ['42', 'Strengthening / Weight / Endurance exs.', 1308],
  ['96', 'Vertebral Mobilization', 1233],
  ['13', 'Pelvic Traction (การดึงหลัง)', 906],
  ['21', 'Ambulation Training (ฝึกนั่ง, ยืน, เดินและเคลื่อนย้ายตัว)', 823],
  ['65', 'Combined US and ES', 724],
  ['26', 'Home program (การแนะนำการปฏิบัติตัว, การใช้อุปกรณ์)', 676],
  ['93', 'Balance training', 650],
  ['97', 'Peripheral Mobilization', 640],
  ['101', 'การตรวจประเมินและวางแผนการรักษาทางกายภาพบำบัด', 506],
];

function ranked(list: [string, string, number, number][], scale: number): RankedItem[] {
  return list
    .map(([code, name, visits, patients]) => {
      const v = Math.max(1, jitter(visits * scale, 0.06));
      // จำนวนคนต้องไม่เกินจำนวนครั้ง
      return { code, name, visits: v, patients: Math.min(v, Math.max(1, jitter(patients * scale, 0.06))) };
    })
    .sort((a, b) => b.visits - a.visits);
}

/* ---------------- ค่ารักษา (เบิกได้ / เก็บเงิน) — ยอดรวมจาก HOSxP รพ.บางเสาธง ปีงบ 2569 (ตรวจ 06/10/2569) ---------------- */

/**
 * สิทธิ์ "เก็บเงิน" = ชื่อสิทธิ์มีคำว่า "ชำระเงินเอง" + A1 / A2 / B4 (ข้าราชการ — เบิกค่ากายภาพตรงไม่ได้ ผู้ป่วยจ่ายก่อน)
 * ตามรายงานกายภาพบำบัดเดิม · ที่เหลือ = "เบิกได้"
 */
const SELF_PAY_CODES = new Set(['V6', 'P4', '03', '02', '10', '09', '08', 'D8', '51', '53', '52', 'Y7', '19', 'S5', '57', '56', '59', '58', '33', '32', '41', '40', '05', '06', '45', '50', '49', '16', '15', '47', 'L1', 'B6', '36', '35', 'A1', 'A2', 'B4']);

/** ผู้ป่วยนอก: ค่ารักษากายภาพ (vn_stat.inc14) ตามสิทธิ์ ย้อนหลัง 12 เดือน ถึง 05/10/2569 — [pttype, ชื่อสิทธิ์, ครั้ง, บาท] */
const OPD_RIGHTS: [string, string, number, number][] = [
  ['04', 'ผู้มีอายุเกิน 60 ปี (รพ.บางเสาธง)', 2119, 1585940],
  ['01', 'ช่วงอายุ 12-59 ปี (รพ.บางเสาธง) ร่วมจ่าย 30 บาท', 1169, 884610],
  ['A1', 'A1 : สิทธิข้าราชการ # เบิกจ่ายตรง', 532, 630910],
  ['39', 'ผู้มีรายได้น้อย (รพ.บางเสาธง)', 115, 101500],
  ['11', 'บุคคลผู้พิการ (รพ.บางเสาธง)', 115, 78930],
  ['81', 'ฟรี (ส่งเสริมสุขภาพ)', 166, 77460],
  ['34', 'อสม.(รพ.บางเสาธง)', 104, 67170],
  ['A2', 'A2 : สิทธิข้าราชการ อปท. # เบิกจ่ายตรง', 57, 51790],
  ['19', 'ปกส.ต่างสังกัด (ชำระเงินเอง)', 94, 50200],
  ['14', 'มัธยมศึกษาตอนต้น (รพ.บางเสาธง) ร่วมจ่าย 30 บาท', 47, 25570],
  ['V3', 'เยียมบ้าน', 33, 24580],
  ['10', 'ชำระเงินเอง', 34, 21960],
  ['31', 'ผู้นำชุมชน (รพ.บางเสาธง)', 16, 18820],
  ['B4', 'B4: สิทธิเบิกกรุงเทพมหานคร(บุคคลในครอบครัว)', 13, 16110],
  ['12', 'บุคคลผู้พิการ (ในจังหวัด) เบิกได้', 23, 15310],
  ['54', 'ทหารผ่านศึกชั้น 1-3 (รพ.บางเสาธง)', 25, 14440],
  ['13', 'บุคคลผู้พิการ (นอกจังหวัด) เบิกได้', 20, 13910],
  ['55', 'ทหารผ่านศึกชั้น 4 รพ.บางเสาธง', 9, 7740],
  ['23', 'ประกันตนคนพิการ D1 (นอกจังหวัด)เบิกได้', 10, 7700],
  ['99', '99 : บุคคลที่มีปัญหาสถานะและสิทธิ ร่วมจ่าย 30 บาท', 8, 6260],
  ['02', 'ช่วงอายุ 12-59 ปี (ในจังหวัด) ชำระเงินเอง', 6, 5640],
  ['03', 'ช่วงอายุ 12-59 ปี (นอกจังหวัด) ชำระเงินเอง', 10, 5010],
  ['22', 'ประกันตนคนพิการ D1 (ในจังหวัด)เบิกได้', 4, 2240],
  ['06', 'ผู้มีอายุเกิน 60 ปี (นอกจังหวัด) ชำระเงินเอง', 4, 1890],
  ['60', 'สิทธิว่าง/ว่างมาตรา 8/ทหารเรือ/ทหารอากาศ (เบิกได้)', 2, 1870],
  ['05', 'ผู้มีอายุเกิน 60 ปี (ในจังหวัด) ชำระเงินเอง', 3, 1820],
  ['SI', 'ประกันสังคมทุพพลภาพ (สปส 2-19) เบิกได้', 3, 1630],
  ['42', 'รัฐวิสาหกิจ(ชำระเงิน)', 3, 1620],
  ['61', 'ต่างด้าวที่ไม่ขึ้นทะเบียน(ชำระเงิน)', 2, 860],
];

/** ผู้ป่วยใน: ค่ารักษากายภาพ (opitemrece income 14) ตามสิทธิ์ ย้อนหลัง 12 เดือน */
const IPD_RIGHTS: [string, string, number, number][] = [
  ['04', 'ผู้มีอายุเกิน 60 ปี (รพ.บางเสาธง)', 196, 54150],
  ['43', 'ฉุกเฉิน (นอกจังหวัด)', 60, 25960],
  ['01', 'ช่วงอายุ 12-59 ปี (รพ.บางเสาธง) ร่วมจ่าย 30 บาท', 71, 21570],
  ['A1', 'A1 : สิทธิข้าราชการ # เบิกจ่ายตรง', 65, 18080],
  ['34', 'อสม.(รพ.บางเสาธง)', 9, 3160],
  ['11', 'บุคคลผู้พิการ (รพ.บางเสาธง)', 10, 2950],
  ['B4', 'B4: สิทธิเบิกกรุงเทพมหานคร(บุคคลในครอบครัว)', 5, 1310],
  ['39', 'ผู้มีรายได้น้อย (รพ.บางเสาธง)', 4, 1200],
  ['44', 'ฉุกเฉิน (ในจังหวัด)', 5, 1000],
  ['I1', 'IP UC ในเขต (เบิกได้) ร่วมจ่าย 30บาท', 2, 780],
  ['A2', 'A2 : สิทธิข้าราชการ อปท. # เบิกจ่ายตรง', 1, 670],
];

function rightsFor(list: [string, string, number, number][], scale: number): PhysioRightRevenue[] {
  return list
    .map(([code, name, visits, amount]) => {
      const v = Math.round(visits * scale * (1 + (Math.random() * 2 - 1) * 0.06));
      // ค่าต่อครั้งคงที่ตามจริง (ปัดหลักสิบเหมือนอัตราค่าบริการ)
      return { code, name, group: SELF_PAY_CODES.has(code) ? 'selfpay' as const : 'claim' as const, visits: v, amount: Math.round((v * amount) / visits / 10) * 10 };
    })
    .filter(r => r.visits > 0)
    .sort((a, b) => b.amount - a.amount);
}

function totalOf(rights: PhysioRightRevenue[], group: 'claim' | 'selfpay'): PhysioMoney {
  return rights.filter(r => r.group === group).reduce((a, r) => ({ visits: a.visits + r.visits, amount: a.amount + r.amount }), { visits: 0, amount: 0 });
}

function revenue(scale: number, fyStartYear: number, end: string): PhysioRevenue {
  const opd = rightsFor(OPD_RIGHTS, scale);
  const ipd = rightsFor(IPD_RIGHTS, scale);
  return {
    opd: { claim: totalOf(opd, 'claim'), selfpay: totalOf(opd, 'selfpay'), rights: opd },
    ipd: { claim: totalOf(ipd, 'claim'), selfpay: totalOf(ipd, 'selfpay'), rights: ipd },
    monthly: { labels: MONTHS, claim: fiscalSeries(fyStartYear, PHYSIO_CLAIM, end), selfpay: fiscalSeries(fyStartYear, PHYSIO_SELFPAY, end) },
  };
}

/* ---------------- นัดหมาย (คลินิกกายภาพ oapp.clinic 042) — จำนวนครั้งเท่านั้น ปีงบ 2569 ---------------- */

/** ต่อวัน (ปีงบ 2569) */
const APPT_PER_DAY = { came: 2713 / 365, noShow: 1068 / 365, walkIn: 2148 / 365 };
/** นัดตามวัน จ.–ศ. ย้อนหลัง 12 เดือน */
const APPT_WEEKDAY = [804, 865, 595, 850, 702];
/** นัดล่วงหน้า 30 วัน ณ 05/10/2569 */
const APPT_UPCOMING_30 = 202;

function appointments(rangeDays: number, endIsToday: boolean, fyStartYear: number, end: string): PhysioAppointments {
  const pendingToday = endIsToday ? rnd(3, 9) : 0;
  const came = jitter(APPT_PER_DAY.came * rangeDays, 0.06);
  const noShow = jitter(APPT_PER_DAY.noShow * rangeDays, 0.06);
  return {
    total: came + noShow + pendingToday,
    came,
    noShow,
    pendingToday,
    walkIn: jitter(APPT_PER_DAY.walkIn * rangeDays, 0.06),
    upcoming30: jitter(APPT_UPCOMING_30, 0.05),
    monthly: {
      labels: MONTHS,
      came: fiscalSeries(fyStartYear, PHYSIO_APPT_CAME, end),
      noShow: fiscalSeries(fyStartYear, PHYSIO_APPT_NOSHOW, end),
      walkIn: fiscalSeries(fyStartYear, PHYSIO_WALKIN, end),
    },
    weekday: { labels: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'], values: APPT_WEEKDAY.map(v => jitter(v, 0.04)) },
  };
}

export function generatePhysioReport(start: string, end: string): PhysioReport {
  const endDate = new Date(`${end}T00:00:00`);
  const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const monthEnd = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;
  const rangeDays = daysBetween(start, end);
  // ตัวเลขอันดับโรค/หัตถการเป็นยอดทั้งปี — ปรับตามช่วงที่เลือก
  const scale = rangeDays / 365;

  // ครั้งรายเดือนตามปีงบที่ดู (physic_main / physic_main_ipd) — เดือนที่ยังไม่ถึง = 0
  const opdMonthly = fiscalSeries(fyStartYear, PHYSIO_OPD, end, 0.05);
  const ipdMonthly = fiscalSeries(fyStartYear, PHYSIO_IPD, end, 0.05);

  // สัดส่วนสิทธิหลัก (vn_stat.pcode / an_stat.pcode) ย้อนหลัง 12 เดือน: OPD AG 44.6% · UC 28.2% · A2 12.8% · อื่น ๆ 14.5%
  //   IPD AG 44.5% · UC 17.2% · A2 32.6% · อื่น ๆ 5.6% (ผู้ป่วยในสิทธิ A2 สัดส่วนสูงกว่าผู้ป่วยนอกมาก)
  const RIGHT_SHARE = { opd: [0.446, 0.282, 0.128, 0.145], ipd: [0.445, 0.172, 0.326, 0.056] };
  // นอกเวลาราชการ (นอก จ.–ศ. 08:30–16:30 ตาม ovst.vsttime): AG 33.2% · UC 24.7% · A2 31.2% · อื่น ๆ 22.9% — ผู้ป่วยในไม่ได้บันทึกเวลา ใช้สัดส่วนเดียวกัน
  const afterHoursShare = [0.332, 0.247, 0.312, 0.229];
  const byTime = (visits: number, kind: 'opd' | 'ipd' = 'opd') => {
    const totals = RIGHT_SHARE[kind].map(s => Math.round(visits * s));
    const afterHours = totals.map((t, i) => Math.round(t * afterHoursShare[i]));
    return { inHours: totals.map((t, i) => t - afterHours[i]), afterHours };
  };
  const monthlyByTime = (monthly: number[], kind: 'opd' | 'ipd') => {
    const perMonth = monthly.map(v => byTime(v, kind));
    return {
      inHours: RIGHTS.map((_, r) => perMonth.map(m => m.inHours[r])),
      afterHours: RIGHTS.map((_, r) => perMonth.map(m => m.afterHours[r])),
    };
  };

  const range = breakdown(rangeDays * 0.7);
  const fiscalOpd = opdMonthly.reduce((a, b) => a + b, 0);
  const fiscalIpd = ipdMonthly.reduce((a, b) => a + b, 0);

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    categories: CATEGORIES,
    range,
    month: { ...breakdown(endDate.getDate() * 0.7), start: iso(monthStart), end: iso(monthEnd) },
    day: { ...breakdown(rnd(80, 100) / 100), date: end },
    ipdOnly: {
      range: breakdown(rangeDays * 0.7, true),
      month: breakdown(endDate.getDate() * 0.7, true),
      day: breakdown(rnd(80, 100) / 100, true),
    },
    // หอที่เปิดใช้จริง: Ward 2 (หอหลัก) · Home Ward · SEMI ICU
    // หอผู้ป่วยจริง (an_stat.ward): Ward 2 427 ครั้ง · Home Ward 2 ครั้ง
    wards: [
      { label: 'Ward 2', value: jitter(fiscalIpd * 0.995) },
      { label: 'Home Ward', value: Math.round(fiscalIpd * 0.005) },
    ],
    monthly: { labels: MONTHS, ipd: ipdMonthly, opd: opdMonthly },
    topDiseases: { opd: ranked(OPD_DISEASES, scale), ipd: ranked(IPD_DISEASES, scale) },
    topProcedures: PROCEDURES.map(([code, name, visits]) => ({ code, name, visits: jitter(visits * scale, 0.05) })).sort((a, b) => b.visits - a.visits),
    rights: RIGHTS,
    byRight: { opd: byTime(fiscalOpd, 'opd'), ipd: byTime(fiscalIpd, 'ipd') },
    monthlyByRight: { opd: monthlyByTime(opdMonthly, 'opd'), ipd: monthlyByTime(ipdMonthly, 'ipd') },
    revenue: revenue(scale, fyStartYear, end),
    appointments: appointments(rangeDays, end === iso(new Date()), fyStartYear, end),
  };
}
