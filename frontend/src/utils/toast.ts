/** ข้อความแจ้งสั้น ๆ มุมขวาล่าง — เรียก toast() จากที่ไหนก็ได้ (แสดงผลโดย components/Toaster.tsx) */
export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export const TOAST_EVENT = 'app:toast';
let nextId = 1;

export function toast(message: string, tone: ToastTone = 'info') {
  window.dispatchEvent(new CustomEvent<ToastItem>(TOAST_EVENT, { detail: { id: nextId++, message, tone } }));
}
