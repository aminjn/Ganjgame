// دنیای بازی روی سرور: فصل جاری، تنظیمات، زمین، بازیگران (بازیکن/کلن)، مالکیت خانه‌ها و قفل کوچ.
import type { DB } from '../db.js';
import { applyOverrides, type Settings } from '../../../src/rules/settings';
import { createTerrain, mapById, monsterPowerAt, tileKey, type TerrainGen } from '../../../src/rules/terrain';
import { placeInitialTombs, type Tomb } from '../../../src/rules/tombs';
import { generateCamp } from '../../../src/rules/camp';
import { emptyUnits, totalUnits, type UnitCounts } from '../../../src/rules/combat';
import { levelForXp } from '../../../src/rules/level';
import * as C from '../../../src/rules/constants';
import type { Terrain, UnitType } from '../../../src/rules/constants';

export type ActorType = 'player' | 'clan';
export interface ActorRef { type: ActorType; id: number }
export interface P { x: number; y: number }

export interface Actor {
  type: ActorType; id: number; name: string;
  units: UnitCounts; energy: number; energyAt: number;
  camp: P | null; pos: P | null; xp: number; coins: number; spentCoins: number; unitsBought: number;
  clanId: number | null;          // برای بازیکن: کلن عضو
  commanderId?: number;           // برای کلن
}
export interface SeasonRow {
  id: number; number: number; map_id: number; seed: number; started_at: number; started_by_admin: number; pool: number; players_joined: number;
  treasure_at: number | null; treasure_by_type: string | null; treasure_by_id: number | null; treasure_value: number | null; participation: string | null; report: string | null;
  ends_at: number | null; closed_at: number | null; tombs_revealed: number; settings_snapshot: string | null;
}
export interface TileRow { season_id: number; x: number; y: number; owner_type: ActorType; owner_id: number; guardian: UnitType | null; cost: number; at: number; terrain: Terrain }
export interface MigrationRow { season_id: number; actor_type: ActorType; actor_id: number; kind: 'single' | 'long' | 'free'; path: P[]; step: number; step_start: number; step_seconds: number; prepaid: number; from_x: number; from_y: number }

export class GameError extends Error { constructor(public reason: string, public code = 400) { super(reason); } }

export class World {
  settings!: Settings;
  season!: SeasonRow;
  gen!: TerrainGen;
  tombs: Tomb[] = [];
  locks = new Map<string, string>(); // tileKey → actorKey (خانه‌ای که کاروانی هم‌اکنون به آن می‌رود)
  constructor(public db: DB) {}

  // ---------- تنظیمات ----------
  loadSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as unknown as { key: string; value: number }[];
    const o: Record<string, number> = {}; for (const r of rows) o[r.key] = r.value;
    this.settings = applyOverrides(o);
    return o;
  }
  saveOverrides(o: Record<string, number>) {
    const del = this.db.prepare('DELETE FROM settings'); const ins = this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)');
    this.db.exec('BEGIN'); try { del.run(); for (const [k, v] of Object.entries(o)) ins.run(k, v); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  // ---------- فصل ----------
  boot(seed?: number) {
    this.loadSettings();
    const s = this.db.prepare('SELECT * FROM seasons ORDER BY id DESC LIMIT 1').get() as unknown as SeasonRow | undefined;
    if (!s) this.createSeason(false, seed);
    else this.useSeason(s);
  }
  private useSeason(s: SeasonRow) {
    this.season = s;
    // تنظیمات فصل از عکس ثبت‌شده در آغاز فصل (پنل در میانه‌ی فصل قفل است)
    if (s.settings_snapshot) this.settings = applyOverrides(JSON.parse(s.settings_snapshot));
    this.gen = createTerrain(mapById(s.map_id), this.settings.valleyBlock, this.settings.dangerBlob);
    this.tombs = (this.db.prepare('SELECT * FROM tombs WHERE season_id = ? ORDER BY id').all(s.id) as unknown as any[]).map(r => ({ id: r.id, name: r.name, x: r.x, y: r.y, captured: !!r.captured, capturedBy: r.captured_by_type ? `${r.captured_by_type}:${r.captured_by_id}` : undefined, capturedAt: r.captured_at ?? undefined }));
    this.locks.clear();
    for (const m of this.allMigrations()) { const p = m.path[m.step]; if (p) this.locks.set(tileKey(p.x, p.y), `${m.actor_type}:${m.actor_id}`); }
  }
  createSeason(byAdmin: boolean, fixedSeed?: number) {
    const overrides = this.loadSettings();
    const prev = this.db.prepare('SELECT number FROM seasons ORDER BY id DESC LIMIT 1').get() as unknown as { number: number } | undefined;
    const number = (prev?.number ?? 0) + 1;
    const seed = fixedSeed ?? (((Date.now() ^ (number * 7919)) & 0x7fffffff) >>> 0);
    const s = this.settings;
    const t = Date.now();
    const r = this.db.prepare('INSERT INTO seasons(number, map_id, seed, started_at, started_by_admin, settings_snapshot) VALUES (?, ?, ?, ?, ?, ?)').run(number, s.mapId, seed, t, byAdmin ? 1 : 0, JSON.stringify(overrides));
    const id = Number(r.lastInsertRowid);
    const gen = createTerrain(mapById(s.mapId), s.valleyBlock, s.dangerBlob);
    const tombs = placeInitialTombs(gen, seed, s.tombsVisible, s.tombMinDist, s.tombMaxDist, s.tombSpacing);
    const ins = this.db.prepare('INSERT INTO tombs(season_id, id, name, x, y) VALUES (?, ?, ?, ?, ?)');
    for (const tb of tombs) ins.run(id, tb.id, tb.name, tb.x, tb.y);
    this.db.prepare('UPDATE seasons SET tombs_revealed = ? WHERE id = ?').run(tombs.length, id);
    this.useSeason(this.db.prepare('SELECT * FROM seasons WHERE id = ?').get(id) as unknown as SeasonRow);
    return this.season;
  }
  refreshSeason() { this.season = this.db.prepare('SELECT * FROM seasons WHERE id = ?').get(this.season.id) as unknown as SeasonRow; }
  get closed() { return this.season.closed_at != null; }

  // ---------- زمین ----------
  tombAt(x: number, y: number): Tomb | undefined { return this.tombs.find(t => !t.captured && t.x === x && t.y === y); }
  terrainAt(x: number, y: number): Terrain { return this.tombAt(x, y) ? 'tomb' : this.gen.at(x, y); }
  monstersAt(x: number, y: number): number {
    const s = this.settings; const t = this.terrainAt(x, y);
    return monsterPowerAt(t, x, y, s.monsters, s.monsterScaleStart, s.monsterScaleDiv, s.hellMinMult, s.hellMaxMult);
  }
  tile(x: number, y: number): TileRow | undefined { return this.db.prepare('SELECT * FROM tiles WHERE season_id = ? AND x = ? AND y = ?').get(this.season.id, x, y) as unknown as TileRow | undefined; }
  tilesIn(minX: number, minY: number, maxX: number, maxY: number): TileRow[] {
    return this.db.prepare('SELECT * FROM tiles WHERE season_id = ? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?').all(this.season.id, minX, maxX, minY, maxY) as unknown as TileRow[];
  }
  tilesOf(ref: ActorRef): TileRow[] { return this.db.prepare('SELECT * FROM tiles WHERE season_id = ? AND owner_type = ? AND owner_id = ?').all(this.season.id, ref.type, ref.id) as unknown as TileRow[]; }

  // گروه مالکیت: بازیکن + کلنش + همه‌ی اعضای کلن (خانه‌هایشان از نظر قانون یکی است)
  groupOf(ref: ActorRef): { players: number[]; clan: number | null } {
    if (ref.type === 'clan') return { players: this.memberIds(ref.id), clan: ref.id };
    const p = this.db.prepare('SELECT clan_id FROM players WHERE id = ?').get(ref.id) as unknown as { clan_id: number | null } | undefined;
    if (p?.clan_id) return { players: this.memberIds(p.clan_id), clan: p.clan_id };
    return { players: [ref.id], clan: null };
  }
  memberIds(clanId: number): number[] { return (this.db.prepare('SELECT player_id FROM clan_members WHERE clan_id = ?').all(clanId) as unknown as { player_id: number }[]).map(r => r.player_id); }
  ownSet(ref: ActorRef): Set<string> {
    const g = this.groupOf(ref);
    const set = new Set<string>();
    const q = this.db.prepare('SELECT x, y FROM tiles WHERE season_id = ? AND owner_type = ? AND owner_id = ?');
    for (const pid of g.players) for (const r of q.all(this.season.id, 'player', pid) as unknown as P[]) set.add(tileKey(r.x, r.y));
    if (g.clan) for (const r of q.all(this.season.id, 'clan', g.clan) as unknown as P[]) set.add(tileKey(r.x, r.y));
    return set;
  }
  sameGroup(a: ActorRef, tileOwner: ActorRef): boolean {
    if (a.type === tileOwner.type && a.id === tileOwner.id) return true;
    const g = this.groupOf(a);
    if (tileOwner.type === 'clan') return g.clan === tileOwner.id;
    return g.players.includes(tileOwner.id);
  }
  territory(ref: ActorRef): P[] { const out: P[] = []; for (const k of this.ownSet(ref)) { const [x, y] = k.split(',').map(Number); out.push({ x, y }); } return out; }
  isLockedFor(x: number, y: number, ref: ActorRef): boolean { const l = this.locks.get(tileKey(x, y)); return !!l && l !== `${ref.type}:${ref.id}`; }

  // ---------- بازیگران ----------
  actor(ref: ActorRef): Actor {
    if (ref.type === 'player') {
      const r = this.db.prepare('SELECT * FROM players WHERE id = ?').get(ref.id) as unknown as any;
      if (!r) throw new GameError('بازیکن پیدا نشد', 404);
      return this.playerActor(r);
    }
    const r = this.db.prepare('SELECT * FROM clans WHERE id = ?').get(ref.id) as unknown as any;
    if (!r) throw new GameError('کلن پیدا نشد', 404);
    return { type: 'clan', id: r.id, name: r.name, units: { ...emptyUnits(), ...JSON.parse(r.units) }, energy: r.energy, energyAt: r.energy_at, camp: r.camp_x != null ? { x: r.camp_x, y: r.camp_y } : null, pos: r.pos_x != null ? { x: r.pos_x, y: r.pos_y } : null, xp: r.xp, coins: r.treasury, spentCoins: r.spent_coins, unitsBought: r.units_bought, clanId: r.id, commanderId: r.commander_id };
  }
  playerActor(r: any): Actor {
    return { type: 'player', id: r.id, name: r.name, units: { ...emptyUnits(), ...JSON.parse(r.units) }, energy: r.energy, energyAt: r.energy_at, camp: r.camp_x != null ? { x: r.camp_x, y: r.camp_y } : null, pos: r.pos_x != null ? { x: r.pos_x, y: r.pos_y } : null, xp: r.xp, coins: r.coins, spentCoins: r.spent_coins, unitsBought: r.units_bought, clanId: r.clan_id ?? null };
  }
  // انرژی لحظه‌ای: وقتی کاروان در راه نیست پر می‌شود (۰٫۹ واحد در ثانیه × ضریب سرعت)
  energyNow(a: Actor, now: number): number {
    if (this.migrationOf(a)) return a.energy;
    return Math.min(C.ENERGY_MAX, a.energy + this.settings.energyRegen * this.settings.speedFactor * Math.max(0, now - a.energyAt) / 1000);
  }
  saveActor(a: Actor, now: number, patch: Partial<{ energy: number; units: UnitCounts; pos: P | null; camp: P | null; xp: number; coins: number; spentCoins: number; unitsBought: number }>) {
    const units = patch.units ?? a.units; const pos = patch.pos === undefined ? a.pos : patch.pos; const camp = patch.camp === undefined ? a.camp : patch.camp;
    const energy = patch.energy ?? this.energyNow(a, now);
    const common = [JSON.stringify(units), energy, now, pos?.x ?? null, pos?.y ?? null, camp?.x ?? null, camp?.y ?? null, patch.xp ?? a.xp, patch.spentCoins ?? a.spentCoins, patch.unitsBought ?? a.unitsBought, patch.coins ?? a.coins, a.id];
    if (a.type === 'player') this.db.prepare('UPDATE players SET units=?, energy=?, energy_at=?, pos_x=?, pos_y=?, camp_x=?, camp_y=?, xp=?, spent_coins=?, units_bought=?, coins=? WHERE id=?').run(...common);
    else this.db.prepare('UPDATE clans SET units=?, energy=?, energy_at=?, pos_x=?, pos_y=?, camp_x=?, camp_y=?, xp=?, spent_coins=?, units_bought=?, treasury=? WHERE id=?').run(...common);
    Object.assign(a, { units, energy, energyAt: now, pos, camp, xp: patch.xp ?? a.xp, spentCoins: patch.spentCoins ?? a.spentCoins, unitsBought: patch.unitsBought ?? a.unitsBought, coins: patch.coins ?? a.coins });
  }
  addXp(a: Actor, xp: number, now: number) {
    this.saveActor(a, now, { xp: a.xp + xp });
    // تجربه‌ی کلن همیشه دست‌کم برابر بالاترین تجربه‌ی اعضاست
    if (a.type === 'player' && a.clanId) this.db.prepare('UPDATE clans SET xp = MAX(xp, ?) WHERE id = ?').run(a.xp, a.clanId);
  }
  level(a: Actor): number { return levelForXp(a.xp, this.settings.xpLevel2, this.settings.xpGrowth); }
  gateLevel(a: Actor): number {
    if (a.type === 'clan') return this.level(a);
    if (a.clanId) { const c = this.db.prepare('SELECT xp FROM clans WHERE id = ?').get(a.clanId) as unknown as { xp: number } | undefined; if (c) return levelForXp(Math.max(c.xp, a.xp), this.settings.xpLevel2, this.settings.xpGrowth); }
    return this.level(a);
  }
  artifacts(ref: ActorRef): { id: number; tomb_id: number; owner_type: ActorType; owner_id: number }[] {
    return this.db.prepare('SELECT id, tomb_id, owner_type, owner_id FROM artifacts WHERE season_id = ? AND owner_type = ? AND owner_id = ? AND sold_at IS NULL').all(this.season.id, ref.type, ref.id) as unknown as any[];
  }
  // آرتیفکت‌های به نام کلن برای شرط گنج به حساب هر عضو هم می‌آیند
  artifactCount(a: Actor): number {
    let n = this.artifacts(a).length;
    if (a.type === 'player' && a.clanId) n += this.artifacts({ type: 'clan', id: a.clanId }).length;
    return n;
  }
  freeUnits(a: Actor): number { return totalUnits(a.units); }

  // ---------- کوچ ----------
  migrationOf(ref: ActorRef): MigrationRow | undefined {
    const r = this.db.prepare('SELECT * FROM migrations WHERE season_id = ? AND actor_type = ? AND actor_id = ?').get(this.season.id, ref.type, ref.id) as unknown as any;
    return r ? { ...r, path: JSON.parse(r.path) } : undefined;
  }
  allMigrations(): MigrationRow[] { return (this.db.prepare('SELECT * FROM migrations WHERE season_id = ?').all(this.season.id) as unknown as any[]).map(r => ({ ...r, path: JSON.parse(r.path) })); }
  setLock(m: MigrationRow) { const p = m.path[m.step]; if (p) this.locks.set(tileKey(p.x, p.y), `${m.actor_type}:${m.actor_id}`); }
  clearLock(m: MigrationRow) { this.clearLocksOf({ type: m.actor_type, id: m.actor_id }); }
  clearLocksOf(ref: ActorRef) { const key = `${ref.type}:${ref.id}`; for (const [k, v] of this.locks) if (v === key) this.locks.delete(k); }
  // نقشه‌ی خانه‌های تصاحب‌شده در یک مربع (برای مسیریابی بدون پرس‌وجوی تک‌تک)
  tileMap(minX: number, minY: number, maxX: number, maxY: number): Map<string, TileRow> { const m = new Map<string, TileRow>(); for (const t of this.tilesIn(minX, minY, maxX, maxY)) m.set(tileKey(t.x, t.y), t); return m; }

  // ---------- کمپ اولیه ----------
  newCamp(seed: number): P {
    const taken = (x: number, y: number) => !!this.tile(x, y);
    return generateCamp(this.gen, seed, this.settings.campMinDist, taken);
  }

  // ---------- لاگ ----------
  log(ref: ActorRef, kind: string, text: string, now: number, tile?: P) {
    this.db.prepare('INSERT INTO logs(season_id, who_type, who_id, t, kind, text, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(this.season.id, ref.type, ref.id, now, kind, text, tile?.x ?? null, tile?.y ?? null);
  }
  tx(playerId: number, type: string, amount: number, note: string, now: number) {
    this.db.prepare('INSERT INTO transactions(player_id, t, type, amount, note) VALUES (?, ?, ?, ?, ?)').run(playerId, now, type, Math.round(amount), note);
  }
  nameOf(ref: ActorRef): string {
    const r = ref.type === 'player' ? this.db.prepare('SELECT name FROM players WHERE id = ?').get(ref.id) : this.db.prepare('SELECT name FROM clans WHERE id = ?').get(ref.id);
    return (r as any)?.name ?? '—';
  }
  playerRow(id: number): any { return this.db.prepare('SELECT * FROM players WHERE id = ?').get(id); }
  clanRow(id: number): any { return this.db.prepare('SELECT * FROM clans WHERE id = ?').get(id); }
}
