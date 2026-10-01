import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import PageSkeleton from '../../components/PageSkeleton';
import UserSearch, { type UserOption } from '../../components/UserSearch';
import { useMinDelay } from '../../hooks/useMinDelay';
import Select from '../../components/ui/Select';
import { adminService, type AuditEntry } from '../../services/adminService';

const ACTION_LABEL: Record<string, { label: string; tone: string }> = {
  login: { label: 'เข้าสู่ระบบ', tone: 'indigo' },
  login_failed: { label: 'เข้าสู่ระบบไม่สำเร็จ', tone: 'rose' },
  login_blocked: { label: 'ถูกพักการเข้าสู่ระบบ', tone: 'rose' },
  force_logout: { label: 'บังคับออกจากระบบ', tone: 'rose' },
  logout: { label: 'ออกจากระบบ', tone: 'slate' },
  session_expired: { label: 'หมดเวลาการใช้งาน', tone: 'slate' },
  view: { label: 'เปิดดูข้อมูล', tone: 'sky' },
  export: { label: 'ส่งออก Excel / PDF', tone: 'plum' },
  denied: { label: 'เข้าส่วนที่ไม่มีสิทธิ์', tone: 'orange' },
  feedback_submit: { label: 'ส่งเรื่องแจ้งปัญหา', tone: 'amber' },
  feedback_status: { label: 'เปลี่ยนสถานะเรื่องแจ้งปัญหา', tone: 'indigo' },
  cache_refresh: { label: 'สั่งดึงข้อมูลใหม่', tone: 'sky' },
};

const PATH_LABEL: Record<string, string> = {
  '/api/dashboard/summary': 'หน้าแรก (Dashboard)',
  '/api/icd10/summary': 'ค้นหาผู้ป่วยตามโรค (ICD-10)',
  '/api/queue/report': 'ระยะเวลารอคอยคิว',
  '/api/opd/report': 'ผู้ป่วยนอก (OPD)',
  '/api/opd/appointments': 'ผู้ป่วยนอก · นัดหมายรายคลินิก',
  '/api/ipd/report': 'ผู้ป่วยใน (IPD)',
  '/api/er/report': 'อุบัติเหตุ & ฉุกเฉิน (ER)',
  '/api/dental/report': 'ทันตกรรม',
  '/api/physio/report': 'กายภาพบำบัด',
  '/api/telemedicine/report': 'การแพทย์ทางไกล',
  '/api/postal-drug/report': 'การส่งยาทางไปรษณีย์',
  '/api/thai-medicine/report': 'แพทย์แผนไทย',
  '/api/drug-budget/report': 'ปริมาณการใช้ยา',
  '/api/drug-budget/compare': 'ปริมาณการใช้ยา · เปรียบเทียบรายการยา',
  '/api/readmit/report': 'Re-admit (28 วัน)',
  '/api/referral/report': 'ข้อมูลการส่งต่อ (Refer)',
  '/api/admin/audit': 'ประวัติการใช้งาน',
  '/api/admin/feedback': 'แจ้งปัญหา / ข้อเสนอแนะ',
  '/api/admin/users': 'ผู้ใช้งานระบบ',
  '/api/feedback/mine': 'เรื่องที่แจ้ง',
  '/api/admin/cache': 'สถานะข้อมูล',
};

type Who = 'all' | 'user' | 'guest';
const WHO_OPTIONS: { value: Who; label: string }[] = [
  { value: 'user', label: 'เฉพาะผู้ใช้ที่ login' },
  { value: 'guest', label: 'เฉพาะผู้เยี่ยมชม (guest)' },
  { value: 'all', label: 'ทุกคน' },
];

const LIMITS = [100, 200, 500, 1000].map(n => ({ value: n, label: `${n} รายการล่าสุด` }));

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const skeletonDone = useMinDelay();
  const [actions, setActions] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [action, setAction] = useState('');
  const [loginname, setLoginname] = useState('');
  const [limit, setLimit] = useState(200);
  // ผู้เยี่ยมชมเปิดดูได้โดยไม่ต้อง login รายการจึงเยอะ — ค่าเริ่มต้นแสดงเฉพาะผู้ใช้ที่ login
  const [who, setWho] = useState<Who>('user');
  // เรียงตามเวลา — ค่าเริ่มต้นล่าสุดขึ้นก่อน (เรียงเฉพาะรายการที่โหลดมาแล้ว)
  const [newestFirst, setNewestFirst] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await adminService.audit({ limit, action, loginname: loginname.trim(), who });
      setEntries(result.entries);
      setActions(result.actions);
      setUsers(result.users);
    } catch { /* 401/403 จัดการโดยระบบ login */ }
    setLoaded(true);
  }, [limit, action, loginname, who]);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (newestFirst ? b.time.localeCompare(a.time) : a.time.localeCompare(b.time))),
    [entries, newestFirst],
  );

  useEffect(() => {
    const id = setTimeout(load, 300);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <>
      <PageHeader
        title="ประวัติการใช้งาน"
        subtitle="บันทึกการเข้าสู่ระบบ การเปิดดูข้อมูล และการส่งออกไฟล์ของผู้ใช้ทุกคน"
        actions={
          <div className="filter-bar">
            <UserSearch value={loginname} onChange={setLoginname} users={users} />
            <Select<string>
              ariaLabel="ประเภทรายการ"
              value={action}
              options={[{ value: '', label: 'ทุกประเภท' }, ...actions.map(a => ({ value: a, label: ACTION_LABEL[a]?.label ?? a }))]}
              onChange={setAction}
            />
            <Select<Who> ariaLabel="ประเภทผู้ใช้" value={who} options={WHO_OPTIONS} onChange={setWho} />
            <Select<number> ariaLabel="จำนวนรายการ" value={limit} options={LIMITS} onChange={setLimit} />
            <button className="filter-refresh" onClick={load} data-tip="รีเฟรช"><i className="fa-solid fa-arrows-rotate" /></button>
          </div>
        }
      />

      {!(loaded && skeletonDone) ? <PageSkeleton cards={0} rows={[]} table={10} columns={5} /> : (
      <article className="card-box table-card">
        <div className="table-responsive">
          <table className="rank-table audit-table">
            <thead>
              <tr><th aria-sort={newestFirst ? 'descending' : 'ascending'}>
                <button type="button" className="th-sort" onClick={() => setNewestFirst(v => !v)} data-tip={newestFirst ? 'ล่าสุดก่อน — กดเพื่อเรียงเก่าสุดก่อน' : 'เก่าสุดก่อน — กดเพื่อเรียงล่าสุดก่อน'}>
                  เวลา <i className={`fa-solid ${newestFirst ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'}`} />
                </button>
              </th><th>ผู้ใช้</th><th>รายการ</th><th>รายละเอียด</th><th>IP</th></tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => {
                const meta = ACTION_LABEL[entry.action] ?? { label: entry.action, tone: 'slate' };
                return (
                  <tr key={`${entry.time}-${i}`}>
                    <td className="nowrap">{formatTime(entry.time)}</td>
                    <td>{entry.loginname === 'guest'
                      ? <span className="guest-chip"><i className="fa-solid fa-user-secret" /> ผู้เยี่ยมชม</span>
                      : <code className="icd-code">{entry.loginname}</code>}</td>
                    <td><span className={`action-badge tone-${meta.tone}`}>{meta.label}</span></td>
                    <td>{(entry.detail && PATH_LABEL[entry.detail]) ?? entry.detail ?? '–'}</td>
                    <td className="muted">{entry.ip}</td>
                  </tr>
                );
              })}
              {entries.length === 0 && <tr><td colSpan={5} className="empty">ไม่พบรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
      )}
    </>
  );
}
