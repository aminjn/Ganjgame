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

export function makeHeight(terrain: TerrainFn, seed: number, flat = false) {
  const cache = new Map<number, Terrain>();
  const T = (x: number, y: number): Terrain => {
    const k = x * 4096 + y + 8_000_000;
    let v = cache.get(k); if (v === undefined) { v = terrain(x, y); cache.set(k, v); if (cache.size > 200000) cache.clear(); }
    return v;
  };
  // تپه‌های خیلی ملایم (زمین CoC تقریباً صاف است)
  const roll = (wx: number, wz: number): number => fbm(wx / 48, wz / 48, seed + 21, 2) * 0.12;
  const height = (wx: number, wz: number): number => {
    if (flat) {
      const o = bilinear(wx, wz, (x, y) => { const t = T(x, y); return t === 'marsh' ? -0.12 : t === 'valley' ? -0.05 : 0; });
      // مرداب: کف لجنی تقریباً هم‌سطح با گودی‌های کوچک پراکنده (برکه‌های ریز)، نه دریاچه
      const marshW = bilinear(wx, wz, (x, y) => (T(x, y) === 'marsh' ? 1 : 0));
      const pool = Math.max(0, valueNoise(wx / 2.2, wz / 2.2, seed + 61) - 0.58) * 1.6;
      return o + marshW * (0.06 - pool * 0.5);
    }
    const off = bilinear(wx, wz, (x, y) => OFFSET[T(x, y)]);
    const rough = bilinear(wx, wz, (x, y) => ROUGH[T(x, y)]);
    const detail = fbm(wx / 2.4, wz / 2.4, seed + 23, 2) * rough;
    return roll(wx, wz) + off + detail;
  };
  const water = (wx: number, wz: number): number => (flat ? -0.13 : roll(wx, wz) - WATER_DROP);
  const tmp = new Color();
  const color = (wx: number, wz: number, out: Color): Color => {
    out.setRGB(0, 0, 0);
    const tileX = Math.floor(wx), tileZ = Math.floor(wz);
    const fx = wx - 0.5, fz = wz - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = smooth(fx - x0), tz = smooth(fz - z0);
    // در حالت کاشی (flat) رنگ هر خانه یکدست است؛ در حالت سه‌بعدی آمیخته‌ی دوخطی
    const w = flat ? [1, 0, 0, 0] : [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
    const pts = flat ? [[tileX, tileZ], [tileX, tileZ], [tileX, tileZ], [tileX, tileZ]] : [[x0, z0], [x0 + 1, z0], [x0, z0 + 1], [x0 + 1, z0 + 1]];
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
        tmp.lerp(GRASS_DARK, Math.max(0, (d - 0.45)) * 1.3);
        const dirt = valueNoise(pts[i][0] / 9, pts[i][1] / 9, seed + 32);
        if (dirt > 0.72) tmp.lerp(DIRT, Math.min(1, (dirt - 0.72) * 2.5));
      }
      out.r += tmp.r * w[i]; out.g += tmp.g * w[i]; out.b += tmp.b * w[i];
    }
    const h = height(wx, wz);
    // مرداب: لکه‌های لجن تیره و گل قهوه‌ای، بدون ساحل شنی
    if (marshW > 0) {
      const mud = valueNoise(wx / 2.6, wz / 2.6, seed + 63);
      if (mud > 0.58) out.lerp(new Color('#5a4a2c'), Math.min(1, (mud - 0.58) * 2.5) * marshW);
      const slime = valueNoise(wx / 1.4, wz / 1.4, seed + 64);
      if (slime > 0.66) out.lerp(new Color('#7aa83c'), Math.min(1, (slime - 0.66) * 3) * marshW);
    }
    if (mountainW > 0.5) { const hh = h - roll(wx, wz); if (hh > 0.85) out.lerp(SNOW, Math.min(1, (hh - 0.85) * 2)); }
    // سایه‌ی محیطی خیلی ملایم و تیرگی زیر آب
    const avg = (height(wx + 1.5, wz) + height(wx - 1.5, wz) + height(wx, wz + 1.5) + height(wx, wz - 1.5)) / 4;
    const ao = Math.max(0, Math.min(0.18, (avg - h) * 0.3));
    const under = Math.max(0, Math.min(0.3, (water(wx, wz) - h) * 0.9));
    // اسپکل ریز و لکه‌های نرم
    const speck = (hash2(Math.floor(wx * 2), Math.floor(wz * 2), seed + 42) - 0.5) * 0.09 + fbm(wx / 1.7, wz / 1.7, seed + 43, 2) * 0.06;
    // شبکه‌ی کاشی محو (سبک Travian): لبه‌ی هر خانه کمی تیره‌تر و هر خانه‌ی دوم کمی روشن‌تر
    const gx = wx - Math.floor(wx), gz = wz - Math.floor(wz);
    const edge = Math.min(gx, 1 - gx, gz, 1 - gz);
    const line = edge < 0.06 ? (1 - edge / 0.06) * 0.10 : 0;
    const checker = ((Math.floor(wx) + Math.floor(wz)) & 1) ? 0.025 : -0.025;
    out.multiplyScalar((1 - ao - under) * (1 + speck + checker - line));
    return out;
  };
  return { height, water, roll, color, T };
}
