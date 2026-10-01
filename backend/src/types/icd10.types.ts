export interface Icd10Item {
  /** รหัสโรค (pdx) */
  code: string;
  name: string;
  /** ชื่อภาษาไทย (icd101.tname) — บางรหัสไม่มี */
  nameTh?: string;
  /** จำนวนครั้งรับบริการ (VN/AN) */
  visits: number;
  /** จำนวนคน (HN ไม่ซ้ำ) */
  patients: number;
}

export interface Icd10Summary {
  start: string;
  end: string;
  generatedAt: string;
  totals: {
    /** จำนวนรหัสโรคที่พบในช่วงเวลา */
    codes: number;
    /** ผู้รับบริการรวม (HN ไม่ซ้ำ ทุกโรค) */
    patients: number;
    /** จำนวนครั้งรับบริการรวม (OPD + IPD) */
    visits: number;
  };
  /** อันดับโรค เรียงตามจำนวนครั้งมากไปน้อย (สูงสุด 50 อันดับ) */
  items: Icd10Item[];
}
