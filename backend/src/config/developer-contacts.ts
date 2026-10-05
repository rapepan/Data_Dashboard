/**
 * รายชื่อผู้พัฒนาในหน้า "ติดต่อผู้พัฒนา" — ส่งให้เฉพาะผู้ที่ login (GET /api/contact/people)
 * เก็บฝั่ง backend: เบอร์โทร/LINE ไม่อยู่ในไฟล์หน้าเว็บ ผู้เยี่ยมชมเปิด F12 ก็ไม่เห็น
 */
export interface DeveloperContact {
  name: string;
  role: string;
  phone: string;
  email: string;
  line: string;
  /** แสดง QR Code LINE (GET /api/contact/line-qr) ในการ์ดของคนนี้ */
  lineQr?: boolean;
}

export const DEVELOPER_CONTACTS: DeveloperContact[] = [
  { name: 'จิม', role: 'ผู้พัฒนาระบบ', phone: '098-276-9502', email: '', line: '', lineQr: true },
];
