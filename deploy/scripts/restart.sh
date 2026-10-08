#!/usr/bin/env bash
# DATA BSTH — รีสตาร์ท backend จากเครื่อง server (ใช้ตอนเข้าหน้าเว็บไม่ได้ — ปกติกดปุ่ม "รีสตาร์ทระบบ" ในหน้า ประกาศ / ปิดปรับปรุง)
# ปิดแบบนุ่มนวล → systemd เปิดใหม่ → รอจนตอบได้จริง แล้วบอกผล
# แจ้ง Telegram ผู้ดูแลตอนสั่ง และ backend แจ้งเองตอนกลับมา (เหมือนกดปุ่มในหน้าเว็บ) · หน้าผู้ดูแลแสดงเป็น "รีสตาร์ทครั้งล่าสุด"
#
# ใช้:   bash deploy/scripts/restart.sh                     (รันด้วยบัญชีเจ้าของโฟลเดอร์ เช่น bsth — ขั้นรีสตาร์ทจะขอ sudo)
#        bash deploy/scripts/restart.sh "แก้ค่าใน .env"      (ใส่เหตุผล — ส่งไปกับ Telegram)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE="${SERVICE:-bsth-dashboard}"
ENV_FILE="$ROOT/backend/.env"
REASON="${1:-}"

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "ไม่พบ $ENV_FILE"
systemctl list-unit-files "$SERVICE.service" >/dev/null 2>&1 && systemctl is-enabled "$SERVICE" >/dev/null 2>&1 \
  || die "ไม่พบ service $SERVICE ใน systemd — ติดตั้งตามคู่มือข้อ 5.1 ก่อน"

# อ่านค่าจาก .env (ไม่ source ทั้งไฟล์ — กันค่าที่มีอักขระพิเศษ) · ไม่มีคีย์นั้น = ค่าว่าง
env_get() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | sed -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
PORT="$(env_get PORT)"; PORT="${PORT:-4000}"
TOKEN="$(env_get TELEGRAM_BOT_TOKEN)"
CHATS="$(env_get TELEGRAM_ALERT_CHAT_ID)"
[ -n "$CHATS" ] || CHATS="$(env_get TELEGRAM_CHAT_ID)"
DATA_DIR="$(env_get DATA_DIR)"
case "$DATA_DIR" in
  "") DATA_DIR="$ROOT/backend/data" ;;
  /*) ;;
  *) DATA_DIR="$ROOT/backend/$DATA_DIR" ;; # backend เปิดที่โฟลเดอร์ backend — path แบบสัมพัทธ์นับจากที่นั่น
esac

esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
json() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }
send() {
  [ -n "$TOKEN" ] && [ -n "$CHATS" ] || return 0
  local chat
  for chat in ${CHATS//,/ }; do
    curl -fsS -m 10 "https://api.telegram.org/bot$TOKEN/sendMessage" \
      --data-urlencode "chat_id=$chat" --data-urlencode "parse_mode=HTML" --data-urlencode "text=$1" >/dev/null \
      || echo "  (ส่ง Telegram → $chat ไม่สำเร็จ)" >&2
  done
}
# เวลาไทย dd/mm/พ.ศ. HH:MM — บวก 7 ชม. จาก UTC เอง (ไม่พึ่งเขตเวลาของเครื่อง)
thai_time() { date -u -d "@$(( $(date +%s) + 25200 ))" '+%d/%m/%Y %H:%M' | awk -F/ '{ split($3, a, " "); printf "%s/%s/%d %s", $1, $2, a[1] + 543, a[2] }'; }

WHO="$(whoami)@$(hostname)"
step "บันทึกว่าใครสั่ง ($WHO)"
# backend ตัวใหม่อ่านไฟล์นี้ตอนเปิด → แจ้ง Telegram ว่ากลับมาแล้วใช้กี่วินาที + แสดงในหน้าผู้ดูแล
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
if printf '{"by":%s,"name":%s,"reason":%s,"requestedAt":"%s"}' "$(json "$WHO")" "$(json "คำสั่งบนเครื่อง server")" "$(json "$REASON")" "$NOW_ISO" > "$DATA_DIR/restart-request.json" 2>/dev/null; then
  echo "  ✔ $DATA_DIR/restart-request.json"
else
  echo "  - เขียนไฟล์ใน $DATA_DIR ไม่ได้ (ไม่มีสิทธิ์?) — ยังรีสตาร์ทต่อ แต่จะไม่มีข้อความ \"กลับมาแล้ว\""
fi
send "🔄 <b>DATA BSTH: ผู้ดูแลสั่งรีสตาร์ทระบบ</b>
โดย $(printf '%s' "$WHO" | esc) (คำสั่งบนเครื่อง server) · $(thai_time) น.${REASON:+
เหตุผล: $(printf '%s' "$REASON" | esc)}"

step "รีสตาร์ท $SERVICE"
STARTED=$(date +%s)
sudo systemctl restart "$SERVICE"

step "รอให้ backend กลับมาตอบ"
for i in $(seq 1 60); do
  if curl -fsS -m 3 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    printf '\n\033[1;32m✔ รีสตาร์ทเสร็จ — กลับมาใช้งานได้ใน %s วินาที\033[0m\n' "$(( $(date +%s) - STARTED ))"
    exit 0
  fi
  sleep 1
done
die "backend ไม่ตอบภายใน 60 วินาที — ดูสาเหตุ: journalctl -u $SERVICE -n 80 · สถานะ: systemctl status $SERVICE"
