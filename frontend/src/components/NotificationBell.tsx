import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FEEDBACK_CATEGORY, feedbackService } from '../services/feedbackService';
import { useFeedbackSummary } from '../hooks/useFeedbackSummary';

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.round(hours / 24)} วันที่แล้ว`;
}

export default function NotificationBell() {
  // ข้อมูลร่วมกับเมนูด้านข้าง (hooks/useFeedbackSummary.ts) — ตรวจทุก 1 นาทีแบบเบื้องหลัง
  const summary = useFeedbackSummary(true);
  // เปิดค้างอยู่ที่หน้าไหน — เปลี่ยนหน้าแล้ว dropdown ปิดเอง
  const [openAt, setOpenAt] = useState<string | null>(null);
  // กดดูแล้วหยุดสั่นทันที (ไม่รอรอบตรวจถัดไป) — ค่าจริงเก็บฝั่ง server ใช้เครื่องไหนก็ตรงกัน
  const [justSeen, setJustSeen] = useState('');
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

  const count = summary?.newCount ?? 0;
  const newestTime = summary?.latest[0]?.time ?? '';
  const seen = [summary?.seenAt ?? '', justSeen].sort().pop() ?? '';
  const hasUnseen = count > 0 && newestTime > seen;

  const toggle = () => {
    setOpenAt(open ? null : pathname);
    if (!open && newestTime) {
      setJustSeen(newestTime);
      feedbackService.bellSeen(newestTime).catch(() => { /* บันทึกไม่ได้ — รอบหน้าจะสั่นอีกครั้ง ไม่เสียหาย */ });
    }
  };

  return (
    <div className="notify" ref={boxRef}>
      <button
        className={`notify-btn${hasUnseen ? ' ringing' : ''}`}
        onClick={toggle}
        aria-label={count ? `แจ้งปัญหาใหม่ ${count} เรื่อง` : 'การแจ้งเตือน'}
        aria-expanded={open}
      >
        <i className="fa-solid fa-bell" />
        {count > 0 && <span className={`notify-badge${hasUnseen ? ' unseen' : ''}`}>{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="notify-panel" role="dialog" aria-label="แจ้งปัญหาที่ยังไม่ดำเนินการ">
          <header>
            <strong>แจ้งปัญหา / ข้อเสนอแนะ</strong>
            <small>{count ? `ยังไม่ดำเนินการ ${count} เรื่อง` : 'ไม่มีเรื่องค้าง'}</small>
          </header>

          {count === 0 ? (
            <p className="notify-empty"><i className="fa-solid fa-circle-check" /> ดำเนินการครบทุกเรื่องแล้ว</p>
          ) : (
            <ul>
              {summary!.latest.map(item => {
                const meta = FEEDBACK_CATEGORY[item.category] ?? FEEDBACK_CATEGORY.other;
                return (
                  <li key={item.id}>
                    <Link to="/admin/feedback" className="notify-item" onClick={close}>
                      <span className={`notify-icon tone-${meta.tone}`}><i className={`fa-solid ${meta.icon}`} /></span>
                      <span className="notify-text">
                        <b>{meta.label}</b> · {item.page}
                        <span className="notify-msg">{item.message}</span>
                        <small>{item.name ?? 'ไม่ระบุชื่อ'} · {timeAgo(item.time)}{item.imageCount ? <> · <i className="fa-solid fa-paperclip" /> {item.imageCount} รูป</> : null}</small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <Link to="/admin/feedback" className="notify-all" onClick={close}>ดูทั้งหมด <i className="fa-solid fa-arrow-right" /></Link>
        </div>
      )}
    </div>
  );
}
