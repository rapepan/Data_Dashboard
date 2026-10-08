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
/** ผู้ดูแลสั่งรีสตาร์ท: ระหว่างนี้ตรวจถี่ และแสดงแถบ "กำลังเริ่มใหม่" แทนหน้าเชื่อมต่อไม่ได้ · เกินเวลานี้ยังไม่กลับ = ถือว่าล่ม */
const RESTART_GRACE_MS = 90_000;
const RESTART_POLL_MS = 2_000;
const CHANNEL_NAME = 'bsth-system';

interface State {
  status: SystemStatus | null;
  unreachable: boolean;
  /** ตรวจครั้งถัดไปเมื่อไร */
  nextCheckAt: number;
  /** ผู้ดูแลสั่งรีสตาร์ทเมื่อไร (ยังไม่กลับมา) — null = ไม่ได้รีสตาร์ท */
  restartingSince: number | null;
}

type LiveMessage = { type: 'status'; status: SystemStatus } | { type: 'alive' } | { type: 'down' } | { type: 'restarting' };

let state: State = { status: null, unreachable: false, nextCheckAt: 0, restartingSince: null };
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

const restarting = () => state.restartingSince !== null && Date.now() - state.restartingSince < RESTART_GRACE_MS;

function nextPoll() {
  if (restarting()) return RESTART_POLL_MS;
  return state.unreachable || failures > 0 ? RETRY_MS : liveHealthy() ? LIVE_POLL_MS : POLL_MS;
}

/** ผู้ดูแลสั่งรีสตาร์ท (ได้ข่าวจากช่องสัญญาณสด หรือหน้าผู้ดูแลกดเอง) */
export function markRestarting() {
  if (restarting()) return;
  failures = 0;
  set({ restartingSince: Date.now(), unreachable: false });
  schedule(RESTART_POLL_MS);
}

function applyLive(status: SystemStatus) {
  liveAt = Date.now();
  failures = 0;
  set({ status, unreachable: false, restartingSince: null });
  schedule(nextPoll());
}

/** ตรวจสถานะทันที — ซ้อนกันไม่ได้ */
export async function check() {
  if (checking) return;
  checking = true;
  try {
    const status = await systemService.status();
    failures = 0;
    // ยังอยู่ช่วงปิดตัว (ตอบได้ก่อนปิดจริง 1 วินาที) — ไม่นับว่ากลับมาแล้ว ถ้าเพิ่งสั่งไม่ถึง 3 วินาที
    const stillClosing = state.restartingSince !== null && Date.now() - state.restartingSince < 3_000;
    set({ status, unreachable: false, ...(stillClosing ? {} : { restartingSince: null }) });
  } catch (error) {
    // backend ตอบกลับมาเป็น error ธรรมดา (เช่น 500) ไม่นับว่าล่ม · เรียกไม่ได้เลย/502–504 = ล่มหรือกำลังอัปเดต
    const down = !(error instanceof ApiError) || (error.status >= 502 && error.status <= 504);
    if (down) failures++;
    // ระหว่างรีสตาร์ทไม่ขึ้นหน้าเชื่อมต่อไม่ได้ (แสดงแถบ "กำลังเริ่มใหม่" แทน) · เกินเวลาแล้วยังไม่กลับ = ล่ม
    if (failures >= 2 && !restarting()) set({ unreachable: true, restartingSince: null });
  } finally {
    checking = false;
    schedule(nextPoll());
  }
}

/* ───────── ช่องสัญญาณสด ───────── */

let channel: BroadcastChannel | null = null;
let stopLive: (() => void) | null = null;

/** ต่อได้แต่ไม่มีข้อมูลมาเลย (proxy พักข้อมูลไว้ เช่น Cloudflare quick tunnel) — นานเท่านี้ถือว่าใช้ไม่ได้ */
const FIRST_DATA_MS = 10_000;
/** server ส่ง ping ทุก 25 วินาที — เงียบเกินนี้ถือว่าสายค้าง */
const STALL_MS = 80_000;
/** ใช้ไม่ได้แล้วรอนานเท่านี้ค่อยลองต่อใหม่ (ระหว่างนั้นตรวจตามรอบ 1 นาที) */
const REOPEN_MS = 5 * 60_000;

/**
 * เปิด EventSource จริง (เฉพาะแท็บหัวหน้า หรือทุกแท็บถ้าเบราว์เซอร์ไม่รองรับการแบ่งกัน) · คืนฟังก์ชันปิด
 * นับว่า "สด" เฉพาะเมื่อมีข้อมูลเข้ามาจริง (status / ping) — แค่ต่อติดไม่พอ เพราะ proxy บางตัวรับสายแต่พักข้อมูลไว้
 */
function openEventSource() {
  let source: EventSource | null = null;
  let lastData = 0;
  let stopped = false;
  let firstTimer: number | undefined;
  let reopenTimer: number | undefined;

  const markData = () => {
    lastData = Date.now();
    liveAt = lastData;
    channel?.postMessage({ type: 'alive' } satisfies LiveMessage);
  };
  // ปิดเส้นที่ใช้ไม่ได้ → กลับไปตรวจตามรอบ แล้วค่อยลองใหม่ (ไม่ถือสายค้างไว้เปล่า ๆ)
  const giveUp = () => {
    if (!source) return; // เลิกไปแล้ว — กันตั้งเวลาลองใหม่ซ้อน
    window.clearTimeout(firstTimer);
    source.close();
    source = null;
    liveAt = 0;
    channel?.postMessage({ type: 'down' } satisfies LiveMessage);
    if (!stopped) reopenTimer = window.setTimeout(open, REOPEN_MS);
  };

  function open() {
    lastData = 0;
    source = new EventSource(EVENTS_URL, { withCredentials: true });
    source.addEventListener('status', event => {
      try {
        const status = JSON.parse((event as MessageEvent<string>).data) as SystemStatus;
        markData();
        applyLive(status);
        channel?.postMessage({ type: 'status', status } satisfies LiveMessage);
      } catch { /* ข้อมูลเสีย — รอรอบถัดไป */ }
    });
    source.addEventListener('ping', markData);
    source.addEventListener('restarting', () => {
      markData();
      markRestarting();
      channel?.postMessage({ type: 'restarting' } satisfies LiveMessage);
    });
    // หลุด (server รีสตาร์ท/ล่ม) — EventSource ต่อใหม่เองทุก 3 วินาที · ระหว่างนั้นตรวจทันทีเพื่อรู้ให้เร็วว่าล่มหรือไม่
    // server ตอบไม่ใช่ 200 (เช่น 429 เต็ม) — EventSource เลิกต่อเอง (CLOSED) → ลองใหม่ภายหลัง
    source.onerror = () => {
      liveAt = 0;
      channel?.postMessage({ type: 'down' } satisfies LiveMessage);
      void check();
      if (source?.readyState === EventSource.CLOSED) giveUp();
    };
    window.clearTimeout(firstTimer);
    firstTimer = window.setTimeout(() => { if (!lastData) giveUp(); }, FIRST_DATA_MS);
  }

  open();
  const stall = window.setInterval(() => {
    if (source && lastData && Date.now() - lastData > STALL_MS) giveUp();
  }, ALIVE_MS);

  return () => {
    stopped = true;
    window.clearTimeout(firstTimer);
    window.clearTimeout(reopenTimer);
    window.clearInterval(stall);
    source?.close();
  };
}

function onChannel(event: MessageEvent<LiveMessage>) {
  const msg = event.data;
  if (msg.type === 'status') applyLive(msg.status);
  else if (msg.type === 'alive') liveAt = Date.now();
  else if (msg.type === 'restarting') markRestarting();
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
