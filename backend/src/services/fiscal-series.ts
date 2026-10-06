/**
 * กราฟรายเดือนตามปีงบประมาณ (ต.ค.–ก.ย.) จากยอดจริงรายเดือน (fiscal-data.ts) — ใช้ร่วมกันทุกหน้าที่เป็นข้อมูลจำลอง
 * - เดือนที่ผ่านแล้ว = ยอดจริง · เดือนของวันสิ้นสุดที่เลือก = นับถึงวันนั้น · เดือนที่ยังไม่ถึง = 0
 * - เดือนที่ไม่มีในตาราง (หลังวันที่ถ่ายข้อมูล) = ประมาณจากเดือนเดียวกันปีก่อน
 */

/** ข้อมูลจริงถ่ายไว้ถึงวันที่นี้ — เดือนนี้ในตารางจึงเป็นยอด "ถึงวันที่ SNAPSHOT_DAY" ไม่ใช่ทั้งเดือน */
export const SNAPSHOT_MONTH = '2026-10';
export const SNAPSHOT_DAY = 5;

export type MonthTable = Record<string, number>;

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const daysIn = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();
const jitter = (value: number, pct: number) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

/** ยอดทั้งเดือน (เดือนที่ถ่ายข้อมูลไว้ไม่ครบเดือน ประมาณจากค่าเฉลี่ยต่อวัน) — undefined = ไม่มีข้อมูล */
function fullMonth(table: MonthTable, key: string): number | undefined {
  const v = table[key];
  if (v === undefined) return undefined;
  if (key !== SNAPSHOT_MONTH) return v;
  const [y, m] = key.split('-').map(Number);
  return (v / SNAPSHOT_DAY) * daysIn(y, m - 1);
}

/**
 * 12 เดือนของปีงบที่เริ่ม ต.ค. ของ fyStartYear (ค.ศ.) นับถึงวันสิ้นสุด end (YYYY-MM-DD)
 * pct = ความต่างแบบสุ่มเล็กน้อย (ข้อมูลจำลอง) · 0 = ใช้ค่าตรงตามตาราง
 */
export function fiscalSeries(fyStartYear: number, table: MonthTable, end: string, pct = 0.04): number[] {
  const endKey = end.slice(0, 7);
  const endDay = Number(end.slice(8, 10));
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(fyStartYear, 9 + i, 1);
    const key = ym(d);
    if (key > endKey) return 0;
    const lastYear = `${d.getFullYear() - 1}-${key.slice(5)}`;
    const month = fullMonth(table, key) ?? fullMonth(table, lastYear);
    if (month === undefined) return 0;
    // เดือนของวันสิ้นสุด: นับถึงวันนั้น (เดือนที่ถ่ายข้อมูลไว้ = ยอดจริงถึงวันที่ถ่าย ถ้าดูตรงวันนั้นพอดี)
    const share = key === endKey ? endDay / daysIn(d.getFullYear(), d.getMonth()) : 1;
    return jitter(month * share, pct);
  });
}

/** ปีงบ (ค.ศ. ที่เริ่ม ต.ค.) ของวันที่ */
export function fiscalStartYear(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return m >= 10 ? y : y - 1;
}
