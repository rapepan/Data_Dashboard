import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TOAST_EVENT, type ToastItem } from '../utils/toast';

const DURATION_MS = { success: 3500, info: 4000, error: 6000 };
const ICON = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const item = (e as CustomEvent<ToastItem>).detail;
      setToasts(list => [...list.slice(-2), item]);
      window.setTimeout(() => setToasts(list => list.filter(t => t.id !== item.id)), DURATION_MS[item.tone]);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;
  return createPortal(
    <div className="toaster no-print" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <i className={`fa-solid ${ICON[t.tone]}`} />
          <span>{t.message}</span>
          <button onClick={() => setToasts(list => list.filter(x => x.id !== t.id))} aria-label="ปิด"><i className="fa-solid fa-xmark" /></button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
