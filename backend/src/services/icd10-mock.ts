import type { Icd10Summary } from '../types/icd10.types';

/**
 * ข้อมูลจำลองหน้า "ค้นหาผู้ป่วยตาม ICD-10" — อิง HOSxP รพ.บางเสาธง (ตรวจเมื่อ 30/09/2569, ย้อนหลัง 12 เดือน)
 * 40 อันดับการวินิจฉัยหลัก OPD (ovstdiag diagtype=1) · ชื่อโรคตาม icd101 (name / tname)
 * ทั้งปี: 2,380 รหัส · 75,788 ครั้ง · 19,995 คน
 * เมื่อต่อจริงให้แทนที่ด้วยการ query ovstdiag ตามช่วงวันที่ โดยคง response shape เดิม
 */
/** [รหัส, ชื่อ (icd101.name), ชื่อไทย (icd101.tname), ครั้ง/ปี, คน/ปี] */
const DISEASES: [string, string, string | null, number, number][] = [
  ['Z480', 'Attention to surgical dressings and sutures', 'ล้างแผล', 6584, 1267],
  ['I10', 'Essential (primary) hypertension', 'โรคความดันโลหิตสูง', 4215, 1818],
  ['E119', 'Type 2 diabetes mellitus Without complications', 'เบาหวานแบบที่ 2 ชนิดที่ไม่ต้องพึ่งอินสุลิน  ไม่มีภาวะแทรกซ้อน', 3525, 1254],
  ['J00', 'Acute nasopharyngitis [common cold]', 'เยื่อบุจมูกและลำคออักเสบ (ไข้หวัด)', 2397, 1880],
  ['K021', 'Caries of dentine', 'ฟันผุที่ลุกลามถึงเนื้อฟัน', 1233, 833],
  ['Z012', 'Dental examination', 'การตรวจฟัน', 1220, 969],
  ['R42', 'Dizziness and giddiness', 'เวียนศีรษะ', 986, 724],
  ['M6261', 'Shoulder region', null, 921, 225],
  ['Z113', 'Special screening examination for infections with a predominantly sexual mode of transmission', null, 857, 474],
  ['Z098', 'Follow-up examination after other treatment for other conditions', null, 830, 386],
  ['Z108', 'Routine general health check-up of other defined subpopulations', null, 828, 807],
  ['E789', 'Disorder of lipoprotein metabolism,unspecified', 'ความผิดปกติของเมตะบอลิซึมของไลโปโปรตีน  ไม่ระบุรายละเอียด', 826, 417],
  ['M179', 'Gonarthrosis, unspecified', 'ข้อเข่าเสื่อม   ที่มิได้ระบุรายละเอียด', 816, 206],
  ['M5455', 'Low back pain : Thoracolumbar region', 'บริเวณทรวงอกร่วมเอว', 813, 190],
  ['A099', 'Gastroenteritis and colitis of unspecified origin', 'กระเพาะอาหารกับลำไส้อักเสบ และลำไส้ใหญ่อักเสบจากสาเหตุที่ไม่ระบุรายละเอียด', 811, 719],
  ['Z503', 'Drug rehabilitation', 'ปัจจัยต่อสุขภาพ,รับบริการ', 788, 201],
  ['Z242', 'Need for immunization against rabies', 'รับวัคซีนโรคกลัวน้ำ (พิษสุนัขบ้า)', 776, 464],
  ['K041', 'Necrosis of pulp', 'โรคช่องปากและฟัน', 755, 604],
  ['Z251', 'Need for immunization against influenza', 'รับวัคซีนโรคไข้หวัดใหญ่', 728, 727],
  ['I64', 'Stroke,not specified as haemorrhage or infarction', 'โรคอัมพาตฉับพลัน ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 728, 177],
  ['B24', 'Unspecified human immunodeficiency virus(HIV) disease', 'โรคภูมิคุ้มกันบกพร่องจากไวรัสที่มิได้ระบุรายละเอียด', 723, 184],
  ['M6260', 'Multiple sites', null, 665, 421],
  ['J069', 'Acute upper respiratory incfection, unspecified', 'URI-โรคติดเชื้อทางเดินหายใจ', 637, 580],
  ['K051', 'Chronic gingivitis', 'โรคช่องปากและฟัน', 631, 612],
  ['M170', 'Primary gonarthrosis,  bilateral', 'ข้อเข่าเสื่อมปฐมภูมิ  ทั้งสองข้าง', 616, 221],
  ['M6266', 'ขาท่อนล่าง', null, 614, 157],
  ['K30', 'Dyspepsia', 'อาหารไม่ย่อย', 588, 474],
  ['I694', 'Sequelae of stroke, not specified as haemorrhage or infarction', 'ผลที่ตามของโรคลมอัมพาต ไม่ระบุว่าเกิดจากเลือดออกหรือเนื้อสมองตายเพราะขาดเลือด', 582, 191],
  ['F1520', 'Other stimulants including caffeine, Dependence sydrome, Currently abstinent', null, 541, 166],
  ['K081', 'Loss of teeth due to accident, extraction or local periodontal disease', 'โรคช่องปากและฟัน', 534, 165],
  ['Z111', 'Special screening examination for respiratory tuberculosis', null, 521, 455],
  ['I259', 'Chronic ischaemic heart disease, unspecified', 'โรคหัวใจขาดเลือดเรื้อรัง ไม่ระบุรายละเอียด', 514, 172],
  ['M6269', 'มิได้ระบุรายละเอียด', null, 467, 327],
  ['M4796', 'บรเวณเอว', null, 445, 87],
  ['M750', 'Adhesive capsulitis of shoulder', 'ถุงหุ้มข้อไหล่อีกเสบยึดติด', 422, 109],
  ['Z000', 'General medical examination', 'การตรวจร่างกายทั่วไป', 413, 344],
  ['J459', 'Asthma, unspecified', 'โรคหอบหืดไม่ระบุรายละเอียด', 411, 178],
  ['Z348', 'Supervision of other normal pregnacy', 'การดูแลการตั้งครรภ์ปกติ ครรภ์อื่น', 374, 153],
  ['Z308', 'Other contraceptive mangement', 'การให้บริการคุมกำเนิดแบบอื่น', 370, 223],
  ['K053', 'Chronic periodontitis', 'โรคช่องปากและฟัน', 365, 310],
];
/** สัดส่วนคน/ครั้ง ในช่วง 1 เดือน (จริง 30 วันล่าสุด) — รหัสอื่นประมาณจากค่ารายปี */
const MONTH_RATIO: Record<string, number> = { Z480: 0.22, I10: 0.95, E119: 0.99, J00: 0.94, K021: 0.91, Z012: 0.96, R42: 0.9, M6261: 0.69, Z113: 0.64, Z098: 0.57 };

const jitter = (value: number, pct = 0.08) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export function generateIcd10Summary(start: string, end: string): Icd10Summary {
  const scale = daysBetween(start, end) / 365;
  // ช่วงยาวขึ้น คนเดิมกลับมาซ้ำมากขึ้น → สัดส่วนคน/ครั้ง ไล่จากค่า 1 เดือน ไปหาค่า 1 ปี
  const t = Math.min(1, Math.max(0, (scale * 12 - 1) / 11));

  const items = DISEASES
    .map(([code, name, nameTh, visitsYear, patientsYear]) => {
      const visits = Math.max(1, jitter(visitsYear * scale));
      const yearRatio = patientsYear / visitsYear;
      const monthRatio = MONTH_RATIO[code] ?? Math.min(0.97, yearRatio * 2);
      const patients = Math.max(1, Math.min(visits, Math.round(visits * (monthRatio + (yearRatio - monthRatio) * t))));
      return { code, name, ...(nameTh ? { nameTh } : {}), visits, patients };
    })
    .sort((a, b) => b.visits - a.visits);

  return {
    start,
    end,
    generatedAt: new Date().toISOString(),
    totals: {
      // รหัสไม่ซ้ำเพิ่มช้ากว่าจำนวนวัน (จริง 30 วัน 854 · 90 วัน 1,410 · 1 ปี 2,380 → ยกกำลัง ~0.39)
      codes: Math.max(items.length, jitter(2380 * Math.pow(scale, 0.39), 0.05)),
      visits: jitter(75788 * scale, 0.05),
      // คนไม่ซ้ำเพิ่มช้ากว่าครั้ง (30 วันจริง ~3,977 คน / ทั้งปี ~19,995 คน)
      patients: jitter(19995 * Math.pow(scale, 0.65), 0.05),
    },
    items,
  };
}
