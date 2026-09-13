// مولد زمین: تابع قطعی از مختصات خانه و پارامترهای نقشه. نقشه هیچ‌وقت ذخیره نمی‌شود.
import { CENTER, MAP_SIZE, HELL_RADIUS, VALLEY_MAX_LEN, VALLEY_MIN_LEN, VALLEY_FREE_RADIUS, VALLEY_BLOCK_CHANCE, type Terrain } from './constants';
import { hash2, hash3, fbm, valueNoise } from './rng';

export interface MapPreset {
  id: number;
  name: string;
  seed: number;
  warpAmp: number;      // تابیدن دامنه ۱۴۰–۳۳۰
  warpScale: number;    // مقیاس تابیدن ۹۵–۴۰۰
  roughness: number;    // ناهمواری ضخامت لایه‌ها ۰٫۲۲–۰٫۶
  coreRadius: number;   // شعاع هسته ۳۰۰–۳۸۰
  grain: number;        // دانه‌بندی مرزها (مقیاس لکه‌ی زمین در حلقه‌ها؛ کوچک = ریز)
  valleyBlock: number;  // اندازه‌ی بلوک دره ۱۶–۵۲
  dangerBlob: number;   // اندازه‌ی لکه‌ی خطر ۶–۱۳
  coreMarsh: number;    // سهم مرداب بین خانه‌های غیرخطر هسته (بقیه کوهستان)
  mid: { marsh: number; mountain: number; plain: number }; // نسبت حلقه‌ی میانی
  desc: string;
}

export const MAPS: MapPreset[] = [
  { id: 1, name: 'دشت کهن', seed: 1101, warpAmp: 220, warpScale: 220, roughness: 0.40, coreRadius: 340, grain: 18, valleyBlock: 30, dangerBlob: 9, coreMarsh: 0.55, mid: { marsh: 0.34, mountain: 0.36, plain: 0.30 }, desc: 'نقشه‌ی پایه؛ تعادل کوه و مرداب و دشت' },
  { id: 2, name: 'کوهساران', seed: 2202, warpAmp: 180, warpScale: 300, roughness: 0.30, coreRadius: 350, grain: 22, valleyBlock: 36, dangerBlob: 10, coreMarsh: 0.30, mid: { marsh: 0.16, mountain: 0.60, plain: 0.24 }, desc: 'کوهستانی (کوه ≈۳۴٪)' },
  { id: 3, name: 'دشت‌های باز', seed: 3303, warpAmp: 260, warpScale: 260, roughness: 0.45, coreRadius: 330, grain: 26, valleyBlock: 24, dangerBlob: 8, coreMarsh: 0.40, mid: { marsh: 0.18, mountain: 0.22, plain: 0.60 }, desc: 'دشتی؛ حلقه‌ی میانی باز' },
  { id: 4, name: 'مرداب‌زار', seed: 4404, warpAmp: 300, warpScale: 140, roughness: 0.60, coreRadius: 300, grain: 14, valleyBlock: 16, dangerBlob: 12, coreMarsh: 0.75, mid: { marsh: 0.55, mountain: 0.20, plain: 0.25 }, desc: 'مردابی (مرداب ≈۲۴٪)؛ هسته‌ی کوچک' },
  { id: 5, name: 'قلب آتش', seed: 5505, warpAmp: 140, warpScale: 400, roughness: 0.22, coreRadius: 380, grain: 20, valleyBlock: 40, dangerBlob: 13, coreMarsh: 0.50, mid: { marsh: 0.34, mountain: 0.36, plain: 0.30 }, desc: 'بزرگ‌ترین هسته‌ی خطر' },
  { id: 6, name: 'سرزمین شکسته', seed: 6606, warpAmp: 330, warpScale: 95, roughness: 0.55, coreRadius: 345, grain: 12, valleyBlock: 52, dangerBlob: 7, coreMarsh: 0.50, mid: { marsh: 0.33, mountain: 0.34, plain: 0.33 }, desc: 'مرزهای بسیار زبانه‌دار؛ دره‌های بلند' },
  { id: 7, name: 'دشت بی‌کران', seed: 7707, warpAmp: 200, warpScale: 350, roughness: 0.35, coreRadius: 335, grain: 40, valleyBlock: 28, dangerBlob: 11, coreMarsh: 0.45, mid: { marsh: 0.20, mountain: 0.25, plain: 0.55 }, desc: 'دشتی؛ دانه‌بندی خیلی درشت' },
  { id: 8, name: 'خال‌خالی', seed: 8808, warpAmp: 240, warpScale: 180, roughness: 0.50, coreRadius: 360, grain: 8, valleyBlock: 20, dangerBlob: 6, coreMarsh: 0.50, mid: { marsh: 0.34, mountain: 0.33, plain: 0.33 }, desc: 'دانه‌بندی خیلی ریز؛ لکه‌های ریز خطر' },
  { id: 9, name: 'کمرکش', seed: 9909, warpAmp: 160, warpScale: 240, roughness: 0.28, coreRadius: 355, grain: 24, valleyBlock: 44, dangerBlob: 10, coreMarsh: 0.30, mid: { marsh: 0.14, mountain: 0.62, plain: 0.24 }, desc: 'کوهستانی (کوه ≈۳۴٪)' },
  { id: 10, name: 'بادگیر', seed: 1010, warpAmp: 280, warpScale: 120, roughness: 0.48, coreRadius: 370, grain: 16, valleyBlock: 34, dangerBlob: 9, coreMarsh: 0.60, mid: { marsh: 0.38, mountain: 0.30, plain: 0.32 }, desc: 'مرزهای ناصاف، هسته‌ی بزرگ' },
];

export function mapById(id: number): MapPreset { return MAPS[Math.min(10, Math.max(1, id | 0)) - 1]; }

export interface TerrainGen {
  preset: MapPreset;
  valleyBlock: number;
  dangerBlob: number;
  at(x: number, y: number): Terrain;         // زمین پایه (بدون مقبره)
  isValley(x: number, y: number): boolean;
  dist(x: number, y: number): number;
}

export function euclid(x: number, y: number): number { return Math.hypot(x - CENTER, y - CENTER); }
export function cheb(x: number, y: number): number { return Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER)); }
export function inMap(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE; }

const CAMP_RING_SEED = 77; // حلقه‌ی ۴۳۰ تا ۵۰۰ در هر ده نقشه یکسان است
const DIRS8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function createTerrain(preset: MapPreset, valleyBlockOverride?: number | null, dangerBlobOverride?: number | null): TerrainGen {
  const s = preset.seed;
  const valleyBlock = valleyBlockOverride ?? preset.valleyBlock;
  const dangerBlob = dangerBlobOverride ?? preset.dangerBlob;
  const valleyCache = new Map<number, Set<number>>();

  // دره‌ی هر بلوک: یک رگه‌ی کشیده‌ی پیچ‌دار درون همان بلوک (حداکثر ۳۰ خانه، تا ۴ شکست ۴۵ درجه، انحراف کل ≤ ۹۰).
  function valleyOfBlock(bx: number, by: number): Set<number> {
    const key = bx * 4096 + by;
    let set = valleyCache.get(key);
    if (set) return set;
    set = new Set<number>();
    valleyCache.set(key, set);
    if (hash2(bx, by, s + 900) >= VALLEY_BLOCK_CHANCE) return set;
    const B = valleyBlock;
    const x0 = bx * B, y0 = by * B;
    let x = x0 + 1 + Math.floor(hash2(bx, by, s + 901) * Math.max(1, B - 2));
    let y = y0 + 1 + Math.floor(hash2(bx, by, s + 902) * Math.max(1, B - 2));
    const baseDir = Math.floor(hash2(bx, by, s + 903) * 8);
    let dir = baseDir;
    const len = VALLEY_MIN_LEN + Math.floor(hash2(bx, by, s + 904) * (VALLEY_MAX_LEN - VALLEY_MIN_LEN + 1));
    const bends = Math.floor(hash2(bx, by, s + 905) * 5); // 0..4
    const bendAt: number[] = [];
    for (let i = 0; i < bends; i++) bendAt.push(2 + Math.floor(hash3(bx, by, i, s + 906) * (len - 3)));
    let count = 0;
    for (let i = 0; i < len; i++) {
      if (x < x0 || y < y0 || x >= x0 + B || y >= y0 + B || !inMap(x, y)) break;
      if (euclid(x, y) > VALLEY_FREE_RADIUS) { set.add(x * MAP_SIZE + y); count++; }
      if (bendAt.includes(i)) {
        const turn = hash3(bx, by, i, s + 907) < 0.5 ? -1 : 1;
        const nd = dir + turn;
        const dev = ((nd - baseDir + 12) % 8); // انحراف از جهت اول (به واحد ۴۵ درجه)
        const devSigned = dev > 4 ? dev - 8 : dev;
        if (Math.abs(devSigned) <= 2) dir = (nd + 8) % 8;
      }
      x += DIRS8[dir][0]; y += DIRS8[dir][1];
    }
    if (count > VALLEY_MAX_LEN) throw new Error('valley too long');
    return set;
  }

  function isValley(x: number, y: number): boolean {
    if (euclid(x, y) <= VALLEY_FREE_RADIUS) return false;
    const bx = Math.floor(x / valleyBlock), by = Math.floor(y / valleyBlock);
    return valleyOfBlock(bx, by).has(x * MAP_SIZE + y);
  }

  // فاصله‌ی مؤثر: تابیده با نویز و ناهموار در ضخامت؛ در حلقه‌ی کمپ (≥۴۳۰) تابیدن محو می‌شود.
  function effDist(x: number, y: number, d: number): number {
    if (d >= 430) return d;
    const fade = d < 380 ? 1 : (430 - d) / 50;
    const wx = x + preset.warpAmp * fbm(x / preset.warpScale, y / preset.warpScale, s + 1, 3);
    const wy = y + preset.warpAmp * fbm(x / preset.warpScale, y / preset.warpScale, s + 2, 3);
    const dw = Math.hypot(wx - CENTER, wy - CENTER);
    const ang = Math.atan2(y - CENTER, x - CENTER);
    const rough = fbm(Math.cos(ang) * 1.7 + 5, Math.sin(ang) * 1.7 + 5, s + 3, 2);
    const de = (d + (dw - d) * 0.6 * fade) * (1 + preset.roughness * rough * fade);
    return Math.max(0, de);
  }

  function dangerDensity(de: number): number {
    const R = preset.coreRadius;
    if (de <= R) return 0.9 - (0.9 - 0.31) * (de / R);
    const t = (de - R) / 70;
    return t >= 1 ? 0 : 0.31 * (1 - t);
  }

  function pick3(x: number, y: number, seed: number, a: number, b: number): 0 | 1 | 2 {
    const g = preset.grain;
    const n = 0.65 * valueNoise(x / g, y / g, seed) + 0.35 * valueNoise(x / (g * 0.37), y / (g * 0.37), seed + 5);
    // نویز نرم را با آستانه‌ی نسبت‌ها به سه دسته می‌بریم
    const v = (n - 0.2) / 0.6;
    if (v < a) return 0;
    if (v < a + b) return 1;
    return 2;
  }

  function at(x: number, y: number): Terrain {
    if (!inMap(x, y)) return 'valley';
    if (x === CENTER && y === CENTER) return 'treasure';
    if (isValley(x, y)) return 'valley';
    const d = euclid(x, y);
    if (d >= 500) return hash2(x, y, CAMP_RING_SEED + 1) < 0.08 && valueNoise(x / 9, y / 9, CAMP_RING_SEED + 2) > 0.62 ? 'mountain' : 'safe';
    if (d >= 430) {
      // حلقه‌ی کمپ‌ها کوه/دشت/امن — یکسان در هر ده نقشه
      const g = 14;
      const n = 0.65 * valueNoise(x / g, y / g, CAMP_RING_SEED + 3) + 0.35 * valueNoise(x / 5, y / 5, CAMP_RING_SEED + 4);
      if (n > 0.60) return 'mountain';
      if (n > 0.47) return 'plain';
      return 'safe';
    }
    const de = effDist(x, y, d);
    const dens = dangerDensity(de);
    if (dens > 0) {
      const b = dangerBlob;
      const bn = 0.7 * valueNoise(x / b, y / b, s + 4) + 0.3 * valueNoise(x / (b * 0.45), y / (b * 0.45), s + 6);
      const v = (bn - 0.25) / 0.5;
      if (v < dens) {
        if (cheb(x, y) <= HELL_RADIUS && hash2(x, y, s + 8) < 0.74) return 'hell';
        return 'danger';
      }
    }
    if (de <= preset.coreRadius) {
      return pick3(x, y, s + 7, preset.coreMarsh, 1) === 0 ? 'marsh' : 'mountain';
    }
    const m = preset.mid;
    const p = pick3(x, y, s + 9, m.marsh, m.mountain);
    return p === 0 ? 'marsh' : p === 1 ? 'mountain' : 'plain';
  }

  return { preset, valleyBlock, dangerBlob, at, isValley, dist: euclid };
}

// قدرت موجودات یک خانه با تشدید نزدیک مرکز
export function monsterPowerAt(
  terrain: Terrain, x: number, y: number,
  base: Record<Terrain, number>, scaleStart = 420, scaleDiv = 560, hellMin = 1.1, hellMax = 2.5,
): number {
  if (terrain === 'hell') {
    const dc = cheb(x, y);
    const t = Math.max(0, Math.min(1, 1 - dc / HELL_RADIUS));
    return Math.round(base.danger * (hellMin + (hellMax - hellMin) * t));
  }
  const b = base[terrain];
  if (!b) return 0;
  const d = euclid(x, y);
  return Math.round(b * (1 + Math.max(0, scaleStart - d) / scaleDiv));
}

export function tileKey(x: number, y: number): string { return `${x},${y}`; }
export function parseKey(k: string): { x: number; y: number } { const [a, b] = k.split(','); return { x: +a, y: +b }; }
export function neighbors8(x: number, y: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [dx, dy] of DIRS8) { const nx = x + dx, ny = y + dy; if (inMap(nx, ny)) out.push({ x: nx, y: ny }); }
  return out;
}
export function isAdjacent(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
}
