import type { Icd10Summary } from '../types/icd10';
import type { WithMeta } from '../types/reports';
import { PAGE_MEMO_MS } from './reportService';
import { apiGet } from './apiClient';

export function fetchIcd10Summary(start: string, end: string, silent = false) {
  return apiGet<WithMeta<Icd10Summary>>('/icd10/summary', { params: { start, end }, silent, memoMs: silent ? 0 : PAGE_MEMO_MS });
}
