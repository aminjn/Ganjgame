// ارتفاع و رنگ پیوسته‌ی زمین: تابعی از موقعیت رأس (نه کاشی) تا هیچ درزی بین چانک‌ها و هیچ شبکه‌ای دیده نشود.
import { Color } from 'three';
import { fbm, hash2, valueNoise } from '../rules/rng';
import type { Terrain } from '../rules/constants';
import { GROUND, DIRT } from './palette';

export type TerrainFn = (x: number, y: number) => Terrain;

const OFFSET: Record<Terrain, number> = { safe: 0, plain: 0, mountain: 0.62, marsh: -0.22, danger: 0.12, hell: 0.35, tomb: 0.05, treasure: 0.3, valley: -1.7 };
const ROUGH: Record<Terrain, number> = { safe: 0.1, plain: 0.12, mountain: 0.55, marsh: 0.05, danger: 0.3, hell: 0.45, tomb: 0.05, treasure: 0.02, valley: 0.25 };

function smooth(t: number) { return t * t * (3 - 2 * t); }

// نمونه‌برداری دوخطی از مقدار هر کاشی روی موقعیت پیوسته
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
  const height = (wx: number, wz: number): number => {
    const roll = fbm(wx / 11, wz / 11, seed + 21, 2) * 0.28 + fbm(wx / 34, wz / 34, seed + 22, 2) * 0.45;
    const off = bilinear(wx, wz, (x, y) => OFFSET[T(x, y)]);
    const rough = bilinear(wx, wz, (x, y) => ROUGH[T(x, y)]);
    const detail = fbm(wx / 2.3, wz / 2.3, seed + 23, 2) * rough;
    return roll + off + detail;
  };
  const tmp = new Color();
  const color = (wx: number, wz: number, out: Color): Color => {
    out.setRGB(0, 0, 0);
    const fx = wx - 0.5, fz = wz - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = smooth(fx - x0), tz = smooth(fz - z0);
    const w = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
    const pts = [[x0, z0], [x0 + 1, z0], [x0, z0 + 1], [x0 + 1, z0 + 1]];
    for (let i = 0; i < 4; i++) {
      const t = T(pts[i][0], pts[i][1]);
      tmp.copy(GROUND[t]);
      if (t === 'plain' || t === 'safe') {
        // لکه‌های خاکی گرم میان چمن
        const d = valueNoise(pts[i][0] / 5.5, pts[i][1] / 5.5, seed + 31);
        if (d > 0.6) tmp.lerp(DIRT, Math.min(1, (d - 0.6) * 2.2));
      }
      out.r += tmp.r * w[i]; out.g += tmp.g * w[i]; out.b += tmp.b * w[i];
    }
    // تغییر خیلی ملایم روشنایی تا زمین یکدست و مصنوعی نباشد (کم‌کنتراست)
    const v = 1 + (fbm(wx / 3.1, wz / 3.1, seed + 41, 2)) * 0.05 + (hash2(Math.floor(wx * 2), Math.floor(wz * 2), seed + 42) - 0.5) * 0.03;
    out.multiplyScalar(v);
    return out;
  };
  return { height, color, T };
}
