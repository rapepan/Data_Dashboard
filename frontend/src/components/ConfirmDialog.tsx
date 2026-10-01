import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  icon: string;
  title: string;
  message: string;
  confirmLabel: string;
  /** danger = ปุ่มยืนยันสีแดง (เช่น ลบข้อมูล) */
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/** กล่องยืนยันก่อนทำรายการ (ออกจากระบบ, ลบผู้ใช้ ฯลฯ) — กด Esc หรือคลิกพื้นหลังเพื่อยกเลิก */
export default function ConfirmDialog({ open, icon, title, message, confirmLabel, tone = 'primary', onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop-blur" onMouseDown={onCancel}>
      <div className={`confirm-panel tone-${tone}`} role="alertdialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}>
        <span className="confirm-icon"><i className={`fa-solid ${icon}`} /></span>
        <strong>{title}</strong>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>ยกเลิก</button>
          <button className="confirm-ok" onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
