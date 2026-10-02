import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHANGELOG } from '../../config/changelog';
import { useAuth } from '../../auth/AuthContext';
import { apiGet, apiPost } from '../../services/apiClient';

/** เลขเวอร์ชันใต้โลโก้กดแล้วเปิดหน้าต่างนี้ (ดูบันทึกการเปลี่ยนแปลงย้อนหลัง) */
export const OPEN_CHANGELOG_EVENT = 'app:open-changelog';

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${Number(y) + 543}`;
}

/**
 * "มีอะไรใหม่" — เปิดเวอร์ชันที่มีรายการใน config/changelog.ts ครั้งแรก แสดงครั้งเดียว
 * - เฉพาะผู้ที่ login — ผู้เยี่ยมชมไม่เห็นรายการอัปเดต (ไม่ขึ้นเอง / กดเลขเวอร์ชันไม่ได้)
 * - จำตามบัญชี (เก็บในฐาน) — ใช้กี่เครื่องก็เห็นครั้งเดียว · เครื่องกลางหลายคนใช้ ทุกคนได้เห็น
 * กดเลขเวอร์ชันใต้โลโก้เพื่อดูทุกเวอร์ชันย้อนหลัง
 */
export default function WhatsNew() {
  const current = CHANGELOG.find(e => e.version === __APP_VERSION__);
  const { status, user } = useAuth();
  const loginname = user?.loginname ?? null;
  const [mode, setMode] = useState<'closed' | 'latest' | 'all'>('closed');

  // รู้ว่าเป็นใครแล้วค่อยตัดสินว่าต้องแสดงไหม (เปลี่ยนบัญชี / login ระหว่างใช้งาน → ตรวจใหม่)
  useEffect(() => {
    if (!current || status !== 'ready' || !loginname) return;
    let cancelled = false;
    apiGet<{ seen: string | null }>('/system/whats-new', { silent: true })
      .then(r => { if (!cancelled && r.seen !== __APP_VERSION__) setMode(m => (m === 'all' ? m : 'latest')); })
      .catch(() => undefined); // ถามไม่ได้ — ไม่แสดง (รอบหน้าค่อยถามใหม่)
    return () => { cancelled = true; };
  }, [current, status, loginname]);

  useEffect(() => {
    if (!loginname) return;
    const open = () => setMode('all');
    window.addEventListener(OPEN_CHANGELOG_EVENT, open);
    return () => window.removeEventListener(OPEN_CHANGELOG_EVENT, open);
  }, [loginname]);

  useEffect(() => {
    if (mode === 'closed') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ออกจากระบบ / session หมดอายุระหว่างเปิดอยู่ → ซ่อนทันที
  if (mode === 'closed' || !loginname) return null;
  const close = () => {
    setMode('closed');
    void apiPost('/system/whats-new', { version: __APP_VERSION__ }, { silent: true }).catch(() => undefined);
  };
  const entries = mode === 'latest' && current ? [current] : CHANGELOG;

  return createPortal(
    <div className="modal-backdrop-blur" onMouseDown={close}>
      <div className="whats-new" role="dialog" aria-modal="true" aria-label="มีอะไรใหม่" onMouseDown={e => e.stopPropagation()}>
        <header>
          <span className="whats-new-icon"><i className="fa-solid fa-wand-magic-sparkles" /></span>
          <div>
            <strong>{mode === 'latest' ? `มีอะไรใหม่ใน V ${__APP_VERSION__}` : 'บันทึกการเปลี่ยนแปลง'}</strong>
            <small>DATA BSTH · เวอร์ชันที่ใช้อยู่ V {__APP_VERSION__}</small>
          </div>
          <button type="button" className="whats-new-close" onClick={close} aria-label="ปิด"><i className="fa-solid fa-xmark" /></button>
        </header>
        <div className="whats-new-body">
          {entries.length === 0 && <p className="muted">ยังไม่มีบันทึกการเปลี่ยนแปลง</p>}
          {entries.map(entry => (
            <section key={entry.version}>
              <h3>V {entry.version} <small>{formatDate(entry.date)}</small></h3>
              <ul>{entry.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </section>
          ))}
        </div>
        <footer><button type="button" className="btn-primary" onClick={close}>เข้าใจแล้ว</button></footer>
      </div>
    </div>,
    document.body,
  );
}
