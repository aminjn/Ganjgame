// موتور زمان سرور: پیشروی کاروان‌ها (جنگ، تلفات، تصاحب، نگاهبان، تجربه، شیء، مقبره و آرتیفکت، گنج)،
// انقضای پیشنهادها، انتخابات کلن‌ها و بستن فصل. همه‌ی قوانین از سند اول.
import { World, GameError, type Actor, type ActorRef, type P, type MigrationRow } from './world.js';
import { Actions } from './actions.js';
import * as C from '../../../src/rules/constants';
import { armyPower, computeLosses, cheapestUnit, captureXp, rollLoot, armyLuck, moveSeconds, totalUnits, ALL_UNITS } from '../../../src/rules/combat';
import { placeNextTomb } from '../../../src/rules/tombs';
import { artifactValue, treasureValue, participationValue } from '../../../src/rules/economy';
import { Rng } from '../../../src/rules/rng';
import { tileKey } from '../../../src/rules/terrain';

export type EventKind = 'win' | 'lose' | 'move' | 'artifact' | 'treasure' | 'loot' | 'season' | 'info' | 'tile' | 'tomb' | 'clan';
export interface GameEvent { t: number; who: ActorRef; kind: EventKind; text: string; tile?: P; data?: any }
export interface PrizeRow { title: string; winner: string | null; value: number; costLabel: string; cost: number; costToman: number; note?: string }

export class Engine {
  listeners: ((ev: GameEvent) => void)[] = [];
  constructor(public w: World, public a: Actions) {}
  get db() { return this.w.db; }
  get s() { return this.w.settings; }
  private emit(ev: GameEvent) { for (const l of this.listeners) { try { l(ev); } catch { /* شنونده نباید تیک را بشکند */ } } }

  // یک تیک کامل در یک تراکنش
  tick(now: number): GameEvent[] {
    const events: GameEvent[] = [];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.w.closed) {
        for (const m of this.w.allMigrations()) this.advance(m, now, events);
        this.expireOffers(now);
        this.elections(now, events);
        if (this.w.season.ends_at && now >= this.w.season.ends_at) this.closeSeason(now, events);
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    for (const ev of events) this.emit(ev);
    return events;
  }

  // ---------- پیشروی یک کاروان ----------
  private advance(m: MigrationRow, now: number, events: GameEvent[]) {
    const w = this.w, s = this.s;
    const ref: ActorRef = { type: m.actor_type, id: m.actor_id };
    let guard = 0;
    while (now >= m.step_start + m.step_seconds * 1000 && guard++ < 50) {
      const a = w.actor(ref);
      const p = m.path[m.step];
      if (!p) { this.endMigration(m, ref, now, events, 'کاروان به مقصد رسید.'); return; }
      const own = w.ownSet(ref);
      const isOwn = (x: number, y: number) => own.has(tileKey(x, y));
      if (isOwn(p.x, p.y)) {
        w.saveActor(a, now, { pos: { ...p }, energy: a.energy });
      } else {
        const other = w.tile(p.x, p.y);
        if (other || w.isLockedFor(p.x, p.y, ref)) {
          // در راه، کسی زودتر این خانه را گرفت/قفل کرد: کاروان همان‌جا می‌ایستد
          this.endMigration(m, ref, now, events, `مسیر در (${p.x}، ${p.y}) بسته شد — خانه پیش از رسیدن کاروان مال دیگری شد. کاروان همان‌جا ماند.`);
          return;
        }
        const t = w.terrainAt(p.x, p.y);
        const mp = w.monstersAt(p.x, p.y);
        const army = armyPower(a.units, a.energy, t, s);
        const win = army >= mp / s.difficulty;
        const rng = new Rng((w.season.seed * 31 + m.step * 7 + a.id * 131 + Math.floor(now / 1000)) | 0);
        const losses = computeLosses(a.units, mp, army, s, rng);
        const units = { ...a.units }; for (const k of ALL_UNITS) units[k] -= losses.byType[k];
        const energy = Math.max(0, a.energy - s.energyPerMove);
        const lossText = losses.total > 0 ? ` تلفات: ${losses.total} نیرو.` : '';
        if (!win || totalUnits(units) < 1) {
          w.saveActor(a, now, { units, energy, pos: a.camp ? { ...a.camp } : a.pos });
          const text = `شکست در (${p.x}، ${p.y}) — ${C.TERRAIN[t].name} با قدرت ${mp}؛ قدرت لشگر ${Math.round(army)}.${lossText} لشگر به کمپ برگشت.`;
          w.log(ref, 'lose', text, now, p);
          events.push({ t: now, who: ref, kind: 'lose', text, tile: p, data: { losses: losses.total, army: Math.round(army), monsters: mp } });
          this.dropMigration(m, ref);
          return;
        }
        const guardian = cheapestUnit(units, s)!;
        units[guardian] -= 1;
        const tomb = w.tombAt(p.x, p.y);
        const newCount = m.path.filter(q => !isOwn(q.x, q.y)).length;
        const tileCost = m.kind === 'long' ? Math.ceil(s.supply[t] * (1 + s.longMoveStep * newCount)) : m.prepaid;
        this.db.prepare('INSERT OR REPLACE INTO tiles(season_id, x, y, owner_type, owner_id, guardian, cost, at, terrain) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(w.season.id, p.x, p.y, ref.type, ref.id, guardian, tileCost, now, t);
        const xp = captureXp(t, mp, s);
        w.saveActor(a, now, { units, energy, pos: { ...p } });
        w.addXp(a, xp, now);
        let text = `(${p.x}، ${p.y}) ${C.TERRAIN[t].name} تصاحب شد؛ +${xp} تجربه.${lossText} نگاهبان: ${C.UNITS[guardian].name}.`;
        events.push({ t: now, who: ref, kind: 'tile', text: '', tile: p, data: { owner_type: ref.type, owner_id: ref.id, name: a.name, guardian, terrain: t } });
        const loot = rollLoot(armyLuck(units, s), mp, s, rng);
        if (loot) {
          this.db.prepare('INSERT INTO inventory(season_id, owner_type, owner_id, name, value, at) VALUES (?, ?, ?, ?, ?, ?)').run(w.season.id, ref.type, ref.id, loot.name, loot.value, now);
          text += ` شیء پیدا شد: ${loot.name} (${loot.value} سکه).`;
          events.push({ t: now, who: ref, kind: 'loot', text: `${loot.name} پیدا شد (ارزش ${loot.value} سکه).`, tile: p });
        }
        if (tomb) {
          const by: ActorRef = a.type === 'player' && a.clanId ? { type: 'clan', id: a.clanId } : ref; // آرتیفکت عضو کلن به نام کلن
          this.db.prepare('UPDATE tombs SET captured = 1, captured_by_type = ?, captured_by_id = ?, captured_at = ? WHERE season_id = ? AND id = ?').run(ref.type, ref.id, now, w.season.id, tomb.id);
          tomb.captured = true; tomb.capturedBy = `${ref.type}:${ref.id}`; tomb.capturedAt = now;
          this.db.prepare('INSERT INTO artifacts(season_id, tomb_id, owner_type, owner_id, acquired_at) VALUES (?, ?, ?, ?, ?)').run(w.season.id, tomb.id, by.type, by.id, now);
          text += ` آرتیفکت «${tomb.name}» به دست آمد.`;
          events.push({ t: now, who: ref, kind: 'artifact', text: `آرتیفکت «${tomb.name}» به دست آمد.`, tile: p, data: { tomb: tomb.id, owner: by } });
          if (by.type === 'clan') w.log(by, 'artifact', `آرتیفکت «${tomb.name}» به دست «${a.name}» برای کلن به دست آمد.`, now, p);
          const next = placeNextTomb(w.gen, w.season.seed, w.tombs, w.territory(ref), (x, y) => !!w.tile(x, y), s.tombMinDist, s.tombMaxDist, s.tombSpacing);
          if (next) {
            this.db.prepare('INSERT INTO tombs(season_id, id, name, x, y) VALUES (?, ?, ?, ?, ?)').run(w.season.id, next.id, next.name, next.x, next.y);
            this.db.prepare('UPDATE seasons SET tombs_revealed = tombs_revealed + 1 WHERE id = ?').run(w.season.id);
            w.tombs.push(next); w.refreshSeason();
            text += ` مقبره‌ی تازه‌ای در (${next.x}، ${next.y}) پدیدار شد.`;
            events.push({ t: now, who: ref, kind: 'tomb', text: `مقبره‌ی «${next.name}» پدیدار شد.`, tile: { x: next.x, y: next.y }, data: next });
          }
        }
        if (t === 'treasure' && !w.season.treasure_at) this.captureTreasure(ref, now, events);
        w.log(ref, 'win', text, now, p);
        events.push({ t: now, who: ref, kind: 'win', text, tile: p, data: { xp, losses: losses.total, guardian } });
      }
      // قدم بعد
      m.step += 1;
      if (m.step >= m.path.length) { this.endMigration(m, ref, now, events, 'کاروان به مقصد رسید.'); return; }
      const np = m.path[m.step];
      const ownNow = w.ownSet(ref);
      const a2 = w.actor(ref);
      m.step_start = m.step_start + m.step_seconds * 1000;
      m.step_seconds = ownNow.has(tileKey(np.x, np.y)) ? 3 / s.speedFactor : moveSeconds(a2.units, s);
      if (m.step_start + m.step_seconds * 1000 < now - 60000) m.step_start = now; // جبران توقف طولانی سرور
      // قفل خانه‌ی بعدی (اگر خودی نیست)
      w.locks.delete(tileKey(p.x, p.y));
      if (!ownNow.has(tileKey(np.x, np.y))) {
        if (w.tile(np.x, np.y) || w.isLockedFor(np.x, np.y, ref)) { this.endMigration(m, ref, now, events, `مسیر در (${np.x}، ${np.y}) بسته شد — خانه مال دیگری شد. کاروان همان‌جا ماند.`); return; }
        w.locks.set(tileKey(np.x, np.y), `${ref.type}:${ref.id}`);
      }
      this.db.prepare('UPDATE migrations SET step = ?, step_start = ?, step_seconds = ? WHERE season_id = ? AND actor_type = ? AND actor_id = ?').run(m.step, m.step_start, m.step_seconds, w.season.id, ref.type, ref.id);
      if (w.closed) return;
    }
  }
  private dropMigration(m: MigrationRow, ref: ActorRef) {
    this.w.clearLock(m);
    this.db.prepare('DELETE FROM migrations WHERE season_id = ? AND actor_type = ? AND actor_id = ?').run(this.w.season.id, ref.type, ref.id);
  }
  private endMigration(m: MigrationRow, ref: ActorRef, now: number, events: GameEvent[], text: string) {
    this.dropMigration(m, ref);
    const a = this.w.actor(ref); this.w.saveActor(a, now, { energy: a.energy }); // انرژی از این لحظه پر می‌شود
    events.push({ t: now, who: ref, kind: 'move', text, tile: a.pos ?? undefined });
  }

  // ---------- پرداخت جایزه ----------
  // خزانه‌ی کلن هیچ‌وقت پول ندارد: همان لحظه به نسبت سهم به کیف پول اعضا
  pay(ref: ActorRef, amount: number, note: string, now: number): { playerId: number; amount: number }[] {
    const out: { playerId: number; amount: number }[] = [];
    if (ref.type === 'clan') {
      for (const sh of this.a.clanShares(ref.id)) {
        const part = Math.floor(amount * sh.share); if (part <= 0) continue;
        this.a.creditToman(sh.playerId, part, `${note} (سهم ${Math.round(sh.share * 100)}٪ از کلن)`, now, 'prize');
        out.push({ playerId: sh.playerId, amount: part });
      }
      this.w.log(ref, 'treasure', `${note}: ${amount.toLocaleString('en-US')} تومان بین اعضا به نسبت سهم تقسیم شد.`, now);
    } else {
      this.a.creditToman(ref.id, amount, note, now, 'prize');
      out.push({ playerId: ref.id, amount });
    }
    return out;
  }
  private costRow(ref: ActorRef): { costLabel: string; cost: number } {
    if (ref.type === 'clan') return { costLabel: 'سکه‌ی هزینه‌شده‌ی اعضا', cost: this.w.clanRow(ref.id)?.member_coins ?? 0 };
    return { costLabel: 'هزینه‌ی این بازیکن', cost: this.w.playerRow(ref.id)?.spent_coins ?? 0 };
  }

  // ---------- گنج اصلی ----------
  captureTreasure(ref: ActorRef, now: number, events: GameEvent[]) {
    const w = this.w, s = this.s;
    w.refreshSeason();
    const pool = w.season.pool;
    const value = treasureValue(pool, s);
    const endsAt = now + s.seasonCloseHours * 3600 * 1000; // ۲۴ ساعت واقعی، مستقل از ضریب سرعت
    this.pay(ref, value, 'گنج اصلی', now);
    // جایزه‌ی مشارکت: یکی از خانه‌های تصاحب‌شده که مال برندگان (بازیکن + کلنش + اعضای کلن) نیست
    const g = w.groupOf(ref);
    const all = this.db.prepare('SELECT x, y, owner_type, owner_id FROM tiles WHERE season_id = ? ORDER BY x, y').all(w.season.id) as unknown as { x: number; y: number; owner_type: 'player' | 'clan'; owner_id: number }[];
    const candidates = all.filter(t => !(t.owner_type === 'clan' ? g.clan === t.owner_id : g.players.includes(t.owner_id)));
    const pv = participationValue(pool, s);
    let participation: any;
    if (candidates.length === 0) participation = { tile: null, value: pv, owner: null, reason: 'همه‌ی خانه‌های تصاحب‌شده مال برندگان گنج است؛ جایزه‌ی مشارکت به هیچ‌کس تعلق نگرفت.', at: now };
    else {
      const rng = new Rng(w.season.seed ^ 0x2545F491);
      const c = candidates[rng.int(candidates.length)];
      const oref: ActorRef = { type: c.owner_type, id: c.owner_id };
      participation = { tile: { x: c.x, y: c.y }, value: pv, owner: w.nameOf(oref), ownerRef: oref, reason: '', at: now };
      this.pay(oref, pv, 'جایزه‌ی مشارکت', now);
      events.push({ t: now, who: oref, kind: 'treasure', text: `جایزه‌ی مشارکت (${pv.toLocaleString('en-US')} تومان) روی خانه‌ی (${c.x}، ${c.y}) شما نشست.`, tile: { x: c.x, y: c.y } });
    }
    // گزارش
    const rows: PrizeRow[] = [];
    const c1 = this.costRow(ref);
    rows.push({ title: 'گنج نهایی', winner: w.nameOf(ref), value, ...c1, costToman: c1.cost * s.coinToman });
    if (participation.tile) { const c2 = this.costRow(participation.ownerRef); rows.push({ title: 'جایزه‌ی مشارکت', winner: participation.owner, value: pv, ...c2, costToman: c2.cost * s.coinToman }); }
    else rows.push({ title: 'جایزه‌ی مشارکت', winner: null, value: pv, costLabel: '', cost: 0, costToman: 0, note: participation.reason });
    const arts = this.db.prepare('SELECT a.tomb_id, a.owner_type, a.owner_id, t.name FROM artifacts a JOIN tombs t ON t.season_id = a.season_id AND t.id = a.tomb_id WHERE a.season_id = ? AND a.sold_at IS NULL ORDER BY a.id').all(w.season.id) as unknown as any[];
    for (const ar of arts) { const oref: ActorRef = { type: ar.owner_type, id: ar.owner_id }; const c3 = this.costRow(oref); rows.push({ title: `آرتیفکت «${ar.name}»`, winner: w.nameOf(oref), value: artifactValue(pool, s), ...c3, costToman: c3.cost * s.coinToman }); }
    this.db.prepare('UPDATE seasons SET treasure_at = ?, treasure_by_type = ?, treasure_by_id = ?, treasure_value = ?, participation = ?, report = ?, ends_at = ? WHERE id = ?')
      .run(now, ref.type, ref.id, value, JSON.stringify(participation), JSON.stringify({ at: now, rows }), endsAt, w.season.id);
    w.refreshSeason();
    const text = `گنج اصلی به دست «${w.nameOf(ref)}» افتاد — ${value.toLocaleString('en-US')} تومان. فصل ظرف ${s.seasonCloseHours} ساعت بسته می‌شود.`;
    w.log(ref, 'treasure', text, now);
    events.push({ t: now, who: ref, kind: 'treasure', text, data: { broadcast: true, value, winner: w.nameOf(ref), endsAt } });
  }

  // ---------- بستن فصل ----------
  closeSeason(now: number, events: GameEvent[] = []) {
    const w = this.w, s = this.s;
    if (w.closed) return;
    w.refreshSeason();
    // کوچ‌ها متوقف
    this.db.prepare('DELETE FROM migrations WHERE season_id = ?').run(w.season.id); w.locks.clear();
    // فروش خودکار آرتیفکت‌ها
    const av = artifactValue(w.season.pool, s);
    const arts = this.db.prepare('SELECT a.id, a.tomb_id, a.owner_type, a.owner_id, t.name FROM artifacts a JOIN tombs t ON t.season_id = a.season_id AND t.id = a.tomb_id WHERE a.season_id = ? AND a.sold_at IS NULL').all(w.season.id) as unknown as any[];
    for (const ar of arts) {
      this.pay({ type: ar.owner_type, id: ar.owner_id }, av, `فروش پایان فصل آرتیفکت «${ar.name}»`, now);
      this.db.prepare('UPDATE artifacts SET sold_at = ?, sold_for = ? WHERE id = ?').run(now, av, ar.id);
    }
    // پیشنهادهای باز لغو و پول بلوکه آزاد
    for (const o of this.db.prepare("SELECT id FROM offers WHERE season_id = ? AND status = 'open'").all(w.season.id) as unknown as { id: number }[]) this.a.resolveOffer(o.id, 'cancelled', now);
    // واریز خودکار کل موجودی تومانی به شبا (بدون حداقل برداشت)؛ بی‌شبا در کیف پول می‌ماند
    const players = this.db.prepare('SELECT id, name, toman, iban, owner_name FROM players WHERE season_id = ?').all(w.season.id) as unknown as any[];
    for (const p of players) {
      if (p.iban && p.toman > 0) {
        this.db.prepare('UPDATE players SET toman = 0 WHERE id = ?').run(p.id);
        this.db.prepare("INSERT INTO withdrawals(player_id, amount, iban, owner_name, created_at, kind) VALUES (?, ?, ?, ?, ?, 'payout')").run(p.id, p.toman, p.iban, p.owner_name, now);
        w.tx(p.id, 'payout', -p.toman, `واریز پایان فصل به ${p.iban}`, now);
      }
      w.log({ type: 'player', id: p.id }, 'season', 'فصل بسته شد: آرتیفکت‌ها فروخته و موجودی تسویه شد.', now);
    }
    this.db.prepare('UPDATE seasons SET closed_at = ? WHERE id = ?').run(now, w.season.id);
    w.refreshSeason();
    events.push({ t: now, who: { type: 'player', id: 0 }, kind: 'season', text: 'فصل بسته شد: آرتیفکت‌ها فروخته و موجودی تسویه شد.', data: { broadcast: true, closed: true } });
  }

  // ---------- پیشنهادها ----------
  private expireOffers(now: number) {
    for (const o of this.db.prepare("SELECT id FROM offers WHERE season_id = ? AND status = 'open' AND expires_at <= ?").all(this.w.season.id, now) as unknown as { id: number }[]) this.a.resolveOffer(o.id, 'expired', now);
  }

  // ---------- انتخابات کلن ----------
  // هر دوره (electionDays) رأی‌های دوره‌ی قبل با وزن سهم شمرده می‌شود: نفر اول فرمانده، بعدی‌ها ارشد (به نسبت تعداد اعضا).
  elections(now: number, events: GameEvent[]) {
    const clans = this.db.prepare('SELECT id, name, created_at, election_period, commander_id FROM clans WHERE season_id = ?').all(this.w.season.id) as unknown as any[];
    for (const c of clans) {
      const period = this.a.electionPeriod(c, now);
      if (period <= c.election_period) continue;
      const tallied = period - 1;
      const shares = this.a.clanShares(c.id);
      const weight = new Map(shares.map(sh => [sh.playerId, sh.weight]));
      const votes = this.db.prepare('SELECT voter_id, candidate_id FROM clan_votes WHERE clan_id = ? AND period = ?').all(c.id, tallied) as unknown as { voter_id: number; candidate_id: number }[];
      const score = new Map<number, number>();
      for (const v of votes) { if (!weight.has(v.candidate_id)) continue; score.set(v.candidate_id, (score.get(v.candidate_id) ?? 0) + (weight.get(v.voter_id) ?? 0) + 1e-6); }
      if (score.size > 0) {
        const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
        const commander = ranked[0];
        const elders = ranked.slice(1, 1 + elderCount(shares.length));
        this.db.prepare("UPDATE clan_members SET role = 'member' WHERE clan_id = ?").run(c.id);
        this.db.prepare("UPDATE clan_members SET role = 'commander' WHERE clan_id = ? AND player_id = ?").run(c.id, commander);
        for (const e of elders) this.db.prepare("UPDATE clan_members SET role = 'elder' WHERE clan_id = ? AND player_id = ?").run(c.id, e);
        this.db.prepare('UPDATE clans SET commander_id = ? WHERE id = ?').run(commander, c.id);
        // کسی که دیگر افسر نیست نمی‌تواند در کنترل کلن بماند
        this.db.prepare("UPDATE players SET control = 'player' WHERE clan_id = ? AND id NOT IN (SELECT player_id FROM clan_members WHERE clan_id = ? AND role IN ('commander','elder'))").run(c.id, c.id);
        const text = `انتخابات دوره‌ی ${tallied + 1}: فرمانده «${this.w.nameOf({ type: 'player', id: commander })}»${elders.length ? '، ارشدها: ' + elders.map(e => `«${this.w.nameOf({ type: 'player', id: e })}»`).join('، ') : ''}.`;
        this.w.log({ type: 'clan', id: c.id }, 'clan', text, now);
        events.push({ t: now, who: { type: 'clan', id: c.id }, kind: 'clan', text });
      }
      this.db.prepare('UPDATE clans SET election_period = ? WHERE id = ?').run(period, c.id);
      this.db.prepare('DELETE FROM clan_votes WHERE clan_id = ? AND period < ?').run(c.id, period);
    }
  }
}

// تعداد ارشد بر اساس تعداد اعضا: ۱ تا ۹ عضو → ۱، ۱۰ تا ۲۹ → ۲، ۳۰ تا ۵۹ → ۳، ۶۰+ → ۵
export function elderCount(members: number): number { return members < 10 ? 1 : members < 30 ? 2 : members < 60 ? 3 : 5; }
export { GameError, type Actor };
