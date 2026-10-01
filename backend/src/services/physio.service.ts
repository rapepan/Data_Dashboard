import { getReport } from '../cache/report-registry';
import type { PhysioReport } from '../types/reports.types';

export const physioService = {
  /** รายงานกายภาพบำบัดตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<PhysioReport>('physio', { start, end });
  },
};
