import { defineConfig } from 'vitest/config';

// ทดสอบกับฐาน data_dashboard จริง (npm run test:db) — ใช้ตารางชื่อขึ้นต้น zz_test_ แล้วลบทิ้งเมื่อจบ ไม่แตะตารางจริง
export default defineConfig({
  test: {
    include: ['test-db/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test-db/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
