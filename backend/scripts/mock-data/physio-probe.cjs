// อ่านอย่างเดียว · ยอดรวมเท่านั้น (ไม่ดึง HN / ชื่อ / เลขบัตร) — ปรับข้อมูลจำลองหน้ากายภาพบำบัดให้ตรงฐานปัจจุบัน
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
const fs = require('fs');
process.loadEnvFile(BACKEND + '/.env');
const L12 = ["DATE_SUB(CURDATE(), INTERVAL 12 MONTH)", "CURDATE()"]; // ย้อนหลัง 12 เดือน
const FY = ['2025-10-01', '2027-09-30'];                              // ปีงบ 2569 + 2570
(async () => {
  const db = await mysql.createConnection({ host: process.env.HOSXP_HOST, port: Number(process.env.HOSXP_PORT || 3306), user: process.env.HOSXP_USER, password: process.env.HOSXP_PASSWORD, database: process.env.HOSXP_DATABASE, charset: 'utf8mb4' });
  await db.query('SET SESSION TRANSACTION READ ONLY');
  const out = {};
  const q = async (key, sql, p = []) => { const t = Date.now(); const [r] = await db.query(sql, p); out[key] = r; console.log(`${key}: ${r.length} แถว · ${Date.now() - t} ms`); };
  const w = c => `${c} BETWEEN ${L12[0]} AND ${L12[1]}`;

  await q('today', `SELECT CURDATE() AS d`);
  await q('opdMonthly', `SELECT DATE_FORMAT(vstdate,'%Y-%m') ym, COUNT(*) visits FROM physic_main WHERE vstdate BETWEEN ? AND ? GROUP BY ym ORDER BY ym`, FY);
  await q('ipdMonthly', `SELECT DATE_FORMAT(vstdate,'%Y-%m') ym, COUNT(*) visits FROM physic_main_ipd WHERE vstdate BETWEEN ? AND ? GROUP BY ym ORDER BY ym`, FY);
  await q('opdTotal', `SELECT COUNT(*) visits, COUNT(DISTINCT hn) persons, COUNT(DISTINCT vstdate) days FROM physic_main WHERE ${w('vstdate')}`);
  await q('ipdTotal', `SELECT COUNT(*) visits, COUNT(DISTINCT hn) persons FROM physic_main_ipd WHERE ${w('vstdate')}`);
  await q('categories', `SELECT COALESCE(NULLIF(TRIM(type_text),''),'ไม่ระบุ') cat, COUNT(*) n FROM physic_main WHERE ${w('vstdate')} GROUP BY cat ORDER BY n DESC`);
  await q('opdDx', `SELECT vs.pdx code, COALESCE(NULLIF(i.tname,''), i.name) name, COUNT(*) visits, COUNT(DISTINCT pm.hn) persons
    FROM physic_main pm JOIN vn_stat vs ON vs.vn = pm.vn LEFT JOIN icd101 i ON i.code = vs.pdx
    WHERE ${w('pm.vstdate')} AND vs.pdx <> '' GROUP BY vs.pdx ORDER BY visits DESC LIMIT 12`);
  await q('ipdDx', `SELECT a.pdx code, COALESCE(NULLIF(i.tname,''), i.name) name, COUNT(*) visits, COUNT(DISTINCT pmi.hn) persons
    FROM physic_main_ipd pmi JOIN an_stat a ON a.an = pmi.an LEFT JOIN icd101 i ON i.code = a.pdx
    WHERE ${w('pmi.vstdate')} AND a.pdx <> '' GROUP BY a.pdx ORDER BY visits DESC LIMIT 12`);
  await q('procedures', `SELECT pl.physic_items_id code, pi.name, COUNT(*) visits
    FROM physic_list pl JOIN physic_main pm ON pm.vn = pl.vn LEFT JOIN physic_items pi ON pi.physic_items_id = pl.physic_items_id
    WHERE ${w('pm.vstdate')} GROUP BY pl.physic_items_id ORDER BY visits DESC LIMIT 12`);
  // สิทธิหลัก (pcode) + นอกเวลา (นอก จ.–ศ. 08:30–16:30 ตาม ovst.vsttime)
  await q('opdRights', `SELECT CASE WHEN vs.pcode IN ('AG','UC','A2') THEN vs.pcode ELSE 'OT' END grp, COUNT(*) visits,
      SUM(NOT (DAYOFWEEK(pm.vstdate) BETWEEN 2 AND 6 AND o.vsttime BETWEEN '08:30:00' AND '16:30:00')) after_hours
    FROM physic_main pm JOIN vn_stat vs ON vs.vn = pm.vn LEFT JOIN ovst o ON o.vn = pm.vn
    WHERE ${w('pm.vstdate')} GROUP BY grp`);
  await q('ipdRights', `SELECT CASE WHEN a.pcode IN ('AG','UC','A2') THEN a.pcode ELSE 'OT' END grp, COUNT(*) visits,
      SUM(NOT (DAYOFWEEK(pmi.vstdate) BETWEEN 2 AND 6 AND pmi.service_time BETWEEN '08:30:00' AND '16:30:00')) after_hours
    FROM physic_main_ipd pmi JOIN an_stat a ON a.an = pmi.an WHERE ${w('pmi.vstdate')} GROUP BY grp`);
  await q('wards', `SELECT COALESCE(wd.name, a.ward) ward, COUNT(*) visits FROM physic_main_ipd pmi JOIN an_stat a ON a.an = pmi.an LEFT JOIN ward wd ON wd.ward = a.ward
    WHERE ${w('pmi.vstdate')} GROUP BY ward ORDER BY visits DESC`);

  // ค่ารักษา เบิกได้ / เก็บเงิน
  const [pt] = await db.query('SELECT pttype, name FROM pttype');
  const selfPay = [...new Set([...pt.filter(r => String(r.name).includes('ชำระเงินเอง')).map(r => r.pttype), 'A1', 'A2', 'B4'])];
  out.selfPay = selfPay;
  await q('revOpdRights', `SELECT vs.pttype code, COALESCE(p.name,'ไม่ระบุสิทธิ์') name, COUNT(DISTINCT vs.vn) visits, ROUND(SUM(vs.inc14)) amount
    FROM (SELECT DISTINCT vn FROM physic_list) pl JOIN vn_stat vs ON vs.vn = pl.vn LEFT JOIN pttype p ON p.pttype = vs.pttype
    WHERE ${w('vs.vstdate')} GROUP BY code, name ORDER BY amount DESC`);
  await q('revIpdRights', `SELECT o.pttype code, COALESCE(p.name,'ไม่ระบุสิทธิ์') name, COUNT(DISTINCT o.an, o.vstdate) visits, ROUND(SUM(o.sum_price)) amount
    FROM (SELECT DISTINCT pmi.an FROM physic_list_ipd pli JOIN physic_main_ipd pmi ON pmi.physic_main_ipd_id = pli.physic_main_ipd_id) pl
    JOIN opitemrece o ON o.an = pl.an LEFT JOIN pttype p ON p.pttype = o.pttype
    WHERE o.income = '14' AND ${w('o.vstdate')} GROUP BY code, name ORDER BY amount DESC`);
  await q('revMonthly', `SELECT DATE_FORMAT(vs.vstdate,'%Y-%m') ym, SUM(IF(vs.pttype IN (?), 0, vs.inc14)) claim, SUM(IF(vs.pttype IN (?), vs.inc14, 0)) selfpay
    FROM (SELECT DISTINCT vn FROM physic_list) pl JOIN vn_stat vs ON vs.vn = pl.vn WHERE vs.vstdate BETWEEN ? AND ? GROUP BY ym ORDER BY ym`, [selfPay, selfPay, ...FY]);

  // นัดหมาย 042
  await q('apptMonthly', `SELECT DATE_FORMAT(o.nextdate,'%Y-%m') ym, COUNT(*) appts,
      SUM(EXISTS(SELECT 1 FROM opitemrece oi WHERE oi.income='14' AND oi.hn=o.hn AND oi.vstdate=o.nextdate)) came,
      SUM(o.nextdate < CURDATE() AND NOT EXISTS(SELECT 1 FROM opitemrece oi WHERE oi.income='14' AND oi.hn=o.hn AND oi.vstdate=o.nextdate)) noshow
    FROM oapp o WHERE o.clinic='042' AND o.nextdate BETWEEN ? AND ? GROUP BY ym ORDER BY ym`, FY);
  await q('walkinMonthly', `SELECT DATE_FORMAT(v.vstdate,'%Y-%m') ym, COUNT(*) walkin FROM (
      SELECT DISTINCT oi.hn, oi.vstdate FROM opitemrece oi WHERE oi.income='14' AND oi.vstdate BETWEEN ? AND CURDATE() AND oi.vn IS NOT NULL) v
    WHERE NOT EXISTS (SELECT 1 FROM oapp o WHERE o.clinic='042' AND o.hn=v.hn AND o.nextdate=v.vstdate) GROUP BY ym ORDER BY ym`, [FY[0]]);
  await q('apptWeekday', `SELECT DAYOFWEEK(nextdate) dow, COUNT(*) n FROM oapp WHERE clinic='042' AND ${w('nextdate')} GROUP BY dow ORDER BY dow`);
  await q('apptUpcoming', `SELECT COUNT(*) n FROM oapp WHERE clinic='042' AND nextdate BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`);
  await db.end();
  fs.writeFileSync(__dirname + '/physio-probe.json', JSON.stringify(out, null, 1));
  console.log('saved');
})().catch(e => { console.error(e.message); process.exit(1); });
