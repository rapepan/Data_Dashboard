import { getReport } from '../cache/report-registry';
import type { DentalReport } from '../types/reports.types';

export const dentalService = {
  /** รายงานทันตกรรมตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<DentalReport>('dental', { start, end });
  },
};
