// ยอดรวมรายวันของทุกหน้า 1 ต.ค. 68 – เมื่อวาน + จำนวนคนไม่ซ้ำตามความยาวช่วง (7/30/90/365 วัน) — อ่านอย่างเดียว · ไม่มีข้อมูลรายคน
const BACKEND = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
const fs = require('fs');
const mysql = require(BACKEND + '/node_modules/mysql2/promise');
process.loadEnvFile(BACKEND + '/.env');
const FROM = "'2025-10-01'";
const TO = 'DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
/** [ชื่อ, SQL ที่คืน d + คอลัมน์ตัวเลข] */
const DAILY = {
  er: `SELECT vstdate d, COUNT(*) n FROM er_regist WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  admit: `SELECT regdate d, COUNT(*) n, SUM(ward = '02') w02, SUM(ward = '07') w07 FROM ipt WHERE regdate BETWEEN ${FROM} AND ${TO} GROUP BY regdate`,
  dch: `SELECT dchdate d, COUNT(*) n FROM ipt WHERE dchdate BETWEEN ${FROM} AND ${TO} GROUP BY dchdate`,
  refer: `SELECT refer_date d, COUNT(*) n, SUM(refer_point = 'OPD') opd, SUM(refer_point = 'ER') er, SUM(refer_point = 'IPD') ipd FROM referout WHERE refer_date BETWEEN ${FROM} AND ${TO} GROUP BY refer_date`,
  dental: `SELECT vstdate d, COUNT(DISTINCT vn) n, COUNT(DISTINCT hn) p FROM dtmain WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  physioOpd: `SELECT vstdate d, COUNT(*) n, COUNT(DISTINCT hn) p FROM physic_main WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  physioIpd: `SELECT vstdate d, COUNT(*) n, COUNT(DISTINCT hn) p FROM physic_main_ipd WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  tele: `SELECT vstdate d, COUNT(*) n, COUNT(DISTINCT hn) p FROM ovst WHERE main_dep = '055' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  thai: `SELECT vstdate d, COUNT(*) n, COUNT(DISTINCT hn) p FROM ovst WHERE main_dep = '041' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  chinese: `SELECT vstdate d, COUNT(*) n, COUNT(DISTINCT hn) p FROM ovst WHERE main_dep = '049' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  postal: `SELECT DATE(prscrpt_delivery_med_datetime) d, COUNT(*) n FROM prscrpt_delivery_med WHERE prscrpt_delivery_med_datetime >= ${FROM} AND DATE(prscrpt_delivery_med_datetime) <= ${TO} GROUP BY d`,
  readmit: `SELECT a.regdate d, COUNT(*) n, SUM(a.ward = '02') w02, SUM(a.ward = '07') w07 FROM ipt a WHERE a.regdate BETWEEN ${FROM} AND ${TO}
    AND EXISTS (SELECT 1 FROM ipt b WHERE b.hn = a.hn AND b.an <> a.an AND b.dchdate < a.regdate AND DATEDIFF(a.regdate, b.dchdate) <= 28) GROUP BY a.regdate`,
  icd: `SELECT vstdate d, COUNT(*) n, COUNT(DISTINCT hn) p, COUNT(DISTINCT UPPER(icd10)) c FROM ovstdiag WHERE diagtype = '1' AND vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  // ---- ตัวเลขรอง ----
  /** ER ตามระดับความเร่งด่วน 1–5 (6 = ไม่ระบุ นับรวม 5) */
  erLevel: `SELECT vstdate d, SUM(er_emergency_type = 1) l1, SUM(er_emergency_type = 2) l2, SUM(er_emergency_type = 3) l3, SUM(er_emergency_type = 4) l4, SUM(er_emergency_type = 5 OR er_emergency_type = 6 OR er_emergency_type IS NULL) l5 FROM er_regist WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  /** ER ตามการจำหน่าย (er_dch_type): กลับบ้าน / ส่งต่อ / admit / เสียชีวิต / สังเกตอาการ / ไม่ระบุ */
  erDch: `SELECT vstdate d, SUM(er_dch_type = 1) home, SUM(er_dch_type = 2) refer, SUM(er_dch_type = 3) admit, SUM(er_dch_type = 4) dead, SUM(er_dch_type = 5) obs, SUM(er_dch_type IS NULL OR er_dch_type NOT IN (1, 2, 3, 4, 5)) unk FROM er_regist WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  /** ER ระยะเวลา: รอแพทย์ (นาที รวม/จำนวน) · อยู่ใน ER แยกช่วง <2 / 2–4 / 4–6 / >6 ชม. (เฉพาะที่ลงเวลาครบ) */
  erTime: `SELECT vstdate d,
      SUM(CASE WHEN TIMESTAMPDIFF(MINUTE, enter_er_time, doctor_tx_time) BETWEEN 0 AND 720 THEN TIMESTAMPDIFF(MINUTE, enter_er_time, doctor_tx_time) END) waitSum,
      SUM(TIMESTAMPDIFF(MINUTE, enter_er_time, doctor_tx_time) BETWEEN 0 AND 720) waitN,
      SUM(TIMESTAMPDIFF(MINUTE, enter_er_time, finish_time) BETWEEN 0 AND 119) b1, SUM(TIMESTAMPDIFF(MINUTE, enter_er_time, finish_time) BETWEEN 120 AND 239) b2,
      SUM(TIMESTAMPDIFF(MINUTE, enter_er_time, finish_time) BETWEEN 240 AND 359) b3, SUM(TIMESTAMPDIFF(MINUTE, enter_er_time, finish_time) BETWEEN 360 AND 4320) b4
    FROM er_regist WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  /** ผู้ป่วยใหม่ (มาครั้งแรกในรอบ 5 ปี) ตามวันที่มาครั้งแรก */
  newpt: `SELECT firstday d, COUNT(*) n FROM (SELECT hn, MIN(vstdate) firstday FROM ovst WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 6 YEAR) AND vstdate <= ${TO} GROUP BY hn) x WHERE firstday >= ${FROM} GROUP BY firstday`,
  /** จุดบริการ OPD ที่มีเวลาบันทึก (service_time): ออกบัตร / คัดกรองเสร็จ / แพทย์ตรวจเสร็จ / ห้องยา / การเงิน */
  flow: `SELECT vstdate d, COUNT(*) n, SUM(service4 IS NOT NULL AND service4 <> '00:00:00') s4, SUM(service5 IS NOT NULL AND service5 <> '00:00:00') s5, SUM(service7 IS NOT NULL AND service7 <> '00:00:00') s7, SUM(service6 IS NOT NULL AND service6 <> '00:00:00') s6 FROM service_time WHERE vstdate BETWEEN ${FROM} AND ${TO} GROUP BY vstdate`,
  /** นัดหมายตามวันนัด: ทั้งหมด / มาตามนัด (มี visit_vn) / ยกเลิก */
  appt: `SELECT nextdate d, COUNT(*) n, SUM(visit_vn IS NOT NULL AND visit_vn <> '') came, SUM(oapp_status_id = 4) cancel FROM oapp WHERE nextdate BETWEEN ${FROM} AND ${TO} GROUP BY nextdate`,
  /** จำหน่ายแยกหอ + LOS ของผู้ที่จำหน่าย แยกช่วง <3 / 3–5 / 6–10 / >10 วัน */
  dchDetail: `SELECT i.dchdate d, SUM(i.ward = '02') w02, SUM(i.ward = '07') w07, SUM(a.los < 3) l1, SUM(a.los BETWEEN 3 AND 5) l2, SUM(a.los BETWEEN 6 AND 10) l3, SUM(a.los > 10) l4 FROM ipt i LEFT JOIN an_stat a ON a.an = i.an WHERE i.dchdate BETWEEN ${FROM} AND ${TO} GROUP BY i.dchdate`,
};
/** คนไม่ซ้ำ (และรหัสโรคไม่ซ้ำ) ตามความยาวช่วงที่สิ้นสุดเมื่อวาน — ใช้ประมาณ "คน" ของช่วงที่ยาวหลายวัน */
const W = [7, 30, 90, 365];
const win = (table, where, extra = '') => W.map(n => `SELECT ${n} days, COUNT(*) n, COUNT(DISTINCT hn) p${extra} FROM ${table} WHERE ${where.replace('$D', 'vstdate')} BETWEEN DATE_SUB(CURDATE(), INTERVAL ${n} DAY) AND ${TO}`).join(' UNION ALL ');
const WINDOWS = {
  dental: win('dtmain', "$D"),
  physioOpd: win('physic_main', "$D"),
  tele: win('ovst', "main_dep = '055' AND $D"),
  thai: win('ovst', "main_dep = '041' AND $D"),
  chinese: win('ovst', "main_dep = '049' AND $D"),
  icd: win('ovstdiag', "diagtype = '1' AND $D", ', COUNT(DISTINCT UPPER(icd10)) c'),
  readmitPersons: W.map(n => `SELECT ${n} days, COUNT(*) n, COUNT(DISTINCT a.hn) p FROM ipt a WHERE a.regdate BETWEEN DATE_SUB(CURDATE(), INTERVAL ${n} DAY) AND ${TO}
    AND EXISTS (SELECT 1 FROM ipt b WHERE b.hn = a.hn AND b.an <> a.an AND b.dchdate < a.regdate AND DATEDIFF(a.regdate, b.dchdate) <= 28)`).join(' UNION ALL '),
};
(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.HOSXP_HOST, port: Number(e.HOSXP_PORT || 3306), user: e.HOSXP_USER, password: e.HOSXP_PASSWORD, database: e.HOSXP_DATABASE, charset: 'utf8mb4', dateStrings: true });
  await c.query('SET SESSION TRANSACTION READ ONLY');
  const [meta] = await c.query(`SELECT ${TO} upto`);
  const out = { upto: meta[0].upto, daily: {}, windows: {} };
  const [cs] = await c.query(`SELECT COUNT(*) n, SUM(ward = '02') w02, SUM(ward = '07') w07 FROM ipt WHERE regdate < ${FROM} AND (dchdate IS NULL OR dchdate >= ${FROM})`);
  out.censusStart = { n: Number(cs[0].n), w02: Number(cs[0].w02), w07: Number(cs[0].w07) };
  console.log('✓ censusStart', JSON.stringify(out.censusStart));
  const numify = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'd' ? v : Number(v)]));
  for (const [k, sql] of Object.entries(DAILY)) {
    const t = Date.now();
    const [rows] = await c.query(sql);
    out.daily[k] = rows.map(numify);
    console.log(`✓ daily ${k} (${rows.length} วัน, ${Date.now() - t} ms)`);
  }
  for (const [k, sql] of Object.entries(WINDOWS)) {
    const t = Date.now();
    const [rows] = await c.query(sql);
    out.windows[k] = rows.map(numify);
    console.log(`✓ window ${k} ${JSON.stringify(out.windows[k].map(r => [r.days, r.n, r.p]))} (${Date.now() - t} ms)`);
  }
  fs.writeFileSync(__dirname + '/daily.json', JSON.stringify(out));
  await c.end();
})().catch(err => { console.error(err.message); process.exit(1); });
