import { describe, it, expect } from 'vitest';
import { defaultSettings } from '../src/rules/settings';
import { newState, makeGen, registerName, deposit, buyCoins, buyUnits, planMove, startMove, tick, isOwn, createClan, clanDeposit, donateUnits, setClanCamp, switchControl, serialize, deserialize, sanitize, closeSeason, withdraw, setIban, type Ctx } from '../src/rules/state';
import { neighbors8, tileKey } from '../src/rules/terrain';
import { Rng } from '../src/rules/rng';
import { totalUnits } from '../src/rules/combat';

const s = defaultSettings();

function setup() {
  const now = 1_000_000;
  const st = newState(s, 1, 4242, now);
  const gen = makeGen(st, s);
  const ctx: Ctx = { s, gen, now, rng: new Rng(1) };
  registerName(st, 'آزمایش', now);
  deposit(st, 10_000_000, now);
  return { st, gen, ctx };
}

describe('state', () => {
  it('starts with zero coins, zero units, zero pool; camp owned without guardian', () => {
    const { st } = setup();
    expect(st.player.coins).toBe(0); expect(totalUnits(st.player.units)).toBe(0); expect(st.pool).toBe(0);
    const camp = st.owned[tileKey(st.player.camp!.x, st.player.camp!.y)];
    expect(camp.guardian).toBeNull();
    expect(st.tombs.length).toBe(4);
  });
  it('buying coins grows the pool by 1000 toman per coin and is capped at 1M per purchase', () => {
    const { st, ctx } = setup();
    expect(buyCoins(st, s, 2_000_000, ctx.now).ok).toBe(false);
    expect(buyCoins(st, s, 500, ctx.now).ok).toBe(true);
    expect(st.player.coins).toBe(500); expect(st.player.toman).toBe(9_500_000); expect(st.pool).toBe(500_000);
  });
  it('needs 2 free units and supplies to migrate; capture places cheapest guardian and grants xp', () => {
    const { st, ctx } = setup();
    buyCoins(st, s, 500, ctx.now);
    const camp = st.player.camp!;
    const target = neighbors8(camp.x, camp.y).find(n => ctx.gen.at(n.x, n.y) !== 'valley')!;
    let r = planMove(st, ctx, 'player', target);
    expect(r.ok).toBe(false);
    buyUnits(st, s, 'player', 'soldier', 5, ctx.now);
    buyUnits(st, s, 'player', 'explorer', 1, ctx.now);
    r = planMove(st, ctx, 'player', target);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.plan.kind).toBe('single'); expect(r.plan.cost).toBe(s.supply[ctx.gen.at(target.x, target.y)]); }
    const coinsBefore = st.player.coins;
    expect(startMove(st, ctx, 'player', target).ok).toBe(true);
    expect(st.player.coins).toBe(coinsBefore - (r.ok ? r.plan.cost : 0));
    expect(planMove(st, ctx, 'player', target).ok).toBe(false); // کاروان در راه است
    const ev = tick(st, { ...ctx, now: ctx.now + 46_000 });
    expect(st.migration).toBeNull();
    expect(isOwn(st, target.x, target.y)).toBe(true);
    expect(st.owned[tileKey(target.x, target.y)].guardian).toBe('explorer'); // ارزان‌ترین: کاوشگر قبل از سرباز
    expect(st.player.xp).toBeGreaterThanOrEqual(6);
    expect(ev.some(e => e.kind === 'win')).toBe(true);
  });
  it('long migration cost uses the 1 + 0.1/tile factor and is limited to 20 new tiles', () => {
    const { st, ctx } = setup();
    buyCoins(st, s, 5000, ctx.now);
    buyUnits(st, s, 'player', 'guard', 200, ctx.now);
    const camp = st.player.camp!;
    const dx = camp.x < 500 ? 1 : -1;
    const target = { x: camp.x + dx * 4, y: camp.y };
    const r = planMove(st, ctx, 'player', target);
    if (r.ok) {
      expect(r.plan.kind).toBe('long');
      let sum = 0; for (const p of r.plan.path) sum += s.supply[ctx.gen.at(p.x, p.y) === 'valley' ? 'safe' : ctx.gen.at(p.x, p.y)];
      expect(r.plan.cost).toBe(Math.ceil(sum * (1 + 0.1 * r.plan.path.length)));
    }
    const far = { x: camp.x + dx * 40, y: camp.y };
    const r2 = planMove(st, ctx, 'player', far);
    expect(r2.ok).toBe(false);
  });
  it('clan: create costs 50 coins, deposit and donation build share weight, camp must be on own tile', () => {
    const { st, ctx } = setup();
    buyCoins(st, s, 1000, ctx.now);
    buyUnits(st, s, 'player', 'soldier', 10, ctx.now);
    expect(createClan(st, s, 'گردان', ctx.now).ok).toBe(true);
    expect(st.player.coins).toBe(1000 - 10 - 50);
    expect(clanDeposit(st, s, 500, ctx.now).ok).toBe(true);
    expect(donateUnits(st, s, 'soldier', 4, ctx.now).ok).toBe(true);
    expect(st.clan!.units.soldier).toBe(4);
    expect(st.clan!.members[0].weight).toBe(504);
    expect(setClanCamp(st, { x: 1, y: 1 }, ctx.now).ok).toBe(false);
    expect(setClanCamp(st, st.player.camp!, ctx.now).ok).toBe(true);
    expect(switchControl(st, 'clan').ok).toBe(true);
    expect(createClan(st, s, 'دوم', ctx.now).ok).toBe(false);
  });
  it('withdraw needs iban and min 100k; closing the season sells artifacts and pays out', () => {
    const { st, ctx } = setup();
    expect(withdraw(st, s, 200_000, ctx.now).ok).toBe(false);
    expect(setIban(st, 'IR' + '1'.repeat(24), 'آزمایش').ok).toBe(true);
    expect(withdraw(st, s, 50_000, ctx.now).ok).toBe(false);
    expect(withdraw(st, s, 200_000, ctx.now).ok).toBe(true);
    expect(st.player.toman).toBe(9_800_000);
    buyCoins(st, s, 1000, ctx.now);
    st.player.artifacts.push(0);
    closeSeason(st, ctx);
    expect(st.seasonClosed).toBe(true);
    expect(st.payout!.toIban).toBe(true);
    expect(st.player.toman).toBe(0);
    expect(st.payout!.amount).toBe(8_800_000 + Math.floor(1_000_000 * 0.03));
  });
  it('serialize/deserialize detects tampering; sanitize fixes negatives', () => {
    const { st, ctx } = setup();
    const raw = serialize(st);
    expect(deserialize(raw).tampered).toBe(false);
    const hacked = raw.replace('\\"coins\\":0', '\\"coins\\":999999'); expect(hacked).not.toBe(raw);
    expect(deserialize(hacked).tampered).toBe(true);
    st.player.coins = -5;
    const checks = sanitize(st, s, ctx.gen);
    expect(st.player.coins).toBe(0);
    expect(checks.some(c => !c.ok)).toBe(true);
  });
});
