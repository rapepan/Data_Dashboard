# ข้อมูลจำลองที่อิงยอดจริงจาก HOSxP

ข้อมูลจำลองของทุกหน้า (src/services/*-mock.ts) อ่านยอดจริงจากไฟล์ที่สคริปต์ในโฟลเดอร์นี้สร้าง:

| ไฟล์ใน src/services | สร้างโดย | มีอะไร |
|---|---|---|
| real-series.ts | series-probe → gen-series | ยอดรายเดือน 25 เดือน (OPD, ER, admit, จำหน่าย, Refer, ผู้ป่วยใหม่, LOS) + เวลารอคิว |
| fiscal-data.ts, drug-history.ts | fy-probe, thai-rights, physio-probe, drug-monthly → gen-fiscal | ยอดรายเดือนตามปีงบ (ทันตกรรม, แผนไทย/จีน, กายภาพ, ยา ฯลฯ) |
| rx-daily-data.ts | rx-daily → gen-rx | visit ผู้ป่วยนอก / ที่มียา รายวัน |
| daily-data.ts | daily-probe, daily-drug → gen-daily | ยอดรายวันของทุกหน้า + อัตราคนไม่ซ้ำตามความยาวช่วง |

**กติกา:** ทุกคำสั่งเป็น SELECT อ่านอย่างเดียว (`SET SESSION TRANSACTION READ ONLY`) และดึงเฉพาะยอดรวม ไม่มี HN / ชื่อ / เลขบัตร

## อัปเดตให้ถึงเมื่อวาน
```bash
cd backend
node scripts/mock-data/refresh.cjs
```
แล้ว **เพิ่ม version ของรายงาน** ใน `src/cache/report-registry.ts` (ไม่งั้นระบบเสิร์ฟผลที่พักไว้ชุดเก่า) และรัน `npx vitest run`

## เทียบเฉพาะบางช่วง
```bash
npx tsx scripts/mock-data/compare.ts 2026-10-01 2026-10-13 2025-10-01 2026-09-30
```
ตัวที่ต่างเกิน 5% มีเครื่องหมาย ⚠ · "คน" ของช่วงที่ไม่ตรงเดือนเป็นค่าประมาณ (ข้อมูลรวมไม่มีรายคน)

## ตรวจตัวสร้างข้อมูลทุกหน้า (ไม่ต่อฐาน)
```bash
npx tsx scripts/mock-data/smoke.ts
```
เรียกทุกหน้าในหลายช่วง (วันนี้ / ปีงบนี้ / ปีงบก่อน / ช่วงก่อนมีข้อมูลรายวัน) — ต้องไม่มี error, NaN หรือค่าติดลบ

ตัวเลขรอง (รายชั่วโมง, รายโรค, หัตถการ, สิทธิ, กลุ่มอายุ ฯลฯ) มาจากตารางรายเดือน `src/services/breakdown-data.ts`
(`breakdown-probe.cjs` → `gen-breakdown.cjs`) แล้วตัดตามช่วงด้วย `src/services/breakdown.ts`
