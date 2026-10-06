import type { DrugBudgetReport, DrugCatalogItem, DrugCompare, DrugGroupTotal, DrugItem, DrugPatients, DrugType } from '../types/reports.types';
import { rangeSum, SERIES } from './real-series';
import { fiscalSeries, fiscalStartYear } from './fiscal-series';
import { DRUG_COST, DRUG_SALE, DRUG_VISITS, DRUG_VISITS_WITH } from './fiscal-data';
import { DRUGS, type DrugSeed } from './drug-catalog';
import { DRUG_FY_MONTHLY } from './drug-history';

/**
 * ข้อมูลจำลองหน้าปริมาณการใช้ยา — ใช้ระหว่างยังไม่ดึงจาก HOSxP (opitemrece / drugitems)
 * รายการยา = ทุกตัวที่จ่ายจริงในรอบ 12 เดือน (drug-catalog.ts) จึงรวมยอดได้ตรง ไม่ต้องคูณขยายจากยาบางส่วน
 * เมื่อต่อจริงให้แทนที่ด้วย query โดยคง response shape เดิม (types/reports.types.ts)
 */
const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
const TYPES: DrugType[] = ['modern', 'thai', 'inhouse'];

const jitter = (value: number, pct = 0.08) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));
const money = (value: number) => Math.round(value * 100) / 100;

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function toCatalog({ code, name, unit, type, ed }: DrugSeed): DrugCatalogItem {
  return { code, name, unit, type, ed };
}

type Usage = DrugItem & { type: DrugType; ed: boolean };

function sum(items: Usage[]): DrugGroupTotal {
  return {
    qty: items.reduce((s, u) => s + u.qty, 0),
    value: money(items.reduce((s, u) => s + u.value, 0)),
    cost: money(items.reduce((s, u) => s + (u.cost ?? 0), 0)),
    items: items.length,
  };
}

export function generateDrugBudgetReport(start: string, end: string): DrugBudgetReport {
  const months = daysBetween(start, end) / 30.4;
  // ยาที่ใช้น้อย (เดือนละไม่กี่ชิ้น) ในช่วงสั้น ๆ อาจไม่มีการใช้เลย — เหมือนของจริง
  const usage: Usage[] = DRUGS.map(d => {
    const qty = jitter(d.monthlyQty * months);
    return { code: d.code, name: d.name, unit: d.unit, type: d.type, ed: d.ed, qty, value: money(qty * d.price), cost: money(qty * d.cost) };
  }).filter(u => u.qty > 0);

  const byType = Object.fromEntries(TYPES.map(t => [t, sum(usage.filter(u => u.type === t))])) as Record<DrugType, DrugGroupTotal>;
  const topDrugs = Object.fromEntries(TYPES.map(t => [
    t,
    usage.filter(u => u.type === t).sort((a, b) => b.qty - a.qty).map(({ type: _type, ...item }) => item),
  ])) as DrugBudgetReport['topDrugs'];

  return {
    start,
    end,
    totals: { ...sum(usage), byType, ed: sum(usage.filter(u => u.ed)), ned: sum(usage.filter(u => !u.ed)) },
    topDrugs,
    catalog: DRUGS.map(toCatalog).sort((a, b) => a.name.localeCompare(b.name)),
    patients: drugPatients(start, end),
    showMoney: true,
    monthly: drugMonthly(end),
  };
}

/** รายเดือนของปีงบที่วันสิ้นสุดอยู่ — ยอดจริงจาก fiscal-data.ts · เดือนที่ยังไม่ถึง = 0 */
function drugMonthly(end: string): DrugBudgetReport['monthly'] {
  const fy = fiscalStartYear(end);
  // สุ่มครั้งเดียวต่อเดือน แล้วแยก รับยา / ไม่มียา จากยอดเดียวกัน (ผลรวมตรงกันเสมอ)
  const visits = fiscalSeries(fy, DRUG_VISITS, end, 0.03);
  const share = fiscalSeries(fy, DRUG_VISITS_WITH, end, 0).map((w, i) => {
    const all = fiscalSeries(fy, DRUG_VISITS, end, 0)[i];
    return all ? w / all : 0;
  });
  const withDrug = visits.map((v, i) => Math.round(v * share[i]));
  return {
    fiscalYear: fy + 1 + 543,
    labels: MONTHS,
    withDrug,
    noDrug: visits.map((v, i) => v - withDrug[i]),
    cost: fiscalSeries(fy, DRUG_COST, end, 0.03),
    sale: fiscalSeries(fy, DRUG_SALE, end, 0.03),
  };
}

/**
 * ผู้ป่วยรับยา / ไม่มียา — อิง HOSxP รพ.บางเสาธง (ตรวจ 06/10/2569): visit ผู้ป่วยนอก (ovst) ที่มีรายการยาใน opitemrece
 * 12 เดือน: 75,763 visit · มียา 42,667 (56.3%) · ผู้ป่วยในมียาเกือบทุก admit (2,033 / 2,034)
 * คนไม่ซ้ำ ÷ ครั้ง ขึ้นกับความยาวช่วง (ช่วงยาว คนเดิมมาซ้ำ): [1 วัน, 30 วัน, 365 วัน]
 */
const PERSON_RATIO = { withDrug: [0.97, 0.837, 0.369], noDrug: [0.99, 0.547, 0.316] };
function ratioFor(days: number, [d1, d30, d365]: number[]) {
  // ประมาณแบบลอการิทึมของจำนวนวัน ระหว่างจุดจริง 1 / 30 / 365 วัน
  const x = Math.log(Math.max(1, days));
  if (x <= Math.log(30)) return d1 + (d30 - d1) * (x / Math.log(30));
  return d30 + (d365 - d30) * Math.min(1, (x - Math.log(30)) / (Math.log(365) - Math.log(30)));
}
function drugPatients(start: string, end: string): DrugPatients {
  const days = daysBetween(start, end);
  const visits = jitter(rangeSum(SERIES.opd, start, end) ?? 207 * days, 0.03);
  const withDrug = Math.round(visits * (0.56 + (Math.random() * 2 - 1) * 0.015));
  const noDrug = visits - withDrug;
  const admits = jitter(rangeSum(SERIES.admit, start, end) ?? 5.6 * days, 0.03);
  return {
    opd: {
      visits, withDrug, noDrug,
      personsWithDrug: Math.min(withDrug, Math.round(withDrug * ratioFor(days, PERSON_RATIO.withDrug))),
      personsNoDrug: Math.min(noDrug, Math.round(noDrug * ratioFor(days, PERSON_RATIO.noDrug))),
    },
    ipd: { admits, withDrug: admits },
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
      return { fiscalYear: years[yi], qty, value: money(qty * drug.price), cost: money(qty * drug.cost) };
    }),
    monthly: { labels: MONTHS, qty: monthlyQty },
  };
}
