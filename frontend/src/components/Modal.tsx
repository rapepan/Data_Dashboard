import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Accent } from './StatCard';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  accent?: Accent;
  icon: string;
  title: string;
  subtitle?: ReactNode;
  footerNote?: ReactNode;
  children: ReactNode;
}

/** หน้าต่างเด้ง (พื้นหลังเบลอ) — ปิดได้ด้วยปุ่ม ✕, ปุ่ม "ปิด", คลิกพื้นหลัง หรือกด Esc */
export default function Modal({ open, onClose, accent = 'plum', icon, title, subtitle, footerNote, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop-blur" onMouseDown={onClose}>
      <div className="modal-panel" data-accent={accent} role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}>
        <header className="modal-head">
          <span className="card-icon"><i className={`fa-solid ${icon}`} /></span>
          <div>
            <strong>{title}</strong>
            {subtitle && <small>{subtitle}</small>}
          </div>
          <button className="modal-x" onClick={onClose} aria-label="ปิด"><i className="fa-solid fa-xmark" /></button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-foot">
          <span>{footerNote}</span>
          <button className="modal-close" onClick={onClose}>ปิด</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
