import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // ตั้งค่าแวดล้อมทดสอบก่อนโหลดโค้ดของระบบ (โฟลเดอร์ข้อมูลชั่วคราว, ปิด Telegram)
    setupFiles: ['test/setup.ts'],
  },
});
