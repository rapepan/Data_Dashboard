import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import * as path from 'node:path';
import { DATA_DIR } from '../utils/paths';
import { feedbackImages, IMAGE_RETENTION_DAYS, type FeedbackImage } from './feedback-images';

const FILE = path.join(DATA_DIR, 'feedback.jsonl');

export const FEEDBACK_CATEGORIES = ['bug', 'data', 'suggestion', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** ยังไม่ดำเนินการ → กำลังดำเนินการ → ดำเนินการแล้ว */
export const FEEDBACK_STATUSES = ['new', 'in_progress', 'done'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** ไทม์ไลน์: ทุกครั้งที่ผู้ดูแลเปลี่ยนสถานะ/ตอบกลับ */
export interface FeedbackHistory {
  time: string;
  status: FeedbackStatus;
  /** loginname ของผู้ดูแล */
  by: string;
  byName?: string;
  /** ข้อความถึงผู้แจ้ง (ไม่บังคับ) */
  note?: string;
}

export interface FeedbackEntry {
  id: string;
  time: string;
  category: FeedbackCategory;
  page: string;
  message: string;
  name?: string;
  /** หน่วยงาน / ตำแหน่ง */
  position?: string;
  /** ช่องทางติดต่อกลับแบบข้อความรวม (ใช้แสดงเรื่องเก่า / แจ้งเตือน) */
  contact?: string;
  /** เบอร์โทรติดต่อกลับ */
  contactPhone?: string;
  /** LINE ID ติดต่อกลับ */
  contactLine?: string;
  /** QR Code LINE ติดต่อกลับ (รูป) */
  lineQr?: FeedbackImage;
  loginname?: string;
  ip?: string;
  status: FeedbackStatus;
  /** รูปแนบ (ไม่บังคับ) */
  images?: FeedbackImage[];
  /** เวลาที่เปลี่ยนเป็น "ดำเนินการแล้ว" — ครบ 90 วันลบรูปทิ้ง */
  doneAt?: string;
  /** รูปถูกลบตามกำหนดเก็บแล้ว */
  imagesPurged?: boolean;
  history?: FeedbackHistory[];
  /** มีความเคลื่อนไหวล่าสุด (เปลี่ยนสถานะ/ตอบกลับ) เมื่อไร */
  updatedAt?: string;
  /** ผู้แจ้งเปิดดูล่าสุดเมื่อไร — ใช้บอกว่ามีความเคลื่อนไหวใหม่ที่ยังไม่เห็น */
  reporterSeenAt?: string;
}

function writeAll(entries: FeedbackEntry[]) {
  writeFileSync(FILE, entries.map(e => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''), 'utf8');
}

function readAll(): FeedbackEntry[] {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as FeedbackEntry);
}

export const feedbackStore = {
  add(entry: Omit<FeedbackEntry, 'id' | 'time' | 'status'>): FeedbackEntry {
    mkdirSync(DATA_DIR, { recursive: true });
    const saved: FeedbackEntry = { id: randomUUID().slice(0, 8), time: new Date().toISOString(), status: 'new', ...entry };
    appendFileSync(FILE, JSON.stringify(saved) + '\n', 'utf8');
    return saved;
  },

  /** รายการล่าสุดก่อน */
  list(status?: FeedbackStatus): FeedbackEntry[] {
    return readAll()
      .filter(e => !status || e.status === status)
      .reverse();
  },

  /** เปลี่ยนสถานะ (หรือคงสถานะเดิม) พร้อมข้อความถึงผู้แจ้ง — บันทึกลงไทม์ไลน์ */
  setStatus(id: string, status: FeedbackStatus, by: { loginname: string; name?: string }, note?: string): FeedbackEntry | null {
    const entries = readAll();
    const target = entries.find(e => e.id === id);
    if (!target) return null;
    const now = new Date().toISOString();
    if (status === 'done' && target.status !== 'done') target.doneAt = now;
    if (status !== 'done') delete target.doneAt;
    target.status = status;
    target.updatedAt = now;
    target.history = [...(target.history ?? []), { time: now, status, by: by.loginname, byName: by.name, ...(note ? { note } : {}) }];
    writeAll(entries);
    return target;
  },

  /** เรื่องที่ผู้ใช้คนนี้แจ้ง (ล่าสุดก่อน) */
  listByReporter(loginname: string): FeedbackEntry[] {
    return readAll().filter(e => e.loginname === loginname).reverse();
  },

  /** ผู้แจ้งเปิดดูแล้ว — ความเคลื่อนไหวก่อนหน้านี้ไม่นับเป็น "ใหม่" */
  markSeenByReporter(loginname: string) {
    const entries = readAll();
    const now = new Date().toISOString();
    let changed = false;
    for (const e of entries) {
      if (e.loginname === loginname && e.updatedAt && (!e.reporterSeenAt || e.reporterSeenAt < e.updatedAt)) {
        e.reporterSeenAt = now;
        changed = true;
      }
    }
    if (changed) writeAll(entries);
  },

  setLineQr(id: string, lineQr: FeedbackImage) {
    const entries = readAll();
    const target = entries.find(e => e.id === id);
    if (!target) return;
    target.lineQr = lineQr;
    writeAll(entries);
  },

  setImages(id: string, images: FeedbackImage[]) {
    const entries = readAll();
    const target = entries.find(e => e.id === id);
    if (!target) return;
    target.images = images;
    writeAll(entries);
  },

  /** ลบรูปของเรื่องที่ดำเนินการแล้วครบ IMAGE_RETENTION_DAYS วัน — ข้อความของเรื่องยังอยู่ */
  purgeOldImages(): number {
    const cutoff = Date.now() - IMAGE_RETENTION_DAYS * 86_400_000;
    const entries = readAll();
    let purged = 0;
    for (const e of entries) {
      if (e.status !== 'done' || !e.doneAt || !(e.images?.length || e.lineQr) || new Date(e.doneAt).getTime() > cutoff) continue;
      feedbackImages.remove(e.id);
      e.images = [];
      delete e.lineQr;
      e.imagesPurged = true;
      purged++;
    }
    if (purged) writeAll(entries);
    return purged;
  },
};
