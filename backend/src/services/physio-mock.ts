import type { PhysioBreakdown, PhysioCount, PhysioReport, RankedItem } from '../types/reports.types';

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
/** ผู้ป่วยนอก physic_main: 4,772 ครั้ง / 706 คน (6.8 ครั้ง/คน) ใน 240 วันทำการ — อิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน) */
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

/** อันดับโรค OPD (vn_stat.pdx ของ visit กายภาพ) — [รหัส, ชื่อ (ไทยถ้ามี), ครั้ง/ปี, คน/ปี] */
const OPD_DISEASES: [string, string, number, number][] = [
  ['I64', 'โรคอัมพาตฉับพลัน ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 378, 51],
  ['M4796', 'บรเวณเอว', 355, 50],
  ['M170', 'ข้อเข่าเสื่อมปฐมภูมิ  ทั้งสองข้าง', 330, 49],
  ['M179', 'ข้อเข่าเสื่อม   ที่มิได้ระบุรายละเอียด', 263, 38],
  ['M750', 'ถุงหุ้มข้อไหล่อีกเสบยึดติด', 237, 46],
  ['M6260', 'Multiple sites', 181, 34],
  ['M4722', 'บริเวณคอ', 174, 26],
  ['I694', 'ผลที่ตามของโรคลมอัมพาต ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 170, 27],
  ['M4792', 'บริเวณคอ', 160, 34],
  ['M751', 'กลุ่มอาการโรเตเตอร์ คัฟฟ์', 133, 26],
  ['G819', 'อัมพาตครึ่งซีก  ไม่ระบุรายละเอียด', 131, 24],
  ['M6269', 'มิได้ระบุรายละเอียด', 123, 26],
];

/** อันดับโรค IPD (physic_main_ipd + an_stat.pdx) — [รหัส, ชื่อ (ไทยถ้ามี), ครั้ง/ปี, คน/ปี] */
const IPD_DISEASES: [string, string, number, number][] = [
  ['I639', 'เนื้อสมองตายเพราะขาดเลือด ไม่ระบุรายละเอียด', 92, 40],
  ['S1290', 'Fracture of neck, part unspecified: closed', 55, 1],
  ['I64', 'โรคอัมพาตฉับพลัน ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 38, 16],
  ['J189', 'ปอดบวม', 21, 6],
  ['K750', 'โรคฝีในตับ', 11, 1],
  ['C61', 'มะเร็งต่อมลูกหมาก', 10, 2],
  ['I610', 'Intracerebral haemorrhage in hemisphere, subcortical', 10, 3],
  ['A86', 'สมองอักเสบจาดเชื้อไวรัส    ที่มิได้ระบุรายละเอียด', 9, 1],
  ['G459', 'โรคเลือดไปเลี้ยงสมองน้อยชั่วคราว  ที่มิได้ระบุรายละเอียด', 9, 6],
  ['I500', 'หัวใจล้มเหลวแบบมีน้ำคั่ง', 8, 2],
  ['I269', 'Pulmonary embolism without mintion of acute cor pulmonale', 7, 1],
];

/** หัตถการ (physic_list + physic_items) — [รหัสรายการ, ชื่อ, ครั้ง/ปี] */
const PROCEDURES: [string, string, number][] = [
  ['10', 'Hot pack', 2857],
  ['102', 'Peripheral magnetic stimulation (PMS)', 2527],
  ['2', 'US', 1885],
  ['42', 'Strengthening / Weight / Endurance exs.', 1311],
  ['96', 'Vertebral Mobilization', 1240],
  ['13', 'Pelvic Traction (การดึงหลัง)', 908],
  ['21', 'Ambulation Training (ฝึกนั่ง, ยืน, เดินและเคลื่อนย้ายตัว)', 824],
  ['65', 'Combined US and ES', 729],
  ['26', 'Home program (การแนะนำการปฏิบัติตัว, การใช้อุปกรณ์)', 675],
  ['93', 'Balance training', 652],
  ['97', 'Peripheral Mobilization', 641],
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

export function generatePhysioReport(start: string, end: string): PhysioReport {
  const endDate = new Date(`${end}T00:00:00`);
  const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const monthEnd = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;
  const rangeDays = daysBetween(start, end);
  // ตัวเลขอันดับโรค/หัตถการเป็นยอดทั้งปี — ปรับตามช่วงที่เลือก
  const scale = rangeDays / 365;

  // ครั้งรายเดือนจริง ต.ค.–ก.ย. (physic_main) · IPD (physic_main_ipd) ~80 ครั้ง/เดือน
  const OPD_MONTHLY = [350, 307, 337, 378, 453, 494, 430, 426, 423, 391, 397, 368];
  const opdMonthly = OPD_MONTHLY.map(v => jitter(v, 0.05));
  // ผู้ป่วยใน (physic_main_ipd) รายเดือนจริง ต.ค.–ก.ย.
  const IPD_MONTHLY = [42, 56, 30, 33, 27, 36, 48, 37, 49, 27, 14, 27];
  const ipdMonthly = IPD_MONTHLY.map(v => jitter(v, 0.05));

  const rightShare = [0.446, 0.281, 0.128, 0.145];
  // นอกเวลาราชการ (นอก จ.–ศ. 08:30–16:30 ตาม ovst.vsttime): AG 33.4% · UC 24.7% · A2 31.3% · อื่น ๆ 22.9%
  const afterHoursShare = [0.334, 0.247, 0.313, 0.229];
  const byTime = (visits: number) => {
    const totals = rightShare.map(s => Math.round(visits * s));
    const afterHours = totals.map((t, i) => Math.round(t * afterHoursShare[i]));
    return { inHours: totals.map((t, i) => t - afterHours[i]), afterHours };
  };
  const monthlyByTime = (monthly: number[]) => {
    const perMonth = monthly.map(byTime);
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
      { label: 'Home Ward', value: Math.max(1, Math.round(fiscalIpd * 0.005)) },
    ],
    monthly: { labels: MONTHS, ipd: ipdMonthly, opd: opdMonthly },
    topDiseases: { opd: ranked(OPD_DISEASES, scale), ipd: ranked(IPD_DISEASES, scale) },
    topProcedures: PROCEDURES.map(([code, name, visits]) => ({ code, name, visits: jitter(visits * scale, 0.05) })).sort((a, b) => b.visits - a.visits),
    rights: RIGHTS,
    byRight: { opd: byTime(fiscalOpd), ipd: byTime(fiscalIpd) },
    monthlyByRight: { opd: monthlyByTime(opdMonthly), ipd: monthlyByTime(ipdMonthly) },
  };
}
