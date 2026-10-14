import { fiscalSeries } from './fiscal-series';
import { PHYSIO_APPT_CAME, PHYSIO_APPT_NOSHOW, PHYSIO_CLAIM, PHYSIO_SELFPAY, PHYSIO_WALKIN } from './fiscal-data';
import { dates, fiscalMonthly, rangePersons, rangeTotal } from './daily';
import { BD, icdName, monthShares, rankItems, rankItemsVec, sumMonths } from './breakdown';
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
/** ผู้ป่วยใน physic_main_ipd: 429 ครั้ง / 116 คน (3.7 ครั้ง/คน) ใน 240 วันทำการ — ไม่ได้บันทึกกลุ่มการรักษา จึงอยู่กลุ่ม "ไม่ระบุ" */
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


function sum(counts: PhysioCount[]): PhysioCount {
  return counts.reduce((acc, c) => ({ persons: acc.persons + c.persons, visits: acc.visits + c.visits }), { persons: 0, visits: 0 });
}

/**
 * ยอดของช่วง start–end จากยอดจริงรายวัน (daily-data.ts: physic_main / physic_main_ipd) · onlyIpd = เอาเฉพาะส่วนผู้ป่วยใน
 * แยกกลุ่มการรักษาตามสัดส่วนจริง (VISIT_SHARE) · คนของผู้ป่วยในช่วงหลายวัน = ครั้ง ÷ ครั้งต่อคนจริง
 */
function breakdown(start: string, end: string, onlyIpd = false): PhysioBreakdown {
  const days = dates(start, end).length;
  const ipdVisits = rangeTotal('physioIpd', start, end);
  const ipdPersons = days < 3 ? rangeTotal('physioIpd', start, end, 1) : Math.round(ipdVisits / IPD_VISITS_PER_PERSON);
  const ipd = { visits: ipdVisits, persons: ipdVisits ? Math.max(1, ipdPersons) : 0 };
  const opdVisits = onlyIpd ? 0 : rangeTotal('physioOpd', start, end);
  const opdPersons = onlyIpd ? 0 : rangePersons('physioOpd', start, end);
  // แยกกลุ่ม: ปัดเศษแล้วใส่ส่วนต่างไว้กลุ่มใหญ่สุด ผลรวมจะตรงยอดจริง
  const share = categoryShare(start, end);
  const split = (total: number) => {
    const parts = share.map(sh => Math.round(total * sh));
    parts[0] += total - parts.reduce((a, b) => a + b, 0);
    return parts;
  };
  const vs = split(opdVisits);
  const ps = split(opdPersons);
  const opdCats = CATEGORIES.map((_, i) => ({ visits: vs[i], persons: ps[i] }));
  const all = opdCats.map((c, i) => (i === UNSPECIFIED ? { visits: c.visits + ipd.visits, persons: c.persons + ipd.persons } : c));
  const total = sum(all);
  return { total, categories: all, ipd, opd: { visits: total.visits - ipd.visits, persons: total.persons - ipd.persons } };
}

/** สัดส่วนกลุ่มการรักษาของช่วง (ยอดจริงรายเดือน physic_main.type_text) — ไม่มีข้อมูลใช้ VISIT_SHARE */
function categoryShare(start: string, end: string): number[] {
  const shares = monthShares(start, end);
  const v = CATEGORIES.map(c => sumMonths(BD.physioCat[c], shares));
  const sum = v.reduce((a, b) => a + b, 0);
  return sum ? v.map(x => x / sum) : VISIT_SHARE;
}

/** อันดับโรคของช่วง: ยอดจริงรายเดือนต่อรหัส (ครั้ง + คนไม่ซ้ำในเดือน) · ชื่อไทยถ้ามี */
function ranked(set: Record<string, Record<string, number[]>>, start: string, end: string, limit = 12): RankedItem[] {
  return rankItemsVec(set, start, end, 2).slice(0, limit).map(([code, [n, p]]) => {
    const visits = Math.max(1, Math.round(n));
    const nm = icdName(code);
    // จำนวนคนต้องไม่เกินจำนวนครั้ง
    return { code, name: nm.nameTh ?? nm.name, visits, patients: Math.min(visits, Math.max(1, Math.round(p))) };
  });
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

/** ค่ารักษาแยกสิทธิ — สัดส่วนครั้งตามสิทธิจริง (12 เดือน) ปรับให้รวมเท่าครั้งจริงของช่วง (total) · ค่าต่อครั้งตามจริง */
function rightsFor(list: [string, string, number, number][], total: number): PhysioRightRevenue[] {
  const all = list.reduce((a, [, , v]) => a + v, 0) || 1;
  return list
    .map(([code, name, visits, amount]) => {
      const v = Math.round((visits / all) * total);
      // ค่าต่อครั้งคงที่ตามจริง (ปัดหลักสิบเหมือนอัตราค่าบริการ)
      return { code, name, group: SELF_PAY_CODES.has(code) ? 'selfpay' as const : 'claim' as const, visits: v, amount: Math.round((v * amount) / visits / 10) * 10 };
    })
    .filter(r => r.visits > 0)
    .sort((a, b) => b.amount - a.amount);
}

function totalOf(rights: PhysioRightRevenue[], group: 'claim' | 'selfpay'): PhysioMoney {
  return rights.filter(r => r.group === group).reduce((a, r) => ({ visits: a.visits + r.visits, amount: a.amount + r.amount }), { visits: 0, amount: 0 });
}

function revenue(start: string, fyStartYear: number, end: string): PhysioRevenue {
  // ครั้งจริงของช่วง (daily-data.ts: physic_main / physic_main_ipd)
  const opd = rightsFor(OPD_RIGHTS, rangeTotal('physioOpd', start, end));
  const ipd = rightsFor(IPD_RIGHTS, rangeTotal('physioIpd', start, end));
  return {
    opd: { claim: totalOf(opd, 'claim'), selfpay: totalOf(opd, 'selfpay'), rights: opd },
    ipd: { claim: totalOf(ipd, 'claim'), selfpay: totalOf(ipd, 'selfpay'), rights: ipd },
    monthly: { labels: MONTHS, claim: fiscalSeries(fyStartYear, PHYSIO_CLAIM, end), selfpay: fiscalSeries(fyStartYear, PHYSIO_SELFPAY, end) },
  };
}

/* ---------------- นัดหมาย (คลินิกกายภาพ oapp.clinic 042) — จำนวนครั้งเท่านั้น ปีงบ 2569 ---------------- */

/** นัดตามวัน จ.–ศ. ย้อนหลัง 12 เดือน */
const APPT_WEEKDAY = [804, 865, 595, 850, 702];
/** นัดล่วงหน้า 30 วัน ณ 05/10/2569 */
const APPT_UPCOMING_30 = 202;

function appointments(start: string, endIsToday: boolean, fyStartYear: number, end: string): PhysioAppointments {
  const pendingToday = endIsToday ? rnd(3, 9) : 0;
  // มาตามนัด / ไม่มาตามนัด / walk-in ของช่วง = ยอดจริงรายเดือน (fiscal-data.ts) ตามสัดส่วนวันที่ทับกับช่วง
  const shares = monthShares(start, end);
  const came = Math.round(sumMonths(PHYSIO_APPT_CAME, shares));
  const noShow = Math.round(sumMonths(PHYSIO_APPT_NOSHOW, shares));
  return {
    total: came + noShow + pendingToday,
    came,
    noShow,
    pendingToday,
    walkIn: Math.round(sumMonths(PHYSIO_WALKIN, shares)),
    upcoming30: jitter(APPT_UPCOMING_30, 0.05),
    monthly: {
      labels: MONTHS,
      came: fiscalSeries(fyStartYear, PHYSIO_APPT_CAME, end),
      noShow: fiscalSeries(fyStartYear, PHYSIO_APPT_NOSHOW, end),
      walkIn: fiscalSeries(fyStartYear, PHYSIO_WALKIN, end),
    },
    weekday: { labels: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'], values: [...APPT_WEEKDAY] },
  };
}

export function generatePhysioReport(start: string, end: string): PhysioReport {
  const endDate = new Date(`${end}T00:00:00`);
  const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const monthEnd = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;

  // ครั้งรายเดือนตามปีงบที่ดู (physic_main / physic_main_ipd) — เดือนที่ยังไม่ถึง = 0
  const opdMonthly = fiscalMonthly('physioOpd', end);
  const ipdMonthly = fiscalMonthly('physioIpd', end);

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

  const range = breakdown(start, end);
  const mStart = iso(monthStart);
  const fiscalOpd = opdMonthly.reduce((a, b) => a + b, 0);
  const fiscalIpd = ipdMonthly.reduce((a, b) => a + b, 0);

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    categories: CATEGORIES,
    range,
    month: { ...breakdown(mStart, end), start: mStart, end: iso(monthEnd) },
    day: { ...breakdown(end, end), date: end },
    ipdOnly: {
      range: breakdown(start, end, true),
      month: breakdown(mStart, end, true),
      day: breakdown(end, end, true),
    },
    // หอที่เปิดใช้จริง: Ward 2 (หอหลัก) · Home Ward · SEMI ICU
    // หอผู้ป่วยจริง (an_stat.ward): Ward 2 427 ครั้ง · Home Ward 2 ครั้ง
    wards: [
      { label: 'Ward 2', value: jitter(fiscalIpd * 0.995) },
      { label: 'Home Ward', value: Math.round(fiscalIpd * 0.005) },
    ],
    monthly: { labels: MONTHS, ipd: ipdMonthly, opd: opdMonthly },
    // อันดับโรค / หัตถการของช่วง — ยอดจริงรายเดือน (vn_stat.pdx / an_stat.pdx / physic_list)
    topDiseases: { opd: ranked(BD.physioOpdDx, start, end), ipd: ranked(BD.physioIpdDx, start, end) },
    topProcedures: rankItems(BD.physioProc, start, end).slice(0, 15).map(([key, v]) => ({ code: key.slice(0, key.indexOf('|')), name: key.slice(key.indexOf('|') + 1), visits: Math.round(v) })),
    rights: RIGHTS,
    byRight: { opd: byTime(fiscalOpd, 'opd'), ipd: byTime(fiscalIpd, 'ipd') },
    monthlyByRight: { opd: monthlyByTime(opdMonthly, 'opd'), ipd: monthlyByTime(ipdMonthly, 'ipd') },
    revenue: revenue(start, fyStartYear, end),
    appointments: appointments(start, end === iso(new Date()), fyStartYear, end),
  };
}
