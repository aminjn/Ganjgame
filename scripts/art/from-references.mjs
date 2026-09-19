// ساخت دارایی‌های بازی از تصاویر مرجع کارفرما (بخش د سند اول): بافت زمین با برش از پنل‌ها + قطعه‌های صحنه با حذف پس‌زمینه‌ی تخت.
// اجرا: node scripts/art/from-references.mjs [مسیر پوشه‌ی تصاویر]   → public/assets/textures/* و public/assets/sprites/{buildings,scenery}/*
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] ?? 'docs/سند-اول/04-مرجع-سبک';
const REF = {
  camp: '1-کمپ-نقاشی.jpg', land: '2-سرزمین-گنج.jpg', ring: '3-نقشه-حلقه‌ای.jpg', grass: '4-کاشی-چمن-ایزومتریک.jpg', dry: '5-کاشی-علف-خشک.jpg',
  tomb: '6-مقبره.jpg', mountain: '7-کوهستان.jpg', marsh: '8-مرداب.jpg', hell: '9-جهنمی.jpg', danger: '10-سرزمین-خطر.jpg',
};
const src = k => join(SRC, REF[k]);
const TEX_DIR = 'public/assets/textures', SPR = 'public/assets/sprites';
mkdirSync(TEX_DIR, { recursive: true }); mkdirSync(`${SPR}/buildings`, { recursive: true }); mkdirSync(`${SPR}/scenery`, { recursive: true });

// ---------- بافت‌های زمین: برش از ناحیه‌ی بی‌شیء هر مرجع؛ در موتور با تکرار آینه‌ای بی‌درز می‌شوند ----------
const TEXTURES = {
  grass:   { img: 'grass', left: 1156, top: 1232, width: 170, height: 110 },   // پنل ۴: چمن یکدست (انتخاب خودکار pick-window)
  dry:     { img: 'dry', left: 420, top: 380, width: 220, height: 150 },      // پنل ۱: علف زرد با سنگریزه
  rock:    { img: 'mountain', left: 1048, top: 1132, width: 260, height: 170 }, // پنل ۴: صخره‌ی خاکستری (انتخاب خودکار)
  marsh:   { img: 'marsh', left: 980, top: 1120, width: 420, height: 320 },   // پنل ۴: گل و برکه‌ی فسفری
  cracked: { img: 'danger', left: 220, top: 160, width: 420, height: 340 },   // پنل ۱: زمین ترک‌خورده با رگه‌ی سرخ
  lava:    { img: 'hell', left: 900, top: 1120, width: 420, height: 340 },    // پنل ۴: گدازه
  stone:   { img: 'tomb', left: 1060, top: 1400, width: 240, height: 110 },   // پنل ۴: سنگفرش کف مقبره
  chasm:   { img: 'mountain', left: 260, top: 560, width: 300, height: 240 }, // پنل ۱: کف دره‌ی تاریک
};
const index = {};
for (const [k, c] of Object.entries(TEXTURES)) {
  await sharp(src(c.img)).extract({ left: c.left, top: c.top, width: c.width, height: c.height }).resize(1024, 1024, { fit: 'fill' }).jpeg({ quality: 88 }).toFile(`${TEX_DIR}/${k}.jpg`);
  index[k] = `${k}.jpg`; console.log('texture', k);
}
writeFileSync(`${TEX_DIR}/index.json`, JSON.stringify(index));

// ---------- قطعه‌های صحنه: پنل با پس‌زمینه‌ی تخت → حذف پس‌زمینه با پرشدن از گوشه‌ها ----------
async function keyPanel(img, panel, out, { tol = 46, feather = true } = {}) {
  const meta = await sharp(src(img)).metadata();
  const pw = meta.width / 2, ph = meta.height / 2;
  const left = (panel % 2) * pw, top = Math.floor(panel / 2) * ph;
  const { data, info } = await sharp(src(img)).extract({ left, top, width: pw, height: ph }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const mask = new Uint8Array(W * H); // 1 = پس‌زمینه
  const stack = [];
  const seed = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const seeds = [seed(2, 2), seed(W - 3, 2), seed(2, H - 3), seed(W - 3, H - 3), seed(W >> 1, 2), seed(W >> 1, H - 3), seed(2, H >> 1), seed(W - 3, H >> 1)];
  const near = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2]; for (const s of seeds) { if (Math.abs(r - s[0]) + Math.abs(g - s[1]) + Math.abs(b - s[2]) < tol) return true; } return false; };
  const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const k = y * W + x; if (mask[k]) return; if (!near(k * 4)) return; mask[k] = 1; stack.push(k); };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); } for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) { const k = stack.pop(); const x = k % W, y = (k / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  // آلفا: پس‌زمینه شفاف؛ لبه‌ها نرم
  for (let k = 0; k < W * H; k++) data[k * 4 + 3] = mask[k] ? 0 : 255;
  if (feather) {
    const a = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) a[k] = data[k * 4 + 3];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const k = y * W + x; if (!a[k]) continue; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += a[k + dy * W + dx] ? 1 : 0; if (n < 9) data[k * 4 + 3] = Math.round(255 * (n - 3) / 6); }
  }
  const png = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const trimmed = await sharp(png).trim({ threshold: 5 }).png().toBuffer();
  const m = await sharp(trimmed).metadata();
  await sharp(trimmed).toFile(out);
  console.log('set piece', out, m.width, m.height);
  return { w: m.width, h: m.height };
}
const manifestPath = `${SPR}/manifest.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { units: {}, monsters: {}, buildings: {}, scenery: {}, artifacts: {}, icons: {} };
const put = async (group, name, img, panel, h, opts) => {
  const file = `${group}/${name}.png`;
  const m = await keyPanel(img, panel, `${SPR}/${file}`, opts);
  manifest[group][name] = { file, w: +(h * m.w / m.h).toFixed(2), h };
};
// ساختمان‌ها: کمپ بازیکن (چمن با چادر و جنگل)، کمپ کلن (کمپ جنگلی بزرگ)، مقبره (ویرانه‌ی سنگی)
await put('buildings', 'camp', 'grass', 2, 3.2);       // پنل ۳ (پایین-چپ): چادر، کاج، صخره
await put('buildings', 'clan_camp', 'grass', 3, 3.6);  // پنل ۴ (پایین-راست): کمپ در جنگل بلوط
await put('buildings', 'tomb', 'tomb', 3, 3.4, { tol: 40 }); // پنل ۴: ویرانه‌ی مقبره با آتش
// قطعه‌های صحنه: تکه‌های چمن/علف/مرداب که به‌عنوان جزیره‌های تزئینی پراکنده می‌شوند
await put('scenery', 'grass_set1', 'grass', 0, 3.0);
await put('scenery', 'grass_set2', 'grass', 1, 3.0);
await put('scenery', 'dry_set1', 'dry', 0, 3.0);
await put('scenery', 'dry_set2', 'dry', 1, 3.0);
await put('scenery', 'dry_set3', 'dry', 2, 3.0);
await put('scenery', 'dry_set4', 'dry', 3, 3.0);
await put('scenery', 'marsh_set1', 'marsh', 1, 3.4, { tol: 40 });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log('done');
