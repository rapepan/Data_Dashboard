// สร้าง src/services/telerx-data.ts จาก telerx.json — การจ่ายยาผู้ป่วยทางไกล: รายยารายเดือน + สิทธิ (ยอดรายวันอยู่ใน daily-data.ts → gen-daily)
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const j = require('./telerx.json');
const thai = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}`;
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

// รายยา: { icode: [name, unit, { 'YYYY-MM': [qty, cost, sale] }] }
const drugs = {};
for (const r of j.drugs) {
  drugs[r.icode] ??= [String(r.name).trim(), String(r.unit ?? '').trim(), {}];
  drugs[r.icode][2][r.m] = [r.qty, r.cost, r.sale];
}
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const drugLines = Object.entries(drugs).map(([code, [name, unit, months]]) =>
  `  '${code}': ['${esc(name)}', '${esc(unit)}', { ${Object.entries(months).map(([m, v]) => `'${m}': [${v.join(', ')}]`).join(', ')} }],`);

fs.writeFileSync(BACKEND + '/src/services/telerx-data.ts', `/**
 * การจ่ายยาผู้ป่วยทางไกล (visit แผนก 055 ที่มีรายการยา) จาก HOSxP รพ.บางเสาธง 01/10/2568 – ${thai(j.upto)} (ถ่ายเมื่อ ${thai(today)} · อ่านอย่างเดียว · ยอดรวมเท่านั้น)
 * ยอดรายวัน (ครั้ง / คน / รายการ / ชิ้น / ทุน / ขาย) อยู่ใน daily-data.ts ชุด telerx
 * สร้างอัตโนมัติ (scripts/mock-data/gen-telerx.cjs) — แก้ที่สคริปต์แล้วสร้างใหม่ ไม่แก้มือ
 */

/** รหัสยา → [ชื่อ, หน่วย, { เดือน: [ชิ้น, ทุน, ขาย] }] */
export const TELERX_DRUGS: Record<string, [name: string, unit: string, months: Record<string, [qty: number, cost: number, sale: number]>]> = {
${drugLines.join('\n')}
};

/** สิทธิการรักษาของ visit ที่ได้รับยา (ครั้ง) ทั้งช่วงข้อมูล */
export const TELERX_RIGHTS: [name: string, visits: number][] = ${JSON.stringify(j.rights.map(r => [r.name, r.n]))};
`);
console.log('ok · ยา', Object.keys(drugs).length, 'รายการ');
