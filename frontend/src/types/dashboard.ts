export type DashboardRange = 'today' | 'yesterday' | 'week';

export interface HourlySeries {
  labels: string[];
  opd: number[];
  ipd: number[];
  er: number[];
}

export interface PaymentMixItem {
  label: string;
  value: number;
  color: string;
}

export interface TopDiseaseItem {
  code: string;
  name: string;
  /** ชื่อภาษาไทย (icd101.tname) — บางรหัสไม่มี */
  nameTh?: string;
  count: number;
}

export interface RevenueByRightItem {
  right: string;
  visits: number;
  amount: number;
}

export interface DashboardSnapshot {
  range: DashboardRange;
  generatedAt: string;
  hourly: HourlySeries;
  opd: { total: number; walkin: number; appointment: number; yesterday: number; changePct: number };
  appointment: { total: number; came: number; missed: number; lastWeek: number; changePct: number };
  er: { total: number; red: number; pink: number; yellow: number; green: number; white: number; yesterday: number; changePct: number };
  ipd: { total: number; admit: number; discharge: number; yesterday: number; occupancyPct: number; changePct: number };
  queue: { avgMinutes: number; waiting: number; done: number; changePct: number };
  referral: { in: number; out: number };
  revenueOpd: number;
  revenueByRight: RevenueByRightItem[];
  bed: { free: number; total: number; occupancyPct: number; patientDays: number; days: number };
  adjrw: number;
  paymentMix: PaymentMixItem[];
  topDiseases: { opd: TopDiseaseItem[]; ipd: TopDiseaseItem[] };
}

export interface SeriesToggle {
  opd: boolean;
  ipd: boolean;
  er: boolean;
}

export type FilterMode = 'fiscal' | 'range';

export interface DashboardFilter {
  mode: FilterMode;
  start: string;
  end: string;
}
