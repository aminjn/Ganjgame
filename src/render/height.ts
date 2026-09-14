// ارتفاع و رنگ پیوسته‌ی زمین (سبک Clash of Clans: تقریباً صاف، نرم، تمیز). تابعی از موقعیت رأس تا هیچ درزی نباشد.
import { Color } from 'three';
import { fbm, hash2, valueNoise } from '../rules/rng';
import type { Terrain } from '../rules/constants';
import { GROUND, DIRT, SNOW, MARSH_FLOOR, SAND, GRASS_DARK } from './palette';

export type TerrainFn = (x: number, y: number) => Terrain;

const OFFSET: Record<Terrain, number> = { safe: 0, plain: 0, mountain: 0.55, marsh: -0.45, danger: 0.06, hell: 0.18, tomb: 0.04, treasure: 0.2, valley: -1.4 };
const ROUGH: Record<Terrain, number> = { safe: 0.015, plain: 0.015, mountain: 0.45, marsh: 0.02, danger: 0.12, hell: 0.25, tomb: 0.02, treasure: 0.02, valley: 0.2 };
export const WATER_DROP = 0.2;

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
  // تپه‌های خیلی ملایم (زمین CoC تقریباً صاف است)
  const roll = (wx: number, wz: number): number => fbm(wx / 48, wz / 48, seed + 21, 2) * 0.12;
  const height = (wx: number, wz: number): number => {
    const off = bilinear(wx, wz, (x, y) => OFFSET[T(x, y)]);
    const rough = bilinear(wx, wz, (x, y) => ROUGH[T(x, y)]);
    const detail = fbm(wx / 2.4, wz / 2.4, seed + 23, 2) * rough;
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
    let mountainW = 0, marshW = 0;
    for (let i = 0; i < 4; i++) {
      const t = T(pts[i][0], pts[i][1]);
      tmp.copy(t === 'marsh' ? MARSH_FLOOR : GROUND[t]);
      if (t === 'mountain') mountainW += w[i];
      if (t === 'marsh') marshW += w[i];
      if (t === 'plain' || t === 'safe') {
        // الگوی نرم چمن: لکه‌های کمی تیره‌تر و گاهی خاکی، مثل کاشی‌های چمن CoC
        // چمن یکدست با اسپکل ریز و لکه‌های خیلی ملایم (مثل CoC)
        const d = valueNoise(pts[i][0] / 5, pts[i][1] / 5, seed + 31);
        tmp.lerp(GRASS_DARK, Math.max(0, (d - 0.5)) * 0.7);
        const dirt = valueNoise(pts[i][0] / 9, pts[i][1] / 9, seed + 32);
        if (dirt > 0.76) tmp.lerp(DIRT, Math.min(1, (dirt - 0.76) * 2.5));
      }
      out.r += tmp.r * w[i]; out.g += tmp.g * w[i]; out.b += tmp.b * w[i];
    }
    const h = height(wx, wz);
    // کناره‌ی شنی دور آب
    if (marshW > 0) {
      const wl = water(wx, wz);
      const band = h - wl;
      if (band > -0.04 && band < 0.22) out.lerp(SAND, Math.min(1, marshW * 1.6) * (1 - Math.abs(band - 0.08) / 0.16));
    }
    if (mountainW > 0.5) { const hh = h - roll(wx, wz); if (hh > 0.85) out.lerp(SNOW, Math.min(1, (hh - 0.85) * 2)); }
    // سایه‌ی محیطی خیلی ملایم و تیرگی زیر آب
    const avg = (height(wx + 1.5, wz) + height(wx - 1.5, wz) + height(wx, wz + 1.5) + height(wx, wz - 1.5)) / 4;
    const ao = Math.max(0, Math.min(0.18, (avg - h) * 0.3));
    const under = Math.max(0, Math.min(0.3, (water(wx, wz) - h) * 0.9));
    out.multiplyScalar((1 - ao - under) * (1 + (hash2(Math.floor(wx * 2), Math.floor(wz * 2), seed + 42) - 0.5) * 0.035));
    return out;
  };
  return { height, water, roll, color, T };
}
