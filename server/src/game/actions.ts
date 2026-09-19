// کنش‌های بازیکن روی سرور (همه‌ی قوانین از سند اول): حساب، کیف پول، نیرو، کوچ، کلن، بازار آرتیفکت، تیکت.
import { World, GameError, type Actor, type ActorRef, type P, type MigrationRow } from './world.js';
import { hashPassword, verifyPassword } from '../auth.js';
import * as C from '../../../src/rules/constants';
import type { UnitType, Terrain } from '../../../src/rules/constants';
import { armyPower, moveSeconds, totalUnits, emptyUnits, type UnitCounts } from '../../../src/rules/combat';
import { findPath } from '../../../src/rules/path';
import { neighbors8, isAdjacent, inMap, tileKey } from '../../../src/rules/terrain';
import { artifactValue } from '../../../src/rules/economy';

export interface MovePlan { kind: 'single' | 'long' | 'free'; path: P[]; cost: number; steps: number; encounters: { count: number; totalPower: number; hardest: { x: number; y: number; power: number } | null }; army: number; seconds: number }

const OFFER_HOURS = 24; // مهلت پاسخ پیشنهاد (تقسیم بر ضریب سرعت)

export class Actions {
  constructor(public w: World) {}
  get db() { return this.w.db; }
  get s() { return this.w.settings; }

  // ---------- حساب ----------
  register(name: string, password: string, now: number): number {
    name = name.trim();
    if (name.length < 3 || name.length > 20) throw new GameError('نام باید بین ۳ تا ۲۰ نویسه باشد');
    if (password.length < 6) throw new GameError('گذرواژه دست‌کم ۶ نویسه');
    if (this.db.prepare('SELECT id FROM players WHERE name = ?').get(name)) throw new GameError('این نام قبلاً گرفته شده است');
    const r = this.db.prepare('INSERT INTO players(name, pass_hash, created_at, last_seen) VALUES (?, ?, ?, ?)').run(name, hashPassword(password), now, now);
    const id = Number(r.lastInsertRowid);
    this.joinSeason(id, now);
    return id;
  }
  login(name: string, password: string): number {
    const r = this.db.prepare('SELECT id, pass_hash FROM players WHERE name = ?').get(name.trim()) as any;
    if (!r || !verifyPassword(password, r.pass_hash)) throw new GameError('نام یا گذرواژه نادرست است', 401);
    return r.id;
  }
  // پیوستن به فصل جاری (کمپ تازه، صفر سکه و صفر نیرو مگر سکه‌ی آغازین)
  joinSeason(playerId: number, now: number) {
    const p = this.w.playerRow(playerId);
    if (p.season_id === this.w.season.id && !p.quit) return;
    if (this.w.closed) throw new GameError('فصل بسته شده است؛ تا آغاز فصل تازه منتظر بمانید');
    const active = (this.db.prepare('SELECT COUNT(*) c FROM players WHERE season_id = ? AND quit = 0').get(this.w.season.id) as any).c as number;
    if (active >= this.s.seasonMaxPlayers) throw new GameError('ظرفیت فصل پر است');
    const camp = this.w.newCamp((playerId * 2654435761 + this.w.season.seed) >>> 0);
    this.db.prepare(`UPDATE players SET season_id=?, coins=?, xp=0, energy=100, energy_at=?, camp_x=?, camp_y=?, pos_x=?, pos_y=?, units='{}', units_bought=0, spent_coins=0, clan_id=NULL, control='player', quit=0 WHERE id=?`)
      .run(this.w.season.id, this.s.startCoins, now, camp.x, camp.y, camp.x, camp.y, playerId);
    this.db.prepare('INSERT OR REPLACE INTO tiles(season_id, x, y, owner_type, owner_id, guardian, cost, at, terrain) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?)').run(this.w.season.id, camp.x, camp.y, 'player', playerId, now, 'safe');
    this.db.prepare('UPDATE seasons SET players_joined = players_joined + 1 WHERE id = ?').run(this.w.season.id);
    this.w.refreshSeason();
    this.w.log({ type: 'player', id: playerId }, 'info', `«${p.name}» به فصل ${this.w.season.number} پیوست.`, now);
  }
  // انصراف: مشارکت خودش پایان می‌یابد (خانه‌ها، نیرو، سکه، کلن…) — تومان و شبا می‌ماند
  quitSeason(playerId: number, now: number) {
    const p = this.w.playerRow(playerId);
    if (p.clan_id) throw new GameError('عضو کلن نمی‌تواند انصراف بدهد (خروج از کلن ممکن نیست)');
    const m = this.w.migrationOf({ type: 'player', id: playerId }); if (m) { this.w.clearLocksOf({ type: 'player', id: playerId }); this.db.prepare('DELETE FROM migrations WHERE season_id=? AND actor_type=? AND actor_id=?').run(this.w.season.id, 'player', playerId); }
    this.db.prepare('DELETE FROM tiles WHERE season_id = ? AND owner_type = ? AND owner_id = ?').run(this.w.season.id, 'player', playerId);
    this.db.prepare('DELETE FROM artifacts WHERE season_id = ? AND owner_type = ? AND owner_id = ?').run(this.w.season.id, 'player', playerId);
    for (const o of this.db.prepare("SELECT * FROM offers WHERE season_id = ? AND bidder_id = ? AND status = 'open'").all(this.w.season.id, playerId) as any[]) this.resolveOffer(o.id, 'cancelled', now);
    this.db.prepare(`UPDATE players SET quit=1, coins=0, xp=0, units='{}', units_bought=0, spent_coins=0, clan_id=NULL, control='player' WHERE id=?`).run(playerId);
    this.db.prepare('DELETE FROM inventory WHERE season_id = ? AND owner_type = ? AND owner_id = ?').run(this.w.season.id, 'player', playerId);
    this.w.log({ type: 'player', id: playerId }, 'info', 'از فصل انصراف داد.', now);
  }

  // ---------- کیف پول ----------
  creditToman(playerId: number, amount: number, note: string, now: number, type = 'deposit') {
    this.db.prepare('UPDATE players SET toman = toman + ? WHERE id = ?').run(Math.floor(amount), playerId);
    this.w.tx(playerId, type, Math.floor(amount), note, now);
  }
  buyCoins(playerId: number, n: number, now: number) {
    if (this.w.closed) throw new GameError('فصل بسته شده است');
    if (!Number.isInteger(n) || n <= 0) throw new GameError('تعداد سکه معتبر نیست');
    if (n > this.s.buyCoinsMax) throw new GameError(`سقف خرید هر بار ${this.s.buyCoinsMax} سکه است`);
    const p = this.w.playerRow(playerId); const cost = n * this.s.coinToman;
    if (p.toman - p.blocked < cost) throw new GameError('موجودی آزاد تومانی کافی نیست');
    this.db.prepare('UPDATE players SET toman = toman - ?, coins = coins + ? WHERE id = ?').run(cost, n, playerId);
    this.db.prepare('UPDATE seasons SET pool = pool + ? WHERE id = ?').run(cost, this.w.season.id); this.w.refreshSeason();
    this.w.tx(playerId, 'buy', -cost, `خرید ${n} سکه`, now);
    this.w.log({ type: 'player', id: playerId }, 'info', `${n} سکه خرید.`, now);
  }
  setIban(playerId: number, iban: string, ownerName: string) {
    iban = iban.replace(/\s+/g, '').toUpperCase();
    if (!/^IR\d{24}$/.test(iban)) throw new GameError('شبا باید با IR شروع شود و ۲۴ رقم داشته باشد');
    if (ownerName.trim().length < 3) throw new GameError('نام صاحب حساب لازم است');
    this.db.prepare('UPDATE players SET iban = ?, owner_name = ? WHERE id = ?').run(iban, ownerName.trim(), playerId);
  }
  requestWithdraw(playerId: number, amount: number, now: number) {
    const p = this.w.playerRow(playerId);
    if (!p.iban) throw new GameError('برای برداشت باید شبا ثبت شده باشد');
    amount = Math.floor(amount);
    if (!Number.isFinite(amount) || amount < this.s.withdrawMin) throw new GameError(`حداقل برداشت ${this.s.withdrawMin} تومان است`);
    if (amount > p.toman - p.blocked) throw new GameError('بیشتر از موجودی آزاد است');
    this.db.prepare('UPDATE players SET toman = toman - ? WHERE id = ?').run(amount, playerId);
    this.db.prepare('INSERT INTO withdrawals(player_id, amount, iban, owner_name, created_at) VALUES (?, ?, ?, ?, ?)').run(playerId, amount, p.iban, p.owner_name, now);
    this.w.tx(playerId, 'withdraw', -amount, `درخواست برداشت به ${p.iban}`, now);
  }

  // ---------- نیرو ----------
  actorFor(playerId: number, control: 'player' | 'clan'): Actor {
    if (control === 'clan') {
      const p = this.w.playerRow(playerId);
      if (!p.clan_id) throw new GameError('کلنی ندارید');
      const role = (this.db.prepare('SELECT role FROM clan_members WHERE clan_id = ? AND player_id = ?').get(p.clan_id, playerId) as any)?.role;
      if (role !== 'commander' && role !== 'elder') throw new GameError('فقط فرمانده و ارشدها اکانت کلن را کنترل می‌کنند', 403);
      return this.w.actor({ type: 'clan', id: p.clan_id });
    }
    return this.w.actor({ type: 'player', id: playerId });
  }
  spendCoins(a: Actor, n: number, now: number) {
    if (a.coins < n) throw new GameError(`سکه کافی نیست (${a.coins} سکه)`);
    this.w.saveActor(a, now, { coins: a.coins - n, spentCoins: a.spentCoins + n });
  }
  buyUnits(a: Actor, type: UnitType, n: number, now: number) {
    if (this.w.closed) throw new GameError('فصل بسته شده است');
    if (!C.UNITS[type]) throw new GameError('نوع نیرو نامعتبر');
    if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) throw new GameError('تعداد معتبر نیست');
    const cost = n * this.s.unitPrice[type];
    this.spendCoins(a, cost, now);
    const units = { ...a.units, [type]: a.units[type] + n };
    this.w.saveActor(a, now, { units, unitsBought: a.unitsBought + n });
    this.w.log(a, 'info', `${n} ${C.UNITS[type].name} خرید (${cost} سکه).`, now);
  }
  restCost(a: Actor, now: number): number { return Math.ceil((C.ENERGY_MAX - this.w.energyNow(a, now)) * totalUnits(a.units) * this.s.restCost * 100) / 100; }
  rest(a: Actor, now: number) {
    if (this.w.migrationOf(a)) throw new GameError('کاروان در راه است');
    if (this.w.energyNow(a, now) >= C.ENERGY_MAX) throw new GameError('انرژی کامل است');
    const cost = this.restCost(a, now);
    this.spendCoins(a, cost, now);
    this.w.saveActor(a, now, { energy: C.ENERGY_MAX });
    this.w.log(a, 'info', `استراحت فوری (${cost} سکه).`, now);
  }

  // ---------- کوچ ----------
  private gateCheck(a: Actor, t: Terrain): string | null {
    const s = this.s; const lvl = this.w.gateLevel(a);
    const gates: Partial<Record<Terrain, number>> = { danger: s.gates.danger, tomb: s.gates.tomb, treasure: s.gates.treasure, hell: s.gates.treasure };
    const g = gates[t];
    if (g && lvl < g) return `ورود به ${C.TERRAIN[t].name} از سطح ${g} ممکن است (سطح تو ${lvl})`;
    if ((t === 'treasure' || t === 'hell') && this.w.artifactCount(a) < s.treasureArtifacts) return `ورود به ${C.TERRAIN[t].name} دست‌کم ${s.treasureArtifacts} آرتیفکت می‌خواهد`;
    return null;
  }
  planMove(a: Actor, target: P, now: number): MovePlan {
    const s = this.s, w = this.w;
    if (w.closed) throw new GameError('فصل بسته شده و کوچ متوقف است');
    if (w.migrationOf(a)) throw new GameError('کاروان در راه است');
    if (!a.camp || !a.pos) throw new GameError(a.type === 'clan' ? 'تا کمپ کلن برپا نشود، کلن نمی‌تواند کوچ کند' : 'کمپ ندارید');
    if (!inMap(target.x, target.y)) throw new GameError('بیرون نقشه');
    if (w.season.treasure_at && !w.tombAt(target.x, target.y)) {
      if (w.tombs.some(t => !t.captured)) throw new GameError('پس از فتح گنج فقط کوچ به مقبره‌های بی‌صاحب باز است');
      throw new GameError('هیچ مقبره‌ی بی‌صاحبی نمانده؛ کوچ بسته است');
    }
    const t = w.terrainAt(target.x, target.y);
    if (t === 'valley') throw new GameError('دره عبورناپذیر است');
    const own = w.ownSet(a);
    const isOwn = (x: number, y: number) => own.has(tileKey(x, y));
    const energy = w.energyNow(a, now);
    const army = armyPower(a.units, energy, t, s);
    if (isOwn(target.x, target.y)) {
      if (target.x === a.pos.x && target.y === a.pos.y) throw new GameError('کاروان همین‌جاست');
      const path = findPath(a.pos, target, (x, y) => (isOwn(x, y) ? 1 : Infinity), 400);
      if (!path) throw new GameError('مسیر خودی پیوسته‌ای به این خانه نیست');
      return { kind: 'free', path, cost: 0, steps: path.length, encounters: { count: 0, totalPower: 0, hardest: null }, army, seconds: path.length * 3 / s.speedFactor };
    }
    const other = w.tile(target.x, target.y);
    if (other) throw new GameError(`این خانه مال «${w.nameOf({ type: other.owner_type, id: other.owner_id })}» است`);
    if (w.isLockedFor(target.x, target.y, a)) throw new GameError('قفل — بازیکن دیگری زودتر به این خانه کوچ کرده است');
    if (totalUnits(a.units) < C.MIN_FREE_UNITS_TO_CAPTURE) throw new GameError(`برای تصاحب خانه‌ی تازه دست‌کم ${C.MIN_FREE_UNITS_TO_CAPTURE} نیروی آزاد لازم است (لشگر ${totalUnits(a.units)} نفر)`);
    const secs = moveSeconds(a.units, s);
    if (neighbors8(target.x, target.y).some(n => isOwn(n.x, n.y))) {
      const g = this.gateCheck(a, t); if (g) throw new GameError(g);
      const cost = s.supply[t];
      if (a.coins < cost) throw new GameError(`تدارکات این کوچ ${cost} سکه است؛ سکه کافی نیست (${a.coins} سکه)`);
      const mp = w.monstersAt(target.x, target.y);
      let prefix: P[] = [];
      if (!isAdjacent(a.pos, target)) {
        let best: P[] | null = null;
        for (const o of neighbors8(target.x, target.y).filter(n => isOwn(n.x, n.y))) { const p = findPath(a.pos, o, (x, y) => (isOwn(x, y) ? 1 : Infinity), 400); if (p && (!best || p.length < best.length)) best = p; }
        if (!best) throw new GameError('مسیر خودی پیوسته‌ای تا این خانه نیست');
        prefix = best;
      }
      return { kind: 'single', path: [...prefix, target], cost, steps: 1, encounters: { count: mp > 0 ? 1 : 0, totalPower: mp, hardest: mp > 0 ? { x: target.x, y: target.y, power: mp } : null }, army, seconds: secs + prefix.length * 3 / s.speedFactor };
    }
    const pad = s.longMoveMax + 30;
    const taken = w.tileMap(Math.min(a.pos.x, target.x) - pad, Math.min(a.pos.y, target.y) - pad, Math.max(a.pos.x, target.x) + pad, Math.max(a.pos.y, target.y) + pad);
    const path = findPath(a.pos, target, (x, y) => {
      if (isOwn(x, y)) return 0.05;
      const tt = w.terrainAt(x, y); if (tt === 'valley') return Infinity;
      if (taken.has(tileKey(x, y)) || w.isLockedFor(x, y, a)) return Infinity; // خانه‌ی دیگران یا قفل‌شده
      return s.supply[tt] + w.monstersAt(x, y) / 50;
    }, s.longMoveMax + 200);
    if (!path) throw new GameError('راهی به این خانه پیدا نشد');
    const newTiles = path.filter(p => !isOwn(p.x, p.y));
    if (newTiles.length > s.longMoveMax) throw new GameError(`کوچ بلند حداکثر ${s.longMoveMax} خانه است (این مسیر ${newTiles.length} خانه‌ی تازه دارد)`);
    let sum = 0, count = 0, total = 0, hardest: MovePlan['encounters']['hardest'] = null;
    for (const p of newTiles) {
      const tt = w.terrainAt(p.x, p.y);
      const g = this.gateCheck(a, tt); if (g) throw new GameError(`در مسیر: ${g}`);
      sum += s.supply[tt];
      const mp = w.monstersAt(p.x, p.y);
      if (mp > 0) { count++; total += mp; if (!hardest || mp > hardest.power) hardest = { x: p.x, y: p.y, power: mp }; }
    }
    const cost = Math.ceil(sum * (1 + s.longMoveStep * newTiles.length));
    if (a.coins < cost) throw new GameError(`پیش‌پرداخت این کوچ بلند ${cost} سکه است؛ سکه کافی نیست`);
    return { kind: 'long', path, cost, steps: newTiles.length, encounters: { count, totalPower: total, hardest }, army, seconds: newTiles.length * secs + (path.length - newTiles.length) * 3 / s.speedFactor };
  }
  startMove(a: Actor, target: P, now: number): MovePlan {
    const plan = this.planMove(a, target, now);
    const w = this.w;
    if (plan.cost > 0) this.spendCoins(a, plan.cost, now);
    let energy = w.energyNow(a, now);
    if (plan.kind === 'free') energy = Math.max(0, energy - Math.min(C.ENERGY_PER_FREE_TRAVEL_MAX, plan.path.length * 2));
    w.saveActor(a, now, { energy });
    const own = w.ownSet(a);
    const first = plan.path[0];
    const m: MigrationRow = { season_id: w.season.id, actor_type: a.type, actor_id: a.id, kind: plan.kind, path: plan.path, step: 0, step_start: now, step_seconds: own.has(tileKey(first.x, first.y)) ? 3 / this.s.speedFactor : moveSeconds(a.units, this.s), prepaid: plan.cost, from_x: a.pos!.x, from_y: a.pos!.y };
    this.db.prepare('INSERT OR REPLACE INTO migrations(season_id, actor_type, actor_id, kind, path, step, step_start, step_seconds, prepaid, from_x, from_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(m.season_id, m.actor_type, m.actor_id, m.kind, JSON.stringify(m.path), m.step, m.step_start, m.step_seconds, m.prepaid, m.from_x, m.from_y);
    w.setLock(m);
    w.log(a, 'info', plan.kind === 'free' ? `سفر رایگان به (${target.x}، ${target.y}).` : `کوچ ${plan.kind === 'long' ? 'بلند ' : ''}به (${target.x}، ${target.y}) آغاز شد — تدارکات ${plan.cost} سکه.`, now);
    return plan;
  }
  cancelMove(a: Actor, now: number) {
    const m = this.w.migrationOf(a); if (!m) throw new GameError('کوچی در جریان نیست');
    this.w.clearLock(m);
    this.db.prepare('DELETE FROM migrations WHERE season_id=? AND actor_type=? AND actor_id=?').run(this.w.season.id, a.type, a.id);
    this.w.saveActor(a, now, {}); // انرژی از این لحظه پر می‌شود
    this.w.log(a, 'info', 'کوچ لغو شد؛ تدارکات پرداخت‌شده برنمی‌گردد.', now);
  }

  // ---------- کلن ----------
  createClan(playerId: number, name: string, now: number): number {
    const p = this.w.playerRow(playerId);
    if (p.clan_id) throw new GameError('قبلاً کلن دارید و خروج ممکن نیست');
    name = name.trim(); if (name.length < 3 || name.length > 20) throw new GameError('نام کلن باید بین ۳ تا ۲۰ نویسه باشد');
    if (this.db.prepare('SELECT id FROM clans WHERE season_id = ? AND name = ?').get(this.w.season.id, name)) throw new GameError('این نام کلن قبلاً گرفته شده است');
    const a = this.w.actor({ type: 'player', id: playerId });
    this.spendCoins(a, this.s.clanCreateCost, now);
    const brought = (this.db.prepare('SELECT COALESCE(SUM(cost),0) c FROM tiles WHERE season_id = ? AND owner_type = ? AND owner_id = ?').get(this.w.season.id, 'player', playerId) as any).c as number;
    const r = this.db.prepare('INSERT INTO clans(season_id, name, created_at, commander_id, xp, energy_at) VALUES (?, ?, ?, ?, ?, ?)').run(this.w.season.id, name, now, playerId, a.xp, now);
    const clanId = Number(r.lastInsertRowid);
    this.db.prepare('INSERT INTO clan_members(clan_id, player_id, weight, joined_at, role) VALUES (?, ?, ?, ?, ?)').run(clanId, playerId, brought, now, 'commander');
    this.db.prepare('UPDATE players SET clan_id = ? WHERE id = ?').run(clanId, playerId);
    this.w.log({ type: 'player', id: playerId }, 'info', `کلن «${name}» ساخته شد (${this.s.clanCreateCost} سکه).`, now);
    this.w.log({ type: 'clan', id: clanId }, 'info', `کلن «${name}» به دست «${p.name}» بنیان گذاشته شد.`, now);
    return clanId;
  }
  requestJoin(playerId: number, clanId: number, now: number) {
    const p = this.w.playerRow(playerId); if (p.clan_id) throw new GameError('قبلاً عضو کلن هستید و خروج ممکن نیست');
    const c = this.w.clanRow(clanId); if (!c || c.season_id !== this.w.season.id) throw new GameError('کلن پیدا نشد', 404);
    if (this.db.prepare("SELECT id FROM clan_requests WHERE clan_id = ? AND player_id = ? AND status = 'open'").get(clanId, playerId)) throw new GameError('درخواست باز دارید');
    this.db.prepare('INSERT INTO clan_requests(clan_id, player_id, created_at) VALUES (?, ?, ?)').run(clanId, playerId, now);
  }
  respondJoin(officerId: number, requestId: number, accept: boolean, now: number) {
    const r = this.db.prepare("SELECT * FROM clan_requests WHERE id = ? AND status = 'open'").get(requestId) as any; if (!r) throw new GameError('درخواست پیدا نشد', 404);
    this.requireOfficer(officerId, r.clan_id);
    if (!accept) { this.db.prepare("UPDATE clan_requests SET status = 'rejected' WHERE id = ?").run(requestId); return; }
    const p = this.w.playerRow(r.player_id); if (p.clan_id) throw new GameError('این بازیکن دیگر عضو کلن دیگری است');
    const count = (this.db.prepare('SELECT COUNT(*) c FROM clan_members WHERE clan_id = ?').get(r.clan_id) as any).c as number;
    if (count >= this.s.clanMaxMembers) throw new GameError('ظرفیت کلن پر است');
    const brought = (this.db.prepare('SELECT COALESCE(SUM(cost),0) c FROM tiles WHERE season_id = ? AND owner_type = ? AND owner_id = ?').get(this.w.season.id, 'player', r.player_id) as any).c as number;
    this.db.prepare('INSERT INTO clan_members(clan_id, player_id, weight, joined_at) VALUES (?, ?, ?, ?)').run(r.clan_id, r.player_id, brought, now);
    this.db.prepare('UPDATE players SET clan_id = ? WHERE id = ?').run(r.clan_id, r.player_id);
    this.db.prepare("UPDATE clan_requests SET status = 'accepted' WHERE id = ?").run(requestId);
    this.db.prepare('UPDATE clans SET xp = MAX(xp, ?) WHERE id = ?').run(p.xp, r.clan_id); // سطح کلن ≥ بالاترین عضو
    this.w.log({ type: 'clan', id: r.clan_id }, 'info', `«${p.name}» به کلن پیوست.`, now);
  }
  requireOfficer(playerId: number, clanId: number) {
    const role = (this.db.prepare('SELECT role FROM clan_members WHERE clan_id = ? AND player_id = ?').get(clanId, playerId) as any)?.role;
    if (role !== 'commander' && role !== 'elder') throw new GameError('فقط فرمانده و ارشدها', 403);
  }
  clanDeposit(playerId: number, amount: number, now: number) {
    const p = this.w.playerRow(playerId); if (!p.clan_id) throw new GameError('کلنی ندارید');
    if (!Number.isInteger(amount) || amount <= 0) throw new GameError('مبلغ معتبر نیست');
    const a = this.w.actor({ type: 'player', id: playerId }); this.spendCoins(a, amount, now);
    this.db.prepare('UPDATE clans SET treasury = treasury + ?, member_coins = member_coins + ? WHERE id = ?').run(amount, amount, p.clan_id);
    this.db.prepare('UPDATE clan_members SET weight = weight + ? WHERE clan_id = ? AND player_id = ?').run(amount, p.clan_id, playerId);
    this.w.log({ type: 'clan', id: p.clan_id }, 'info', `«${p.name}» ${amount} سکه به خزانه واریز کرد.`, now);
  }
  donateUnits(playerId: number, type: UnitType, n: number, now: number) {
    const p = this.w.playerRow(playerId); if (!p.clan_id) throw new GameError('کلنی ندارید');
    if (!C.UNITS[type] || !Number.isInteger(n) || n <= 0) throw new GameError('تعداد معتبر نیست');
    const a = this.w.actor({ type: 'player', id: playerId });
    if (this.w.migrationOf(a)) throw new GameError('کاروان در راه است');
    if (a.units[type] < n) throw new GameError('این تعداد نیروی آزاد ندارید');
    const c = this.w.actor({ type: 'clan', id: p.clan_id });
    const before = totalUnits(c.units); const ce = this.w.energyNow(c, now), pe = this.w.energyNow(a, now);
    const energy = before + n > 0 ? (ce * before + pe * n) / (before + n) : ce;
    this.w.saveActor(a, now, { units: { ...a.units, [type]: a.units[type] - n } });
    this.w.saveActor(c, now, { units: { ...c.units, [type]: c.units[type] + n }, energy, unitsBought: c.unitsBought + n });
    const worth = n * this.s.unitPrice[type];
    this.db.prepare('UPDATE clans SET member_coins = member_coins + ? WHERE id = ?').run(worth, p.clan_id);
    this.db.prepare('UPDATE clan_members SET weight = weight + ? WHERE clan_id = ? AND player_id = ?').run(worth, p.clan_id, playerId);
    this.w.log({ type: 'clan', id: p.clan_id }, 'info', `«${p.name}» ${n} ${C.UNITS[type].name} اهدا کرد.`, now);
  }
  setClanCamp(playerId: number, tile: P, now: number) {
    const p = this.w.playerRow(playerId); if (!p.clan_id) throw new GameError('کلنی ندارید');
    const c = this.w.clanRow(p.clan_id);
    if (c.commander_id !== playerId) throw new GameError('فقط فرمانده کمپ کلن را تعیین می‌کند', 403);
    if (c.camp_x != null) throw new GameError('کمپ کلن یک‌بار تعیین می‌شود و جابجا نمی‌شود');
    const t = this.w.tile(tile.x, tile.y);
    if (!t || t.owner_type !== 'player' || t.owner_id !== playerId) throw new GameError('کمپ کلن باید روی یکی از خانه‌های تصاحب‌شده‌ی خودِ فرمانده باشد');
    this.db.prepare('UPDATE clans SET camp_x=?, camp_y=?, pos_x=?, pos_y=? WHERE id=?').run(tile.x, tile.y, tile.x, tile.y, p.clan_id);
    this.w.log({ type: 'clan', id: p.clan_id }, 'info', `کمپ کلن در (${tile.x}، ${tile.y}) برپا شد.`, now);
  }
  switchControl(playerId: number, control: 'player' | 'clan') {
    if (control === 'clan') this.actorFor(playerId, 'clan');
    this.db.prepare('UPDATE players SET control = ? WHERE id = ?').run(control, playerId);
  }
  vote(playerId: number, candidateId: number, now: number) {
    const p = this.w.playerRow(playerId); if (!p.clan_id) throw new GameError('کلنی ندارید');
    if (!this.db.prepare('SELECT 1 FROM clan_members WHERE clan_id = ? AND player_id = ?').get(p.clan_id, candidateId)) throw new GameError('نامزد عضو کلن نیست');
    const c = this.w.clanRow(p.clan_id); const period = this.electionPeriod(c, now);
    this.db.prepare('INSERT OR REPLACE INTO clan_votes(clan_id, voter_id, candidate_id, period) VALUES (?, ?, ?, ?)').run(p.clan_id, playerId, candidateId, period);
  }
  electionPeriod(c: any, now: number): number { return Math.floor((now - c.created_at) / (this.s.electionDays * 86400000)); }
  chat(playerId: number, text: string, now: number) {
    const p = this.w.playerRow(playerId); if (!p.clan_id) throw new GameError('کلنی ندارید');
    text = text.trim(); if (!text || text.length > 300) throw new GameError('پیام نامعتبر');
    this.db.prepare('INSERT INTO clan_chat(clan_id, player_id, t, text) VALUES (?, ?, ?, ?)').run(p.clan_id, playerId, now, text);
  }
  clanShares(clanId: number): { playerId: number; name: string; weight: number; share: number; role: string }[] {
    const rows = this.db.prepare('SELECT m.player_id, p.name, m.weight, m.role FROM clan_members m JOIN players p ON p.id = m.player_id WHERE m.clan_id = ?').all(clanId) as any[];
    const total = rows.reduce((a, r) => a + r.weight, 0);
    return rows.map(r => ({ playerId: r.player_id, name: r.name, weight: r.weight, role: r.role, share: total > 0 ? r.weight / total : (rows.length === 1 ? 1 : 0) }));
  }

  // ---------- بازار آرتیفکت ----------
  makeOffer(bidderId: number, artifactId: number, amount: number, now: number) {
    if (this.w.closed) throw new GameError('فصل بسته شده است');
    amount = Math.floor(amount);
    if (!Number.isFinite(amount) || amount < this.s.offerMin) throw new GameError(`حداقل پیشنهاد ${this.s.offerMin} تومان است`);
    const art = this.db.prepare('SELECT * FROM artifacts WHERE id = ? AND season_id = ? AND sold_at IS NULL').get(artifactId, this.w.season.id) as any;
    if (!art) throw new GameError('آرتیفکت پیدا نشد', 404);
    if (art.owner_type !== 'player') throw new GameError('آرتیفکت کلن دستی فروختنی نیست');
    if (art.owner_id === bidderId) throw new GameError('این آرتیفکت مال خودتان است');
    if (this.db.prepare("SELECT id FROM offers WHERE artifact_id = ? AND bidder_id = ? AND status = 'open'").get(artifactId, bidderId)) throw new GameError('روی هر آرتیفکت همزمان فقط یک پیشنهاد باز دارید');
    const p = this.w.playerRow(bidderId);
    if (p.toman - p.blocked < amount) throw new GameError('موجودی آزاد کافی نیست');
    this.db.prepare('UPDATE players SET blocked = blocked + ? WHERE id = ?').run(amount, bidderId);
    this.db.prepare('INSERT INTO offers(season_id, artifact_id, bidder_id, amount, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(this.w.season.id, artifactId, bidderId, amount, now, now + OFFER_HOURS * 3600000 / this.s.speedFactor);
  }
  resolveOffer(offerId: number, status: 'accepted' | 'rejected' | 'withdrawn' | 'expired' | 'cancelled', now: number) {
    const o = this.db.prepare("SELECT * FROM offers WHERE id = ? AND status = 'open'").get(offerId) as any; if (!o) return;
    this.db.prepare('UPDATE offers SET status = ?, resolved_at = ? WHERE id = ?').run(status, now, offerId);
    if (status === 'accepted') {
      const art = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(o.artifact_id) as any;
      this.db.prepare('UPDATE players SET blocked = blocked - ?, toman = toman - ? WHERE id = ?').run(o.amount, o.amount, o.bidder_id);
      this.db.prepare('UPDATE players SET toman = toman + ? WHERE id = ?').run(o.amount, art.owner_id);
      this.db.prepare("UPDATE artifacts SET owner_type = 'player', owner_id = ? WHERE id = ?").run(o.bidder_id, o.artifact_id);
      this.w.tx(o.bidder_id, 'artifact', -o.amount, 'خرید آرتیفکت', now); this.w.tx(art.owner_id, 'artifact', o.amount, 'فروش آرتیفکت', now);
      for (const other of this.db.prepare("SELECT id FROM offers WHERE artifact_id = ? AND status = 'open'").all(o.artifact_id) as any[]) this.resolveOffer(other.id, 'cancelled', now);
    } else {
      this.db.prepare('UPDATE players SET blocked = blocked - ? WHERE id = ?').run(o.amount, o.bidder_id);
    }
  }
  respondOffer(ownerId: number, offerId: number, accept: boolean, now: number) {
    const o = this.db.prepare("SELECT o.*, a.owner_id, a.owner_type FROM offers o JOIN artifacts a ON a.id = o.artifact_id WHERE o.id = ? AND o.status = 'open'").get(offerId) as any;
    if (!o) throw new GameError('پیشنهاد پیدا نشد', 404);
    if (o.owner_type !== 'player' || o.owner_id !== ownerId) throw new GameError('این پیشنهاد برای آرتیفکت شما نیست', 403);
    this.resolveOffer(offerId, accept ? 'accepted' : 'rejected', now);
  }
  withdrawOffer(bidderId: number, offerId: number, now: number) {
    const o = this.db.prepare("SELECT * FROM offers WHERE id = ? AND status = 'open'").get(offerId) as any;
    if (!o || o.bidder_id !== bidderId) throw new GameError('پیشنهاد پیدا نشد', 404);
    this.resolveOffer(offerId, 'withdrawn', now);
  }
  market(): any[] {
    const av = artifactValue(this.w.season.pool, this.s);
    return (this.db.prepare(`SELECT a.id, a.tomb_id, a.owner_id, p.name owner_name, t.name tomb_name, (SELECT COUNT(*) FROM offers o WHERE o.artifact_id = a.id AND o.status = 'open') open_offers
      FROM artifacts a JOIN players p ON p.id = a.owner_id JOIN tombs t ON t.season_id = a.season_id AND t.id = a.tomb_id
      WHERE a.season_id = ? AND a.owner_type = 'player' AND a.sold_at IS NULL ORDER BY a.id`).all(this.w.season.id) as any[]).map(r => ({ ...r, value: av }));
  }

  // ---------- تیکت ----------
  ticket(playerId: number, subject: string, body: string, now: number) {
    subject = subject.trim(); body = body.trim();
    if (subject.length < 3) throw new GameError('موضوع دست‌کم ۳ نویسه'); if (body.length < 10) throw new GameError('شرح دست‌کم ۱۰ نویسه');
    const open = (this.db.prepare("SELECT COUNT(*) c FROM tickets WHERE player_id = ? AND status = 'open'").get(playerId) as any).c as number;
    if (open >= C.SUPPORT_MAX_OPEN) throw new GameError(`هر بازیکن همزمان حداکثر ${C.SUPPORT_MAX_OPEN} تیکت باز دارد`);
    this.db.prepare('INSERT INTO tickets(player_id, subject, body, created_at) VALUES (?, ?, ?, ?)').run(playerId, subject, body, now);
  }
}
export { emptyUnits };
export type { UnitCounts };
