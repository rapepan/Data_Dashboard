import { API_BASE, apiGet, apiPost, apiPut } from './apiClient';

export type FeedbackCategory = 'bug' | 'data' | 'suggestion' | 'other' | 'confirm';
export type FeedbackStatus = 'new' | 'in_progress' | 'done';

/** ไทม์ไลน์: ผู้ดูแลเปลี่ยนสถานะ/ตอบกลับ */
export interface FeedbackHistory {
  time: string;
  status: FeedbackStatus;
  /** loginname ผู้ดูแล (เฉพาะหน้าผู้ดูแล) */
  by?: string;
  byName?: string;
  note?: string;
}

export interface FeedbackEntry {
  id: string;
  time: string;
  category: FeedbackCategory;
  page: string;
  message: string;
  name?: string;
  position?: string;
  contact?: string;
  contactPhone?: string;
  contactLine?: string;
  /** QR Code LINE ของผู้แจ้ง */
  lineQr?: { file: string; mime: string; size: number };
  loginname?: string;
  ip?: string;
  status: FeedbackStatus;
  images?: { file: string; mime: string; size: number }[];
  /** รูปถูกลบตามกำหนดเก็บ (ดำเนินการแล้วครบ 90 วัน) */
  imagesPurged?: boolean;
  history?: FeedbackHistory[];
  updatedAt?: string;
  /** (เรื่องที่แจ้ง) มีความเคลื่อนไหวที่ยังไม่เห็น */
  unread?: boolean;
}

export const FEEDBACK_STATUS: Record<FeedbackStatus, { label: string; icon: string; tone: string }> = {
  new: { label: 'ยังไม่ดำเนินการ', icon: 'fa-clock', tone: 'amber' },
  in_progress: { label: 'กำลังดำเนินการ', icon: 'fa-screwdriver-wrench', tone: 'sky' },
  done: { label: 'ดำเนินการแล้ว', icon: 'fa-circle-check', tone: 'indigo' },
};

/** ลิงก์รูปแนบของเรื่องที่ตัวเองแจ้ง */
export const myFeedbackImageUrl = (id: string, file: string) => `${API_BASE}/feedback/mine/${id}/images/${file}`;

export interface MyFeedbackSummary {
  unread: number;
  latest: { id: string; status: FeedbackStatus; updatedAt?: string; page: string; category: FeedbackCategory; note?: string }[];
}

/** ลิงก์รูปแนบ (ผู้ดูแลระบบเท่านั้น — ใช้ cookie login เดียวกับหน้าเว็บ) */
export const feedbackImageUrl = (id: string, file: string) => `${API_BASE}/admin/feedback/${id}/images/${file}`;

export const FEEDBACK_CATEGORY: Record<FeedbackCategory, { label: string; icon: string; tone: string }> = {
  bug: { label: 'แจ้งปัญหาการใช้งาน', icon: 'fa-bug', tone: 'rose' },
  data: { label: 'ข้อมูลไม่ถูกต้อง', icon: 'fa-database', tone: 'amber' },
  suggestion: { label: 'ข้อเสนอแนะ', icon: 'fa-lightbulb', tone: 'indigo' },
  other: { label: 'อื่น ๆ', icon: 'fa-comment-dots', tone: 'slate' },
  confirm: { label: 'ยืนยันข้อมูล', icon: 'fa-circle-check', tone: 'plum' },
};

/** หน้าที่มีคนยืนยันข้อมูลแล้ว (ใช้ข้อมูลตามระบบ ไม่ต้องแก้) — ล่าสุดก่อน */
export interface PageConfirmation {
  page: string;
  count: number;
  last: string;
  people: { name: string; position: string; time: string }[];
}

/** แจ้งกระดิ่งให้โหลดใหม่ทันที (เช่น หลังผู้ดูแลเปลี่ยนสถานะเรื่อง) */
export const FEEDBACK_CHANGED_EVENT = 'feedback:changed';

export interface FeedbackSummary {
  newCount: number;
  /** เวลาของเรื่องล่าสุดที่ผู้ดูแลคนนี้เคยกดดูกระดิ่ง (เก็บฝั่ง server — ทุกเครื่องตรงกัน) */
  seenAt: string;
  latest: (Pick<FeedbackEntry, 'id' | 'time' | 'category' | 'page' | 'name' | 'message'> & { imageCount?: number })[];
}

export const feedbackService = {
  submit: (body: { category: FeedbackCategory; page: string; message: string; position: string; phone: string; lineId: string; lineQr?: string; images: string[] }) =>
    apiPost<{ ok: true; id: string }>('/feedback', body),
  list: (status?: FeedbackStatus) =>
    apiGet<{ entries: FeedbackEntry[]; counts: Record<FeedbackStatus | 'all', number>; confirmations: PageConfirmation[] }>('/admin/feedback', { params: status ? { status } : undefined }),
  /** เรียกแบบเบื้องหลัง (silent): ไม่มี spinner ไม่ต่ออายุ session */
  summary: () => apiGet<FeedbackSummary>('/admin/feedback/summary', { silent: true }),
  bellSeen: (time: string) => apiPost<{ ok: true }>('/admin/feedback/summary/seen', { time }, { silent: true }),
  setStatus: (id: string, status: FeedbackStatus, note?: string) => apiPut<FeedbackEntry>(`/admin/feedback/${id}/status`, { status, note }),
  /* ผู้แจ้ง */
  mine: () => apiGet<{ entries: FeedbackEntry[]; unread: number }>('/feedback/mine'),
  mineSummary: () => apiGet<MyFeedbackSummary>('/feedback/mine/summary', { silent: true }),
  mineSeen: () => apiPost<{ ok: true }>('/feedback/mine/seen', undefined, { silent: true }),
};
