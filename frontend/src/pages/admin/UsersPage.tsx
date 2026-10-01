import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import PageSkeleton from '../../components/PageSkeleton';
import Select from '../../components/ui/Select';
import { useMinDelay } from '../../hooks/useMinDelay';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../services/apiClient';
import { fetchSystemUsers, forceLogoutUser, type PresenceStatus, type SystemUser, type SystemUsers } from '../../services/adminService';

const REFRESH_MS = 30_000;

const STATUS: Record<PresenceStatus, { label: string; tip: string }> = {
  active: { label: 'ใช้งานอยู่', tip: 'เปิดหน้า/กดใช้งานภายใน {a} นาที' },
  idle: { label: 'เปิดค้างไว้', tip: 'ยังเปิดเว็บอยู่ แต่ไม่ได้กดอะไรเกิน {a} นาที' },
  offline: { label: 'ออฟไลน์', tip: 'ออกจากระบบ / session หมดอายุ / ปิดเว็บไปแล้ว' },
};

type Filter = 'all' | PresenceStatus | 'online';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'online', label: 'ออนไลน์ (ใช้งานอยู่ + เปิดค้าง)' },
  { value: 'active', label: 'ใช้งานอยู่' },
  { value: 'idle', label: 'เปิดค้างไว้' },
  { value: 'offline', label: 'ออฟไลน์' },
];

type SortKey = 'status' | 'name' | 'lastActive' | 'lastLogin' | 'loginCount';
const STATUS_ORDER: Record<PresenceStatus, number> = { active: 0, idle: 1, offline: 2 };

/** "01/10/2569 08:12" */
function formatDateTime(iso: string | null) {
  if (!iso) return '–';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeAgo(iso: string | null, now: number) {
  if (!iso) return '–';
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} วันที่แล้ว` : formatDateTime(iso).slice(0, 10);
}

function compare(a: SystemUser, b: SystemUser, key: SortKey) {
  switch (key) {
    case 'status': return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.lastActive ?? '').localeCompare(a.lastActive ?? '');
    case 'name': return a.name.localeCompare(b.name, 'th');
    case 'lastActive': return (b.lastActive ?? '').localeCompare(a.lastActive ?? '');
    case 'lastLogin': return (b.lastLogin ?? '').localeCompare(a.lastLogin ?? '');
    case 'loginCount': return b.loginCount - a.loginCount;
  }
}

export default function UsersPage() {
  const [data, setData] = useState<SystemUsers | null>(null);
  const skeletonDone = useMinDelay();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; reverse: boolean }>({ key: 'status', reverse: false });
  const [now, setNow] = useState(() => Date.now());
  const { user: me } = useAuth();
  const [kickTarget, setKickTarget] = useState<SystemUser | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      setData(await fetchSystemUsers(silent));
      setNow(Date.now());
    } catch { /* 401/403 จัดการโดยระบบ login */ }
  }, []);

  // เปิดหน้า = เปิดดูจริง (บันทึกประวัติ) · รอบอัปเดตทุก 30 วินาทีเป็นแบบเบื้องหลัง
  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const confirmKick = async () => {
    const target = kickTarget;
    setKickTarget(null);
    if (!target) return;
    try {
      await forceLogoutUser(target.loginname);
      setNotice({ tone: 'ok', text: `บังคับ ${target.name} ออกจากระบบแล้ว — ทุกเครื่องของคนนี้จะหลุดภายใน 1 นาที (login ใหม่ได้ทันที)` });
      void load(true);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof ApiError ? error.message : 'บังคับออกจากระบบไม่สำเร็จ กรุณาลองใหม่' });
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = data.users.filter(u =>
      (filter === 'all' || u.status === filter || (filter === 'online' && u.status !== 'offline'))
      && (!q || [u.name, u.loginname, u.groupname, u.position, u.lastIp ?? ''].some(v => v.toLowerCase().includes(q))));
    const sorted = [...filtered].sort((a, b) => compare(a, b, sort.key));
    return sort.reverse ? sorted.reverse() : sorted;
  }, [data, query, filter, sort]);

  const sortBy = (key: SortKey) => setSort(s => ({ key, reverse: s.key === key ? !s.reverse : false }));
  const header = (key: SortKey, label: string, className = '') => (
    <th className={className} aria-sort={sort.key === key ? (sort.reverse ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="th-sort" onClick={() => sortBy(key)}>
        {label} {sort.key === key && <i className={`fa-solid ${sort.reverse ? 'fa-arrow-up-short-wide' : 'fa-arrow-down-wide-short'}`} />}
      </button>
    </th>
  );

  const activeMinutes = data?.thresholds.activeMinutes ?? 5;

  return (
    <>
      <PageHeader
        title="ผู้ใช้งานระบบ"
        subtitle={`ผู้ที่เคย login เข้าระบบ และสถานะออนไลน์ขณะนี้ — อัปเดตเองทุก ${REFRESH_MS / 1000} วินาที`}
        actions={
          <div className="filter-bar">
            <label className="table-search">
              <i className="fa-solid fa-magnifying-glass" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ชื่อ, loginname, IP..." aria-label="ค้นหาผู้ใช้" />
            </label>
            <Select<Filter> ariaLabel="สถานะ" value={filter} options={FILTERS} onChange={setFilter} />
            <button className="filter-refresh" onClick={() => void load()} data-tip="รีเฟรช"><i className="fa-solid fa-arrows-rotate" /></button>
          </div>
        }
      />

      {notice && (
        <div className={`notice-bar${notice.tone === 'error' ? ' error' : ''}`}>
          <i className={`fa-solid ${notice.tone === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} />
          <span>{notice.text}</span>
          <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="ปิด"><i className="fa-solid fa-xmark" /></button>
        </div>
      )}

      {!(data && skeletonDone) ? <PageSkeleton cards={4} rows={[]} table={8} columns={7} /> : (
        <>
          <section className="presence-summary">
            <button type="button" className={`presence-card${filter === 'active' ? ' selected' : ''}`} onClick={() => setFilter(filter === 'active' ? 'all' : 'active')}>
              <span className="presence-dot status-active" /><div><b>{data.counts.active}</b><small>ใช้งานอยู่</small></div>
            </button>
            <button type="button" className={`presence-card${filter === 'idle' ? ' selected' : ''}`} onClick={() => setFilter(filter === 'idle' ? 'all' : 'idle')}>
              <span className="presence-dot status-idle" /><div><b>{data.counts.idle}</b><small>เปิดค้างไว้</small></div>
            </button>
            <div className="presence-card">
              <i className="fa-solid fa-calendar-day" /><div><b>{data.counts.today}</b><small>ใช้งานวันนี้</small></div>
            </div>
            <button type="button" className={`presence-card${filter === 'all' ? ' selected' : ''}`} onClick={() => setFilter('all')}>
              <i className="fa-solid fa-users" /><div><b>{data.counts.total}</b><small>เคย login ทั้งหมด</small></div>
            </button>
            <div
              className="presence-card guest"
              data-tip={`ผู้ที่ไม่ได้ login — ระบบไม่รู้ว่าเป็นใคร จึงนับเป็นจำนวนเครื่อง (IP) ที่เปิดเว็บภายใน ${activeMinutes} นาที`}
            >
              <i className="fa-solid fa-user-secret" />
              <div>
                <b>{data.counts.guestsOnline}</b>
                <small>ผู้เยี่ยมชมขณะนี้{data.counts.guestsToday !== null && <> · วันนี้ {data.counts.guestsToday} เครื่อง</>}</small>
              </div>
            </div>
          </section>

          <article className="card-box table-card">
            <div className="table-responsive">
              <table className="rank-table users-table">
                <thead>
                  <tr>
                    {header('status', 'สถานะ')}
                    {header('name', 'ผู้ใช้')}
                    <th>กลุ่ม / ตำแหน่ง</th>
                    {header('lastActive', 'ใช้งานล่าสุด')}
                    {header('lastLogin', 'login ล่าสุด')}
                    {header('loginCount', 'login', 'num')}
                    <th>IP ล่าสุด</th>
                    <th aria-label="จัดการ" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(u => (
                    <tr key={u.loginname} className={u.status === 'offline' ? 'is-offline' : undefined}>
                      <td className="nowrap">
                        <span className={`presence-status status-${u.status}`} data-tip={STATUS[u.status].tip.replace('{a}', String(activeMinutes))}>
                          <span className={`presence-dot status-${u.status}`} />{STATUS[u.status].label}
                        </span>
                      </td>
                      <td>
                        <div className="user-cell">
                          <b>{u.name}</b>
                          <code className="icd-code">{u.loginname}</code>
                        </div>
                      </td>
                      <td>
                        <div className="user-cell">
                          <span>{u.groupname || '–'}{u.role === 'admin' && <span className="action-badge tone-indigo">ผู้ดูแลระบบ</span>}</span>
                          {u.position && <small className="muted">{u.position}</small>}
                        </div>
                      </td>
                      <td className="nowrap" title={formatDateTime(u.lastActive)}>{timeAgo(u.lastActive, now)}</td>
                      <td className="nowrap">{formatDateTime(u.lastLogin)}</td>
                      <td className="num">{u.loginCount.toLocaleString('en-US')}</td>
                      <td className="muted nowrap">{u.lastIp ?? '–'}</td>
                      <td className="nowrap">
                        {u.status !== 'offline' && u.loginname !== me?.loginname && (
                          <button type="button" className="kick-btn" onClick={() => setKickTarget(u)}>
                            <i className="fa-solid fa-right-from-bracket" /> บังคับออก
                          </button>
                        )}
                        {u.loginname === me?.loginname && <small className="muted">(คุณ)</small>}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={8} className="empty">ไม่พบผู้ใช้</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
          <p className="presence-note">
            <i className="fa-solid fa-circle-info" /> สถานะดูจากสัญญาณของหน้าเว็บที่ส่งมาทุก 1 นาที — ปิดเว็บแล้วจะเปลี่ยนเป็นออฟไลน์ภายใน {data.thresholds.offlineMinutes} นาที · เปิดหลายเครื่องนับเป็นคนเดียว
          </p>
        </>
      )}

      <ConfirmDialog
        open={kickTarget !== null}
        icon="fa-right-from-bracket"
        title="บังคับออกจากระบบ?"
        message={kickTarget ? `${kickTarget.name} (${kickTarget.loginname}) จะหลุดออกจากระบบทุกเครื่องภายใน 1 นาที และกลับเป็นผู้เยี่ยมชม — เข้าสู่ระบบใหม่ได้ทันทีถ้าต้องการ` : ''}
        confirmLabel="บังคับออก"
        tone="danger"
        onConfirm={() => void confirmKick()}
        onCancel={() => setKickTarget(null)}
      />
    </>
  );
}
