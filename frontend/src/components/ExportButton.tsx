import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLoginRedirect } from '../auth/useLoginRedirect';
import { NAV_GROUPS } from '../routes/navigation';
import { ApiError, apiPost, SESSION_EXPIRED_EVENT } from '../services/apiClient';
import { reportClientError } from '../utils/errorReporter';
import { toast } from '../utils/toast';

interface ExportButtonProps {
  kind: 'excel' | 'pdf';
  /** รายละเอียดที่บันทึกลง audit log เช่น ชื่อไฟล์ / หัวข้อที่พิมพ์ */
  detail: string;
  /** ทำงานจริงหลัง backend ยืนยันสิทธิ์และบันทึก audit แล้ว */
  onRun: () => void | Promise<void>;
}

const LABEL = { excel: 'Excel', pdf: 'พิมพ์ / PDF' };
const ICON = { excel: 'fa-file-excel', pdf: 'fa-print' };

/** หน้าปัจจุบัน → page key ของระบบสิทธิ์ (ใช้ตรวจสิทธิ์ส่งออกฝั่ง backend) */
function usePageKey() {
  const { pathname } = useLocation();
  const item = NAV_GROUPS.flatMap(g => g.items).find(i => i.path === pathname);
  return item?.page ?? item?.key ?? 'dashboard';
}

/**
 * ปุ่มส่งออก Excel / พิมพ์ PDF — ต้อง login เท่านั้น
 * - ผู้เยี่ยมชม: ปุ่มติดกุญแจ กดแล้วพาไปหน้า login (กลับมาหน้าเดิมหลัง login)
 * - login แล้ว: แจ้ง backend (/audit/export) ก่อน — backend ตรวจสิทธิ์ซ้ำและบันทึกประวัติ ถ้าไม่ผ่าน (เช่น session หมดอายุ) จะไม่ส่งออก
 */
export default function ExportButton({ kind, detail, onRun }: ExportButtonProps) {
  const { session, user } = useAuth();
  const goLogin = useLoginRedirect();
  const page = usePageKey();
  const [busy, setBusy] = useState(false);

  if (!session?.canExport) {
    // login แล้วแต่ไม่มีสิทธิ์ส่งออก → ไม่แสดงปุ่ม / ผู้เยี่ยมชม → ปุ่มติดกุญแจ
    if (user) return null;
    return (
      <button className="excel-btn locked" onClick={goLogin} data-tip={`เข้าสู่ระบบเพื่อ${kind === 'pdf' ? 'พิมพ์ / บันทึก PDF' : 'ส่งออก Excel'}`}>
        <i className="fa-solid fa-lock" />{LABEL[kind]}
      </button>
    );
  }

  // ทุกกรณีที่ล้มต้องบอกผู้ใช้ — ห้ามเงียบ (เดิมกดแล้ว "ไม่มีอะไรเกิดขึ้น" เพราะ error ถูกกลืน)
  const run = async () => {
    setBusy(true);
    try {
      await apiPost('/audit/export', { page, detail: `${kind === 'pdf' ? 'พิมพ์/PDF' : 'Excel'}: ${detail}` }, { silent: true });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 401) {
        // session หมดอายุ (ไม่ได้ใช้งานเกินเวลา) → กลับเป็นผู้เยี่ยมชม ปุ่มจะกลายเป็นปุ่มติดกุญแจ
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        toast('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่แล้วกดส่งออกอีกครั้ง', 'error');
      } else if (err instanceof ApiError) {
        toast(err.message || 'ไม่มีสิทธิ์ส่งออกข้อมูลส่วนนี้', 'error');
      } else {
        toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง', 'error');
      }
      return;
    }

    try {
      await onRun();
      if (kind === 'excel') toast('สร้างไฟล์ Excel แล้ว — ดูได้ที่โฟลเดอร์ดาวน์โหลด', 'success');
    } catch (err) {
      reportClientError(err);
      toast(`${kind === 'excel' ? 'สร้างไฟล์ Excel' : 'เตรียมหน้าพิมพ์'}ไม่สำเร็จ กรุณาลองใหม่ หรือแจ้งผู้พัฒนา`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="excel-btn" onClick={() => { void run(); }} disabled={busy} aria-busy={busy}>
      <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : ICON[kind]}`} />{busy && kind === 'excel' ? 'กำลังสร้างไฟล์...' : LABEL[kind]}
    </button>
  );
}
