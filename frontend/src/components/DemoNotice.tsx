import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
const SHOW_DEMO_NOTICE = true;

export default function DemoNotice() {
  const [open, setOpen] = useState(SHOW_DEMO_NOTICE);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop-blur no-print">
      <div className="confirm-panel tone-amber demo-notice" role="alertdialog" aria-modal="true" aria-labelledby="demo-notice-title">
        <span className="confirm-icon"><i className="fa-solid fa-flask" /></span>
        <span className="demo-badge">TEST DEMO</span>
        <strong id="demo-notice-title">ทดสอบระบบ — ข้อมูลจำลองเท่านั้น</strong>
        <p>
          ตัวเลข กราฟ และรายงานทั้งหมดในเว็บนี้เป็น <b>ข้อมูลจำลอง</b> ที่สร้างขึ้นชั่วคราวเพื่อทดสอบระบบ
          ไม่ใช่ข้อมูลจริงของโรงพยาบาลบางเสาธง
        </p>
        <div className="demo-hints">
          <div className="demo-login-hint">
            <i className="fa-solid fa-user-check" />
            <span>สามารถเข้าสู่ระบบโดย <b>ใช้บัญชีผู้ใช้งานเดียวกับ HOSxP</b> </span>
          </div>
          <div className="demo-login-hint">
            <i className="fa-solid fa-headset" />
            <span>
              หากต้องการแก้ไขการแสดงข้อมูลในส่วนไหน สามารถแจ้งผู้พัฒนาได้ที่หน้า{' '}
              <Link to="/contact" onClick={() => setOpen(false)}>ติดต่อผู้พัฒนา</Link>
            </span>
          </div>
        </div>
        <div className="confirm-actions">
          <button className="confirm-ok" onClick={() => setOpen(false)} autoFocus>รับทราบ</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
