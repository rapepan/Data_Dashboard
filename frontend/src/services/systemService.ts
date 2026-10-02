import { apiDelete, apiGet, apiPost, apiPut } from './apiClient';

export type NoticeLevel = 'info' | 'warning';

export interface SystemNotice {
  id: number;
  message: string;
  level: NoticeLevel;
  startsAt: string;
  endsAt: string;
  updatedAt: string | null;
  /** เวลาปิดปรับปรุงจริง (ไม่บังคับ) — แยกจากช่วงที่แสดงประกาศ */
  maintenanceStart: string | null;
  maintenanceEnd: string | null;
}

export interface SystemStatus {
  version: string;
  /** until = เวลาที่ผู้ดูแลตั้งให้ปิดโหมดเอง (null = ไม่ได้ตั้ง) */
  maintenance: { on: boolean; message: string; since: string | null; until: string | null };
  /** หน้าที่ปิดปรับปรุงเฉพาะหน้า (ว่าง = ไม่มี) · until = เวลาเปิดทุกหน้ากลับเอง */
  pageMaintenance: { pages: string[]; message: string; until: string | null };
  notices: SystemNotice[];
}

export interface AdminSystem {
  version: string;
  maintenance: { on: boolean; message: string; since: string | null; by: string | null; auto: number | null; until: string | null };
  pageMaintenance: { pages: string[]; message: string; since: string | null; by: string | null; until: string | null };
  /** หน้าที่เลือกปิดเฉพาะหน้าได้ */
  maintainablePages: string[];
  notices: (SystemNotice & { createdBy: string; createdAt: string; autoMaintenance: boolean; autoStartedAt: string | null })[];
}

export type NoticeInput = Pick<SystemNotice, 'message' | 'level' | 'startsAt' | 'endsAt' | 'maintenanceStart' | 'maintenanceEnd'> & { autoMaintenance: boolean };

export const systemService = {
  /** ทุกคน — เรียกแบบเบื้องหลังทุก 1 นาที (ไม่บันทึกประวัติ / ไม่ต่ออายุ session) */
  status: () => apiGet<SystemStatus>('/system/status', { silent: true }),
  /* ผู้ดูแล */
  admin: () => apiGet<AdminSystem>('/admin/system'),
  createNotice: (input: NoticeInput) => apiPost<SystemNotice>('/admin/system/notices', input),
  updateNotice: (id: number, input: NoticeInput) => apiPut<SystemNotice>(`/admin/system/notices/${id}`, input),
  deleteNotice: (id: number) => apiDelete<{ ok: true }>(`/admin/system/notices/${id}`),
  /** until = เวลาปิดโหมดเอง (null = เปิดค้าง) · เปิดอยู่แล้วเรียกซ้ำ = เลื่อนเวลา/แก้ข้อความ */
  setMaintenance: (on: boolean, message: string, until: string | null = null) => apiPut<AdminSystem['maintenance']>('/admin/system/maintenance', { on, message, until }),
  setPageMaintenance: (pages: string[], message: string, until: string | null = null) => apiPut<AdminSystem['pageMaintenance']>('/admin/system/page-maintenance', { pages, message, until }),
};
