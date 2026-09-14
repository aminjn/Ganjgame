// شیت پیش‌نمایش اسپرایت‌های برش‌خورده روی شطرنجی (برای بازبینی برش و شفافیت)
import sharp from 'sharp';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = 'public/assets/sprites'; const out = process.argv[2] || 'contact.png';
const files = []; const walk = d => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.png')) files.push(p); } }; walk(root);
const cell = 128, cols = 10, rows = Math.ceil(files.length / cols);
const checker = Buffer.from(`<svg width="${cols * cell}" height="${rows * cell}"><defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#bbb"/><rect x="8" y="8" width="8" height="8" fill="#bbb"/><rect x="8" width="8" height="8" fill="#eee"/><rect y="8" width="8" height="8" fill="#eee"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
const comps = [];
for (let i = 0; i < files.length; i++) {
  const buf = await sharp(files[i]).resize(cell - 8, cell - 24, { fit: 'inside' }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  comps.push({ input: buf, left: (i % cols) * cell + Math.floor((cell - meta.width) / 2), top: Math.floor(i / cols) * cell + 2 });
  comps.push({ input: Buffer.from(`<svg width="${cell}" height="20"><text x="4" y="14" font-size="10" fill="#000" font-family="sans-serif">${files[i].split('/').slice(-2).join('/').replace('.png', '').slice(0, 22)}</text></svg>`), left: (i % cols) * cell, top: Math.floor(i / cols) * cell + cell - 20 });
}
await sharp(checker).composite(comps).png().toFile(out);
console.log('contact sheet', files.length, 'sprites ->', out);
