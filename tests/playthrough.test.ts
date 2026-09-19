// بازی کامل از کمپ تا گنج: خرید، کوچ‌های پی‌درپی به مقبره‌ها، سطح ۱۰، فتح گنج، بستن فصل.
import { describe, it, expect } from 'vitest';
import { defaultSettings } from '../src/rules/settings';
import * as S from '../src/rules/state';
import { Rng } from '../src/rules/rng';
import { findPath } from '../src/rules/path';
import { tileKey, euclid } from '../src/rules/terrain';
import { totalUnits } from '../src/rules/combat';

const s = defaultSettings();

function walkTo(st: S.State, ctx: S.Ctx, goal: { x: number; y: number }, maxHops: number): boolean {
  // مثل یک بازیکن: هر بار یک نقطه‌ی میانی ~۱۰ خانه به سمت هدف، مسیر محلی کم‌هزینه، کوچ بلند ≤ ۸ خانه‌ی تازه
  for (let hop = 0; hop < maxHops; hop++) {
    const a = st.player;
    if (a.pos!.x === goal.x && a.pos!.y === goal.y) return true;
    const dx = goal.x - a.pos!.x, dy = goal.y - a.pos!.y, d = Math.hypot(dx, dy);
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      const step = Math.min(10, d);
      const ang = Math.atan2(dy, dx) + (attempt === 0 ? 0 : (attempt % 2 ? 1 : -1) * 0.6 * Math.ceil(attempt / 2));
      const wp = d <= 10 ? goal : { x: Math.round(a.pos!.x + Math.cos(ang) * step), y: Math.round(a.pos!.y + Math.sin(ang) * step) };
      const local = findPath(a.pos!, wp, (x, y) => { if (S.isOwn(st, x, y)) return 0.05; const t = S.terrainAt(st, ctx.gen, x, y); if (t === 'valley') return Infinity; return s.supply[t] + S.monstersAt(st, ctx, x, y) / 50; }, 40);
      if (!local) continue;
      let n = 0, target = local[local.length - 1];
      for (const p of local) { if (!S.isOwn(st, p.x, p.y)) n++; if (n >= 4) { target = p; break; } }
      if (st.player.coins < 5000) { S.deposit(st, 50_000_000, ctx.now); S.buyCoins(st, s, 50000, ctx.now); }
      if (totalUnits(a.units) < 700) { S.buyUnits(st, s, 'player', 'guard', 700, ctx.now); }
      if (a.energy < 95) S.rest(st, s, 'player', ctx.now);
      const r = S.startMove(st, ctx, 'player', target);
      if (!r.ok) continue;
      let guard = 0;
      while (st.migration && guard++ < 400) { ctx.now += 46_000; S.tick(st, ctx); }
      ok = true;
    }
    if (!ok) return false;
  }
  return false;
}

describe('full playthrough', () => {
  it('reaches level 10 with 3 artifacts, captures the treasure and closes the season', () => {
    let now = 1_700_000_000_000;
    const st = S.newState(s, 1, 777, now);
    const ctx: S.Ctx = { s, gen: S.makeGen(st, s), now, rng: new Rng(5) };
    S.registerName(st, 'قهرمان', now);
    S.deposit(st, 50_000_000, now); S.buyCoins(st, s, 20000, now);
    S.buyUnits(st, s, 'player', 'guard', 300, now); S.buyUnits(st, s, 'player', 'soldier', 100, now); S.buyUnits(st, s, 'player', 'explorer', 40, now);

    // به سمت مرکز پیش برو تا سطح ۷ (دروازه‌ی مقبره)
    const towardCenter = () => { const a = st.player.pos!; const d = euclid(a.x, a.y); const t = Math.max(0, d - 25) / d; return { x: Math.round(500 + (a.x - 500) * t), y: Math.round(500 + (a.y - 500) * t) }; };
    let safety = 0;
    while (S.levelOf(st, s, 'player') < 7 && safety++ < 80) { const g = towardCenter(); walkTo(st, ctx, g, 3); }
    expect(S.levelOf(st, s, 'player')).toBeGreaterThanOrEqual(7);

    // مقبره‌ها را یکی‌یکی بگیر (۳ آرتیفکت)
    safety = 0;
    while (st.player.artifacts.length < 3 && safety++ < 30) {
      const tombs = st.tombs.filter(t => !t.captured);
      const a = st.player.pos!;
      tombs.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
      const ok = walkTo(st, ctx, { x: tombs[0].x, y: tombs[0].y }, 60);
      if (!ok) walkTo(st, ctx, towardCenter(), 2);
    }
    expect(st.player.artifacts.length).toBeGreaterThanOrEqual(3);
    expect(st.tombs.filter(t => !t.captured).length).toBe(4); // همیشه ۴ مقبره‌ی نمایان

    // تا سطح ۱۰ و بعد گنج
    safety = 0;
    while (S.levelOf(st, s, 'player') < 10 && safety++ < 80) walkTo(st, ctx, towardCenter(), 3);
    expect(S.levelOf(st, s, 'player')).toBeGreaterThanOrEqual(10);
    safety = 0;
    while (!st.treasure && safety++ < 20) {
      if (totalUnits(st.player.units) < 600) { S.deposit(st, 20_000_000, ctx.now); S.buyCoins(st, s, 20000, ctx.now); S.buyUnits(st, s, 'player', 'guard', 600, ctx.now); }
      walkTo(st, ctx, { x: 500, y: 500 }, 80);
    }
    expect(st.treasure).not.toBeNull();
    expect(st.report).not.toBeNull();
    expect(st.report!.rows[0].title).toBe('گنج نهایی');
    expect(st.participation!.tile).toBeNull(); // همه‌ی خانه‌ها مال برنده است
    const tomanBefore = st.player.toman;
    // بستن فصل پس از ۲۴ ساعت
    ctx.now = st.seasonEndsAt! + 1000; S.tick(st, ctx);
    expect(st.seasonClosed).toBe(true);
    expect(st.player.toman).toBeGreaterThanOrEqual(tomanBefore); // فروش آرتیفکت‌ها (بدون شبا در کیف پول می‌ماند)
    expect(st.payout!.toIban).toBe(false);
    expect(S.planMove(st, ctx, 'player', { x: 500, y: 501 }).ok).toBe(false); // کوچ بسته است
  }, 300_000);
});
