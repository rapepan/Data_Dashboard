import * as path from 'node:path';

/**
 * โฟลเดอร์เก็บข้อมูลของระบบ (เรื่องแจ้งปัญหา รูปแนบ ประวัติการใช้งาน ผลที่พักไว้)
 * ค่าเริ่มต้น backend/data — ตั้ง DATA_DIR ได้ (ชุดทดสอบใช้โฟลเดอร์ชั่วคราว ไม่แตะข้อมูลจริง)
 */
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '../../data');
