import { defineConfig } from 'vitest/config';

// ทดสอบฟังก์ชันที่ไม่ขึ้นกับหน้าจอ (จัดรูปแบบเบอร์ วันที่ ปีงบประมาณ) — แยกจาก vite.config.ts ที่ใช้รันหน้าเว็บ
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
