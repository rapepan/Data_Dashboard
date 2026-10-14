import { opdDiseaseList } from './top-diseases-mock';
import { rangeIcdCodes, rangePersons, rangeTotal } from './daily';
import type { Icd10Summary } from '../types/icd10.types';

/**
 * ข้อมูลจำลองหน้า "ค้นหาผู้ป่วยตาม ICD-10" — อิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน)
 * 40 อันดับการวินิจฉัยหลัก OPD (ovstdiag diagtype=1) · ชื่อโรคตาม icd101 (name / tname)
 * ทั้งปี: 2,380 รหัส · 75,788 ครั้ง · 19,995 คน
 * เมื่อต่อจริงให้แทนที่ด้วยการ query ovstdiag ตามช่วงวันที่ โดยคง response shape เดิม
 */



export function generateIcd10Summary(start: string, end: string): Icd10Summary {
  // ยอดของช่วง = ยอดจริงรายวัน (daily-data.ts: ovstdiag วินิจฉัยหลัก)
  const realVisits = rangeTotal('icd', start, end);
  // รายการโรค 40 อันดับ = ยอดจริงรายเดือนต่อรหัส (ชุดเดียวกับอันดับโรคหน้า OPD / หน้าแรก)
  const items = opdDiseaseList(start, end).slice(0, 40);

  return {
    start,
    end,
    generatedAt: new Date().toISOString(),
    totals: {
      // รหัสไม่ซ้ำ / คนไม่ซ้ำ = ยอดต่อวันจริง × อัตราไม่ซ้ำตามความยาวช่วง (daily.ts)
      codes: Math.max(items.length, rangeIcdCodes(start, end)),
      visits: realVisits,
      patients: rangePersons('icd', start, end),
    },
    items,
  };
}
