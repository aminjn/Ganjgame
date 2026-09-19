// پایگاه‌داده: SQLite داخلی Node (بدون وابستگی بومی) با WAL. طرح جدول‌ها و مهاجرت‌ها این‌جاست.
import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';
// بارگذاری ماژول داخلی بدون import ایستا (تا باندلر/وایت‌تست دنبال بسته‌ی npm نگردد)
const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSyncT;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value REAL NOT NULL);
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY, number INTEGER NOT NULL, map_id INTEGER NOT NULL, seed INTEGER NOT NULL, started_at INTEGER NOT NULL,
  started_by_admin INTEGER NOT NULL DEFAULT 0, pool INTEGER NOT NULL DEFAULT 0, players_joined INTEGER NOT NULL DEFAULT 0,
  treasure_at INTEGER, treasure_by_type TEXT, treasure_by_id INTEGER, treasure_value INTEGER, participation TEXT, report TEXT,
  ends_at INTEGER, closed_at INTEGER, tombs_revealed INTEGER NOT NULL DEFAULT 0, settings_snapshot TEXT
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER,
  toman INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0, iban TEXT NOT NULL DEFAULT '', owner_name TEXT NOT NULL DEFAULT '',
  season_id INTEGER, coins INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0, energy REAL NOT NULL DEFAULT 100, energy_at INTEGER NOT NULL DEFAULT 0,
  camp_x INTEGER, camp_y INTEGER, pos_x INTEGER, pos_y INTEGER, units TEXT NOT NULL DEFAULT '{}', units_bought INTEGER NOT NULL DEFAULT 0,
  spent_coins INTEGER NOT NULL DEFAULT 0, clan_id INTEGER, control TEXT NOT NULL DEFAULT 'player', quit INTEGER NOT NULL DEFAULT 0, is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_players_clan ON players(clan_id);
CREATE TABLE IF NOT EXISTS clans (
  id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, name TEXT NOT NULL COLLATE NOCASE, created_at INTEGER NOT NULL, commander_id INTEGER NOT NULL,
  treasury INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0, energy REAL NOT NULL DEFAULT 100, energy_at INTEGER NOT NULL DEFAULT 0,
  camp_x INTEGER, camp_y INTEGER, pos_x INTEGER, pos_y INTEGER, units TEXT NOT NULL DEFAULT '{}', units_bought INTEGER NOT NULL DEFAULT 0,
  spent_coins INTEGER NOT NULL DEFAULT 0, member_coins INTEGER NOT NULL DEFAULT 0, election_period INTEGER NOT NULL DEFAULT 0, UNIQUE(season_id, name)
);
CREATE TABLE IF NOT EXISTS clan_members (clan_id INTEGER NOT NULL, player_id INTEGER NOT NULL, weight INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member', PRIMARY KEY(clan_id, player_id));
CREATE TABLE IF NOT EXISTS clan_requests (id INTEGER PRIMARY KEY, clan_id INTEGER NOT NULL, player_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_req_clan ON clan_requests(clan_id, status);
CREATE TABLE IF NOT EXISTS clan_votes (clan_id INTEGER NOT NULL, voter_id INTEGER NOT NULL, candidate_id INTEGER NOT NULL, period INTEGER NOT NULL, PRIMARY KEY(clan_id, voter_id, period));
CREATE TABLE IF NOT EXISTS clan_chat (id INTEGER PRIMARY KEY, clan_id INTEGER NOT NULL, player_id INTEGER NOT NULL, t INTEGER NOT NULL, text TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chat ON clan_chat(clan_id, id);
CREATE TABLE IF NOT EXISTS tiles (
  season_id INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, owner_type TEXT NOT NULL, owner_id INTEGER NOT NULL,
  guardian TEXT, cost INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, terrain TEXT NOT NULL, PRIMARY KEY(season_id, x, y)
);
CREATE INDEX IF NOT EXISTS idx_tiles_owner ON tiles(season_id, owner_type, owner_id);
CREATE TABLE IF NOT EXISTS tombs (season_id INTEGER NOT NULL, id INTEGER NOT NULL, name TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, captured INTEGER NOT NULL DEFAULT 0, captured_by_type TEXT, captured_by_id INTEGER, captured_at INTEGER, PRIMARY KEY(season_id, id));
CREATE TABLE IF NOT EXISTS artifacts (id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, tomb_id INTEGER NOT NULL, owner_type TEXT NOT NULL, owner_id INTEGER NOT NULL, acquired_at INTEGER NOT NULL, sold_at INTEGER, sold_for INTEGER);
CREATE INDEX IF NOT EXISTS idx_art_owner ON artifacts(season_id, owner_type, owner_id);
CREATE TABLE IF NOT EXISTS offers (id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, artifact_id INTEGER NOT NULL, bidder_id INTEGER NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, resolved_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_offers ON offers(season_id, status);
CREATE TABLE IF NOT EXISTS migrations (
  season_id INTEGER NOT NULL, actor_type TEXT NOT NULL, actor_id INTEGER NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, step INTEGER NOT NULL DEFAULT 0,
  step_start INTEGER NOT NULL, step_seconds REAL NOT NULL, prepaid INTEGER NOT NULL DEFAULT 0, from_x INTEGER NOT NULL, from_y INTEGER NOT NULL, PRIMARY KEY(season_id, actor_type, actor_id)
);
CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL, t INTEGER NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tx ON transactions(player_id, id);
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, who_type TEXT NOT NULL, who_id INTEGER NOT NULL, t INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, x INTEGER, y INTEGER);
CREATE INDEX IF NOT EXISTS idx_logs ON logs(season_id, who_type, who_id, id);
CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, owner_type TEXT NOT NULL, owner_id INTEGER NOT NULL, name TEXT NOT NULL, value INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_inv ON inventory(season_id, owner_type, owner_id);
CREATE TABLE IF NOT EXISTS deposits (id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL, amount INTEGER NOT NULL, gateway TEXT NOT NULL, authority TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, verified_at INTEGER, ref_id TEXT);
CREATE TABLE IF NOT EXISTS withdrawals (id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL, amount INTEGER NOT NULL, iban TEXT NOT NULL, owner_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, processed_at INTEGER, note TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'manual');
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, reply TEXT, replied_at INTEGER);
CREATE TABLE IF NOT EXISTS admin_cmds (id INTEGER PRIMARY KEY, type TEXT NOT NULL, at INTEGER NOT NULL, applied_at INTEGER);
`;

function migrate(db: DB) {
  db.exec(SCHEMA);
  const v = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema') as { value: string } | undefined;
  if (!v) db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('schema', '1');
}

export const now = () => Date.now();
