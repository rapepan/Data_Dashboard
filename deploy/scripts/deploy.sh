#!/usr/bin/env bash
# DATA BSTH — อัปเดตระบบบน server ในคำสั่งเดียว: ดึงโค้ด → ติดตั้ง → ทดสอบ → build → รีสตาร์ท → ตรวจว่าขึ้น
#
# ใช้:   bash deploy/scripts/deploy.sh              (รันด้วยบัญชีเจ้าของโฟลเดอร์ เช่น bsth — ขั้นรีสตาร์ทจะขอ sudo)
#        SKIP_PULL=1 bash deploy/scripts/deploy.sh  (ไม่ git pull — เช่น คัดลอกโค้ดมาเอง)
#        SKIP_TESTS=1 bash deploy/scripts/deploy.sh (ข้ามชุดทดสอบ — ไม่แนะนำ)
#
# ก่อนอัปเดตที่กระทบผู้ใช้: ประกาศล่วงหน้า / เปิดโหมดปิดปรับปรุงในหน้า "ประกาศ / ปิดปรับปรุง" (ดูคู่มือติดตั้ง ข้อ 8.1)
# หน้าเว็บ build ใส่โฟลเดอร์ใหม่แล้วค่อยสลับ — ผู้ใช้ไม่เจอหน้าว่างระหว่าง build · ของเดิมเก็บไว้ที่ frontend/dist-prev (ย้อนกลับได้)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE="${SERVICE:-bsth-dashboard}"
cd "$ROOT"

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f backend/.env ] || die "ไม่พบ backend/.env — คัดลอกจาก backend/.env.production.example แล้วกรอกค่าก่อน"
command -v node >/dev/null || die "ไม่พบ node — ติดตั้ง Node.js 24 ก่อน"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || die "Node.js ต้องเป็น v22 ขึ้นไป (ตอนนี้ $(node -v))"

OLD_VERSION="$(node -p "require('./package.json').version")"

if [ "${SKIP_PULL:-0}" != "1" ]; then
  step "ดึงโค้ดล่าสุด (git pull)"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "มีไฟล์ที่แก้บน server ค้างอยู่ (git status) — จัดการก่อน ไม่งั้นจะชนกับโค้ดใหม่"
  git pull --ff-only
fi
NEW_VERSION="$(node -p "require('./package.json').version")"

step "ติดตั้งไลบรารี (npm ci)"
npm ci --prefix backend --no-audit --no-fund
npm ci --prefix frontend --no-audit --no-fund

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  step "ชุดทดสอบ (ไม่แตะข้อมูลจริง / ไม่ส่ง Telegram)"
  npm test --prefix backend
  npm test --prefix frontend
fi

step "build backend"
npm run build --prefix backend

step "build หน้าเว็บ (ใส่โฟลเดอร์ใหม่ก่อน แล้วค่อยสลับ)"
rm -rf frontend/dist-next
npm run build --prefix frontend -- --outDir dist-next --emptyOutDir
rm -rf frontend/dist-prev
[ -d frontend/dist ] && mv frontend/dist frontend/dist-prev
mv frontend/dist-next frontend/dist

step "รีสตาร์ท backend"
if systemctl list-unit-files "$SERVICE.service" >/dev/null 2>&1 && systemctl is-enabled "$SERVICE" >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE"
else
  die "ไม่พบ service $SERVICE ใน systemd — ติดตั้งตามคู่มือข้อ 5.1 ก่อน (ไฟล์หน้าเว็บอัปเดตแล้ว)"
fi

step "ตรวจว่า backend กลับมาใช้งานได้"
PORT="$({ grep -E '^PORT=' backend/.env || true; } | tail -1 | cut -d= -f2 | tr -d '"'"'"' \r')"
PORT="${PORT:-4000}"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    printf '\n\033[1;32m✔ อัปเดตเสร็จ — V %s → V %s\033[0m\n' "$OLD_VERSION" "$NEW_VERSION"
    [ "$OLD_VERSION" != "$NEW_VERSION" ] && echo "  หน้าเว็บที่เปิดค้างไว้จะขึ้นกล่อง \"ระบบอัปเดตเป็น V $NEW_VERSION แล้ว\" ให้ผู้ใช้กดรีเฟรช"
    echo "  ถ้าเปิดโหมดปิดปรับปรุงไว้ อย่าลืมตรวจระบบแล้วกด \"ปิดโหมด\""
    exit 0
  fi
  sleep 1
done
die "backend ไม่ตอบภายใน 30 วินาที — ดูสาเหตุ: journalctl -u $SERVICE -n 80 · ย้อนหน้าเว็บ: mv frontend/dist-prev frontend/dist"
