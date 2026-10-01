export interface NavItem {
  key: string;
  path: string;
  icon: string;
  label: string;
  /** สิทธิ์ที่ต้องมี (ตรงกับ pages จาก /api/auth/me) — ไม่ระบุ = ใช้ key */
  page?: string;
  /** ซ่อนจากเมนูและปิดหน้าไว้ชั่วคราว (เช่น ข้อมูลยังไม่พร้อม) */
  hidden?: boolean;
}

export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}
