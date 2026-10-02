import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { formatUntil } from '../components/system/SystemNotices';

/**
 * ตรวจสิทธิ์ดูหน้า — ผู้เยี่ยมชมที่เปิดหน้าที่ต้อง login จะเห็นปุ่มให้เข้าสู่ระบบ
 * ผู้ที่ login แล้วแต่ไม่มีสิทธิ์จะเห็นหน้าแจ้งไม่มีสิทธิ์
 */
export function PageGuard({ page, children }: { page: string; children: ReactNode }) {
  const { status, user, canView } = useAuth();
  const location = useLocation();
  const closed = useSystemStatus().status?.pageMaintenance;
  const pageClosed = Boolean(closed?.pages.includes(page));

  if (status === 'loading') return null;
  if (canView(page)) {
    // ผู้ดูแลปิดปรับปรุงหน้านี้ — ผู้ใช้ทั่วไปเห็นข้อความแจ้งแทน (เมนู/หน้าอื่นยังใช้ได้) · ผู้ดูแลเปิดได้ไว้ตรวจ
    if (pageClosed && user?.role !== 'admin') {
      return (
        <div className="placeholder-card page-maintenance">
          <div className="placeholder-icon maintenance"><i className="fa-solid fa-screwdriver-wrench" /></div>
          <h2>หน้านี้กำลังปรับปรุงชั่วคราว</h2>
          <p>{closed?.message || 'ผู้ดูแลระบบกำลังปรับปรุงข้อมูลหน้านี้ กรุณากลับมาใหม่ภายหลัง — หน้าอื่นยังใช้งานได้ตามปกติ'}</p>
          {closed?.until && <p className="maintenance-until"><i className="fa-regular fa-clock" /> หน้านี้จะกลับมาใช้งานได้เวลา <b>{formatUntil(closed.until)}</b></p>}
          <small className="muted"><i className="fa-solid fa-rotate" /> เมื่อเปิดให้ใช้งานแล้ว หน้านี้จะกลับมาเองอัตโนมัติ</small>
        </div>
      );
    }
    return (
      <>
        {pageClosed && (
          <div className="system-notice level-danger" role="status">
            <i className="fa-solid fa-screwdriver-wrench" />
            <span><b>หน้านี้ปิดปรับปรุงอยู่สำหรับผู้ใช้ทั่วไป</b> — ผู้ดูแลระบบยังเปิดดูได้{closed?.until && ` · เปิดกลับเองเวลา ${formatUntil(closed.until)}`}{closed?.message && ` · ${closed.message}`}</span>
            <Link to="/admin/system">จัดการ</Link>
          </div>
        )}
        {children}
      </>
    );
  }

  if (!user) {
    return (
      <div className="placeholder-card">
        <div className="placeholder-icon"><i className="fa-solid fa-lock" /></div>
        <h2>ต้องเข้าสู่ระบบก่อน</h2>
        <p>ข้อมูลส่วนนี้เปิดให้เฉพาะเจ้าหน้าที่ที่ได้รับสิทธิ์ กรุณาเข้าสู่ระบบด้วยบัญชี HOSxP</p>
        <Link to="/login" state={{ from: location.pathname }} className="btn-primary login-link"><i className="fa-solid fa-right-to-bracket" />เข้าสู่ระบบ</Link>
      </div>
    );
  }

  return (
    <div className="placeholder-card">
      <div className="placeholder-icon forbidden"><i className="fa-solid fa-shield-halved" /></div>
      <h2>ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
      <p>บัญชีของคุณยังไม่ได้รับสิทธิ์ดูข้อมูลส่วนนี้ หากจำเป็นต้องใช้งาน กรุณาติดต่อผู้ดูแลระบบ</p>
    </div>
  );
}
