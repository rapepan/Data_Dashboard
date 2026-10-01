import { getReport } from '../cache/report-registry';
import type { Icd10Summary } from '../types/icd10.types';

export const icd10Service = {
  /** สรุปอันดับโรคตามรหัส ICD-10 ในช่วงวันที่ — ผ่านที่พักผล (cache/report-registry.ts) */
  summary(start: string, end: string) {
    return getReport<Icd10Summary>('icd10', { start, end });
  },
};
