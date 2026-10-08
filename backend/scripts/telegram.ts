/**
 * ตัวช่วยตั้งค่า Telegram
 *   npm run telegram:chat-id  → แสดงแชต/กลุ่มที่บอทเห็น (พิมพ์ข้อความในกลุ่มก่อน 1 ครั้ง) เอาเลข id ไปใส่ TELEGRAM_CHAT_ID
 *   npm run telegram:test     → ส่งข้อความทดสอบไป TELEGRAM_TEST_CHAT_ID (เช่น แชทส่วนตัว) · ไม่ได้ตั้ง = TELEGRAM_CHAT_ID
 */
import '../src/env';
import { notifyService } from '../src/services/notify.service';

interface Update {
  message?: { chat: { id: number; type: string; title?: string; first_name?: string; username?: string } };
  my_chat_member?: { chat: { id: number; type: string; title?: string } };
}

async function listChats(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(10_000) });
  const data = (await res.json()) as { ok: boolean; result?: Update[]; description?: string };
  if (!data.ok) throw new Error(data.description);
  const chats = new Map<number, string>();
  for (const update of data.result ?? []) {
    const chat = update.message?.chat ?? update.my_chat_member?.chat;
    if (!chat) continue;
    const name = 'title' in chat && chat.title ? chat.title : [('first_name' in chat && chat.first_name) || '', ('username' in chat && chat.username) ? `@${chat.username}` : ''].join(' ').trim();
    chats.set(chat.id, `${chat.type === 'private' ? 'ส่วนตัว' : 'กลุ่ม'} · ${name}`);
  }
  if (chats.size === 0) {
    console.log('ยังไม่พบแชต — เพิ่มบอทเข้ากลุ่ม แล้วพิมพ์ข้อความในกลุ่ม 1 ครั้ง (หรือทักบอทส่วนตัว) แล้วรันใหม่');
    return;
  }
  console.log('แชตที่บอทเห็น (ใส่ id ใน TELEGRAM_CHAT_ID คั่นด้วย ,):');
  for (const [id, label] of chats) console.log(`  ${String(id).padEnd(16)} ${label}`);
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN ใน backend/.env');
  if (process.argv[2] === 'chat-id') return listChats(token);
  if (!notifyService.isConfigured()) throw new Error('ยังไม่ได้ตั้ง TELEGRAM_CHAT_ID ใน backend/.env');
  console.log(`ส่งข้อความทดสอบไป: ${notifyService.testTargets().join(', ')}`);
  await notifyService.test();
}

main().catch(error => {
  console.error(`✖ ${(error as Error).message}`);
  process.exit(1);
});
