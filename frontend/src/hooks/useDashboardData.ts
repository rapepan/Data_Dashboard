import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardFilter, DashboardSnapshot, FilterMode, SeriesToggle } from '../types/dashboard';
import { fetchDashboardSummary } from '../services/dashboardService';
import { fiscalYearStart, toIsoDate } from '../utils/format';
import { useAuth } from '../auth/AuthContext';
import type { WithMeta } from '../types/reports';
import { ApiError, clearApiMemo } from '../services/apiClient';
import { SKELETON_MIN_MS, useMinDelay } from './useMinDelay';

const DEFAULT_SERIES: SeriesToggle = { opd: true, ipd: true, er: true };
/** เช็กข้อมูลใหม่ทุก 5 นาที — backend เตรียมข้อมูลใหม่ทุก 30 นาที การเช็กนี้อ่านจากผลที่พักไว้ ไม่แตะ HOSxP */
const AUTO_REFRESH_MS = 5 * 60_000;

export function defaultFilter(mode: FilterMode): DashboardFilter {
  const today = new Date();
  const start = mode === 'fiscal' ? fiscalYearStart(today) : new Date(today.getFullYear(), today.getMonth(), 1);
  return { mode, start: toIsoDate(start), end: toIsoDate(today) };
}

export function useDashboardData() {
  const [filter, setFilter] = useState<DashboardFilter>(() => defaultFilter('range'));
  const [series, setSeries] = useState<SeriesToggle>(DEFAULT_SERIES);
  const [data, setData] = useState<WithMeta<DashboardSnapshot> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const skeletonDone = useMinDelay();
  // เปลี่ยนตัวกรอง / กดรีเฟรช → แสดง Skeleton ระหว่างโหลด (แทน spinner กลางจอ)
  const [reloading, setReloading] = useState(false);
  // login/logout แล้วต้องโหลดใหม่ — ข้อมูลบางส่วน (เช่น รายละเอียดค่ารักษา) ส่งให้เฉพาะผู้ที่มีสิทธิ์
  const userKey = useAuth().user?.loginname ?? null;

  const load = useCallback(async (next: DashboardFilter, silent = false) => {
    // ถ้าเปลี่ยนตัวกรองรัว ๆ ให้ใช้เฉพาะผลของ request ล่าสุด (กันผลเก่ามาทับผลใหม่)
    const requestId = ++latestRequest.current;
    const started = Date.now();
    // รีเฟรชอัตโนมัติเบื้องหลัง (silent) เปลี่ยนตัวเลขเงียบ ๆ ไม่แสดง Skeleton
    if (!silent) setReloading(true);
    try {
      const snapshot = await fetchDashboardSummary(next, silent);
      const wait = silent ? 0 : SKELETON_MIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      if (requestId !== latestRequest.current) return;
      setData(snapshot);
      setError(null);
    } catch (err) {
      // 401/403 — AuthProvider พาไปหน้า login/แจ้งไม่มีสิทธิ์ให้แล้ว
      if (requestId !== latestRequest.current || (err instanceof ApiError && (err.status === 401 || err.status === 403))) return;
      // ข้อมูลเดิม (ถ้ามี) ยังแสดงอยู่ แต่บอกให้รู้ว่าอัปเดตไม่ได้
      setError(err instanceof ApiError ? err.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ข้อมูลที่แสดงอาจไม่เป็นปัจจุบัน กรุณาลองใหม่อีกครั้ง');
    } finally {
      if (requestId === latestRequest.current) setReloading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(filter); }, [filter, load, userKey]);

  useEffect(() => {
    const id = setInterval(() => load(filter, true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [filter, load]);

  const toggleSeries = (key: keyof SeriesToggle) => setSeries(prev => ({ ...prev, [key]: !prev[key] }));
  const refresh = () => { clearApiMemo(); void load(filter); };

  return { filter, applyFilter: setFilter, series, toggleSeries, data: skeletonDone && !reloading ? data : null, error: skeletonDone && !reloading ? error : null, refresh };
}
