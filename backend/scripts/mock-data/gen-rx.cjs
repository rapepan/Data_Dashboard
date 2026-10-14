// สร้าง backend/src/services/rx-daily-data.ts จาก rx-daily.json (ยอดรวมรายวันจาก HOSxP)
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const days = require('./rx-daily.json');
const body = days.map(r => `  '${r.d}': [${r.visits}, ${r.withDrug}],`).join('\n');
fs.writeFileSync(BACKEND + '/src/services/rx-daily-data.ts', `/**
 * ใบสั่งยาผู้ป่วยนอกรายวันจริงจาก HOSxP รพ.บางเสาธง ${days[0].d} – ${days[days.length - 1].d} (ถ่ายเมื่อ ${new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10).split('-').reverse().map((x, i) => (i === 2 ? Number(x) + 543 : x)).join('/')} · อ่านอย่างเดียว · ยอดรวมต่อวันเท่านั้น)
 * [visit ผู้ป่วยนอกทั้งหมด (ovst), visit ที่มีรายการยาอย่างน้อย 1 รายการ (opitemrece + drugitems)]
 * วันที่ไม่มีในตาราง (ก่อน/หลังช่วงนี้) — rx-daily.ts ใช้ค่าเฉลี่ยตามวันในสัปดาห์แทน
 * สร้างอัตโนมัติ — แก้ที่สคริปต์สร้างแล้วสร้างใหม่ ไม่แก้มือ
 */
export const RX_DAILY: Record<string, [visits: number, withDrug: number]> = {
${body}
};
`);
console.log('ok', days.length, 'วัน');
