// ตรวจทุกตัวสร้างข้อมูลจำลอง: ไม่มี error / NaN / Infinity / ค่าติดลบ ในหลายช่วงวันที่
// รัน: npx tsx scripts/mock-data/smoke.ts
import { generateDashboardSnapshot } from '../../src/services/dashboard-mock';
import { generateOpdReport, generateIpdReport, generateErReport } from '../../src/services/reports-mock';
import { generateDentalReport } from '../../src/services/dental-mock';
import { generatePhysioReport } from '../../src/services/physio-mock';
import { generateTelemedicineReport } from '../../src/services/telemedicine-mock';
import { generateTelepharmacyReport } from '../../src/services/telepharmacy-mock';
import { generatePostalDrugReport } from '../../src/services/postal-drug-mock';
import { generateThaiMedicineReport } from '../../src/services/thai-medicine-mock';
import { generateDrugBudgetReport } from '../../src/services/drug-budget-mock';
import { generateReadmitReport } from '../../src/services/readmit-mock';
import { generateReferralReport } from '../../src/services/referral-mock';
import { generateQueueReport } from '../../src/services/queue-mock';
import { generateIcd10Summary } from '../../src/services/icd10-mock';

const RANGES: [string, string][] = [
  ['2026-10-14', '2026-10-14'], // วันนี้
  ['2026-10-01', '2026-10-13'], // ปีงบ 70
  ['2025-10-01', '2026-09-30'], // ปีงบ 69
  ['2026-09-01', '2026-09-30'], // ก.ย. 69
  ['2024-10-01', '2025-09-30'], // ปีงบ 68 (ก่อนข้อมูลรายวัน)
  ['2023-03-05', '2023-03-11'], // ช่วงเก่า
];

type Gen = [string, (s: string, e: string) => unknown];
const GENS: Gen[] = [
  ['dashboard', (s, e) => generateDashboardSnapshot('today', s, e)],
  ['opd', generateOpdReport], ['ipd', generateIpdReport], ['er', generateErReport],
  ['queue', generateQueueReport], ['icd10', generateIcd10Summary],
  ['dental', generateDentalReport], ['physio', generatePhysioReport],
  ['telemedicine', generateTelemedicineReport], ['telepharmacy', generateTelepharmacyReport],
  ['postal', generatePostalDrugReport], ['thai', generateThaiMedicineReport],
  ['drug', generateDrugBudgetReport],
  ...['all', '02', '07'].map(w => [`readmit:${w}`, (s: string, e: string) => generateReadmitReport(s, e, w)] as Gen),
  ...['all', 'opd', 'er', 'ipd'].map(p => [`refer:${p}`, (s: string, e: string) => generateReferralReport(s, e, p)] as Gen),
];

// ค่าที่ติดลบได้ตามความหมาย (ส่วนต่าง / เปลี่ยนแปลง)
const SIGNED = /change|diff|delta|trend|growth|pct$|vs/i;
function scan(v: unknown, path: string, bad: string[]) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) bad.push(`${path}=${v}`);
    else if (v < 0 && !SIGNED.test(path)) bad.push(`${path}=${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`, bad));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, path ? `${path}.${k}` : k, bad);
}

(async () => {
  let fail = 0;
  for (const [name, gen] of GENS) {
    for (const [s, e] of RANGES) {
      try {
        const out = await gen(s, e);
        const bad: string[] = [];
        scan(out, '', bad);
        if (bad.length) { fail++; console.log(`✗ ${name} ${s}..${e}: ${bad.slice(0, 5).join(' · ')}${bad.length > 5 ? ` (+${bad.length - 5})` : ''}`); }
      } catch (err) {
        fail++; console.log(`✗ ${name} ${s}..${e}: ${(err as Error).message}`);
      }
    }
  }
  console.log(fail ? `${fail} ปัญหา` : `ผ่านทั้งหมด ${GENS.length} ตัว × ${RANGES.length} ช่วง`);
})();
