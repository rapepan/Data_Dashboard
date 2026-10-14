// ยอดยารายวัน (ผู้ป่วยนอก opitemrece + drugitems): ชิ้น / ทุน / ขาย — ยอดรวมต่อวันเท่านั้น · อ่านอย่างเดียว → เพิ่มเข้า daily.json
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.HOSXP_HOST, port: Number(e.HOSXP_PORT || 3306), user: e.HOSXP_USER, password: e.HOSXP_PASSWORD, database: e.HOSXP_DATABASE, charset: 'utf8mb4', dateStrings: true });
  await c.query('SET SESSION TRANSACTION READ ONLY');
  const t = Date.now();
  const [rows] = await c.query(`SELECT o.vstdate d, ROUND(SUM(o.qty)) qty, ROUND(SUM(o.qty * o.cost)) cost, ROUND(SUM(o.sum_price)) sale
    FROM opitemrece o JOIN drugitems di ON di.icode = o.icode
    WHERE o.vstdate BETWEEN '2025-10-01' AND DATE_SUB(CURDATE(), INTERVAL 1 DAY) GROUP BY o.vstdate`);
  const j = require(__dirname + '/daily.json');
  j.daily.drug = rows.map(r => ({ d: r.d, qty: Number(r.qty), cost: Number(r.cost), sale: Number(r.sale) }));
  fs.writeFileSync(__dirname + '/daily.json', JSON.stringify(j));
  console.log('✓ daily drug', rows.length, 'วัน', Date.now() - t, 'ms · ล่าสุด', JSON.stringify(j.daily.drug.slice(-2)));
  await c.end();
})().catch(err => { console.error(err.message); process.exit(1); });
