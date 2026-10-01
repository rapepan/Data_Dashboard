import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { DATA_DIR } from '../utils/paths';

/**
 * รูปแนบของเรื่องแจ้งปัญหา — เก็บที่ backend/data/feedback-uploads/<id>/<n>.<ext>
 * - รับเฉพาะ JPG / PNG / WebP ตรวจจากเนื้อไฟล์จริง (magic bytes) ไม่เชื่อชนิดที่ส่งมา
 * - สูงสุด MAX_IMAGES รูป รูปละไม่เกิน MAX_BYTES (หน้าเว็บย่อรูปก่อนส่งอยู่แล้ว ปกติเหลือไม่กี่ร้อย KB)
 * - ดูได้เฉพาะผู้ดูแลระบบ (GET /api/admin/feedback/:id/images/:file)
 */
const UPLOAD_DIR = path.join(DATA_DIR, 'feedback-uploads');

export const MAX_IMAGES = 3;
export const MAX_BYTES = 5 * 1024 * 1024;
/** ลบรูปของเรื่องที่ "ดำเนินการแล้ว" ครบกี่วัน (ข้อความของเรื่องยังเก็บไว้) */
export const IMAGE_RETENTION_DAYS = 90;

export interface FeedbackImage {
  file: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
}

const TYPES = {
  'image/jpeg': { ext: 'jpg', match: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', match: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', match: (b: Buffer) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
} as const;

type Mime = keyof typeof TYPES;

const ID_PATTERN = /^[0-9a-f]{8}$/;
const FILE_PATTERN = /^([1-9]|line-qr)\.(jpg|png|webp)$/;

export class ImageError extends Error {}

/** ตรวจรูปที่ส่งมา (data URL) — ผิดเงื่อนไขโยน ImageError พร้อมข้อความภาษาไทย */
export function parseImages(input: unknown): { buffer: Buffer; mime: Mime }[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ImageError('รูปแบบรูปแนบไม่ถูกต้อง');
  if (input.length > MAX_IMAGES) throw new ImageError(`แนบรูปได้สูงสุด ${MAX_IMAGES} รูป`);
  return input.map((item, i) => {
    const match = typeof item === 'string' ? /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(item) : null;
    if (!match) throw new ImageError(`รูปที่ ${i + 1} ไม่ใช่ไฟล์รูปภาพ`);
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_BYTES) throw new ImageError(`รูปที่ ${i + 1} ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB`);
    // เชื่อเนื้อไฟล์จริง ไม่เชื่อชนิดที่หน้าเว็บบอก
    const mime = (Object.keys(TYPES) as Mime[]).find(type => TYPES[type].match(buffer));
    if (!mime) throw new ImageError(`รูปที่ ${i + 1} ต้องเป็น JPG, PNG หรือ WebP`);
    return { buffer, mime };
  });
}

export const feedbackImages = {
  save(id: string, images: { buffer: Buffer; mime: Mime }[]): FeedbackImage[] {
    if (images.length === 0 || !ID_PATTERN.test(id)) return [];
    const dir = path.join(UPLOAD_DIR, id);
    mkdirSync(dir, { recursive: true });
    return images.map(({ buffer, mime }, i) => {
      const file = `${i + 1}.${TYPES[mime].ext}`;
      writeFileSync(path.join(dir, file), buffer);
      return { file, mime, size: buffer.length };
    });
  },

  /** QR Code LINE ของผู้แจ้ง (ช่องทางติดต่อกลับ) — เก็บเป็น line-qr.<ext> ในโฟลเดอร์เดียวกับรูปแนบ */
  saveLineQr(id: string, image: { buffer: Buffer; mime: Mime }): FeedbackImage | undefined {
    if (!ID_PATTERN.test(id)) return undefined;
    const dir = path.join(UPLOAD_DIR, id);
    mkdirSync(dir, { recursive: true });
    const file = `line-qr.${TYPES[image.mime].ext}`;
    writeFileSync(path.join(dir, file), image.buffer);
    return { file, mime: image.mime, size: image.buffer.length };
  },

  /** อ่านรูป — ชื่อไฟล์ต้องตรงรูปแบบเท่านั้น (กันการอ่านไฟล์อื่นนอกโฟลเดอร์) */
  read(id: string, file: string): Buffer | null {
    if (!ID_PATTERN.test(id) || !FILE_PATTERN.test(file)) return null;
    const full = path.join(UPLOAD_DIR, id, file);
    return existsSync(full) ? readFileSync(full) : null;
  },

  remove(id: string) {
    if (!ID_PATTERN.test(id)) return;
    rmSync(path.join(UPLOAD_DIR, id), { recursive: true, force: true });
  },

  mimeOf(file: string) {
    const ext = file.split('.').pop();
    return (Object.keys(TYPES) as Mime[]).find(type => TYPES[type].ext === ext) ?? 'application/octet-stream';
  },
};
