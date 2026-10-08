import { afterEach, describe, expect, it } from 'vitest';
import { notifyService } from '../src/services/notify.service';

/** ปลายทาง Telegram — ไม่ส่งจริง ตรวจแค่ว่าเลือกแชทถูก */
const saved = { chat: process.env.TELEGRAM_CHAT_ID, test: process.env.TELEGRAM_TEST_CHAT_ID };
afterEach(() => {
  process.env.TELEGRAM_CHAT_ID = saved.chat;
  if (saved.test === undefined) delete process.env.TELEGRAM_TEST_CHAT_ID; else process.env.TELEGRAM_TEST_CHAT_ID = saved.test;
});

describe('ปลายทางข้อความทดสอบ', () => {
  it('ตั้ง TELEGRAM_TEST_CHAT_ID → ทดสอบไปแชทนั้นเท่านั้น (ไม่เข้ากลุ่ม)', () => {
    process.env.TELEGRAM_CHAT_ID = '-100group';
    process.env.TELEGRAM_TEST_CHAT_ID = '111private';
    expect(notifyService.testTargets()).toEqual(['111private']);
    expect(notifyService.targetCount()).toBe(1);
  });

  it('ไม่ได้ตั้ง → ใช้ TELEGRAM_CHAT_ID', () => {
    process.env.TELEGRAM_CHAT_ID = '-100group';
    delete process.env.TELEGRAM_TEST_CHAT_ID;
    expect(notifyService.testTargets()).toEqual(['-100group']);
  });
});
