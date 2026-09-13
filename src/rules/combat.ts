// نیروها، قدرت لشگر، تلفات، تجربه و اشیای پیداشده — همه از سند اول.
import { UNITS, UNIT_ORDER, LOOT_ITEMS, LOSS_RAND_MIN, LOSS_RAND_MAX, ENERGY_MAX, ENERGY_WEIGHT_MIN, type UnitType, type Terrain } from './constants';
import type { Settings } from './settings';
import { Rng } from './rng';

export type UnitCounts = Record<UnitType, number>;
export const ALL_UNITS = Object.keys(UNITS) as UnitType[];
export function emptyUnits(): UnitCounts { return { explorer: 0, soldier: 0, guide: 0, archer: 0, guard: 0 }; }
export function totalUnits(u: UnitCounts): number { return ALL_UNITS.reduce((s, k) => s + (u[k] || 0), 0); }

// وزن انرژی از ۰٫۵ (انرژی صفر) تا ۱ (انرژی کامل)
export function energyWeight(energy: number): number {
  const e = Math.max(0, Math.min(ENERGY_MAX, energy)) / ENERGY_MAX;
  return ENERGY_WEIGHT_MIN + (1 - ENERGY_WEIGHT_MIN) * e;
}

export function unitPowerOn(unit: UnitType, terrain: Terrain | null, s: Settings): number {
  const base = s.unitPower[unit];
  const bonus = terrain && UNITS[unit].bonusTerrains.includes(terrain) ? s.terrainBonus : 1;
  return base * bonus;
}

// قدرت لشگر = مجموع (تعداد × قدرت × وزن انرژی × برتری زمین) روی نیروهای آزاد
export function armyPower(units: UnitCounts, energy: number, terrain: Terrain | null, s: Settings): number {
  const w = energyWeight(energy);
  let p = 0;
  for (const k of ALL_UNITS) p += (units[k] || 0) * unitPowerOn(k, terrain, s) * w;
  return p;
}

export function armyLuck(units: UnitCounts, s: Settings): number { return (units.explorer || 0) * s.explorerLuck; }

// ۲٬۰۰۰ راهبلد زمان کوچ را نصف می‌کند و این سقف اثر است (خطی)
export function guideFactor(units: UnitCounts, s: Settings): number {
  return 1 - 0.5 * Math.min(1, (units.guide || 0) / s.guidesForHalf);
}

export function moveSeconds(units: UnitCounts, s: Settings): number {
  return (s.moveSeconds / s.speedFactor) * guideFactor(units, s);
}

// ارزان‌ترین نیروی آزاد؛ در تساوی: کاوشگر → راهبلد → سرباز → کمانگیر → نگهبان
export function cheapestUnit(units: UnitCounts, s: Settings): UnitType | null {
  let best: UnitType | null = null;
  for (const k of UNIT_ORDER) {
    if ((units[k] || 0) <= 0) continue;
    if (best === null || s.unitPrice[k] < s.unitPrice[best]) best = k;
  }
  return best;
}

export interface LossResult { ratio: number; total: number; byType: UnitCounts }

// نسبت تلفات = بیشترِ(۵٪، ۵۰٪ × (قدرت موجودات ÷ قدرت لشگر)^۰٫۴۳) × تصادفی ۱٫۰..۱٫۲ × تعداد موجودات، دست‌کم یک نیرو،
// به نسبت تعداد بین انواع نیرو. تلفات باخت و پیروزی یکسان است.
export function computeLosses(units: UnitCounts, monsterPower: number, army: number, s: Settings, rng: Rng): LossResult {
  const byType = emptyUnits();
  const free = totalUnits(units);
  if (monsterPower <= 0 || free <= 0) return { ratio: 0, total: 0, byType };
  const base = army > 0 ? s.lossBase * Math.pow(monsterPower / army, s.lossExponent) : 1;
  const ratio = Math.max(s.lossFloor, base) * rng.range(LOSS_RAND_MIN, LOSS_RAND_MAX);
  let total = Math.max(1, Math.round(ratio * monsterPower));
  total = Math.min(total, free);
  // پخش به نسبت تعداد (بزرگ‌ترین باقیمانده)
  const shares = ALL_UNITS.map(k => ({ k, exact: (units[k] || 0) * total / free }));
  let assigned = 0;
  for (const sh of shares) { const f = Math.floor(sh.exact); byType[sh.k] = Math.min(units[sh.k] || 0, f); assigned += byType[sh.k]; }
  const rem = shares.map(sh => ({ k: sh.k, r: sh.exact - Math.floor(sh.exact) })).sort((a, b) => b.r - a.r);
  for (const r of rem) { if (assigned >= total) break; if (byType[r.k] < (units[r.k] || 0)) { byType[r.k]++; assigned++; } }
  return { ratio, total: assigned, byType };
}

export function captureXp(terrain: Terrain, monsterPower: number, s: Settings): number {
  if (terrain === 'tomb') return s.xpTomb;
  if (terrain === 'treasure') return s.xpTreasure;
  return Math.round(s.xpBase + monsterPower / s.xpMonsterDiv);
}

// شانس = ۱۰٪ + شانس لشگر ÷ ۹۰۰ با سقف ۵۰٪ — فقط در خانه‌ی موجوددار. هرچه موجودات قوی‌تر، قلم گران‌تر.
export function lootChance(luck: number, s: Settings): number { return Math.min(s.lootMax, s.lootBase + luck / s.lootLuckDiv); }
export function rollLoot(luck: number, monsterPower: number, s: Settings, rng: Rng): { name: string; value: number } | null {
  if (monsterPower <= 0) return null;
  if (rng.next() >= lootChance(luck, s)) return null;
  const t = Math.max(0, Math.min(1, monsterPower / 1500));
  const idx = Math.min(LOOT_ITEMS.length - 1, Math.max(0, Math.floor(t * (LOOT_ITEMS.length - 1) + rng.range(-1.5, 1.5) + 0.5)));
  return { ...LOOT_ITEMS[idx] };
}
