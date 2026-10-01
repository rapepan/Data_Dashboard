import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClock } from '../hooks/useClock';
import { navIconClass, visibleNavGroups } from '../routes/navigation';
import { useAuth } from '../auth/AuthContext';
import { useLoginRedirect } from '../auth/useLoginRedirect';
import NotificationBell from './NotificationBell';
import MyFeedbackBell from './MyFeedbackBell';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { time, date } = useClock();
  const navigate = useNavigate();
  const { canView, status, user } = useAuth();
  const goLogin = useLoginRedirect();
  const [query, setQuery] = useState('');

  // ค้นหาเฉพาะเมนูที่ผู้ใช้มีสิทธิ์
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return visibleNavGroups(canView).flatMap(group => group.items).filter(item => item.label.toLowerCase().includes(q));
  }, [query, canView]);

  const go = (path: string) => { navigate(path); setQuery(''); };

  return (
    <header className="topbar">
      <button className="topbar-menu" onClick={onMenuClick} aria-label="เมนู"><i className="fa-solid fa-bars" /></button>

      <div className="topbar-search">
        <i className="fa-solid fa-magnifying-glass" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) go(results[0].path); }}
          placeholder="ค้นหาเมนูระบบ (เช่น OPD, ER, โรค)..."
        />
        {results.length > 0 && (
          <ul className="topbar-search-results">
            {results.map(item => (
              <li key={item.key}><button onMouseDown={() => go(item.path)}><i className={navIconClass(item.icon)} />{item.label}</button></li>
            ))}
          </ul>
        )}
      </div>

      <div className="topbar-clock">
        <i className="fa-solid fa-clock-rotate-left" />
        <div>
          <strong>{time}</strong>
          <small>{date}</small>
        </div>
      </div>

      {user?.role === 'admin' ? <NotificationBell /> : user ? <MyFeedbackBell /> : null}

      {status === 'ready' && !user && (
        <button className="topbar-login" onClick={goLogin}><i className="fa-solid fa-right-to-bracket" />เข้าสู่ระบบ</button>
      )}
    </header>
  );
}
