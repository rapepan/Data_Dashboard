export interface Icd10Item {
  code: string;
  name: string;
  /** ชื่อภาษาไทย (icd101.tname) — บางรหัสไม่มี */
  nameTh?: string;
  visits: number;
  patients: number;
}

export interface Icd10Summary {
  start: string;
  end: string;
  generatedAt: string;
  totals: {
    codes: number;
    patients: number;
    visits: number;
  };
  items: Icd10Item[];
}
