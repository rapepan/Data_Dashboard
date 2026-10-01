import { getReport } from '../cache/report-registry';
import type { ThaiMedicineReport } from '../types/reports.types';

export const thaiMedicineService = {
  /** รายงานแพทย์แผนไทยตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<ThaiMedicineReport>('thai-medicine', { start, end });
  },
};
