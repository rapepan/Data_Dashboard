import { useState, type MouseEvent, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NAV_PARENTS, navIconClass, visibleNavGroups } from '../routes/navigation';
import type { NavItem } from '../types/nav';
import { useAuth } from '../auth/AuthContext';
import { useFeedbackSummary } from '../hooks/useFeedbackSummary';
import { useMyFeedbackSummary } from '../hooks/useMyFeedbackSummary';
import { OPEN_CHANGELOG_EVENT } from './system/WhatsNew';
import { useSystemStatus } from '../hooks/useSystemStatus';
import ConfirmDialog from './ConfirmDialog';

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
}

const OPEN_KEY = 'nav-open';
function readOpen(): string[] {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as string[]; } catch { return []; }
}

interface Tip {
  label: string;
  top: number;
}

export default function Sidebar({ open, collapsed, onClose }: SidebarProps) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const { user, canView, logout } = useAuth();
  // จำนวนเรื่องแจ้งปัญหาที่ยังไม่ดำเนินการ (เฉพาะผู้ดูแล) — ตัวเลขเดียวกับกระดิ่ง
  const pendingFeedback = useFeedbackSummary(user?.role === 'admin')?.newCount ?? 0;
  // เรื่องที่ตัวเองแจ้งมีความเคลื่อนไหวใหม่ (ทุกคนที่ login) — ตัวเลขเดียวกับกระดิ่งของผู้ใช้
  const myUnread = useMyFeedbackSummary(Boolean(user))?.unread ?? 0;
  const badgeFor = (key: string) => (key === 'admin-feedback' ? pendingFeedback : key === 'my-feedback' ? myUnread : 0);
  const navigate = useNavigate();
  const location = useLocation();
  // หน้าที่ผู้ดูแลปิดปรับปรุงเฉพาะหน้า — แสดงไอคอน 🔧 ท้ายชื่อเมนู (ยังกดเข้าได้ จะเห็นข้อความแจ้ง)
  const closedPages = useSystemStatus().status?.pageMaintenance.pages ?? [];

  // เมนูย่อยที่กางไว้ (จำในเบราว์เซอร์) — เปิดหน้าลูกอยู่จะกางให้เอง
  const [openParents, setOpenParents] = useState<string[]>(readOpen);
  const toggleParent = (key: string) => setOpenParents(list => {
    const next = list.includes(key) ? list.filter(k => k !== key) : [...list, key];
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ไม่มี storage ก็ใช้ได้ */ }
    return next;
  });

  const showTip = (label: string) => (e: MouseEvent<HTMLElement>) => {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2 });
  };
  const hideTip = () => setTip(null);

  const link = (item: NavItem): ReactNode => (
    <NavLink
      key={item.key}
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${item.parent ? ' nav-child' : ''}`}
      aria-label={item.label}
      onClick={() => { hideTip(); onClose(); }}
      onMouseEnter={showTip(item.label)}
      onMouseLeave={hideTip}
    >
      <i className={navIconClass(item.icon)} /><span>{item.label}</span>
      {item.wip && <em className="nav-wip">กำลังพัฒนา</em>}
      {closedPages.includes(item.page ?? item.key) && (
        <i className="fa-solid fa-screwdriver-wrench nav-maintenance" title="หน้านี้กำลังปิดปรับปรุง" aria-label="ปิดปรับปรุง" />
      )}
      {badgeFor(item.key) > 0 && <em className="nav-badge" aria-label={item.key === 'my-feedback' ? `มีความเคลื่อนไหวใหม่ ${badgeFor(item.key)} เรื่อง` : `ยังไม่ดำเนินการ ${badgeFor(item.key)} เรื่อง`}>{badgeFor(item.key) > 99 ? '99+' : badgeFor(item.key)}</em>}
    </NavLink>
  );

  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-brand">
          <img className="brand-logo" src="/logo.jpg" alt="Data Dashboard โรงพยาบาลบางเสาธง" />
          <div className="brand-text">
            <strong>DATA BSTH</strong>
            {/* เลขเวอร์ชันจาก package.json · login แล้วกดเพื่อดูบันทึกการเปลี่ยนแปลง (ผู้เยี่ยมชมเห็นแค่เลข) */}
            {user ? (
              <button type="button" className="brand-version" onClick={() => window.dispatchEvent(new Event(OPEN_CHANGELOG_EVENT))} title="บันทึกการเปลี่ยนแปลง">
                V {__APP_VERSION__}
              </button>
            ) : (
              <span className="brand-version is-static">V {__APP_VERSION__}</span>
            )}
          </div>
          <button className="btn sidebar-close d-lg-none" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <nav className="sidebar-nav" onScroll={hideTip}>
          {visibleNavGroups(canView).map(group => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label"><i className={navIconClass(group.icon)} />{group.label}</div>
              {group.items.map((item, i) => {
                if (!item.parent) return link(item);
                // หัวเมนูย่อย: วาดครั้งเดียวที่รายการแรกของ parent นั้น พร้อมลูกทั้งหมด
                if (group.items[i - 1]?.parent === item.parent) return null;
                const children = group.items.filter(c => c.parent === item.parent);
                const parent = NAV_PARENTS[item.parent] ?? { label: item.parent, icon: 'fa-folder' };
                const hasActive = children.some(c => location.pathname === c.path);
                const expanded = hasActive || openParents.includes(item.parent);
                const groupKey = item.parent;
                return (
                  <div key={`parent-${groupKey}`} className={`nav-parent${expanded ? ' open' : ''}${hasActive ? ' has-active' : ''}`}>
                    <button
                      type="button"
                      className="nav-link nav-parent-toggle"
                      aria-expanded={expanded}
                      aria-label={parent.label}
                      onClick={() => { if (!hasActive) toggleParent(groupKey); }}
                      onMouseEnter={showTip(parent.label)}
                      onMouseLeave={hideTip}
                    >
                      <i className={navIconClass(parent.icon)} /><span>{parent.label}</span>
                      <i className="fa-solid fa-chevron-down nav-parent-caret" aria-hidden="true" />
                    </button>
                    {/* วาดไว้ตลอด แล้วยืด/หดความสูงด้วย CSS (นุ่มกว่าใส่/เอาออกทันที) · พับอยู่ = กด Tab ข้ามไป (inert) */}
                    <div className="nav-children-wrap" inert={!(expanded || collapsed)}>
                      <div className="nav-children">{children.map(link)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {user ? (
          <div className="sidebar-footer" onMouseEnter={showTip(`${user.displayName} · ${user.roleLabel}`)} onMouseLeave={hideTip}>
            <div className="brand-mark small"><i className="fa-solid fa-user" /></div>
            <div className="brand-text">
              <strong>{user.displayName}</strong>
              <small>{user.roleLabel}</small>
            </div>
            <button className="sidebar-logout" onClick={() => { hideTip(); setConfirmLogout(true); }} data-tip="ออกจากระบบ" aria-label="ออกจากระบบ">
              <i className="fa-solid fa-right-from-bracket" />
            </button>
          </div>
        ) : (
          <button
            className="sidebar-footer sidebar-login"
            onClick={() => { hideTip(); onClose(); navigate('/login', { state: { from: location.pathname } }); }}
            onMouseEnter={showTip('เข้าสู่ระบบ')}
            onMouseLeave={hideTip}
          >
            <div className="brand-mark small"><i className="fa-solid fa-right-to-bracket" /></div>
            <div className="brand-text">
              <strong>เข้าสู่ระบบ</strong>
              <small>ผู้เยี่ยมชม · ดูได้เฉพาะข้อมูลทั่วไป</small>
            </div>
          </button>
        )}
      </aside>

      {collapsed && tip && <div className="sidebar-tip" style={{ top: tip.top }}>{tip.label}</div>}

      <ConfirmDialog
        open={confirmLogout}
        icon="fa-right-from-bracket"
        title="ออกจากระบบ"
        message="ต้องการออกจากระบบใช่หรือไม่"
        confirmLabel="ออกจากระบบ"
        onConfirm={async () => { setConfirmLogout(false); await logout(); }}
        onCancel={() => setConfirmLogout(false)}
      />

      <div className={`sidebar-backdrop${open ? ' show' : ''}`} onClick={onClose} />
    </>
  );
}
