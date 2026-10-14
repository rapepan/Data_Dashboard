import { getReport } from '../cache/report-registry';
import type { TelepharmacyReport } from '../types/reports.types';

export const telepharmacyService = {
  /** รายงาน Telepharmacy (การจ่ายยาผู้ป่วยทางไกล) ตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<TelepharmacyReport>('telepharmacy', { start, end });
  },
};
