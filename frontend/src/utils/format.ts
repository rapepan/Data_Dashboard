export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

/** 140000 -> "140.0K" */
export function formatCompact(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
}

function pad(n: number) { return String(n).padStart(2, '0'); }

/** Date -> "2026-09-23" (ค่าสำหรับ <input type="date">) */
export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-09-23" -> "23/09/2569" (ปี พ.ศ. ให้ตรงกับปฏิทิน) */
export function formatDmy(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${Number(y) + 543}`;
}

/** ปีงบประมาณ (พ.ศ.) เริ่ม 1 ต.ค. ของปีก่อนหน้า */
export function fiscalYear(date: Date) {
  return date.getFullYear() + 543 + (date.getMonth() >= 9 ? 1 : 0);
}

export function fiscalYearStart(date: Date) {
  const year = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(year, 9, 1);
}

/** "2026-09-23" -> Date (เวลาท้องถิ่น ไม่เลื่อนวันเพราะ timezone) */
export function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** ช่วงวันของปีงบประมาณ (พ.ศ.) = 1 ต.ค. ปีก่อน ถึง 30 ก.ย. — ปีปัจจุบันตัดถึงวันนี้ */
export function fiscalYearRange(fiscalYearBe: number) {
  const endYear = fiscalYearBe - 543;
  const start = new Date(endYear - 1, 9, 1);
  const end = new Date(endYear, 8, 30);
  const today = new Date();
  return { start: toIsoDate(start), end: toIsoDate(end < today ? end : today) };
}

/** นาที (ทศนิยมได้) -> "01:05:30" (ชม:นาที:วินาที) */
export function formatDuration(minutes: number) {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-09" -> "ก.ย. 2569" */
export function formatThaiMonth(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}
