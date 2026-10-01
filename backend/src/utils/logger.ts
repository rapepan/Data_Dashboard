/**
 * ข้อความในเทอร์มินัลของ backend — บรรทัดสั้น อ่านง่าย มีสีตามความสำคัญ
 * ห้ามพิมพ์รหัสผ่าน / token / ข้อมูลเชื่อมต่อฐานข้อมูล / ค่าค้นหาใน query string (อาจมี HN หรือชื่อผู้ป่วย)
 */

// ใส่สีเมื่อแสดงบนเทอร์มินัลจริง หรือรันผ่าน concurrently (ส่ง FORCE_COLOR มาให้) — ปิดได้ด้วย NO_COLOR
const useColor = !process.env.NO_COLOR && (Boolean(process.stdout.isTTY) || (Boolean(process.env.FORCE_COLOR) && process.env.FORCE_COLOR !== '0'));
const paint = (code: number) => (text: string | number) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));

export const color = {
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
  gray: paint(90),
  bold: paint(1),
};

/** request / query ที่ใช้เวลาเกินนี้ถือว่าช้า (ms) */
export const SLOW_REQUEST_MS = 1000;
export const SLOW_QUERY_MS = 1000;

/** IP เดียวส่ง request เกินนี้ภายใน 1 นาที = ถี่ผิดปกติ (สคริปต์/บอท) — ปรับได้ด้วย LOG_IP_RATE_PER_MIN */
const IP_RATE_PER_MIN = Number(process.env.LOG_IP_RATE_PER_MIN) || 300;

const dot = () => color.gray('·');

function statusColor(status: number) {
  if (status >= 500) return color.red;
  if (status >= 400) return color.yellow;
  return color.green;
}

/** IPv4 ที่มาในรูป IPv6 (::ffff:192.168.1.5) → 192.168.1.5 */
export function cleanIp(ip: string | undefined) {
  return (ip ?? '-').replace(/^::ffff:/, '');
}

export const formatMs = (ms: number) => (ms >= SLOW_QUERY_MS ? color.yellow(`${ms.toLocaleString()}ms`) : `${ms}ms`);

/* ---------- กล่องสรุป — หัวข้อชิดกันเป็นแนวเดียว ---------- */
// สระบน/ล่างและวรรณยุกต์ไทยไม่กินความกว้าง ต้องไม่นับตอนจัดแนว
const THAI_MARKS = /[ัิ-ฺ็-๎]/g;
// eslint-disable-next-line no-control-regex
const visibleWidth = (text: string) => text.replace(/\x1b\[\d+m/g, '').replace(THAI_MARKS, '').length;

export type BlockRow = [label: string, value: string | null];

/** พิมพ์กล่องสรุปหลายบรรทัด — แถวที่ค่าเป็น null ไม่แสดง */
export function printBlock(title: string, rows: BlockRow[], tone: (text: string) => string = color.bold) {
  const shown = rows.filter((row): row is [string, string] => row[1] !== null);
  const labelWidth = Math.max(0, ...shown.map(([label]) => visibleWidth(label)));
  console.log(tone(`┌─ ${title} ${'─'.repeat(Math.max(3, 52 - visibleWidth(title)))}`));
  for (const [label, value] of shown) console.log(`${tone('│')} ${label}${' '.repeat(labelWidth - visibleWidth(label))} : ${value}`);
  console.log(tone(`└${'─'.repeat(56)}`));
}

/* ---------- ชื่อหน้าจาก path ของ API (ใช้นับหน้าที่เปิดมากสุด) ---------- */
const PAGE_LABEL: Record<string, string> = {
  dashboard: 'หน้าแรก', icd10: 'ค้นหาโรค', queue: 'คิว', opd: 'OPD', ipd: 'IPD', er: 'ER',
  dental: 'ทันตกรรม', physio: 'กายภาพ', telemedicine: 'การแพทย์ทางไกล', 'postal-drug': 'ส่งยาไปรษณีย์',
  'thai-medicine': 'แพทย์แผนไทย', readmit: 'Re-admit', referral: 'ส่งต่อ', 'drug-budget': 'ปริมาณการใช้ยา',
  'stroke-unit': 'Stroke Unit', admin: 'ผู้ดูแลระบบ', feedback: 'แจ้งปัญหา',
};

const pageOf = (path: string) => PAGE_LABEL[path.replace(/^\/api\//, '').split(/[/?]/)[0]] ?? null;

/* ---------- เส้นคั่นวันที่ + สรุปรายวัน (พิมพ์ตอนข้ามเที่ยงคืน ก่อนเส้นคั่นของวันใหม่) ---------- */
const TZ = 'Asia/Bangkok';
let currentDay = '';
let currentDayLabel = '';

function dayHeader() {
  const now = new Date();
  const day = now.toLocaleDateString('en-CA', { timeZone: TZ });
  if (day === currentDay) return;
  if (currentDay) printDailySummary(currentDayLabel);
  currentDay = day;
  currentDayLabel = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  console.log(color.bold(`──────── ${currentDayLabel} ────────`));
}

/* ---------- สถิติ — เก็บ 2 ชุด: รายชั่วโมง และรายวัน ---------- */
interface PeriodStats {
  requests: number;
  errors: number;
  denied: number;
  totalMs: number;
  users: Set<string>;
  ips: Set<string>;
  pages: Map<string, number>;
  exports: number;
  logins: number;
  loginFailed: number;
  feedback: number;
  slowest: { label: string; ms: number } | null;
}

const newPeriod = (): PeriodStats => ({
  requests: 0, errors: 0, denied: 0, totalMs: 0, users: new Set(), ips: new Set(), pages: new Map(),
  exports: 0, logins: 0, loginFailed: 0, feedback: 0, slowest: null,
});

let hourStats = newPeriod();
let dayStats = newPeriod();
const bothPeriods = (update: (stats: PeriodStats) => void) => { update(hourStats); update(dayStats); };

/** "OPD 12 · หน้าแรก 10 · ER 5" */
function topPages(pages: Map<string, number>, limit: number) {
  if (pages.size === 0) return null;
  return [...pages].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([page, n]) => `${page} ${n.toLocaleString()}`).join(` ${dot()} `);
}

function problemsText(stats: PeriodStats) {
  const errors = stats.errors ? color.red(`error ${stats.errors}`) : color.green('error 0');
  return stats.denied ? `${errors} ${dot()} ${color.yellow(`ถูกปฏิเสธ ${stats.denied}`)}` : errors;
}

/** ส่วนเสริมของสรุป (cache / RAM / พื้นที่ข้อมูล) — ลงทะเบียนจากโมดูลอื่นเพื่อไม่ให้ import วนกัน */
const hourlyParts: (() => BlockRow)[] = [];
const dailyParts: (() => BlockRow)[] = [];

function printDailySummary(label: string) {
  const s = dayStats;
  dayStats = newPeriod();
  if (s.requests === 0) return;
  const avg = Math.round(s.totalMs / s.requests);
  printBlock(`สรุปทั้งวัน · ${label}`, [
    ['ผู้ใช้', `login ${s.users.size} คน ${dot()} ${s.ips.size} เครื่อง (IP)`],
    ['เข้าสู่ระบบ', `สำเร็จ ${s.logins} ครั้ง${s.loginFailed ? ` ${dot()} ${color.yellow(`ไม่สำเร็จ ${s.loginFailed} ครั้ง`)}` : ''}`],
    ['การใช้งาน', `${s.requests.toLocaleString()} request ${dot()} เฉลี่ย ${avg}ms ${dot()} ${problemsText(s)}`],
    ['หน้าที่เปิดมากสุด', topPages(s.pages, 5)],
    ['ส่งออกไฟล์', `${s.exports} ครั้ง`],
    ['แจ้งปัญหาใหม่', s.feedback ? color.yellow(`${s.feedback} เรื่อง`) : '0 เรื่อง'],
    ...dailyParts.map(part => part()),
  ], color.cyan);
}

/* ---------- เฝ้าระวัง IP ที่ส่ง request ถี่ผิดปกติ ---------- */
const ipRate = new Map<string, { start: number; count: number; warnedAt: number }>();

function watchIpRate(ip: string, who: string) {
  const now = Date.now();
  if (ipRate.size > 1000) for (const [key, v] of ipRate) if (now - v.start > 60_000) ipRate.delete(key);
  const entry = ipRate.get(ip) ?? { start: now, count: 0, warnedAt: 0 };
  if (now - entry.start > 60_000) { entry.start = now; entry.count = 0; }
  entry.count++;
  ipRate.set(ip, entry);
  // เตือนซ้ำได้ทุก 10 นาทีต่อ IP กันเทอร์มินัลรก
  if (entry.count > IP_RATE_PER_MIN && now - entry.warnedAt > 10 * 60_000) {
    entry.warnedAt = now;
    console.warn(color.yellow(`[เฝ้าระวัง] ⚠ ${ip} ส่ง request ถี่ผิดปกติ: เกิน ${IP_RATE_PER_MIN} ครั้งใน 1 นาที ${dot()} ผู้ใช้ ${who}`));
  }
}

export const logger = {
  /** 1 บรรทัดต่อ request: method สถานะ path ผู้เรียก IP เวลา — ตัด query string ออก (อาจมีคำค้น/ข้อมูลอ่อนไหว) */
  request(method: string, status: number, url: string, who: string, ip: string, ms: number) {
    dayHeader();
    const path = url.split('?')[0];
    const time = ms >= SLOW_REQUEST_MS ? color.yellow(`${ms}ms ⚠ ช้า`) : color.gray(`${ms}ms`);
    const user = who === 'guest' ? color.gray(who) : color.cyan(who);
    console.log(`${method.padEnd(6)} ${statusColor(status)(status)} ${path} ${dot()} ${user} ${dot()} ${color.gray(ip)} ${dot()} ${time}`);

    bothPeriods(s => {
      s.requests++;
      s.totalMs += ms;
      if (status >= 500) s.errors++;
      if (status === 401 || status === 403) s.denied++;
      if (who !== 'guest') s.users.add(who);
      s.ips.add(ip);
    });
    watchIpRate(ip, who);
  },

  /** เปิดดูหน้า (ไม่นับ auto-refresh) — ใช้นับหน้าที่เปิดมากสุดในสรุป */
  pageView(path: string) {
    const page = pageOf(path);
    if (page) bothPeriods(s => s.pages.set(page, (s.pages.get(page) ?? 0) + 1));
  },

  /** ผู้ดูแลเปิดหน้าผู้ดูแลระบบ (ประวัติการใช้งาน / แจ้งปัญหา / ข้อมูลพักไว้) */
  adminView(who: string, ip: string, page: string) {
    dayHeader();
    console.log(`${color.cyan('[admin]')} 👁 ${color.cyan(who)} ${dot()} ${color.gray(ip)} ${dot()} เปิดดู ${page}`);
  },

  /** นับเหตุการณ์สำหรับสรุปรายวัน */
  tally(event: 'logins' | 'loginFailed' | 'feedback') {
    bothPeriods(s => { s[event]++; });
  },

  /** เหตุการณ์ login / logout */
  auth(ok: boolean, message: string) {
    dayHeader();
    const line = `[auth] ${ok ? '✔' : '✖'} ${message}`;
    if (ok) console.log(color.green(line));
    else console.warn(color.yellow(line));
  },

  /** พยายามเข้าส่วนที่ไม่มีสิทธิ์ */
  denied(who: string, ip: string, path: string, reason: string) {
    dayHeader();
    console.warn(color.yellow(`[auth] ⛔ ${who} ${dot()} ${ip} ${dot()} ${path.split('?')[0]} ${dot()} ${reason}`));
  },

  /** ส่งออก Excel / พิมพ์ PDF */
  export(who: string, ip: string, detail: string) {
    dayHeader();
    console.log(`${color.cyan('[export]')} ${who} ${dot()} ${color.gray(ip)} ${dot()} ${detail}`);
    bothPeriods(s => { s.exports++; });
  },

  /** error ที่เกิดในเบราว์เซอร์ของผู้ใช้ */
  client(who: string, ip: string, page: string, message: string, stack?: string) {
    dayHeader();
    console.error(color.red(`[client] ✖ ${who} · ${ip} · ${page} · ${message}`));
    if (stack) console.error(color.gray(stack));
  },

  /** เวลาที่ใช้ query HOSxP — แสดงทุกครั้ง ถ้าช้าขึ้นสีเหลือง */
  query(label: string, ms: number, rows: number) {
    dayHeader();
    const time = ms >= SLOW_QUERY_MS ? color.yellow(`${ms.toLocaleString()}ms ⚠ ช้า`) : color.gray(`${ms}ms`);
    console.log(`${color.cyan('[hosxp]')} ${time} ${dot()} ${label} ${dot()} ${color.gray(`${rows} แถว`)}`);
    bothPeriods(s => { if (!s.slowest || ms > s.slowest.ms) s.slowest = { label, ms }; });
  },

  /** โหลดรายงานใหม่เพราะผู้ใช้เปิดช่วงที่ยังไม่มีผลพักไว้ (= query HOSxP จริงเมื่อต่อแล้ว) */
  cache(report: string, key: string, ms: number) {
    dayHeader();
    const params = key.split('?')[1] ?? '';
    const time = ms >= SLOW_QUERY_MS ? color.yellow(`${ms.toLocaleString()}ms ⚠ ช้า`) : color.gray(`${ms}ms`);
    console.log(`${color.cyan('[cache]')} ↻ โหลดใหม่ ${report} ${dot()} ${color.gray(params.replace(/&/g, ' '))} ${dot()} ${time}`);
  },

  /** รอบเตรียมข้อมูลล่วงหน้า */
  prewarm(phase: 'start' | 'done' | 'fail', message: string) {
    dayHeader();
    if (phase === 'start') console.log(`${color.cyan('[prewarm]')} ▶ เริ่มรอบ · ${message}`);
    else if (phase === 'done') console.log(color.green(`[prewarm] ✔ เสร็จ · ${message}`));
    else console.warn(color.yellow(`[prewarm] ✖ ${message}`));
  },

  addHourlyPart(part: () => BlockRow) {
    hourlyParts.push(part);
  },

  addDailyPart(part: () => BlockRow) {
    dailyParts.push(part);
  },

  /** สถานะการเชื่อมต่อ HOSxP เปลี่ยน */
  hosxpStatus(up: boolean, message: string) {
    dayHeader();
    if (up) console.log(color.green(`[hosxp] ✔ ${message}`));
    else console.error(color.red(`[hosxp] ✖ ${message}`));
  },

  /** เฝ้าระวังทรัพยากรเครื่อง (RAM / พื้นที่ข้อมูล) */
  watch(message: string) {
    dayHeader();
    console.warn(color.yellow(`[เฝ้าระวัง] ⚠ ${message}`));
  },

  /** error ที่หลุดจากทุกจุดดัก — กล่องสีแดงให้เห็นชัด */
  crash(title: string, error: unknown, fatal: boolean) {
    dayHeader();
    const err = error instanceof Error ? error : new Error(String(error));
    printBlock(`✖ ${title}`, [
      ['ข้อความ', err.message],
      ['ผลกระทบ', fatal ? 'เซิร์ฟเวอร์จะปิดตัว — เปิดใหม่ด้วย npm run dev' : 'เซิร์ฟเวอร์ยังทำงานต่อ (request นั้นอาจไม่ได้คำตอบ)'],
    ], color.red);
    if (err.stack) console.error(color.gray(err.stack));
  },

  info(message: string) {
    dayHeader();
    console.log(message);
  },

  warn(message: string) {
    dayHeader();
    console.warn(color.yellow(`⚠ ${message}`));
  },

  error(message: string, error?: unknown) {
    dayHeader();
    console.error(color.red(`✖ ${message}`));
    if (error instanceof Error && error.stack) console.error(color.gray(error.stack));
  },

  /**
   * สรุปทุก 1 ชั่วโมง (ไม่มีการใช้งานเลยก็ไม่พิมพ์) + ตรวจข้ามวันทุกนาที
   * → สรุปทั้งวันพิมพ์ตอนเที่ยงคืนแม้ไม่มีใครใช้งานช่วงนั้น
   */
  startSummaries() {
    const hourly = setInterval(() => {
      const s = hourStats;
      hourStats = newPeriod();
      if (s.requests === 0) return;
      dayHeader();
      const avg = Math.round(s.totalMs / s.requests);
      const until = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
      printBlock(`สรุป 1 ชั่วโมง · ถึง ${until} น.`, [
        ['การใช้งาน', `${s.requests.toLocaleString()} request ${dot()} ผู้ใช้ login ${s.users.size} คน ${dot()} ${s.ips.size} เครื่อง (IP)`],
        ['ความเร็ว', `เฉลี่ย ${avg}ms${s.slowest ? ` ${dot()} query ช้าสุด ${formatMs(s.slowest.ms)} (${s.slowest.label})` : ''}`],
        ['ปัญหา', problemsText(s)],
        ['หน้าที่เปิดมากสุด', topPages(s.pages, 3)],
        ...hourlyParts.map(part => part()),
      ]);
    }, 60 * 60 * 1000);
    const midnight = setInterval(dayHeader, 60 * 1000);
    hourly.unref();
    midnight.unref();
  },
};
