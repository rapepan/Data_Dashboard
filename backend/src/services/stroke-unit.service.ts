import type { ModuleStatus } from '../types/module-status.types';

export const strokeUnitService = {
  status(): ModuleStatus {
    return { module: 'stroke-unit', label: 'Stroke Unit', status: 'coming-soon', note: 'รอกำหนดตารางข้อมูลจาก HOSxP ก่อนเชื่อมต่อจริง' };
  },
};
