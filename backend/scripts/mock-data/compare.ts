// เทียบตัวเลขหลักของทุกหน้า: ข้อมูลจำลอง (เรียก generator ตรง) กับยอดจริง HOSxP ช่วงเดียวกัน — อ่านอย่างเดียว · ยอดรวมเท่านั้น
// ใช้ (ในโฟลเดอร์ backend): npx tsx scripts/mock-data/compare.ts 2026-10-01 2026-10-13 [2025-10-01 2026-09-30 ...]
process.env.DATA_DIR = require('node:os').tmpdir() + '/bsth-mock-compare';
process.env.DASHBOARD_DB_HOST = '';
process.env.TELEGRAM_BOT_TOKEN = '';
const B = require('node:url').pathToFileURL(require('node:path').resolve(__dirname, '../../src')).href;
const ranges: [string, string][] = [];
for (let i = 2; i < process.argv.length; i += 2) ranges.push([process.argv[i], process.argv[i + 1]]);

type Row = { page: string; metric: string; mock: number | null; real: number | null; note?: string };

async function main() {
  await import(`${B}/env.ts`);
  const mysql = (await import('mysql2/promise')).default;
  const m = {
    ...(await import(`${B}/services/reports-mock.ts`)),
    ...(await import(`${B}/services/dental-mock.ts`)),
    ...(await import(`${B}/services/physio-mock.ts`)),
    ...(await import(`${B}/services/telemedicine-mock.ts`)),
    ...(await import(`${B}/services/postal-drug-mock.ts`)),
    ...(await import(`${B}/services/thai-medicine-mock.ts`)),
    ...(await import(`${B}/services/drug-budget-mock.ts`)),
    ...(await import(`${B}/services/queue-mock.ts`)),
    ...(await import(`${B}/services/readmit-mock.ts`)),
    ...(await import(`${B}/services/referral-mock.ts`)),
    ...(await import(`${B}/services/icd10-mock.ts`)),
    ...(await import(`${B}/services/telepharmacy-mock.ts`)),
  };
  const e = process.env;
  const db = await mysql.createConnection({ host: e.HOSXP_HOST, port: Number(e.HOSXP_PORT || 3306), user: e.HOSXP_USER, password: e.HOSXP_PASSWORD, database: e.HOSXP_DATABASE, charset: 'utf8mb4', dateStrings: true });
  await db.query('SET SESSION TRANSACTION READ ONLY');
  const one = async (sql: string, p: unknown[]) => { const [r] = await db.query(sql, p) as [Record<string, unknown>[], unknown]; return r[0] ?? {}; };
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  for (const [s, en] of ranges) {
    const P = [s, en];
    const rows: Row[] = [];
    const add = (page: string, metric: string, mock: number | null | undefined, real: unknown, note?: string) => rows.push({ page, metric, mock: mock ?? null, real: num(real), note });

    const opd = m.generateOpdReport(s, en);
    const r1 = await one(`SELECT COUNT(*) n FROM ovst WHERE vstdate BETWEEN ? AND ?`, P);
    add('OPD', 'ผู้ป่วยนอก (ครั้ง)', opd.kpis.total.value, r1.n);
    add('OPD', 'ใบสั่งยาที่มียา (ใบ)', opd.prescriptions.total, (await one(`SELECT SUM(EXISTS(SELECT 1 FROM opitemrece o JOIN drugitems d ON d.icode = o.icode WHERE o.vn = v.vn)) n FROM ovst v WHERE v.vstdate BETWEEN ? AND ?`, P)).n);

    const ipd = m.generateIpdReport(s, en);
    add('IPD', 'admit', ipd.kpis.admissions.value, (await one(`SELECT COUNT(*) n FROM ipt WHERE regdate BETWEEN ? AND ?`, P)).n);
    add('IPD', 'จำหน่าย', ipd.kpis.discharges.value, (await one(`SELECT COUNT(*) n FROM ipt WHERE dchdate BETWEEN ? AND ?`, P)).n);
    add('IPD', 'LOS เฉลี่ย (วัน)', ipd.kpis.avgLos.value, (await one(`SELECT ROUND(AVG(los), 2) n FROM an_stat WHERE dchdate BETWEEN ? AND ?`, P)).n);

    const er = m.generateErReport(s, en);
    add('ER', 'ผู้ป่วย ER (ครั้ง)', er.kpis.total.value, (await one(`SELECT COUNT(*) n FROM er_regist WHERE vstdate BETWEEN ? AND ?`, P)).n);

    // ตัวเลขรอง (ยอดรวมเท่านั้น)
    const lv = await one(`SELECT SUM(er_emergency_type = 1) l1, SUM(er_emergency_type = 2) l2, SUM(er_emergency_type = 3) l3, SUM(er_dch_type = 3) admit, SUM(er_dch_type = 2) refer FROM er_regist WHERE vstdate BETWEEN ? AND ?`, P);
    ['l1', 'l2', 'l3'].forEach((k, i) => add('ER', `triage ระดับ ${i + 1}`, er.triage[i]?.value, lv[k]));
    add('ER', 'จำหน่าย: admit', er.kpis.admit.value, lv.admit);
    add('ER', 'จำหน่าย: ส่งต่อ', er.kpis.transfer.value, lv.refer);
    add('OPD', 'ผู้ป่วยใหม่ (คน)', opd.kpis.newPatients.value, (await one(`SELECT COUNT(*) n FROM (SELECT hn, MIN(vstdate) f FROM ovst WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 6 YEAR) AND vstdate <= ? GROUP BY hn) x WHERE f >= ?`, [en, s])).n);
    const top1 = opd.topDiseases[0];
    if (top1) add('OPD', `โรคอันดับ 1 ${top1.code} (ครั้ง)`, top1.visits, (await one(`SELECT COUNT(*) n FROM ovstdiag WHERE diagtype = '1' AND icd10 = ? AND vstdate BETWEEN ? AND ?`, [top1.code, s, en])).n);
    add('IPD', 'ผู้ป่วยคงค้างวันสุดท้าย', ipd.kpis.current.value, (await one(`SELECT COUNT(*) n FROM ipt WHERE regdate <= ? AND (dchdate IS NULL OR dchdate > ?)`, [en, en])).n, 'จำลอง = ณ วันสุดท้ายที่มีข้อมูล');

    const dental = m.generateDentalReport(s, en);
    const dr = await one(`SELECT COUNT(DISTINCT vn) visits, COUNT(DISTINCT hn) persons FROM dtmain WHERE vstdate BETWEEN ? AND ?`, P);
    add('ทันตกรรม', 'ผู้ป่วย (ครั้ง)', dental.range.patients, dr.visits, `คนไม่ซ้ำ ${dr.persons}`);

    const physio = m.generatePhysioReport(s, en);
    const po = await one(`SELECT COUNT(*) visits, COUNT(DISTINCT hn) persons FROM physic_main WHERE vstdate BETWEEN ? AND ?`, P);
    add('กายภาพ', 'OPD (ครั้ง)', physio.range.opd.visits, po.visits);
    add('กายภาพ', 'OPD (คน)', physio.range.opd.persons, po.persons);

    const tele = m.generateTelemedicineReport(s, en);
    add('Telemedicine', 'บริการ (ครั้ง)', tele.range.total, (await one(`SELECT COUNT(*) n FROM ovst WHERE main_dep = '055' AND vstdate BETWEEN ? AND ?`, P)).n);

    const tp = m.generateTelepharmacyReport(s, en);
    const tr = await one(`SELECT COUNT(DISTINCT v.vn) n, ROUND(SUM(o.sum_price)) sale FROM ovst v JOIN opitemrece o ON o.vn = v.vn JOIN drugitems d ON d.icode = o.icode WHERE v.main_dep = '055' AND v.vstdate BETWEEN ? AND ?`, P);
    add('Telepharmacy', 'ผู้ป่วยทางไกลที่ได้รับยา (ครั้ง)', tp.range.visits, tr.n);
    add('Telepharmacy', 'มูลค่ายา ราคาขาย (บาท)', tp.range.sale, tr.sale);

    const postal = m.generatePostalDrugReport(s, en);
    add('ส่งยาไปรษณีย์', 'ส่งยา (ครั้ง)', postal.range.total, (await one(`SELECT COUNT(*) n FROM prscrpt_delivery_med WHERE DATE(prscrpt_delivery_med_datetime) BETWEEN ? AND ?`, P)).n);

    const thai = m.generateThaiMedicineReport(s, en);
    const t41 = await one(`SELECT COUNT(*) visits, COUNT(DISTINCT hn) persons FROM ovst WHERE main_dep = '041' AND vstdate BETWEEN ? AND ?`, P);
    const t49 = await one(`SELECT COUNT(*) visits, COUNT(DISTINCT hn) persons FROM ovst WHERE main_dep = '049' AND vstdate BETWEEN ? AND ?`, P);
    add('แผนไทย', 'OPD แผนไทย (คน)', thai.thaiOpd.range.persons, t41.persons);
    add('แผนไทย', 'OPD แผนไทย (ครั้ง)', thai.thaiOpd.range.visits, t41.visits);
    add('แผนไทย', 'OPD แผนจีน (คน)', thai.chinese.range.persons, t49.persons);

    const drug = m.generateDrugBudgetReport(s, en);
    const dm = await one(`SELECT ROUND(SUM(o.qty * o.cost)) cost, ROUND(SUM(o.sum_price)) sale, SUM(o.qty) qty FROM opitemrece o JOIN drugitems d ON d.icode = o.icode WHERE o.vstdate BETWEEN ? AND ?`, P);
    const allCost = [...drug.topDrugs.modern, ...drug.topDrugs.thai, ...drug.topDrugs.inhouse].reduce((a, i) => a + (i.cost ?? 0), 0);
    const allSale = [...drug.topDrugs.modern, ...drug.topDrugs.thai, ...drug.topDrugs.inhouse].reduce((a, i) => a + i.value, 0);
    add('ปริมาณยา', 'ราคาทุนรวม (บาท)', Math.round(allCost), dm.cost, 'จำลอง = รายการยาในแคตตาล็อก');
    add('ปริมาณยา', 'ราคาขายรวม (บาท)', Math.round(allSale), dm.sale);
    add('ปริมาณยา', 'ผู้ป่วยนอกที่รับยา (ครั้ง)', drug.patients?.opd.withDrug, rows[1].real);

    const queue = m.generateQueueReport(s, en);
    add('คิว', 'เวลารวมเฉลี่ย (นาที)', queue.average.total, null, 'เทียบจาก real-series (คิวรีหนัก ไม่รันซ้ำ)');

    const re = m.generateReadmitReport(s, en, 'all');
    add('Re-admit', 're-admit ≤28 วัน (ครั้ง)', re.visits, (await one(`SELECT COUNT(*) n FROM ipt a WHERE a.regdate BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM ipt b WHERE b.hn = a.hn AND b.an <> a.an AND b.dchdate < a.regdate AND DATEDIFF(a.regdate, b.dchdate) <= 28)`, P)).n);

    const ref = m.generateReferralReport(s, en, 'all');
    add('Refer', 'ส่งต่อ (ครั้ง)', ref.total, (await one(`SELECT COUNT(*) n FROM referout WHERE refer_date BETWEEN ? AND ?`, P)).n);

    const icd = m.generateIcd10Summary(s, en);
    const ir = await one(`SELECT COUNT(*) visits, COUNT(DISTINCT UPPER(icd10)) codes, COUNT(DISTINCT hn) patients FROM ovstdiag WHERE diagtype = '1' AND vstdate BETWEEN ? AND ?`, P);
    add('ICD-10', 'ครั้ง (วินิจฉัยหลัก)', icd.totals.visits, ir.visits);
    add('ICD-10', 'จำนวนรหัสโรค', icd.totals.codes, ir.codes);
    add('ICD-10', 'คน', icd.totals.patients, ir.patients);

    console.log(`\n### ช่วง ${s} – ${en}`);
    console.log('หน้า | ตัวเลข | จำลอง | จริง | ต่าง | หมายเหตุ');
    for (const r of rows) {
      const diff = r.mock !== null && r.real ? Math.round(((r.mock - r.real) / r.real) * 1000) / 10 : null;
      const flag = diff !== null && Math.abs(diff) > 5 ? ' ⚠' : '';
      console.log(`${r.page} | ${r.metric} | ${r.mock ?? '-'} | ${r.real ?? '-'} | ${diff === null ? '-' : `${diff > 0 ? '+' : ''}${diff}%`}${flag} | ${r.note ?? ''}`);
    }
  }
  await db.end();
}
main().catch(err => { console.error(err); process.exit(1); });
