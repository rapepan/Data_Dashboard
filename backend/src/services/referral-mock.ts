import type { ReferralReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้าการส่งต่อผู้ป่วย (Refer Out) — ใช้ระหว่างยังไม่ดึงจาก HOSxP (referout)
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
export const POINTS = [
  { key: 'all', label: 'ทุกจุดส่งต่อ' },
  { key: 'opd', label: 'ผู้ป่วยนอก (OPD)' },
  { key: 'er', label: 'อุบัติเหตุ-ฉุกเฉิน (ER)' },
  { key: 'ipd', label: 'ผู้ป่วยใน (IPD)' },
];

/**
 * [รหัส, ชื่อ, จำนวนต่อ 23 วัน (ทุกจุด), จุดที่ส่งต่อ]
 * อิง HOSxP รพ.บางเสาธง (referout.pdx + refer_point ย้อนหลัง 12 เดือน ÷ 365 × 23 — ตรวจเมื่อ 30/09/2569)
 * ชื่อโรคภาษาไทยจาก icd101.tname (ไม่มีชื่อไทย ใช้ชื่ออังกฤษ)
 * ส่งต่อทั้งปี 5,836 ครั้ง (~16/วัน): OPD 84% · ER 13% · IPD 3% · ปลายทางหลัก รพ.บางพลี / รพ.สมุทรปราการ
 */
const DISEASES: [string, string, number, string[]][] = [
  ['I10', 'โรคความดันโลหิตสูง', 19.3, ['opd']],
  ['E119', 'เบาหวานแบบที่ 2 ชนิดที่ไม่ต้องพึ่งอินสุลิน  ไม่มีภาวะแทรกซ้อน', 12.9, ['opd']],
  ['H269', 'ต้อกระจก  ที่มิได้ระบุรายละเอียด', 10.1, ['opd']],
  ['I64', 'โรคอัมพาตฉับพลัน ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 8.2, ['er', 'opd']],
  ['N185', 'โรคไตเรื้อรัง ระยะที่ 5', 6.1, ['opd', 'ipd']],
  ['H259', 'ต้อกระจกในผู้สูงอายุ  ที่มิได้ระบุรายละเอียด', 5.4, ['opd']],
  ['N40', 'การเจริญเกินของต่อมลูกหมาก', 4.3, ['opd']],
  ['Z348', 'การดูแลการตั้งครรภ์ปกติ ครรภ์อื่น', 3.8, ['opd']],
  ['E113', 'เบาหวานแบบที่ 2 ชนิดที่ไม่ต้องพึ่งอินสุลิน  ร่วมกับภาวะแทรกซ้อนทางตา', 3.8, ['opd']],
  ['C509', 'มะเร็งเต้านม  ที่มิได้ระบุรายละเอียด', 3.8, ['opd']],
  ['H409', 'ต้อหิน  ที่มิได้ระบุรายละเอียด', 3.6, ['opd']],
  ['K922', 'เลือดออกในช่องท้องส่วนบน', 3.5, ['opd', 'ipd', 'er']],
  ['E789', 'ความผิดปกติของเมตะบอลิซึมของไลโปโปรตีน  ไม่ระบุรายละเอียด', 3, ['opd']],
  ['I259', 'โรคหัวใจขาดเลือดเรื้อรัง ไม่ระบุรายละเอียด', 3, ['opd']],
  ['M170', 'ข้อเข่าเสื่อมปฐมภูมิ  ทั้งสองข้าง', 2.5, ['opd']],
];
/** โรคนอกรายการยังมีอีกมาก — ยอดรวมทั้งหมดมากกว่าผลรวมในตาราง (5,836 ÷ 1,478 ครั้งของ 15 โรคแรก) */
const OTHER_SHARE = 3.95;

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

const jitter = (value: number, pct = 0.25) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

export function generateReferralReport(start: string, end: string, point: string): ReferralReport {
  const pointKey = POINTS.some(p => p.key === point) ? point : 'all';
  const days = daysBetween(start, end);
  const scale = days / 23;
  // แต่ละโรคแบ่งตามจำนวนจุดที่ส่งต่อ
  const items = DISEASES
    .filter(([, , , points]) => pointKey === 'all' || points.includes(pointKey))
    .map(([code, name, count, points]) => ({ code, name, count: jitter(count * scale / (pointKey === 'all' ? 1 : points.length)) }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);

  const listed = items.reduce((sum, item) => sum + item.count, 0);
  const total = Math.round(listed * OTHER_SHARE);
  const avgPerDay = total / days;

  return {
    start,
    end,
    point: pointKey,
    points: POINTS,
    total,
    day: { date: end, count: jitter(avgPerDay, 0.3) },
    days,
    avgPerDay: Math.round(avgPerDay * 10) / 10,
    items,
  };
}
