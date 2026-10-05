import { API_BASE } from '../services/apiClient';

export const DEVELOPER_TEAM = {
  name: 'กลุ่มงาน IT',
  organization: 'โรงพยาบาลบางเสาธง จ.สมุทรปราการ',
  hours: '',
  lineQr: `${API_BASE}/contact/line-qr`,
};

/**
 * รายชื่อ/เบอร์โทรผู้พัฒนา — เก็บฝั่ง backend (backend/src/config/developer-contacts.ts)
 * หน้าเว็บขอมาเฉพาะตอน login แล้ว (GET /api/contact/people) ผู้เยี่ยมชมไม่เห็นแม้เปิด F12
 */
export interface DeveloperContact {
  name: string;
  role: string;
  phone: string;
  email: string;
  line: string;
  /** แสดง QR Code LINE (DEVELOPER_TEAM.lineQr) ในการ์ดของคนนี้ */
  lineQr?: boolean;
}
