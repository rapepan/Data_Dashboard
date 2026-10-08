import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DashboardFilter } from '../types/dashboard';
import { ApiError, clearApiMemo } from '../services/apiClient';
import { SKELETON_MIN_MS, useMinDelay } from './useMinDelay';
import { defaultFilter } from './useDashboardData';
import { pctChange, previousRange } from '../utils/compare';
import type { FetchOptions } from '../services/reportService';
import ChangeBadge, { type GoodWhen } from '../components/report/ChangeBadge';

interface ReportOptions {
  /** ดึงช่วงก่อนหน้าที่ยาวเท่ากันมาด้วย → ใช้ compare(r => ...) ทำป้าย % เทียบช่วงก่อนบนการ์ด */
  compare?: boolean;
}

export type CompareFn<T> = (pick: (report: T) => number | null | undefined, goodWhen?: GoodWhen) => ReactNode;

/** สร้างฟังก์ชันทำป้ายเทียบ: compare(r => r.range.total) — ยังไม่มีข้อมูลช่วงก่อน = ไม่แสดง */
function compareWith<T>(data: T | null, prev: T | null, range: { start: string; end: string } | null): CompareFn<T> {
  return (pick, goodWhen) => (data && prev && range
    ? createElement(ChangeBadge, { change: pctChange(pick(data), pick(prev)), goodWhen, range })
    : null);
}

/** โหลดรายงานตามช่วงวันที่ (ใช้กับหน้า OPD / IPD / ER) */
export function useReport<T>(fetcher: (start: string, end: string, opts?: FetchOptions) => Promise<T>, { compare = false }: ReportOptions = {}) {
  const [filter, setFilter] = useState<DashboardFilter>(() => defaultFilter('range'));
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ช่วงก่อนหน้า — โหลดคู่กันแต่ล้มได้โดยไม่กระทบหน้า (แค่ไม่แสดงป้ายเทียบ)
  const [prev, setPrev] = useState<{ data: T; range: { start: string; end: string } } | null>(null);
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
      const range = compare ? previousRange(next.start, next.end) : null;
      const prevRequest = range ? fetcher(range.start, range.end, { compare: true }).catch(() => null) : Promise.resolve(null);
      const result = await fetcher(next.start, next.end);
      const prevResult = await prevRequest;
      // ข้อมูลมาเร็ว (จำไว้/เตรียมไว้) ก็ให้เห็น Skeleton ครบเวลาขั้นต่ำ ไม่กะพริบ
      const wait = SKELETON_MIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      if (requestId !== latestRequest.current) return;
      setData(result);
      setPrev(range && prevResult ? { data: prevResult, range } : null);
      setError(null);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(err instanceof ApiError ? err.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      if (requestId === latestRequest.current) setReloading(false);
    }
  }, [fetcher, compare]);

  useEffect(() => { load(filter); }, [filter, load]);

  // ปุ่มรีเฟรช: ล้างที่จำไว้ในหน้าเว็บ แล้วถาม backend (ซึ่งตอบจากผลที่เตรียมไว้ — ไม่ query HOSxP ใหม่)
  const refresh = () => { clearApiMemo(); void load(filter); };
  // lastData = ข้อมูลชุดล่าสุดแม้กำลังโหลดใหม่ — ใช้กับตัวเลือกที่ต้องไม่หายระหว่างโหลด (เช่น รายการจุดส่งต่อ / หอผู้ป่วย)
  const shown = skeletonDone && !reloading ? data : null;
  return {
    filter, applyFilter: setFilter, data: shown, lastData: data, error: skeletonDone && !reloading ? error : null, refresh,
    compare: compareWith(shown, prev?.data ?? null, prev?.range ?? null),
  };
}
