import { CACHE_CONFIG, reportCache, type ReportMeta } from './report-cache';
import { generateDashboardSnapshot } from '../services/dashboard-mock';
import { generateOpdReport, generateIpdReport, generateErReport } from '../services/reports-mock';
import { generateOpdAppointments } from '../services/opd-appointments-mock';
import { generateDentalReport } from '../services/dental-mock';
import { generatePhysioReport } from '../services/physio-mock';
import { generateTelemedicineReport } from '../services/telemedicine-mock';
import { generatePostalDrugReport } from '../services/postal-drug-mock';
import { generateThaiMedicineReport } from '../services/thai-medicine-mock';
import { generateDrugBudgetReport, generateDrugCompare } from '../services/drug-budget-mock';
import { generateReadmitReport } from '../services/readmit-mock';
import { generateReferralReport } from '../services/referral-mock';
import { generateQueueReport } from '../services/queue-mock';
import { generateIcd10Summary } from '../services/icd10-mock';

type Params = Record<string, string>;

export interface ReportDef {
  name: string;
  label: string;
  source: ReportMeta['source'];
  load: (p: Params) => unknown | Promise<unknown>;
  prewarm?: () => Params[];
  version?: number;
}

const TZ = 'Asia/Bangkok';
export function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}
function monthStartIso() {
  return `${todayIso().slice(0, 8)}01`;
}

function fiscalStartIso() {
  const [y, m] = todayIso().split('-').map(Number);
  return `${m >= 10 ? y : y - 1}-10-01`;
}

function defaultRanges(extra: Params = {}): Params[] {
  const end = todayIso();
  return [{ start: monthStartIso(), end, ...extra }, { start: fiscalStartIso(), end, ...extra }];
}

const MOCK_DELAY_MS = Number(process.env.MOCK_DELAY_MS || 0);
const mock = (fn: (p: Params) => unknown) => async (p: Params) => {
  if (MOCK_DELAY_MS > 0) await new Promise(resolve => setTimeout(resolve, MOCK_DELAY_MS));
  return fn(p);
};

const byRange = (fn: (start: string, end: string) => unknown) => mock(p => fn(p.start, p.end));

export const REPORTS: ReportDef[] = [
  {
    name: 'dashboard', label: 'หน้าแรก (Dashboard)', source: 'mock',
    version: 13, load: mock(p => generateDashboardSnapshot('today', p.start, p.end)),
    prewarm: () => defaultRanges().map((p, i) => ({ ...p, mode: i === 0 ? 'range' : 'fiscal' })),
  },
  { name: 'opd', label: 'ผู้ป่วยนอก (OPD)', source: 'mock', version: 14, load: byRange(generateOpdReport), prewarm: () => defaultRanges() },
  // วันที่อยู่ใน key → ข้ามวันแล้วได้ชุดใหม่เอง, ไม่มี end → อายุแบบ "วันนี้" (30 นาที)
  { name: 'opd-appointments', label: 'ผู้ป่วยนอก · นัดหมายรายคลินิก (วันนี้/พรุ่งนี้/ย้อนหลัง)', source: 'mock', version: 9, load: mock(p => generateOpdAppointments(p.date)), prewarm: () => [{ date: todayIso() }] },
  { name: 'ipd', label: 'ผู้ป่วยใน (IPD)', source: 'mock', version: 8, load: byRange(generateIpdReport), prewarm: () => defaultRanges() },
  { name: 'er', label: 'อุบัติเหตุ & ฉุกเฉิน (ER)', source: 'mock', version: 8, load: byRange(generateErReport), prewarm: () => defaultRanges() },
  { name: 'queue', label: 'ระยะเวลารอคอยคิว', source: 'mock', version: 7, load: byRange(generateQueueReport), prewarm: () => defaultRanges() },
  { name: 'icd10', label: 'ค้นหาผู้ป่วยตามโรค (ICD-10)', source: 'mock', version: 7, load: byRange(generateIcd10Summary), prewarm: () => defaultRanges() },
  { name: 'dental', label: 'ทันตกรรม', source: 'mock', version: 8, load: byRange(generateDentalReport), prewarm: () => defaultRanges() },
  { name: 'physio', label: 'กายภาพบำบัด', source: 'mock', version: 8, load: byRange(generatePhysioReport), prewarm: () => defaultRanges() },
  { name: 'telemedicine', label: 'การแพทย์ทางไกล', source: 'mock', version: 8, load: byRange(generateTelemedicineReport), prewarm: () => defaultRanges() },
  { name: 'postal-drug', label: 'การส่งยาทางไปรษณีย์', source: 'mock', version: 5, load: byRange(generatePostalDrugReport), prewarm: () => defaultRanges() },
  { name: 'thai-medicine', label: 'แพทย์แผนไทย / แผนจีน', source: 'mock', version: 10, load: byRange(generateThaiMedicineReport), prewarm: () => defaultRanges() },
  { name: 'drug-budget', label: 'ปริมาณการใช้ยา', source: 'mock', version: 9, load: byRange(generateDrugBudgetReport), prewarm: () => defaultRanges() },
  { name: 'drug-compare', label: 'ปริมาณการใช้ยา · เปรียบเทียบรายการยา', source: 'mock', version: 9, load: mock(p => generateDrugCompare(p.code, p.end)) },
  { name: 'readmit', label: 'Re-admit (28 วัน)', source: 'mock', version: 8, load: mock(p => generateReadmitReport(p.start, p.end, p.ward)), prewarm: () => defaultRanges({ ward: 'all' }) },
  { name: 'referral', label: 'ข้อมูลการส่งต่อ (Refer)', source: 'mock', version: 8, load: mock(p => generateReferralReport(p.start, p.end, p.point)), prewarm: () => defaultRanges({ point: 'all' }) },
];

const byName = new Map(REPORTS.map(r => [r.name, r]));

function ttlFor(p: Params) {
  // รายงานช่วงวันที่ดูที่ end · รายงานวันเดียว (เช่น นัดหมาย) ดูที่ date
  const last = p.end ?? p.date;
  const includesToday = !last || last >= todayIso();
  return includesToday ? CACHE_CONFIG.ttlTodayMinutes * 60_000 : CACHE_CONFIG.ttlPastHours * 3_600_000;
}

export function cacheKey(name: string, p: Params) {
  const version = byName.get(name)?.version ?? 1;
  return `${name}@v${version}?${Object.keys(p).sort().map(k => `${k}=${p[k]}`).join('&')}`;
}

export async function getReport<T>(name: string, params: Params, options: { force?: boolean; origin?: 'user' | 'prewarm' } = {}) {
  const def = byName.get(name);
  if (!def) throw new Error(`ไม่รู้จักรายงาน ${name}`);
  const { data, meta } = await reportCache.get<T>({
    report: name,
    key: cacheKey(name, params),
    ttlMs: ttlFor(params),
    source: def.source,
    loader: () => def.load(params),
    force: options.force,
    origin: options.origin,
  });

  if (data === null || data === undefined) return null;
  return { ...(data as object), meta } as T & { meta: ReportMeta };
}
