// การจ่ายยาผู้ป่วยทางไกล (visit แผนก 055 ที่มีรายการยา) — ยอดรวมรายวัน / รายยารายเดือน / สิทธิ · อ่านอย่างเดียว · ไม่มีข้อมูลรายคน
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
const FROM = "'2025-10-01'";
const TO = 'DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
const TELE = `v.main_dep = '055' AND v.vstdate BETWEEN ${FROM} AND ${TO}`;
(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.HOSXP_HOST, port: Number(e.HOSXP_PORT || 3306), user: e.HOSXP_USER, password: e.HOSXP_PASSWORD, database: e.HOSXP_DATABASE, charset: 'utf8mb4', dateStrings: true });
  await c.query('SET SESSION TRANSACTION READ ONLY');
  const q = async (label, sql) => { const t = Date.now(); const [r] = await c.query(sql); console.log(`✓ ${label} (${r.length} แถว, ${Date.now() - t} ms)`); return r; };
  const out = {};
  // รายวัน: visit ที่มียา · คนไม่ซ้ำ · จำนวนรายการ · ชิ้น · ทุน · ขาย
  out.daily = await q('daily', `SELECT v.vstdate d, COUNT(DISTINCT v.vn) n, COUNT(DISTINCT v.hn) p, COUNT(*) items,
      ROUND(SUM(o.qty)) qty, ROUND(SUM(o.qty * o.cost)) cost, ROUND(SUM(o.sum_price)) sale
    FROM ovst v JOIN opitemrece o ON o.vn = v.vn JOIN drugitems di ON di.icode = o.icode
    WHERE ${TELE} GROUP BY v.vstdate ORDER BY v.vstdate`);
  // รายยารายเดือน (อันดับยา)
  out.drugs = await q('drugs', `SELECT o.icode, MAX(di.name) name, MAX(di.units) unit, DATE_FORMAT(v.vstdate, '%Y-%m') m,
      ROUND(SUM(o.qty)) qty, ROUND(SUM(o.qty * o.cost), 2) cost, ROUND(SUM(o.sum_price), 2) sale
    FROM ovst v JOIN opitemrece o ON o.vn = v.vn JOIN drugitems di ON di.icode = o.icode
    WHERE ${TELE} GROUP BY o.icode, m`);
  // สิทธิ (visit ที่มียา)
  out.rights = await q('rights', `SELECT COALESCE(p.name, vs.pcode, 'ไม่ระบุ') name, COUNT(*) n
    FROM ovst v JOIN vn_stat vs ON vs.vn = v.vn LEFT JOIN pcode p ON p.code = vs.pcode
    WHERE ${TELE} AND EXISTS (SELECT 1 FROM opitemrece o JOIN drugitems di ON di.icode = o.icode WHERE o.vn = v.vn)
    GROUP BY name ORDER BY n DESC`);
  // คนไม่ซ้ำตามความยาวช่วง (ประมาณคนของช่วงหลายวัน)
  out.windows = await q('windows', [7, 30, 90, 365].map(n => `SELECT ${n} days, COUNT(DISTINCT v.vn) n, COUNT(DISTINCT v.hn) p
    FROM ovst v WHERE v.main_dep = '055' AND v.vstdate BETWEEN DATE_SUB(CURDATE(), INTERVAL ${n} DAY) AND ${TO}
    AND EXISTS (SELECT 1 FROM opitemrece o JOIN drugitems di ON di.icode = o.icode WHERE o.vn = v.vn)`).join(' UNION ALL '));
  const [meta] = await c.query(`SELECT ${TO} upto`);
  out.upto = meta[0].upto;
  const num = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, ['d', 'icode', 'name', 'unit', 'm'].includes(k) ? v : Number(v)]));
  for (const k of ['daily', 'drugs', 'rights', 'windows']) out[k] = out[k].map(num);
  fs.writeFileSync(__dirname + '/telerx.json', JSON.stringify(out));
  const tot = out.daily.reduce((a, r) => ({ n: a.n + r.n, sale: a.sale + r.sale }), { n: 0, sale: 0 });
  console.log('รวม', tot, '· ยา', new Set(out.drugs.map(d => d.icode)).size, 'รายการ · สิทธิ', out.rights.slice(0, 4).map(r => `${r.name} ${r.n}`).join(', '));
  await c.end();
})().catch(err => { console.error(err.message); process.exit(1); });
