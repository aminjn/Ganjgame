// نمای کل سرزمین: از دل خودِ مولد زمین کشیده می‌شود (نه تصویر آماده).
import type { Terrain } from '../rules/constants';

export const MINI_COLORS: Record<Terrain, string> = {
  safe: '#a9d452', plain: '#8ec946', mountain: '#a39c8c', marsh: '#5c7a3a', danger: '#b0553f', hell: '#7a3328', tomb: '#b06cff', treasure: '#ffd54a', valley: '#4a423f',
};

export function drawTerrainPreview(canvas: HTMLCanvasElement, at: (x: number, y: number) => Terrain, res = 200): ImageData {
  canvas.width = res; canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, res);
  const step = 1000 / res;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const cx = Math.floor(i * step + step / 2), cy = Math.floor(j * step + step / 2);
    const votes: Partial<Record<Terrain, number>> = {};
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = at(Math.min(999, Math.max(0, cx + dx * 2)), Math.min(999, Math.max(0, cy + dy * 2))); votes[t] = (votes[t] ?? 0) + (t === 'valley' || t === 'hell' ? 2 : 1); }
    const t = (Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]) as Terrain;
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
