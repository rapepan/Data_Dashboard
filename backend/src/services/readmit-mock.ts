import type { ReadmitReport } from '../types/reports.types';

/**
 * ข้อมูลจำลองหน้า Re-admit 28 วัน — ใช้ระหว่างยังไม่ดึงจาก HOSxP (an_stat: admit ซ้ำภายใน 28 วันหลังจำหน่าย)
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
export const WARDS = [
  { key: 'all', label: 'ทุกหอผู้ป่วย' },
  { key: '02', label: 'Ward 2' },
  { key: '07', label: 'Home Ward' },
];

/**
 * โรคที่พบบ่อย: [รหัส, ชื่อ, ครั้งต่อ 23 วัน, หอที่พบ]
 * อิง HOSxP รพ.บางเสาธง (admit ซ้ำภายใน 28 วันหลังจำหน่าย ย้อนหลัง 12 เดือน ÷ 365 × 23 — ตรวจเมื่อ 30/09/2569)
 * ทั้งปี 251 ครั้ง จาก 165 คน · ชื่อโรคภาษาไทยจาก icd101.tname (ไม่มีชื่อไทย ใช้ชื่ออังกฤษ)
 */
const DISEASES: [string, string, number, string[]][] = [
  ['D569', 'ทาลัสซีเมียที่มิได้ระบุราบละเอียด', 1.2, ['02']],
  ['I500', 'หัวใจล้มเหลวแบบมีน้ำคั่ง', 0.76, ['02']],
  ['N390', 'ทางเดินปัสสาวะอักเสบ', 0.63, ['02']],
  ['J441', 'Chronic obstructive pulmonary disease with acute exacerbation, unspecified', 0.5, ['02']],
  ['D649', 'โลหิตจางที่มิได้ระบุรายละเอียด', 0.5, ['02']],
  ['N185', 'โรคไตเรื้อรัง ระยะที่ 5', 0.44, ['02']],
  ['A415', 'การติดเชื้อกรัมลบชนิดอื่น', 0.44, ['02']],
  ['E119', 'เบาหวานแบบที่ 2 ชนิดที่ไม่ต้องพึ่งอินสุลิน  ไม่มีภาวะแทรกซ้อน', 0.44, ['07']],
  ['J189', 'ปอดบวม', 0.38, ['02']],
  ['E162', 'ภาวะน้ำตาลในเลือดต่ำ   ที่มิได้ระบุรายละเอียด', 0.38, ['02']],
  ['N179', 'ไตวายเฉียบพลัน ไม่ระบุรายละเอียด', 0.38, ['02']],
  ['C349', 'มะเร็งหลอดลมหรือปอด  ที่มิได้ระบุรายละเอียด', 0.32, ['02']],
  ['E160', 'ภาวะน้ำตาลในเลือดต่ำจายา  แต่ไม่หมดสติลึก (โคม่า)', 0.32, ['02']],
  ['L031', 'Cellulitis of other parts of limb', 0.32, ['02']],
];
/** โรคนอกรายการ — ยอดรวมทั้งหมดมากกว่าผลรวมในตาราง (251 ÷ 111 ครั้งของ 14 โรคแรก) */
const OTHER_SHARE = 2.26;

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export function generateReadmitReport(start: string, end: string, ward: string): ReadmitReport {
  const wardKey = WARDS.some(w => w.key === ward) ? ward : 'all';
  const scale = daysBetween(start, end) / 23;

  const items = DISEASES
    .filter(([, , , wards]) => wardKey === 'all' || wards.includes(wardKey))
    .map(([code, name, weight]) => ({ code, name, count: Math.round(weight * scale * (0.7 + Math.random() * 0.6)) }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);

  const listed = items.reduce((sum, item) => sum + item.count, 0);
  // Home Ward มี re-admit น้อย — โรคนอกรายการส่วนใหญ่อยู่ Ward 2
  const visits = Math.round(listed * (wardKey === '07' ? 1.3 : OTHER_SHARE));
  return {
    start,
    end,
    ward: wardKey,
    wards: WARDS,
    visits,
    // คนเดิมกลับมาซ้ำหลายครั้งได้ (ทั้งปี 251 ครั้ง จาก 165 คน)
    persons: Math.min(visits, Math.max(visits ? 1 : 0, Math.round(visits * 0.66))),
    items,
  };
}
