import { useClock } from '../hooks/useClock';
import { useAuth } from '../auth/AuthContext';
import { useLoginRedirect } from '../auth/useLoginRedirect';
import NotificationBell from './NotificationBell';
import MyFeedbackBell from './MyFeedbackBell';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { time, date } = useClock();
  const { status, user } = useAuth();
  const goLogin = useLoginRedirect();

  return (
    <header className="topbar">
      <button className="topbar-menu" onClick={onMenuClick} aria-label="เมนู"><i className="fa-solid fa-bars" /></button>

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
