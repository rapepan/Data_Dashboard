// ใบสั่งยาที่มียา (visit ผู้ป่วยนอกที่มีรายการยา) รายวัน — ยอดรวมต่อวันเท่านั้น · อ่านอย่างเดียว
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.HOSXP_HOST, port: Number(e.HOSXP_PORT || 3306), user: e.HOSXP_USER, password: e.HOSXP_PASSWORD, database: e.HOSXP_DATABASE, charset: 'utf8mb4', dateStrings: true });
  await c.query('SET SESSION TRANSACTION READ ONLY');
  const t = Date.now();
  const [rows] = await c.query(`SELECT v.vstdate d, COUNT(*) visits,
      SUM(EXISTS(SELECT 1 FROM opitemrece o JOIN drugitems di ON di.icode = o.icode WHERE o.vn = v.vn)) with_drug
    FROM ovst v WHERE v.vstdate BETWEEN '2025-10-01' AND DATE_SUB(CURDATE(), INTERVAL 1 DAY)
    GROUP BY v.vstdate ORDER BY v.vstdate`);
  console.log('rows', rows.length, Date.now() - t, 'ms');
  const days = rows.map(r => ({ d: r.d, visits: Number(r.visits), withDrug: Number(r.with_drug) }));
  fs.writeFileSync(__dirname + '/rx-daily.json', JSON.stringify(days));
  // สรุปตามวันในสัปดาห์ (0 = อาทิตย์)
  const dow = Array.from({ length: 7 }, () => ({ n: 0, v: 0, w: 0 }));
  for (const r of days) { const k = new Date(`${r.d}T00:00:00Z`).getUTCDay(); dow[k].n++; dow[k].v += r.visits; dow[k].w += r.withDrug; }
  console.log('ตามวัน (อา–ส): visits/วัน · มียา/วัน · %');
  dow.forEach((x, i) => console.log(i, (x.v / x.n).toFixed(1), (x.w / x.n).toFixed(1), `${(x.w / x.v * 100).toFixed(1)}%`));
  console.log('ล่าสุด 10 วัน:'); for (const r of days.slice(-10)) console.log(r.d, r.visits, r.withDrug);
  await c.end();
})().catch(err => { console.error(err.message); process.exit(1); });
