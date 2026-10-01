import { CACHE_CONFIG, reportCache } from './report-cache';
import { cacheKey, getReport, REPORTS } from './report-registry';
import { notifyService } from '../services/notify.service';
import { logger } from '../utils/logger';

/**
 * เตรียมข้อมูลล่วงหน้า — ทุก CACHE_PREWARM_MINUTES (ค่าเริ่มต้น 30) ตรงเวลา :00 / :30
 * ดึง "ช่วงยอดนิยม" ของทุกรายงานมาเก็บไว้ ทีละรายการ (ไม่ยิง HOSxP พร้อมกัน) ผู้ใช้จึงได้ผลทันที
 */

export interface PrewarmJobResult {
  report: string;
  label: string;
  params: string;
  ms: number;
  ok: boolean;
  error?: string;
}

interface PrewarmRun {
  reason: 'schedule' | 'startup' | 'manual';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  jobs: PrewarmJobResult[];
  failed: number;
}

/** ผู้ดูแลกดดึงใหม่ได้ไม่ถี่กว่านี้ */
const MANUAL_COOLDOWN_MS = 10 * 60_000;
/** ล้มกี่รอบติดถึงแจ้ง Telegram */
const ALERT_AFTER_FAILED_RUNS = 2;

const state = {
  running: false,
  current: null as PrewarmRun | null,
  last: null as PrewarmRun | null,
  nextAt: null as string | null,
  consecutiveFailedRuns: 0,
  alerted: false,
  lastManualAt: 0,
};

const describe = (p: Record<string, string>) =>
  Object.entries(p).map(([k, v]) => `${k}=${v}`).join(' ');

/** รอบเตรียมข้อมูล 1 รอบ — force=true ดึงใหม่ทั้งหมด / false = เฉพาะที่ยังไม่มีหรือหมดอายุ (ตอนเปิดเซิร์ฟเวอร์) */
async function run(reason: PrewarmRun['reason'], force: boolean) {
  if (state.running) return false;
  state.running = true;
  const started = performance.now();
  const runInfo: PrewarmRun = { reason, startedAt: new Date().toISOString(), finishedAt: null, durationMs: null, jobs: [], failed: 0 };
  state.current = runInfo;

  const jobs = REPORTS.flatMap(def => (def.prewarm?.() ?? []).map(params => ({ def, params })))
    .filter(({ def, params }) => force || !reportCache.isFresh(cacheKey(def.name, params)));
  logger.prewarm('start', `${reason === 'manual' ? 'ผู้ดูแลสั่ง' : reason === 'startup' ? 'เริ่มระบบ' : 'ตามรอบ'} · ${jobs.length} ชุด`);

  // ทีละรายการ — ไม่ให้ HOSxP ถูก query พร้อมกัน
  for (const { def, params } of jobs) {
    const t = performance.now();
    try {
      await getReport(def.name, params, { force: true, origin: 'prewarm' });
      runInfo.jobs.push({ report: def.name, label: def.label, params: describe(params), ms: Math.round(performance.now() - t), ok: true });
    } catch (error) {
      runInfo.failed++;
      runInfo.jobs.push({ report: def.name, label: def.label, params: describe(params), ms: Math.round(performance.now() - t), ok: false, error: (error as Error).message });
      logger.warn(`[prewarm] ✖ ${def.label} (${describe(params)}) — ${(error as Error).message}`);
    }
  }

  runInfo.finishedAt = new Date().toISOString();
  runInfo.durationMs = Math.round(performance.now() - started);
  state.last = runInfo;
  state.current = null;
  state.running = false;
  const saved = reportCache.saveToDisk();

  const seconds = (runInfo.durationMs / 1000).toFixed(1);
  if (runInfo.failed === 0) {
    logger.prewarm('done', `${jobs.length} ชุด · ${seconds} วินาที · บันทึกไฟล์ ${saved} ชุด`);
    if (state.alerted) notifyService.alert('✅ <b>ดึงข้อมูลจาก HOSxP กลับมาปกติแล้ว</b>');
    state.consecutiveFailedRuns = 0;
    state.alerted = false;
  } else {
    state.consecutiveFailedRuns++;
    logger.prewarm('fail', `ล้ม ${runInfo.failed}/${jobs.length} ชุด · ${seconds} วินาที (ติดกัน ${state.consecutiveFailedRuns} รอบ)`);
    if (state.consecutiveFailedRuns >= ALERT_AFTER_FAILED_RUNS && !state.alerted) {
      state.alerted = true;
      const failedLabels = [...new Set(runInfo.jobs.filter(j => !j.ok).map(j => j.label))].join(', ');
      notifyService.alert(`⚠️ <b>ดึงข้อมูลจาก HOSxP ไม่สำเร็จ ${state.consecutiveFailedRuns} รอบติด</b>\nรายงาน: ${failedLabels}\nหน้าเว็บยังแสดงข้อมูลชุดเดิมอยู่`);
    }
  }
  return true;
}

/** เวลาถัดไปที่ตรงรอบ (เช่น :00 / :30) */
function nextBoundary(from = new Date()) {
  const period = CACHE_CONFIG.prewarmMinutes * 60_000;
  // ปัดตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) — รอบ 30 นาทีตรง :00/:30 เหมือนกันทุกเขตเวลาที่ต่างกันเป็นชั่วโมงเต็ม
  return new Date(Math.floor(from.getTime() / period) * period + period);
}

let timer: NodeJS.Timeout | null = null;

function scheduleNext() {
  const next = nextBoundary();
  state.nextAt = next.toISOString();
  timer = setTimeout(() => {
    void run('schedule', true).finally(scheduleNext);
  }, next.getTime() - Date.now());
  timer.unref();
}

export const prewarm = {
  /** เริ่มตอนเปิดเซิร์ฟเวอร์: โหลดจากไฟล์ → เติมส่วนที่ขาดใน 10 วินาที → ตั้งรอบ :00/:30 */
  start() {
    const restored = reportCache.loadFromDisk();
    const startup = setTimeout(() => { void run('startup', false); }, 10_000);
    startup.unref();
    scheduleNext();
    return restored;
  },

  stop() {
    if (timer) clearTimeout(timer);
    reportCache.saveToDisk();
  },

  /** ผู้ดูแลสั่งดึงใหม่ทันที — จำกัดทุก 10 นาที */
  requestManual(): { ok: true } | { ok: false; reason: 'running' | 'cooldown'; retryAt?: string } {
    if (state.running) return { ok: false, reason: 'running' };
    const readyAt = state.lastManualAt + MANUAL_COOLDOWN_MS;
    if (Date.now() < readyAt) return { ok: false, reason: 'cooldown', retryAt: new Date(readyAt).toISOString() };
    state.lastManualAt = Date.now();
    void run('manual', true);
    return { ok: true };
  },

  status() {
    return {
      running: state.running,
      current: state.current && { reason: state.current.reason, startedAt: state.current.startedAt, done: state.current.jobs.length },
      last: state.last,
      nextAt: state.nextAt,
      consecutiveFailedRuns: state.consecutiveFailedRuns,
      manualAvailableAt: state.lastManualAt ? new Date(state.lastManualAt + MANUAL_COOLDOWN_MS).toISOString() : null,
      intervalMinutes: CACHE_CONFIG.prewarmMinutes,
    };
  },
};
