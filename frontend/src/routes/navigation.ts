import type { NavGroup } from '../types/nav';

/** class ของไอคอนเมนู (Font Awesome แบบ solid, กว้างเท่ากันทุกตัว) — ทั้งระบบใช้ Font Awesome */
export function navIconClass(icon: string) {
  return `fa-solid ${icon} fa-fw`;
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'ภาพรวม & การวิเคราะห์', icon: 'fa-chart-line', items: [
    { key: 'dashboard', path: '/', icon: 'fa-chart-pie', label: 'หน้าแรก (Dashboard)' },
    { key: 'icd10', path: '/icd10-search', icon: 'fa-magnifying-glass-chart', label: 'ค้นหาผู้ป่วยตามโรค (ICD-10)' },
    { key: 'queue', path: '/queue', icon: 'fa-clock', label: 'ระยะเวลารอคอยคิว' },
  ]},
  { label: 'บริการผู้ป่วย & หอผู้ป่วย', icon: 'fa-hospital', items: [
    { key: 'opd', path: '/opd', icon: 'fa-hospital-user', label: 'ผู้ป่วยนอก (OPD)' },
    { key: 'ipd', path: '/ipd', icon: 'fa-bed-pulse', label: 'ผู้ป่วยใน (IPD)' },
    { key: 'er', path: '/er', icon: 'fa-truck-medical', label: 'อุบัติเหตุ & ฉุกเฉิน (ER)' },
  ]},
  { label: 'คลินิกเฉพาะทาง & ฟื้นฟู', icon: 'fa-stethoscope', items: [
    { key: 'stroke', path: '/stroke-unit', icon: 'fa-brain', label: 'Stroke Unit (สมอง)', hidden: true },
    { key: 'dental', path: '/dental', icon: 'fa-tooth', label: 'ทันตกรรม (Dental)' },
    { key: 'physio', path: '/physio', icon: 'fa-wheelchair', label: 'กายภาพบำบัด (Physio)' },
    { key: 'tele', path: '/telemedicine', icon: 'fa-laptop-medical', label: 'การแพทย์ทางไกล (Tele)' },
    { key: 'postal', path: '/postal-drug', icon: 'fa-truck-fast', label: 'การส่งยาทางไปรษณีย์' },
    { key: 'thaimed', path: '/thai-medicine', icon: 'fa-leaf', label: 'แพทย์แผนไทย / แผนจีน (TTCM)' },
    { key: 'drugbudget', path: '/drug-budget', icon: 'fa-pills', label: 'ปริมาณการใช้ยา (Drug)' },
  ]},
  { label: 'การติดตาม & ส่งต่อ', icon: 'fa-arrows-rotate', items: [
    { key: 'readmit', path: '/readmit', icon: 'fa-arrows-rotate', label: 'Re-admit (28 วัน)' },
    { key: 'referral', path: '/referral', icon: 'fa-right-left', label: 'ข้อมูลการส่งต่อ (Refer)' },
  ]},
  { label: 'ช่วยเหลือ', icon: 'fa-circle-question', items: [
    { key: 'contact', path: '/contact', icon: 'fa-headset', label: 'ติดต่อผู้พัฒนา' },
    { key: 'my-feedback', page: 'myfeedback', path: '/my-feedback', icon: 'fa-list-check', label: 'เรื่องที่แจ้ง' },
  ]},
  { label: 'ผู้ดูแลระบบ', icon: 'fa-gear', items: [
    { key: 'admin-users', page: 'admin', path: '/admin/users', icon: 'fa-users', label: 'ผู้ใช้งานระบบ' },
    { key: 'admin-usage', page: 'admin', path: '/admin/usage', icon: 'fa-chart-column', label: 'สรุปการใช้งาน' },
    { key: 'admin-feedback', page: 'admin', path: '/admin/feedback', icon: 'fa-comment-dots', label: 'แจ้งปัญหา / ข้อเสนอแนะ' },
    { key: 'admin-data', page: 'admin', path: '/admin/data', icon: 'fa-database', label: 'สถานะข้อมูล' },
    { key: 'admin-system', page: 'admin', path: '/admin/system', icon: 'fa-bullhorn', label: 'ประกาศ / ปิดปรับปรุง' },
    { key: 'admin-audit', page: 'admin', path: '/admin/audit', icon: 'fa-clock-rotate-left', label: 'ประวัติการใช้งาน' },
  ]},
];

export function visibleNavGroups(canView: (page: string) => boolean): NavGroup[] {
  return NAV_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => !item.hidden && canView(item.page ?? item.key)) }))
    .filter(group => group.items.length > 0);
}
