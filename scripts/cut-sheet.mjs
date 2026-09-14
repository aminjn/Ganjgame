// برش عناصر از شیت‌های مرجع (سند اول، بخش ج) و حذف پس‌زمینه‌ی تیره → اسپرایت PNG شفاف + ثبت در manifest.
// Usage: node scripts/cut-sheet.mjs <sheet.png> <regions.json> [outDir=public/assets/sprites]
// regions.json: [{ "key": "units.soldier.idle", "file": "units/soldier_idle.png", "x":..,"y":..,"w":..,"h":.., "tileW":0.9,"tileH":1.1, "frames":1 }]
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [,, sheet, regionsPath, outDir = 'public/assets/sprites'] = process.argv;
if (!sheet || !regionsPath) { console.error('usage: node scripts/cut-sheet.mjs <sheet.png> <regions.json> [outDir]'); process.exit(1); }
const regions = JSON.parse(readFileSync(regionsPath, 'utf8'));
const manifestPath = join(outDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

function setPath(o, path, v) { const ks = path.split('.'); let c = o; for (let i = 0; i < ks.length - 1; i++) { c[ks[i]] ??= {}; c = c[ks[i]]; } c[ks[ks.length - 1]] = v; }

for (const r of regions) {
  const img = sharp(sheet).extract({ left: r.x, top: r.y, width: r.w, height: r.h }).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  // رنگ پس‌زمینه: میانه‌ی پیکسل‌های چهار گوشه
  const corners = [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]].map(([x, y]) => { const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; });
  const bg = [0, 1, 2].map(c => corners.map(p => p[c]).sort((a, b) => a - b)[1]);
  const t0 = r.t0 ?? 28, t1 = r.t1 ?? 70; // فاصله‌ی رنگی از پس‌زمینه: زیر t0 شفاف، بالای t1 کامل
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // پیکسل‌های خیلی تیره‌ی کم‌اشباع = پس‌زمینه؛ خط دور سیاه اثر (که کنار رنگ‌های روشن است) با ماسک فاصله حفظ می‌شود
    const a = Math.max(0, Math.min(1, (dist - t0) / (t1 - t0)));
    data[i + 3] = Math.round(255 * (lum < 22 && dist < t1 ? Math.min(a, 0.35) : a));
  }
  const out = join(outDir, r.file);
  mkdirSync(dirname(out), { recursive: true });
  let s = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  if (r.size) s = s.resize(r.size, r.size, { fit: 'inside', withoutEnlargement: false });
  await s.png().toFile(out);
  const entry = { file: r.file, w: r.tileW ?? 1, h: r.tileH ?? 1 };
  if (r.frames && r.frames > 1) { entry.frames = r.frames; entry.cols = r.cols ?? r.frames; entry.fps = r.fps ?? 8; }
  if (r.anchor !== undefined) entry.anchor = r.anchor;
  setPath(manifest, r.key, entry);
  console.log(r.key, '->', r.file, `${info.width}x${info.height}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('manifest updated:', manifestPath);
