import type { OpdAppointments } from '../types/reports.types';

/**
 * นัดหมายผู้ป่วยนอกรายคลินิก ของวันนี้และพรุ่งนี้ (ข้อมูลจำลอง)
 * ตัวเลขสุ่มแบบกำหนดจากวันที่ — วันเดียวกันได้ค่าเดิมเสมอ
 * ข้อมูลจริง: oapp (nextdate, clinic) + ovst (มารับบริการแล้วหรือยัง)
 *
 * รายชื่อ/รหัสคลินิกตรงกับตาราง clinic ใน HOSxP ของ รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569 · คลินิกหลักตรวจซ้ำ 06/10/2569)
 * ค่าเฉลี่ยนัดต่อวัน = จำนวนนัดจริงย้อนหลัง 1 ปี ÷ ~245 วันทำการ
 * คลินิกที่ไม่มีนัดเลยในรอบปี (17 คลินิก) ไม่ใส่ไว้ — ของจริงก็จะไม่ขึ้นในตาราง
 */
const CLINICS: { code: string; name: string; perDay: number; weekend?: number }[] = [
  { code: '000', name: 'ตรวจโรคทั่วไป', perDay: 35.8 },
  { code: '001', name: 'โรคเบาหวาน(DM)', perDay: 19.5 },
  { code: '042', name: 'กายภาพ', perDay: 15.5 },
  { code: '002', name: 'โรคความดัน(HT)', perDay: 15.0 },
  { code: '025', name: 'แพทย์แผนไทย', perDay: 9.8 },
  { code: '041', name: 'wanmai', perDay: 8.5 },
  { code: '043', name: 'แพทย์จีน', perDay: 7.3 },
  // ER นัดทำแผล/ฉีดยา — วันทำการ ~5.4 · วันหยุด ~2.8 ครั้ง/วัน
  { code: '039', name: 'อุบัติเหตุ - ฉุกเฉิน (ER)', perDay: 5.4, weekend: 0.52 },
  { code: '010', name: 'ทันตกรรม', perDay: 5.0 },
  { code: '003', name: 'โรคหัวใจ(IHD)', perDay: 4.8 },
  { code: '026', name: 'โรคไขมันในเลือดสูง', perDay: 2.9 },
  { code: '029', name: 'คลินิก นิรนาม', perDay: 2.8 },
  { code: '024', name: 'ฝากครรภ์(ANC)', perDay: 2.6 },
  { code: '009', name: 'โรคถุงลมปอดโป่งพอง(COPD)', perDay: 1.2 },
  { code: '015', name: 'วัณโรค(TB)', perDay: 1.1 },
  { code: '012', name: 'โรคหอบหืด(Asthma)', perDay: 1.1 },
  { code: '051', name: 'Telemedicine', perDay: 1.0 },
  { code: '032', name: 'จิตเวช(Psychi)', perDay: 0.9 },
  { code: '004', name: 'โรคธัยรอยด์', perDay: 0.8 },
  { code: '006', name: 'สุขภาพเด็กดี', perDay: 0.7 },
  { code: '030', name: 'โรคตับอักเสบเรื้อรัง(Chronic Hepatitis)', perDay: 0.7 },
  { code: '048', name: 'คลินิกระบบปัสสาวะ รพ.สมุทรปราการ', perDay: 0.22 },
  { code: '027', name: 'วางแผนครอบครัว', perDay: 0.21 },
  { code: '016', name: 'หัวใจขาดเลือด(IHD)', perDay: 0.2 },
  { code: '023', name: 'โรคปอดชนิดอุดกั้นเรื้องรัง(COPD)', perDay: 0.18 },
  { code: '038', name: 'โรคไตเรื้อรัง (CKD)', perDay: 0.05 },
  { code: '013', name: 'โรคหลอดเลือดสมอง(Stroke)', perDay: 0.05 },
  { code: '018', name: 'โรคซึมเศร้า', perDay: 0.03 },
  { code: '031', name: 'ข้ออักเสบรูห์มาตอยด์(Rheumatoid arthitis)', perDay: 0.02 },
];

/** สุ่มแบบกำหนดค่าเริ่มจากข้อความ (mulberry32) */
function seeded(text: string) {
  let seed = [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** จำนวนนัดของคลินิกใน 1 วัน (แจกแจงปัวซอง) — คลินิกเล็กจึงมีบางวัน 0 บางวัน 1-2 เหมือนของจริง */
function poisson(mean: number, rand: () => number) {
  if (mean <= 0) return 0;
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do { k++; p *= rand(); } while (p > limit);
  return k - 1;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/** ชั่วโมงปัจจุบันตามเวลาไทย — ใช้ประมาณว่าผู้ป่วยนัดวันนี้มาแล้วกี่ % */
function bangkokHour() {
  return Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour: '2-digit', hour12: false })) % 24;
}

function dayClinics(date: string, arrivedShare: number) {
  const rand = seeded(`appt:${date}`);
  const weekend = isWeekend(date);
  return CLINICS.map(c => {
    const mean = c.perDay * (weekend ? (c.weekend ?? 0) : 1) * (0.75 + rand() * 0.5);
    const total = poisson(mean, rand);
    const arrived = Math.min(total, Math.round(total * arrivedShare * (0.85 + rand() * 0.15)));
    return { clinic: `${c.code} ${c.name}`, total, arrived };
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
}

/** today = วันที่ต้องการดู (วันนี้ หรือย้อนหลัง) — วันที่ผ่านมาแล้วถือว่าผู้ป่วยมาครบตามจริง (~90%) */
export function generateOpdAppointments(today: string): OpdAppointments {
  const tomorrow = addDays(today, 1);
  const hour = bangkokHour();
  const realToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  // สัดส่วนที่มาแล้ว: เริ่มมา 7 โมง ส่วนใหญ่มาครบก่อนเที่ยง, หลังเลิกงานคงที่ ~ 90%
  const arrivedShare = today < realToday ? 0.9 : hour < 7 ? 0 : Math.min(0.9, ((hour - 7) / 5) * 0.9);

  const todayClinics = dayClinics(today, arrivedShare);
  const tomorrowClinics = dayClinics(tomorrow, 0);
  const sum = (rows: { total: number; arrived: number }[], key: 'total' | 'arrived') => rows.reduce((s, c) => s + c[key], 0);

  return {
    today: { date: today, total: sum(todayClinics, 'total'), arrived: sum(todayClinics, 'arrived'), clinics: todayClinics },
    tomorrow: { date: tomorrow, total: sum(tomorrowClinics, 'total'), arrived: 0, clinics: tomorrowClinics },
  };
}
