export interface NavItem {
  key: string;
  path: string;
  icon: string;
  label: string;
  /** สิทธิ์ที่ต้องมี (ตรงกับ pages จาก /api/auth/me) — ไม่ระบุ = ใช้ key */
  page?: string;
  /** ซ่อนจากเมนูและปิดหน้าไว้ชั่วคราว (เช่น ข้อมูลยังไม่พร้อม) */
  hidden?: boolean;
  /** อยู่ในเมนูย่อย (พับ/กางได้) — key ของ NAV_PARENTS */
  parent?: string;
  /** หน้ายังไม่มีข้อมูล (กำลังพัฒนา) — ไม่ขึ้นในตัวเลือกยืนยันข้อมูล / แจ้งปัญหา */
  wip?: boolean;
}

/** หัวเมนูย่อย (กดพับ/กาง ไม่ใช่หน้า) */
export interface NavParent {
  label: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}
