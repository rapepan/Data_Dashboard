import { getReport } from '../cache/report-registry';
import type { QueueReport } from '../types/reports.types';

export const queueService = {
  /** ระยะเวลารอคอย OPD รายขั้นตอน ตามช่วงวันที่ — ผ่านที่พักผล (ข้อมูลจริง/จำลองกำหนดที่ cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<QueueReport>('queue', { start, end });
  },
};
