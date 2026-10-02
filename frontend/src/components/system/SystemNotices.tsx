import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SystemNotice } from '../../services/systemService';

const DISMISSED_KEY = 'dismissed-notices';
const POPUP_SEEN_KEY = 'notice-popups-seen';
/** ก่อนถึงเวลาปิดปรับปรุงเท่านี้ เตือนซ้ำ (แม้เคยกดปิดแถบไปแล้ว) */
const REMINDER_MS = 15 * 60_000;

type Phase = 'upcoming' | 'soon' | 'during' | 'none';

function phaseOf(n: SystemNotice, now: number): Phase {
  if (!n.maintenanceStart || !n.maintenanceEnd) return 'none';
  const start = Date.parse(n.maintenanceStart);
  const end = Date.parse(n.maintenanceEnd);
  if (now >= end) return 'none';
  if (now >= start) return 'during';
  return start - now <= REMINDER_MS ? 'soon' : 'upcoming';
}

/** จำการกดปิด/รับทราบด้วย id + เวลาแก้ไข + ช่วง ("ใกล้ถึงเวลา" เป็นอีกช่วง → ขึ้นเตือนอีกครั้ง) */
const keyOf = (n: SystemNotice, phase: Phase) => `${n.id}:${n.updatedAt ?? ''}:${phase === 'soon' ? 'soon' : 'main'}`;

function readList(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]; } catch { return []; }
}
function saveList(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(-50))); } catch { /* ไม่มี storage ก็จำได้แค่รอบนี้ */ }
}

const WEEKDAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dmy = (d: Date) => `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`;

/** "อา. 05/10/2569 18:00–18:30 น." (ข้ามวัน = แสดงวันที่ทั้งสองฝั่ง) */
export function formatWindow(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  return s.toDateString() === e.toDateString()
    ? `${dmy(s)} ${hhmm(s)}–${hhmm(e)} น.`
    : `${dmy(s)} ${hhmm(s)} น. – ${dmy(e)} ${hhmm(e)} น.`;
}

/** "10:30 น." ถ้าเป็นวันนี้ · "ศ. 03/10/2569 10:30 น." ถ้าเป็นวันอื่น */
export function formatUntil(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? `${hhmm(d)} น.` : `${dmy(d)} ${hhmm(d)} น.`;
}

/** "อีก 2 วัน 3 ชม." / "อีก 45 นาที" / "อีกไม่ถึง 1 นาที" */
export function countdown(ms: number) {
  const min = Math.ceil(ms / 60_000);
  if (min < 1) return 'อีกไม่ถึง 1 นาที';
  if (min < 60) return `อีก ${min} นาที`;
  const h = Math.floor(min / 60);
  if (h < 24) return `อีก ${h} ชม.${min % 60 ? ` ${min % 60} นาที` : ''}`;
  return `อีก ${Math.floor(h / 24)} วัน${h % 24 ? ` ${h % 24} ชม.` : ''}`;
}

function MaintenanceLine({ notice, now }: { notice: SystemNotice; now: number }) {
  const phase = phaseOf(notice, now);
  if (phase === 'none') return null;
  const window = formatWindow(notice.maintenanceStart!, notice.maintenanceEnd!);
  return (
    <span className={`notice-window phase-${phase}`}>
      <i className="fa-solid fa-screwdriver-wrench" />
      {phase === 'during'
        ? <>กำลังปิดปรับปรุง ถึง <b>{hhmm(new Date(notice.maintenanceEnd!))} น.</b></>
        : <>ปิดปรับปรุง <b>{window}</b> · {countdown(Date.parse(notice.maintenanceStart!) - now)}</>}
    </span>
  );
}

/** แถบประกาศ 1 รายการ — ใช้ทั้งบนหน้าเว็บจริงและตัวอย่างในหน้าผู้ดูแล */
export function NoticeBar({ notice, now, onDismiss }: { notice: SystemNotice; now: number; onDismiss?: () => void }) {
  return (
    <div className={`system-notice notice-bar-v2 level-${notice.level}${phaseOf(notice, now) === 'soon' ? ' is-soon' : ''}`} role={notice.level === 'warning' ? 'alert' : 'status'}>
      <span className="notice-icon"><i className={`fa-solid ${notice.level === 'warning' ? 'fa-triangle-exclamation' : 'fa-bullhorn'}`} /></span>
      <div className="notice-body">
        <small className="notice-title">ประกาศจากผู้ดูแลระบบ</small>
        <span className="notice-message">{notice.message || 'ระบบจะปิดปรับปรุงตามช่วงเวลาด้านล่าง'}</span>
        <MaintenanceLine notice={notice} now={now} />
      </div>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="ปิดประกาศ"><i className="fa-solid fa-xmark" /></button>}
    </div>
  );
}

/**
 * ประกาศถึงผู้ใช้:
 * - แถบบนสุดทุกหน้า (มีหัวข้อ + เวลาปิดปรับปรุงจริงพร้อมนับถอยหลัง) กดปิดได้
 * - ประกาศระดับ "เตือน" ขึ้นเป็นหน้าต่างครั้งแรกที่เห็น · ก่อนถึงเวลาปิด 15 นาที ขึ้นแถบ + หน้าต่างเตือนอีกครั้ง
 */
export default function SystemNotices({ notices }: { notices: SystemNotice[] }) {
  const [dismissed, setDismissed] = useState(() => readList(DISMISSED_KEY));
  const [popupSeen, setPopupSeen] = useState(() => readList(POPUP_SEEN_KEY));
  const [now, setNow] = useState(() => Date.now());

  // นับถอยหลัง / เปลี่ยนช่วง (ใกล้ถึงเวลา → กำลังปิด) โดยไม่ต้องรอข้อมูลรอบใหม่
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const shown = notices.filter(n => !dismissed.includes(keyOf(n, phaseOf(n, now))));
  const popup = notices.find(n => {
    const phase = phaseOf(n, now);
    return (n.level === 'warning' || phase === 'soon') && !popupSeen.includes(keyOf(n, phase));
  });

  const dismiss = (n: SystemNotice) => {
    const next = [...dismissed, keyOf(n, phaseOf(n, now))];
    setDismissed(next);
    saveList(DISMISSED_KEY, next);
  };
  const acknowledge = (n: SystemNotice) => {
    const next = [...popupSeen, keyOf(n, phaseOf(n, now))];
    setPopupSeen(next);
    saveList(POPUP_SEEN_KEY, next);
  };

  return (
    <>
      {shown.map(n => <NoticeBar key={n.id} notice={n} now={now} onDismiss={() => dismiss(n)} />)}
      {popup && <NoticePopup notice={popup} now={now} onClose={() => acknowledge(popup)} />}
    </>
  );
}

function NoticePopup({ notice, now, onClose }: { notice: SystemNotice; now: number; onClose: () => void }) {
  const phase = phaseOf(notice, now);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop-blur" onMouseDown={onClose}>
      <div className={`notice-popup level-${notice.level}`} role="alertdialog" aria-modal="true" aria-label="ประกาศจากผู้ดูแลระบบ" onMouseDown={e => e.stopPropagation()}>
        <span className="notice-popup-icon"><i className={`fa-solid ${phase === 'none' ? (notice.level === 'warning' ? 'fa-triangle-exclamation' : 'fa-bullhorn') : 'fa-screwdriver-wrench'}`} /></span>
        <small className="notice-title">ประกาศจากผู้ดูแลระบบ</small>
        <strong>{phase === 'soon' ? `อีก ${Math.max(1, Math.ceil((Date.parse(notice.maintenanceStart!) - now) / 60_000))} นาที ระบบจะปิดปรับปรุง` : phase === 'during' ? 'ระบบกำลังปิดปรับปรุง' : phase === 'upcoming' ? 'ระบบจะปิดปรับปรุง' : 'แจ้งเพื่อทราบ'}</strong>
        {notice.message && <p>{notice.message}</p>}
        {phase !== 'none' && (
          <div className="notice-popup-window">
            <i className="fa-regular fa-calendar-xmark" />
            <span>ช่วงเวลาปิดปรับปรุง<b>{formatWindow(notice.maintenanceStart!, notice.maintenanceEnd!)}</b></span>
          </div>
        )}
        {phase === 'soon' && <small className="notice-popup-hint">กรุณาบันทึกหรือส่งออกข้อมูลที่ต้องใช้ก่อนถึงเวลา</small>}
        <button type="button" className="btn-primary" onClick={onClose} autoFocus>รับทราบ</button>
      </div>
    </div>,
    document.body,
  );
}
