import { getReport } from '../cache/report-registry';
import type { ReferralReport } from '../types/reports.types';

export const referralService = {
  /** การส่งต่อผู้ป่วย (Refer Out) ตามช่วงวันที่และจุดส่งต่อ — ผ่านที่พักผล (cache/report-registry.ts) */
  report(start: string, end: string, point: string) {
    return getReport<ReferralReport>('referral', { start, end, point });
  },
};
