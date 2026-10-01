import { API_BASE } from '../services/apiClient';

export const DEVELOPER_TEAM = {
  name: 'กลุ่มงาน IT',
  organization: 'โรงพยาบาลบางเสาธง จ.สมุทรปราการ',
  hours: '',
  lineQr: `${API_BASE}/contact/line-qr`,
};

export interface DeveloperContact {
  name: string;
  role: string;
  phone: string;
  email: string;
  line: string;
  /** แสดง QR Code LINE (DEVELOPER_TEAM.lineQr) ในการ์ดของคนนี้ — เห็นเฉพาะผู้ที่ login */
  lineQr?: boolean;
}

export const DEVELOPER_CONTACTS: DeveloperContact[] = [
  { name: 'จิม', role: 'ผู้พัฒนาระบบ', phone: '098-276-9502', email: '', line: '', lineQr: true },
];
