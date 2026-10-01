import type { DrugBudgetReport, DrugCatalogItem, DrugCompare, DrugItem } from '../types/reports.types';
import { DRUG_FY_MONTHLY } from './drug-history';

/**
 * ข้อมูลจำลองหน้าปริมาณการใช้ยา — ใช้ระหว่างยังไม่ดึงจาก HOSxP (opitemrece / drugitems)
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
interface DrugSeed extends DrugCatalogItem {
  /** จำนวนชิ้นต่อเดือนโดยประมาณ */
  monthlyQty: number;
  price: number;
}

/**
 * รายการยาอิง HOSxP รพ.บางเสาธง (drugitems + opitemrece ย้อนหลัง 12 เดือน ÷ 12 — ตรวจเมื่อ 30/09/2569)
 * ชื่อ/รหัส/ราคาตามฐาน · หน่วยตัดรหัสชั้นวางยาออก
 */
const DRUGS: DrugSeed[] = [
  // ยาสมุนไพร
  { code: '1540053', name: 'มะขามแขก', unit: 'แค็บซูล', type: 'herb', monthlyQty: 2367, price: 1.5 },
  { code: '1543062', name: 'เถาวัลย์เปรียง', unit: 'แค็บซูล', type: 'herb', monthlyQty: 866, price: 1.5 },
  { code: '1650046', name: 'ยาสหัศธารา', unit: 'แค็บซูล', type: 'herb', monthlyQty: 804, price: 1.7 },
  { code: '1543009', name: 'เพชรสังฆาต [แคปซูล]', unit: 'แคปซูล', type: 'herb', monthlyQty: 707, price: 1.5 },
  { code: '1680028', name: 'ขมิ้นชัน CAP', unit: 'แค็บซูล', type: 'herb', monthlyQty: 617, price: 1.5 },
  { code: '1650044', name: 'ยาปราบชมพูทวีป', unit: 'แค็บซูล', type: 'herb', monthlyQty: 359, price: 1.5 },
  { code: '1680024', name: 'ครีมไพล', unit: 'หลอด', type: 'herb', monthlyQty: 310, price: 21.49 },
  { code: '1650033', name: 'ยาแก้ไอผสมมะขามป้อม **รพ. อภัยภูเบศ**', unit: 'ขวด', type: 'herb', monthlyQty: 270, price: 17.58 },
  { code: '1500449', name: 'ยาอมมะแว้ง TAB/PACK', unit: 'ซอง', type: 'herb', monthlyQty: 210, price: 5.75 },
  { code: '1540012', name: 'ยาหอมนวโกฐ', unit: 'เม็ด', type: 'herb', monthlyQty: 128, price: 1 },
  { code: '1680026', name: 'ฟ้าทะลายโจร', unit: 'แค็บซูล', type: 'herb', monthlyQty: 112, price: 1.5 },
  { code: '1540018', name: 'ชาชงขิง', unit: 'ซอง', type: 'herb', monthlyQty: 110, price: 4.75 },
  { code: '1680020', name: 'ยาธาตุอบเชย', unit: 'ขวด (120 ml.)', type: 'herb', monthlyQty: 50, price: 31 },
  { code: '1540011', name: 'ยาหอมเทพจิตร', unit: 'ซอง', type: 'herb', monthlyQty: 45, price: 15.5 },
  // ยาสามัญ (ใช้มากที่สุดตามจำนวนชิ้น)
  { code: '1500462', name: 'Metformin ( B )', unit: 'เม็ด', type: 'common', monthlyQty: 106875, price: 1 },
  { code: '1500485', name: 'Glipizide  ( C )', unit: 'เม็ด', type: 'common', monthlyQty: 72419, price: 0.5 },
  { code: '1543015', name: 'SIMVASTATIN', unit: 'เม็ด', type: 'common', monthlyQty: 65945, price: 1 },
  { code: '1500436', name: 'LOSARTAN ( D )', unit: 'เม็ด', type: 'common', monthlyQty: 42159, price: 1.5 },
  { code: '1500071', name: 'AMLODIPINE  ( C ) (CCBs)', unit: 'เม็ด', type: 'common', monthlyQty: 41420, price: 1.5 },
  { code: '1500107', name: 'Vitamin B Complex TAB', unit: 'เม็ด', type: 'common', monthlyQty: 34841, price: 1 },
  { code: '1500275', name: 'Enalapril ( D )', unit: 'เม็ด', type: 'common', monthlyQty: 29767, price: 1 },
  { code: '1530001', name: 'Hydralazine TAB  ( C )', unit: 'เม็ด', type: 'common', monthlyQty: 24840, price: 1.5 },
  { code: '1500661', name: 'Simvastatin', unit: 'เม็ด', type: 'common', monthlyQty: 23522, price: 1 },
  { code: '1500276', name: 'ENALAPRIL ( D )', unit: 'เม็ด', type: 'common', monthlyQty: 20464, price: 1 },
  { code: '1500100', name: 'ATORVASTATIN  TAB', unit: 'เม็ด', type: 'common', monthlyQty: 20230, price: 2.5 },
  { code: '1500070', name: 'amlodipine ( C ) (CCBs)', unit: 'เม็ด', type: 'common', monthlyQty: 19988, price: 1 },
  { code: '1510077', name: 'Aspirin  tab  ( C-C-D )', unit: 'เม็ด', type: 'common', monthlyQty: 18152, price: 0.5 },
  { code: '1500542', name: 'Omeprazole', unit: 'แค็บซูล', type: 'common', monthlyQty: 15670, price: 1.5 },
  { code: '1500309', name: 'Folic  Acid  ( A)', unit: 'เม็ด', type: 'common', monthlyQty: 12394, price: 0.5 },
];

const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];

const jitter = (value: number, pct = 0.08) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));
const money = (value: number) => Math.round(value * 100) / 100;

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function toCatalog({ code, name, unit, type }: DrugSeed): DrugCatalogItem {
  return { code, name, unit, type };
}

export function generateDrugBudgetReport(start: string, end: string): DrugBudgetReport {
  const months = daysBetween(start, end) / 30.4;
  const usage: (DrugItem & { type: DrugSeed['type'] })[] = DRUGS.map(d => {
    const qty = Math.max(1, jitter(d.monthlyQty * months));
    return { code: d.code, name: d.name, unit: d.unit, type: d.type, qty, value: money(qty * d.price) };
  });
  const top = (type: DrugSeed['type']) => usage.filter(u => u.type === type).sort((a, b) => b.qty - a.qty).map(({ type: _type, ...item }) => item);

  // ยาในรายการเป็นส่วนหนึ่งของทั้งหมด — ยอดรวมทั้งโรงพยาบาลมากกว่าผลรวมในตาราง
  // (ทั้งปีจริง ~19.9 ล้านบาท / ~10.2 ล้านชิ้น เทียบกับยา 15 รายการแรก ~7.1 ล้านบาท / ~6.7 ล้านชิ้น)
  const herbValue = money(usage.filter(u => u.type === 'herb').reduce((sum, u) => sum + u.value, 0) * 1.1);
  const commonValue = money(usage.filter(u => u.type === 'common').reduce((sum, u) => sum + u.value, 0) * 2.77);
  const qty = Math.round(usage.reduce((sum, u) => sum + u.qty, 0) * 1.51);

  return {
    start,
    end,
    totals: { qty, value: money(herbValue + commonValue), herbValue, commonValue },
    topDrugs: { herb: top('herb'), common: top('common') },
    catalog: DRUGS.map(toCatalog).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** null = ไม่พบรหัสยา */
export function generateDrugCompare(code: string, end: string): DrugCompare | null {
  const drug = DRUGS.find(d => d.code === code);
  if (!drug) return null;

  const endDate = new Date(`${end}T00:00:00`);
  const fyStartYear = endDate.getMonth() >= 9 ? endDate.getFullYear() : endDate.getFullYear() - 1;
  const currentFy = fyStartYear + 1 + 543;
  const currentFyMonth = (endDate.getMonth() + 3) % 12;
  // 3 ปีงบล่าสุดนับถึงปีของวันสิ้นสุด — ปริมาณรายเดือนจริง (drug-history.ts) · ปีที่ไม่มีข้อมูล = 0
  const years = [currentFy - 2, currentFy - 1, currentFy];
  const history = DRUG_FY_MONTHLY[drug.code] ?? {};
  // เดือนปัจจุบันของปีล่าสุดนับถึงวันสิ้นสุด เดือนหลังจากนั้นยังไม่เกิดขึ้น
  const monthProgress = endDate.getDate() / new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
  const monthlyQty = years.map((fy, yi) => MONTHS.map((_, mi) => {
    const isCurrentYear = yi === years.length - 1;
    if (isCurrentYear && mi > currentFyMonth) return 0;
    const qty = history[fy]?.[mi] ?? 0;
    return isCurrentYear && mi === currentFyMonth ? Math.round(qty * monthProgress) : qty;
  }));

  return {
    drug: toCatalog(drug),
    years: monthlyQty.map((months, yi) => {
      const qty = months.reduce((a, b) => a + b, 0);
      return { fiscalYear: years[yi], qty, value: money(qty * drug.price) };
    }),
    monthly: { labels: MONTHS, qty: monthlyQty },
  };
}
