# DATA BSTH — แดชบอร์ดปฏิบัติการรายวัน/รายชั่วโมง

โปรเจกต์แยกจาก `Bsth-wed-dashboard` (ระบบ KPI รายเดือน) — ระบบนี้เน้นมอนิเตอร์สถิติการให้บริการแบบเรียลไทม์ (OPD/ER/IPD/คิว) สำหรับหน้าจอปฏิบัติการและจอแสดงผลสาธารณะ

## เอกสาร

- [คู่มือผู้ใช้งาน](docs/คู่มือผู้ใช้งาน.md) — สำหรับเจ้าหน้าที่และผู้ดูแลระบบในโรงพยาบาล
- [คู่มือติดตั้งและดูแลระบบ](docs/คู่มือติดตั้งและดูแลระบบ.md) — ติดตั้ง, ตั้งค่า .env, ทดสอบ (`npm test`), ข้อมูลที่เก็บ, อ่าน log, แก้ปัญหา

## โครงสร้างโปรเจกต์

```text
BSTH-DASHBOARD/
├── frontend/                    React + TypeScript + Vite
│   └── src/
│       ├── components/           UI ที่ใช้ซ้ำได้ (Sidebar, Topbar, StatCard, MiniStat, PlaceholderCard, Layout)
│       ├── pages/                หน้าแต่ละหน้า 1 ไฟล์ต่อ 1 หน้า (DashboardPage, OpdPage, ErPage, ...)
│       ├── routes/               ตั้งค่า react-router (AppRoutes.tsx) + ข้อมูลเมนู sidebar (navigation.ts)
│       ├── hooks/                custom hooks (useClock, useDashboardData)
│       ├── services/             เรียก API ผ่าน apiClient.ts (dashboardService.ts, reportService.ts, ...)
│       ├── charts/                wrapper กราฟ Chart.js (HourlyChart, PaymentDonutChart)
│       └── types/                TypeScript interfaces ที่ใช้ร่วมกัน
│
└── backend/                     Fastify + TypeScript (layered architecture)
    └── src/
        ├── server.ts              จุดเริ่มต้นแอป (bootstrap, plugin, prefix /api)
        ├── routes/                ผูก path → controller (1 ไฟล์ต่อ 1 โดเมน + index.ts รวมทุกโดเมน)
        ├── controllers/           รับ request/ตอบ response เรียก service เท่านั้น
        ├── services/              business logic (dashboard.service.ts มี logic จริง ที่เหลือ stub)
        ├── repositories/          ชั้นเข้าถึงข้อมูล — จองที่ไว้สำหรับ HOSxP (ยังไม่ implement)
        ├── middleware/            error handler กลาง
        └── types/                 TypeScript interfaces ที่ใช้ร่วมกัน
```

**หลักการแยกชั้น (backend)**: request ไหลทางเดียวเสมอ `routes → controllers → services → repositories` ห้าม controller เรียก repository ตรง และห้าม route มี logic เกินกว่าการผูก path

โฟลเดอร์ `frontend-legacy-vanilla/` และ `backend-legacy-nestjs/` คือเวอร์ชันก่อนหน้า (HTML+Alpine.js กับ NestJS module-per-domain) เก็บไว้เป็นข้อมูลอ้างอิง ไม่ได้ใช้งานต่อ

## สถานะปัจจุบัน

- **Backend**: ใช้งานได้จริง — `/api/health`, `/api/dashboard/summary`, `/api/opd/report`, `/api/ipd/report`, `/api/er/report`, `/api/dental/report`, `/api/physio/report`, `/api/telemedicine/report`, `/api/thai-medicine/report`, `/api/drug-budget/report`, `/api/drug-budget/compare`, `/api/readmit/report`, `/api/referral/report`, `/api/queue/report`, `/api/icd10/summary`, `/api/feedback` (แจ้งปัญหาจากหน้าติดต่อผู้พัฒนา เก็บที่ `backend/data/feedback.jsonl` ผู้ดูแลอ่านได้ที่ `/api/admin/feedback` แนบรูปได้สูงสุด 3 รูป (ย่อในเบราว์เซอร์ก่อนส่ง เก็บที่ `backend/data/feedback-uploads/` ดูได้เฉพาะผู้ดูแล ลบรูปอัตโนมัติเมื่อเรื่อง "ดำเนินการแล้ว" ครบ 90 วัน) และแจ้งเข้า Telegram พร้อมรูปเมื่อตั้ง `TELEGRAM_*` ใน `backend/.env` — `npm run telegram:chat-id` / `npm run telegram:test` ในโฟลเดอร์ backend) (รายงานรับ `?start=YYYY-MM-DD&end=YYYY-MM-DD`) — **ข้อมูลยังเป็น mock** (`services/dashboard-mock.ts`, `services/reports-mock.ts`, `services/dental-mock.ts`, `services/physio-mock.ts`, `services/telemedicine-mock.ts`, `services/thai-medicine-mock.ts`, `services/drug-budget-mock.ts`, `services/readmit-mock.ts`, `services/referral-mock.ts`, `services/queue-mock.ts`, `services/icd10-mock.ts`) ส่วน login ต่อ HOSxP จริงแล้ว — Stroke Unit ซ่อนไว้ชั่วคราวเพราะข้อมูลยังไม่แน่ชัด (ไม่มีห้องผ่าตัดที่ รพ. จึงเอาออก)
- **Frontend**: หน้า Dashboard, OPD, IPD, ER, ทันตกรรม, กายภาพบำบัด, การแพทย์ทางไกล, แพทย์แผนไทย, ปริมาณการใช้ยา, Re-admit, การส่งต่อ (Refer) และ ICD-10 ใช้งานได้ (ข้อมูล mock จาก backend) — ถ้าเรียก backend ไม่ได้ Dashboard จะใช้ mock ในเครื่องแทนชั่วคราว หน้าที่เหลือเป็น placeholder


## ที่พักผลรายงาน (cache) — ไม่ให้ HOSxP ถูก query บ่อยเกินไป

- **เตรียมล่วงหน้าทุก 30 นาที** (ตรง :00/:30) ดึง "ช่วงยอดนิยม" (ต้นเดือน→วันนี้, ต้นปีงบ→วันนี้) ของทุกรายงานทีละชุด → ผู้ใช้เปิดหน้าได้ผลทันที
- **ช่วงวันที่ที่ผู้ใช้เลือกเอง** ดึงครั้งแรกแล้วพักไว้ (รวมวันนี้ 30 นาที / ในอดีต 24 ชม.) · คำขอซ้ำพร้อมกันรวมเป็นครั้งเดียว · query พร้อมกันสูงสุด 2 ที่เหลือเข้าคิว
- ดึงไม่สำเร็จ → แสดงข้อมูลชุดเดิม + ป้าย "ข้อมูลอาจไม่เป็นปัจจุบัน" · ล้ม 2 รอบติดแจ้ง Telegram
- บันทึกลง `backend/data/report-cache.json` — รีสตาร์ทแล้วใช้ต่อได้
- หน้าเว็บจำผลไว้ 2 นาที (สลับหน้าไปมาไม่ต้องรอ) · ล้างเมื่อ login/logout · แสดง Skeleton ทุกครั้งที่เปลี่ยนหน้า
- ผู้ดูแล: เมนู **สถานะข้อมูล** (`/admin/data`) ดูรอบล่าสุด/ถัดไป, รายงานที่ช้า, ปุ่มดึงข้อมูลใหม่ (ทุก 10 นาที)
- ค่าตั้ง: `CACHE_PREWARM_MINUTES`, `CACHE_TTL_TODAY_MINUTES`, `CACHE_TTL_PAST_HOURS`, `HOSXP_MAX_CONCURRENT` ใน `backend/.env`

**ต่อ HOSxP จริงทีละรายงาน:** แก้ที่ `backend/src/cache/report-registry.ts` ที่เดียว — เปลี่ยน `load` ของรายงานนั้นให้เรียก query (อ่านอย่างเดียว ผ่าน `timedQuery`) แทน `generateXxx()` โดยคืนข้อมูลรูปแบบเดิม แล้วเปลี่ยน `source` เป็น `'hosxp'` — cache/หน้าเว็บไม่ต้องแก้

## รันโปรเจกต์

วิธีที่ง่ายที่สุด: รัน `npm run dev` ที่โฟลเดอร์หลัก — ทั้งสองตัวรันในเทอร์มินัลเดียว แต่ละบรรทัดมีเวลาและป้ายกำกับ `Backend` (สีฟ้า) กับ `Frontend` (สีเขียว) ตอนเริ่ม backend จะสรุปสถานะ (ต่อ HOSxP ได้ไหม / ใช้ข้อมูลจำลองหรือจริง) และพิมพ์ request บรรทัดละ 1 รายการ เช่น `GET    200 /api/dashboard/summary · Rapepan23 · 3ms` (ไม่แสดงค่าหลัง `?`, สีเหลือง/แดง = 4xx/5xx, เกิน 1 วินาทีขึ้น `⚠ ช้า`) รวมถึง login สำเร็จ/ไม่สำเร็จ

ถ้าอยากรันแยกเอง ทำตามด้านล่าง

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev   
```

frontend เรียก API ผ่าน proxy ของ Vite (`/api` → `http://127.0.0.1:4000`) เพื่อให้ cookie login ใช้ได้ — ถ้า backend รันคนละ port ให้ตั้ง `VITE_API_PROXY_TARGET` ตอนรัน frontend

## Login และสิทธิ์การใช้งาน

**ทุกคนเปิดดูได้โดยไม่ต้อง login** (ผู้เยี่ยมชม) — login แล้วจะได้ใช้งานเพิ่มตามบทบาท ตั้งค่าได้ใน `backend/.env` (ดูตัวอย่างใน `backend/.env.example`)

อะไรต้อง login กำหนดไว้ที่เดียวคือ `GUEST_ACCESS` ใน `backend/src/auth/roles.ts` — มี 3 ระดับ:

| | ผู้เยี่ยมชม (ไม่ login) | เจ้าหน้าที่ (มีบัญชี HOSxP) | ผู้ดูแลระบบ |
|---|---|---|---|
| Dashboard + หน้าแผนก + เลือกช่วงวันที่ | ✅ | ✅ | ✅ |
| ดูรายละเอียดค่ารักษาแยกตามสิทธิ์ | – | ✅ | ✅ |
| ส่งออก Excel / พิมพ์ PDF (ผู้เยี่ยมชมเห็นปุ่มติดกุญแจ, กด Ctrl+P ได้แค่ข้อความให้ login) | – | ✅ | ✅ |
| ค้นหาผู้ป่วยรายคน (ICD-10) | – | ✅ | ✅ |
| ประวัติการใช้งาน | – | – | ✅ |

ผู้เยี่ยมชมจะเห็นปุ่มที่ต้อง login เป็นรูปแม่กุญแจ กดแล้วไปหน้า login และกลับมาหน้าเดิมเมื่อ login เสร็จ

- **login ด้วยบัญชี HOSxP เท่านั้น** (ไม่มีบัญชีทดสอบ/รหัสผ่านร่วม): ตรวจกับตาราง `opduser` (อ่านอย่างเดียว, md5 เทียบ `passweb`, บัญชีที่ `account_disable=Y` เข้าไม่ได้) — ตั้งค่าการเชื่อมต่อ `HOSXP_*` ใน `backend/.env`
- **ผู้ดูแลระบบ** คือผู้ใช้ที่ `groupname = ผู้ดูแลระบบ` ใน HOSxP (อัตโนมัติ, เปลี่ยนชื่อกลุ่มได้ที่ `HOSXP_ADMIN_GROUP`) — ทุกคนที่เหลือที่มีบัญชี HOSxP ที่ยังใช้งานเป็นเจ้าหน้าที่
- ประวัติการใช้งานเก็บที่ `backend/data/audit-log.jsonl` (สร้างอัตโนมัติ ไม่อยู่ใน git)
- ไม่ได้ใช้งานเกิน `SESSION_IDLE_MINUTES` (30 นาที) ระบบจะกลับเป็นผู้เยี่ยมชมอัตโนมัติ — auto-refresh เบื้องหลังไม่นับเป็นการใช้งาน
- บนเครื่องจริงต้องตั้ง `AUTH_SECRET` เป็นค่าสุ่มยาว ๆ และ `COOKIE_SECURE=true` เมื่อเปิดผ่าน https

## ผู้พัฒนา

| Field  | Details                                                |
| ------ | ------------------------------------------------------- |
| Role      | Full-stack Developer                                     |
| Email     | [rapepan23.rpp@gmail.com](mailto:rapepan23.rpp@gmail.com) |
| GitHub    | [@rapepan](https://github.com/rapepan)                    |
| Portfolio | [portfolio-rapepan.vercel.app](https://portfolio-rapepan.vercel.app/) |