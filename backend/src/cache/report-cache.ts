import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { DATA_DIR } from '../utils/paths';
import { logger } from '../utils/logger';
import type { ReportMeta } from '../types/reports.types';

export type { ReportMeta };

/**
 * ที่พักผลรายงาน (วิธี C: เตรียมล่วงหน้า + พักผลไว้) — กันไม่ให้ HOSxP ถูก query บ่อยเกินไป
 * - มีผลที่ยังไม่หมดอายุ → ตอบทันที ไม่เรียก loader
 * - หลายคำขอ key เดียวกันพร้อมกัน → เรียก loader ครั้งเดียว ทุกคนรอผลเดียวกัน
 * - loader (query HOSxP) ทำพร้อมกันได้ไม่เกิน HOSXP_MAX_CONCURRENT ที่เหลือเข้าคิว
 * - loader ล้มแต่มีผลเก่า → ส่งผลเก่า (stale) ดีกว่าหน้าว่าง
 * - บันทึกลงไฟล์ backend/data/report-cache.json — รีสตาร์ทแล้วใช้ต่อได้ ไม่ต้องดึง HOSxP ใหม่ทั้งชุด
 */

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const CACHE_CONFIG = {
  prewarmMinutes: num(process.env.CACHE_PREWARM_MINUTES, 30),
  ttlTodayMinutes: num(process.env.CACHE_TTL_TODAY_MINUTES, 30),
  ttlPastHours: num(process.env.CACHE_TTL_PAST_HOURS, 24),
  maxConcurrent: num(process.env.HOSXP_MAX_CONCURRENT, 2),
  maxEntries: 500,
};

const CACHE_FILE = path.join(DATA_DIR, 'report-cache.json');

interface Entry {
  report: string;
  data: unknown;
  fetchedAt: number;
  expiresAt: number;
  lastAccess: number;
  source: ReportMeta['source'];
}

export interface LoadOptions {
  /** ชื่อรายงาน (ใช้ใน log / หน้าสถานะ) */
  report: string;
  /** key ของผล = รายงาน + พารามิเตอร์ */
  key: string;
  ttlMs: number;
  source: ReportMeta['source'];
  loader: () => unknown | Promise<unknown>;
  /** ดึงใหม่แม้ผลเดิมยังไม่หมดอายุ (ใช้ตอนเตรียมล่วงหน้า / ผู้ดูแลสั่ง) */
  force?: boolean;
  /** ใครเป็นคนทำให้ต้องโหลด — prewarm ไม่ต้อง log ทีละรายการ */
  origin?: 'user' | 'prewarm';
}

/* ---------- คิวจำกัดจำนวน loader ที่ทำพร้อมกัน ---------- */
let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= CACHE_CONFIG.maxConcurrent) await new Promise<void>(resolve => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/* ---------- ตัวเก็บ ---------- */
const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
const stats = { hits: 0, misses: 0, coalesced: 0, staleServed: 0, errors: 0, loads: 0, loadMs: 0 };

function evictIfNeeded() {
  if (entries.size <= CACHE_CONFIG.maxEntries) return;
  // ลบตัวที่ไม่มีคนใช้นานที่สุดก่อน
  const oldest = [...entries.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  for (const [key] of oldest.slice(0, entries.size - CACHE_CONFIG.maxEntries)) entries.delete(key);
}

function toResult<T>(entry: Entry, stale: boolean): { data: T; meta: ReportMeta } {
  entry.lastAccess = Date.now();
  return { data: entry.data as T, meta: { asOf: new Date(entry.fetchedAt).toISOString(), stale, source: entry.source } };
}

async function load(opts: LoadOptions): Promise<Entry> {
  const existing = inflight.get(opts.key);
  if (existing) {
    stats.coalesced++;
    return existing;
  }
  const task = withSlot(async () => {
    const started = performance.now();
    const data = await opts.loader();
    const ms = Math.round(performance.now() - started);
    stats.loads++;
    stats.loadMs += ms;
    if (opts.origin !== 'prewarm') logger.cache(opts.report, opts.key, ms);
    const now = Date.now();
    const entry: Entry = { report: opts.report, data, fetchedAt: now, expiresAt: now + opts.ttlMs, lastAccess: now, source: opts.source };
    entries.set(opts.key, entry);
    evictIfNeeded();
    return entry;
  }).finally(() => inflight.delete(opts.key));
  inflight.set(opts.key, task);
  return task;
}

export const reportCache = {
  /** อ่านผล (จากที่พักไว้ หรือโหลดใหม่) พร้อมข้อมูลกำกับ */
  async get<T>(opts: LoadOptions): Promise<{ data: T; meta: ReportMeta }> {
    const cached = entries.get(opts.key);
    if (cached && !opts.force && cached.expiresAt > Date.now()) {
      stats.hits++;
      return toResult<T>(cached, false);
    }
    stats.misses++;
    try {
      return toResult<T>(await load(opts), false);
    } catch (error) {
      stats.errors++;
      if (cached) {
        // ดึงใหม่ไม่ได้ → ใช้ผลเก่าไปก่อน (หน้าเว็บขึ้นป้าย "ข้อมูลอาจไม่เป็นปัจจุบัน")
        stats.staleServed++;
        logger.warn(`[cache] ${opts.report} ดึงใหม่ไม่สำเร็จ ใช้ข้อมูลชุดเดิม — ${(error as Error).message}`);
        return toResult<T>(cached, true);
      }
      throw error;
    }
  },

  /** ผลของ key นี้ยังใช้ได้อยู่ไหม (ไม่นับเป็นการใช้งาน) */
  isFresh(key: string) {
    const entry = entries.get(key);
    return Boolean(entry && entry.expiresAt > Date.now());
  },

  /** สถานะสำหรับหน้าผู้ดูแล */
  status() {
    const now = Date.now();
    const byReport: Record<string, { entries: number; fresh: number; newest: string | null }> = {};
    for (const entry of entries.values()) {
      const r = (byReport[entry.report] ??= { entries: 0, fresh: 0, newest: null });
      r.entries++;
      if (entry.expiresAt > now) r.fresh++;
      const at = new Date(entry.fetchedAt).toISOString();
      if (!r.newest || at > r.newest) r.newest = at;
    }
    const lookups = stats.hits + stats.misses;
    return {
      entries: entries.size,
      running,
      queued: waiting.length,
      byReport,
      stats: { ...stats, hitRate: lookups ? Math.round((stats.hits / lookups) * 100) : null, avgLoadMs: stats.loads ? Math.round(stats.loadMs / stats.loads) : null },
      config: CACHE_CONFIG,
    };
  },

  /** อัตราใช้ผลที่พักไว้ (%) สำหรับสรุปรายชั่วโมง */
  hitRate() {
    const lookups = stats.hits + stats.misses;
    return lookups ? Math.round((stats.hits / lookups) * 100) : null;
  },

  /** บันทึกผลที่ยังไม่หมดอายุลงไฟล์ (เขียนไฟล์ชั่วคราวก่อนแล้วค่อยแทนที่ กันไฟล์เสียถ้าเครื่องดับกลางคัน) */
  saveToDisk() {
    try {
      const now = Date.now();
      const live = [...entries.entries()].filter(([, e]) => e.expiresAt > now);
      mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${CACHE_FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), entries: live }), 'utf8');
      renameSync(tmp, CACHE_FILE);
      return live.length;
    } catch (error) {
      logger.warn(`[cache] บันทึกลงไฟล์ไม่สำเร็จ — ${(error as Error).message}`);
      return 0;
    }
  },

  /** โหลดจากไฟล์ตอนเปิดเซิร์ฟเวอร์ — เอาเฉพาะที่ยังไม่หมดอายุ */
  loadFromDisk() {
    if (!existsSync(CACHE_FILE)) return 0;
    try {
      const saved = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as { entries?: [string, Entry][] };
      const now = Date.now();
      let count = 0;
      for (const [key, entry] of saved.entries ?? []) {
        if (entry.expiresAt > now) {
          entries.set(key, { ...entry, lastAccess: now });
          count++;
        }
      }
      return count;
    } catch (error) {
      logger.warn(`[cache] อ่านไฟล์ที่บันทึกไว้ไม่ได้ เริ่มใหม่ — ${(error as Error).message}`);
      return 0;
    }
  },
};
