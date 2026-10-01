import { getReport } from '../cache/report-registry';
import type { DashboardSnapshot } from '../types/dashboard.types';

export const dashboardService = {
  /** ภาพรวมหน้าแรก — ผ่านที่พักผล (cache/report-registry.ts) */
  summary(mode: string, start: string, end: string) {
    return getReport<DashboardSnapshot>('dashboard', { mode, start, end });
  },
};
