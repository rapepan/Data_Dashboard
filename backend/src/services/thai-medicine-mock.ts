import { fiscalSeries } from './fiscal-series';
import { dayValue, rangePersons, rangeTotal } from './daily';
import { BD, drugQtyInRange, icdName, monthShares, rankItems, rankItemsVec, sumMonths } from './breakdown';
import { DAILY_UPTO } from './daily-data';
import { CHINESE_PERSONS, HERB_QTY, THAI_PERSONS, THAI_RIGHTS } from './fiscal-data';
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


function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}


/**
 * บริการแผนไทยของช่วง — ครั้ง/คนจริงของแผนก 041 (daily-data.ts) แบ่งตามสัดส่วนบริการจริง (PER_DAY)
 * บริการต่อครั้ง: 2,744 บริการ ÷ 2,416 ครั้ง (12 เดือน) ≈ 1.14 · คนแต่ละบริการ = คนไม่ซ้ำของช่วง × สัดส่วน
 */
const SERVICES_PER_VISIT = 2744 / 2416;
function breakdown(start: string, end: string): CountBreakdown {
  // บริการแต่ละประเภท = ครั้งจริงของช่วง × บริการต่อครั้งจริงของเดือนที่ทับกับช่วง (health_med_service_operation)
  const shares = monthShares(start, end);
  let monthVisits = 0;
  for (const [m, f] of shares) monthVisits += rangeTotal('thai', `${m}-01`, monthEndOf(m)) * f;
  const perVisit = CATEGORIES.map(c => (monthVisits ? sumMonths(BD.thaiCat[c], shares) / monthVisits : 0));
  const fallback = perVisit.every(v => v === 0);
  const all = PER_DAY.reduce((a, b) => a + b, 0);
  const visits = rangeTotal('thai', start, end);
  const persons = rangePersons('thai', start, end);
  const categories = CATEGORIES.map((_, i) => {
    const per = fallback ? (PER_DAY[i] / all) * SERVICES_PER_VISIT : perVisit[i];
    const v = Math.round(visits * per);
    return { visits: v, persons: Math.min(persons, v, Math.round(persons * per)) };
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

/** อันดับโรคของช่วง — ยอดจริงรายเดือนต่อรหัส · ชื่อจากรายการเดิม (ICD-10-TM) หรือ icd101 · คน ≈ ครั้ง × อัตราคน/ครั้งของคลินิกในช่วง */
function rankDiseases(key: 'thai' | 'chinese', named: [string, string, number][], start: string, end: string, personRatio: number): RankedItem[] {
  const names = new Map(named.map(([code, name]) => [code, name]));
  const rows: [string, number, number][] = key === 'thai'
    ? rankItems(BD.thaiDx, start, end).map(([c, n]) => [c, n, n * personRatio])
    : rankItemsVec(BD.chineseDx, start, end, 2).map(([c, v]) => [c, v[0], v[1]]);
  return rows.slice(0, 10).map(([code, n, p]) => {
    const visits = Math.max(1, Math.round(n));
    const nm = icdName(code);
    return { code, name: names.get(code) ?? nm.nameTh ?? nm.name, visits, patients: Math.max(1, Math.min(visits, Math.round(p))) };
  });
}
const monthEndOf = (ym: string) => iso(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0));

/** ผู้ป่วยนอกของคลินิก (key = ชุดยอดจริงรายวันใน daily-data.ts: thai = แผนก 041, chinese = แผนก 049)
 * สร้างยอดรายวันครั้งเดียว แล้วรวมเป็นช่วงที่เลือก / เดือนนี้ / วันนี้ (ตัวเลขจึงสอดคล้องกันเสมอ) */
function clinicOpd(start: string, end: string, key: 'thai' | 'chinese', diseases: [string, string, number][], monthTable: Record<string, number>): ClinicOpd {
  const endDate = new Date(`${end}T00:00:00`);
  const monthStart = iso(new Date(endDate.getFullYear(), endDate.getMonth(), 1));
  // คนไม่ซ้ำ: ช่วงที่ตรงกับ 1 เดือนเต็ม (หรือเดือนปัจจุบันนับถึงวันที่ถ่ายข้อมูล) ใช้ยอดจริงรายเดือน (fiscal-data.ts) · ช่วงอื่นประมาณจากยอดรายวัน
  const exactMonth = (from: string, to: string) => {
    if (!from.endsWith('-01') || from.slice(0, 7) !== to.slice(0, 7)) return undefined;
    const [y, m] = from.split('-').map(Number);
    const last = iso(new Date(y, m, 0));
    const covered = to >= last || (from.slice(0, 7) === DAILY_UPTO.slice(0, 7) && to >= DAILY_UPTO);
    return covered ? monthTable[from.slice(0, 7)] : undefined;
  };
  const count = (from: string, to: string): PhysioCount => ({ persons: exactMonth(from, to) ?? rangePersons(key, from, to), visits: rangeTotal(key, from, to) });
  const dates = workdaysBetween(start, end);
  const range = count(start, end);

  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;
  // คนไม่ซ้ำรายเดือนจริง (เดือนของวันสิ้นสุดนับถึงวันนั้น)
  const monthly = fiscalSeries(fyStartYear, monthTable, end, 0.05);
  return {
    range,
    month: { ...count(monthStart, end), start: monthStart, end: iso(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)) },
    day: { ...count(end, end), date: end },
    // คนต่อวันทำการ (คนในแต่ละวันรวมกัน ÷ วันทำการ)
    avgPerDay: dates.length ? Math.round((rangeTotal(key, start, end, 1) / dates.length) * 10) / 10 : 0,
    daily: { dates, persons: dates.map(date => Math.round(dayValue(key, date, 1))) },
    monthly: { labels: MONTHS, persons: monthly },
    topDiseases: rankDiseases(key, diseases, start, end, range.visits ? range.persons / range.visits : 1),
  };
}

/** ยาสมุนไพรของช่วง — ปริมาณจริงรายเดือนต่อรายการ (drug-history.ts) ตามสัดส่วนวันที่ทับกับช่วง × ราคาขาย */
function drugList(list: [string, string, number, number][], start: string, end: string): DrugItem[] {
  return list
    .map(([code, name, , price]) => {
      const q = Math.round(drugQtyInRange(code, start, end) ?? 0);
      return { code, name, qty: q, value: Math.round(q * price * 100) / 100 };
    })
    .filter(d => d.qty > 0)
    .sort((a, b) => b.qty - a.qty);
}

export function generateThaiMedicineReport(start: string, end: string): ThaiMedicineReport {
  const endDate = new Date(`${end}T00:00:00`);
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;

  // เดือนหลังวันสิ้นสุดยังไม่เกิดขึ้น
  // ยาสมุนไพรทั้ง รพ. รายเดือนจริง (~5,500–9,000 ชิ้น/เดือน) · เดือนที่ยังไม่ถึง = 0
  const herbMonthly = fiscalSeries(fyStartYear, HERB_QTY, end);
  // ยาแผนปัจจุบัน — หน้าแผนไทยไม่แสดงแล้ว
  const commonMonthly = MONTHS.map(() => 0);
  const herbQty = herbMonthly.reduce((a, b) => a + b, 0);
  const commonQty = commonMonthly.reduce((a, b) => a + b, 0);

  return {
    start,
    end,
    fiscalYear: fyStartYear + 1 + 543,
    categories: CATEGORIES,
    range: breakdown(start, end),
    month: {
      ...breakdown(iso(new Date(endDate.getFullYear(), endDate.getMonth(), 1)), end),
      start: iso(new Date(endDate.getFullYear(), endDate.getMonth(), 1)),
      end: iso(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)),
    },
    day: { ...breakdown(end, end), date: end },
    drugs: {
      // มูลค่าเฉลี่ยจริง ~3.68 บาท/ชิ้น
      herb: { qty: herbQty, value: Math.round(herbQty * 3.68 * 100) / 100 },
      common: { qty: commonQty, value: Math.round(commonQty * 2.26 * 100) / 100 },
    },
    monthlyDrugs: { labels: MONTHS, herb: herbMonthly, common: commonMonthly },
    topDrugs: { herb: drugList(HERBS, start, end), common: drugList(COMMON, start, end) },
    // แผนก 041 แพทย์แผนไทย ~2,426 ครั้ง/ปี (~10 คน/วันทำการ)
    thaiOpd: clinicOpd(start, end, 'thai', THAI_DISEASES, THAI_PERSONS),
    rightsMonthly: {
      rights: RIGHTS,
      labels: MONTHS,
      // ครั้งจริงรายเดือนตามสิทธิ (visit แผนก 041/049)
      values: RIGHTS.map((_, r) => fiscalSeries(fyStartYear, THAI_RIGHTS[r], end, 0.05)),
    },
    chinese: (() => {
      // แผนก 049 แพทย์แผนจีน ~2,030 ครั้ง/ปี (~8.5 คน/วันทำการ)
      const opd = clinicOpd(start, end, 'chinese', CHINESE_DISEASES, CHINESE_PERSONS);
      // IMC = ผู้ป่วยแผนจีนที่วินิจฉัยหลักเป็นโรคหลอดเลือดสมอง/อัมพาต/บาดเจ็บสมอง-ไขสันหลัง (I6x, G81, G83, S06, S14, S24, S34)
      // จริง 12 เดือน: 246 / 2,030 ครั้ง (12.1%) · 18 / 228 คน (7.9%)
      const share = (c: PhysioCount): PhysioCount => ({ visits: Math.round(c.visits * 0.121), persons: Math.round(c.persons * 0.079) });
      return { ...opd, imc: { range: share(opd.range), month: share(opd.month), day: share(opd.day) } };
    })(),
  };
}
