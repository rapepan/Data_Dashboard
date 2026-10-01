import { useEffect, useSyncExternalStore } from 'react';
import { FEEDBACK_CHANGED_EVENT, feedbackService, type FeedbackSummary } from '../services/feedbackService';

/**
 * จำนวนเรื่องแจ้งปัญหาที่ยังไม่ดำเนินการ — ใช้ร่วมกันทั้งกระดิ่งและเมนูด้านข้าง (ตัวเลขตรงกันเสมอ)
 * ตรวจครั้งเดียวทุก 1 นาทีแบบเบื้องหลัง (ไม่ต่ออายุ session / ไม่บันทึกประวัติ) ไม่ว่าจะมีกี่จุดที่ใช้
 */
const POLL_MS = 60_000;

let summary: FeedbackSummary | null = null;
const listeners = new Set<() => void>();
let users = 0;
let timer: number | undefined;

const emit = () => listeners.forEach(listener => listener());

async function load() {
  try {
    summary = await feedbackService.summary();
    emit();
  } catch { /* ไม่มีสิทธิ์ / เรียกไม่ได้ — คงค่าเดิมไว้ */ }
}

const onVisible = () => { if (document.visibilityState === 'visible') void load(); };

/** เริ่มตรวจเมื่อมีผู้ใช้ตัวแรก หยุดเมื่อไม่มีใครใช้แล้ว */
function start() {
  users++;
  if (users > 1) return;
  void load();
  timer = window.setInterval(load, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(FEEDBACK_CHANGED_EVENT, load);
}

function stop() {
  users--;
  if (users > 0) return;
  window.clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener(FEEDBACK_CHANGED_EVENT, load);
  summary = null;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** enabled = false (ไม่ใช่ผู้ดูแล) → ไม่เรียก backend เลย */
export function useFeedbackSummary(enabled: boolean): FeedbackSummary | null {
  useEffect(() => {
    if (!enabled) return;
    start();
    return stop;
  }, [enabled]);
  const value = useSyncExternalStore(subscribe, () => summary);
  return enabled ? value : null;
}
