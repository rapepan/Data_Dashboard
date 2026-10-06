/**
 * 10 อันดับโรค (วินิจฉัยหลัก) — ข้อมูลจำลองที่อิงสัดส่วนจริงจาก HOSxP รพ.บางเสาธง (ตรวจซ้ำ 06/10/2569)
 * ใช้ร่วมกันทั้งหน้า OPD และหน้าแรก (Dashboard) ให้ตัวเลขตรงกัน
 */
/** ชื่อโรคภาษาไทย — icd101.tname (โรคที่ในฐานไม่มีชื่อไทย แสดงชื่ออังกฤษ) */
const THAI: Record<string, string> = {
  Z480: 'ล้างแผล',
  I10: 'โรคความดันโลหิตสูง',
  E119: 'เบาหวานแบบที่ 2 ชนิดที่ไม่ต้องพึ่งอินสุลิน  ไม่มีภาวะแทรกซ้อน',
  J00: 'เยื่อบุจมูกและลำคออักเสบ (ไข้หวัด)',
  K021: 'ฟันผุที่ลุกลามถึงเนื้อฟัน',
  Z012: 'การตรวจฟัน',
  R42: 'เวียนศีรษะ',
  A099: 'กระเพาะอาหารกับลำไส้อักเสบ และลำไส้ใหญ่อักเสบจากสาเหตุที่ไม่ระบุรายละเอียด',
  J189: 'ปอดบวม',
  I500: 'หัวใจล้มเหลวแบบมีน้ำคั่ง',
  I639: 'เนื้อสมองตายเพราะขาดเลือด ไม่ระบุรายละเอียด',
  E789: 'ความผิดปกติของเมตะบอลิซึมของไลโปโปรตีน  ไม่ระบุรายละเอียด',
  N390: 'ทางเดินปัสสาวะอักเสบ',
  K922: 'เลือดออกในช่องท้องส่วนบน',
  N179: 'ไตวายเฉียบพลัน ไม่ระบุรายละเอียด',
};

const jitter = (value: number, pct = 0.08) => Math.max(0, Math.round(value * (1 + (Math.random() * 2 - 1) * pct)));

/**
 * OPD: ovstdiag diagtype=1 — [รหัส, ชื่อโรค (icd101), ครั้ง/เดือน, ราย/ครั้ง ช่วง 1 เดือน, ราย/ครั้ง ช่วง 1 ปี]
 * ครั้ง/เดือน = ย้อนหลัง 12 เดือน ÷ 12 · สัดส่วนราย/ครั้ง จาก 30 วันล่าสุด และ 12 เดือน
 */
const OPD: [string, string, number, number, number][] = [
  ['Z480', 'Attention to surgical dressings and sutures', 555, 0.22, 0.19],
  ['I10', 'Essential (primary) hypertension', 351, 0.95, 0.43],
  ['E119', 'Type 2 diabetes mellitus Without complications', 293, 0.99, 0.36],
  ['J00', 'Acute nasopharyngitis [common cold]', 200, 0.94, 0.78],
  ['K021', 'Caries of dentine', 102, 0.91, 0.68],
  ['Z012', 'Dental examination', 101, 0.96, 0.79],
  ['R42', 'Dizziness and giddiness', 82, 0.9, 0.73],
  ['M6261', 'Shoulder region', 76, 0.69, 0.24],
  ['Z113', 'Special screening examination for infections with a predominantly sexual mode of transmission', 71, 0.64, 0.55],
  ['E789', 'Disorder of lipoprotein metabolism,unspecified', 69, 0.95, 0.5],
];

/** IPD: iptdiag diagtype=1 ย้อนหลัง 12 เดือน (admit ทั้งปี ~2,018 ครั้ง) — [รหัส, ชื่อโรค, admit/ปี] */
const IPD: [string, string, number][] = [
  ['E119', 'Type 2 diabetes mellitus Without complications', 100],
  ['A099', 'Gastroenteritis and colitis of unspecified origin', 91],
  ['J189', 'Pneumonia, unspecified', 86],
  ['I500', 'Congestive heart failure', 55],
  ['I639', 'Cerebral infarction,unspecified', 55],
  ['N390', 'Urinary tract infection, site not specified', 52],
  ['L031', 'Cellulitis of other parts of limb', 50],
  ['J441', 'Chronic obstructive pulmonary disease with acute exacerbation, unspecified', 50],
  ['K922', 'Gastrointestinal haemorrhage, unspecified', 39],
  ['N179', 'Acute renal failure, unspecified', 36],
];

/** scale = จำนวนวันที่เลือก ÷ 30 */
export function opdTopDiseases(scale: number) {
  // สัดส่วนราย/ครั้ง ไล่จากค่าจริงช่วง 1 เดือน ไปหาค่าจริงช่วง 1 ปี ตามความยาวช่วง (ยิ่งยาว คนมาซ้ำยิ่งมาก)
  const t = Math.min(1, Math.max(0, (scale - 1) / 11));
  return OPD
    .map(([code, name, visits, monthRatio, yearRatio]) => {
      const v = jitter(visits * scale);
      return { code, name, nameTh: THAI[code], visits: v, patients: Math.min(v, Math.round(v * (monthRatio + (yearRatio - monthRatio) * t))) };
    })
    .sort((a, b) => b.visits - a.visits);
}

/** admit ส่วนใหญ่ 1 คน = 1 ครั้ง ในช่วงสั้น — ช่วงยาวมีคนกลับมานอนซ้ำเล็กน้อย */
export function ipdTopDiseases(scale: number) {
  return IPD
    .map(([code, name, perYear]) => {
      const admits = jitter((perYear / 12) * scale, 0.2);
      return { code, name, nameTh: THAI[code], admits, patients: Math.round(admits * (scale > 3 ? 0.9 : 1)) };
    })
    .sort((a, b) => b.admits - a.admits);
}
