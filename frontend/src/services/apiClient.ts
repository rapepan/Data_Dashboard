
/** ค่าเริ่มต้นเรียกผ่าน proxy ของ Vite (/api → backend) เพื่อให้ cookie login ใช้ได้ */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/** รอ backend นานสุดเท่านี้ ถ้าเกินถือว่าล้มเหลว (กัน spinner ค้างตลอดไปถ้า backend ไม่ตอบ) */
const REQUEST_TIMEOUT_MS = 20000;

export interface ApiOptions {
  params?: Record<string, string>;
  /** true = คำขอเบื้องหลัง: ไม่นับเป็นการใช้งาน / ไม่ต่ออายุ session (เช่น auto-refresh) */
  silent?: boolean;
  /** จำผลไว้กี่ ms (เฉพาะ GET) — เปิดหน้าเดิมซ้ำในช่วงนี้ได้ผลทันที ไม่ยิง backend */
  memoMs?: number;
}

/** backend ตอบกลับเป็น error (มี status) — ต่างจากเรียก backend ไม่ได้เลย (network error) */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** แจ้งทั้งระบบเมื่อ session login หมดอายุ/ถูกถอนสิทธิ์ (AuthProvider รับไปเปลี่ยนเป็นผู้เยี่ยมชม) */
export const SESSION_EXPIRED_EVENT = 'api:session-expired';

/* ---------- ความจำระยะสั้นของหน้าเว็บ (อยู่ในหน่วยความจำ ปิดแท็บ/รีเฟรชแล้วหาย) ---------- */
const memo = new Map<string, { at: number; data: unknown }>();
/** GET ที่กำลังรอคำตอบอยู่ — คำขอเดียวกันซ้อนเข้ามา (เช่น React StrictMode เรียก 2 รอบตอนพัฒนา, กดรัว) ใช้คำขอเดิมร่วมกัน */
const inflight = new Map<string, Promise<unknown>>();

/** ล้างความจำทั้งหมด — เรียกเมื่อ login/logout (ข้อมูลบางส่วนต่างกันตามสิทธิ์) และตอนกดรีเฟรช */
export function clearApiMemo() {
  memo.clear();
}

function request<T>(method: string, path: string, body: unknown, options: ApiOptions): Promise<T> {
  if (method !== 'GET') return send<T>(method, path, body, options);
  const key = `${options.silent ? 'bg:' : ''}${path}?${new URLSearchParams(options.params ?? {})}`;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const task = send<T>(method, path, body, options).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

async function send<T>(method: string, path: string, body: unknown, { params, silent = false, memoMs = 0 }: ApiOptions): Promise<T> {
  const query = params ? `?${new URLSearchParams(params)}` : '';
  const memoKey = method === 'GET' && memoMs > 0 ? `${path}${query}` : null;
  if (memoKey) {
    const hit = memo.get(memoKey);
    if (hit && Date.now() - hit.at < memoMs) return hit.data as T;
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (silent) headers['X-Background'] = '1';

  const task = fetch(`${API_BASE}${path}${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).then(async res => {
    // backend ส่ง header นี้เมื่อ cookie login ที่ส่งไปหมดอายุแล้ว (request ยังสำเร็จในฐานะผู้เยี่ยมชม)
    if (res.headers.get('X-Session-Expired') === '1') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // 502–504 = proxy ต่อ backend ไม่ได้ (backend ไม่ได้รัน/ล่ม) — ไม่มีข้อความจาก backend ให้ใช้
      const fallback = res.status >= 502 && res.status <= 504 ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (backend ไม่ตอบสนอง) กรุณาลองใหม่อีกครั้ง' : `API error ${res.status}`;
      const message = (data as { message?: string } | null)?.message || fallback;
      throw new ApiError(res.status, message);
    }
    if (memoKey) memo.set(memoKey, { at: Date.now(), data });
    return data as T;
  });

  return task;
}

/** ทุก service ควรเรียก backend ผ่านฟังก์ชันเหล่านี้ จะได้มี spinner, cookie login และจัดการ session หมดอายุให้อัตโนมัติ */
export const apiGet = <T>(path: string, options: ApiOptions = {}) => request<T>('GET', path, undefined, options);
export const apiPost = <T>(path: string, body?: unknown, options: ApiOptions = {}) => request<T>('POST', path, body, options);
export const apiPut = <T>(path: string, body?: unknown, options: ApiOptions = {}) => request<T>('PUT', path, body, options);
export const apiDelete = <T>(path: string, options: ApiOptions = {}) => request<T>('DELETE', path, undefined, options);
