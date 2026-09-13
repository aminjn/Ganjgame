// مقبره‌ها: ۴ نمایان از ۱۰ نام؛ ۲۲۰ تا ۳۲۰ از مرکز، دست‌کم ۴۰ خانه از هم، غیردره، تصاحب‌نشده.
import { CENTER, TOMB_NAMES, type Terrain } from './constants';
import { hash2 } from './rng';
import type { TerrainGen } from './terrain';
import { euclid, inMap } from './terrain';

export interface Tomb { id: number; name: string; x: number; y: number; captured: boolean; capturedBy?: string; capturedAt?: number }

function farEnough(x: number, y: number, tombs: { x: number; y: number }[], spacing: number): boolean {
  return tombs.every(t => Math.hypot(t.x - x, t.y - y) >= spacing);
}

function candidate(i: number, seed: number, minD: number, maxD: number): { x: number; y: number } {
  const ang = hash2(i, 1, seed) * Math.PI * 2;
  const r = minD + hash2(i, 2, seed) * (maxD - minD);
  return { x: Math.round(CENTER + Math.cos(ang) * r), y: Math.round(CENTER + Math.sin(ang) * r) };
}

function usable(gen: TerrainGen, x: number, y: number, owned: (x: number, y: number) => boolean): boolean {
  if (!inMap(x, y)) return false;
  const d = euclid(x, y);
  const k: Terrain = gen.at(x, y);
  return k !== 'valley' && k !== 'treasure' && !owned(x, y);
}

export function placeInitialTombs(gen: TerrainGen, seed: number, visible: number, minD: number, maxD: number, spacing: number): Tomb[] {
  const out: Tomb[] = [];
  let i = 0;
  while (out.length < visible && i < 20000) {
    const c = candidate(i++, seed + 500, minD, maxD);
    if (!usable(gen, c.x, c.y, () => false)) continue;
    if (!farEnough(c.x, c.y, out, spacing)) continue;
    out.push({ id: out.length, name: TOMB_NAMES[out.length], x: c.x, y: c.y, captured: false });
  }
  return out;
}

// مقبره‌ی تازه: دورترین جای ممکن از قلمروی تصاحب‌کننده، با همان شرط‌ها.
export function placeNextTomb(
  gen: TerrainGen, seed: number, tombs: Tomb[], territory: { x: number; y: number }[],
  owned: (x: number, y: number) => boolean, minD: number, maxD: number, spacing: number,
): Tomb | null {
  const id = tombs.length;
  if (id >= TOMB_NAMES.length) return null;
  const active = tombs.filter(t => !t.captured);
  let best: { x: number; y: number } | null = null, bestScore = -1;
  for (let i = 0; i < 600; i++) {
    const c = candidate(i, seed + 700 + id * 13, minD, maxD);
    if (!usable(gen, c.x, c.y, owned)) continue;
    if (!farEnough(c.x, c.y, active, spacing)) continue;
    let score = Infinity;
    for (const t of territory) score = Math.min(score, Math.hypot(t.x - c.x, t.y - c.y));
    if (territory.length === 0) score = i === 0 ? 1 : 0;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (!best) return null;
  return { id, name: TOMB_NAMES[id], x: best.x, y: best.y, captured: false };
}
