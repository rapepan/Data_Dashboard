/**
 * รูปแบบข้อมูลหน้า OPD / IPD / ER / ทันตกรรม / กายภาพบำบัด / การแพทย์ทางไกล / แพทย์แผนไทย / ปริมาณการใช้ยา / Re-admit / Refer / ระยะเวลารอคอย — ต้องตรงกับ backend/src/types/reports.types.ts เสมอ
 * ตอนนี้ข้อมูลมาจาก mock (backend/src/services/reports-mock.ts) เมื่อต่อ HOSxP ให้คง shape นี้ไว้
 */

/** ตัวเลขพร้อมการเปลี่ยนแปลงเทียบช่วงก่อน */
export interface Metric {
  value: number;
  /** % เปลี่ยนแปลงเทียบช่วงก่อน (หรือค่าต่างสัมบูรณ์ถ้า changeIsAbsolute) */
  /** ไม่มีค่า = ไม่มีข้อมูลเทียบช่วงก่อน (ไม่แสดงป้าย) */
  change?: number;
  changeIsAbsolute?: boolean;
}

export interface LabelValue {
  label: string;
  value: number;
}

export type AlertStatus = 'critical' | 'warning' | 'ok';

/* ------------------------------- OPD ------------------------------- */
/** ข้อมูลกำกับที่แนบไปกับทุกรายงาน (จากที่พักผล — cache/report-cache.ts) */
export interface ReportMeta {
  /** เวลาที่ดึงข้อมูลชุดนี้ (ISO) */
  asOf: string;
  /** true = ดึงใหม่ไม่สำเร็จ กำลังแสดงข้อมูลชุดเก่า */
  stale: boolean;
  /** แหล่งข้อมูล: ข้อมูลจำลอง หรือ HOSxP จริง */
  source: 'mock' | 'hosxp';
}

/** รายงานที่ API ส่งออกไป = ข้อมูลรายงาน + meta */
export type WithMeta<T> = T & { meta: ReportMeta };

export interface OpdReport {
  start: string;
  end: string;
  kpis: {
    total: Metric;
    newPatients: Metric;
    oldPatients: Metric;
    /** นาที */
    avgWait: Metric;
    /** นาที */
    avgDoctor: Metric;
    /** คะแนนเต็ม 5 */
    satisfaction: Metric;
  };
  byHour: { labels: string[]; total: number[]; walkin: number[]; appointment: number[]; peakLabel: string; peakValue: number };
  /** 10 อันดับโรค (วินิจฉัยหลัก) — visits = ครั้ง, patients = ราย */
  topDiseases: { code: string; name: string; nameTh?: string; visits: number; patients: number }[];
  flow: LabelValue[];
  waitSteps: { step: string; avgMinutes: number; targetMinutes: number }[];
  appointment: { walkin: number; onTime: number; cancelled: number; noShow: number; onTimeRate: number; onTimeRateChange: number };
  satisfaction: { score: number; change: number; topics: LabelValue[] };
  peakHours: LabelValue[];
  alerts: { issue: string; value: string; target: string; status: AlertStatus }[];
}

/* ------------------------------- IPD ------------------------------- */
export interface IpdReport {
  start: string;
  end: string;
  kpis: {
    current: Metric;
    admissions: Metric;
    discharges: Metric;
    totalBeds: number;
    usedBeds: number;
    /** วัน */
    avgLos: Metric;
    /** % */
    readmission30: Metric;
  };
  trend: { labels: string[]; admissions: number[]; discharges: number[]; current: number[] };
  wards: { ward: string; beds: number; used: number }[];
  patientStatus: LabelValue[];
  losBuckets: LabelValue[];
  flow: LabelValue[];
  dischargePlanning: { items: LabelValue[]; avgTurnaroundHours: number; targetHours: number };
  waitingBed: { fromEr: number; fromOpd: number; avgWaitHours: number };
  profile: { byRight: LabelValue[]; byAge: LabelValue[]; topDiseases: LabelValue[] };
  alerts: { issue: string; ward: string; status: AlertStatus; action: string }[];
}

/* ------------------------------- ER -------------------------------- */
export interface ErReport {
  start: string;
  end: string;
  kpis: {
    total: Metric;
    emergency: Metric;
    /** นาที */
    avgWaitDoctor: Metric;
    admit: Metric;
    discharge: Metric;
    transfer: Metric;
    satisfaction: Metric;
  };
  byHour: { labels: string[]; triage1: number[]; triage2: number[]; triage3: number[]; triage45: number[]; peakLabel: string; peakValue: number; peakPct: number };
  triage: LabelValue[];
  stepTimes: { step: string; minutes: number; targetMinutes: number }[];
  flow: LabelValue[];
  disposition: LabelValue[];
  losBuckets: LabelValue[];
  resources: { label: string; used: number; total: number }[];
  topCauses: LabelValue[];
  alerts: { issue: string; status: AlertStatus }[];
}

/* ----------------------------- ทันตกรรม ----------------------------- */
/** ยอดผู้ป่วย + จำนวนหัตถการแยก 5 ประเภท (กลุ่มหัตถการตาม dttm_group) */
export interface DentalBreakdown {
  /** ผู้ป่วย (ราย) */
  patients: number;
  /** จำนวนครั้งแยกประเภท — ลำดับตาม DentalReport.categories เสมอ */
  counts: number[];
}

export interface DentalReport {
  start: string;
  end: string;
  /** ปีงบประมาณ (พ.ศ.) ของวันสิ้นสุด */
  fiscalYear: number;
  categories: string[];
  range: DentalBreakdown;
  /** ทั้งเดือนของวันสิ้นสุด */
  month: DentalBreakdown & { start: string; end: string };
  /** วันสิ้นสุด */
  day: DentalBreakdown & { date: string };
  /** สัดส่วนประเภทการรักษา ทั้งปีงบประมาณ */
  fiscalShare: number[];
  topProcedures: LabelValue[];
  /** 12 เดือนของปีงบประมาณ (ต.ค. – ก.ย.) แยกประเภท */
  monthly: { labels: string[]; counts: number[][] };
}

/* ----------------------------- กายภาพบำบัด ----------------------------- */
export interface PhysioCount {
  /** คน (HN ไม่ซ้ำ) */
  persons: number;
  /** ครั้ง */
  visits: number;
}

/** ยอดรวม + แยกกลุ่ม (ลำดับตาม categories ของรายงาน) */
export interface CountBreakdown {
  total: PhysioCount;
  categories: PhysioCount[];
}

/** + แยก IPD / OPD */
export interface PhysioBreakdown extends CountBreakdown {
  ipd: PhysioCount;
  opd: PhysioCount;
}

export interface RankedItem {
  code: string;
  name: string;
  visits: number;
  /** ไม่มีสำหรับหัตถการ */
  patients?: number;
}

/** จำนวนครั้งแยกตามสิทธิ์ (ลำดับตาม PhysioReport.rights) ในเวลา / นอกเวลาราชการ */
export interface RightsByTime {
  inHours: number[];
  afterHours: number[];
}

/** ค่ารักษากายภาพบำบัดตามสิทธิ์ — ยอดรวมเท่านั้น (ไม่มีข้อมูลรายคน) */
export interface PhysioRightRevenue {
  name: string;
  /** pttype */
  code: string;
  /** claim = เบิกได้ · selfpay = เก็บเงิน (ชื่อสิทธิ์มี "ชำระเงินเอง" หรือ A1 / A2 / B4) */
  group: 'claim' | 'selfpay';
  visits: number;
  amount: number;
}

export interface PhysioMoney {
  visits: number;
  amount: number;
}

export interface PhysioRevenue {
  /** ช่วงที่เลือก */
  opd: { claim: PhysioMoney; selfpay: PhysioMoney; rights: PhysioRightRevenue[] };
  ipd: { claim: PhysioMoney; selfpay: PhysioMoney; rights: PhysioRightRevenue[] };
  /** ผู้ป่วยนอก 12 เดือนของปีงบประมาณ */
  monthly: { labels: string[]; claim: number[]; selfpay: number[] };
}

/** นัดหมายคลินิกกายภาพบำบัด — นับจำนวนครั้งเท่านั้น (ไม่แสดงรายชื่อผู้ป่วย) */
export interface PhysioAppointments {
  /** ช่วงที่เลือก */
  total: number;
  came: number;
  noShow: number;
  /** นัดวันนี้ที่ยังไม่มา (ยังไม่ถึงเวลา) */
  pendingToday: number;
  /** มารับบริการโดยไม่มีนัดวันนั้น */
  walkIn: number;
  /** นัดล่วงหน้า 30 วันถัดจากวันสุดท้ายของช่วง */
  upcoming30: number;
  /** 12 เดือนของปีงบประมาณ */
  monthly: { labels: string[]; came: number[]; noShow: number[]; walkIn: number[] };
  /** จันทร์–ศุกร์ */
  weekday: { labels: string[]; values: number[] };
}

export interface PhysioReport {
  start: string;
  end: string;
  fiscalYear: number;
  categories: string[];
  range: PhysioBreakdown;
  month: PhysioBreakdown & { start: string; end: string };
  day: PhysioBreakdown & { date: string };
  /** เฉพาะผู้ป่วยใน */
  ipdOnly: { range: PhysioBreakdown; month: PhysioBreakdown; day: PhysioBreakdown };
  /** จำนวนครั้งแยกหอผู้ป่วย (ผู้ป่วยใน) */
  wards: LabelValue[];
  /** 12 เดือนของปีงบประมาณ */
  monthly: { labels: string[]; ipd: number[]; opd: number[] };
  topDiseases: { opd: RankedItem[]; ipd: RankedItem[] };
  topProcedures: RankedItem[];
  rights: string[];
  byRight: { opd: RightsByTime; ipd: RightsByTime };
  /** รายเดือน: [สิทธิ์][เดือน] */
  monthlyByRight: { opd: { inHours: number[][]; afterHours: number[][] }; ipd: { inHours: number[][]; afterHours: number[][] } };
  revenue: PhysioRevenue;
  appointments: PhysioAppointments;
}

/* ---------------------------- การแพทย์ทางไกล ---------------------------- */
export interface TelemedicineReport {
  start: string;
  end: string;
  fiscalYear: number;
  /** วันสิ้นสุดที่เลือก */
  /** fromAppointment = มาตามนัด (oapp) · walkin = ไม่ได้นัด */
  day: { date: string; total: number; fromAppointment: number; walkin: number };
  /** เดือนของวันสิ้นสุด (นับถึงวันนั้น) */
  month: { total: number; rightVerifiedPct: number };
  /** ปีงบประมาณของวันสิ้นสุด (นับถึงวันนั้น) */
  fiscal: { total: number };
  /** ในช่วงที่เลือก */
  range: { total: number; workdays: number; avgPerDay: number };
  hourly: { labels: string[]; values: number[] };
  clinics: LabelValue[];
  /** 12 เดือนของปีงบประมาณ */
  monthly: { labels: string[]; values: number[] };
}

/* ----------------------------- แพทย์แผนไทย ----------------------------- */
export interface DrugItem {
  code: string;
  name: string;
  /** จำนวนชิ้น */
  qty: number;
  /** มูลค่ารวม = ราคาขาย (บาท) */
  value: number;
  /** ราคาทุนรวม (บาท) — มีเฉพาะหน้าปริมาณการใช้ยา */
  cost?: number;
  /** หน่วยนับ (เม็ด / แคปซูล / ขวด ...) */
  unit?: string;
}

/** ผู้ป่วยนอกของคลินิก (แพทย์แผนไทย / แพทย์แผนจีน) */
export interface ClinicOpd {
  /** รวมในช่วงวันที่ที่เลือก */
  range: PhysioCount;
  month: PhysioCount & { start: string; end: string };
  day: PhysioCount & { date: string };
  /** เฉลี่ยคน/วันทำการ ในช่วงที่เลือก */
  avgPerDay: number;
  /** รายวันในช่วงที่เลือก (เฉพาะวันทำการ) */
  daily: { dates: string[]; persons: number[] };
  /** รายเดือนของปีงบประมาณ */
  monthly: { labels: string[]; persons: number[] };
  /** โรคยอดนิยม (ICD-10) ในช่วงที่เลือก */
  topDiseases: RankedItem[];
}

export interface ThaiMedicineReport {
  start: string;
  end: string;
  fiscalYear: number;
  /** บริการแพทย์แผนไทย: นวด/ประคบสมุนไพร, อบสมุนไพร, ฟื้นฟูหลังคลอด, นวดเท้า-พอกเข่า (UCS 40+) */
  categories: string[];
  range: CountBreakdown;
  month: CountBreakdown & { start: string; end: string };
  day: CountBreakdown & { date: string };
  /** การใช้ยาทั้งปีงบประมาณ */
  drugs: { herb: { qty: number; value: number }; common: { qty: number; value: number } };
  /** จำนวนชิ้นรายเดือนของปีงบประมาณ */
  monthlyDrugs: { labels: string[]; herb: number[]; common: number[] };
  topDrugs: { herb: DrugItem[]; common: DrugItem[] };
  /** ผู้ป่วยนอกโรคทางแพทย์แผนไทย */
  thaiOpd: ClinicOpd;
  /** จำนวนครั้งแยกตามสิทธิการรักษา รายเดือนของปีงบประมาณ: values[สิทธิ์][เดือน] */
  rightsMonthly: { rights: string[]; labels: string[]; values: number[][] };
  /** แพทย์แผนจีน (ฝังเข็ม) — ผู้ป่วยนอก + ผู้ป่วย IMC (Intermediate Care) */
  chinese: ClinicOpd & { imc: { range: PhysioCount; month: PhysioCount; day: PhysioCount } };
}

/* ----------------------------- ปริมาณการใช้ยา ----------------------------- */
/** ตาม HOSxP drugitems.sks_product_category_id — modern = ยาแผนปัจจุบัน · thai = ยาแผนไทย · inhouse = ยาแผนปัจจุบันผลิตใช้เอง */
export type DrugType = 'modern' | 'thai' | 'inhouse';

export interface DrugCatalogItem {
  code: string;
  name: string;
  unit: string;
  type: DrugType;
  /** true = ในบัญชียาหลักแห่งชาติ · false = นอกบัญชี (drugitems.income 03 / 17) */
  ed: boolean;
}

/** ยอดรวมของกลุ่มยา */
export interface DrugGroupTotal {
  qty: number;
  /** ราคาขายรวม (บาท) */
  value: number;
  /** ราคาทุนรวม (บาท) */
  cost: number;
  /** จำนวนรายการยาที่มีการใช้ */
  items: number;
}

export interface DrugBudgetReport {
  start: string;
  end: string;
  totals: DrugGroupTotal & { byType: Record<DrugType, DrugGroupTotal>; ed: DrugGroupTotal; ned: DrugGroupTotal };
  /** ทุกรายการที่มีการใช้ในช่วงที่เลือก แยกตามชนิดยา (เรียงตามจำนวนชิ้น) */
  topDrugs: Record<DrugType, (DrugItem & { ed: boolean })[]>;
  /** รายการยาทั้งหมด (ใช้ค้นหาเพื่อเปรียบเทียบย้อนหลัง) */
  catalog: DrugCatalogItem[];
  /** ผู้ป่วยที่ได้รับยา / ไม่มียา (นับครั้งที่มารับบริการ + คนไม่ซ้ำ) */
  patients: DrugPatients;
  /** false = ผู้เยี่ยมชม — ราคาทุน / ราคาขายเป็น 0 (เห็นเฉพาะผู้ที่ login) */
  showMoney: boolean;
  /** รายเดือนของปีงบประมาณ (ต.ค.–ก.ย.) — visit ผู้ป่วยนอกที่รับยา / ไม่มียา · ราคาทุน / ขายรวม (บาท) */
  monthly: { fiscalYear: number; labels: string[]; withDrug: number[]; noDrug: number[]; cost: number[]; sale: number[] };
}

export interface DrugPatients {
  /** ผู้ป่วยนอก: visit ที่มีรายการยา / ไม่มีรายการยาเลย — คนที่มาหลายครั้งอาจอยู่ทั้งสองกลุ่ม */
  opd: { visits: number; withDrug: number; noDrug: number; personsWithDrug: number; personsNoDrug: number };
  /** ผู้ป่วยใน: admit ทั้งหมด / admit ที่มีรายการยา */
  ipd: { admits: number; withDrug: number };
}

/** เปรียบเทียบยา 1 รายการ ย้อนหลัง 3 ปีงบประมาณ (ปีล่าสุดอยู่ท้าย) */
export interface DrugCompare {
  drug: DrugCatalogItem;
  years: { fiscalYear: number; qty: number; value: number; cost: number }[];
  /** 12 เดือน (ต.ค. – ก.ย.) ต่อปี — ลำดับเดียวกับ years */
  monthly: { labels: string[]; qty: number[][] };
}

/* ----------------------------- Re-admit 28 วัน ----------------------------- */
export interface ReadmitReport {
  start: string;
  end: string;
  /** หอผู้ป่วยที่เลือก ('all' = ทุกหอผู้ป่วย) */
  ward: string;
  wards: { key: string; label: string }[];
  /** จำนวนครั้งที่กลับมานอนซ้ำภายใน 28 วัน */
  visits: number;
  /** จำนวนคน (HN ไม่ซ้ำ) */
  persons: number;
  /** อันดับโรค (pdx ของการ admit ครั้งหลัง) เรียงมากไปน้อย */
  items: { code: string; name: string; count: number }[];
}

/* ----------------------------- การส่งต่อ (Refer Out) ----------------------------- */
export interface ReferralReport {
  start: string;
  end: string;
  /** จุดส่งต่อที่เลือก ('all' = ทุกจุดส่งต่อ) */
  point: string;
  points: { key: string; label: string }[];
  /** จำนวนผู้ป่วยที่ส่งต่อในช่วงที่เลือก */
  total: number;
  /** วันสิ้นสุดที่เลือก */
  day: { date: string; count: number };
  days: number;
  avgPerDay: number;
  /** อันดับโรคที่ส่งต่อ เรียงมากไปน้อย */
  items: { code: string; name: string; count: number }[];
}

/* ----------------------------- ระยะเวลารอคอย (OPD) ----------------------------- */
/** เวลาเป็นนาที (ทศนิยมได้) — null = ไม่มีข้อมูลขั้นตอนนั้น */
export type Minutes = number | null;

export interface QueueReport {
  start: string;
  end: string;
  /** ชื่อขั้นตอน (ไม่รวม รวมเวลาทั้งหมด) */
  steps: string[];
  /** ค่าเฉลี่ยในช่วงที่เลือก ลำดับตาม steps */
  average: { steps: Minutes[]; total: number };
  /** รายวัน (เฉพาะวันที่มีข้อมูล) — values[ขั้นตอน][วัน] */
  daily: { dates: string[]; values: Minutes[][]; total: number[] };
  /** 12 เดือนย้อนหลัง นับถึงเดือนของวันสิ้นสุด (ล่าสุดก่อน) */
  monthly: { month: string; steps: Minutes[]; total: number }[];
}

/** นัดหมายผู้ป่วยนอกรายคลินิก (วันนี้ / พรุ่งนี้) — ไม่ขึ้นกับช่วงวันที่ที่เลือก */
export interface AppointmentDay {
  date: string;
  total: number;
  /** มารับบริการแล้ว (เฉพาะวันนี้) */
  arrived: number;
  clinics: { clinic: string; total: number; arrived: number }[];
}

export interface OpdAppointments {
  today: AppointmentDay;
  tomorrow: AppointmentDay;
}

/* --------------------------- การส่งยาทางไปรษณีย์ --------------------------- */
export interface PostalDrugReport {
  start: string;
  end: string;
  fiscalYear: number;
  /** ในช่วงที่เลือก: ครั้งที่ส่ง / จำนวนคน / จำนวนรายการยา */
  range: { total: number; patients: number; items: number };
  /** เดือนของวันสิ้นสุด (นับถึงวันนั้น) */
  month: { total: number; start: string; end: string };
  /** ปีงบประมาณของวันสิ้นสุด (นับถึงวันนั้น) */
  fiscal: { total: number };
  /** รายการยาเฉลี่ยต่อครั้ง */
  itemsPerDelivery: number;
  /** 12 เดือนของปีงบประมาณ */
  monthly: { labels: string[]; values: number[] };
  /** การแจกแจงของปีงบประมาณ */
  companies: LabelValue[];
  departments: LabelValue[];
  rights: LabelValue[];
  districts: LabelValue[];
  topDiseases: { code: string; name: string; visits: number }[];
}
