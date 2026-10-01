import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FEEDBACK_CATEGORY, FEEDBACK_STATUS } from '../services/feedbackService';
import { useMyFeedbackSummary } from '../hooks/useMyFeedbackSummary';

function timeAgo(iso?: string) {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.round(hours / 24)} วันที่แล้ว`;
}

/** กระดิ่งของผู้ใช้ทั่วไป: เรื่องที่ตัวเองแจ้งถูกเปลี่ยนสถานะ / ผู้ดูแลตอบกลับ */
export default function MyFeedbackBell() {
  // ข้อมูลร่วมกับป้ายเมนู "เรื่องที่แจ้ง" (hooks/useMyFeedbackSummary.ts)
  const summary = useMyFeedbackSummary(true);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const open = openAt === pathname;
  const close = () => setOpenAt(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = summary?.unread ?? 0;

  return (
    <div className="notify" ref={boxRef}>
      <button
        className={`notify-btn${count > 0 ? ' ringing' : ''}`}
        onClick={() => setOpenAt(open ? null : pathname)}
        aria-label={count ? `เรื่องที่แจ้งมีความเคลื่อนไหวใหม่ ${count} เรื่อง` : 'การแจ้งเตือน'}
        aria-expanded={open}
      >
        <i className="fa-solid fa-bell" />
        {count > 0 && <span className="notify-badge unseen">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="notify-panel" role="dialog" aria-label="ความเคลื่อนไหวของเรื่องที่แจ้ง">
          <header>
            <strong>เรื่องที่แจ้ง</strong>
            <small>{count ? `มีความเคลื่อนไหวใหม่ ${count} เรื่อง` : 'ไม่มีความเคลื่อนไหวใหม่'}</small>
          </header>

          {count === 0 ? (
            <p className="notify-empty"><i className="fa-solid fa-circle-check" /> ยังไม่มีอัปเดตใหม่</p>
          ) : (
            <ul>
              {summary!.latest.map(item => {
                const status = FEEDBACK_STATUS[item.status];
                const cat = FEEDBACK_CATEGORY[item.category] ?? FEEDBACK_CATEGORY.other;
                return (
                  <li key={item.id}>
                    <Link to="/my-feedback" className="notify-item" onClick={close}>
                      <span className={`notify-icon tone-${status.tone}`}><i className={`fa-solid ${status.icon}`} /></span>
                      <span className="notify-text">
                        <b>{status.label}</b> · {cat.label} · {item.page}
                        {item.note && <span className="notify-msg">“{item.note}”</span>}
                        <small>{timeAgo(item.updatedAt)}</small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <Link to="/my-feedback" className="notify-all" onClick={close}>ดูเรื่องที่แจ้งทั้งหมด <i className="fa-solid fa-arrow-right" /></Link>
        </div>
      )}
    </div>
  );
}
