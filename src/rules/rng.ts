// هش و نویز قطعی — همه‌ی تصادف‌های نقشه از این‌جا می‌آید تا همه‌ی بازیکنان یک نقشه ببینند.

export function hash2(x: number, y: number, seed: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1274126177;
  h = (h ^ (h >>> 13)) * 1103515245;
  h = (h ^ (h >>> 16)) * 2246822519;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296; // [0,1)
}

export function hash3(x: number, y: number, z: number, seed: number): number {
  return hash2(x, y + (z | 0) * 7919, seed ^ 0x5bd1e995);
}

function smooth(t: number): number { return t * t * (3 - 2 * t); }

// نویز ارزشی نرم در [0,1]
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smooth(x - xi), ty = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

// نویز چنداکتاوی در [-1,1]
export function fbm(x: number, y: number, seed: number, octaves = 3, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise(x * f, y * f, seed + i * 101) * 2 - 1) * amp;
    norm += amp; amp *= gain; f *= lacunarity;
  }
  return sum / norm;
}

// مولد اعداد تصادفی با بذر (برای رویدادهای زمان اجرا: تلفات، اشیای پیداشده)
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(n: number): number { return Math.floor(this.next() * n); }
}
