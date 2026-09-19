// انتخاب خودکار بهترین پنجره‌ی یکدست (کم‌واریانس، بدون پس‌زمینه) برای بافت از یک ناحیه‌ی مرجع
import sharp from 'sharp';
const D = 'docs/سند-اول/04-مرجع-سبک/';
async function pick(file, region, win, want) {
  const { data, info } = await sharp(D + file).extract(region).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height; let best = null;
  for (let y = 0; y + win.h <= H; y += 12) for (let x = 0; x + win.w <= W; x += 12) {
    let n = 0, sr = 0, sg = 0, sb = 0, ss = 0;
    for (let j = 0; j < win.h; j += 3) for (let i = 0; i < win.w; i += 3) { const k = ((y + j) * W + x + i) * 3; const r = data[k], g = data[k + 1], b = data[k + 2]; sr += r; sg += g; sb += b; ss += r * r + g * g + b * b; n++; }
    const mr = sr / n, mg = sg / n, mb = sb / n; const varc = ss / n - (mr * mr + mg * mg + mb * mb);
    const score = want(mr, mg, mb) - Math.sqrt(varc) * 0.6;
    if (!best || score > best.score) best = { score, left: region.left + x, top: region.top + y, mr, mg, mb, sd: Math.sqrt(varc) };
  }
  return best;
}
const g = await pick('4-کاشی-چمن-ایزومتریک.jpg', { left: 820, top: 980, width: 760, height: 520 }, { w: 170, h: 110 }, (r, g, b) => g - r * 0.5 - b * 0.8);
const g2 = await pick('4-کاشی-چمن-ایزومتریک.jpg', { left: 20, top: 180, width: 760, height: 480 }, { w: 170, h: 110 }, (r, g, b) => g - r * 0.5 - b * 0.8);
const rk = await pick('7-کوهستان.jpg', { left: 820, top: 20, width: 760, height: 760 }, { w: 260, h: 170 }, (r, g, b) => (r + g + b) / 3 * 0.8 - Math.abs(r - b) * 0.5);
const rk2 = await pick('7-کوهستان.jpg', { left: 820, top: 820, width: 760, height: 760 }, { w: 260, h: 170 }, (r, g, b) => (r + g + b) / 3 * 0.8 - Math.abs(r - b) * 0.5);
console.log(JSON.stringify({ g, g2, rk, rk2 }));
