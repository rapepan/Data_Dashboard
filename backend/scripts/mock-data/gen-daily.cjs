// สร้าง backend/src/services/daily-data.ts จาก daily.json — ยอดรวมรายวันจริง + อัตรา "คนไม่ซ้ำ" ตามความยาวช่วง
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const j = require('./daily.json');
// การจ่ายยาผู้ป่วยทางไกล (telerx-probe) — ยอดรายวัน + คนไม่ซ้ำตามความยาวช่วง
if (fs.existsSync(__dirname + '/telerx.json')) { const t = require('./telerx.json'); j.daily.telerx = t.daily; j.windows.telerx = t.windows; }
const thai = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}`;
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const DAY = 86400000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** คอลัมน์ของแต่ละชุด (ลำดับในอาร์เรย์) */
const COLS = {
  er: ['n'], admit: ['n', 'w02', 'w07'], dch: ['n'], refer: ['n', 'opd', 'er', 'ipd'],
  dental: ['n', 'p'], physioOpd: ['n', 'p'], physioIpd: ['n', 'p'], tele: ['n', 'p'], thai: ['n', 'p'], chinese: ['n', 'p'],
  postal: ['n'], readmit: ['n', 'w02', 'w07'], icd: ['n', 'p', 'c'],
  drug: ['qty', 'cost', 'sale'],
  telerx: ['n', 'p', 'items', 'qty', 'cost', 'sale'],
  erLevel: ['l1', 'l2', 'l3', 'l4', 'l5'], erDch: ['home', 'refer', 'admit', 'dead', 'obs', 'unk'], erTime: ['waitSum', 'waitN', 'b1', 'b2', 'b3', 'b4'],
  newpt: ['n'], flow: ['n', 's4', 's5', 's7', 's6'], appt: ['n', 'came', 'cancel'], dchDetail: ['w02', 'w07', 'l1', 'l2', 'l3', 'l4'],
};
if (j.censusStart) {
  const adm = Object.fromEntries(j.daily.admit.map(r => [r.d, r]));
  const dch = Object.fromEntries(j.daily.dch.map(r => [r.d, r]));
  const dd = Object.fromEntries((j.daily.dchDetail ?? []).map(r => [r.d, r]));
  let n = j.censusStart.n, w02 = j.censusStart.w02, w07 = j.censusStart.w07;
  j.daily.census = [];
  for (let d = '2025-10-01'; d <= j.upto; d = addDays(d, 1)) {
    n += (adm[d]?.n ?? 0) - (dch[d]?.n ?? 0);
    w02 += (adm[d]?.w02 ?? 0) - (dd[d]?.w02 ?? 0);
    w07 += (adm[d]?.w07 ?? 0) - (dd[d]?.w07 ?? 0);
    j.daily.census.push({ d, n, w02, w07 });
  }
  COLS.census = ['n', 'w02', 'w07'];
}
const tables = Object.entries(COLS).map(([k, cols]) => {
  const rows = j.daily[k].map(r => `'${r.d}': [${cols.map(c => r[c] ?? 0).join(', ')}]`);
  return `  /** ${cols.join(', ')} */\n  ${k}: { ${rows.join(', ')} },`;
}).join('\n');

/**
 * อัตราส่วนคนไม่ซ้ำ ÷ ผลรวม "คนต่อวัน" ตามความยาวช่วง (1 วัน = 1) — ใช้ประมาณคนของช่วงหลายวันจากยอดรายวัน
 * คำนวณจากช่วงที่สิ้นสุดวันที่ upto: distinct(ช่วง) ÷ Σ คนต่อวัน(ช่วงเดียวกัน)
 */
function ratios(key, dailyKey, col) {
  const days = Object.fromEntries(j.daily[dailyKey].map(r => [r.d, r]));
  return [[1, 1], ...j.windows[key].map(w => {
    // window ใน SQL: DATE_SUB(CURDATE(), INTERVAL n DAY) ถึงเมื่อวาน = n วัน
    let sum = 0;
    for (let i = 0; i < w.days; i++) { const r = days[addDays(j.upto, -i)]; if (r) sum += r[col]; }
    return [w.days, sum ? +(w.p / sum).toFixed(4) : 1];
  })];
}
// readmit: ไม่มีคนต่อวัน → อัตราส่วนคน ÷ ครั้ง
const readmitRatio = [[1, 1], ...j.windows.readmitPersons.map(w => [w.days, w.n ? +(w.p / w.n).toFixed(4) : 1])];
const R = {
  dental: ratios('dental', 'dental', 'p'), physioOpd: ratios('physioOpd', 'physioOpd', 'p'),
  tele: ratios('tele', 'tele', 'p'), thai: ratios('thai', 'thai', 'p'), chinese: ratios('chinese', 'chinese', 'p'),
  icd: ratios('icd', 'icd', 'p'), readmit: readmitRatio,
  ...(j.windows.telerx ? { telerx: ratios('telerx', 'telerx', 'p') } : {}),
};
// รหัสโรคไม่ซ้ำ ÷ Σ รหัสต่อวัน
const icdCodes = (() => {
  const days = Object.fromEntries(j.daily.icd.map(r => [r.d, r]));
  return [[1, 1], ...j.windows.icd.map(w => { let s = 0; for (let i = 0; i < w.days; i++) { const r = days[addDays(j.upto, -i)]; if (r) s += r.c; } return [w.days, s ? +(w.c / s).toFixed(4) : 1]; })];
})();

fs.writeFileSync(BACKEND + '/src/services/daily-data.ts', `/**
 * ยอดรวมรายวันจริงจาก HOSxP รพ.บางเสาธง 01/10/2568 – ${thai(j.upto)} (ถ่ายเมื่อ ${thai(today)} · อ่านอย่างเดียว · ไม่มีข้อมูลรายคน)
 * วันที่ไม่มีในตาราง (ภายในช่วงข้างบน) = วันนั้นไม่มีบริการ (0) · หลังวันที่ถ่าย = daily.ts ใช้ค่าเฉลี่ยตามวันในสัปดาห์
 * n = ครั้ง · p = คนไม่ซ้ำในวันนั้น · c = รหัสโรคไม่ซ้ำ · w02/w07 = หอ Ward 2 / Home Ward · opd/er/ipd = จุดส่งต่อ
 * สร้างอัตโนมัติ (scripts/mock-data/gen-daily.cjs) — แก้ที่สคริปต์แล้วสร้างใหม่ ไม่แก้มือ
 */
export const DAILY_UPTO = '${j.upto}';
export const DAILY_FROM = '2025-10-01';

export const DAILY = {
${tables}
} satisfies Record<string, Record<string, number[]>>;

export type DailyKey = keyof typeof DAILY;

/** [จำนวนวันของช่วง, คนไม่ซ้ำ ÷ ผลรวมคนต่อวัน] — ประมาณคนของช่วงหลายวัน (readmit = คน ÷ ครั้ง) */
export const PERSON_RATIO: Partial<Record<DailyKey, [number, number][]>> = {
${Object.entries(R).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n')}
};
/** รหัสโรคไม่ซ้ำ ÷ ผลรวมรหัสต่อวัน (หน้า ICD-10) */
export const ICD_CODE_RATIO: [number, number][] = ${JSON.stringify(icdCodes)};
`);
console.log('ok · upto', j.upto, '· ratios', JSON.stringify(R.thai));
