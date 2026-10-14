// สร้าง backend/src/services/fiscal-data.ts + drug-history.ts (ปีงบ 2569–2570) จาก fy.json / physio-probe.json
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const j = require('./fy.json');
const p = require('./physio-probe.json');
const dm = require('./drug-monthly.json');
// ข้อมูลถึงวันที่ (เมื่อวานของวันที่ดึง) — จาก series2.json
const UPTO = require('./series2.json').meta[0].upto;
const CUR = UPTO.slice(0, 7);
const ELAPSED = Number(UPTO.slice(8, 10));
const DIM = new Date(Number(CUR.slice(0, 4)), Number(CUR.slice(5, 7)), 0).getDate();
const thai = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}`;
const TODAY_TH = thai(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10));
const table = (rows, key = 'n') => `{ ${rows.map(r => `'${r.m}': ${Math.round(r[key])}`).join(', ')} }`;
const rights = r => {
  const months = [...new Set(j.thaiRights5.map(x => x.m))];
  return `{ ${months.map(m => `'${m}': ${j.thaiRights5.find(x => x.m === m && x.r === r)?.n ?? 0}`).join(', ')} }`;
};
// กายภาพบำบัด (เดิมอยู่ใน physio-mock) — ย้ายมารวมที่นี่
const revClaim = p.revMonthly.map(r => ({ m: r.ym, n: r.claim }));
const revSelf = p.revMonthly.map(r => ({ m: r.ym, n: r.selfpay }));
const appt = k => p.apptMonthly.filter(r => r.ym <= CUR).map(r => ({ m: r.ym, n: Number(r[k]) }));

const text = `import type { MonthTable } from './fiscal-series';

/**
 * ยอดจริงรายเดือนจาก HOSxP รพ.บางเสาธง ต.ค. 2568 – ${thai(UPTO)} (ถ่ายเมื่อ ${TODAY_TH} · อ่านอย่างเดียว · ยอดรวมเท่านั้น)
 * เดือน ${CUR} = ยอดถึงวันที่ ${ELAPSED} (fiscal-series.ts ประมาณทั้งเดือนให้เมื่อจำเป็น)
 * สร้างอัตโนมัติ — แก้ที่สคริปต์สร้างแล้วสร้างใหม่ ไม่แก้มือ
 */

/** การแพทย์ทางไกล: ovst แผนก 055 (ครั้ง) */
export const TELE_VISITS: MonthTable = ${table(j.tele)};

/** ส่งยาทางไปรษณีย์: prscrpt_delivery_med (ครั้ง) — เดือนที่ไม่มีการส่ง = 0 */
export const POSTAL_DELIVERIES: MonthTable = ${(() => {
  const months = j.tele.map(r => r.m);
  return `{ ${months.map(m => `'${m}': ${j.postalMed.find(r => r.m === m)?.n ?? 0}`).join(', ')} }`;
})()};

/** ทันตกรรม: dtmain (visit ไม่ซ้ำ) */
export const DENTAL_VISITS: MonthTable = ${table(j.dental)};

/** แพทย์แผนไทย: ovst แผนก 041 (คนไม่ซ้ำในเดือน) */
export const THAI_PERSONS: MonthTable = ${table(j.thai041, 'persons')};
/** แพทย์แผนจีน: ovst แผนก 049 (คนไม่ซ้ำในเดือน) */
export const CHINESE_PERSONS: MonthTable = ${table(j.chinese049, 'persons')};
/** ยาสมุนไพรทั้งโรงพยาบาล (ชิ้น) */
export const HERB_QTY: MonthTable = ${table(j.herbMonthly, 'qty')};
/** สิทธิของ visit แผนก 041/049: บัตรผู้สูงอายุ · UC 30 บาท · เบิกต้นสังกัด · ชำระเงินเอง · อื่น ๆ */
export const THAI_RIGHTS: MonthTable[] = [${[0, 1, 2, 3, 4].map(rights).join(',\n  ')}];

/** กายภาพบำบัด: physic_main / physic_main_ipd (ครั้ง) */
export const PHYSIO_OPD: MonthTable = ${table(p.opdMonthly.map(r => ({ m: r.ym, n: r.visits })))};
export const PHYSIO_IPD: MonthTable = ${table(p.ipdMonthly.map(r => ({ m: r.ym, n: r.visits })))};
/** ค่ารักษากายภาพผู้ป่วยนอก (บาท): เบิกได้ / เก็บเงิน */
export const PHYSIO_CLAIM: MonthTable = ${table(revClaim)};
export const PHYSIO_SELFPAY: MonthTable = ${table(revSelf)};
/** นัดคลินิกกายภาพ 042: มาตามนัด / ไม่มาตามนัด · walk-in = มาโดยไม่มีนัดวันนั้น */
export const PHYSIO_APPT_CAME: MonthTable = ${table(appt('came'))};
export const PHYSIO_APPT_NOSHOW: MonthTable = ${table(appt('noshow'))};
export const PHYSIO_WALKIN: MonthTable = ${table(p.walkinMonthly.map(r => ({ m: r.ym, n: r.walkin })))};

/** ปริมาณการใช้ยา: visit ผู้ป่วยนอก (ovst) ทั้งหมด / ที่มีรายการยา (opitemrece + drugitems) */
export const DRUG_VISITS: MonthTable = ${table(dm.visits, 'visits')};
export const DRUG_VISITS_WITH: MonthTable = ${table(dm.visits, 'with_drug')};
/** ราคาทุนรวม (qty × opitemrece.cost) / ราคาขายรวม (sum_price) ของยาทุกรายการ (บาท) */
export const DRUG_COST: MonthTable = ${table(dm.money, 'cost')};
export const DRUG_SALE: MonthTable = ${table(dm.money, 'sale')};
`;
fs.writeFileSync(BACKEND + '/src/services/fiscal-data.ts', text);

// ---------- drug-history: เก็บปี 2567–2568 เดิม · คำนวณ 2569 ใหม่ · เพิ่ม 2570 (ต.ค. ประมาณทั้งเดือนจาก 1–5 ต.ค.) ----------
const src = fs.readFileSync(BACKEND + '/src/services/drug-history.ts', 'utf8');
const old = {};
for (const m of src.matchAll(/^\s*"?'?(\d+)"?'?: \{ (.*) \},?$/gm)) {
  old[m[1]] = {};
  for (const y of m[2].matchAll(/(\d{4}): \[([^\]]*)\]/g)) old[m[1]][y[1]] = y[2].split(',').map(Number);
}
const hist = {};
for (const [code, years] of Object.entries(old)) hist[code] = { ...(years[2567] ? { 2567: years[2567] } : {}), ...(years[2568] ? { 2568: years[2568] } : {}) };
for (const r of j.drugs) {
  const y = Number(r.m.slice(0, 4)), mo = Number(r.m.slice(5));
  const fy = (mo >= 10 ? y + 1 : y) + 543;
  const idx = (mo + 2) % 12;
  const qty = r.m === CUR ? Math.round((r.qty / ELAPSED) * DIM) : Math.round(r.qty);
  hist[r.icode] = hist[r.icode] || {};
  hist[r.icode][fy] = hist[r.icode][fy] || Array(12).fill(0);
  hist[r.icode][fy][idx] += qty;
}
const lines = Object.entries(hist).filter(([, y]) => Object.keys(y).length).sort().map(([code, years]) =>
  `  "${code}": { ${Object.entries(years).map(([fy, arr]) => `${fy}: [${arr.join(', ')}]`).join(', ')} },`);
fs.writeFileSync(BACKEND + '/src/services/drug-history.ts', `/**
 * ปริมาณยารายเดือนจริง ปีงบ 2567–2570 (ต.ค. – ก.ย.) — opitemrece ของ HOSxP รพ.บางเสาธง (ปรับปรุง ${TODAY_TH})
 * ปีงบ 2570: ต.ค. 2569 = ประมาณทั้งเดือนจากยอดจริง 1–5 ต.ค. (หน้าจอนับถึงวันที่เลือกให้เอง) · เดือนที่ยังไม่ถึง = 0
 * ใช้กับกราฟ "เปรียบเทียบรายการยา 3 ปีงบประมาณ" · ปีที่ยังไม่มีรายการยานั้นในโรงพยาบาล = ไม่มีข้อมูล
 */
export const DRUG_FY_MONTHLY: Record<string, Record<number, number[]>> = {
${lines.join('\n')}
};
`);
console.log('fiscal-data ok · drugs', lines.length, '(เดิม', Object.keys(old).length, ')');
// fiscal-series.ts: เดือน/วันที่ที่ถ่ายข้อมูลไว้ (ใช้ประมาณยอดทั้งเดือนของเดือนปัจจุบัน)
const FS = BACKEND + '/src/services/fiscal-series.ts';
let fsrc = fs.readFileSync(FS, 'utf8');
fsrc = fsrc.replace(/export const SNAPSHOT_MONTH = '[^']*';/, `export const SNAPSHOT_MONTH = '${CUR}';`).replace(/export const SNAPSHOT_DAY = \d+;/, `export const SNAPSHOT_DAY = ${ELAPSED};`);
fs.writeFileSync(FS, fsrc);
console.log('fiscal-series snapshot', CUR, ELAPSED);
