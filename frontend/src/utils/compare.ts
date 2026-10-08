import { parseIsoDate, toIsoDate } from './format';

/** ช่วงก่อนหน้าที่ยาวเท่ากัน เช่น 1–31 ต.ค. → 31 ส.ค. – 30 ก.ย. (31 วัน) — ตรงกับ backend real-series.previousRange */
export function previousRange(start: string, end: string) {
  const from = parseIsoDate(start);
  const days = Math.round((parseIsoDate(end).getTime() - from.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - (days - 1));
  return { start: toIsoDate(prevStart), end: toIsoDate(prevEnd) };
}

/** % เปลี่ยนแปลงจากช่วงก่อน (ปัดเป็นจำนวนเต็ม) — undefined ถ้าไม่มีข้อมูลพอเทียบ (ช่วงก่อนเป็น 0 / ไม่มีค่า) */
export function pctChange(current: number | null | undefined, previous: number | null | undefined): number | undefined {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return undefined;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
