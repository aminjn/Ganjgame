// کمپ اولیه: خانه‌ی امن، دست‌کم ۴۳۰ قدم از مرکز. ۲٬۰۰۰ تلاش تصادفی، سپس گشتن حلقه‌های بیرونی تا اولین خانه‌ی امن.
import { CENTER, MAP_SIZE, CAMP_RANDOM_TRIES } from './constants';
import { hash2 } from './rng';
import type { TerrainGen } from './terrain';
import { euclid } from './terrain';

export function isValidCamp(gen: TerrainGen, x: number, y: number, minDist: number, owned: (x: number, y: number) => boolean): boolean {
  return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE && euclid(x, y) >= minDist && gen.at(x, y) === 'safe' && !owned(x, y);
}

export function generateCamp(gen: TerrainGen, seed: number, minDist: number, owned: (x: number, y: number) => boolean): { x: number; y: number } {
  for (let i = 0; i < CAMP_RANDOM_TRIES; i++) {
    const ang = hash2(i, 11, seed) * Math.PI * 2;
    const r = minDist + hash2(i, 12, seed) * (Math.min(500, 495) - minDist);
    const x = Math.round(CENTER + Math.cos(ang) * r), y = Math.round(CENTER + Math.sin(ang) * r);
    if (isValidCamp(gen, x, y, minDist, owned)) return { x, y };
  }
  for (let r = Math.ceil(minDist); r < 720; r++) {
    for (let a = 0; a < 720; a++) {
      const ang = (a / 720) * Math.PI * 2;
      const x = Math.round(CENTER + Math.cos(ang) * r), y = Math.round(CENTER + Math.sin(ang) * r);
      if (isValidCamp(gen, x, y, minDist, owned)) return { x, y };
    }
  }
  throw new Error('no safe camp tile found');
}
