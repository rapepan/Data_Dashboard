#!/usr/bin/env bash
# DATA BSTH — เฝ้า backend จากภายนอก: backend ไม่ตอบติดกันเกิน DOWN_MINUTES นาที (ค่าเริ่มต้น 5) → แจ้งผู้ดูแลทาง Telegram
# กลับมาตอบได้แล้ว → แจ้งอีกครั้ง (บอกว่าล่มนานเท่าไร) · ล่มสั้น ๆ ไม่ถึงเกณฑ์ไม่แจ้ง
# (ฐานข้อมูลล่ม / backend ดับไม่ปกติ — backend แจ้งเอง ดู backend/src/system/watchdog.ts)
#
# ตั้งให้รันทุกนาที (crontab -e ของบัญชีที่รัน backend):
#   * * * * * bash /opt/bsth-dashboard/deploy/scripts/watchdog.sh
# ปลายทาง: TELEGRAM_ALERT_CHAT_ID ใน backend/.env (เว้นว่าง = TELEGRAM_CHAT_ID)
# ทดสอบส่ง:  bash deploy/scripts/watchdog.sh --test
# ข้อจำกัด: ถ้าทั้งเครื่อง server ดับ / เครือข่ายขาด สคริปต์นี้ก็ส่งไม่ได้ — ต้องเฝ้าจากเครื่องอื่น
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/backend/.env"
STATE="${STATE_FILE:-/tmp/bsth-dashboard-watchdog.state}"
DOWN_MINUTES="${DOWN_MINUTES:-5}"

[ -f "$ENV_FILE" ] || exit 0
env_get() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | sed -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
TOKEN="$(env_get TELEGRAM_BOT_TOKEN)"
CHATS="$(env_get TELEGRAM_ALERT_CHAT_ID)"
[ -n "$CHATS" ] || CHATS="$(env_get TELEGRAM_CHAT_ID)"
PORT="$(env_get PORT)"; PORT="${PORT:-4000}"

send() {
  [ -n "$TOKEN" ] && [ -n "$CHATS" ] || return 0
  local chat
  for chat in ${CHATS//,/ }; do
    curl -fsS -m 10 "https://api.telegram.org/bot$TOKEN/sendMessage" \
      --data-urlencode "chat_id=$chat" --data-urlencode "parse_mode=HTML" --data-urlencode "text=$1" >/dev/null \
      || echo "[watchdog] ส่ง Telegram → $chat ไม่สำเร็จ" >&2
  done
}
# เวลาไทย dd/mm/พ.ศ. HH:MM — บวก 7 ชม. จาก UTC เอง (ไม่พึ่งฐานเขตเวลาของเครื่อง)
thai_time() { date -u -d "@$(( $1 + 25200 ))" '+%d/%m/%Y %H:%M' 2>/dev/null | awk -F/ '{ split($3, a, " "); printf "%s/%s/%d %s", $1, $2, a[1] + 543, a[2] }'; }

if [ "${1:-}" = "--test" ]; then
  send "✅ <b>DATA BSTH</b>
ทดสอบการแจ้งเตือนระบบล่ม — ตั้งค่าถูกต้อง ($(hostname))"
  echo "ส่งข้อความทดสอบแล้ว (ถ้าตั้งค่า Telegram ไว้)"; exit 0
fi

NOW="$(date +%s)"
DOWN_SINCE=""; ALERTED=0
[ -f "$STATE" ] && read -r DOWN_SINCE ALERTED < "$STATE"

if curl -fsS -m 10 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  if [ -n "$DOWN_SINCE" ] && [ "$ALERTED" = "1" ]; then
    MIN=$(( (NOW - DOWN_SINCE + 59) / 60 ))
    send "✅ <b>DATA BSTH: เว็บกลับมาใช้งานได้แล้ว</b>
ล่มไปประมาณ $MIN นาที (ตั้งแต่ $(thai_time "$DOWN_SINCE") น.)"
  fi
  rm -f "$STATE"
  exit 0
fi

# backend ไม่ตอบ
[ -n "$DOWN_SINCE" ] || DOWN_SINCE="$NOW"
if [ "$ALERTED" != "1" ] && [ $(( NOW - DOWN_SINCE )) -ge $(( DOWN_MINUTES * 60 )) ]; then
  STATUS="$(systemctl is-active bsth-dashboard 2>/dev/null || echo 'ไม่ทราบ')"
  send "🔴 <b>DATA BSTH: เว็บใช้งานไม่ได้</b>
backend ไม่ตอบตั้งแต่ $(thai_time "$DOWN_SINCE") น. ($(( (NOW - DOWN_SINCE) / 60 )) นาที)
สถานะ service: <code>$STATUS</code> · เครื่อง $(hostname)
ดูสาเหตุ: journalctl -u bsth-dashboard -n 80
จะแจ้งอีกครั้งเมื่อกลับมาใช้งานได้"
  ALERTED=1
fi
echo "$DOWN_SINCE $ALERTED" > "$STATE"
