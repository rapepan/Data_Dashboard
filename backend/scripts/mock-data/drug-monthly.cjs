const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.HOSXP_HOST, port: Number(e.HOSXP_PORT || 3306), user: e.HOSXP_USER, password: e.HOSXP_PASSWORD, database: e.HOSXP_DATABASE, charset: 'utf8mb4' });
  await c.query('SET SESSION TRANSACTION READ ONLY');
  const out = {};
  let t = Date.now();
  [out.visits] = await c.query(`SELECT DATE_FORMAT(v.vstdate,'%Y-%m') m, COUNT(*) visits,
      SUM(EXISTS(SELECT 1 FROM opitemrece o JOIN drugitems d ON d.icode = o.icode WHERE o.vn = v.vn)) with_drug
    FROM ovst v WHERE v.vstdate BETWEEN '2025-10-01' AND DATE_SUB(CURDATE(), INTERVAL 1 DAY) GROUP BY m ORDER BY m`);
  console.log('visits', Date.now() - t, 'ms'); t = Date.now();
  [out.money] = await c.query(`SELECT DATE_FORMAT(o.vstdate,'%Y-%m') m, ROUND(SUM(o.qty * o.cost)) cost, ROUND(SUM(o.sum_price)) sale
    FROM opitemrece o JOIN drugitems d ON d.icode = o.icode
    WHERE o.vstdate BETWEEN '2025-10-01' AND DATE_SUB(CURDATE(), INTERVAL 1 DAY) GROUP BY m ORDER BY m`);
  console.log('money', Date.now() - t, 'ms');
  for (const r of out.visits) { const m = out.money.find(x => x.m === r.m); console.log(r.m, r.visits, r.with_drug, `${(r.with_drug / r.visits * 100).toFixed(1)}%`, '|', m.cost, m.sale, `${((m.sale - m.cost) / m.sale * 100).toFixed(1)}%`); }
  fs.writeFileSync(__dirname + '/drug-monthly.json', JSON.stringify(out));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
