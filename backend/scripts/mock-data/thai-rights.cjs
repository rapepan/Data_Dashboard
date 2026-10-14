const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.HOSXP_HOST, port: Number(e.HOSXP_PORT || 3306), user: e.HOSXP_USER, password: e.HOSXP_PASSWORD, database: e.HOSXP_DATABASE, charset: 'utf8mb4' });
  await c.query('SET SESSION TRANSACTION READ ONLY');
  const [r] = await c.query(`SELECT DATE_FORMAT(o.vstdate,'%Y-%m') m, CASE v.pcode WHEN 'AG' THEN 0 WHEN 'UC' THEN 1 WHEN 'A2' THEN 2 WHEN 'A1' THEN 3 ELSE 4 END r, COUNT(*) n
    FROM ovst o JOIN vn_stat v ON v.vn = o.vn WHERE o.main_dep IN ('041','049') AND o.vstdate BETWEEN '2025-10-01' AND DATE_SUB(CURDATE(), INTERVAL 1 DAY) GROUP BY m, r ORDER BY m, r`);
  const j = require(__dirname + '/fy.json'); j.thaiRights5 = r; fs.writeFileSync(__dirname + '/fy.json', JSON.stringify(j, null, 1));
  console.log(r.length); await c.end();
})();
