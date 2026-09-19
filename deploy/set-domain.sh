#!/usr/bin/env bash
# تنظیم دامنه/HTTPS بعد از نصب (یا تغییر آن). اجرا با root:
#   bash deploy/set-domain.sh                      → بدون دامنه: HTTP روی IP سرور
#   bash deploy/set-domain.sh game.example.ir me@mail.com → nginx + گواهی Let's Encrypt + HTTPS
set -euo pipefail
DOMAIN="${1:-}"; EMAIL="${2:-}"
APP_DIR="${APP_DIR:-/opt/ganjgame}"
ENV="$APP_DIR/server/.env"
[ -f "$ENV" ] || { echo "فایل $ENV پیدا نشد؛ اول deploy/install.sh را اجرا کنید"; exit 1; }
if [ "$DOMAIN" = "example.com" ] || [ "$DOMAIN" = "example.ir" ]; then echo "example.com فقط نمونه است؛ دامنه‌ی واقعی خودتان را بدهید یا بدون دامنه اجرا کنید"; exit 1; fi
IP="$(curl -fsSL -4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

setenv() { if grep -q "^$1=" "$ENV"; then sed -i "s#^$1=.*#$1=$2#" "$ENV"; else echo "$1=$2" >> "$ENV"; fi; }

# nginx (HTTP)
sed "s#__SERVER_NAME__#${DOMAIN:-_}#g; s#__APP_DIR__#$APP_DIR#g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/ganjgame
ln -sf /etc/nginx/sites-available/ganjgame /etc/nginx/sites-enabled/ganjgame
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# تا وقتی HTTPS برقرار نشده، کوکی‌ها باید روی HTTP کار کنند
setenv PUBLIC_URL "http://${DOMAIN:-$IP}"
setenv COOKIE_SECURE 0

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  apt-get install -y certbot python3-certbot-nginx >/dev/null
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
    setenv PUBLIC_URL "https://$DOMAIN"
    setenv COOKIE_SECURE 1
    echo "HTTPS برقرار شد: https://$DOMAIN"
  else
    echo "گواهی گرفته نشد (رکورد A دامنه باید به $IP اشاره کند و پورت ۸۰ باز باشد). فعلاً HTTP: http://${DOMAIN}"
  fi
fi
systemctl restart ganjgame
sleep 1
curl -fsS http://127.0.0.1:8787/api/health && echo
echo "آدرس بازی: $(grep ^PUBLIC_URL= "$ENV" | cut -d= -f2-)   پنل ادمین: $(grep ^PUBLIC_URL= "$ENV" | cut -d= -f2-)/admin.html"
