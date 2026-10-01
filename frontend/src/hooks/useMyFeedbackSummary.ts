import { useEffect, useSyncExternalStore } from 'react';
import { feedbackService, type MyFeedbackSummary } from '../services/feedbackService';

/**
 * ความเคลื่อนไหวของ "เรื่องที่แจ้ง" ที่ยังไม่เห็น (ผู้ดูแลเปลี่ยนสถานะ/ตอบกลับ)
 * ใช้ร่วมกันทั้งกระดิ่งของผู้ใช้และป้ายเมนูด้านข้าง — ตรวจแบบเบื้องหลังทุก 1 นาที
 */
const POLL_MS = 60_000;

/** เปิดหน้า "เรื่องที่แจ้ง" แล้ว → ให้กระดิ่ง/ป้ายโหลดใหม่ทันที */
export const MY_FEEDBACK_SEEN_EVENT = 'bsth:my-feedback-seen';

let summary: MyFeedbackSummary | null = null;
const listeners = new Set<() => void>();
let users = 0;
let timer: number | undefined;

const emit = () => listeners.forEach(listener => listener());

async function load() {
  try {
    summary = await feedbackService.mineSummary();
    emit();
  } catch { /* ยังไม่ login / เรียกไม่ได้ — คงค่าเดิมไว้ */ }
}

const onVisible = () => { if (document.visibilityState === 'visible') void load(); };

function start() {
  users++;
  if (users > 1) return;
  void load();
  timer = window.setInterval(load, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(MY_FEEDBACK_SEEN_EVENT, load);
}

function stop() {
  users--;
  if (users > 0) return;
  window.clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener(MY_FEEDBACK_SEEN_EVENT, load);
  summary = null;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** enabled = false (ยังไม่ login) → ไม่เรียก backend เลย */
export function useMyFeedbackSummary(enabled: boolean): MyFeedbackSummary | null {
  useEffect(() => {
    if (!enabled) return;
    start();
    return stop;
  }, [enabled]);
  const value = useSyncExternalStore(subscribe, () => summary);
  return enabled ? value : null;
}
