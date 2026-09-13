import { describe, it, expect } from 'vitest';
import { createTerrain, MAPS, euclid, cheb } from '../src/rules/terrain';
import { CENTER, HELL_RADIUS, VALLEY_MAX_LEN } from '../src/rules/constants';

describe('terrain generator', () => {
  it('center is treasure, no valleys within radius 30, hell only within chebyshev 25', () => {
    for (const m of MAPS) {
      const t = createTerrain(m);
      expect(t.at(CENTER, CENTER)).toBe('treasure');
      for (let x = CENTER - 40; x <= CENTER + 40; x++) for (let y = CENTER - 40; y <= CENTER + 40; y++) {
        const k = t.at(x, y);
        if (euclid(x, y) <= 30) expect(k).not.toBe('valley');
        if (k === 'hell') expect(cheb(x, y)).toBeLessThanOrEqual(HELL_RADIUS);
      }
    }
  });
  it('hell share inside radius 25 is close to 47% (map 1)', () => {
    const t = createTerrain(MAPS[0]);
    let hell = 0, total = 0;
    for (let x = CENTER - 25; x <= CENTER + 25; x++) for (let y = CENTER - 25; y <= CENTER + 25; y++) { total++; if (t.at(x, y) === 'hell') hell++; }
    expect(total).toBe(2601);
    expect(hell / total).toBeGreaterThan(0.38);
    expect(hell / total).toBeLessThan(0.56);
  });
  it('camp ring (430–500) is identical across all maps and has safe tiles', () => {
    const a = createTerrain(MAPS[0]), b = createTerrain(MAPS[4]);
    let safe = 0, n = 0;
    for (let x = 0; x < 1000; x += 7) for (let y = 0; y < 1000; y += 7) {
      const d = euclid(x, y);
      if (d >= 430 && d < 500 && !a.isValley(x, y) && !b.isValley(x, y)) { n++; expect(a.at(x, y)).toBe(b.at(x, y)); if (a.at(x, y) === "safe") safe++; }
    }
    expect(safe / n).toBeGreaterThan(0.3);
  });
  it('valleys never exceed 30 tiles and never appear near the center', () => {
    for (const m of MAPS) {
      const t = createTerrain(m);
      // Flood-fill valley components on a sample area and check the largest is ≤ 30
      const seen = new Set<string>();
      let maxLen = 0;
      for (let x = 100; x < 400; x++) for (let y = 100; y < 400; y++) {
        if (!t.isValley(x, y) || seen.has(`${x},${y}`)) continue;
        let size = 0; const stack = [[x, y]]; seen.add(`${x},${y}`);
        while (stack.length) {
          const [cx, cy] = stack.pop()!; size++;
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const nx = cx + dx, ny = cy + dy; const k = `${nx},${ny}`;
            if (!seen.has(k) && t.isValley(nx, ny)) { seen.add(k); stack.push([nx, ny]); }
          }
        }
        maxLen = Math.max(maxLen, size);
      }
      expect(maxLen).toBeLessThanOrEqual(VALLEY_MAX_LEN);
      expect(maxLen).toBeGreaterThan(0);
    }
  });
  it('danger density increases toward the center (map 1 bands)', () => {
    const t = createTerrain(MAPS[0]);
    const band = (r0: number, r1: number) => {
      let n = 0, d = 0;
      for (let x = 0; x < 1000; x += 3) for (let y = 0; y < 1000; y += 3) {
        const r = euclid(x, y); if (r < r0 || r >= r1) continue; n++;
        const k = t.at(x, y); if (k === 'danger' || k === 'hell') d++;
      }
      return d / n;
    };
    const b0 = band(0, 50), b2 = band(100, 150), b5 = band(250, 300), b7 = band(350, 400);
    expect(b0).toBeGreaterThan(0.6);
    expect(b0).toBeGreaterThan(b2);
    expect(b2).toBeGreaterThan(b5);
    expect(b5).toBeGreaterThan(b7);
    expect(b7).toBeLessThan(0.3);
  });
  it('terrain shares are in the documented ballpark (map 1)', () => {
    const t = createTerrain(MAPS[0]);
    const c: Record<string, number> = {}; let n = 0;
    for (let x = 0; x < 1000; x += 4) for (let y = 0; y < 1000; y += 4) { n++; const k = t.at(x, y); c[k] = (c[k] || 0) + 1; }
    const share = (k: string) => (c[k] || 0) / n;
    expect(share('safe')).toBeGreaterThan(0.22);
    expect(share('safe')).toBeLessThan(0.40);
    expect(share('danger') + share('hell')).toBeGreaterThan(0.12);
    expect(share('danger') + share('hell')).toBeLessThan(0.26);
    expect(share('valley')).toBeLessThan(0.03);
    expect(share('mountain')).toBeGreaterThan(0.10);
    expect(share('marsh')).toBeGreaterThan(0.06);
    expect(share('plain')).toBeGreaterThan(0.08);
  });
});
