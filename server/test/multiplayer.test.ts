// آزمون سرور چندنفره روی SQLite حافظه‌ای: دو بازیکن واقعی، کوچ، قفل، جنگ، مقبره/آرتیفکت، کلن، بازار، گنج و بستن فصل.
import { describe, it, expect, beforeAll } from 'vitest';
import { openDb } from '../src/db';
import { World } from '../src/game/world';
import { Actions } from '../src/game/actions';
import { Engine } from '../src/game/tick';
import { Views } from '../src/api/views';
import { findPath } from '../../src/rules/path';
import { tileKey, euclid } from '../../src/rules/terrain';
import { totalUnits } from '../../src/rules/combat';

let now = 1_800_000_000_000;
const db = openDb(':memory:');
const w = new World(db);
const a = new Actions(w);
const e = new Engine(w, a);
const v = new Views(w, a);

function player(id: number) { return w.actor({ type: 'player', id }); }
function fund(id: number, coins: number) { a.creditToman(id, coins * 1000, 'آزمون', now); a.buyCoins(id, coins, now); }
function runUntilIdle(ref: { type: 'player' | 'clan'; id: number }, maxSteps = 400) {
  let g = 0; while (w.migrationOf(ref) && g++ < maxSteps) { now += 46_000; e.tick(now); }
}
// مثل یک بازیکن: نقطه‌ی میانی ~۱۰ خانه به سمت هدف، حداکثر ۴ خانه‌ی تازه در هر کوچ
function walkTo(id: number, goal: { x: number; y: number }, maxHops: number): boolean {
  const ref = { type: 'player' as const, id };
  for (let hop = 0; hop < maxHops; hop++) {
    const ac = player(id);
    if (ac.pos!.x === goal.x && ac.pos!.y === goal.y) return true;
    const dx = goal.x - ac.pos!.x, dy = goal.y - ac.pos!.y, d = Math.hypot(dx, dy);
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      const step = Math.min(10, d);
      const ang = Math.atan2(dy, dx) + (attempt === 0 ? 0 : (attempt % 2 ? 1 : -1) * 0.6 * Math.ceil(attempt / 2));
      const wp = d <= 10 ? goal : { x: Math.round(ac.pos!.x + Math.cos(ang) * step), y: Math.round(ac.pos!.y + Math.sin(ang) * step) };
      const own = w.ownSet(ref);
      const taken = w.tileMap(ac.pos!.x - 40, ac.pos!.y - 40, ac.pos!.x + 40, ac.pos!.y + 40);
      const local = findPath(ac.pos!, wp, (x, y) => { if (own.has(tileKey(x, y))) return 0.05; const t = w.terrainAt(x, y); if (t === 'valley') return Infinity; if (taken.has(tileKey(x, y))) return Infinity; return w.settings.supply[t] + w.monstersAt(x, y) / 50; }, 40);
      if (!local) continue;
      let n = 0, target = local[local.length - 1];
      for (const p of local) { if (!own.has(tileKey(p.x, p.y))) n++; if (n >= 4) { target = p; break; } }
      let cur = player(id);
      if (cur.coins < 5000) { fund(id, 50000); cur = player(id); }
      if (totalUnits(cur.units) < 700) { a.buyUnits(cur, 'guard', 700, now); cur = player(id); }
      if (w.energyNow(cur, now) < 95) { try { a.rest(cur, now); } catch { /* full */ } cur = player(id); }
      try { a.startMove(cur, target, now); } catch { continue; }
      runUntilIdle(ref); ok = true;
    }
    if (!ok) return false;
  }
  return false;
}
const towardCenter = (id: number) => { const p = player(id).pos!; const d = euclid(p.x, p.y); const t = Math.max(0, d - 25) / d; return { x: Math.round(500 + (p.x - 500) * t), y: Math.round(500 + (p.y - 500) * t) }; };

let p1 = 0, p2 = 0;
beforeAll(() => { w.boot(777); p1 = a.register('قهرمان', 'secret1', now); p2 = a.register('رقیب', 'secret2', now); });

describe('multiplayer server', () => {
  it('registers two players with separate camps ≥430 from center and login works', () => {
    expect(a.login('قهرمان', 'secret1')).toBe(p1);
    expect(() => a.login('قهرمان', 'wrong')).toThrow();
    expect(() => a.register('قهرمان', 'x'.repeat(8), now)).toThrow();
    const c1 = player(p1).camp!, c2 = player(p2).camp!;
    expect(euclid(c1.x, c1.y)).toBeGreaterThanOrEqual(430);
    expect(euclid(c2.x, c2.y)).toBeGreaterThanOrEqual(430);
    expect(tileKey(c1.x, c1.y)).not.toBe(tileKey(c2.x, c2.y));
    expect(w.season.players_joined).toBe(2);
    expect(v.me(p1, now).player!.tiles).toBe(1);
  });

  it('coins purchase grows the pool and units need coins', () => {
    fund(p1, 20000); fund(p2, 20000);
    expect(w.season.pool).toBe(40_000_000);
    expect(() => a.buyUnits(player(p1), 'guard', 100000, now)).toThrow();
    a.buyUnits(player(p1), 'guard', 300, now); a.buyUnits(player(p1), 'soldier', 100, now); a.buyUnits(player(p1), 'explorer', 40, now);
    a.buyUnits(player(p2), 'guard', 300, now);
    const up = w.settings.unitPrice; expect(player(p1).coins).toBe(20000 - 300 * up.guard - 100 * up.soldier - 40 * up.explorer);
  });

  it('single move captures an adjacent tile with a guardian and XP, and locks the tile meanwhile', () => {
    const ac = player(p1); const c = ac.camp!;
    const cand = [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }].filter(p => w.terrainAt(p.x, p.y) !== 'valley');
    const target = cand[0];
    const plan = a.startMove(ac, target, now);
    expect(plan.kind).toBe('single');
    expect(w.locks.get(tileKey(target.x, target.y))).toBe(`player:${p1}`);
    expect(() => a.planMove(player(p2), target, now)).toThrow(); // بازیکن دوم نمی‌تواند به خانه‌ی قفل‌شده برود (مجاور هم نیست)
    runUntilIdle({ type: 'player', id: p1 });
    const t = w.tile(target.x, target.y)!;
    expect(t.owner_id).toBe(p1); expect(t.guardian).toBeTruthy();
    expect(w.locks.size).toBe(0);
    expect(player(p1).xp).toBeGreaterThan(0);
    expect(player(p1).pos).toEqual(target);
  });

  it('cancel keeps supplies, and the other player cannot enter an owned tile', () => {
    const ac = player(p1); const before = ac.coins;
    const tiles = w.tilesOf(ac).map(t => ({ x: t.x, y: t.y }));
    const own = w.ownSet(ac);
    const free = tiles.flatMap(t => [{ x: t.x + 1, y: t.y }, { x: t.x, y: t.y + 1 }, { x: t.x - 1, y: t.y }, { x: t.x, y: t.y - 1 }]).find(p => !own.has(tileKey(p.x, p.y)) && w.terrainAt(p.x, p.y) !== 'valley')!;
    a.startMove(ac, free, now);
    expect(player(p1).coins).toBeLessThan(before);
    a.cancelMove(player(p1), now);
    expect(player(p1).coins).toBeLessThan(before);
    expect(w.migrationOf(ac)).toBeUndefined();
    expect(() => a.planMove(player(p2), tiles[0], now)).toThrow(/مال/);
  });

  it('player 1 reaches level 7, captures three tombs (artifacts), a new tomb appears each time', () => {
    let safety = 0;
    while (w.level(player(p1)) < 7 && safety++ < 80) walkTo(p1, towardCenter(p1), 3);
    expect(w.level(player(p1))).toBeGreaterThanOrEqual(7);
    safety = 0;
    while (w.artifactCount(player(p1)) < 3 && safety++ < 30) {
      const pos = player(p1).pos!;
      const tombs = w.tombs.filter(t => !t.captured).sort((p, q) => Math.hypot(p.x - pos.x, p.y - pos.y) - Math.hypot(q.x - pos.x, q.y - pos.y));
      if (!walkTo(p1, { x: tombs[0].x, y: tombs[0].y }, 60)) walkTo(p1, towardCenter(p1), 2);
    }
    expect(w.artifactCount(player(p1))).toBeGreaterThanOrEqual(3);
    expect(w.tombs.filter(t => !t.captured).length).toBe(4);
    expect(w.season.tombs_revealed).toBe(w.tombs.length);
    expect(v.me(p1, now).player!.artifacts.length).toBe(w.artifactCount(player(p1)));
  }, 120_000);

  it('market: offer blocks toman, accept transfers artifact and money, expiry frees it', () => {
    const art = w.artifacts({ type: 'player', id: p1 })[0];
    a.creditToman(p2, 5_000_000, 'آزمون', now);
    const before = w.playerRow(p2).toman;
    a.makeOffer(p2, art.id, 1_000_000, now);
    expect(w.playerRow(p2).blocked).toBe(1_000_000);
    expect(() => a.makeOffer(p2, art.id, 1_000_000, now)).toThrow();
    const offer = (db.prepare("SELECT id FROM offers WHERE status = 'open'").get() as any).id;
    a.respondOffer(p1, offer, true, now);
    expect(w.playerRow(p2).toman).toBe(before - 1_000_000);
    expect(w.playerRow(p2).blocked).toBe(0);
    expect(w.artifacts({ type: 'player', id: p2 }).length).toBe(1);
    // پیشنهاد برگشتی با انقضا
    a.creditToman(p1, 5_000_000, 'آزمون', now);
    a.makeOffer(p1, art.id, 2_000_000, now);
    now += 25 * 3600_000; e.tick(now);
    expect((db.prepare('SELECT status FROM offers WHERE bidder_id = ?').get(p1) as any).status).toBe('expired');
    expect(w.playerRow(p1).blocked).toBe(0);
    // آرتیفکت به فروشنده برگردد تا شرط گنج (۳ آرتیفکت) برقرار بماند
    a.makeOffer(p1, art.id, 1_000_000, now);
    a.respondOffer(p2, (db.prepare("SELECT id FROM offers WHERE status = 'open'").get() as any).id, true, now);
    expect(w.artifactCount(player(p1))).toBeGreaterThanOrEqual(3);
  });

  it('clan: create, join request, deposit, donate, shares, clan camp and clan control', () => {
    const clanId = a.createClan(p1, 'شیران', now);
    a.requestJoin(p2, clanId, now);
    const req = (db.prepare("SELECT id FROM clan_requests WHERE status = 'open'").get() as any).id;
    a.respondJoin(p1, req, true, now);
    expect(w.playerRow(p2).clan_id).toBe(clanId);
    expect(() => a.quitSeason(p2, now)).toThrow(); // خروج از کلن ممکن نیست
    a.clanDeposit(p2, 500, now);
    a.donateUnits(p2, 'guard', 50, now);
    const shares = a.clanShares(clanId);
    const s2 = shares.find(s => s.playerId === p2)!;
    expect(s2.weight).toBe(500 + 50 * w.settings.unitPrice.guard);
    expect(w.actor({ type: 'clan', id: clanId }).units.guard).toBe(50);
    expect(() => a.actorFor(p2, 'clan')).toThrow(); // عضو ساده کنترل کلن ندارد
    const camp = player(p1).camp!;
    a.setClanCamp(p1, camp, now);
    const clan = a.actorFor(p1, 'clan');
    expect(clan.camp).toEqual(camp);
    // آرتیفکت‌های کلن به حساب اعضا می‌آید و سطح کلن ≥ بالاترین عضو
    expect(w.gateLevel(player(p2))).toBe(w.level(player(p1)));
    expect(w.artifactCount(player(p2))).toBe(w.artifacts({ type: 'clan', id: clanId }).length);
    // کوچ کلن از کمپ کلن (خانه‌های اعضا خودی است)
    const own = w.ownSet(clan);
    const near = [...own].map(k => k.split(',').map(Number)).flatMap(([x, y]) => [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]).find(p => !own.has(tileKey(p.x, p.y)) && w.terrainAt(p.x, p.y) !== 'valley' && !w.tile(p.x, p.y))!;
    a.startMove(clan, near, now);
    runUntilIdle({ type: 'clan', id: clanId });
    expect(w.tile(near.x, near.y)?.owner_type).toBe('clan');
  });

  it('elections: weighted votes pick the commander at period rollover', () => {
    const clanId = w.playerRow(p1).clan_id as number;
    a.vote(p1, p2, now); a.vote(p2, p2, now);
    now += w.settings.electionDays * 86400000 + 1000; e.tick(now);
    expect(w.clanRow(clanId).commander_id).toBe(p2);
    expect((db.prepare('SELECT role FROM clan_members WHERE clan_id = ? AND player_id = ?').get(clanId, p2) as any).role).toBe('commander');
  });

  it('level 10 + 3 artifacts → treasure, prize split by clan shares, report and 24h close', () => {
    let safety = 0;
    while (w.level(player(p1)) < 10 && safety++ < 80) walkTo(p1, towardCenter(p1), 3);
    expect(w.level(player(p1))).toBeGreaterThanOrEqual(10);
    const t1 = w.playerRow(p1).toman, t2 = w.playerRow(p2).toman;
    safety = 0;
    while (!w.season.treasure_at && safety++ < 20) {
      if (totalUnits(player(p1).units) < 600) { fund(p1, 20000); a.buyUnits(player(p1), 'guard', 600, now); }
      walkTo(p1, { x: 500, y: 500 }, 80);
    }
    expect(w.season.treasure_at).toBeTruthy();
    const se = v.season();
    expect(se.treasure!.value).toBe(Math.max(200_000_000, Math.floor(w.season.pool * 0.4)));
    // گنج را خودِ بازیکن (نه اکانت کلن) فتح کرده: تمام گنج به کیف پول خودش؛ جایزه‌ی مشارکت به کسی نمی‌رسد (همه‌ی خانه‌ها مال گروه برنده)
    const got1 = w.playerRow(p1).toman - t1, got2 = w.playerRow(p2).toman - t2;
    expect(got1).toBe(se.treasure!.value);
    expect(got2).toBe(0);
    expect(se.report!.rows[0].title).toBe('گنج نهایی');
    expect(se.participation!.tile).toBeNull(); // همه‌ی خانه‌ها مال گروه برنده است
    expect(se.endsAt).toBe(w.season.treasure_at! + 24 * 3600_000);
    const endsAt = se.endsAt as number;
    // در ۲۴ ساعت فقط کوچ به مقبره‌های بی‌صاحب باز است
    expect(() => a.planMove(player(p1), { x: 480, y: 480 }, now)).toThrow(/مقبره/);
    // بستن فصل
    a.setIban(p1, 'IR' + '1'.repeat(24), 'قهرمان اصلی');
    now = endsAt + 1000; e.tick(now);
    expect(w.closed).toBe(true);
    expect((db.prepare('SELECT COUNT(*) c FROM artifacts WHERE season_id = ? AND sold_at IS NULL').get(w.season.id) as any).c).toBe(0);
    expect(w.playerRow(p1).toman).toBe(0); // واریز خودکار به شبا
    expect((db.prepare("SELECT COUNT(*) c FROM withdrawals WHERE player_id = ? AND kind = 'payout'").get(p1) as any).c).toBe(1);
    expect(w.playerRow(p2).toman).toBeGreaterThan(0); // بی‌شبا در کیف پول می‌ماند
    expect(() => a.buyCoins(p1, 1, now)).toThrow(/بسته/);
  }, 180_000);

  it('a new season resets players lazily and keeps toman/iban', () => {
    const t2 = w.playerRow(p2).toman;
    w.createSeason(true);
    expect(w.season.number).toBe(2);
    a.joinSeason(p1, now); a.joinSeason(p2, now);
    expect(player(p1).xp).toBe(0); expect(player(p1).coins).toBe(0); expect(w.playerRow(p1).clan_id).toBeNull();
    expect(w.playerRow(p2).toman).toBe(t2);
    expect(w.playerRow(p1).iban).toMatch(/^IR/);
    expect(w.tombs.length).toBe(4);
  });
});
