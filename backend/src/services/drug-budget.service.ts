import { getReport } from '../cache/report-registry';
import type { DrugBudgetReport, DrugCompare } from '../types/reports.types';

export const drugBudgetService = {
  /** ภาพรวมการใช้ยาตามช่วงวันที่ — ผ่านที่พักผล (cache/report-registry.ts) */
  report(start: string, end: string) {
    return getReport<DrugBudgetReport>('drug-budget', { start, end });
  },

  /** เปรียบเทียบยา 1 รายการย้อนหลัง 3 ปีงบประมาณ นับถึงปีงบของวันสิ้นสุด — null = ไม่พบรหัสยา */
  compare(code: string, end: string) {
    return getReport<DrugCompare>('drug-compare', { code, end });
  },
};
