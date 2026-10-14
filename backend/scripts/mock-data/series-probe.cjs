// อ่านอย่างเดียว · ยอดรวมรายเดือน (ไม่มีข้อมูลรายคน) — คำสั่งเดียวกับ hos-g2 / hos-q2 เดิม แต่ตัดที่ "ถึงเมื่อวาน" (วันนี้ยังไม่จบวัน)
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
const env = process.env;
const OUT = __dirname + '/series2.json';
const TO = 'DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
const off = c => `ROUND(AVG(CASE WHEN ${c} IS NOT NULL AND ${c} <> '00:00:00' AND TIME_TO_SEC(TIMEDIFF(${c}, vsttime)) BETWEEN 0 AND 14400 THEN TIME_TO_SEC(TIMEDIFF(${c}, vsttime))/60 END),1)`;
const COLS = `${off('service4')} c4, ${off('service3')} c3, ${off('service5')} c5, ${off('service7')} c7, ${off('service6')} c6, COUNT(*) n`;
const W = 'DAYOFWEEK(vstdate) BETWEEN 2 AND 6';
const Q = {
  meta: `SELECT CURDATE() today, ${TO} upto`,
  mOpd: `SELECT DATE_FORMAT(vstdate,'%Y-%m') m, COUNT(*) n FROM ovst WHERE vstdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 26 MONTH) AND ${TO} GROUP BY m ORDER BY m`,
  mEr: `SELECT DATE_FORMAT(vstdate,'%Y-%m') m, COUNT(*) n FROM er_regist WHERE vstdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 26 MONTH) AND ${TO} GROUP BY m ORDER BY m`,
  mAdmit: `SELECT DATE_FORMAT(regdate,'%Y-%m') m, COUNT(*) n FROM ipt WHERE regdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 26 MONTH) AND ${TO} GROUP BY m ORDER BY m`,
  mDch: `SELECT DATE_FORMAT(dchdate,'%Y-%m') m, COUNT(*) n FROM ipt WHERE dchdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 26 MONTH) AND ${TO} GROUP BY m ORDER BY m`,
  mRefer: `SELECT DATE_FORMAT(refer_date,'%Y-%m') m, COUNT(*) n FROM referout WHERE refer_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 26 MONTH) AND ${TO} GROUP BY m ORDER BY m`,
  mLos: `SELECT DATE_FORMAT(dchdate,'%Y-%m') m, ROUND(AVG(los),2) n, COUNT(*) c FROM an_stat WHERE dchdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 26 MONTH) AND ${TO} GROUP BY m ORDER BY m`,
  mNew: `SELECT DATE_FORMAT(firstday,'%Y-%m') m, COUNT(*) n FROM (SELECT hn, MIN(vstdate) firstday FROM ovst WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 61 MONTH) AND vstdate <= ${TO} GROUP BY hn) x WHERE firstday >= DATE_SUB(CURDATE(), INTERVAL 26 MONTH) GROUP BY m ORDER BY m`,
  qOffMonthly: `SELECT DATE_FORMAT(vstdate,'%Y-%m') m, ${COLS} FROM service_time WHERE vstdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 13 MONTH) AND ${TO} AND ${W} GROUP BY m ORDER BY m`,
  qOffDaily: `SELECT DATE_FORMAT(vstdate,'%Y-%m-%d') d, ${COLS} FROM service_time WHERE vstdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 45 DAY) AND ${TO} AND ${W} GROUP BY vstdate ORDER BY vstdate`,
  qOffAll: `SELECT ${COLS} FROM service_time WHERE vstdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 12 MONTH) AND ${TO} AND ${W}`,
  // ตรวจว่า ต.ค. บันทึกเวลาคิวลงที่อื่นหรือไม่ (ovst เทียบ service_time)
  octCheck: `SELECT (SELECT COUNT(*) FROM ovst WHERE vstdate BETWEEN '2026-10-01' AND ${TO}) ovst_n, (SELECT COUNT(*) FROM service_time WHERE vstdate BETWEEN '2026-10-01' AND ${TO}) st_n,
    (SELECT COUNT(*) FROM service_time WHERE vstdate BETWEEN '2026-09-01' AND '2026-09-30') st_sep, (SELECT COUNT(*) FROM ovst WHERE vstdate BETWEEN '2026-09-01' AND '2026-09-30') ovst_sep`,
};
(async () => {
  const conn = await mysql.createConnection({ host: env.HOSXP_HOST, port: Number(env.HOSXP_PORT || 3306), user: env.HOSXP_USER, password: env.HOSXP_PASSWORD, database: env.HOSXP_DATABASE, connectTimeout: 8000, charset: env.HOSXP_DB_CHARSET || 'utf8mb4' });
  await conn.query('SET SESSION TRANSACTION READ ONLY');
  const out = {};
  for (const [k, sql] of Object.entries(Q)) {
    const t = Date.now();
    const [rows] = await conn.query(sql);
    out[k] = rows.map(r => Object.fromEntries(Object.entries(r).map(([c, v]) => [c, v instanceof Date ? new Date(v.getTime() + 7 * 3600e3).toISOString().slice(0, 10) : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)])));
    console.log(`✓ ${k} (${rows.length}, ${Date.now() - t} ms)`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  await conn.end();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
