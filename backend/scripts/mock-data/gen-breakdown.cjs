// สร้าง src/services/breakdown-data.ts จาก breakdown.json — ตัวเลขรองรายเดือน (อันดับโรค / หัตถการ / สิทธิ / รายชั่วโมง ฯลฯ)
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const j = require('./breakdown.json');
const thai = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}`;
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
// แถวที่ตัวอักษรเพี้ยน (ข้อความเข้ารหัสผิด) — ข้าม
const garbled = s => /[฀-๿]?เน|เธ/.test(String(s)) && /เธ/.test(String(s));

/** { key: { month: number | number[] } } — รวมแถวซ้ำ (บางคิวรีจัดกลุ่มละเอียดกว่าที่ต้องการ) */
function byCode(rows, keyOf, valueOf) {
  const out = {};
  for (const r of rows) {
    const k = keyOf(r);
    if (k === null || k === undefined || k === '') continue;
    const v = valueOf(r);
    out[k] ??= {};
    const cur = out[k][r.m];
    out[k][r.m] = cur === undefined ? v : Array.isArray(v) ? v.map((x, i) => x + cur[i]) : cur + v;
  }
  return out;
}
const hourly = (rows, valueOf) => {
  const out = {};
  for (const r of rows) { if (r.h === null || Number.isNaN(r.h)) continue; out[r.m] ??= Array.from({ length: 24 }, () => null); out[r.m][r.h] = valueOf(r); }
  for (const m of Object.keys(out)) out[m] = out[m].map(v => v ?? valueOf({ n: 0, appt: 0, l1: 0, l2: 0, l3: 0, l45: 0 }));
  return out;
};

// ---- จัดกลุ่ม ----
const DENTAL = { 1: 'ตรวจ', 4: 'ทันตกรรมหัตถการ', 6: 'ปริทันต์', 10: 'ทันตศัลยกรรม' };
const physioCat = t => {
  const s = String(t ?? '');
  if (!s.trim()) return 'ไม่ระบุ';
  if (s.includes('ส่งเสริม')) return 'ส่งเสริมและป้องกัน';
  const tx = s.includes('รักษา'); const re = s.includes('ฟื้นฟู');
  return tx && re ? 'รักษา + ฟื้นฟูสมรรถภาพ' : re ? 'ฟื้นฟูสมรรถภาพ' : 'รักษา';
};
const thaiCat = t => {
  const s = String(t ?? '');
  if (garbled(s)) return null;
  if (s.includes('บริบาล')) return 'ฟื้นฟูหลังคลอด';
  if (s.includes('พอก') || s.includes('เท้า')) return 'นวดเท้า-พอกเข่า';
  if (s.includes('อบ')) return 'อบสมุนไพร';
  if (s.includes('นวด') || s.includes('ประคบ')) return 'นวด / ประคบสมุนไพร';
  return null;
};
/** หมวดโรคตามตัวอักษรแรกของรหัส ICD-10 */
const CHAPTER = {
  A: 'โรคติดเชื้อหรือโรคจากพยาธิบางชนิด', B: 'โรคติดเชื้อหรือโรคจากพยาธิบางชนิด', C: 'เนื้องอก', D: 'เนื้องอก / โรคเลือด',
  E: 'โรคระบบต่อมไร้ท่อ โภชนาการ และเมตาบอลิซึม', F: 'ภาวะแปรปรวนทางจิตและพฤติกรรม', G: 'โรคระบบประสาท', H: 'โรคตาและหู',
  I: 'โรคของระบบไหลเวียนโลหิต', J: 'โรคของระบบหายใจ', K: 'โรคของระบบย่อยอาหาร', L: 'โรคผิวหนัง', M: 'โรคระบบกล้ามเนื้อ รวมโครงร่าง และเนื้อยึดเสริม',
  N: 'โรคระบบสืบพันธุ์ร่วมปัสสาวะ', O: 'การตั้งครรภ์ การคลอด และระยะหลังคลอด', P: 'ภาวะเริ่มเกิดในระยะปริกำเนิด', Q: 'รูปผิดปกติแต่กำเนิด',
  R: 'อาการ อาการแสดง หรือผลการตรวจทางคลินิก ที่มิได้ระบุไว้ที่อื่น', S: 'การบาดเจ็บ การเป็นพิษ', T: 'การบาดเจ็บ การเป็นพิษ',
  V: 'สาเหตุภายนอก', W: 'สาเหตุภายนอก', X: 'สาเหตุภายนอก', Y: 'สาเหตุภายนอก', Z: 'ปัจจัยที่มีผลต่อสถานะสุขภาพ', U: 'รหัสเพื่อวัตถุประสงค์พิเศษ',
};

const data = {
  workdays: Object.fromEntries(j.workdays.map(r => [r.m, r.days])),
  opdHour: hourly(j.opdHour, r => [r.n, r.appt]),
  opdDx: byCode(j.opdDx, r => r.code, r => [r.n, r.p]),
  opdDxYear: Object.fromEntries(j.opdDxYear.map(r => [r.code, [r.n, r.p]])),
  ipdDx: byCode(j.ipdDx, r => r.code, r => r.n),
  ipdChapter: byCode(j.ipdChapter, r => CHAPTER[r.code] ?? 'อื่น ๆ', r => r.n),
  ipdRight: byCode(j.ipdRight, r => (garbled(r.code) ? 'ไม่ระบุ' : clean(r.code)), r => r.n),
  ipdAge: byCode(j.ipdAge, r => r.code, r => r.n),
  adjrw: Object.fromEntries(j.adjrw.map(r => [r.m, [r.n, r.c]])),
  admitQueue: Object.fromEntries((j.admitQueue ?? []).map(r => [r.m, [r.er, r.other, r.waitHours, r.waitN]])),
  erHour: hourly(j.erHour, r => [r.l1, r.l2, r.l3, r.l45]),
  erDx: byCode(j.erDx, r => r.code, r => r.n),
  readmitDx: byCode(j.readmitDx, r => r.code, r => [r.ward === '02' ? r.n : 0, r.ward === '07' ? r.n : 0, r.n]),
  referDx: byCode(j.referDx, r => r.code, r => [r.point === 'opd' ? r.n : 0, r.point === 'er' ? r.n : 0, r.point === 'ipd' ? r.n : 0, r.n]),
  physioCat: byCode(j.physioType, r => physioCat(r.code), r => r.n),
  physioOpdDx: byCode(j.physioOpdDx, r => r.code, r => [r.n, r.p]),
  physioIpdDx: byCode(j.physioIpdDx, r => r.code, r => [r.n, r.p]),
  physioProc: byCode(j.physioProc, r => `${r.code}|${clean(r.name)}`, r => r.n),
  dentalCat: byCode(j.dentalGroup, r => DENTAL[r.code] ?? 'อื่น ๆ', r => r.n),
  dentalProc: byCode(j.dentalProc, r => `${r.code}|${clean(r.name)}`, r => r.n),
  thaiCat: byCode(j.thaiOp, r => thaiCat(r.code), r => r.n),
  thaiDx: byCode(j.thaiDx, r => r.code, r => r.n),
  chineseDx: byCode(j.chineseDx, r => r.code, r => [r.n, r.p]),
  teleHour: hourly(j.teleHour, r => r.n),
  teleClinic: byCode(j.teleClinic, r => (garbled(r.code) ? 'ไม่ระบุคลินิก' : clean(r.code)), r => r.n),
  opdRight: byCode(j.opdRight, r => (garbled(r.code) ? 'ไม่ระบุ' : clean(r.code)), r => [r.n, r.income]),
  names: Object.fromEntries(Object.entries(j.icdNames).map(([k, [n, t]]) => [k, [clean(n), t && !garbled(t) ? clean(t) : null]])),
};

fs.writeFileSync(BACKEND + '/src/services/breakdown-data.ts', `/**
 * ตัวเลขรองรายเดือนจาก HOSxP รพ.บางเสาธง 01/10/2568 – ${thai(j.upto)} (ถ่ายเมื่อ ${thai(today)} · อ่านอย่างเดียว · ยอดรวมเท่านั้น ไม่มีข้อมูลรายคน)
 * รูปแบบ: ชุด → รายการ (รหัส / กลุ่ม / ชั่วโมง) → { 'YYYY-MM': ค่า } — breakdown.ts รวมเป็นช่วงวันที่ที่เลือก
 * สร้างอัตโนมัติ (scripts/mock-data/gen-breakdown.cjs) — แก้ที่สคริปต์แล้วสร้างใหม่ ไม่แก้มือ
 */
export const BREAKDOWN_UPTO = '${j.upto}';

type M<T> = Record<string, T>;
/** ชุด → รายการ → { เดือน: ค่า } */
export interface Breakdown {
  workdays: M<number>;
  opdHour: M<number[][]>; erHour: M<number[][]>; teleHour: M<number[]>;
  opdDx: M<M<number[]>>; opdDxYear: M<number[]>;
  ipdDx: M<M<number>>; ipdChapter: M<M<number>>; ipdRight: M<M<number>>; ipdAge: M<M<number>>; adjrw: M<number[]>;
  /** เดือน → [ขอ admit จาก ER, จากแผนกอื่น, ชั่วโมงรอรวม, จำนวนที่มีเวลารอ] */
  admitQueue: M<number[]>;
  erDx: M<M<number>>; readmitDx: M<M<number[]>>; referDx: M<M<number[]>>;
  physioCat: M<M<number>>; physioOpdDx: M<M<number[]>>; physioIpdDx: M<M<number[]>>; physioProc: M<M<number>>;
  dentalCat: M<M<number>>; dentalProc: M<M<number>>;
  thaiCat: M<M<number>>; thaiDx: M<M<number>>; chineseDx: M<M<number[]>>;
  teleClinic: M<M<number>>; opdRight: M<M<number[]>>;
  /** รหัสโรค → [ชื่อ, ชื่อไทย] */
  names: M<[string, string | null]>;
}

export const BD: Breakdown = ${JSON.stringify(data)};
`);
console.log('ok', Object.entries(data).map(([k, v]) => `${k}:${Object.keys(v).length}`).join(' '));
