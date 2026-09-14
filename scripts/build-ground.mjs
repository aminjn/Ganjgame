// بافت زمین از وجه بالایی کاشی‌های شیت: مربع درونی لوزی برداشته، آینه‌ای و تکرارشونده می‌شود (بدون لبه‌ی بلوک).
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = 'public/assets/sprites';
mkdirSync(root + '/ground', { recursive: true });
const manifest = JSON.parse(readFileSync(root + '/manifest.json', 'utf8'));
manifest.ground = {};
for (const t of ['safe', 'plain', 'mountain', 'marsh', 'danger', 'hell', 'tomb', 'treasure', 'valley']) {
  const src = `${root}/tiles/${t}.png`;
  const m = await sharp(src).metadata();
  // مرکز لوزی وجه بالا ≈ (۰٫۵ عرض، ۰٫۴۴ ارتفاع)؛ مربع درونی ≈ ۰٫۳۶ عرض
  const cx = Math.round(m.width * 0.5), cy = Math.round(m.height * 0.44), s = Math.round(m.width * 0.36);
  const patch = await sharp(src).extract({ left: cx - s / 2, top: cy - s / 2, width: s, height: s }).flatten({ background: '#6a8a3a' }).png().toBuffer();
  const a = patch, b = await sharp(patch).flop().png().toBuffer(), c = await sharp(patch).flip().png().toBuffer(), d = await sharp(patch).flip().flop().png().toBuffer();
  const out = await sharp({ create: { width: s * 2, height: s * 2, channels: 3, background: '#000' } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: s, top: 0 }, { input: c, left: 0, top: s }, { input: d, left: s, top: s }])
    .resize(256, 256, { kernel: 'lanczos3' }).blur(0.4).png().toBuffer();
  writeFileSync(`${root}/ground/${t}.png`, out);
  manifest.ground[t] = { file: `ground/${t}.png`, w: 1, h: 1 };
  console.log('ground', t, s);
}
writeFileSync(root + '/manifest.json', JSON.stringify(manifest, null, 1));
