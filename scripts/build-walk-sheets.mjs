// شیت راه‌رفتن هر نیرو از فریم‌های Walk و Run (دو فریم متناوب) + ثبت در manifest
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
const root = 'public/assets/sprites';
const manifest = JSON.parse(readFileSync(root + '/manifest.json', 'utf8'));
for (const t of ['explorer', 'soldier', 'guide', 'archer', 'guard']) {
  const frames = ['frame_walk', 'frame_run', 'frame_walk', 'frame_idle'].map(f => `${root}/frames/${t}_${f}.png`);
  const size = 160;
  const bufs = await Promise.all(frames.map(f => sharp(f).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()));
  await sharp({ create: { width: size * 4, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(bufs.map((input, i) => ({ input, left: i * size, top: 0 }))).png().toFile(`${root}/units/${t}_walk.png`);
  manifest.units[t].walk = { file: `units/${t}_walk.png`, w: 1.15, h: 1.15, frames: 4, cols: 4, fps: 6 };
  // idle: پرتره‌ی بزرگ؛ نسبت ابعاد را از خود تصویر بگیر
  const m = await sharp(`${root}/units/${t}_idle.png`).metadata();
  const h = manifest.units[t].idle.h; manifest.units[t].idle.w = +(h * m.width / m.height).toFixed(2);
  console.log(t, 'walk sheet ok, idle w', manifest.units[t].idle.w);
}
// نسبت ابعاد بقیه‌ی اسپرایت‌ها هم از تصویر
const fix = async (obj) => { for (const [k, v] of Object.entries(obj)) { if (k.startsWith('_')) continue; if (v && v.file && !v.frames) { const m = await sharp(`${root}/${v.file}`).metadata(); v.w = +(v.h * m.width / m.height).toFixed(2); } else if (v && typeof v === 'object' && !v.file) await fix(v); } };
await fix(manifest);
writeFileSync(root + '/manifest.json', JSON.stringify(manifest, null, 1));
