#!/usr/bin/env bash
# به‌روزرسانی نسخه‌ی نصب‌شده از مخزن گیت (اجرا با root روی سرور): bash /opt/ganjgame/deploy/update.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/ganjgame}"
cd "$APP_DIR"
if [ -d .git ]; then git pull --ff-only; fi
npm ci --no-audit --no-fund && npm run build
( cd server && npm ci --no-audit --no-fund && npm run build )
chown -R ganj:ganj "$APP_DIR"
systemctl restart ganjgame
systemctl --no-pager status ganjgame | head -5
