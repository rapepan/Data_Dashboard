import { getReport } from '../cache/report-registry';
import type { IpdReport } from '../types/reports.types';

export const ipdService = {
  /** รายงานหน้า IPD ตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<IpdReport>('ipd', { start, end });
  },
};
