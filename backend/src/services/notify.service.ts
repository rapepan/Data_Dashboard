import type { FeedbackCategory, FeedbackEntry } from '../feedback/feedback-store';
import { logger } from '../utils/logger';
import { feedbackImages } from '../feedback/feedback-images';

/**
 * แจ้งเตือนเข้ามือถือผ่าน Telegram Bot — ตั้งค่าใน backend/.env
 *   TELEGRAM_BOT_TOKEN = token จาก @BotFather
 *   TELEGRAM_CHAT_ID   = ปลายทาง คั่นด้วย , ได้หลายที่ (ส่วนตัว = เลขบวก, กลุ่ม = เลขลบ)
 *   TELEGRAM_ALERT_CHAT_ID = ปลายทางแจ้งเตือนระบบ (ล่ม / ดึงข้อมูลไม่ได้) — เว้นว่าง = ใช้ TELEGRAM_CHAT_ID
 *   APP_PUBLIC_URL     = ลิงก์เว็บ (https) สำหรับปุ่ม "เปิดดูในระบบ" — เว้นว่างได้
 * ไม่ตั้งค่า = ไม่ส่ง (ระบบอื่นทำงานปกติ) · ส่งไม่สำเร็จไม่ทำให้การแจ้งปัญหาล้ม
 */
const TELEGRAM_API = 'https://api.telegram.org';
const MAX_LENGTH = 4000; // Telegram รับสูงสุด 4096 ตัวอักษร
const TIMEOUT_MS = 10_000;

const CATEGORY: Record<FeedbackCategory, { icon: string; label: string }> = {
  bug: { icon: '🐞', label: 'แจ้งปัญหาการใช้งาน' },
  data: { icon: '📊', label: 'ข้อมูลไม่ถูกต้อง' },
  suggestion: { icon: '💡', label: 'ข้อเสนอแนะ' },
  other: { icon: '💬', label: 'อื่น ๆ' },
  confirm: { icon: '✅', label: 'ยืนยันข้อมูล' },
};

const ids = (value: string | undefined) => (value ?? '').split(',').map(id => id.trim()).filter(Boolean);

function config(kind: 'feedback' | 'alert' = 'feedback') {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const alertIds = ids(process.env.TELEGRAM_ALERT_CHAT_ID);
  const chatIds = kind === 'alert' && alertIds.length ? alertIds : ids(process.env.TELEGRAM_CHAT_ID);
  return { token, chatIds };
}

/** ข้อความจากผู้ใช้ต้อง escape ก่อนใส่ใน HTML ของ Telegram (กันรูปแบบพัง) */
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function formatThaiTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

/** ช่องทางติดต่อกลับ — เบอร์โทร / LINE ID / QR Code แยกบรรทัด (เรื่องเก่าที่มีแต่ข้อความรวม ใช้ข้อความเดิม) */
function contactLines(entry: FeedbackEntry): string[] {
  const phone = entry.contactPhone ? `📞 โทร: <b>${esc(entry.contactPhone)}</b>` : null;
  const line = entry.contactLine
    ? `💬 LINE ID: <b>${esc(entry.contactLine)}</b>`
    : entry.lineQr ? '💬 LINE: <b>QR Code</b>' : null;
  const lines = [phone, line].filter((l): l is string => l !== null);
  return lines.length ? lines : entry.contact ? [`📞 ${esc(entry.contact)}`] : [];
}

export function feedbackMessage(entry: FeedbackEntry) {
  const meta = CATEGORY[entry.category] ?? CATEGORY.other;
  const who = [entry.name, entry.position && `(${entry.position})`].filter(Boolean).join(' ');
  const lines = [
    entry.category === 'confirm' ? `${meta.icon} <b>ยืนยันข้อมูล</b> #${entry.id}` : `${meta.icon} <b>แจ้งปัญหาใหม่</b> #${entry.id}`,
    `ประเภท: <b>${esc(meta.label)}</b>`,
    `หน้า: ${esc(entry.page)}`,
    '',
    esc(entry.message),
    '',
    `👤 ${esc(who || 'ไม่ระบุชื่อ')}`,
    ...contactLines(entry),
    `🕐 ${formatThaiTime(entry.time)}`,
  ].filter((line): line is string => line !== null);
  const text = lines.join('\n');
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}

/** ปุ่มเปิดเว็บ — Telegram รับเฉพาะลิงก์ https ที่เข้าถึงจากภายนอก */
function openButton() {
  const base = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (!base?.startsWith('https://')) return undefined;
  return { inline_keyboard: [[{ text: 'เปิดดูในระบบ', url: `${base}/admin/feedback` }]] };
}

async function sendOnce(token: string, chatId: string, text: string) {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: openButton() }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!res.ok || !data?.ok) throw new Error(data?.description ?? `HTTP ${res.status}`);
}

/** ส่งรูป: 1 รูป = sendPhoto, หลายรูป = sendMediaGroup (อัลบั้ม) — อัปโหลดไฟล์จากเครื่องตรง ๆ */
async function sendPhotosOnce(token: string, chatId: string, photos: { buffer: Buffer; mime: string; file: string }[], caption: string) {
  const form = new FormData();
  form.append('chat_id', chatId);
  let method: string;
  if (photos.length === 1) {
    method = 'sendPhoto';
    if (caption) form.append('caption', caption);
    form.append('photo', new Blob([new Uint8Array(photos[0].buffer)], { type: photos[0].mime }), photos[0].file);
  } else {
    method = 'sendMediaGroup';
    form.append('media', JSON.stringify(photos.map((p, i) => ({ type: 'photo', media: `attach://p${i}`, ...(i === 0 && caption ? { caption } : {}) }))));
    photos.forEach((p, i) => form.append(`p${i}`, new Blob([new Uint8Array(p.buffer)], { type: p.mime }), p.file));
  }
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS * 3) });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!res.ok || !data?.ok) throw new Error(data?.description ?? `HTTP ${res.status}`);
}

/** ส่งไปทุกปลายทาง — ล้มลองใหม่ 1 ครั้ง (เว้น 2 วินาที) แล้วรายงานในเทอร์มินัล */
async function sendToAll(text: string, label: string, photos: { buffer: Buffer; mime: string; file: string }[] = [], photoCaption = '', kind: 'feedback' | 'alert' = 'feedback') {
  const { token, chatIds } = config(kind);
  if (!token || chatIds.length === 0) return;
  await Promise.all(chatIds.map(async chatId => {
    try {
      await sendOnce(token, chatId, text).catch(async () => {
        await new Promise(r => setTimeout(r, 2000));
        await sendOnce(token, chatId, text);
      });
      // รูปตามหลังข้อความ (ข้อความยาวได้มากกว่าคำบรรยายรูป)
      if (photos.length) {
        await sendPhotosOnce(token, chatId, photos, photoCaption).catch(async () => {
          await new Promise(r => setTimeout(r, 2000));
          await sendPhotosOnce(token, chatId, photos, photoCaption);
        });
      }
      logger.info(`[notify] ✔ Telegram ${label}${photos.length ? ` + รูป ${photos.length}` : ''} → ${chatId}`);
    } catch (error) {
      // ไม่พิมพ์ token — ข้อความ error ของ Telegram ไม่มี token อยู่แล้ว
      logger.warn(`[notify] ✖ ส่ง Telegram ${label} → ${chatId} ไม่สำเร็จ: ${(error as Error).message}`);
    }
  }));
}

export const notifyService = {
  isConfigured() {
    const { token, chatIds } = config();
    return Boolean(token && chatIds.length);
  },

  targetCount() {
    return config().chatIds.length;
  },

  /** เรื่องแจ้งปัญหาใหม่ — เรียกแบบไม่รอ (fire-and-forget) */
  feedback(entry: FeedbackEntry) {
    const photos = [...(entry.images ?? []), ...(entry.lineQr ? [entry.lineQr] : [])]
      .map(img => ({ buffer: feedbackImages.read(entry.id, img.file), mime: img.mime, file: img.file }))
      .filter((p): p is { buffer: Buffer; mime: typeof p.mime; file: string } => p.buffer !== null);
    // ส่งรูปอย่างเดียว ไม่มีคำบรรยาย (ข้อความหลักบอกแล้วว่ามีรูปอะไรบ้าง)
    void sendToAll(feedbackMessage(entry), `#${entry.id}`, photos);
  },

  /** แจ้งเตือนระบบ (เช่น ดึงข้อมูล HOSxP ล้มหลายรอบ) — ข้อความเป็น HTML ของ Telegram */
  alert(html: string) {
    void sendToAll(html, 'แจ้งเตือนระบบ', [], '', 'alert');
  },

  /** ข้อความทดสอบ (ใช้ตอนตั้งค่า) */
  test() {
    return sendToAll('✅ <b>DATA BSTH</b>\nทดสอบการแจ้งเตือน — ตั้งค่า Telegram สำเร็จ', 'ทดสอบ');
  },
};
