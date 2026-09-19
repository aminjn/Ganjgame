// پیکربندی از متغیرهای محیطی (فایل .env در سرور)
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile(process.env.ENV_FILE ?? '.env');

const env = (k: string, d = '') => process.env[k] ?? d;
export const config = {
  port: Number(env('PORT', '8787')),
  host: env('HOST', '0.0.0.0'),
  dbPath: env('DB_PATH', './data/ganj.sqlite'),
  staticDir: env('STATIC_DIR', '../dist'),
  jwtSecret: env('JWT_SECRET', '') || (() => { const s = randomBytes(32).toString('hex'); console.warn('[config] JWT_SECRET تنظیم نشده؛ کلید موقت ساخته شد (با هر ری‌استارت نشست‌ها باطل می‌شود)'); return s; })(),
  adminPassword: env('ADMIN_PASSWORD', ''),
  publicUrl: env('PUBLIC_URL', 'http://localhost:8787'),
  zarinpalMerchant: env('ZARINPAL_MERCHANT', ''),
  zarinpalSandbox: env('ZARINPAL_SANDBOX', '0') === '1',
  tickMs: Number(env('TICK_MS', '250')),
  trustProxy: env('TRUST_PROXY', '1') === '1',
  cookieSecure: env('COOKIE_SECURE', '0') === '1',
};
