import { useLocation, useNavigate } from 'react-router-dom';

/** พาไปหน้า login แล้ว login เสร็จกลับมาหน้าเดิม */
export function useLoginRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  return () => navigate('/login', { state: { from: location.pathname } });
}
