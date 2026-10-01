import { getReport } from '../cache/report-registry';
import type { TelemedicineReport } from '../types/reports.types';

export const telemedicineService = {
  /** รายงานการแพทย์ทางไกลตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<TelemedicineReport>('telemedicine', { start, end });
  },
};
