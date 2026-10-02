import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, SYSTEM_CHECK_EVENT } from '../services/apiClient';
import { systemService, type SystemStatus } from '../services/systemService';

/**
 * สถานะระบบ (เวอร์ชัน / ประกาศ / โหมดปิดปรับปรุง) — ใช้ร่วมกันทั้งหน้าเว็บ
 * - ช่องสัญญาณสด (SSE): server ส่งสถานะใหม่มาทันทีที่เปลี่ยน · เปิดช่องเดียวต่อเบราว์เซอร์ (แท็บหัวหน้า)
 *   แล้วส่งต่อให้แท็บอื่นผ่าน BroadcastChannel — เปิดหลายแท็บก็ไม่เพิ่มภาระ server
 * - สำรอง: ตรวจเองทุก 1 นาที (ช่องสัญญาณปกติ → ทุก 5 นาที) · เรียก backend ไม่ได้ติดกัน 2 ครั้ง = unreachable → ตรวจทุก 10 วินาที
 */
const POLL_MS = 60_000;
const LIVE_POLL_MS = 5 * 60_000;
const RETRY_MS = 10_000;
const ALIVE_MS = 30_000;
const EVENTS_URL = '/api/system/events';
const LOCK_NAME = 'bsth-system-live';
const CHANNEL_NAME = 'bsth-system';

interface State {
  status: SystemStatus | null;
  unreachable: boolean;
  /** ตรวจครั้งถัดไปเมื่อไร */
  nextCheckAt: number;
}

type LiveMessage = { type: 'status'; status: SystemStatus } | { type: 'alive' } | { type: 'down' };

let state: State = { status: null, unreachable: false, nextCheckAt: 0 };
let failures = 0;
let timer: number | undefined;
let users = 0;
let checking = false;
/** ได้ข่าวจากช่องสัญญาณสดล่าสุดเมื่อไร (ของแท็บนี้เองหรือแท็บหัวหน้า) */
let liveAt = 0;
const listeners = new Set<() => void>();

const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
const liveHealthy = () => Date.now() - liveAt < ALIVE_MS * 2.5;

function schedule(ms: number) {
  window.clearTimeout(timer);
  if (users === 0) return;
  timer = window.setTimeout(() => void check(), ms);
  set({ nextCheckAt: Date.now() + ms });
}

function nextPoll() {
  return state.unreachable || failures > 0 ? RETRY_MS : liveHealthy() ? LIVE_POLL_MS : POLL_MS;
}

function applyLive(status: SystemStatus) {
  liveAt = Date.now();
  failures = 0;
  set({ status, unreachable: false });
  schedule(nextPoll());
}

/** ตรวจสถานะทันที — ซ้อนกันไม่ได้ */
export async function check() {
  if (checking) return;
  checking = true;
  try {
    const status = await systemService.status();
    failures = 0;
    set({ status, unreachable: false });
  } catch (error) {
    // backend ตอบกลับมาเป็น error ธรรมดา (เช่น 500) ไม่นับว่าล่ม · เรียกไม่ได้เลย/502–504 = ล่มหรือกำลังอัปเดต
    const down = !(error instanceof ApiError) || (error.status >= 502 && error.status <= 504);
    if (down) failures++;
    if (failures >= 2) set({ unreachable: true });
  } finally {
    checking = false;
    schedule(nextPoll());
  }
}

/* ───────── ช่องสัญญาณสด ───────── */

let channel: BroadcastChannel | null = null;
let stopLive: (() => void) | null = null;

/** เปิด EventSource จริง (เฉพาะแท็บหัวหน้า หรือทุกแท็บถ้าเบราว์เซอร์ไม่รองรับการแบ่งกัน) · คืนฟังก์ชันปิด */
function openEventSource() {
  const source = new EventSource(EVENTS_URL, { withCredentials: true });
  const alive = window.setInterval(() => {
    if (source.readyState !== EventSource.OPEN) return;
    liveAt = Date.now();
    channel?.postMessage({ type: 'alive' } satisfies LiveMessage);
  }, ALIVE_MS);

  source.addEventListener('status', event => {
    try {
      const status = JSON.parse((event as MessageEvent<string>).data) as SystemStatus;
      applyLive(status);
      channel?.postMessage({ type: 'status', status } satisfies LiveMessage);
    } catch { /* ข้อมูลเสีย — รอรอบถัดไป */ }
  });
  // หลุด (server รีสตาร์ท/ล่ม) — EventSource ต่อใหม่เองทุก 3 วินาที · ระหว่างนั้นตรวจทันทีเพื่อรู้ให้เร็วว่าล่มหรือไม่
  source.onerror = () => {
    liveAt = 0;
    channel?.postMessage({ type: 'down' } satisfies LiveMessage);
    void check();
  };

  return () => {
    window.clearInterval(alive);
    source.close();
  };
}

function onChannel(event: MessageEvent<LiveMessage>) {
  const msg = event.data;
  if (msg.type === 'status') applyLive(msg.status);
  else if (msg.type === 'alive') liveAt = Date.now();
  else if (msg.type === 'down') { liveAt = 0; void check(); }
}

function startLive() {
  if (typeof EventSource === 'undefined') return; // ไม่รองรับ — ใช้การตรวจตามรอบอย่างเดียว
  const canShare = typeof BroadcastChannel !== 'undefined' && typeof navigator !== 'undefined' && 'locks' in navigator;
  if (!canShare) {
    stopLive = openEventSource();
    return;
  }

  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = onChannel;
  // แท็บแรกได้กุญแจ = หัวหน้า เปิดช่องสัญญาณค้างไว้จนปิดแท็บ · แท็บอื่นรอคิว ปิดแท็บหัวหน้าแล้วแท็บถัดไปรับช่วงต่อทันที
  const abort = new AbortController();
  let closeSource: (() => void) | null = null;
  navigator.locks.request(LOCK_NAME, { signal: abort.signal }, () => new Promise<void>(release => {
    closeSource = openEventSource();
    abort.signal.addEventListener('abort', () => { closeSource?.(); release(); });
  })).catch(() => undefined); // abort ระหว่างรอคิว

  stopLive = () => {
    abort.abort();
    closeSource?.();
    channel?.close();
    channel = null;
  };
}

/* ───────── hook ───────── */

const onSignal = () => void check();
const onVisible = () => { if (document.visibilityState === 'visible') void check(); };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSystemStatus() {
  useEffect(() => {
    users++;
    if (users === 1) {
      void check();
      startLive();
      window.addEventListener(SYSTEM_CHECK_EVENT, onSignal);
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      users--;
      if (users === 0) {
        window.clearTimeout(timer);
        stopLive?.();
        stopLive = null;
        liveAt = 0;
        window.removeEventListener(SYSTEM_CHECK_EVENT, onSignal);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, []);
  return useSyncExternalStore(subscribe, () => state);
}
