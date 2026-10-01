export type Role = 'user' | 'admin';

export const ROLE_LABEL: Record<Role, string> = {
  user: 'เจ้าหน้าที่',
  admin: 'ผู้ดูแลระบบ',
};

export const DEPARTMENT_PAGES = [
  'queue', 'opd', 'ipd', 'er', 'dental', 'physio',
  'tele', 'postal', 'thaimed', 'drugbudget', 'readmit', 'referral',
] as const;

export type PageKey = 'dashboard' | 'icd10' | (typeof DEPARTMENT_PAGES)[number] | 'contact' | 'myfeedback' | 'admin';

export interface SessionUser {
  loginname: string;
  displayName: string;
  role: Role;
  groupname?: string;
  position?: string;
}

export const ADMIN_GROUPNAME = process.env.HOSXP_ADMIN_GROUP || 'ผู้ดูแลระบบ';

export const GUEST_ACCESS = {
  pages: ['dashboard', ...DEPARTMENT_PAGES, 'contact'] as PageKey[],
  export: false,
  revenueDetail: false,
};

const USER_PAGES: PageKey[] = ['icd10', 'myfeedback'];
const ADMIN_PAGES: PageKey[] = ['admin'];

export function allowedPages(user: SessionUser | null): PageKey[] {
  const pages = new Set<PageKey>(GUEST_ACCESS.pages);
  if (user) USER_PAGES.forEach(page => pages.add(page));
  if (user?.role === 'admin') ADMIN_PAGES.forEach(page => pages.add(page));
  return [...pages];
}

export function canViewPage(user: SessionUser | null, page: PageKey) {
  return allowedPages(user).includes(page);
}

export function canExport(user: SessionUser | null) {
  return user ? true : GUEST_ACCESS.export;
}

export function canViewRevenueDetail(user: SessionUser | null) {
  return user ? true : GUEST_ACCESS.revenueDetail;
}
