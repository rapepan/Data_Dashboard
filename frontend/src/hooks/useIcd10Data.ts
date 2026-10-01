import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardFilter } from '../types/dashboard';
import type { Icd10Summary } from '../types/icd10';
import type { WithMeta } from '../types/reports';
import { fetchIcd10Summary } from '../services/icd10Service';
import { ApiError, clearApiMemo } from '../services/apiClient';
import { SKELETON_MIN_MS, useMinDelay } from './useMinDelay';
import { defaultFilter } from './useDashboardData';

export function useIcd10Data() {
  const [filter, setFilter] = useState<DashboardFilter>(() => defaultFilter('range'));
  const [data, setData] = useState<WithMeta<Icd10Summary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  // เข้าหน้าแล้วแสดง Skeleton อย่างน้อยช่วงสั้น ๆ ทุกครั้ง แม้ข้อมูลจะมาจากที่จำไว้ทันที
  const skeletonDone = useMinDelay();
  // เปลี่ยนตัวกรอง / กดรีเฟรช → แสดง Skeleton ระหว่างโหลด (แทน spinner กลางจอ)
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async (next: DashboardFilter) => {
    // เปลี่ยนตัวกรองรัว ๆ ใช้เฉพาะผลของ request ล่าสุด
    const requestId = ++latestRequest.current;
    const started = Date.now();
    setReloading(true);
    try {
      const result = await fetchIcd10Summary(next.start, next.end);
      // ข้อมูลมาเร็ว (จำไว้/เตรียมไว้) ก็ให้เห็น Skeleton ครบเวลาขั้นต่ำ ไม่กะพริบ
      const wait = SKELETON_MIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      if (requestId !== latestRequest.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(err instanceof ApiError ? err.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      if (requestId === latestRequest.current) setReloading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const refresh = () => { clearApiMemo(); void load(filter); };
  return { filter, applyFilter: setFilter, data: skeletonDone && !reloading ? data : null, error: skeletonDone && !reloading ? error : null, refresh };
}
