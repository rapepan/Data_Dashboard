import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIT_FILE } from '../src/auth/audit-log';
import { pageOfApi, usageSummary } from '../src/auth/usage-stats';

/** สรุปการใช้งาน — นับจากประวัติการใช้งาน (แบบไฟล์ในโฟลเดอร์ชั่วคราวของชุดทดสอบ) */
const now = new Date('2026-10-02T05:00:00Z'); // 12:00 น. เวลาไทย
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
const view = (minutesAgo: number, loginname: string, detail: string, ip = '10.0.0.1') => ({ time: at(minutesAgo), loginname, action: 'view', detail, ip });

describe('สรุปการใช้งาน', () => {
  it('API → หน้า', () => {
    expect(pageOfApi('/api/opd/report')).toBe('opd');
    expect(pageOfApi('/api/opd/appointments')).toBe('opd');
    expect(pageOfApi('/api/telemedicine/report')).toBe('tele');
    expect(pageOfApi('/api/admin/audit')).toBe('admin-audit');
    expect(pageOfApi('/api/system/status')).toBeNull();
  });

  it('รวมคำขอที่ติดกันเป็นการเปิดดูครั้งเดียว · แยกผู้ใช้/ผู้เยี่ยมชม · ไม่นับบัญชีทดสอบ', async () => {
    const rows = [
      view(60, 'nurse1', '/api/opd/report'),
      view(60, 'nurse1', '/api/opd/appointments'), // หน้าเดียวกัน เวลาเดียวกัน → ไม่นับซ้ำ
      view(58, 'nurse1', '/api/opd/report'), // ภายใน 5 นาที → ไม่นับซ้ำ
      view(30, 'nurse1', '/api/opd/report'), // ห่างเกิน 5 นาที → นับใหม่
      view(50, 'doctor1', '/api/dental/report'),
      view(40, 'guest', '/api/dashboard/summary', '10.0.0.7'),
      view(40, 'guest', '/api/dashboard/summary', '10.0.0.8'), // คนละเครื่อง → นับแยก
      view(20, '__test_user', '/api/opd/report'), // บัญชีทดสอบ → ไม่นับ
      view(10, 'nurse1', '/api/system/status'), // ไม่ใช่หน้า → ไม่นับ
      { time: at(15), loginname: 'nurse1', action: 'export', detail: 'Excel: OPD.xlsx' },
      { time: at(70), loginname: 'nurse1', action: 'login' },
      { time: at(71), loginname: 'nurse1', action: 'login_failed' },
      { time: new Date(now.getTime() - 40 * 86_400_000).toISOString(), loginname: 'old', action: 'view', detail: '/api/opd/report' }, // นอกช่วง
    ];
    writeFileSync(AUDIT_FILE, rows.map(r => JSON.stringify(r)).join('\n') + '\n');

    const s = await usageSummary(30, now);
    expect(s.totals).toMatchObject({ views: 5, users: 2, guests: 2, guestViews: 2, exports: 1, logins: 1, loginFailed: 1 });
    expect(s.pages.find(p => p.key === 'opd')).toEqual({ key: 'opd', views: 2, users: 1, guestViews: 0 });
    expect(s.pages.find(p => p.key === 'dashboard')).toEqual({ key: 'dashboard', views: 2, users: 0, guestViews: 2 });
    expect(s.daily).toHaveLength(30);
    expect(s.daily.at(-1)).toMatchObject({ date: '2026-10-02', views: 5, guestViews: 2, users: 2, guests: 2 });
    expect(s.hourly[10] + s.hourly[11]).toBe(5); // 10:00–11:59 น. เวลาไทย
    expect(s.topUsers[0]).toMatchObject({ loginname: 'nurse1', views: 2, exports: 1 });
    expect(s.recentExports).toHaveLength(1);
    expect(s.topUsers.some(u => u.loginname.startsWith('__'))).toBe(false);
  });
});
