import { getReport } from '../cache/report-registry';
import type { ErReport } from '../types/reports.types';

export const erService = {
  /** รายงานหน้า ER ตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<ErReport>('er', { start, end });
  },
};
