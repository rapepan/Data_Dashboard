import { getReport } from '../cache/report-registry';
import type { PostalDrugReport } from '../types/reports.types';

export const postalDrugService = {
  /** รายงานการส่งยาทางไปรษณีย์ตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<PostalDrugReport>('postal-drug', { start, end });
  },
};
