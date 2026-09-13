// ارتفاع و رنگ پیوسته‌ی زمین: تابعی از موقعیت رأس (نه کاشی) تا هیچ درزی بین چانک‌ها و هیچ شبکه‌ای دیده نشود.
// دیورامای low-poly: تپه‌های غلتان، کوه‌های برجسته با قله‌ی روشن، مرداب فرورفته با آب، دره‌ی عمیق.
import { Color } from 'three';
import { fbm, hash2, valueNoise } from '../rules/rng';
import type { Terrain } from '../rules/constants';
import { GROUND, DIRT, SNOW, MARSH_FLOOR } from './palette';

export type TerrainFn = (x: number, y: number) => Terrain;

const OFFSET: Record<Terrain, number> = { safe: 0, plain: 0.04, mountain: 1.55, marsh: -0.52, danger: 0.28, hell: 0.5, tomb: 0.12, treasure: 0.55, valley: -2.3 };
const ROUGH: Record<Terrain, number> = { safe: 0.14, plain: 0.16, mountain: 0.95, marsh: 0.05, danger: 0.42, hell: 0.62, tomb: 0.05, treasure: 0.05, valley: 0.35 };
export const WATER_DROP = 0.3; // آب مرداب زیر سطح تپه‌های اطراف

function smooth(t: number) { return t * t * (3 - 2 * t); }

function bilinear(wx: number, wz: number, f: (tx: number, ty: number) => number): number {
  const fx = wx - 0.5, fz = wz - 0.5;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = smooth(fx - x0), tz = smooth(fz - z0);
  const a = f(x0, z0), b = f(x0 + 1, z0), c = f(x0, z0 + 1), d = f(x0 + 1, z0 + 1);
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

export function makeHeight(terrain: TerrainFn, seed: number) {
  const cache = new Map<number, Terrain>();
  const T = (x: number, y: number): Terrain => {
    const k = x * 4096 + y + 8_000_000;
    let v = cache.get(k); if (v === undefined) { v = terrain(x, y); cache.set(k, v); if (cache.size > 200000) cache.clear(); }
    return v;
  };
  // تپه‌های غلتان پایه (بدون اثر زمین) — آب هم از همین پیروی می‌کند
  const roll = (wx: number, wz: number): number =>
    fbm(wx / 42, wz / 42, seed + 21, 3) * 1.25 + fbm(wx / 13, wz / 13, seed + 22, 2) * 0.32;
  const height = (wx: number, wz: number): number => {
    const off = bilinear(wx, wz, (x, y) => OFFSET[T(x, y)]);
    const rough = bilinear(wx, wz, (x, y) => ROUGH[T(x, y)]);
    const detail = fbm(wx / 2.7, wz / 2.7, seed + 23, 2) * rough + (hash2(Math.round(wx * 2), Math.round(wz * 2), seed + 24) - 0.5) * 0.09;
    // مرداب: کف صاف‌تر
    return roll(wx, wz) + off + detail;
  };
  const water = (wx: number, wz: number): number => roll(wx, wz) - WATER_DROP;
  const tmp = new Color();
  const color = (wx: number, wz: number, out: Color): Color => {
    out.setRGB(0, 0, 0);
    const fx = wx - 0.5, fz = wz - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = smooth(fx - x0), tz = smooth(fz - z0);
    const w = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
    const pts = [[x0, z0], [x0 + 1, z0], [x0, z0 + 1], [x0 + 1, z0 + 1]];
    let mountainW = 0;
    for (let i = 0; i < 4; i++) {
      const t = T(pts[i][0], pts[i][1]);
      tmp.copy(t === 'marsh' ? MARSH_FLOOR : GROUND[t]);
      if (t === 'mountain') mountainW += w[i];
      if (t === 'plain' || t === 'safe') {
        const d = valueNoise(pts[i][0] / 6, pts[i][1] / 6, seed + 31);
        if (d > 0.62) tmp.lerp(DIRT, Math.min(1, (d - 0.62) * 2.4));
      }
      out.r += tmp.r * w[i]; out.g += tmp.g * w[i]; out.b += tmp.b * w[i];
    }
    // قله‌های روشن روی کوه‌های بلند
    if (mountainW > 0.5) {
      const h = height(wx, wz) - roll(wx, wz);
      if (h > 1.55) out.lerp(SNOW, Math.min(1, (h - 1.55) * 1.6));
    }
    // سایه‌ی محیطی ارزان: نقاط پایین‌تر از میانگین همسایه‌ها کمی تیره‌تر (فرورفتگی) و زیر آب تیره‌تر
    const h = height(wx, wz);
    const avg = (height(wx + 1.5, wz) + height(wx - 1.5, wz) + height(wx, wz + 1.5) + height(wx, wz - 1.5)) / 4;
    const ao = Math.max(0, Math.min(0.28, (avg - h) * 0.35));
    const under = Math.max(0, Math.min(0.35, (water(wx, wz) - h) * 0.9));
    const v = (1 - ao - under) * (1 + (hash2(Math.floor(wx), Math.floor(wz), seed + 42) - 0.5) * 0.05);
    out.multiplyScalar(v);
    return out;
  };
  return { height, water, roll, color, T };
}
