// وضعیت بازی و همه‌ی کنش‌ها. هیچ عددی که به بازیکن نشان داده می‌شود نباید از جای دیگری بیاید.
import * as C from './constants';
import type { Terrain, UnitType } from './constants';
import type { Settings } from './settings';
import { createTerrain, mapById, monsterPowerAt, tileKey, parseKey, neighbors8, isAdjacent, inMap, euclid, type TerrainGen } from './terrain';
import { placeInitialTombs, placeNextTomb, type Tomb } from './tombs';
import { generateCamp, isValidCamp } from './camp';
import { findPath, type P } from './path';
import { armyPower, armyLuck, computeLosses, captureXp, rollLoot, cheapestUnit, moveSeconds, totalUnits, emptyUnits, type UnitCounts, ALL_UNITS } from './combat';
import { levelForXp } from './level';
import { artifactValue, treasureValue, participationValue } from './economy';
import { Rng } from './rng';

export type ActorId = 'player' | 'clan';

export interface Actor {
  units: UnitCounts;
  energy: number;
  camp: P | null;
  pos: P | null;
  xp: number;
  artifacts: number[];
  spentCoins: number;
  unitsBought: number;
}

export interface Player extends Actor {
  name: string | null;
  ownerName: string;
  iban: string;
  toman: number;
  blocked: number;
  coins: number;
  inventory: { name: string; value: number; at: number }[];
  inClan: boolean;
}

export interface ClanMember { name: string; weight: number; joinedAt: number }
export interface Clan extends Actor {
  name: string;
  treasury: number;
  members: ClanMember[];
  commander: string;
  createdAt: number;
  memberCoins: number; // مجموع سکه‌ای که اعضا به کلن ریخته‌اند (برای گزارش)
}

export interface Owned { owner: ActorId; guardian: UnitType | null; cost: number; at: number; terrain: Terrain }

export interface Migration {
  actor: ActorId;
  kind: 'single' | 'long' | 'free';
  from: P;
  path: P[];
  step: number;
  stepStart: number;
  stepSeconds: number;
  prepaid: number;
}

export interface LogEntry { t: number; who: ActorId; text: string }
export interface Tx { t: number; type: 'deposit' | 'buy' | 'withdraw' | 'prize' | 'payout' | 'artifact'; amount: number; note: string }

export interface PrizeRow { title: string; winner: string | null; value: number; costLabel: string; cost: number; costToman: number; note?: string }
export interface Report { at: number; rows: PrizeRow[] }

export interface State {
  v: 1;
  season: number;
  mapId: number;
  seed: number;
  createdAt: number;
  startedByAdmin: boolean;
  player: Player;
  clan: Clan | null;
  control: ActorId;
  owned: Record<string, Owned>;
  tombs: Tomb[];
  migration: Migration | null;
  pool: number;
  treasure: null | { at: number; by: ActorId; value: number };
  participation: null | { tile: P | null; value: number; owner: string | null; reason: string; at: number };
  seasonEndsAt: number | null;
  seasonClosed: boolean;
  payout: null | { at: number; amount: number; toIban: boolean };
  report: Report | null;
  log: LogEntry[];
  tx: Tx[];
  playersJoined: number;
  lastTick: number;
  quit: boolean;
}

export type Result = { ok: true; msg?: string } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const OK: Result = { ok: true };

export interface Ctx { s: Settings; gen: TerrainGen; now: number; rng?: Rng }

// ---------- ساخت ----------

export function newActor(): Actor { return { units: emptyUnits(), energy: C.ENERGY_MAX, camp: null, pos: null, xp: 0, artifacts: [], spentCoins: 0, unitsBought: 0 }; }

export function newState(s: Settings, season: number, seed: number, now: number, keep?: { toman: number; iban: string; ownerName: string }, startedByAdmin = false): State {
  const gen = createTerrain(mapById(s.mapId), s.valleyBlock, s.dangerBlob);
  const tombs = placeInitialTombs(gen, seed, s.tombsVisible, s.tombMinDist, s.tombMaxDist, s.tombSpacing);
  const camp = generateCamp(gen, seed, s.campMinDist, () => false);
  const player: Player = {
    ...newActor(), name: null, ownerName: keep?.ownerName ?? '', iban: keep?.iban ?? '', toman: keep?.toman ?? 0, blocked: 0,
    coins: s.startCoins, inventory: [], inClan: false, camp, pos: camp,
  };
  const st: State = {
    v: 1, season, mapId: s.mapId, seed, createdAt: now, startedByAdmin, player, clan: null, control: 'player', owned: {},
    tombs, migration: null, pool: 0, treasure: null, participation: null, seasonEndsAt: null, seasonClosed: false, payout: null,
    report: null, log: [], tx: [], playersJoined: 0, lastTick: now, quit: false,
  };
  st.owned[tileKey(camp.x, camp.y)] = { owner: 'player', guardian: null, cost: 0, at: now, terrain: 'safe' };
  return st;
}

export function makeGen(st: State, s: Settings): TerrainGen { return createTerrain(mapById(st.mapId), s.valleyBlock, s.dangerBlob); }

// ---------- کمکی ----------

export function actorOf(st: State, id: ActorId): Actor { return id === 'clan' ? st.clan! : st.player; }
export function currentActor(st: State): Actor { return actorOf(st, st.control); }
export function actorName(st: State, id: ActorId): string { return id === 'clan' ? (st.clan?.name ?? 'کلن') : (st.player.name ?? 'بازیکن'); }

export function tombAt(st: State, x: number, y: number): Tomb | undefined { return st.tombs.find(t => !t.captured && t.x === x && t.y === y); }

// زمین یک خانه با در نظر گرفتن مقبره‌ها (مقبره‌ی کاوش‌شده نشانه‌اش را از دست می‌دهد و خانه‌اش عادی می‌شود)
export function terrainAt(st: State, gen: TerrainGen, x: number, y: number): Terrain {
  if (tombAt(st, x, y)) return 'tomb';
  return gen.at(x, y);
}

export function monstersAt(st: State, ctx: Ctx, x: number, y: number): number {
  const t = terrainAt(st, ctx.gen, x, y);
  return monsterPowerAt(t, x, y, ctx.s.monsters, ctx.s.monsterScaleStart, ctx.s.monsterScaleDiv, ctx.s.hellMinMult, ctx.s.hellMaxMult);
}

// خانه‌های تو، خانه‌های کلن و خانه‌های اعضا از نظر قانون یکی‌اند
export function isOwn(st: State, x: number, y: number): boolean {
  const o = st.owned[tileKey(x, y)];
  if (!o) return false;
  if (st.player.inClan && st.clan) return true;
  return o.owner === st.control;
}
export function ownerLabel(st: State, o: Owned): string { return o.owner === 'clan' ? (st.clan?.name ?? 'کلن') : (st.player.name ?? 'بازیکن'); }

export function territory(st: State): P[] { return Object.keys(st.owned).map(parseKey); }

export function levelOf(st: State, s: Settings, id: ActorId): number { return levelForXp(actorOf(st, id).xp, s.xpLevel2, s.xpGrowth); }
// سطح مؤثر برای دروازه‌ها: عضو کلن با سطح کلن سنجیده می‌شود
export function gateLevel(st: State, s: Settings, id: ActorId): number {
  if (st.clan && (id === 'clan' || st.player.inClan)) return levelOf(st, s, 'clan');
  return levelOf(st, s, id);
}
// آرتیفکت‌های به نام کلن برای شرط ورود به حساب هر عضو هم می‌آیند
export function artifactCount(st: State, id: ActorId): number {
  if (id === 'clan') return st.clan?.artifacts.length ?? 0;
  return st.player.artifacts.length + (st.player.inClan && st.clan ? st.clan.artifacts.length : 0);
}

export function coinsOf(st: State, id: ActorId): number { return id === 'clan' ? (st.clan?.treasury ?? 0) : st.player.coins; }
function spendCoins(st: State, id: ActorId, n: number) {
  if (id === 'clan') st.clan!.treasury -= n; else st.player.coins -= n;
  actorOf(st, id).spentCoins += n;
}

function log(st: State, who: ActorId, t: number, text: string) { st.log.unshift({ t, who, text }); if (st.log.length > 400) st.log.length = 400; }
function tx(st: State, t: number, type: Tx['type'], amount: number, note: string) { st.tx.unshift({ t, type, amount, note }); if (st.tx.length > 400) st.tx.length = 400; }

function syncClanXp(st: State) {
  // تجربه‌ی کلن همیشه دست‌کم برابر بالاترین تجربه‌ی اعضاست
  if (st.clan && st.player.inClan && st.player.xp > st.clan.xp) st.clan.xp = st.player.xp;
}

// ---------- ثبت‌نام و پول ----------

export function registerName(st: State, name: string, now: number): Result {
  name = name.trim();
  if (st.player.name) return fail('نام قبلاً ثبت شده است');
  if (name.length < 3 || name.length > 20) return fail('نام باید بین ۳ تا ۲۰ نویسه باشد');
  st.player.name = name;
  st.playersJoined += 1;
  log(st, 'player', now, `«${name}» به فصل ${st.season} پیوست.`);
  return OK;
}

export function deposit(st: State, amount: number, now: number): Result {
  if (!Number.isFinite(amount) || amount <= 0) return fail('مبلغ واریز معتبر نیست');
  st.player.toman += Math.floor(amount);
  tx(st, now, 'deposit', Math.floor(amount), 'واریز وجه');
  return OK;
}

export function buyCoins(st: State, s: Settings, n: number, now: number): Result {
  if (st.seasonClosed) return fail('فصل بسته شده است');
  if (!Number.isInteger(n) || n <= 0) return fail('تعداد سکه معتبر نیست');
  if (n > s.buyCoinsMax) return fail(`سقف خرید هر بار ${s.buyCoinsMax.toLocaleString('en-US')} سکه است`);
  const cost = n * s.coinToman;
  if (st.player.toman - st.player.blocked < cost) return fail('موجودی آزاد تومانی کافی نیست');
  st.player.toman -= cost;
  st.player.coins += n;
  st.pool += cost; // هر خرید سکه، استخر جایزه‌ی فصل را بزرگ می‌کند
  tx(st, now, 'buy', -cost, `خرید ${n} سکه`);
  log(st, 'player', now, `${n} سکه خرید.`);
  return OK;
}

export function setIban(st: State, iban: string, ownerName: string): Result {
  iban = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^IR\d{24}$/.test(iban)) return fail('شبا باید با IR شروع شود و ۲۴ رقم داشته باشد');
  if (ownerName.trim().length < 3) return fail('نام صاحب حساب لازم است');
  st.player.iban = iban; st.player.ownerName = ownerName.trim();
  return OK;
}

export function withdraw(st: State, s: Settings, amount: number, now: number): Result {
  if (!st.player.iban) return fail('برای برداشت باید شبا ثبت شده باشد');
  amount = Math.floor(amount);
  if (!Number.isFinite(amount) || amount < s.withdrawMin) return fail(`حداقل برداشت ${s.withdrawMin.toLocaleString('en-US')} تومان است`);
  const free = st.player.toman - st.player.blocked;
  if (amount > free) return fail('بیشتر از موجودی آزاد است');
  st.player.toman -= amount;
  tx(st, now, 'withdraw', -amount, `برداشت به ${st.player.iban}`);
  return OK;
}

// ---------- نیرو ----------

export function buyUnits(st: State, s: Settings, id: ActorId, type: UnitType, n: number, now: number): Result {
  if (st.seasonClosed) return fail('فصل بسته شده است');
  if (!Number.isInteger(n) || n <= 0) return fail('تعداد معتبر نیست');
  if (id === 'clan' && !st.clan) return fail('کلنی وجود ندارد');
  const cost = n * s.unitPrice[type];
  if (coinsOf(st, id) < cost) return fail('سکه کافی نیست');
  spendCoins(st, id, cost);
  const a = actorOf(st, id);
  a.units[type] += n; a.unitsBought += n;
  log(st, id, now, `${n} ${C.UNITS[type].name} خرید (${cost} سکه).`);
  return OK;
}

export function restCost(st: State, s: Settings, id: ActorId): number {
  const a = actorOf(st, id);
  return Math.ceil((C.ENERGY_MAX - a.energy) * totalUnits(a.units) * s.restCost * 100) / 100;
}

export function rest(st: State, s: Settings, id: ActorId, now: number): Result {
  const a = actorOf(st, id);
  if (a.energy >= C.ENERGY_MAX) return fail('انرژی کامل است');
  if (st.migration && st.migration.actor === id) return fail('کاروان در راه است');
  const cost = restCost(st, s, id);
  if (coinsOf(st, id) < cost) return fail('سکه کافی نیست');
  spendCoins(st, id, cost);
  a.energy = C.ENERGY_MAX;
  log(st, id, now, `استراحت فوری (${cost} سکه).`);
  return OK;
}

// ---------- کوچ ----------

export interface MovePlan {
  kind: 'single' | 'long' | 'free';
  path: P[];
  cost: number;
  steps: number;
  encounters: { count: number; totalPower: number; hardest: { x: number; y: number; power: number } | null };
  army: number;
  seconds: number;
}

function gateCheck(st: State, ctx: Ctx, id: ActorId, t: Terrain): string | null {
  const s = ctx.s;
  const lvl = gateLevel(st, s, id);
  const gates: Partial<Record<Terrain, number>> = { danger: s.gates.danger, tomb: s.gates.tomb, treasure: s.gates.treasure, hell: s.gates.treasure };
  const g = gates[t];
  if (g && lvl < g) return `ورود به ${C.TERRAIN[t].name} از سطح ${g} ممکن است (سطح تو ${lvl})`;
  if ((t === 'treasure' || t === 'hell') && artifactCount(st, id) < s.treasureArtifacts) return `ورود به ${C.TERRAIN[t].name} دست‌کم ${s.treasureArtifacts} آرتیفکت می‌خواهد`;
  return null;
}

export function planMove(st: State, ctx: Ctx, id: ActorId, target: P): { ok: true; plan: MovePlan } | { ok: false; reason: string } {
  const s = ctx.s;
  if (st.seasonClosed) return fail('فصل بسته شده و کوچ متوقف است');
  if (st.migration) return fail('کاروان در راه است');
  if (id === 'clan' && !st.clan) return fail('کلنی وجود ندارد');
  const a = actorOf(st, id);
  if (!a.camp || !a.pos) return fail(id === 'clan' ? 'تا کمپ کلن برپا نشود، کلن نمی‌تواند کوچ کند' : 'کمپ ندارید');
  if (!inMap(target.x, target.y)) return fail('بیرون نقشه');
  if (st.treasure && st.tombs.every(t => t.captured || st.owned[tileKey(t.x, t.y)]) && !tombAt(st, target.x, target.y)) {
    return fail('پس از فتح گنج فقط کوچ به مقبره‌های بی‌صاحب باز است');
  }
  const t = terrainAt(st, ctx.gen, target.x, target.y);
  if (t === 'valley') return fail('دره عبورناپذیر است');
  const units = totalUnits(a.units);
  const army = armyPower(a.units, a.energy, t, s);

  // سفر رایگان از مسیر خانه‌های خودی
  if (isOwn(st, target.x, target.y)) {
    if (target.x === a.pos.x && target.y === a.pos.y) return fail('کاروان همین‌جاست');
    const path = findPath(a.pos, target, (x, y) => (isOwn(st, x, y) ? 1 : Infinity), 400);
    if (!path) return fail('مسیر خودی پیوسته‌ای به این خانه نیست');
    return { ok: true, plan: { kind: 'free', path, cost: 0, steps: path.length, encounters: { count: 0, totalPower: 0, hardest: null }, army, seconds: path.length * 3 / s.speedFactor } };
  }

  if (units < C.MIN_FREE_UNITS_TO_CAPTURE) return fail(`برای تصاحب خانه‌ی تازه دست‌کم ${C.MIN_FREE_UNITS_TO_CAPTURE} نیروی آزاد لازم است (لشگر ${units} نفر)`);
  const secs = moveSeconds(a.units, s);

  // کوچ به خانه‌ی چسبیده
  const adjacentOwn = neighbors8(target.x, target.y).some(n => isOwn(st, n.x, n.y));
  if (adjacentOwn) {
    const g = gateCheck(st, ctx, id, t); if (g) return fail(g);
    const cost = s.supply[t];
    if (coinsOf(st, id) < cost) return fail(`تدارکات این کوچ ${cost} سکه است؛ سکه کافی نیست (${coinsOf(st, id)} سکه)`);
    const mp = monstersAt(st, ctx, target.x, target.y);
    // اگر کاروان چسبیده به مقصد نیست، اول رایگان تا خانه‌ی خودی مجاور می‌رود
    let prefix: P[] = [];
    if (!isAdjacent(a.pos, target)) {
      const own = neighbors8(target.x, target.y).filter(n => isOwn(st, n.x, n.y));
      let best: P[] | null = null;
      for (const o of own) { const p = findPath(a.pos, o, (x, y) => (isOwn(st, x, y) ? 1 : Infinity), 400); if (p && (!best || p.length < best.length)) best = p; }
      if (!best) return fail('مسیر خودی پیوسته‌ای تا این خانه نیست');
      prefix = best;
    }
    return { ok: true, plan: { kind: 'single', path: [...prefix, target], cost, steps: 1, encounters: { count: mp > 0 ? 1 : 0, totalPower: mp, hardest: mp > 0 ? { x: target.x, y: target.y, power: mp } : null }, army, seconds: secs + prefix.length * 3 / s.speedFactor } };
  }

  // کوچ بلند تا ۲۰ خانه با پیش‌پرداخت و ضریب ۱ + ۰٫۱ به‌ازای هر خانه‌ی مسیر
  const path = findPath(a.pos, target, (x, y) => {
    if (isOwn(st, x, y)) return 0.05;
    const tt = terrainAt(st, ctx.gen, x, y);
    if (tt === 'valley') return Infinity;
    return s.supply[tt] + monstersAt(st, ctx, x, y) / 50;
  }, s.longMoveMax + 200);
  if (!path) return fail('راهی به این خانه پیدا نشد');
  const newTiles = path.filter(p => !isOwn(st, p.x, p.y));
  if (newTiles.length > s.longMoveMax) return fail(`کوچ بلند حداکثر ${s.longMoveMax} خانه است (این مسیر ${newTiles.length} خانه‌ی تازه دارد)`);
  let sum = 0, count = 0, total = 0, hardest: MovePlan['encounters']['hardest'] = null;
  for (const p of newTiles) {
    const tt = terrainAt(st, ctx.gen, p.x, p.y);
    const g = gateCheck(st, ctx, id, tt); if (g) return fail(`در مسیر: ${g}`);
    sum += s.supply[tt];
    const mp = monstersAt(st, ctx, p.x, p.y);
    if (mp > 0) { count++; total += mp; if (!hardest || mp > hardest.power) hardest = { x: p.x, y: p.y, power: mp }; }
  }
  const cost = Math.ceil(sum * (1 + s.longMoveStep * newTiles.length));
  if (coinsOf(st, id) < cost) return fail(`پیش‌پرداخت این کوچ بلند ${cost} سکه است؛ سکه کافی نیست`);
  return { ok: true, plan: { kind: 'long', path, cost, steps: newTiles.length, encounters: { count, totalPower: total, hardest }, army, seconds: newTiles.length * secs + (path.length - newTiles.length) * 3 / s.speedFactor } };
}

export function startMove(st: State, ctx: Ctx, id: ActorId, target: P): Result {
  const r = planMove(st, ctx, id, target);
  if (!r.ok) return r;
  const plan = r.plan;
  const a = actorOf(st, id);
  if (plan.cost > 0) spendCoins(st, id, plan.cost);
  const first = plan.path[0];
  const firstOwn = isOwn(st, first.x, first.y);
  st.migration = {
    actor: id, kind: plan.kind, from: { ...a.pos! }, path: plan.path, step: 0, stepStart: ctx.now,
    stepSeconds: firstOwn ? 3 / ctx.s.speedFactor : moveSeconds(a.units, ctx.s), prepaid: plan.cost,
  };
  if (plan.kind === 'free') {
    const e = Math.min(C.ENERGY_PER_FREE_TRAVEL_MAX, plan.path.length * 2);
    a.energy = Math.max(0, a.energy - e);
  }
  log(st, id, ctx.now, plan.kind === 'free' ? `سفر رایگان به (${target.x}، ${target.y}).` : `کوچ ${plan.kind === 'long' ? 'بلند' : ''} به (${target.x}، ${target.y}) آغاز شد — تدارکات ${plan.cost} سکه.`);
  return OK;
}

export function cancelMove(st: State, now: number): Result {
  if (!st.migration) return fail('کوچی در جریان نیست');
  const id = st.migration.actor;
  st.migration = null; // کاروان همان‌جا می‌ماند، تدارکات برنمی‌گردد
  log(st, id, now, 'کوچ لغو شد؛ تدارکات پرداخت‌شده برنمی‌گردد.');
  return OK;
}

// ---------- تیک ----------

export interface Event { t: number; who: ActorId; kind: 'win' | 'lose' | 'move' | 'artifact' | 'treasure' | 'loot' | 'season' | 'info'; text: string; tile?: P }

export function tick(st: State, ctx: Ctx): Event[] {
  const events: Event[] = [];
  const s = ctx.s;
  const now = ctx.now;
  const dt = Math.max(0, Math.min(3600, (now - st.lastTick) / 1000));
  st.lastTick = now;

  // پر شدن انرژی وقتی کاروان در راه نیست
  for (const id of ['player', 'clan'] as ActorId[]) {
    const a = id === 'clan' ? st.clan : st.player;
    if (!a) continue;
    if (!(st.migration && st.migration.actor === id)) a.energy = Math.min(C.ENERGY_MAX, a.energy + s.energyRegen * s.speedFactor * dt);
  }

  // پیشرفت کوچ
  let guard = 0;
  while (st.migration && now >= st.migration.stepStart + st.migration.stepSeconds * 1000 && guard++ < 50) {
    const m = st.migration;
    const id = m.actor;
    const a = actorOf(st, id);
    const p = m.path[m.step];
    const rng = ctx.rng ?? new Rng((st.seed * 31 + m.step * 7 + Math.floor(now / 1000)) | 0);
    if (isOwn(st, p.x, p.y)) {
      a.pos = { ...p };
    } else {
      const t = terrainAt(st, ctx.gen, p.x, p.y);
      const mp = monstersAt(st, ctx, p.x, p.y);
      const army = armyPower(a.units, a.energy, t, s);
      const win = army >= mp / s.difficulty;
      const losses = computeLosses(a.units, mp, army, s, rng);
      for (const k of ALL_UNITS) a.units[k] -= losses.byType[k];
      a.energy = Math.max(0, a.energy - s.energyPerMove);
      const lossText = losses.total > 0 ? ` تلفات: ${losses.total} نیرو.` : '';
      if (!win || totalUnits(a.units) < 1) {
        // شکست: لشگر به کمپ برمی‌گردد، خانه تصاحب نمی‌شود
        a.pos = a.camp ? { ...a.camp } : a.pos;
        st.migration = null;
        const text = `شکست در (${p.x}، ${p.y}) — ${C.TERRAIN[t].name} با قدرت ${mp}؛ قدرت لشگر ${Math.round(army)}.${lossText} لشگر به کمپ برگشت.`;
        log(st, id, now, text); events.push({ t: now, who: id, kind: 'lose', text, tile: p });
        break;
      }
      // پیروزی: تصاحب و نگاهبان
      const guardian = cheapestUnit(a.units, s)!;
      a.units[guardian] -= 1;
      const tomb = tombAt(st, p.x, p.y);
      const tileCost = m.kind === 'long' ? Math.ceil(s.supply[t] * (1 + s.longMoveStep * m.path.filter(q => !isOwn(st, q.x, q.y)).length)) : m.prepaid;
      st.owned[tileKey(p.x, p.y)] = { owner: id, guardian, cost: tileCost, at: now, terrain: t };
      a.pos = { ...p };
      const xp = captureXp(t, mp, s);
      a.xp += xp; syncClanXp(st);
      let text = `(${p.x}، ${p.y}) ${C.TERRAIN[t].name} تصاحب شد؛ +${xp} تجربه.${lossText} نگاهبان: ${C.UNITS[guardian].name}.`;
      const loot = rollLoot(armyLuck(a.units, s), mp, s, rng);
      if (loot) {
        st.player.inventory.push({ ...loot, at: now });
        text += ` شیء پیدا شد: ${loot.name} (${loot.value} سکه).`;
        events.push({ t: now, who: id, kind: 'loot', text: `${loot.name} پیدا شد (ارزش ${loot.value} سکه).`, tile: p });
      }
      if (tomb) {
        tomb.captured = true; tomb.capturedBy = id; tomb.capturedAt = now;
        const owner: ActorId = st.player.inClan && st.clan ? 'clan' : id; // آرتیفکت پس از عضویت به نام کلن
        actorOf(st, owner).artifacts.push(tomb.id);
        text += ` آرتیفکت «${tomb.name}» به دست آمد.`;
        events.push({ t: now, who: id, kind: 'artifact', text: `آرتیفکت «${tomb.name}» به دست آمد.`, tile: p });
        const next = placeNextTomb(ctx.gen, st.seed, st.tombs, territory(st), (x, y) => !!st.owned[tileKey(x, y)], s.tombMinDist, s.tombMaxDist, s.tombSpacing);
        if (next) { st.tombs.push(next); text += ` مقبره‌ی تازه‌ای در (${next.x}، ${next.y}) پدیدار شد.`; }
      }
      if (t === 'treasure' && !st.treasure) captureTreasure(st, ctx, id, events);
      log(st, id, now, text); events.push({ t: now, who: id, kind: 'win', text, tile: p });
    }
    // قدم بعد
    m.step += 1;
    if (m.step >= m.path.length) {
      st.migration = null;
      events.push({ t: now, who: id, kind: 'move', text: 'کاروان به مقصد رسید.', tile: p });
    } else {
      const np = m.path[m.step];
      m.stepStart = m.stepStart + m.stepSeconds * 1000;
      m.stepSeconds = isOwn(st, np.x, np.y) ? 3 / s.speedFactor : moveSeconds(a.units, s);
      if (m.stepStart + m.stepSeconds * 1000 < now - 60000) m.stepStart = now; // جبران خواب طولانی
    }
  }

  if (st.seasonEndsAt && now >= st.seasonEndsAt && !st.seasonClosed) closeSeason(st, ctx, events);
  return events;
}

function shareWeights(st: State): { name: string; share: number }[] {
  if (!st.clan) return [];
  const total = st.clan.members.reduce((a, m) => a + m.weight, 0);
  if (total <= 0) return st.clan.members.map(m => ({ name: m.name, share: st.clan!.members.length === 1 ? 1 : 0 }));
  return st.clan.members.map(m => ({ name: m.name, share: m.weight / total }));
}

function payActor(st: State, id: ActorId, amount: number, now: number, note: string) {
  if (id === 'clan') {
    // خزانه‌ی کلن هیچ‌وقت پول ندارد — همان لحظه به نسبت سهم به کیف پول اعضا
    for (const w of shareWeights(st)) if (w.name === st.player.name) { const part = Math.floor(amount * w.share); st.player.toman += part; tx(st, now, 'prize', part, `${note} (سهم ${Math.round(w.share * 100)}٪ از کلن)`); }
  } else { st.player.toman += amount; tx(st, now, 'prize', amount, note); }
}

function captureTreasure(st: State, ctx: Ctx, id: ActorId, events: Event[]) {
  const s = ctx.s, now = ctx.now;
  const value = treasureValue(st.pool, s);
  st.treasure = { at: now, by: id, value };
  payActor(st, id, value, now, 'گنج اصلی');
  st.seasonEndsAt = now + s.seasonCloseHours * 3600 * 1000; // ۲۴ ساعت واقعی، مستقل از ضریب سرعت
  // جایزه‌ی مشارکت: روی یکی از خانه‌های تصاحب‌شده‌ای که مال برندگان نیست
  const winnerTiles = (x: number, y: number) => { const o = st.owned[tileKey(x, y)]; if (!o) return true; if (st.player.inClan && st.clan) return true; return o.owner === id; };
  const candidates = Object.keys(st.owned).map(parseKey).filter(p => !winnerTiles(p.x, p.y));
  const pv = participationValue(st.pool, s);
  if (candidates.length === 0) {
    st.participation = { tile: null, value: pv, owner: null, reason: 'همه‌ی خانه‌های تصاحب‌شده مال برندگان گنج است؛ جایزه‌ی مشارکت به هیچ‌کس تعلق نگرفت.', at: now };
  } else {
    const rng = new Rng(st.seed ^ 0x2545F491);
    const c = candidates[rng.int(candidates.length)];
    const o = st.owned[tileKey(c.x, c.y)];
    st.participation = { tile: c, value: pv, owner: ownerLabel(st, o), reason: '', at: now };
    payActor(st, o.owner, pv, now, 'جایزه‌ی مشارکت');
  }
  // گزارش گنج نهایی — عکس‌برداری در همین لحظه
  const rows: PrizeRow[] = [];
  const costRow = (who: ActorId) => who === 'clan'
    ? { costLabel: 'سکه‌ی هزینه‌شده‌ی اعضا', cost: st.clan?.memberCoins ?? 0 }
    : { costLabel: 'هزینه‌ی این بازیکن', cost: st.player.spentCoins };
  const c1 = costRow(id);
  rows.push({ title: 'گنج نهایی', winner: actorName(st, id), value, ...c1, costToman: c1.cost * s.coinToman });
  if (st.participation.tile) { const o = st.owned[tileKey(st.participation.tile.x, st.participation.tile.y)]; const c2 = costRow(o.owner); rows.push({ title: 'جایزه‌ی مشارکت', winner: st.participation.owner, value: pv, ...c2, costToman: c2.cost * s.coinToman }); }
  else rows.push({ title: 'جایزه‌ی مشارکت', winner: null, value: pv, costLabel: '', cost: 0, costToman: 0, note: st.participation.reason });
  for (const who of ['player', 'clan'] as ActorId[]) {
    const a = who === 'clan' ? st.clan : st.player; if (!a) continue;
    for (const tid of a.artifacts) { const c3 = costRow(who); rows.push({ title: `آرتیفکت «${st.tombs[tid]?.name ?? tid}»`, winner: actorName(st, who), value: artifactValue(st.pool, s), ...c3, costToman: c3.cost * s.coinToman }); }
  }
  st.report = { at: now, rows };
  const text = `گنج اصلی به دست «${actorName(st, id)}» افتاد — ${value.toLocaleString('en-US')} تومان. فصل ظرف ${s.seasonCloseHours} ساعت بسته می‌شود.`;
  log(st, id, now, text); events.push({ t: now, who: id, kind: 'treasure', text });
}

export function closeSeason(st: State, ctx: Ctx, events: Event[] = []) {
  const s = ctx.s, now = ctx.now;
  if (st.seasonClosed) return;
  st.seasonClosed = true;
  st.migration = null;
  // فروش خودکار آرتیفکت‌ها
  const av = artifactValue(st.pool, s);
  for (const who of ['player', 'clan'] as ActorId[]) {
    const a = who === 'clan' ? st.clan : st.player; if (!a) continue;
    for (const tid of a.artifacts) { payActor(st, who, av, now, `فروش پایان فصل آرتیفکت «${st.tombs[tid]?.name ?? tid}»`); }
  }
  // پیشنهادهای باز لغو و پول بلوکه آزاد
  st.player.blocked = 0;
  // واریز خودکار کل موجودی تومانی به شبا (بدون حداقل برداشت)
  if (st.player.iban && st.player.toman > 0) {
    const amt = st.player.toman; st.player.toman = 0;
    st.payout = { at: now, amount: amt, toIban: true };
    tx(st, now, 'payout', -amt, `واریز پایان فصل به ${st.player.iban}`);
  } else {
    st.payout = { at: now, amount: st.player.toman, toIban: false };
  }
  const text = 'فصل بسته شد: آرتیفکت‌ها فروخته و موجودی تسویه شد.';
  log(st, 'player', now, text); events.push({ t: now, who: 'player', kind: 'season', text });
}

// ---------- کلن ----------

export function createClan(st: State, s: Settings, name: string, now: number): Result {
  if (st.clan) return fail('قبلاً کلن دارید و خروج ممکن نیست');
  name = name.trim();
  if (name.length < 3 || name.length > 20) return fail('نام کلن باید بین ۳ تا ۲۰ نویسه باشد');
  if (!st.player.name) return fail('اول نام بازیکن را ثبت کنید');
  if (st.player.coins < s.clanCreateCost) return fail(`ساخت کلن ${s.clanCreateCost} سکه می‌خواهد`);
  spendCoins(st, 'player', s.clanCreateCost);
  // با پیوستن، خانه‌های بازیکن با کلن مشترک می‌شود؛ سهم = سکه‌ی تصاحب خانه‌هایی که با خود آورده
  let brought = 0;
  for (const o of Object.values(st.owned)) brought += o.cost;
  st.clan = { ...newActor(), name, treasury: 0, members: [{ name: st.player.name, weight: brought, joinedAt: now }], commander: st.player.name, createdAt: now, memberCoins: 0, xp: st.player.xp };
  st.player.inClan = true;
  log(st, 'player', now, `کلن «${name}» ساخته شد (${s.clanCreateCost} سکه).`);
  log(st, 'clan', now, `کلن «${name}» به دست «${st.player.name}» بنیان گذاشته شد.`);
  return OK;
}

function memberOf(st: State): ClanMember | null { return st.clan?.members.find(m => m.name === st.player.name) ?? null; }

export function clanDeposit(st: State, s: Settings, amount: number, now: number): Result {
  if (!st.clan) return fail('کلنی وجود ندارد');
  if (!Number.isInteger(amount) || amount <= 0) return fail('مبلغ معتبر نیست');
  if (st.player.coins < amount) return fail('سکه کافی نیست');
  st.player.coins -= amount; st.player.spentCoins += amount;
  st.clan.treasury += amount; st.clan.memberCoins += amount;
  memberOf(st)!.weight += amount;
  log(st, 'player', now, `${amount} سکه به خزانه‌ی کلن واریز شد.`);
  log(st, 'clan', now, `«${st.player.name}» ${amount} سکه به خزانه واریز کرد.`);
  return OK;
}

export function donateUnits(st: State, s: Settings, type: UnitType, n: number, now: number): Result {
  if (!st.clan) return fail('کلنی وجود ندارد');
  if (!Number.isInteger(n) || n <= 0) return fail('تعداد معتبر نیست');
  if (st.player.units[type] < n) return fail('این تعداد نیروی آزاد ندارید');
  if (st.migration && st.migration.actor === 'player') return fail('کاروان در راه است');
  st.player.units[type] -= n;
  // اهدا لحظه‌ای است: با همان نوع و همان انرژی (میانگین وزنی انرژی)
  const c = st.clan; const before = totalUnits(c.units);
  c.energy = before + n > 0 ? (c.energy * before + st.player.energy * n) / (before + n) : c.energy;
  c.units[type] += n; c.unitsBought += n;
  const coinsWorth = n * s.unitPrice[type];
  c.memberCoins += coinsWorth;
  memberOf(st)!.weight += coinsWorth;
  log(st, 'player', now, `${n} ${C.UNITS[type].name} به کلن اهدا شد.`);
  log(st, 'clan', now, `«${st.player.name}» ${n} ${C.UNITS[type].name} اهدا کرد.`);
  return OK;
}

export function setClanCamp(st: State, tile: P, now: number): Result {
  if (!st.clan) return fail('کلنی وجود ندارد');
  if (st.clan.camp) return fail('کمپ کلن یک‌بار تعیین می‌شود و جابجا نمی‌شود');
  if (st.clan.commander !== st.player.name) return fail('فقط فرمانده کمپ کلن را تعیین می‌کند');
  const o = st.owned[tileKey(tile.x, tile.y)];
  if (!o || o.owner !== 'player') return fail('کمپ کلن باید روی یکی از خانه‌های تصاحب‌شده‌ی خودِ فرمانده باشد');
  st.clan.camp = { ...tile }; st.clan.pos = { ...tile };
  log(st, 'clan', now, `کمپ کلن در (${tile.x}، ${tile.y}) برپا شد.`);
  return OK;
}

export function switchControl(st: State, id: ActorId): Result {
  if (id === 'clan') {
    if (!st.clan) return fail('کلنی وجود ندارد');
    if (st.clan.commander !== st.player.name) return fail('فقط فرمانده و ارشدها به اکانت کلن سوئیچ می‌کنند');
  }
  st.control = id;
  return OK;
}

export function clanShares(st: State) { return shareWeights(st); }

// ---------- انصراف ----------

export function quitSeason(st: State, s: Settings, now: number, startedByAdmin = false): State {
  // همه‌چیز پاک می‌شود؛ موجودی تومانی و شبا می‌ماند.
  const seed = (Math.floor(now / 1000) ^ (st.seed * 3)) >>> 0;
  return newState(s, st.season + 1, seed, now, { toman: st.player.toman, iban: st.player.iban, ownerName: st.player.ownerName }, startedByAdmin);
}

// آیا فصل عملاً شروع شده؟ (قفل پنل ادمین)
export function seasonInProgress(st: State): boolean {
  if (st.seasonClosed) return false;
  if (st.startedByAdmin) return true;
  return st.pool > 0 || Object.keys(st.owned).length > 1 || totalUnits(st.player.units) > 0 || st.player.xp > 0 || st.player.coins > 0 && st.player.spentCoins > 0;
}

// ---------- یکپارچگی ----------

export interface Check { name: string; ok: boolean; note: string }

export function sanitize(st: State, s: Settings, gen: TerrainGen): Check[] {
  const checks: Check[] = [];
  const fix = (name: string, bad: boolean, note: string, f: () => void) => { if (bad) f(); checks.push({ name, ok: !bad, note: bad ? `اصلاح شد: ${note}` : 'درست' }); };
  const p = st.player;
  fix('موجودی تومانی', p.toman < 0 || !Number.isFinite(p.toman), 'مقدار منفی', () => { p.toman = Math.max(0, p.toman || 0); });
  fix('سکه', p.coins < 0 || !Number.isFinite(p.coins), 'مقدار منفی', () => { p.coins = Math.max(0, p.coins || 0); });
  fix('پول بلوکه‌شده', p.blocked < 0 || p.blocked > p.toman, 'بیرون از بازه', () => { p.blocked = Math.max(0, Math.min(p.toman, p.blocked || 0)); });
  fix('تجربه', p.xp < 0, 'مقدار منفی', () => { p.xp = 0; });
  fix('انرژی', p.energy < 0 || p.energy > C.ENERGY_MAX, 'بیرون از بازه', () => { p.energy = Math.max(0, Math.min(C.ENERGY_MAX, p.energy || 0)); });
  for (const id of ['player', 'clan'] as ActorId[]) {
    const a = id === 'clan' ? st.clan : st.player; if (!a) continue;
    const guardians = Object.values(st.owned).filter(o => o.owner === id && o.guardian).length;
    const free = totalUnits(a.units);
    fix(`نیروی ${id === 'clan' ? 'کلن' : 'بازیکن'} بیشتر از خریداری‌شده`, free + guardians > a.unitsBought, 'کاهش به سقف خرید', () => {
      let excess = free + guardians - a.unitsBought;
      for (const k of ALL_UNITS) { const d = Math.min(excess, a.units[k]); a.units[k] -= d; excess -= d; }
    });
    for (const k of ALL_UNITS) if (a.units[k] < 0 || !Number.isFinite(a.units[k])) a.units[k] = 0;
  }
  const campOk = !!p.camp && isValidCamp(gen, p.camp.x, p.camp.y, s.campMinDist, () => false);
  fix('کمپ اولیه', !campOk, 'بازسازی با مولد بازی', () => {
    const c = generateCamp(gen, st.seed, s.campMinDist, (x, y) => { const o = st.owned[tileKey(x, y)]; return !!o && (o.at !== st.createdAt); });
    if (p.camp) delete st.owned[tileKey(p.camp.x, p.camp.y)];
    p.camp = c; if (!p.pos) p.pos = { ...c };
    st.owned[tileKey(c.x, c.y)] = { owner: 'player', guardian: null, cost: 0, at: st.createdAt, terrain: 'safe' };
  });
  fix('استخر جایزه', st.pool < 0, 'مقدار منفی', () => { st.pool = 0; });
  fix('تعداد مقبره‌ی نمایان', st.tombs.filter(t => !t.captured).length > s.tombsVisible, 'بیش از حد', () => { });
  fix('مجموع جایزه‌ها ≤ استخر', s.treasureShare + 10 * s.artifactShare + s.participationShare > 1 + 1e-9, 'تنظیمات نامعتبر', () => { });
  fix('موقعیت کاروان', !p.pos || !inMap(p.pos.x, p.pos.y), 'بازگشت به کمپ', () => { p.pos = p.camp ? { ...p.camp } : null; });
  checks.push({ name: 'امضای وضعیت', ok: true, note: 'در بارگذاری بررسی شد' });
  return checks;
}

// امضای ساده برای تشخیص دستکاری ذخیره‌سازی
export function sign(json: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let g = 0x9747b28c;
  for (let i = json.length - 1; i >= 0; i -= 7) { g = Math.imul(g ^ json.charCodeAt(i), 0x5bd1e995) >>> 0; }
  return h.toString(16) + '-' + g.toString(16);
}

export function serialize(st: State): string {
  const body = JSON.stringify(st);
  return JSON.stringify({ sig: sign(body), body });
}

export function deserialize(raw: string): { state: State | null; tampered: boolean } {
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o.body !== 'string') return { state: null, tampered: false };
    const tampered = sign(o.body) !== o.sig;
    const st = JSON.parse(o.body) as State;
    if (!st || st.v !== 1) return { state: null, tampered };
    return { state: st, tampered };
  } catch { return { state: null, tampered: false }; }
}

export function distFromCenter(p: P): number { return euclid(p.x, p.y); }
