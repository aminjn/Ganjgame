# نصب «بازی گنج» روی سرور آروان‌کلاد (اوبونتو خالی)

سرور چندنفره‌ی بازی یک برنامه‌ی Node.js است (Fastify + SQLite داخلی Node؛ بدون Docker، بدون پایگاه‌داده‌ی جداگانه). همه‌چیز روی یک ماشین اجرا می‌شود و nginx جلوی آن می‌نشیند.

## پیش‌نیاز
- یک سرور ابری آروان با اوبونتو ۲۲.۰۴ یا ۲۴.۰۴ (حداقل ۱ هسته / ۱ گیگ رم)، دسترسی root با SSH.
- (اختیاری) یک دامنه که رکورد A آن به IP سرور اشاره کند — برای HTTPS.

## نصب (یک دستور)
```bash
# روی سرور، با root
apt-get update && apt-get install -y git
git clone https://github.com/aminjn/Ganjgame.git /opt/ganjgame
cd /opt/ganjgame
bash deploy/install.sh example.com admin@example.com     # با دامنه و ایمیل → HTTPS خودکار
# یا بدون دامنه (فقط HTTP روی IP):
bash deploy/install.sh
```
اسکریپت این کارها را می‌کند:
1. نصب Node.js 22 (از NodeSource؛ اگر در دسترس نبود از فایل فشرده‌ی nodejs.org)، nginx، ufw.
2. ساخت کاربر سرویس `ganj` و پوشه‌ی `/opt/ganjgame` با `data/` (پایگاه‌داده) و `backups/`.
3. ساخت `server/.env` با کلید نشست تصادفی و **گذرواژه‌ی ادمین تصادفی** (در پایان چاپ می‌شود؛ همیشه در `server/.env` هست).
4. ساخت کلاینت (`npm run build`) و سرور (`server/npm run build`).
5. سرویس systemd `ganjgame` (ری‌استارت خودکار) + تایمر پشتیبان شبانه.
6. پیکربندی nginx (فایل‌های ایستا، `/api` و `/ws` به Node) و فایروال.
7. اگر دامنه و ایمیل داده شده باشد: گواهی Let's Encrypt با certbot و ریدایرکت به HTTPS.

## بعد از نصب
| چه | کجا |
|---|---|
| بازی | `https://example.com/` |
| پنل ادمین | `https://example.com/admin.html` (گذرواژه در `server/.env`) |
| سوالات پرتکرار | `https://example.com/faq.html` |
| وضعیت سرویس | `systemctl status ganjgame` |
| لاگ زنده | `journalctl -u ganjgame -f` |
| پایگاه‌داده | `/opt/ganjgame/data/ganj.sqlite` |
| پشتیبان‌ها | `/opt/ganjgame/backups/` (هر شب ۰۳:۳۰، ۱۴ نسخه) |

### درگاه پرداخت
در `server/.env` مقدار `ZARINPAL_MERCHANT` را بگذارید و سرویس را ری‌استارت کنید (`systemctl restart ganjgame`). تا وقتی مرچنت خالی باشد، شارژ کیف پول به‌صورت «دستی» ثبت می‌شود: بازیکن مبلغ را کارت‌به‌کارت می‌کند و ادمین در تب «واریز و برداشت» تأیید می‌کند. برداشت‌ها همیشه دستی‌اند: ادمین پس از واریز به شبا «پرداخت شد» را می‌زند.

### به‌روزرسانی نسخه
```bash
bash /opt/ganjgame/deploy/update.sh
```

### پشتیبان دستی و بازگردانی
```bash
bash /opt/ganjgame/deploy/backup.sh /opt/ganjgame
# بازگردانی:
systemctl stop ganjgame
gunzip -c /opt/ganjgame/backups/ganj-XXXX.sqlite.gz > /opt/ganjgame/data/ganj.sqlite
chown ganj:ganj /opt/ganjgame/data/ganj.sqlite && systemctl start ganjgame
```

### تنظیمات `server/.env`
| کلید | معنا |
|---|---|
| `PORT`, `HOST` | پورت و آدرس گوش دادن Node (پشت nginx: `127.0.0.1:8787`) |
| `DB_PATH` | مسیر فایل SQLite |
| `STATIC_DIR` | پوشه‌ی خروجی کلاینت (`dist`) |
| `JWT_SECRET` | کلید امضای نشست‌ها (تغییرش همه را از حساب خارج می‌کند) |
| `ADMIN_PASSWORD` | گذرواژه‌ی پنل ادمین |
| `PUBLIC_URL` | آدرس عمومی سایت (برای بازگشت از درگاه) |
| `TRUST_PROXY` | `1` پشت nginx |
| `COOKIE_SECURE` | `1` روی HTTPS |
| `TICK_MS` | فاصله‌ی تیک موتور بازی (میلی‌ثانیه) |
| `ZARINPAL_MERCHANT`, `ZARINPAL_SANDBOX` | درگاه زرین‌پال |

## اجرای محلی برای توسعه
```bash
npm install && (cd server && npm install)
(cd server && cp .env.example .env && npm run dev)   # سرور روی 8787
npm run dev                                          # کلاینت روی 5173 با پروکسی /api و /ws
```
آزمون‌ها: `npm test` (قوانین) و `cd server && npm test` (سرور چندنفره و API).
