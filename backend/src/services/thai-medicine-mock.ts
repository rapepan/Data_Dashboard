import type { ClinicOpd, CountBreakdown, DrugItem, PhysioCount, RankedItem, ThaiMedicineReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้าแพทย์แผนไทย — ใช้ระหว่างยังไม่ดึงจาก HOSxP
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
const CATEGORIES = ['นวด / ประคบสมุนไพร', 'อบสมุนไพร', 'ฟื้นฟูหลังคลอด', 'นวดเท้า-พอกเข่า'];
/**
 * จำนวนครั้งต่อวันทำการของแต่ละบริการ — อิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน)
 * health_med_service_operation: นวด (แบบอื่น/ราชสำนัก/ประคบ) 2,536 · อบไอน้ำสมุนไพร 112 · พอกเข่า 88 · บริบาลหลังคลอด ~8 ครั้ง ใน 239 วันทำการ
 */
const PER_DAY = [10.6, 0.47, 0.035, 0.37];

/** สิทธิการรักษา (vn_stat.pcode ของ visit แผนก 041/049) */
const RIGHTS = ['บัตรผู้สูงอายุ', 'บัตรประกันสุขภาพถ้วนหน้า 30 บาท', 'เบิกหน่วยงานต้นสังกัด', 'ชำระเงินเอง', 'อื่น ๆ'];
const RIGHT_SHARE = [0.354, 0.303, 0.166, 0.082, 0.095];

/** การวินิจฉัยแพทย์แผนไทย (ICD-10-TM, health_med_service_diagnosis): [รหัส, ชื่อ, สัดส่วน] */
const THAI_DISEASES: [string, string, number][] = [
  ['U5733', 'ลมปลายปัตคาดสัญญาณ 4 หลัง / คอ', 0.258],
  ['U5726', 'ลมปลายปัตคาดขา', 0.154],
  ['U5727', 'ลมปลายปัตคาดส้นเท้า', 0.115],
  ['U5732', 'ลมปลายปัตคาดสัญญาณ 3 หลัง', 0.11],
  ['U5731', 'ลมปลายปัตคาดสัญญาณ 1 หลัง', 0.101],
  ['U5753', 'ลมจับโปงแห้งเข่า', 0.098],
  ['U6110', 'อัมพาตครึ่งซีก', 0.044],
  ['U5734', 'ลมปลายปัตคาดสัญญาณ 5 หลัง / คอ', 0.029],
  ['U6115', 'อัมพาตหน้า', 0.026],
  ['U743', 'โรคภูมิแพ้', 0.024],
  ['U7505', 'ปวดกล้ามเนื้อ', 0.023],
];

/** การวินิจฉัยหลักของผู้รับบริการแพทย์แผนจีน (vn_stat.pdx แผนก 049) — ชื่อไทยจาก icd101.tname ถ้ามี */
const CHINESE_DISEASES: [string, string, number][] = [
  ['M5455', 'บริเวณทรวงอกร่วมเอว (Low back pain : Thoracolumbar region)', 0.265],
  ['G819', 'อัมพาตครึ่งซีก  ไม่ระบุรายละเอียด', 0.139],
  ['M179', 'ข้อเข่าเสื่อม   ที่มิได้ระบุรายละเอียด', 0.104],
  ['M7910', 'หลายตำแหน่ง', 0.098],
  ['R200', 'เหน็บชา', 0.078],
  ['M7918', 'อื่นๆ', 0.066],
  ['M750', 'ถุงหุ้มข้อไหล่อีกเสบยึดติด', 0.063],
  ['M6268', 'อื่นๆ', 0.056],
  ['M6538', 'อื่นๆ', 0.05],
  ['M6534', 'มือ', 0.05],
  ['M174', 'ข้อเข่าเสื่อมทุติยภูมิแบบอื่น    ทั้งสองข้าง', 0.031],
];
const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];

/** ยาสมุนไพรที่จ่ายในคลินิกแผนไทย/แผนจีน (opitemrece ของ visit แผนก 041/049 ย้อนหลัง 12 เดือน) — [รหัส, ชื่อ, ชิ้น/ปี, ราคา] */
const HERBS: [string, string, number, number][] = [
  ['1650046', 'ยาสหัศธารา', 9351, 1.71],
  ['1543062', 'เถาวัลย์เปรียง', 8841, 1.5],
  ['1680028', 'ขมิ้นชัน CAP', 7044, 1.5],
  ['1543009', 'เพชรสังฆาต [แคปซูล]', 4578, 1.5],
  ['1540012', 'ยาหอมนวโกฐ', 1540, 1],
  ['1650044', 'ยาปราบชมพูทวีป', 1512, 1.5],
  ['1540018', 'ชาชงขิง', 1320, 4.75],
  ['1540068', 'ยามะระขี้นก', 1248, 1.5],
  ['1680026', 'ฟ้าทะลายโจร', 1180, 1.5],
  ['1500212', 'ขมิ้นชัน  CAP', 966, 1.5],
  ['1680024', 'ครีมไพล', 614, 21.5],
  ['1540053', 'มะขามแขก', 520, 1.5],
];

/** ยาแผนปัจจุบัน — หน้าแผนไทยไม่แสดงแล้ว (ในคลินิกแผนไทย/แผนจีนจ่ายเกือบทั้งหมดเป็นยาสมุนไพร) */
const COMMON: [string, string, number, number][] = [];

const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const jitter = (value: number, pct = 0.1) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/** แพทย์แผนไทย 1 ครั้ง ≈ 1 คน (ตามข้อมูลจริง คนไม่ค่อยมาซ้ำในวันเดียวกัน) */
function breakdown(workdays: number): CountBreakdown {
  const categories = PER_DAY.map(perDay => {
    const visits = jitter(perDay * workdays, 0.15);
    return { visits, persons: visits };
  });
  const total = categories.reduce((acc, c) => ({ visits: acc.visits + c.visits, persons: acc.persons + c.persons }), { visits: 0, persons: 0 });
  return { total, categories };
}

/** วันทำการ (จ.–ศ.) ในช่วงวันที่ */
function workdaysBetween(start: string, end: string) {
  const dates: string[] = [];
  for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(iso(d));
  }
  return dates;
}

function rankDiseases(list: [string, string, number][], visits: number): RankedItem[] {
  return list
    .map(([code, name, share]) => {
      const v = Math.max(1, jitter(visits * share, 0.2));
      return { code, name, visits: v, patients: Math.max(1, Math.min(v, Math.round(v / (1.2 + Math.random() * 0.5)))) };
    })
    .sort((a, b) => b.visits - a.visits);
}

/** ผู้ป่วยนอกของคลินิก — perDay = คน/วันทำการโดยประมาณ
 * สร้างยอดรายวันครั้งเดียว แล้วรวมเป็นช่วงที่เลือก / เดือนนี้ / วันนี้ (ตัวเลขจึงสอดคล้องกันเสมอ) */
function clinicOpd(start: string, end: string, perDay: number, diseases: [string, string, number][], currentFyMonth: number): ClinicOpd {
  const endDate = new Date(`${end}T00:00:00`);
  const monthStart = iso(new Date(endDate.getFullYear(), endDate.getMonth(), 1));
  const from = start < monthStart ? start : monthStart;
  const perDate = new Map(workdaysBetween(from, end).map(date => [date, jitter(perDay, 0.35)]));
  const sumFrom = (since: string) => [...perDate].filter(([date]) => date >= since).reduce((a, [, n]) => a + n, 0);

  const dates = [...perDate.keys()].filter(date => date >= start);
  const rangePersons = sumFrom(start);
  const monthPersons = sumFrom(monthStart);
  const todayPersons = perDate.get(end) ?? 0;
  // คนเดียวมาหลายครั้งได้ → ครั้ง ≈ คน × 1.1
  const withVisits = (persons: number): PhysioCount => ({ persons, visits: Math.round(persons * 1.1) });

  const monthly = MONTHS.map((_, i) => (i > currentFyMonth ? 0 : jitter(perDay * 21, 0.15)));
  monthly[currentFyMonth] = monthPersons;
  return {
    range: withVisits(rangePersons),
    month: { ...withVisits(monthPersons), start: monthStart, end: iso(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)) },
    day: { ...withVisits(todayPersons), date: end },
    avgPerDay: dates.length ? Math.round((rangePersons / dates.length) * 10) / 10 : 0,
    daily: { dates, persons: dates.map(date => perDate.get(date) ?? 0) },
    monthly: { labels: MONTHS, persons: monthly },
    topDiseases: rankDiseases(diseases, Math.round(rangePersons * 1.1)),
  };
}

function drugList(list: [string, string, number, number][], scale: number): DrugItem[] {
  return list
    .map(([code, name, qty, price]) => {
      const q = Math.max(1, jitter(qty * scale, 0.05));
      return { code, name, qty: q, value: Math.round(q * price * 100) / 100 };
    })
    .sort((a, b) => b.qty - a.qty);
}

export function generateThaiMedicineReport(start: string, end: string): ThaiMedicineReport {
  const endDate = new Date(`${end}T00:00:00`);
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;
  const currentFyMonth = (endDate.getMonth() + 3) % 12;
  // ตัวอย่างหน้าจอคือทั้งปีงบประมาณ — อันดับยาปรับตามช่วงที่เลือก
  const scale = daysBetween(start, end) / 357;

  // เดือนหลังวันสิ้นสุดยังไม่เกิดขึ้น
  // ยาสมุนไพรทั้ง รพ. รายเดือน (ต.ค.–ก.ย. ปีงบ 2569 จริง ~5,500–9,000 ชิ้น/เดือน)
  const HERB_MONTHLY = [5482, 5629, 6664, 9079, 5581, 6033, 5920, 6133, 5891, 7042, 8143, 6710];
  const herbMonthly = MONTHS.map((_, i) => (i > currentFyMonth ? 0 : jitter(HERB_MONTHLY[i], 0.06)));
  const commonMonthly = MONTHS.map((_, i) => (i > currentFyMonth ? 0 : jitter(2200, 0.4)));
  const daysInMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
  herbMonthly[currentFyMonth] = Math.round(herbMonthly[currentFyMonth] * endDate.getDate() / daysInMonth);
  commonMonthly[currentFyMonth] = Math.round(commonMonthly[currentFyMonth] * endDate.getDate() / daysInMonth);
  const herbQty = herbMonthly.reduce((a, b) => a + b, 0);
  const commonQty = commonMonthly.reduce((a, b) => a + b, 0);

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    categories: CATEGORIES,
    range: breakdown(daysBetween(start, end) * 0.7),
    month: {
      ...breakdown(endDate.getDate() * 0.7),
      start: iso(new Date(endDate.getFullYear(), endDate.getMonth(), 1)),
      end: iso(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)),
    },
    day: { ...breakdown(rnd(80, 120) / 100), date: end },
    drugs: {
      // มูลค่าเฉลี่ยจริง ~3.68 บาท/ชิ้น
      herb: { qty: herbQty, value: Math.round(herbQty * 3.68 * 100) / 100 },
      common: { qty: commonQty, value: Math.round(commonQty * 2.26 * 100) / 100 },
    },
    monthlyDrugs: { labels: MONTHS, herb: herbMonthly, common: commonMonthly },
    topDrugs: { herb: drugList(HERBS, scale), common: drugList(COMMON, scale) },
    // แผนก 041 แพทย์แผนไทย ~2,426 ครั้ง/ปี (~10 คน/วันทำการ)
    thaiOpd: clinicOpd(start, end, 10.1, THAI_DISEASES, currentFyMonth),
    rightsMonthly: {
      rights: RIGHTS,
      labels: MONTHS,
      values: RIGHTS.map((_, r) => MONTHS.map((__, m) => {
        if (m > currentFyMonth) return 0;
        const monthTotal = jitter(PER_DAY.reduce((a, b) => a + b, 0) * 21, 0.12) * (m === currentFyMonth ? endDate.getDate() / daysInMonth : 1);
        return jitter(monthTotal * RIGHT_SHARE[r], 0.2);
      })),
    },
    chinese: (() => {
      // แผนก 049 แพทย์แผนจีน ~2,030 ครั้ง/ปี (~8.5 คน/วันทำการ)
      const opd = clinicOpd(start, end, 8.5, CHINESE_DISEASES, currentFyMonth);
      // IMC = ผู้ป่วยแผนจีนที่วินิจฉัยหลักเป็นโรคหลอดเลือดสมอง/อัมพาต/บาดเจ็บสมอง-ไขสันหลัง (I6x, G81, G83, S06, S14, S24, S34)
      // จริง 12 เดือน: 246 / 2,030 ครั้ง (12.1%) · 18 / 228 คน (7.9%)
      const share = (c: PhysioCount): PhysioCount => ({ visits: Math.round(c.visits * 0.121), persons: Math.round(c.persons * 0.079) });
      return { ...opd, imc: { range: share(opd.range), month: share(opd.month), day: share(opd.day) } };
    })(),
  };
}
