#!/usr/bin/env bash
# نصب کامل «بازی گنج» روی یک سرور خالی اوبونتو (۲۲.۰۴ / ۲۴.۰۴) در آروان‌کلاد.
# اجرا با root:  bash deploy/install.sh example.com admin@example.com
#   $1 = دامنه (اختیاری؛ بدون دامنه فقط HTTP روی IP)     $2 = ایمیل برای گواهی Let's Encrypt (اختیاری)
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/opt/ganjgame"
APP_USER="ganj"
NODE_MAJOR=22
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

log() { echo -e "\n\033[1;32m==> $*\033[0m"; }

[ "$(id -u)" = "0" ] || { echo "با root اجرا کنید (sudo bash deploy/install.sh …)"; exit 1; }

log "بسته‌های پایه"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg nginx ufw rsync xz-utils

# ---------- Node.js 22 ----------
need_node=1
if command -v node >/dev/null 2>&1; then
  v="$(node -v | sed 's/v//' | cut -d. -f1)"; [ "$v" -ge "$NODE_MAJOR" ] && need_node=0
fi
if [ "$need_node" = "1" ]; then
  log "نصب Node.js $NODE_MAJOR"
  if curl -fsSL --max-time 20 "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource.sh 2>/dev/null && bash /tmp/nodesource.sh && apt-get install -y nodejs; then
    echo "Node از NodeSource نصب شد"
  else
    echo "NodeSource در دسترس نبود؛ نصب از فایل فشرده‌ی nodejs.org"
    ARCH="$(uname -m)"; case "$ARCH" in x86_64) NARCH=x64;; aarch64) NARCH=arm64;; *) echo "معماری ناشناخته $ARCH"; exit 1;; esac
    VER="$(curl -fsSL https://nodejs.org/dist/index.json | grep -o "\"v${NODE_MAJOR}\.[0-9]*\.[0-9]*\"" | head -1 | tr -d '"')"
    [ -n "$VER" ] || VER="v22.12.0"
    curl -fsSL "https://nodejs.org/dist/${VER}/node-${VER}-linux-${NARCH}.tar.xz" -o /tmp/node.tar.xz
    mkdir -p /usr/local/lib/nodejs && tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs
    ln -sf "/usr/local/lib/nodejs/node-${VER}-linux-${NARCH}/bin/node" /usr/local/bin/node
    ln -sf "/usr/local/lib/nodejs/node-${VER}-linux-${NARCH}/bin/npm" /usr/local/bin/npm
    ln -sf "/usr/local/lib/nodejs/node-${VER}-linux-${NARCH}/bin/npx" /usr/local/bin/npx
  fi
fi
node -v; npm -v

# ---------- کاربر و پوشه ----------
log "کاربر سرویس و پوشه‌ی برنامه"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$APP_DIR/data" "$APP_DIR/backups"
if [ "$REPO_DIR" != "$APP_DIR" ]; then
  rsync -a --delete --exclude node_modules --exclude server/node_modules --exclude dist --exclude server/dist --exclude data --exclude backups --exclude .git "$REPO_DIR/" "$APP_DIR/"
fi
cd "$APP_DIR"

# ---------- .env ----------
if [ ! -f "$APP_DIR/server/.env" ]; then
  log "ساخت server/.env (کلیدها تصادفی؛ گذرواژه‌ی ادمین را یادداشت کنید)"
  ADMIN_PW="$(head -c 12 /dev/urandom | base64 | tr -d '/+=' | head -c 14)"
  JWT="$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n')"
  PUB="http://${DOMAIN:-$(curl -fsSL -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')}"
  [ -n "$DOMAIN" ] && [ -n "$EMAIL" ] && PUB="https://$DOMAIN"
  cat > "$APP_DIR/server/.env" <<ENV
PORT=8787
HOST=127.0.0.1
DB_PATH=$APP_DIR/data/ganj.sqlite
STATIC_DIR=$APP_DIR/dist
JWT_SECRET=$JWT
ADMIN_PASSWORD=$ADMIN_PW
PUBLIC_URL=$PUB
TRUST_PROXY=1
COOKIE_SECURE=$([ -n "$DOMAIN" ] && [ -n "$EMAIL" ] && echo 1 || echo 0)
TICK_MS=250
# ZARINPAL_MERCHANT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# ZARINPAL_SANDBOX=0
ENV
  echo "گذرواژه‌ی پنل ادمین: $ADMIN_PW   (در $APP_DIR/server/.env)"
fi

# ---------- ساخت ----------
log "نصب وابستگی‌ها و ساخت کلاینت + سرور"
npm ci --no-audit --no-fund
npm run build
( cd server && npm ci --no-audit --no-fund && npm run build )
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/server/.env"

# ---------- systemd ----------
log "سرویس systemd"
sed "s#__APP_DIR__#$APP_DIR#g; s#__APP_USER__#$APP_USER#g" "$APP_DIR/deploy/ganjgame.service" > /etc/systemd/system/ganjgame.service
sed "s#__APP_DIR__#$APP_DIR#g; s#__APP_USER__#$APP_USER#g" "$APP_DIR/deploy/ganjgame-backup.service" > /etc/systemd/system/ganjgame-backup.service
cp "$APP_DIR/deploy/ganjgame-backup.timer" /etc/systemd/system/ganjgame-backup.timer
systemctl daemon-reload
systemctl enable --now ganjgame.service ganjgame-backup.timer
systemctl restart ganjgame.service

# ---------- nginx ----------
log "nginx"
SERVER_NAME="${DOMAIN:-_}"
sed "s#__SERVER_NAME__#$SERVER_NAME#g; s#__APP_DIR__#$APP_DIR#g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/ganjgame
ln -sf /etc/nginx/sites-available/ganjgame /etc/nginx/sites-enabled/ganjgame
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ---------- فایروال ----------
log "فایروال (ufw)"
ufw allow OpenSSH >/dev/null || true
ufw allow 'Nginx Full' >/dev/null || true
ufw --force enable >/dev/null || true

# ---------- HTTPS ----------
if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  log "گواهی HTTPS (Let's Encrypt)"
  if apt-get install -y certbot python3-certbot-nginx; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo "certbot ناموفق بود؛ بعداً دستی اجرا کنید: certbot --nginx -d $DOMAIN"
  fi
fi

log "تمام شد"
echo "آدرس بازی:   ${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://$(hostname -I | awk '{print $1}')}"
echo "پنل ادمین:   …/admin.html   (گذرواژه در $APP_DIR/server/.env)"
echo "وضعیت:       systemctl status ganjgame     لاگ: journalctl -u ganjgame -f"
echo "پشتیبان‌ها:  $APP_DIR/backups (هر شب، ۱۴ نسخه)"
