import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * ตรวจสิทธิ์ดูหน้า — ผู้เยี่ยมชมที่เปิดหน้าที่ต้อง login จะเห็นปุ่มให้เข้าสู่ระบบ
 * ผู้ที่ login แล้วแต่ไม่มีสิทธิ์จะเห็นหน้าแจ้งไม่มีสิทธิ์
 */
export function PageGuard({ page, children }: { page: string; children: ReactNode }) {
  const { status, user, canView } = useAuth();
  const location = useLocation();

  if (status === 'loading') return null;
  if (canView(page)) return <>{children}</>;

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
