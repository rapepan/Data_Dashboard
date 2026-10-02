import type { RowDataPacket } from 'mysql2/promise';
import { appDb } from '../repositories/app-db';
import { GUEST_NAME, readAuditFile, type AuditEntry } from './audit-log';
import { presence } from './presence';

/**
 * สรุปการใช้งาน (หน้าผู้ดูแล) — คำนวณจากประวัติการใช้งาน (audit_log) ที่เก็บอยู่แล้ว ไม่ได้เก็บอะไรเพิ่ม
 * - "เปิดดู" 1 ครั้ง = คนเดิม (หรือเครื่องเดิมสำหรับผู้เยี่ยมชม) เปิดหน้าเดิมห่างกันเกิน 5 นาที
 *   (หน้าหนึ่งเรียกข้อมูลหลายชุด / เปลี่ยนตัวกรองซ้ำ ๆ ไม่นับซ้ำ)
 * - ไม่นับบัญชีทดสอบ (ขึ้นต้นด้วย __)
 * - เวลาเป็นเวลาไทย (UTC+7)
 */
export const USAGE_RANGES = [7, 30, 90] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];

const OPEN_GAP_MS = 5 * 60_000;
const TH_OFFSET_MS = 7 * 3_600_000;
const MAX_ROWS = 200_000;

/** API ที่หน้าเว็บเรียก → หน้า (key ตรงกับเมนูใน frontend/src/routes/navigation.ts) */
const PAGE_OF_API: [prefix: string, key: string][] = [
  ['/api/dashboard/', 'dashboard'],
  ['/api/icd10/', 'icd10'],
  ['/api/queue/', 'queue'],
  ['/api/opd/', 'opd'],
  ['/api/ipd/', 'ipd'],
  ['/api/er/', 'er'],
  ['/api/dental/', 'dental'],
  ['/api/physio/', 'physio'],
  ['/api/telemedicine/', 'tele'],
  ['/api/postal-drug/', 'postal'],
  ['/api/thai-medicine/', 'thaimed'],
  ['/api/drug-budget/', 'drugbudget'],
  ['/api/readmit/', 'readmit'],
  ['/api/referral/', 'referral'],
  ['/api/admin/users', 'admin-users'],
  ['/api/admin/feedback', 'admin-feedback'],
  ['/api/admin/cache', 'admin-data'],
  ['/api/admin/system', 'admin-system'],
  ['/api/admin/audit', 'admin-audit'],
  ['/api/admin/usage', 'admin-usage'],
];

export function pageOfApi(path: string | undefined): string | null {
  if (!path) return null;
  return PAGE_OF_API.find(([prefix]) => path.startsWith(prefix))?.[1] ?? null;
}

type Row = Pick<AuditEntry, 'time' | 'loginname' | 'action' | 'detail' | 'ip'>;
const ACTIONS = ['view', 'export', 'login', 'login_failed'];

async function readRows(since: Date): Promise<Row[]> {
  if (!appDb.isConfigured()) {
    const from = since.toISOString();
    return readAuditFile().filter(e => e.time >= from && ACTIONS.includes(e.action) && !e.loginname.startsWith('__'));
  }
  const rows = await appDb.rows<RowDataPacket>(
    `SELECT time, loginname, action, detail, ip FROM ${appDb.t('audit_log')}
     WHERE time >= ? AND action IN (${ACTIONS.map(() => '?').join(', ')}) AND LEFT(loginname, 2) <> '__'
     ORDER BY time LIMIT ${MAX_ROWS}`,
    [since, ...ACTIONS]);
  return rows.map(r => ({
    time: (r.time instanceof Date ? r.time : new Date(r.time)).toISOString(),
    loginname: r.loginname, action: r.action, detail: r.detail ?? undefined, ip: r.ip ?? undefined,
  }));
}

/** วันที่ (YYYY-MM-DD) / ชั่วโมง / วันในสัปดาห์ ตามเวลาไทย */
function thai(t: number) {
  const d = new Date(t + TH_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), weekday: d.getUTCDay() };
}

export async function usageSummary(days: UsageRange, now = new Date()) {
  // เริ่มนับตั้งแต่เที่ยงคืน (เวลาไทย) ของวันแรกในช่วง — กราฟรายวันครบทุกวัน
  const todayStart = Date.parse(`${thai(now.getTime()).date}T00:00:00Z`) - TH_OFFSET_MS;
  const since = new Date(todayStart - (days - 1) * 86_400_000);
  const rows = await readRows(since);

  const dates = Array.from({ length: days }, (_, i) => thai(since.getTime() + i * 86_400_000).date);
  const daily = new Map(dates.map(d => [d, { views: 0, guestViews: 0, users: new Set<string>(), guests: new Set<string>() }]));
  const hourly = Array<number>(24).fill(0);
  const weekday = Array<number>(7).fill(0);
  const pages = new Map<string, { views: number; users: Set<string>; guestViews: number }>();
  const people = new Map<string, { views: number; exports: number; last: string }>();
  const lastOpen = new Map<string, number>();
  const exports: { time: string; loginname: string; detail: string }[] = [];
  const totals = { views: 0, guestViews: 0, exports: 0, logins: 0, loginFailed: 0 };
  const users = new Set<string>();
  const guests = new Set<string>();

  for (const r of rows) {
    const t = Date.parse(r.time);
    const guest = r.loginname === GUEST_NAME;
    const who = guest ? `guest:${r.ip ?? '?'}` : r.loginname;
    if (r.action === 'login') { totals.logins++; continue; }
    if (r.action === 'login_failed') { totals.loginFailed++; continue; }
    if (r.action === 'export') {
      totals.exports++;
      exports.push({ time: r.time, loginname: r.loginname, detail: r.detail ?? '' });
      if (!guest) {
        const p = people.get(r.loginname) ?? { views: 0, exports: 0, last: r.time };
        p.exports++; p.last = r.time;
        people.set(r.loginname, p);
      }
      continue;
    }

    // view → นับเป็นการเปิดดูหน้า (รวมคำขอที่ติดกันของหน้าเดียวกันเป็นครั้งเดียว)
    const page = pageOfApi(r.detail);
    if (!page) continue;
    const key = `${who}|${page}`;
    const prev = lastOpen.get(key);
    lastOpen.set(key, t);
    if (prev !== undefined && t - prev < OPEN_GAP_MS) continue;

    const { date, hour, weekday: wd } = thai(t);
    totals.views++;
    hourly[hour]++;
    weekday[wd]++;
    const day = daily.get(date);
    if (day) { day.views++; if (guest) day.guestViews++; (guest ? day.guests : day.users).add(who); }
    const pg = pages.get(page) ?? { views: 0, users: new Set<string>(), guestViews: 0 };
    pg.views++;
    if (guest) pg.guestViews++; else pg.users.add(who);
    pages.set(page, pg);
    if (guest) { totals.guestViews++; guests.add(who); continue; }
    users.add(who);
    const p = people.get(who) ?? { views: 0, exports: 0, last: r.time };
    p.views++; p.last = r.time;
    people.set(who, p);
  }

  const known = new Map((await presence.list().catch(() => [])).map(u => [u.loginname, u]));
  return {
    days,
    from: since.toISOString(),
    to: now.toISOString(),
    totals: { ...totals, users: users.size, guests: guests.size },
    daily: dates.map(date => {
      const d = daily.get(date)!;
      return { date, views: d.views, guestViews: d.guestViews, users: d.users.size, guests: d.guests.size };
    }),
    hourly,
    /** 0 = อาทิตย์ */
    weekday,
    pages: [...pages].map(([key, p]) => ({ key, views: p.views, users: p.users.size, guestViews: p.guestViews }))
      .sort((a, b) => b.views - a.views),
    topUsers: [...people].map(([loginname, p]) => ({
      loginname, name: known.get(loginname)?.name ?? loginname, position: known.get(loginname)?.position ?? '', ...p,
    })).sort((a, b) => b.views - a.views || b.exports - a.exports).slice(0, 10),
    recentExports: exports.slice(-15).reverse().map(e => ({ ...e, name: known.get(e.loginname)?.name ?? e.loginname })),
  };
}

export type UsageSummary = Awaited<ReturnType<typeof usageSummary>>;
