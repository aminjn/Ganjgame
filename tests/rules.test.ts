import { describe, it, expect } from 'vitest';
import { cumulativeXp, levelForXp, xpNeedForLevel } from '../src/rules/level';
import { defaultSettings, validateSettings, validateField, FIELDS } from '../src/rules/settings';
import { armyPower, computeLosses, emptyUnits, moveSeconds, cheapestUnit, captureXp, lootChance, guideFactor } from '../src/rules/combat';
import { Rng } from '../src/rules/rng';
import { monsterPowerAt, createTerrain, MAPS } from '../src/rules/terrain';
import { placeInitialTombs } from '../src/rules/tombs';
import { generateCamp } from '../src/rules/camp';
import { artifactValue, treasureValue, participationValue } from '../src/rules/economy';
import { TERRAIN } from '../src/rules/constants';

const s = defaultSettings();

describe('level curve', () => {
  it('matches the measured cumulative values from Document One', () => {
    expect(xpNeedForLevel(2)).toBe(120);
    expect(cumulativeXp(5)).toBe(975);
    expect(cumulativeXp(7)).toBe(2495);
    expect(cumulativeXp(10)).toBe(8993);
    expect(cumulativeXp(12)).toBe(20536);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(119)).toBe(1);
    expect(levelForXp(120)).toBe(2);
    expect(levelForXp(8993)).toBe(10);
  });
});

describe('terrain rules', () => {
  it('supply and monsters per terrain are the documented constants', () => {
    expect(TERRAIN.safe.supply).toBe(1); expect(TERRAIN.plain.supply).toBe(2); expect(TERRAIN.mountain.supply).toBe(4);
    expect(TERRAIN.marsh.supply).toBe(6); expect(TERRAIN.danger.supply).toBe(8); expect(TERRAIN.tomb.supply).toBe(8);
    expect(TERRAIN.treasure.supply).toBe(10); expect(TERRAIN.hell.supply).toBe(20);
    expect(TERRAIN.mountain.monsters).toBe(120); expect(TERRAIN.marsh.monsters).toBe(280); expect(TERRAIN.danger.monsters).toBe(600);
    expect(TERRAIN.tomb.monsters).toBe(520); expect(TERRAIN.treasure.monsters).toBe(900);
  });
  it('monster power scales toward the center; hell 660..1466', () => {
    expect(monsterPowerAt('mountain', 0, 500, s.monsters)).toBe(120);
    expect(monsterPowerAt('danger', 500, 501, s.monsters)).toBe(Math.round(600 * (1 + 419 / 560)));
    expect(monsterPowerAt('hell', 525, 500, s.monsters)).toBe(660);
    expect(monsterPowerAt('hell', 501, 500, s.monsters)).toBe(Math.round(600 * (1.1 + 1.4 * 24 / 25)));
  });
});

describe('army and combat', () => {
  it('army power uses energy weight and terrain bonus', () => {
    const u = { ...emptyUnits(), archer: 2, guard: 1 };
    expect(armyPower(u, 100, 'plain', s)).toBe(19);
    expect(armyPower(u, 0, 'plain', s)).toBe(9.5);
    expect(armyPower(u, 100, 'mountain', s)).toBe(24);
    expect(armyPower(u, 100, 'danger', s)).toBe(23.5);
  });
  it('2000 guides halve the move time (cap)', () => {
    expect(moveSeconds({ ...emptyUnits(), guide: 0 }, s)).toBe(45);
    expect(moveSeconds({ ...emptyUnits(), guide: 1000 }, s)).toBeCloseTo(33.75);
    expect(guideFactor({ ...emptyUnits(), guide: 5000 }, s)).toBe(0.5);
  });
  it('losses: 50% of monsters at parity, floor 5%, at least 1, split by count', () => {
    const rng = { range: () => 1.0, next: () => 0.5, int: () => 0 } as unknown as Rng;
    const u = { ...emptyUnits(), soldier: 100, explorer: 100 };
    const r = computeLosses(u, 200, 200, s, rng);
    expect(r.total).toBe(100);
    expect(r.byType.soldier).toBe(50); expect(r.byType.explorer).toBe(50);
    const r2 = computeLosses(u, 120, 120 * 5, s, rng);
    expect(r2.ratio).toBeCloseTo(0.5 * Math.pow(0.2, 0.43), 5);
    const r3 = computeLosses(u, 10, 100000, s, rng);
    expect(r3.ratio).toBeCloseTo(0.05);
    expect(r3.total).toBe(1);
  });
  it('guardian is cheapest free unit with tie order explorer→guide→soldier→archer→guard', () => {
    expect(cheapestUnit({ ...emptyUnits(), guard: 1, soldier: 1 }, s)).toBe('soldier');
    expect(cheapestUnit({ ...emptyUnits(), guide: 1, soldier: 1 }, s)).toBe('guide');
    expect(cheapestUnit({ ...emptyUnits(), archer: 3 }, s)).toBe('archer');
    expect(cheapestUnit(emptyUnits(), s)).toBeNull();
  });
  it('capture xp and loot chance', () => {
    expect(captureXp('mountain', 120, s)).toBe(16);
    expect(captureXp('tomb', 520, s)).toBe(300);
    expect(captureXp('treasure', 900, s)).toBe(1500);
    expect(lootChance(0, s)).toBeCloseTo(0.1);
    expect(lootChance(90, s)).toBeCloseTo(0.2);
    expect(lootChance(100000, s)).toBe(0.5);
  });
});

describe('tombs and camp', () => {
  it('places 4 visible tombs 220–320 from the center, ≥40 apart, on non-valley tiles', () => {
    for (const m of MAPS) {
      const gen = createTerrain(m);
      const tombs = placeInitialTombs(gen, m.seed, 4, 220, 320, 40);
      expect(tombs.length).toBe(4);
      for (const t of tombs) {
        const d = Math.hypot(t.x - 500, t.y - 500);
        expect(d).toBeGreaterThanOrEqual(219.5); expect(d).toBeLessThanOrEqual(320.5);
        expect(gen.at(t.x, t.y)).not.toBe('valley');
        for (const o of tombs) if (o !== t) expect(Math.hypot(o.x - t.x, o.y - t.y)).toBeGreaterThanOrEqual(40);
      }
    }
  });
  it('camp is a safe tile at least 430 from the center', () => {
    const gen = createTerrain(MAPS[0]);
    for (let i = 0; i < 20; i++) {
      const c = generateCamp(gen, 1000 + i, 430, () => false);
      expect(gen.at(c.x, c.y)).toBe('safe');
      expect(Math.hypot(c.x - 500, c.y - 500)).toBeGreaterThanOrEqual(430);
    }
  });
});

describe('economy and admin validation', () => {
  it('prize values', () => {
    expect(artifactValue(100_000_000, s)).toBe(3_000_000);
    expect(treasureValue(100_000_000, s)).toBe(200_000_000);
    expect(treasureValue(1_000_000_000, s)).toBe(400_000_000);
    expect(participationValue(1_000_000_000, s)).toBe(100_000_000);
  });
  it('rejects destructive settings with reasons', () => {
    expect(validateSettings(s)).toEqual([]);
    const bad = { ...s, treasureShare: 0.7 };
    expect(validateSettings(bad).length).toBe(1);
    const f = FIELDS.find(f => f.path === 'unitPrice.soldier')!;
    expect(validateField(f, -1)).toContain('منفی');
    expect(validateField(FIELDS.find(f => f.path === 'xpGrowth')!, 1)).not.toBeNull();
    expect(validateField(FIELDS.find(f => f.path === 'lootBase')!, 1.5)).not.toBeNull();
    expect(validateField(FIELDS.find(f => f.path === 'moveSeconds')!, 0)).not.toBeNull();
  });
});
