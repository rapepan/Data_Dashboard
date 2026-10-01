import type { DashboardFilter, DashboardSnapshot } from '../types/dashboard';
import type { WithMeta } from '../types/reports';
import { apiGet } from './apiClient';
import { PAGE_MEMO_MS } from './reportService';

/** ข้อมูลหน้าแรก — เรียกไม่ได้ให้ error ออกไป (หน้าจอแสดงข้อความแจ้ง) ไม่มีข้อมูลสำรองแทน */
export function fetchDashboardSummary(filter: DashboardFilter, silent = false): Promise<WithMeta<DashboardSnapshot>> {
  return apiGet<WithMeta<DashboardSnapshot>>('/dashboard/summary', {
    params: { mode: filter.mode, start: filter.start, end: filter.end },
    silent,
    // รีเฟรชอัตโนมัติ (silent) ต้องถาม backend จริง ไม่ใช้ผลที่จำไว้
    memoMs: silent ? 0 : PAGE_MEMO_MS,
  });
}
