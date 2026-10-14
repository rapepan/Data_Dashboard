import { BD, icdName, rankItems, rankItemsVec } from './breakdown';
import { rangeTotal } from './daily';
import { DAILY_FROM, DAILY_UPTO } from './daily-data';

/**
 * อันดับโรค (วินิจฉัยหลัก) ของช่วงวันที่ — ยอดจริงรายเดือนต่อรหัส (breakdown-data.ts) รวมตามสัดส่วนวันที่ทับกับช่วง
 * ใช้ร่วมกันทั้งหน้า OPD, หน้าแรก (Dashboard) และหน้า ICD-10 ให้ตัวเลขตรงกัน
 * - OPD: ovstdiag diagtype = 1 (60 รหัสที่พบมากสุดตั้งแต่ ต.ค. 68) — ครั้ง + คนไม่ซ้ำ
 * - IPD: an_stat.pdx ตามวันที่ admit (25 รหัส)
 */
const DAY = 86_400_000;
const daysOf = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1;
const outside = (start: string, end: string) => end < DAILY_FROM || start > DAILY_UPTO;

/** ช่วงนอกข้อมูล: ปรับตามยอดวินิจฉัยจริงของช่วงนั้น เทียบกับทั้งช่วงข้อมูล */
function fitFor(start: string, end: string) {
  return outside(start, end) ? rangeTotal('icd', start, end) / Math.max(1, rangeTotal('icd', DAILY_FROM, DAILY_UPTO)) : 1;
}

/** คนไม่ซ้ำของช่วงหลายเดือน: ผลรวมคนรายเดือน × อัตราคนไม่ซ้ำจริงตามความยาวช่วง (1 เดือน = 1 → ทั้งปี = ค่าจริงของรหัสนั้น) */
function personFactor(code: string, days: number) {
  const year = (BD.opdDxYear as Record<string, readonly number[]>)[code];
  const months = (BD.opdDx as Record<string, Record<string, readonly number[]>>)[code];
  if (!year || !months || days <= 31) return 1;
  const sumMonthly = Object.values(months).reduce((s, v) => s + v[1], 0) || 1;
  const yearRatio = Math.min(1, year[1] / sumMonthly);
  const t = Math.min(1, Math.log(days / 31) / Math.log(365 / 31));
  return 1 + (yearRatio - 1) * t;
}

/** OPD — limit อันดับแรก */
export function opdTopDiseases(start: string, end: string, limit = 10) {
  const fit = fitFor(start, end);
  const days = daysOf(start, end);
  return rankItemsVec(BD.opdDx as Record<string, Record<string, readonly number[]>>, start, end, 2)
    .slice(0, limit)
    .map(([code, [n, p]]) => {
      const visits = Math.max(1, Math.round(n * fit));
      return { code, ...icdName(code), visits, patients: Math.max(1, Math.min(visits, Math.round(p * fit * personFactor(code, days)))) };
    });
}

/** OPD ทั้งชุด (60 รหัส) — หน้า ICD-10 */
export function opdDiseaseList(start: string, end: string) {
  return opdTopDiseases(start, end, 60);
}

/** IPD — admit ส่วนใหญ่ 1 คน = 1 ครั้งในช่วงสั้น ช่วงยาวมีคนกลับมานอนซ้ำเล็กน้อย */
export function ipdTopDiseases(start: string, end: string, limit = 10) {
  const fit = outside(start, end) ? rangeTotal('admit', start, end) / Math.max(1, rangeTotal('admit', DAILY_FROM, DAILY_UPTO)) : 1;
  const days = daysOf(start, end);
  return rankItems(BD.ipdDx as Record<string, Record<string, number>>, start, end)
    .slice(0, limit)
    .map(([code, n]) => {
      const admits = Math.max(1, Math.round(n * fit));
      return { code, ...icdName(code), admits, patients: Math.max(1, Math.round(admits * (days > 90 ? 0.9 : 1))) };
    });
}

