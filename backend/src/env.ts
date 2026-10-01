import { existsSync } from 'node:fs';
import * as path from 'node:path';

/**
 * โหลด backend/.env เข้า process.env — ต้อง import เป็นบรรทัดแรกของ server.ts
 * (หลายไฟล์อ่าน process.env ตอน import) ไม่พึ่ง flag --env-file เพราะ tsx watch ไม่ส่งต่อ flag นี้ให้ node
 * ค่าที่ตั้งไว้ใน environment อยู่แล้วจะไม่ถูกทับ
 */
const envFile = path.resolve(__dirname, '../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
