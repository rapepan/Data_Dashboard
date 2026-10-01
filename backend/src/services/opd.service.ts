import { getReport, todayIso } from '../cache/report-registry';
import type { OpdAppointments, OpdReport } from '../types/reports.types';

export const opdService = {
  report(start: string, end: string) {
    return getReport<OpdReport>('opd', { start, end });
  },

  appointments(date = todayIso()) {
    return getReport<OpdAppointments>('opd-appointments', { date });
  },

  appointmentsAhead(date: string) {
    const prev = new Date(`${date}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    return getReport<OpdAppointments>('opd-appointments', { date: prev.toISOString().slice(0, 10) });
  },
};
