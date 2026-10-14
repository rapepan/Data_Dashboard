// สร้าง backend/src/services/real-series.ts จาก series.json (ข้อมูลรายเดือนจริงจาก HOSxP)
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const raw = require('./series2.json');
// เดือนปัจจุบันมีข้อมูลถึงวันที่ UPTO → ประมาณทั้งเดือนจากค่าเฉลี่ยต่อวัน (rangeSum หารด้วยจำนวนวันในเดือน)
const thai = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}`;
const TODAY_TH = thai(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10));
const UPTO = raw.meta[0].upto; const CUR = UPTO.slice(0, 7); const elapsed = Number(UPTO.slice(8, 10));
const dimOf = ym => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const toSeries = (rows, project = true) => Object.fromEntries(rows.slice(-25).map(r => [r.m, r.m === CUR && project ? Math.round(r.n * dimOf(r.m) / elapsed) : r.n]));
const los = toSeries(raw.mLos, false); los[CUR] = null; // จำหน่ายเดือนนี้ยังน้อยเกินไป ไม่ใช้
const step = r => [r.c3, +(r.c4 - r.c3).toFixed(1), +(r.c5 - r.c4).toFixed(1), +(r.c7 - r.c5).toFixed(1), +(r.c6 - r.c7).toFixed(1)];
const s = {
  series: { opd: toSeries(raw.mOpd), er: toSeries(raw.mEr), admit: toSeries(raw.mAdmit), discharge: toSeries(raw.mDch), refer: toSeries(raw.mRefer), newPatients: toSeries(raw.mNew), los },
  queueMonthly: Object.fromEntries(raw.qOffMonthly.filter(r => r.n >= 300).slice(-13).map(r => [r.m, step(r)])),
  // รายวัน: ขั้นที่ได้ค่าติดลบ (บันทึกเวลาสลับลำดับ) ถือว่าไม่มีข้อมูล
  queueDaily: Object.fromEntries(raw.qOffDaily.filter(r => r.n >= 50).map(r => [r.d, step(r).map(v => (v < 0 ? null : v))])),
  qAll: raw.qOffAll[0],
};
const obj = o => `{ ${Object.entries(o).map(([k, v]) => `'${k}': ${JSON.stringify(v)}`).join(', ')} }`;
const text = `/**
 * ยอดรายเดือนจริงจาก HOSxP รพ.บางเสาธง (ตรวจเมื่อ ${TODAY_TH} ข้อมูลถึง ${thai(UPTO)}) — ใช้คู่กับข้อมูลจำลอง
 * - ยอดของช่วงวันที่ที่เลือก = ยอดรายเดือนเฉลี่ยต่อวัน × จำนวนวันที่ทับกัน
 * - % เทียบช่วงก่อน = ช่วงที่เลือก เทียบกับช่วงยาวเท่ากันที่อยู่ก่อนหน้า
 * เดือน ${CUR} = ประมาณทั้งเดือนจาก 1–${elapsed} ${CUR} · ช่วงที่อยู่นอกข้อมูล (ก่อน 25 เดือนล่าสุด / หลัง ${CUR}) → ไม่มีค่า (null)
 */
type Monthly = Record<string, number | null>;

export const SERIES = {
  /** ovst — ครั้งผู้ป่วยนอก */
  opd: ${obj(s.series.opd)} as Monthly,
  /** ผู้ป่วยใหม่ (มาครั้งแรกในรอบ 5 ปี) */
  newPatients: ${obj(s.series.newPatients)} as Monthly,
  /** er_regist */
  er: ${obj(s.series.er)} as Monthly,
  /** ipt.regdate */
  admit: ${obj(s.series.admit)} as Monthly,
  /** ipt.dchdate */
  discharge: ${obj(s.series.discharge)} as Monthly,
  /** referout */
  refer: ${obj(s.series.refer)} as Monthly,
  /** an_stat.los เฉลี่ย (${CUR} ยังจำหน่ายไม่ครบ ไม่ใช้) */
  los: ${obj(s.series.los)} as Monthly,
};

/**
 * เวลารอคิว OPD (นาที) รายเดือน/รายวัน — service_time (วันทำการ)
 * ลำดับจุดบริการอนุมานจากเวลาเฉลี่ยหลังมาถึง: service3 ออกบัตร (~3) → service4 คัดกรองเสร็จ (~18)
 * → service5 แพทย์ตรวจเสร็จ (~56) → service7 ห้องยา (~74) → service6 การเงิน (~86, ตรงกับเวลาใบเสร็จ)
 * [ลงทะเบียน, รอคัดกรอง/ซักประวัติ, รอพบแพทย์+ตรวจรักษา, รอรับยา, ชำระเงิน]
 */
export const QUEUE_STEPS = ['ลงทะเบียน (ออกบัตร)', 'รอคัดกรอง / ซักประวัติ', 'รอพบแพทย์ + ตรวจรักษา', 'รอรับยา', 'ชำระเงิน'];
export const QUEUE_AVERAGE = [${[s.qAll.c3, +(s.qAll.c4 - s.qAll.c3).toFixed(1), +(s.qAll.c5 - s.qAll.c4).toFixed(1), +(s.qAll.c7 - s.qAll.c5).toFixed(1), +(s.qAll.c6 - s.qAll.c7).toFixed(1)].join(', ')}];
export const QUEUE_MONTHLY: Record<string, number[]> = ${obj(s.queueMonthly)};
export const QUEUE_DAILY: Record<string, (number | null)[]> = ${obj(s.queueDaily)};

const DAY = 86400000;
const toDate = (iso: string) => new Date(\`\${iso}T00:00:00Z\`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** ค่าเฉลี่ยต่อวันของแต่ละวันในช่วง (ยอดเดือน ÷ จำนวนวันในเดือน) — null ถ้ามีวันใดไม่มีข้อมูล */
function perDay(series: Monthly, start: string, end: string, mode: 'sum' | 'mean') {
  let total = 0;
  let days = 0;
  for (let d = toDate(start); d <= toDate(end); d = new Date(d.getTime() + DAY)) {
    const key = isoOf(d).slice(0, 7);
    const v = series[key];
    if (v === undefined || v === null) return null;
    const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    total += mode === 'sum' ? v / dim : v;
    days++;
  }
  return mode === 'sum' ? total : total / Math.max(1, days);
}

/** ยอดรวมจริงของช่วงวันที่ (null = อยู่นอกข้อมูล) */
export const rangeSum = (series: Monthly, start: string, end: string) => perDay(series, start, end, 'sum');
/** ค่าเฉลี่ยของช่วง (เช่น LOS) */
export const rangeMean = (series: Monthly, start: string, end: string) => perDay(series, start, end, 'mean');

/** ช่วงก่อนหน้าที่ยาวเท่ากัน */
export function previousRange(start: string, end: string) {
  const days = Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY) + 1;
  const prevEnd = new Date(toDate(start).getTime() - DAY);
  return { start: isoOf(new Date(prevEnd.getTime() - (days - 1) * DAY)), end: isoOf(prevEnd) };
}

/** % เปลี่ยนแปลงเทียบช่วงก่อน (ปัดเป็นจำนวนเต็ม) — undefined ถ้าไม่มีข้อมูลพอเทียบ */
export function changePct(series: Monthly, start: string, end: string, mode: 'sum' | 'mean' = 'sum'): number | undefined {
  const prev = previousRange(start, end);
  const cur = perDay(series, start, end, mode);
  const before = perDay(series, prev.start, prev.end, mode);
  if (cur === null || before === null || before === 0) return undefined;
  return Math.round(((cur - before) / before) * 100);
}

/** ชุดข้อมูลที่ได้จากการลบกัน (เช่น ผู้ป่วยเก่า = ทั้งหมด − ใหม่) */
export function diffSeries(a: Monthly, b: Monthly): Monthly {
  return Object.fromEntries(Object.keys(a).map(k => [k, a[k] === null || b[k] == null ? null : (a[k] as number) - (b[k] as number)]));
}

/** เวลารอรวมรายเดือน (สำหรับ % เทียบช่วงก่อน) — ผลรวมขั้นตอนที่เลือก */
export function queueSeries(steps: number[]): Monthly {
  return Object.fromEntries(Object.entries(QUEUE_MONTHLY).map(([m, v]) => [m, steps.reduce((sum, i) => sum + v[i], 0)]));
}
`;
fs.writeFileSync(BACKEND + '/src/services/real-series.ts', text);
console.log('written', text.length);
