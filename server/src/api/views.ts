// ساخت پاسخ‌های خواندنی برای کلاینت: وضعیت شخصی، ناحیه‌ی نقشه، فصل، رتبه‌بندی.
import { World, type ActorRef, type Actor, type P } from '../game/world.js';
import { Actions } from '../game/actions.js';
import { levelForXp, xpProgress } from '../../../src/rules/level';
import { artifactValue, treasureValue, participationValue } from '../../../src/rules/economy';
import { armyPower, moveSeconds, totalUnits } from '../../../src/rules/combat';
import { mapById } from '../../../src/rules/terrain';
import { tileKey } from '../../../src/rules/terrain';

export class Views {
  constructor(public w: World, public a: Actions) {}
  get db() { return this.w.db; }
  get s() { return this.w.settings; }

  actorView(a: Actor, now: number) {
    const w = this.w;
    const m = w.migrationOf(a);
    const energy = w.energyNow(a, now);
    const arts = w.artifacts(a).map(r => ({ id: r.id, tombId: r.tomb_id, name: w.tombs[r.tomb_id]?.name ?? String(r.tomb_id) }));
    const tiles = (this.db.prepare('SELECT COUNT(*) c FROM tiles WHERE season_id = ? AND owner_type = ? AND owner_id = ?').get(w.season.id, a.type, a.id) as any).c as number;
    return {
      type: a.type, id: a.id, name: a.name, units: a.units, freeUnits: totalUnits(a.units), energy, coins: a.coins, xp: a.xp,
      level: w.level(a), gateLevel: w.gateLevel(a), progress: xpProgress(a.xp, this.s.xpLevel2, this.s.xpGrowth),
      camp: a.camp, pos: a.pos, spentCoins: a.spentCoins, unitsBought: a.unitsBought, tiles, artifacts: arts, artifactCount: w.artifactCount(a),
      power: armyPower(a.units, energy, null, this.s), moveSeconds: moveSeconds(a.units, this.s), restCost: this.a.restCost(a, now),
      migration: m ? { kind: m.kind, path: m.path, step: m.step, stepStart: m.step_start, stepSeconds: m.step_seconds, from: { x: m.from_x, y: m.from_y }, eta: m.step_start + m.step_seconds * 1000 } : null,
      inventory: this.db.prepare('SELECT name, value, at FROM inventory WHERE season_id = ? AND owner_type = ? AND owner_id = ? ORDER BY id DESC LIMIT 100').all(w.season.id, a.type, a.id),
      log: this.db.prepare('SELECT t, kind, text, x, y FROM logs WHERE season_id = ? AND who_type = ? AND who_id = ? ORDER BY id DESC LIMIT 120').all(w.season.id, a.type, a.id),
    };
  }

  me(playerId: number, now: number) {
    const w = this.w;
    const p = w.playerRow(playerId);
    const inSeason = p.season_id === w.season.id && !p.quit;
    const player = inSeason ? this.actorView(w.playerActor(p), now) : null;
    let clan: any = null;
    if (inSeason && p.clan_id) {
      const c = w.clanRow(p.clan_id);
      const ca = w.actor({ type: 'clan', id: c.id });
      const role = (this.db.prepare('SELECT role FROM clan_members WHERE clan_id = ? AND player_id = ?').get(c.id, playerId) as any)?.role ?? 'member';
      const officer = role === 'commander' || role === 'elder';
      const period = this.a.electionPeriod(c, now);
      clan = {
        ...this.actorView(ca, now), role, officer, commanderId: c.commander_id, memberCoins: c.member_coins, createdAt: c.created_at,
        members: this.a.clanShares(c.id), electionPeriod: period, nextElection: c.created_at + (period + 1) * this.s.electionDays * 86400000,
        myVote: (this.db.prepare('SELECT candidate_id FROM clan_votes WHERE clan_id = ? AND voter_id = ? AND period = ?').get(c.id, playerId, period) as any)?.candidate_id ?? null,
        requests: officer ? this.db.prepare("SELECT r.id, r.player_id, p.name, r.created_at FROM clan_requests r JOIN players p ON p.id = r.player_id WHERE r.clan_id = ? AND r.status = 'open' ORDER BY r.id").all(c.id) : [],
        chat: this.db.prepare('SELECT c.id, c.player_id, p.name, c.t, c.text FROM clan_chat c JOIN players p ON p.id = c.player_id WHERE c.clan_id = ? ORDER BY c.id DESC LIMIT 60').all(c.id).reverse(),
      };
    }
    const myRequests = inSeason ? this.db.prepare("SELECT r.id, r.clan_id, c.name, r.status FROM clan_requests r JOIN clans c ON c.id = r.clan_id WHERE r.player_id = ? AND r.status = 'open'").all(playerId) : [];
    return {
      account: { id: p.id, name: p.name, toman: p.toman, blocked: p.blocked, iban: p.iban, ownerName: p.owner_name, control: p.control, inSeason, quit: !!p.quit, clanId: inSeason ? p.clan_id : null },
      player, clan, myRequests,
      tx: this.db.prepare('SELECT t, type, amount, note FROM transactions WHERE player_id = ? ORDER BY id DESC LIMIT 100').all(playerId),
      tickets: this.db.prepare('SELECT id, subject, body, status, created_at, reply, replied_at FROM tickets WHERE player_id = ? ORDER BY id DESC LIMIT 20').all(playerId),
      withdrawals: this.db.prepare('SELECT id, amount, status, created_at, processed_at, note, kind FROM withdrawals WHERE player_id = ? ORDER BY id DESC LIMIT 20').all(playerId),
      deposits: this.db.prepare("SELECT id, amount, gateway, status, created_at FROM deposits WHERE player_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 5").all(playerId),
      offersMade: inSeason ? this.db.prepare("SELECT o.id, o.artifact_id, o.amount, o.status, o.created_at, o.expires_at, t.name tomb_name, p.name owner_name FROM offers o JOIN artifacts a ON a.id = o.artifact_id JOIN tombs t ON t.season_id = a.season_id AND t.id = a.tomb_id JOIN players p ON p.id = a.owner_id WHERE o.bidder_id = ? AND o.season_id = ? ORDER BY o.id DESC LIMIT 30").all(playerId, w.season.id) : [],
      offersReceived: inSeason ? this.db.prepare("SELECT o.id, o.artifact_id, o.amount, o.status, o.created_at, o.expires_at, t.name tomb_name, p.name bidder_name FROM offers o JOIN artifacts a ON a.id = o.artifact_id JOIN tombs t ON t.season_id = a.season_id AND t.id = a.tomb_id JOIN players p ON p.id = o.bidder_id WHERE a.owner_type = 'player' AND a.owner_id = ? AND o.season_id = ? AND o.status = 'open' ORDER BY o.id DESC").all(playerId, w.season.id) : [],
      season: this.season(),
      settings: this.publicSettings(),
      now,
    };
  }

  publicSettings() {
    const s = this.s;
    return { supply: s.supply, monsters: s.monsters, gates: s.gates, treasureArtifacts: s.treasureArtifacts, unitPrice: s.unitPrice, unitPower: s.unitPower, explorerLuck: s.explorerLuck, terrainBonus: s.terrainBonus,
      energyPerMove: s.energyPerMove, energyRegen: s.energyRegen, restCost: s.restCost, guidesForHalf: s.guidesForHalf, longMoveMax: s.longMoveMax, longMoveStep: s.longMoveStep,
      xpBase: s.xpBase, xpMonsterDiv: s.xpMonsterDiv, xpTomb: s.xpTomb, xpTreasure: s.xpTreasure, xpLevel2: s.xpLevel2, xpGrowth: s.xpGrowth, lootBase: s.lootBase, lootLuckDiv: s.lootLuckDiv, lootMax: s.lootMax,
      coinToman: s.coinToman, buyCoinsMax: s.buyCoinsMax, withdrawMin: s.withdrawMin, artifactShare: s.artifactShare, treasureShare: s.treasureShare, treasureFloor: s.treasureFloor, participationShare: s.participationShare,
      offerMin: s.offerMin, seasonCloseHours: s.seasonCloseHours, clanCreateCost: s.clanCreateCost, clanMaxMembers: s.clanMaxMembers, seasonMaxPlayers: s.seasonMaxPlayers, tombsVisible: s.tombsVisible,
      speedFactor: s.speedFactor, moveSeconds: s.moveSeconds, difficulty: s.difficulty, electionDays: s.electionDays, mapId: s.mapId, valleyBlock: s.valleyBlock, dangerBlob: s.dangerBlob, monsterScaleStart: s.monsterScaleStart, monsterScaleDiv: s.monsterScaleDiv, hellMinMult: s.hellMinMult, hellMaxMult: s.hellMaxMult };
  }

  season() {
    const w = this.w; const s = this.s; const se = w.season;
    const map = mapById(se.map_id);
    const active = (this.db.prepare('SELECT COUNT(*) c FROM players WHERE season_id = ? AND quit = 0').get(se.id) as any).c as number;
    const tiles = (this.db.prepare('SELECT COUNT(*) c FROM tiles WHERE season_id = ?').get(se.id) as any).c as number;
    return {
      id: se.id, number: se.number, mapId: se.map_id, mapName: map.name, seed: se.seed, startedAt: se.started_at, startedByAdmin: !!se.started_by_admin, pool: se.pool, playersJoined: se.players_joined, activePlayers: active, tilesOwned: tiles,
      treasure: se.treasure_at ? { at: se.treasure_at, by: w.nameOf({ type: se.treasure_by_type as any, id: se.treasure_by_id! }), value: se.treasure_value } : null,
      participation: se.participation ? JSON.parse(se.participation) : null, report: se.report ? JSON.parse(se.report) : null,
      endsAt: se.ends_at, closedAt: se.closed_at, closed: w.closed, tombsRevealed: se.tombs_revealed, tombsTotal: 10,
      prizes: { artifact: artifactValue(se.pool, s), treasure: treasureValue(se.pool, s), participation: participationValue(se.pool, s) },
      tombs: w.tombs.map(t => ({ id: t.id, name: t.name, x: t.x, y: t.y, captured: t.captured, capturedBy: t.capturedBy ? w.nameOf(refOf(t.capturedBy)) : null })),
    };
  }

  leaderboard() {
    const w = this.w; const s = this.s;
    const players = this.db.prepare(`SELECT p.id, p.name, p.xp, p.clan_id, (SELECT COUNT(*) FROM tiles t WHERE t.season_id = p.season_id AND t.owner_type = 'player' AND t.owner_id = p.id) tiles,
      (SELECT COUNT(*) FROM artifacts a WHERE a.season_id = p.season_id AND a.owner_type = 'player' AND a.owner_id = p.id AND a.sold_at IS NULL) artifacts
      FROM players p WHERE p.season_id = ? AND p.quit = 0 ORDER BY p.xp DESC, tiles DESC LIMIT 50`).all(w.season.id) as any[];
    const clans = this.db.prepare(`SELECT c.id, c.name, c.xp, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) members,
      (SELECT COUNT(*) FROM tiles t WHERE t.season_id = c.season_id AND ((t.owner_type = 'clan' AND t.owner_id = c.id) OR (t.owner_type = 'player' AND t.owner_id IN (SELECT player_id FROM clan_members m WHERE m.clan_id = c.id)))) tiles,
      (SELECT COUNT(*) FROM artifacts a WHERE a.season_id = c.season_id AND a.owner_type = 'clan' AND a.owner_id = c.id AND a.sold_at IS NULL) artifacts
      FROM clans c WHERE c.season_id = ? ORDER BY tiles DESC, c.xp DESC LIMIT 10`).all(w.season.id) as any[];
    return {
      players: players.map(r => ({ id: r.id, name: r.name, level: levelForXp(r.xp, s.xpLevel2, s.xpGrowth), tiles: r.tiles, artifacts: r.artifacts, clanId: r.clan_id })),
      clans: clans.map(r => ({ id: r.id, name: r.name, level: levelForXp(r.xp, s.xpLevel2, s.xpGrowth), members: r.members, tiles: r.tiles, artifacts: r.artifacts })),
    };
  }

  // ناحیه‌ی نقشه: خانه‌های تصاحب‌شده، کاروان‌ها و قفل‌ها در یک مربع
  region(cx: number, cy: number, r: number, viewer: ActorRef | null) {
    const w = this.w;
    r = Math.max(1, Math.min(60, Math.floor(r)));
    const minX = cx - r, maxX = cx + r, minY = cy - r, maxY = cy + r;
    const g = viewer ? w.groupOf(viewer) : { players: [] as number[], clan: null as number | null };
    const mine = (t: { owner_type: string; owner_id: number }) => t.owner_type === 'clan' ? g.clan === t.owner_id : g.players.includes(t.owner_id);
    const names = new Map<string, string>();
    const nameOf = (type: 'player' | 'clan', id: number) => { const k = `${type}:${id}`; if (!names.has(k)) names.set(k, w.nameOf({ type, id })); return names.get(k)!; };
    const tiles = w.tilesIn(minX, minY, maxX, maxY).map(t => ({ x: t.x, y: t.y, ownerType: t.owner_type, ownerId: t.owner_id, owner: nameOf(t.owner_type, t.owner_id), mine: mine(t), guardian: t.guardian, terrain: t.terrain, at: t.at }));
    const caravans: any[] = [];
    for (const m of w.allMigrations()) {
      const a = w.actor({ type: m.actor_type, id: m.actor_id });
      const cur = m.path[m.step]; const pos = a.pos;
      const inBox = (p: P | null) => !!p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      if (!inBox(pos) && !inBox(cur)) continue;
      const self = viewer && ((m.actor_type === viewer.type && m.actor_id === viewer.id) || (m.actor_type === 'clan' && g.clan === m.actor_id));
      caravans.push({ type: m.actor_type, id: m.actor_id, name: a.name, pos, next: cur ?? null, eta: m.step_start + m.step_seconds * 1000, target: m.path[m.path.length - 1], self: !!self, units: self ? totalUnits(a.units) : undefined });
    }
    const locks: { x: number; y: number; by: string }[] = [];
    for (const [k, by] of w.locks) { const [x, y] = k.split(',').map(Number); if (x >= minX && x <= maxX && y >= minY && y <= maxY) locks.push({ x, y, by }); }
    return { cx, cy, r, tiles, caravans, locks, tombs: w.tombs.filter(t => !t.captured && t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY).map(t => ({ id: t.id, name: t.name, x: t.x, y: t.y })) };
  }

  tileInfo(x: number, y: number, viewer: Actor | null, now: number) {
    const w = this.w;
    const t = w.tile(x, y); const terrain = w.terrainAt(x, y);
    const tomb = w.tombAt(x, y);
    const out: any = { x, y, terrain, monsters: w.monstersAt(x, y), supply: this.s.supply[terrain], tomb: tomb ? { id: tomb.id, name: tomb.name } : null, locked: !!w.locks.get(tileKey(x, y)) };
    if (t) out.owner = { type: t.owner_type, id: t.owner_id, name: w.nameOf({ type: t.owner_type, id: t.owner_id }), guardian: t.guardian, cost: t.cost, at: t.at, mine: viewer ? w.sameGroup(viewer, { type: t.owner_type, id: t.owner_id }) : false };
    if (viewer) { try { out.plan = this.a.planMove(viewer, { x, y }, now); } catch (e: any) { out.planError = e.reason ?? e.message; } }
    return out;
  }

  clans(q: string) {
    return this.db.prepare(`SELECT c.id, c.name, c.xp, c.created_at, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) members, (SELECT name FROM players WHERE id = c.commander_id) commander FROM clans c WHERE c.season_id = ? AND c.name LIKE ? ORDER BY members DESC, c.xp DESC LIMIT 50`).all(this.w.season.id, `%${q}%`)
      .map((r: any) => ({ ...r, level: levelForXp(r.xp, this.s.xpLevel2, this.s.xpGrowth) }));
  }
}

export function refOf(key: string): ActorRef { const [type, id] = key.split(':'); return { type: type as any, id: Number(id) }; }
