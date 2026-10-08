import type { OpdAppointments, PostalDrugReport, DentalReport, QueueReport, ReadmitReport, ReferralReport, DrugBudgetReport, DrugCompare, ErReport, IpdReport, OpdReport, PhysioReport, TelemedicineReport, ThaiMedicineReport, WithMeta } from '../types/reports';
import { apiGet } from './apiClient';

export const PAGE_MEMO_MS = 2 * 60_000;

/** compare = ดึงช่วงก่อนหน้ามาทำป้าย % เทียบ — เป็นคำขอเบื้องหลัง (ไม่นับเป็นการเปิดหน้าอีกครั้ง) */
export interface FetchOptions { compare?: boolean }
const get = <T>(path: string, params: Record<string, string>, opts: FetchOptions = {}) =>
  apiGet<WithMeta<T>>(path, { params, memoMs: PAGE_MEMO_MS, ...(opts.compare ? { silent: true, purpose: 'compare' } : {}) });
const fetchReport = <T>(path: string) => (start: string, end: string, opts?: FetchOptions) => get<T>(path, { start, end }, opts);

export const fetchOpdReport = fetchReport<OpdReport>('/opd/report');
export const fetchOpdAppointments = (date?: string) => get<OpdAppointments>('/opd/appointments', date ? { date } : {});
export const fetchOpdAppointmentsAhead = (ahead: string) => get<OpdAppointments>('/opd/appointments', { ahead });
export const fetchIpdReport = fetchReport<IpdReport>('/ipd/report');
export const fetchErReport = fetchReport<ErReport>('/er/report');
export const fetchDentalReport = fetchReport<DentalReport>('/dental/report');
export const fetchPhysioReport = fetchReport<PhysioReport>('/physio/report');
export const fetchTelemedicineReport = fetchReport<TelemedicineReport>('/telemedicine/report');
export const fetchPostalDrugReport = fetchReport<PostalDrugReport>('/postal-drug/report');
export const fetchThaiMedicineReport = fetchReport<ThaiMedicineReport>('/thai-medicine/report');
export const fetchDrugBudgetReport = fetchReport<DrugBudgetReport>('/drug-budget/report');
export const fetchQueueReport = fetchReport<QueueReport>('/queue/report');

export const fetchDrugCompare = (code: string, end: string) => get<DrugCompare>('/drug-budget/compare', { code, end });
export const fetchReadmitReport = (start: string, end: string, ward: string, opts?: FetchOptions) => get<ReadmitReport>('/readmit/report', { start, end, ward }, opts);
export const fetchReferralReport = (start: string, end: string, point: string, opts?: FetchOptions) => get<ReferralReport>('/referral/report', { start, end, point }, opts);
