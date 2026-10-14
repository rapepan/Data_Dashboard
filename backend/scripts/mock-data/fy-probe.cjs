// อ่านอย่างเดียว · ยอดรวมรายเดือน ต.ค. 68 – เมื่อวาน (ไม่มีข้อมูลรายคน) — ปรับข้อมูลจำลองตามปีงบให้ตรงฐาน
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
const env = process.env;
const FROM = "'2025-10-01'";
const TO = 'DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
const M = c => `DATE_FORMAT(${c},'%Y-%m')`;
const catalog = [...fs.readFileSync(BACKEND + '/src/services/drug-catalog.ts', 'utf8').matchAll(/code: "(\d+)"/g)].map(m => m[1]);
const HERB_ICODES = ['1540053', '1543062', '1650046', '1543009', '1650044', '1680024', '1650033', '1500449', '1500212', '1540012', '1680026', '1540018', '1680020', '1540011', '1540043'];
const Q = {
  tele: `SELECT ${M('vstdate')} m, COUNT(*) n FROM ovst WHERE main_dep = '055' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m ORDER BY m`,
  postalMed: `SELECT ${M('prscrpt_delivery_med_datetime')} m, COUNT(*) n, SUM(prscrpt_delivery_med_home = 'Y') home FROM prscrpt_delivery_med WHERE prscrpt_delivery_med_datetime >= ${FROM} GROUP BY m ORDER BY m`,
  postalDelivery: `SELECT ${M('entry_datetime')} m, COUNT(*) n FROM prscrpt_delivery WHERE entry_datetime >= ${FROM} GROUP BY m ORDER BY m`,
  dental: `SELECT ${M('vstdate')} m, COUNT(DISTINCT vn) n FROM dtmain WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m ORDER BY m`,
  thai041: `SELECT ${M('vstdate')} m, COUNT(*) visits, COUNT(DISTINCT hn) persons FROM ovst WHERE main_dep = '041' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m ORDER BY m`,
  chinese049: `SELECT ${M('vstdate')} m, COUNT(*) visits, COUNT(DISTINCT hn) persons FROM ovst WHERE main_dep = '049' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m ORDER BY m`,
  thaiService: `SELECT ${M('service_date')} m, COUNT(*) n FROM health_med_service WHERE service_date BETWEEN ${FROM} AND ${TO} GROUP BY m ORDER BY m`,
  thaiRights: `SELECT ${M('o.vstdate')} m, CASE v.pcode WHEN 'AG' THEN 0 WHEN 'UC' THEN 1 WHEN 'A2' THEN 2 ELSE 9 END r, COUNT(*) n FROM ovst o JOIN vn_stat v ON v.vn = o.vn WHERE o.main_dep IN ('041','049') AND o.vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, r ORDER BY m, r`,
  thaiRightNames: `SELECT v.pcode, COALESCE(p.name, v.pcode) name, COUNT(*) n FROM ovst o JOIN vn_stat v ON v.vn = o.vn LEFT JOIN pcode p ON p.code = v.pcode WHERE o.main_dep IN ('041','049') AND o.vstdate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY v.pcode, name ORDER BY n DESC LIMIT 6`,
  herbMonthly: `SELECT ${M('vstdate')} m, SUM(qty) qty FROM opitemrece WHERE vstdate BETWEEN ${FROM} AND ${TO} AND icode IN (?) GROUP BY m ORDER BY m`,
  drugs: `SELECT icode, ${M('vstdate')} m, SUM(qty) qty FROM opitemrece WHERE vstdate BETWEEN ${FROM} AND ${TO} AND icode IN (?) GROUP BY icode, m`,
};
const PARAMS = { herbMonthly: [HERB_ICODES], drugs: [catalog] };
(async () => {
  const conn = await mysql.createConnection({ host: env.HOSXP_HOST, port: Number(env.HOSXP_PORT || 3306), user: env.HOSXP_USER, password: env.HOSXP_PASSWORD, database: env.HOSXP_DATABASE, connectTimeout: 8000, charset: env.HOSXP_DB_CHARSET || 'utf8mb4' });
  await conn.query('SET SESSION TRANSACTION READ ONLY');
  const out = {};
  for (const [k, sql] of Object.entries(Q)) {
    const t = Date.now();
    try {
      const [rows] = await conn.query(sql, PARAMS[k] ?? []);
      out[k] = rows.map(r => Object.fromEntries(Object.entries(r).map(([c, v]) => [c, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && c !== 'icode' ? Number(v) : v])));
      console.log(`✓ ${k} (${rows.length}, ${Date.now() - t} ms)`);
    } catch (e) { out[k] = { error: e.message }; console.log(`✗ ${k} ${e.message.slice(0, 200)}`); }
  }
  fs.writeFileSync(__dirname + '/fy.json', JSON.stringify(out, null, 1));
  await conn.end();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
