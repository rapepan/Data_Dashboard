import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../services/apiClient";
import AppFooter from "../components/AppFooter";
import { hasThai, visibleThai } from "../utils/thaiKeyboard";

export default function LoginPage() {
  const { user, login, notice } = useAuth();
  const location = useLocation();
  const [loginname, setLoginname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // ลืมเปลี่ยนแป้นพิมพ์เป็นภาษาอังกฤษ / เปิด Caps Lock — เตือนอย่างเดียว ไม่แปลงให้
  const [capsLock, setCapsLock] = useState(false);
  const nameThai = hasThai(loginname);
  const passwordThai = hasThai(password);
  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  const from = (location.state as { from?: string } | null)?.from || "/";
  if (user) return <Navigate to={from === "/login" ? "/" : from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(loginname.trim(), password);
    } catch (err) {
      // รหัสผิด + พิมพ์ภาษาไทย / เปิด Caps Lock อยู่ → บอกสาเหตุที่น่าจะเป็น
      const hint =
        err instanceof ApiError && err.status === 401 && (nameThai || passwordThai || capsLock)
          ? ` — ${[(nameThai || passwordThai) && "พิมพ์เป็นตัวอักษรไทย", capsLock && "เปิด Caps Lock อยู่"].filter(Boolean).join(" และ")} ตรวจแป้นพิมพ์แล้วลองใหม่`
          : "";
      setError(
        err instanceof ApiError
          ? err.message + hint
          : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง",
      );
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img
            className="brand-logo lg"
            src="/logo.jpg"
            alt="Data Dashboard โรงพยาบาลบางเสาธง"
          />
          <div>
            <strong>DATA BSTH</strong>
            <small>ระบบสถิติโรงพยาบาลบางเสาธง</small>
          </div>
        </div>

        <h1>เข้าสู่ระบบ</h1>
        <p className="login-sub">ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับ HOSxP</p>

        {notice && !error && (
          <div className="login-notice">
            <i className="fa-solid fa-circle-info" />
            {notice}
          </div>
        )}
        {error && (
          <div className="login-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" />
            {error}
          </div>
        )}

        <label className="login-field">
          <span>ชื่อผู้ใช้</span>
          <div className="login-input">
            <i className="fa-solid fa-user" />
            <input
              value={loginname}
              onChange={(e) => setLoginname(e.target.value)}
              onKeyDown={checkCaps}
              onKeyUp={checkCaps}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ชื่อผู้ใช้ "
              autoFocus
              required
            />
          </div>
          {nameThai && (
            <small className="login-hint warn" role="status">
              <i className="fa-solid fa-triangle-exclamation" />
              <span>แป้นพิมพ์เป็นภาษาไทยอยู่ — ที่พิมพ์ไว้คือ <b className="login-typed">{visibleThai(loginname)}</b> ลบแล้วเปลี่ยนเป็นภาษาอังกฤษก่อนพิมพ์</span>
            </small>
          )}
        </label>

        <label className="login-field">
          <span>รหัสผ่าน</span>
          <div className="login-input">
            <i className="fa-solid fa-lock" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={checkCaps}
              onKeyUp={checkCaps}
              autoComplete="current-password"
              placeholder="รหัสผ่าน"
              required
            />
            <button
              type="button"
              className="login-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            >
              <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
            </button>
          </div>
          {(passwordThai || capsLock) && (
            <small className="login-hint warn" role="status">
              <i className="fa-solid fa-triangle-exclamation" />{" "}
              {[passwordThai && "แป้นพิมพ์เป็นภาษาไทยอยู่", capsLock && "Caps Lock เปิดอยู่"].filter(Boolean).join(" · ")}
            </small>
          )}
        </label>

        <button type="submit" className="login-submit" disabled={submitting}>
          {submitting ? (
            <>
              <span className="login-spinner" />
              กำลังตรวจสอบ...
            </>
          ) : (
            "เข้าสู่ระบบ"
          )}
        </button>

        <Link to="/" className="login-back">
          <i className="fa-solid fa-arrow-left" />
          กลับไปดูข้อมูลโดยไม่เข้าสู่ระบบ
        </Link>

        <p className="login-foot">
          <i className="fa-solid fa-shield-halved" />{" "}
          ระบบบันทึกการเข้าใช้งานเพื่อความปลอดภัยของข้อมูลผู้ป่วย
        </p>
      </form>
      <AppFooter />
    </div>
  );
}
