#!/usr/bin/env bash
# پشتیبان سازگار با WAL از پایگاه‌داده (VACUUM INTO) + نگهداری ۱۴ نسخه‌ی آخر. اجرا: bash deploy/backup.sh /opt/ganjgame
set -euo pipefail
APP_DIR="${1:-/opt/ganjgame}"
OUT="$APP_DIR/backups/ganj-$(date +%Y%m%d-%H%M%S).sqlite"
cd "$APP_DIR/server"
node --no-warnings=ExperimentalWarning dist/server.mjs --backup "$OUT"
gzip -f "$OUT"
ls -1t "$APP_DIR"/backups/ganj-*.sqlite.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "پشتیبان: $OUT.gz"
