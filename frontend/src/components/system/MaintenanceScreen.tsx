import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { check } from '../../hooks/useSystemStatus';
import { formatUntil } from './SystemNotices';

interface MaintenanceScreenProps {
  /** true = ผู้ดูแลเปิดโหมดปิดปรับปรุง · false = เรียก backend ไม่ได้ (กำลังรีสตาร์ท/อัปเดต) */
  planned: boolean;
  message?: string;
  /** เวลาที่ผู้ดูแลตั้งให้กลับมาใช้งานได้ */
  until?: string | null;
}

/** หน้าเต็มจอระหว่างปรับปรุงระบบ — ตรวจใหม่เองเป็นระยะ ระบบกลับมาแล้วหายเองโดยไม่ต้องรีเฟรช */
export default function MaintenanceScreen({ planned, message, until }: MaintenanceScreenProps) {
  return createPortal(
    <div className="maintenance-screen" role="alertdialog" aria-modal="true" aria-label="กำลังปรับปรุงระบบ">
      <div className="maintenance-card">
        <span className="maintenance-icon"><i className="fa-solid fa-screwdriver-wrench" /></span>
        <h1>{planned ? 'ระบบปิดปรับปรุงชั่วคราว' : 'กำลังอัปเดตระบบ'}</h1>
        <p>
          {planned
            ? (message || 'ผู้ดูแลระบบกำลังปรับปรุงระบบ กรุณากลับมาใหม่ภายหลัง')
            : 'ระบบกำลังอัปเดตหรือเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ชั่วคราว กรุณารอสักครู่'}
        </p>
        {planned && until && (
          <p className="maintenance-until"><i className="fa-regular fa-clock" /> ระบบจะกลับมาใช้งานได้เวลา <b>{formatUntil(until)}</b></p>
        )}
        <small className="maintenance-retry">
          <i className="fa-solid fa-rotate" /> ระบบจะกลับมาให้ใช้งานเองอัตโนมัติ
        </small>
        <div className="maintenance-actions">
          <button type="button" className="btn-primary" onClick={() => void check()}><i className="fa-solid fa-arrows-rotate" /> ลองใหม่ตอนนี้</button>
          {planned && <Link to="/login" className="maintenance-login"><i className="fa-solid fa-user-shield" /> ผู้ดูแลระบบเข้าสู่ระบบ</Link>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
