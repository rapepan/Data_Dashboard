import { getReport } from '../cache/report-registry';
import type { ReadmitReport } from '../types/reports.types';

export const readmitService = {
  /** ผู้ป่วยกลับมานอนซ้ำภายใน 28 วัน ตามช่วงวันที่และหอผู้ป่วย — ผ่านที่พักผล (cache/report-registry.ts) */
  report(start: string, end: string, ward: string) {
    return getReport<ReadmitReport>('readmit', { start, end, ward });
  },
};
