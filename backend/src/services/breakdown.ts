import { BD, BREAKDOWN_UPTO } from './breakdown-data';
import { DRUG_FY_MONTHLY } from './drug-history';

/**
 * รวมตัวเลขรองรายเดือน (breakdown-data.ts) ให้เป็นช่วงวันที่ที่เลือก
 * - เดือนที่ทับกับช่วง นับตามสัดส่วนวัน (เดือนปัจจุบันที่ข้อมูลยังไม่ครบ หารด้วยจำนวนวันที่มีข้อมูล)
 * - ช่วงที่อยู่นอกข้อมูล (ก่อน ต.ค. 68) ใช้สัดส่วนของทั้งช่วงข้อมูล — ผู้เรียกปรับขนาดให้ตรงยอดรวมจริงของหน้านั้นเอง
 */
type MonthMap<T> = Readonly<Record<string, T>>;

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const daysInMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const UPTO_MONTH = BREAKDOWN_UPTO.slice(0, 7);
const UPTO_DAY = Number(BREAKDOWN_UPTO.slice(8, 10));
const FIRST_MONTH = '2025-10';

/** เดือน → สัดส่วนของเดือนที่ใช้ (ช่วงนอกข้อมูล → ทุกเดือนในข้อมูลเท่ากัน ใช้เป็น "รูปแบบ") */
export function monthShares(start: string, end: string): Map<string, number> {
  const shares = new Map<string, number>();
  for (let t = toTime(start); t <= toTime(end); t += DAY) {
    const ym = new Date(t).toISOString().slice(0, 7);
    if (ym < FIRST_MONTH || ym > UPTO_MONTH) continue;
    const denom = ym === UPTO_MONTH ? UPTO_DAY : daysInMonth(ym);
    shares.set(ym, (shares.get(ym) ?? 0) + 1 / denom);
  }
  if (shares.size === 0) {
    // ช่วงทั้งหมดอยู่นอกข้อมูล — ใช้ทุกเดือนที่มี (ผู้เรียกปรับขนาดเอง)
    for (let ym = FIRST_MONTH; ym <= UPTO_MONTH; ym = nextMonth(ym)) shares.set(ym, 1);
  }
  return shares;
}
const nextMonth = (ym: string) => {
  const y = Number(ym.slice(0, 4)); const m = Number(ym.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** ผลรวมของรายการเดียว (ค่าเป็นตัวเลข) */
export function sumMonths(table: MonthMap<number> | undefined, shares: Map<string, number>): number {
  if (!table) return 0;
  let s = 0;
  for (const [m, f] of shares) s += (table[m] ?? 0) * f;
  return s;
}

/** ผลรวมของรายการเดียว (ค่าเป็นอาร์เรย์) */
export function sumMonthsVec(table: MonthMap<readonly number[]> | undefined, shares: Map<string, number>, width: number): number[] {
  const s = Array<number>(width).fill(0);
  if (!table) return s;
  for (const [m, f] of shares) (table[m] ?? []).forEach((v, i) => { s[i] += v * f; });
  return s;
}

/** ทุกรายการของชุด → ผลรวมของช่วง (เรียงมากไปน้อย) */
export function rankItems(set: Readonly<Record<string, MonthMap<number>>>, start: string, end: string): [string, number][] {
  const shares = monthShares(start, end);
  return Object.entries(set).map(([k, t]) => [k, sumMonths(t, shares)] as [string, number]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

/** ทุกรายการของชุดที่ค่าเป็นอาร์เรย์ → ผลรวมของช่วง เรียงตามคอลัมน์ sortCol */
export function rankItemsVec(set: Readonly<Record<string, MonthMap<readonly number[]>>>, start: string, end: string, width: number, sortCol = 0): [string, number[]][] {
  const shares = monthShares(start, end);
  return Object.entries(set).map(([k, t]) => [k, sumMonthsVec(t, shares, width)] as [string, number[]]).filter(([, v]) => v[sortCol] > 0).sort((a, b) => b[1][sortCol] - a[1][sortCol]);
}

/** ปรับขนาดให้ผลรวมเท่า total (ปัดเศษแล้วใส่ส่วนต่างไว้รายการแรก) */
export function scaleTo(values: number[], total: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!sum) return values.map(() => 0);
  const out = values.map(v => Math.round((v / sum) * total));
  const diff = total - out.reduce((a, b) => a + b, 0);
  if (out.length) out[out.indexOf(Math.max(...out))] += diff;
  return out;
}

/** ชื่อโรค: ไทย (icd101.tname) ถ้ามี ไม่งั้นชื่ออังกฤษ · ไม่พบ = รหัส */
export function icdName(code: string): { name: string; nameTh?: string } {
  const n = (BD.names as Record<string, readonly [string, string | null]>)[code];
  if (!n) return { name: code };
  return n[1] ? { name: n[0], nameTh: n[1] } : { name: n[0] };
}

/** รายชั่วโมงของช่วง (24 ช่อง) — ชุด opdHour / erHour / teleHour */
export function hourly<T extends number | readonly number[]>(set: MonthMap<readonly T[]>, start: string, end: string): T[] {
  const shares = monthShares(start, end);
  const out: (number | number[])[] = Array.from({ length: 24 }, () => 0);
  for (const [m, f] of shares) {
    (set[m] ?? []).forEach((v, h) => {
      if (Array.isArray(v)) out[h] = (Array.isArray(out[h]) ? out[h] as number[] : v.map(() => 0)).map((x, i) => x + (v as readonly number[])[i] * f);
      else out[h] = (out[h] as number) + (v as number) * f;
    });
  }
  return out as T[];
}

/** วันทำการที่มีข้อมูลในช่วง (ตามสัดส่วนเดือน) — ใช้หาค่าเฉลี่ยต่อวันทำการของชุดรายชั่วโมง */
export function workdaysIn(start: string, end: string): number {
  return sumMonths(BD.workdays as MonthMap<number>, monthShares(start, end));
}

/** ปริมาณยาของช่วง — ยอดจริงรายเดือนต่อรายการ (drug-history.ts) ตามสัดส่วนวัน · undefined = ไม่มีประวัติรายการนี้ */
export function drugQtyInRange(code: string, start: string, end: string): number | undefined {
  const hist = DRUG_FY_MONTHLY[code];
  if (!hist) return undefined;
  let q = 0;
  for (let t = toTime(start); t <= toTime(end); t += DAY) {
    const d = new Date(t);
    const y = d.getUTCFullYear(); const m = d.getUTCMonth();
    const fyBe = (m >= 9 ? y + 1 : y) + 543;
    q += (hist[fyBe]?.[(m + 3) % 12] ?? 0) / new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  }
  return q;
}

export { BD };
