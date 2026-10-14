// อัปเดตข้อมูลจำลองทั้งระบบให้ตรง HOSxP ถึงเมื่อวาน — ดึงยอดรวม (อ่านอย่างเดียว) → สร้างไฟล์ใน src/services → เทียบผล
// ใช้ (ในโฟลเดอร์ backend): node scripts/mock-data/refresh.cjs
// หลังรัน: เพิ่ม version ของรายงานใน src/cache/report-registry.ts (ไม่งั้นระบบเสิร์ฟผลที่พักไว้ชุดเก่า) แล้ว npx vitest run
const { execFileSync, execSync } = require('node:child_process');
const path = require('node:path');
const run = (file, args = []) => {
  console.log(`\n▶ ${file}`);
  execFileSync(process.execPath, [path.join(__dirname, file), ...args], { stdio: 'inherit' });
};
// 1) ดึงยอดรวมจาก HOSxP (ทีละชุด ไม่ยิงพร้อมกัน)
for (const f of ['series-probe.cjs', 'fy-probe.cjs', 'thai-rights.cjs', 'physio-probe.cjs', 'drug-monthly.cjs', 'rx-daily.cjs', 'daily-probe.cjs', 'daily-drug.cjs', 'telerx-probe.cjs', 'breakdown-probe.cjs']) run(f);
// 2) สร้างไฟล์ข้อมูลใน src/services
for (const f of ['gen-series.cjs', 'gen-fiscal.cjs', 'gen-rx.cjs', 'gen-telerx.cjs', 'gen-breakdown.cjs', 'gen-daily.cjs']) run(f);
// 3) เทียบหน้าเว็บกับยอดจริง: ปีงบปัจจุบันถึงเมื่อวาน + เดือนก่อน
const iso = d => d.toISOString().slice(0, 10);
const now = new Date(Date.now() + 7 * 3600e3);
const yesterday = iso(new Date(now.getTime() - 86400000));
const fyStart = `${now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1}-10-01`;
const lastMonthEnd = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
const lastMonthStart = lastMonthEnd.slice(0, 8) + '01';
console.log('\n▶ compare.ts');
execSync(`npx tsx "${path.join(__dirname, 'compare.ts')}" ${fyStart} ${yesterday} ${lastMonthStart} ${lastMonthEnd}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
