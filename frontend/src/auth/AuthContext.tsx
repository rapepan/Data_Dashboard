import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, clearApiMemo, SESSION_EXPIRED_EVENT } from '../services/apiClient';

/** user = เจ้าหน้าที่ (ทุกคนที่มีบัญชี HOSxP), admin = กลุ่มผู้ดูแลระบบใน HOSxP */
export type Role = 'user' | 'admin';

export interface SessionUser {
  loginname: string;
  displayName: string;
  role: Role;
  roleLabel: string;
  /** หน่วยงาน / ตำแหน่ง จาก HOSxP (อาจว่าง) */
  position?: string;
}

/**
 * ข้อมูลจาก GET /api/auth/me — user = null คือผู้เยี่ยมชม (ไม่ได้ login)
 * backend เป็นผู้ตัดสินสิทธิ์ frontend แค่ใช้ซ่อน/แสดงเมนูและปุ่ม
 */
export interface Session {
  user: SessionUser | null;
  pages: string[];
  canExport: boolean;
  canViewRevenueDetail: boolean;
  idleMinutes: number;
}

interface AuthState {
  /** loading = กำลังถาม backend ว่าเป็นใคร (ยังไม่รู้สิทธิ์) */
  status: 'loading' | 'ready';
  session: Session | null;
  user: SessionUser | null;
  /** ข้อความแจ้งเตือนชั่วคราว เช่น "หมดเวลาการใช้งาน" */
  notice: string | null;
  dismissNotice: () => void;
  login: (loginname: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  canView: (page: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  // ทุกครั้งก่อน setSession ต้อง clearApiMemo() — สถานะ login เปลี่ยนแล้วลืมข้อมูลที่หน้าเว็บจำไว้
  // (ถ้าล้างทีหลัง หน้าที่โหลดใหม่ตามผู้ใช้จะได้ข้อมูลที่จำไว้ของคนก่อน เช่น รายละเอียดค่ารักษา)
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await apiGet<Session>('/auth/me', { silent: true });
      clearApiMemo();
      setSession(me);
    } catch {
      // เรียก backend ไม่ได้ — ถือเป็นผู้เยี่ยมชมที่ดูได้แค่หน้าแรก
      clearApiMemo();
      setSession({ user: null, pages: ['dashboard'], canExport: false, canViewRevenueDetail: false, idleMinutes: 30 });
    }
    setStatus('ready');
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ผู้เยี่ยมชมกด Ctrl+P เอง → หน้าที่พิมพ์ออกมาเป็นข้อความให้เข้าสู่ระบบแทนข้อมูล (ดู @media print ใน app.css)
  const canExport = session?.canExport ?? false;
  useEffect(() => {
    document.body.classList.toggle('print-locked', !canExport);
  }, [canExport]);

  // session หมดอายุระหว่างใช้งาน → กลับเป็นผู้เยี่ยมชม (ยังดูหน้าสาธารณะต่อได้)
  useEffect(() => {
    const onExpired = (event: Event) => {
      setNotice((event as CustomEvent<string>).detail === 'revoked'
        ? 'ผู้ดูแลระบบให้ออกจากระบบแล้ว ระบบเปลี่ยนเป็นโหมดผู้เยี่ยมชม — เข้าสู่ระบบใหม่ได้ทันที'
        : 'หมดเวลาการใช้งาน ระบบเปลี่ยนเป็นโหมดผู้เยี่ยมชมแล้ว — เข้าสู่ระบบใหม่เพื่อใช้งานส่วนที่ต้องมีสิทธิ์');
      refresh();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [refresh]);

  const login = useCallback(async (loginname: string, password: string) => {
    const next = await apiPost<Session>('/auth/login', { loginname, password });
    clearApiMemo();
    setSession(next);
    setNotice(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      const next = await apiPost<Session>('/auth/logout', undefined, { silent: true });
      clearApiMemo();
      setSession(next);
    } catch {
      await refresh();
    }
    setNotice('ออกจากระบบแล้ว');
  }, [refresh]);

  const value = useMemo<AuthState>(() => ({
    status,
    session,
    user: session?.user ?? null,
    notice,
    dismissNotice: () => setNotice(null),
    login,
    logout,
    canView: page => Boolean(session?.pages.includes(page)),
  }), [status, session, notice, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องใช้ภายใน <AuthProvider>');
  return ctx;
}
