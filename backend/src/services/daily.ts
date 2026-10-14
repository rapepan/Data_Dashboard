import { DAILY, DAILY_FROM, DAILY_UPTO, ICD_CODE_RATIO, PERSON_RATIO, type DailyKey } from './daily-data';
import { SERIES } from './real-series';

/**
 * ยอดของช่วงวันที่จากยอดจริงรายวัน (daily-data.ts) — ข้อมูลจำลองทุกหน้าใช้ร่วมกัน
 * - วันในช่วงที่ถ่ายข้อมูล: ค่าจริง (ไม่มีแถว = วันนั้นไม่มีบริการ = 0)
 * - วันนอกช่วง (เช่น วันนี้): ค่าเฉลี่ยตามวันในสัปดาห์ของข้อมูลจริง
 * - วันก่อน 1 ต.ค. 68 ของชุดที่มียอดจริงรายเดือนย้อนหลัง (ER / admit / จำหน่าย / Refer): แบ่งยอดของเดือนลงแต่ละวันตามรูปแบบวันในสัปดาห์
 * - "คน" ของช่วงหลายวัน: ผลรวมคนต่อวัน × อัตราคนไม่ซ้ำตามความยาวช่วง (คนเดียวมาหลายวันนับครั้งเดียว)
 */
const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(toTime(iso)).getUTCDay();

export function dates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = toTime(start); t <= toTime(end); t += DAY) out.push(isoOf(t));
  return out;
}

/** ค่าเฉลี่ยรายวันตามวันในสัปดาห์ (0 = อาทิตย์) ของแต่ละชุด — คิดครั้งเดียว */
const dowCache = new Map<DailyKey, number[][]>();
function dowAvg(key: DailyKey): number[][] {
  const hit = dowCache.get(key);
  if (hit) return hit;
  const table = DAILY[key] as Record<string, number[]>;
  const width = Object.values(table)[0]?.length ?? 1;
  const sum = Array.from({ length: 7 }, () => ({ days: 0, v: Array<number>(width).fill(0) }));
  // นับทุกวันในช่วงที่ถ่าย (วันที่ไม่มีแถว = 0) ค่าเฉลี่ยจึงไม่สูงเกินจริง
  for (const d of dates(DAILY_FROM, DAILY_UPTO)) {
    const s = sum[weekday(d)];
    s.days++;
    (table[d] ?? []).forEach((x, i) => { s.v[i] += x; });
  }
  const avg = sum.map(s => s.v.map(x => (s.days ? x / s.days : 0)));
  dowCache.set(key, avg);
  return avg;
}

/** ยอดจริงรายเดือนย้อนหลัง (25 เดือน) ของชุดที่มี — ใช้กับวันก่อนตารางรายวัน */
const MONTHLY_ANCHOR: Partial<Record<DailyKey, Record<string, number | null>>> = {
  er: SERIES.er, admit: SERIES.admit, dch: SERIES.discharge, refer: SERIES.refer,
};

/** ค่าของ 1 วัน (คอลัมน์ col) */
export function dayValue(key: DailyKey, iso: string, col = 0): number {
  if (iso >= DAILY_FROM && iso <= DAILY_UPTO) return (DAILY[key] as Record<string, number[]>)[iso]?.[col] ?? 0;
  const base = dowAvg(key)[weekday(iso)][col] ?? 0;
  const month = iso < DAILY_FROM ? MONTHLY_ANCHOR[key]?.[iso.slice(0, 7)] : undefined;
  if (month === undefined || month === null) return base;
  // สัดส่วนของวันนี้ในเดือน (ตามรูปแบบวันในสัปดาห์) × ยอดจริงทั้งเดือน — คอลัมน์ย่อยปรับด้วยอัตราส่วนเดียวกัน
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const days = dates(`${iso.slice(0, 8)}01`, isoOf(Date.UTC(y, m, 0)));
  const monthShape = days.reduce((s, d) => s + (dowAvg(key)[weekday(d)][0] ?? 0), 0) || 1;
  return base * (month / monthShape);
}

/** ผลรวมของช่วง (ปัดเป็นจำนวนเต็ม) */
export function rangeTotal(key: DailyKey, start: string, end: string, col = 0): number {
  return Math.round(dates(start, end).reduce((s, d) => s + dayValue(key, d, col), 0));
}

/** ค่ารายวันของช่วง (ใช้กับกราฟรายวัน) */
export function rangeDaily(key: DailyKey, start: string, end: string, col = 0): number[] {
  return dates(start, end).map(d => Math.round(dayValue(key, d, col)));
}

/** อัตราตามความยาวช่วง — ประมาณเชิงเส้นบนแกน log ของจำนวนวัน */
function interpolate(points: [number, number][], days: number): number {
  if (days <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [d1, r1] = points[i];
    if (days <= d1) {
      const [d0, r0] = points[i - 1];
      const t = (Math.log(days) - Math.log(d0)) / (Math.log(d1) - Math.log(d0));
      return r0 + (r1 - r0) * t;
    }
  }
  return points[points.length - 1][1];
}

/** คนไม่ซ้ำของช่วง — ชุดที่มีคอลัมน์ p ใช้ผลรวมคนต่อวัน · readmit ใช้ครั้ง × อัตราคน/ครั้ง */
export function rangePersons(key: DailyKey, start: string, end: string, personCol = 1): number {
  const days = dates(start, end).length;
  const ratio = PERSON_RATIO[key];
  const base = key === 'readmit' ? rangeTotal(key, start, end, 0) : rangeTotal(key, start, end, personCol);
  return Math.round(base * (ratio ? interpolate(ratio, days) : 1));
}

/** รหัสโรคไม่ซ้ำของช่วง (หน้า ICD-10) */
export function rangeIcdCodes(start: string, end: string): number {
  const days = dates(start, end).length;
  return Math.round(rangeTotal('icd', start, end, 2) * interpolate(ICD_CODE_RATIO, days));
}

/** ปีงบประมาณ (ค.ศ. ที่เริ่ม ต.ค.) ของวันที่ */
export function fiscalStartYearOf(iso: string): number {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 10 ? y : y - 1;
}

/** 12 เดือนของปีงบที่วันสิ้นสุดอยู่ (ต.ค.–ก.ย.) — เดือนของวันสิ้นสุดนับถึงวันนั้น · เดือนที่ยังไม่ถึง = 0 */
export function fiscalMonthly(key: DailyKey, end: string, col = 0): number[] {
  const fy = fiscalStartYearOf(end);
  return Array.from({ length: 12 }, (_, i) => {
    const y = fy + (i < 3 ? 0 : 1);
    const m = ((9 + i) % 12) + 1;
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    if (first > end) return 0;
    const last = isoOf(Date.UTC(y, m, 0));
    return rangeTotal(key, first, last < end ? last : end, col);
  });
}

/** ต้นเดือนของวันที่ */
export const monthStart = (iso: string) => `${iso.slice(0, 8)}01`;
/** วันแรกของปีงบที่วันนั้นอยู่ */
export const fiscalStart = (iso: string) => `${fiscalStartYearOf(iso)}-10-01`;

/** ช่วงก่อนหน้าที่ยาวเท่ากัน */
export function previousRange(start: string, end: string) {
  const n = dates(start, end).length;
  const prevEnd = toTime(start) - DAY;
  return { start: isoOf(prevEnd - (n - 1) * DAY), end: isoOf(prevEnd) };
}

/** % เปลี่ยนแปลงเทียบช่วงก่อน (ยอดรวม) — undefined = ช่วงก่อนเป็น 0 */
export function changeVsPrevious(key: DailyKey, start: string, end: string, col = 0): number | undefined {
  const prev = previousRange(start, end);
  const before = rangeTotal(key, prev.start, prev.end, col);
  if (!before) return undefined;
  return Math.round(((rangeTotal(key, start, end, col) - before) / before) * 100);
}
