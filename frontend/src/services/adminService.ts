import { apiGet, apiPost } from './apiClient';

export interface AuditEntry {
  time: string;
  loginname: string;
  action: string;
  detail?: string;
  ip?: string;
}

export interface CacheStatus {
  reports: { name: string; label: string; source: 'mock' | 'hosxp'; prewarm: boolean; entries: number; fresh: number; newest: string | null }[];
  cache: {
    entries: number;
    running: number;
    queued: number;
    stats: { hits: number; misses: number; coalesced: number; staleServed: number; errors: number; loads: number; hitRate: number | null; avgLoadMs: number | null };
    config: { prewarmMinutes: number; ttlTodayMinutes: number; ttlPastHours: number; maxConcurrent: number };
  };
  prewarm: {
    running: boolean;
    current: { reason: string; startedAt: string; done: number } | null;
    last: { reason: string; startedAt: string; finishedAt: string | null; durationMs: number | null; failed: number; jobs: { report: string; label: string; params: string; ms: number; ok: boolean; error?: string }[] } | null;
    nextAt: string | null;
    consecutiveFailedRuns: number;
    manualAvailableAt: string | null;
    intervalMinutes: number;
  };
}

export const adminService = {
  cacheStatus: () => apiGet<CacheStatus>('/admin/cache', { silent: true }),
  cacheRefresh: () => apiPost<{ ok: true }>('/admin/cache/refresh'),
  audit: (params: { limit: number; loginname?: string; action?: string; who?: 'all' | 'user' | 'guest' }) =>
    apiGet<{ entries: AuditEntry[]; actions: string[]; users: { loginname: string; count: number; last: string }[] }>('/admin/audit', {
      params: Object.fromEntries(Object.entries({ ...params, limit: String(params.limit) }).filter(([, v]) => v)) as Record<string, string>,
    }),
};

export type PresenceStatus = 'active' | 'idle' | 'offline';

export interface SystemUser {
  loginname: string;
  name: string;
  groupname: string;
  position: string;
  role: string;
  status: PresenceStatus;
  firstLogin: string | null;
  lastLogin: string | null;
  loginCount: number;
  lastActive: string | null;
  lastSeen: string | null;
  lastIp: string | null;
}

export interface SystemUsers {
  users: SystemUser[];
  counts: { active: number; idle: number; offline: number; today: number; total: number; guestsOnline: number; guestsToday: number | null };
  thresholds: { activeMinutes: number; offlineMinutes: number };
}

/** ผู้ใช้ที่เคย login + สถานะออนไลน์ — silent = รอบอัปเดตอัตโนมัติ (ไม่ต่ออายุ session / ไม่บันทึกประวัติ) */
export const fetchSystemUsers = (silent = false) => apiGet<SystemUsers>('/admin/users', { silent });
/** บังคับออกจากระบบ — ทุกเครื่องของคนนั้นหลุดภายใน 1 นาที */
export const forceLogoutUser = (loginname: string) => apiPost<{ ok: true }>(`/admin/users/${encodeURIComponent(loginname)}/logout`);
