import type { AlertStatus } from '../../types/reports';

const META: Record<AlertStatus, { label: string; icon: string }> = {
  critical: { label: 'ต้องปรับปรุง', icon: 'fa-circle-xmark' },
  warning: { label: 'เฝ้าระวัง', icon: 'fa-triangle-exclamation' },
  ok: { label: 'ปกติ', icon: 'fa-circle-check' },
};

/** ป้ายสถานะ (วิกฤต / เฝ้าระวัง / ปกติ) — label กำหนดเองได้ เช่น "เร่งดำเนินการ" */
export default function StatusPill({ status, label }: { status: AlertStatus; label?: string }) {
  return <span className={`status-pill status-${status}`}>{label ?? META[status].label}</span>;
}

/** ไอคอนสถานะเดี่ยว ๆ (ใช้หน้าแถวรายการ) */
export function StatusIcon({ status }: { status: AlertStatus }) {
  return <i className={`fa-solid ${META[status].icon} status-icon status-${status}`} />;
}
