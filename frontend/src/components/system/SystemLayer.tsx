import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useSystemStatus } from '../../hooks/useSystemStatus';
import MaintenanceScreen from './MaintenanceScreen';
import SystemNotices, { formatUntil } from './SystemNotices';
import WhatsNew from './WhatsNew';
import { isNewerVersion } from '../../utils/version';

/**
 * ทุกอย่างที่บอกผู้ใช้ว่าระบบกำลังจะ/กำลัง/เพิ่งอัปเดต — วางไว้ใน Layout
 * - แถบประกาศ (ผู้ดูแลตั้งไว้ล่วงหน้า)
 * - หน้าปิดปรับปรุงเต็มจอ (ผู้ดูแลเปิดโหมด หรือเรียก backend ไม่ได้) — ผู้ดูแลเห็นแค่แถบแดงเมื่อเปิดโหมดเอง
 * - กล่องแจ้งเวอร์ชันใหม่ (หน้าเว็บที่เปิดค้างไว้เป็นรุ่นเก่า) + "มีอะไรใหม่"
 */
export default function SystemLayer() {
  const { status, unreachable } = useSystemStatus();
  const { user, status: authStatus } = useAuth();
  const [hiddenVersion, setHiddenVersion] = useState<string | null>(null);
  const isAdmin = user?.role === 'admin';
  const maintenance = status?.maintenance;

  const blockForMaintenance = Boolean(maintenance?.on) && authStatus === 'ready' && !isAdmin;
  const newVersion = status && isNewerVersion(status.version, __APP_VERSION__) && hiddenVersion !== status.version ? status.version : null;

  return (
    <>
      {maintenance?.on && isAdmin && (
        <div className="system-notice level-danger" role="status">
          <i className="fa-solid fa-screwdriver-wrench" />
          <span><b>ระบบอยู่ในโหมดปิดปรับปรุง</b> — ผู้ใช้ทั่วไปเข้าไม่ได้ (ผู้ดูแลยังใช้งานได้){maintenance.until && ` · ปิดเองเวลา ${formatUntil(maintenance.until)}`}{maintenance.message && ` · ${maintenance.message}`}</span>
          <Link to="/admin/system">ไปปิดโหมด</Link>
        </div>
      )}
      {status && <SystemNotices notices={status.notices} />}

      {(unreachable || blockForMaintenance) && (
        <MaintenanceScreen planned={!unreachable && blockForMaintenance} message={maintenance?.message} until={maintenance?.until} />
      )}

      {newVersion && (
        <div className="update-toast" role="status">
          <i className="fa-solid fa-wand-magic-sparkles" />
          <div>
            <strong>ระบบอัปเดตเป็น V {newVersion} แล้ว</strong>
            <small>รีเฟรชหน้าเว็บเพื่อใช้เวอร์ชันใหม่ (หน้าที่เปิดอยู่เป็น V {__APP_VERSION__})</small>
          </div>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>รีเฟรช</button>
          <button type="button" className="update-toast-close" onClick={() => setHiddenVersion(newVersion)} aria-label="ภายหลัง"><i className="fa-solid fa-xmark" /></button>
        </div>
      )}

      <WhatsNew />
    </>
  );
}
