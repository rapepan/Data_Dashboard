/**
 * ชื่อภาษาไทยของ request — ใช้ทั้งข้อความในเทอร์มินัล (logger) และหน้า "ประวัติการใช้งาน"
 * - page = คนเปิดหน้า / เปลี่ยนตัวกรอง / กดรีเฟรช
 * - action = คนกดทำรายการ (login, ส่งเรื่อง, ส่งออก, ตั้งค่า)
 * - background = หน้าเว็บเช็คเอง ไม่มีใครกด (header X-Background: 1, ช่องสัญญาณสด, ตัวเฝ้าระบบ)
 */
export type RequestKind = 'page' | 'action' | 'background';

interface Rule {
  method: string;
  /** path หลังตัด /api และ query string */
  path: RegExp;
  label: string;
  /** บังคับประเภท (ไม่บังคับ = ดูจาก method / header) */
  kind?: RequestKind;
}

const rule = (method: string, path: string, label: string, kind?: RequestKind): Rule => ({
  method,
  // :id / :file → ส่วนใดก็ได้ 1 ช่วง
  path: new RegExp(`^${path.replace(/:[a-z]+/gi, '[^/]+')}$`),
  label,
  kind,
});

const RULES: Rule[] = [
  /* หน้ารายงาน */
  rule('GET', '/dashboard/summary', 'หน้าแรก (Dashboard)'),
  rule('GET', '/icd10/summary', 'ค้นหาผู้ป่วยตามโรค (ICD-10)'),
  rule('GET', '/queue/report', 'ระยะเวลารอคอยคิว'),
  rule('GET', '/opd/report', 'ผู้ป่วยนอก (OPD)'),
  rule('GET', '/opd/appointments', 'ผู้ป่วยนอก · นัดหมายรายคลินิก'),
  rule('GET', '/ipd/report', 'ผู้ป่วยใน (IPD)'),
  rule('GET', '/er/report', 'อุบัติเหตุ & ฉุกเฉิน (ER)'),
  rule('GET', '/dental/report', 'ทันตกรรม'),
  rule('GET', '/physio/report', 'กายภาพบำบัด'),
  rule('GET', '/telemedicine/report', 'Telemedicine'),
  rule('GET', '/postal-drug/report', 'การส่งยาทางไปรษณีย์'),
  rule('GET', '/thai-medicine/report', 'แพทย์แผนไทย / แผนจีน'),
  rule('GET', '/drug-budget/report', 'ปริมาณการใช้ยา'),
  rule('GET', '/drug-budget/compare', 'ปริมาณการใช้ยา · เปรียบเทียบรายการยา'),
  rule('GET', '/readmit/report', 'Re-admit (28 วัน)'),
  rule('GET', '/referral/report', 'ข้อมูลการส่งต่อ (Refer)'),
  rule('GET', '/stroke-unit/status', 'Stroke Unit'),
  rule('GET', '/contact/people', 'ติดต่อผู้พัฒนา'),
  rule('GET', '/contact/line-qr', 'ติดต่อผู้พัฒนา · QR LINE'),
  rule('GET', '/feedback/mine', 'เรื่องที่แจ้ง'),
  rule('GET', '/feedback/mine/:id/images/:file', 'เรื่องที่แจ้ง · ดูรูปแนบ'),
  /* หน้าผู้ดูแล */
  rule('GET', '/admin/audit', 'ประวัติการใช้งาน'),
  rule('GET', '/admin/usage', 'สรุปการใช้งาน'),
  rule('GET', '/admin/users', 'ผู้ใช้งานระบบ'),
  rule('GET', '/admin/system', 'ประกาศ / ปิดปรับปรุง'),
  rule('GET', '/admin/feedback', 'แจ้งปัญหา / ข้อเสนอแนะ'),
  rule('GET', '/admin/feedback/:id/images/:file', 'แจ้งปัญหา · ดูรูปแนบ'),
  rule('GET', '/admin/cache', 'สถานะข้อมูล'),

  /* ทำรายการ */
  rule('POST', '/auth/login', 'เข้าสู่ระบบ'),
  rule('POST', '/auth/logout', 'ออกจากระบบ'),
  rule('POST', '/audit/export', 'ส่งออก Excel / พิมพ์'),
  rule('POST', '/feedback', 'ส่งเรื่องแจ้งปัญหา'),
  rule('PUT', '/admin/feedback/:id/status', 'เปลี่ยนสถานะเรื่องแจ้งปัญหา'),
  rule('POST', '/admin/system/notices', 'สร้างประกาศ'),
  rule('PUT', '/admin/system/notices/:id', 'แก้ไขประกาศ'),
  rule('DELETE', '/admin/system/notices/:id', 'ลบประกาศ'),
  rule('PUT', '/admin/system/maintenance', 'โหมดปิดปรับปรุง'),
  rule('PUT', '/admin/system/page-maintenance', 'ปิดปรับปรุงเฉพาะหน้า'),
  rule('POST', '/admin/system/restart', 'รีสตาร์ทระบบ'),
  rule('POST', '/admin/users/:loginname/logout', 'บังคับออกจากระบบ'),
  rule('POST', '/admin/cache/refresh', 'สั่งดึงข้อมูลใหม่'),

  /* เบื้องหลัง — หน้าเว็บเช็คเอง (บางตัวส่ง header ไม่ได้ จึงบังคับประเภทไว้) */
  rule('GET', '/system/status', 'เช็คสถานะระบบ', 'background'),
  rule('GET', '/system/events', 'ช่องสัญญาณสด', 'background'),
  rule('GET', '/system/whats-new', 'เช็ค "มีอะไรใหม่"', 'background'),
  rule('POST', '/system/whats-new', 'อ่าน "มีอะไรใหม่" แล้ว', 'background'),
  rule('GET', '/feedback/mine/summary', 'เช็คกระดิ่งเรื่องที่แจ้ง', 'background'),
  rule('POST', '/feedback/mine/seen', 'อ่านเรื่องที่แจ้งแล้ว', 'background'),
  rule('GET', '/admin/feedback/summary', 'เช็คกระดิ่งผู้ดูแล', 'background'),
  rule('POST', '/admin/feedback/summary/seen', 'อ่านกระดิ่งผู้ดูแลแล้ว', 'background'),
  rule('GET', '/auth/me', 'ตรวจสถานะ login', 'background'),
  rule('GET', '/health', 'ตรวจว่าระบบทำงาน (ตัวเฝ้าระบบ)', 'background'),
  rule('POST', '/client-error', 'รายงาน error จากหน้าเว็บ', 'background'),
];

/** จุดประสงค์ของ request เบื้องหลังที่หน้าเว็บบอกมา (header X-Purpose) */
const PURPOSE: Record<string, string> = {
  compare: 'ข้อมูลเทียบช่วงก่อน',
};

/** ชื่อภาษาไทยของ path (GET) — null = ไม่รู้จัก (ใช้ในหน้าประวัติการใช้งาน) */
export function pageLabel(path: string): string | null {
  const p = path.split('?')[0].replace(/^\/api(?=\/)/, '');
  return RULES.find(r => r.method === 'GET' && r.path.test(p))?.label ?? null;
}

/**
 * ประเภท + ชื่อของ request · ไม่รู้จัก = ใช้ path เดิม (เช่น มีคนลองยิง URL แปลก ๆ — ให้เห็นตรง ๆ)
 * background = header X-Background: 1 หรือ rule บังคับไว้
 */
export function describeRequest(method: string, url: string, background: boolean, purpose?: string): { kind: RequestKind; label: string } {
  const path = url.split('?')[0];
  const p = path.replace(/^\/api(?=\/)/, '');
  const found = RULES.find(r => r.method === method && r.path.test(p));
  const kind: RequestKind = found?.kind ?? (background ? 'background' : method === 'GET' || method === 'HEAD' ? 'page' : 'action');
  const base = found?.label ?? path;
  const why = purpose ? PURPOSE[purpose] : undefined;
  return { kind, label: why && kind === 'background' && !found?.kind ? `${why} · ${base}` : base };
}
