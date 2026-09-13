// نمای کل سرزمین: از دل خودِ مولد زمین کشیده می‌شود (نه تصویر آماده).
import type { Terrain } from '../rules/constants';

export const MINI_COLORS: Record<Terrain, string> = {
  safe: '#9cc46a', plain: '#7fbf58', mountain: '#a0958a', marsh: '#4d6a46', danger: '#8e4e3e', hell: '#5c3230', tomb: '#b06cff', treasure: '#ffd54a', valley: '#2b2930',
};

export function drawTerrainPreview(canvas: HTMLCanvasElement, at: (x: number, y: number) => Terrain, res = 200): ImageData {
  canvas.width = res; canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, res);
  const step = 1000 / res;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const t = at(Math.floor(i * step + step / 2), Math.floor(j * step + step / 2));
    const c = MINI_COLORS[t];
    const k = (j * res + i) * 4;
    img.data[k] = parseInt(c.slice(1, 3), 16); img.data[k + 1] = parseInt(c.slice(3, 5), 16); img.data[k + 2] = parseInt(c.slice(5, 7), 16); img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return img;
}

export function drawOverlay(canvas: HTMLCanvasElement, base: ImageData, marks: { x: number; y: number; color: string; r?: number }[]) {
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(base, 0, 0);
  const s = canvas.width / 1000;
  for (const m of marks) {
    ctx.fillStyle = m.color;
    const r = m.r ?? 1.5;
    ctx.fillRect(m.x * s - r, m.y * s - r, r * 2, r * 2);
  }
}
