#!/usr/bin/env bash
# DATA BSTH — สำรองข้อมูลของระบบ: ฐาน data_dashboard + โฟลเดอร์ data (รูปที่แนบในเรื่องแจ้งปัญหาเก็บเป็นไฟล์ที่นี่)
# ไม่แตะ HOSxP · เก็บย้อนหลัง KEEP_DAYS วัน (ค่าเริ่มต้น 30) เก่ากว่านั้นลบเอง
#
# ใช้:   bash deploy/scripts/backup.sh
# ตั้งให้รันทุกคืน 02:30 (crontab -e ของบัญชีที่รัน backend):
#   30 2 * * * bash /opt/bsth-dashboard/deploy/scripts/backup.sh >> /var/backups/bsth-dashboard/backup.log 2>&1
# ต้องมีคำสั่ง mysqldump (Ubuntu: sudo apt install mariadb-client · Rocky: sudo dnf install mariadb)
#
# กู้คืน:
#   gunzip -c data_dashboard-YYYYMMDD-HHMM.sql.gz | mysql -h <host> -u <user> -p data_dashboard
#   tar -xzf data-YYYYMMDD-HHMM.tar.gz -C /opt/bsth-dashboard/backend     (หยุด backend ก่อน)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/bsth-dashboard}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M)"
ENV_FILE="$ROOT/backend/.env"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "✘ $*"; exit 1; }

[ -f "$ENV_FILE" ] || fail "ไม่พบ $ENV_FILE"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# อ่านค่าจาก .env (ไม่ source ทั้งไฟล์ — กันค่าที่มีอักขระพิเศษ) · ไม่มีคีย์นั้น = ค่าว่าง (ไม่ให้ set -e หยุดสคริปต์)
env_get() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | sed -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
DB_HOST="$(env_get DASHBOARD_DB_HOST)"
DB_PORT="$(env_get DASHBOARD_DB_PORT)"
DB_USER="$(env_get DASHBOARD_DB_USER)"
DB_PASS="$(env_get DASHBOARD_DB_PASSWORD)"
DB_NAME="$(env_get DASHBOARD_DB_DATABASE)"
DATA_DIR="$(env_get DATA_DIR)"
DATA_DIR="${DATA_DIR:-$ROOT/backend/data}"

# 1) ฐาน data_dashboard
if [ -n "$DB_HOST" ] && [ -n "$DB_NAME" ]; then
  command -v mysqldump >/dev/null || fail "ไม่พบ mysqldump — ติดตั้ง mariadb-client ก่อน"
  # รหัสผ่านใส่ไฟล์ชั่วคราว (สิทธิ์ 600) — ไม่โผล่ในรายการโปรเซส (ps)
  CNF="$(mktemp)"
  trap 'rm -f "$CNF"' EXIT
  chmod 600 "$CNF"
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword="%s"\n' "$DB_HOST" "${DB_PORT:-3306}" "$DB_USER" "$DB_PASS" > "$CNF"
  OUT="$BACKUP_DIR/$DB_NAME-$STAMP.sql.gz"
  mysqldump --defaults-extra-file="$CNF" --single-transaction --quick --default-character-set=utf8mb4 \
    "$DB_NAME" | gzip -9 > "$OUT.part"
  mv "$OUT.part" "$OUT"
  log "✔ ฐาน $DB_NAME → $OUT ($(du -h "$OUT" | cut -f1))"
else
  log "- ไม่ได้ตั้งค่า DASHBOARD_DB_* — ข้อมูลทั้งหมดอยู่ในโฟลเดอร์ data (สำรองในขั้นถัดไป)"
fi

# 2) โฟลเดอร์ data — ไม่เอาที่พักผลรายงาน (report-cache.json สร้างใหม่ได้เอง)
if [ -d "$DATA_DIR" ]; then
  OUT="$BACKUP_DIR/data-$STAMP.tar.gz"
  tar -czf "$OUT.part" -C "$(dirname "$DATA_DIR")" --exclude='report-cache.json' --exclude='.write-test-*' "$(basename "$DATA_DIR")"
  mv "$OUT.part" "$OUT"
  log "✔ โฟลเดอร์ข้อมูล → $OUT ($(du -h "$OUT" | cut -f1))"
fi

# 3) ลบของเก่า
DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name 'data-*.tar.gz' \) -mtime +"$KEEP_DAYS" -print -delete | wc -l)"
log "✔ เสร็จ · ลบไฟล์เก่ากว่า $KEEP_DAYS วัน $DELETED ไฟล์ · พื้นที่ที่ใช้ $(du -sh "$BACKUP_DIR" | cut -f1)"
