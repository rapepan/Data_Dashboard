import { useState, type MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { navIconClass, visibleNavGroups } from '../routes/navigation';
import { useAuth } from '../auth/AuthContext';
import { useFeedbackSummary } from '../hooks/useFeedbackSummary';
import { useMyFeedbackSummary } from '../hooks/useMyFeedbackSummary';
import ConfirmDialog from './ConfirmDialog';

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
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

  const showTip = (label: string) => (e: MouseEvent<HTMLElement>) => {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2 });
  };
  const hideTip = () => setTip(null);

  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-brand">
          <img className="brand-logo" src="/logo.jpg" alt="Data Dashboard โรงพยาบาลบางเสาธง" />
          <div className="brand-text"><strong>DATA BSTH</strong><small>V.0.1</small></div>
          <button className="btn sidebar-close d-lg-none" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <nav className="sidebar-nav" onScroll={hideTip}>
          {visibleNavGroups(canView).map(group => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label"><i className={navIconClass(group.icon)} />{group.label}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  aria-label={item.label}
                  onClick={() => { hideTip(); onClose(); }}
                  onMouseEnter={showTip(item.label)}
                  onMouseLeave={hideTip}
                >
                  <i className={navIconClass(item.icon)} /><span>{item.label}</span>
                  {badgeFor(item.key) > 0 && <em className="nav-badge" aria-label={item.key === 'my-feedback' ? `มีความเคลื่อนไหวใหม่ ${badgeFor(item.key)} เรื่อง` : `ยังไม่ดำเนินการ ${badgeFor(item.key)} เรื่อง`}>{badgeFor(item.key) > 99 ? '99+' : badgeFor(item.key)}</em>}
                </NavLink>
              ))}
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
