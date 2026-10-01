import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardFilter } from '../types/dashboard';
import { ApiError, clearApiMemo } from '../services/apiClient';
import { SKELETON_MIN_MS, useMinDelay } from './useMinDelay';
import { defaultFilter } from './useDashboardData';

/** โหลดรายงานตามช่วงวันที่ (ใช้กับหน้า OPD / IPD / ER) */
export function useReport<T>(fetcher: (start: string, end: string) => Promise<T>) {
  const [filter, setFilter] = useState<DashboardFilter>(() => defaultFilter('range'));
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  // เข้าหน้าแล้วแสดง Skeleton อย่างน้อยช่วงสั้น ๆ ทุกครั้ง แม้ข้อมูลจะมาจากที่จำไว้ทันที
  const skeletonDone = useMinDelay();
  // เปลี่ยนตัวกรอง / กดรีเฟรช → แสดง Skeleton ระหว่างโหลด (แทน spinner กลางจอ)
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async (next: DashboardFilter) => {
    const requestId = ++latestRequest.current;
    const started = Date.now();
    setReloading(true);
    try {
      const result = await fetcher(next.start, next.end);
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
  }, [fetcher]);

  useEffect(() => { load(filter); }, [filter, load]);

  // ปุ่มรีเฟรช: ล้างที่จำไว้ในหน้าเว็บ แล้วถาม backend (ซึ่งตอบจากผลที่เตรียมไว้ — ไม่ query HOSxP ใหม่)
  const refresh = () => { clearApiMemo(); void load(filter); };
  // lastData = ข้อมูลชุดล่าสุดแม้กำลังโหลดใหม่ — ใช้กับตัวเลือกที่ต้องไม่หายระหว่างโหลด (เช่น รายการจุดส่งต่อ / หอผู้ป่วย)
  return { filter, applyFilter: setFilter, data: skeletonDone && !reloading ? data : null, lastData: data, error: skeletonDone && !reloading ? error : null, refresh };
}
