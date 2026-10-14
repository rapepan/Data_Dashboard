// ตัวเลขรองของทุกหน้า แยกรายเดือน (อันดับโรค / หัตถการ / สิทธิ / อายุ / รายชั่วโมง / คลินิก ฯลฯ) — อ่านอย่างเดียว · ยอดรวมเท่านั้น ไม่มีข้อมูลรายคน
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
const FROM = "'2025-10-01'";
const TO = 'DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
const M = c => `DATE_FORMAT(${c}, '%Y-%m')`;
const WD = c => `DAYOFWEEK(${c}) BETWEEN 2 AND 6`;
/** visit ที่มาตามนัด (oapp.visit_vn) */
const APPT_VN = `(SELECT DISTINCT visit_vn FROM oapp WHERE visit_vn IS NOT NULL AND visit_vn <> '' AND nextdate >= DATE_SUB(${FROM}, INTERVAL 7 DAY))`;
/** รหัสโรค N อันดับแรกของทั้งช่วง แล้วแยกรายเดือน — ชื่อจาก icd101 (ไทยถ้ามี) */
const topCodes = (from, codeCol, dateCol, where, n, extra = '') => `
  SELECT ${M(dateCol)} m, UPPER(${codeCol}) code, COUNT(*) n${extra}
  FROM ${from} WHERE ${where} AND ${dateCol} BETWEEN ${FROM} AND ${TO}
    AND UPPER(${codeCol}) IN (SELECT code FROM (SELECT UPPER(${codeCol}) code FROM ${from} WHERE ${where} AND ${dateCol} BETWEEN ${FROM} AND ${TO} AND ${codeCol} IS NOT NULL AND ${codeCol} <> '' GROUP BY code ORDER BY COUNT(*) DESC LIMIT ${n}) t)
  GROUP BY m, code`;

const Q = {
  // ---------- OPD ----------
  /** ผู้ป่วยนอกรายชั่วโมง วันทำการ: ทั้งหมด / มาตามนัด · days = วันทำการที่มีข้อมูลในเดือน */
  opdHour: `SELECT ${M('o.vstdate')} m, HOUR(o.vsttime) h, COUNT(*) n, SUM(a.visit_vn IS NOT NULL) appt FROM ovst o LEFT JOIN ${APPT_VN} a ON a.visit_vn = o.vn
    WHERE o.vstdate BETWEEN ${FROM} AND ${TO} AND ${WD('o.vstdate')} GROUP BY m, h`,
  workdays: `SELECT ${M('vstdate')} m, COUNT(DISTINCT vstdate) days FROM ovst WHERE vstdate BETWEEN ${FROM} AND ${TO} AND ${WD('vstdate')} GROUP BY m`,
  /** 60 อันดับโรค OPD (วินิจฉัยหลัก): ครั้ง + คนไม่ซ้ำในเดือน */
  opdDx: topCodes('ovstdiag', 'icd10', 'vstdate', "diagtype = '1'", 60, ', COUNT(DISTINCT hn) p'),
  /** คนไม่ซ้ำทั้งช่วงต่อรหัส (ใช้ประมาณคนของช่วงหลายเดือน) */
  opdDxYear: `SELECT UPPER(icd10) code, COUNT(DISTINCT hn) p, COUNT(*) n FROM ovstdiag WHERE diagtype = '1' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY code ORDER BY n DESC LIMIT 60`,

  // ---------- IPD ----------
  ipdDx: topCodes('an_stat', 'pdx', 'regdate', '1 = 1', 25),
  /** หมวดโรค (ตัวอักษรแรกของ pdx) */
  ipdChapter: `SELECT ${M('regdate')} m, UPPER(LEFT(pdx, 1)) code, COUNT(*) n FROM an_stat WHERE regdate BETWEEN ${FROM} AND ${TO} AND pdx IS NOT NULL AND pdx <> '' GROUP BY m, code`,
  ipdRight: `SELECT ${M('a.regdate')} m, COALESCE(p.name, a.pcode, 'ไม่ระบุ') code, COUNT(*) n FROM an_stat a LEFT JOIN pcode p ON p.code = a.pcode WHERE a.regdate BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,
  ipdAge: `SELECT ${M('regdate')} m, CASE WHEN age_y <= 18 THEN '0-18' WHEN age_y <= 40 THEN '19-40' WHEN age_y <= 60 THEN '41-60' WHEN age_y <= 80 THEN '61-80' ELSE '> 80' END code, COUNT(*) n FROM an_stat WHERE regdate BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,
  adjrw: `SELECT ${M('dchdate')} m, ROUND(AVG(rw), 4) n, COUNT(*) c FROM an_stat WHERE dchdate BETWEEN ${FROM} AND ${TO} AND rw > 0 GROUP BY m`,
  /** รอเตียง (ipt_admit_queue): ขอ admit จาก ER (แผนก 011) / แผนกอื่น · ชั่วโมงรอรวม (ขอ → admit) */
  admitQueue: `SELECT ${M('request_date_time')} m, SUM(request_depcode = '011') er, SUM(request_depcode <> '011' OR request_depcode IS NULL) other,
      ROUND(SUM(CASE WHEN admit_date_time > request_date_time AND TIMESTAMPDIFF(MINUTE, request_date_time, admit_date_time) <= 2880 THEN TIMESTAMPDIFF(MINUTE, request_date_time, admit_date_time) END) / 60, 2) waitHours,
      SUM(admit_date_time > request_date_time AND TIMESTAMPDIFF(MINUTE, request_date_time, admit_date_time) <= 2880) waitN
    FROM ipt_admit_queue WHERE DATE(request_date_time) BETWEEN ${FROM} AND ${TO} GROUP BY m`,

  // ---------- ER ----------
  /** ER รายชั่วโมง × ระดับ (1 / 2 / 3 / 4–5) */
  erHour: `SELECT ${M('r.vstdate')} m, HOUR(o.vsttime) h, SUM(r.er_emergency_type = 1) l1, SUM(r.er_emergency_type = 2) l2, SUM(r.er_emergency_type = 3) l3, SUM(r.er_emergency_type NOT IN (1, 2, 3) OR r.er_emergency_type IS NULL) l45, COUNT(*) n
    FROM er_regist r JOIN ovst o ON o.vn = r.vn WHERE r.vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, h`,
  erDx: topCodes('vn_stat v JOIN er_regist r ON r.vn = v.vn', 'v.pdx', 'v.vstdate', '1 = 1', 10),

  // ---------- Re-admit / Refer ----------
  readmitDx: `SELECT ${M('a.regdate')} m, UPPER(a.pdx) code, a.ward, COUNT(*) n FROM an_stat a WHERE a.regdate BETWEEN ${FROM} AND ${TO} AND a.pdx IS NOT NULL AND a.pdx <> ''
    AND EXISTS (SELECT 1 FROM ipt b WHERE b.hn = a.hn AND b.an <> a.an AND b.dchdate < a.regdate AND DATEDIFF(a.regdate, b.dchdate) <= 28) GROUP BY m, code, a.ward`,
  referDx: `SELECT ${M('refer_date')} m, UPPER(pdx) code, LOWER(COALESCE(refer_point, '')) point, COUNT(*) n FROM referout WHERE refer_date BETWEEN ${FROM} AND ${TO} AND pdx IS NOT NULL AND pdx <> ''
    AND UPPER(pdx) IN (SELECT code FROM (SELECT UPPER(pdx) code FROM referout WHERE refer_date BETWEEN ${FROM} AND ${TO} AND pdx <> '' GROUP BY code ORDER BY COUNT(*) DESC LIMIT 40) t) GROUP BY m, code, point`,

  // ---------- กายภาพ ----------
  physioType: `SELECT ${M('vstdate')} m, COALESCE(type_text, '') code, COUNT(*) n FROM physic_main WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,
  physioOpdDx: topCodes('vn_stat v JOIN physic_main p ON p.vn = v.vn', 'v.pdx', 'p.vstdate', '1 = 1', 15, ', COUNT(DISTINCT p.hn) p'),
  physioIpdDx: topCodes('an_stat a JOIN physic_main_ipd p ON p.an = a.an', 'a.pdx', 'p.vstdate', '1 = 1', 15, ', COUNT(DISTINCT p.hn) p'),
  physioProc: `SELECT ${M('o.vstdate')} m, l.physic_items_id code, MAX(i.name) name, COUNT(*) n FROM physic_list l JOIN ovst o ON o.vn = l.vn LEFT JOIN physic_items i ON i.physic_items_id = l.physic_items_id
    WHERE o.vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,

  // ---------- ทันตกรรม ----------
  dentalGroup: `SELECT ${M('d.vstdate')} m, COALESCE(g.master_id, 0) code, COUNT(*) n FROM dtmain d LEFT JOIN dttm t ON t.code = d.tmcode LEFT JOIN dttm_group g ON g.dttm_group_id = t.dttm_group_id
    WHERE d.vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,
  dentalMaster: `SELECT DISTINCT master_id code FROM dttm_group`,
  dentalProc: `SELECT ${M('d.vstdate')} m, d.tmcode code, MAX(t.name) name, COUNT(*) n FROM dtmain d LEFT JOIN dttm t ON t.code = d.tmcode WHERE d.vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,

  // ---------- แผนไทย / จีน ----------
  thaiOp: `SELECT ${M('s.service_date')} m, COALESCE(i.health_med_operation_item_name, 'ไม่ระบุ') code, COUNT(*) n FROM health_med_service_operation o JOIN health_med_service s ON s.health_med_service_id = o.health_med_service_id
    LEFT JOIN health_med_operation_item i ON i.health_med_operation_item_id = o.health_med_operation_item_id WHERE s.service_date BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,
  thaiDx: `SELECT ${M('s.service_date')} m, UPPER(d.icd10) code, COUNT(*) n FROM health_med_service_diagnosis d JOIN health_med_service s ON s.health_med_service_id = d.health_med_service_id
    WHERE s.service_date BETWEEN ${FROM} AND ${TO} AND d.icd10 IS NOT NULL AND d.icd10 <> '' GROUP BY m, code`,
  chineseDx: topCodes("vn_stat v JOIN ovst o ON o.vn = v.vn AND o.main_dep = '049'", 'v.pdx', 'o.vstdate', '1 = 1', 15, ', COUNT(DISTINCT o.hn) p'),

  // ---------- การแพทย์ทางไกล ----------
  teleHour: `SELECT ${M('vstdate')} m, HOUR(vsttime) h, COUNT(*) n FROM ovst WHERE main_dep = '055' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, h`,
  teleClinic: `SELECT ${M('o.vstdate')} m, COALESCE(c.name, 'ไม่ระบุคลินิก') code, COUNT(*) n FROM ovst o LEFT JOIN oapp a ON a.visit_vn = o.vn LEFT JOIN clinic c ON c.clinic = a.clinic
    WHERE o.main_dep = '055' AND o.vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,

  // ---------- หน้าแรก: รายได้ / สิทธิของผู้ป่วยนอก ----------
  opdRight: `SELECT ${M('v.vstdate')} m, COALESCE(p.name, v.pcode, 'ไม่ระบุ') code, COUNT(*) n, ROUND(SUM(v.income)) income FROM vn_stat v LEFT JOIN pcode p ON p.code = v.pcode
    WHERE v.vstdate BETWEEN ${FROM} AND ${TO} GROUP BY m, code`,
};
const NAMES = `SELECT code, name, tname FROM icd101 WHERE code IN (?)`;

(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.HOSXP_HOST, port: Number(e.HOSXP_PORT || 3306), user: e.HOSXP_USER, password: e.HOSXP_PASSWORD, database: e.HOSXP_DATABASE, charset: 'utf8mb4', dateStrings: true });
  await c.query('SET SESSION TRANSACTION READ ONLY');
  const [meta] = await c.query(`SELECT ${TO} upto`);
  const out = { upto: meta[0].upto };
  const numify = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, ['m', 'code', 'name', 'ward', 'point'].includes(k) ? v : Number(v)]));
  for (const [k, sql] of Object.entries(Q)) {
    const t = Date.now();
    try {
      const [rows] = await c.query(sql);
      out[k] = rows.map(numify);
      console.log(`✓ ${k} (${rows.length} แถว, ${Date.now() - t} ms)`);
    } catch (err) { out[k] = []; console.log(`✗ ${k}: ${err.message.slice(0, 160)}`); }
  }
  // ชื่อโรค (icd101) ของทุกรหัสที่ใช้
  const codes = new Set();
  for (const k of ['opdDx', 'ipdDx', 'erDx', 'readmitDx', 'referDx', 'physioOpdDx', 'physioIpdDx', 'thaiDx', 'chineseDx']) for (const r of out[k]) codes.add(r.code);
  const [names] = codes.size ? await c.query(NAMES, [[...codes]]) : [[]];
  out.icdNames = Object.fromEntries(names.map(r => [String(r.code).toUpperCase(), [r.name, r.tname]]));
  console.log(`✓ icdNames (${names.length})`);
  fs.writeFileSync(__dirname + '/breakdown.json', JSON.stringify(out));
  await c.end();
})().catch(err => { console.error(err.message); process.exit(1); });
