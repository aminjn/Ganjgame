// مسیرهای پنل ادمین: ورود با گذرواژه، وضعیت و قفل، تنظیمات، آغاز فصل، پرونده‌ی بازیکن، پشتیبانی، واریز/برداشت.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { Ctx } from './ctx.js';
import { GameError } from '../game/world.js';
import { signToken, verifyToken } from '../auth.js';
import { FIELDS, defaultSettings, applyOverrides, validateField, validateSettings, getPath } from '../../../src/rules/settings';
import { MAPS } from '../../../src/rules/terrain';

const COOKIE = 'ganj_admin';

export function lockState(ctx: Ctx): { locked: boolean; reason: string } {
  const { w, db } = ctx;
  if (w.closed) return { locked: false, reason: 'فصل بسته شده؛ تنظیمات باز است' };
  if (w.season.started_by_admin) return { locked: true, reason: `فصل ${w.season.number} با فرمان ادمین آغاز شده است` };
  const sid = w.season.id;
  if (w.season.pool > 0) return { locked: true, reason: 'استخر جایزه پر شده است' };
  const played = db.prepare(`SELECT 1 FROM players WHERE season_id = ? AND quit = 0 AND (xp > 0 OR units != '{}' OR spent_coins > 0) LIMIT 1`).get(sid);
  if (played) return { locked: true, reason: 'بازیکنی عملاً بازی را شروع کرده است' };
  const tiles = db.prepare('SELECT 1 FROM tiles WHERE season_id = ? AND cost > 0 LIMIT 1').get(sid);
  if (tiles) return { locked: true, reason: 'خانه‌ای تصاحب شده است' };
  return { locked: false, reason: 'هنوز کسی بازی را شروع نکرده' };
}

export function registerAdminRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, w, a, config } = ctx;
  const now = () => Date.now();
  const body = (req: FastifyRequest) => (req.body ?? {}) as any;
  const isAdmin = (req: FastifyRequest) => { const t = verifyToken((req.cookies as any)?.[COOKIE], config.jwtSecret); return !!t && t.role === 'admin'; };
  const guard = (req: FastifyRequest) => { if (!isAdmin(req)) throw new GameError('دسترسی ادمین لازم است', 401); };
  const unlocked = () => { const l = lockState(ctx); if (l.locked) throw new GameError(`پنل قفل است: ${l.reason}`, 423); };

  app.post('/api/admin/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const pw = String(body(req).password ?? '');
    if (!config.adminPassword) throw new GameError('ADMIN_PASSWORD روی سرور تنظیم نشده است', 503);
    const x = Buffer.from(pw), y = Buffer.from(config.adminPassword);
    if (x.length !== y.length || !timingSafeEqual(x, y)) throw new GameError('گذرواژه نادرست است', 401);
    reply.setCookie(COOKIE, signToken({ sub: 0, role: 'admin', exp: now() + 12 * 3600000 }, config.jwtSecret), { path: '/', httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, maxAge: 12 * 3600 });
    return { ok: true };
  });
  app.post('/api/admin/logout', async (_req, reply) => { reply.clearCookie(COOKIE, { path: '/' }); return { ok: true }; });

  app.get('/api/admin/status', async (req) => {
    guard(req);
    const overrides = w.loadSettings();
    const counts = {
      players: (db.prepare('SELECT COUNT(*) c FROM players').get() as any).c,
      active: (db.prepare('SELECT COUNT(*) c FROM players WHERE season_id = ? AND quit = 0').get(w.season.id) as any).c,
      online: ctx.ws.clients.size,
      clans: (db.prepare('SELECT COUNT(*) c FROM clans WHERE season_id = ?').get(w.season.id) as any).c,
      tiles: (db.prepare('SELECT COUNT(*) c FROM tiles WHERE season_id = ?').get(w.season.id) as any).c,
      migrations: (db.prepare('SELECT COUNT(*) c FROM migrations WHERE season_id = ?').get(w.season.id) as any).c,
      openTickets: (db.prepare("SELECT COUNT(*) c FROM tickets WHERE status = 'open'").get() as any).c,
      pendingDeposits: (db.prepare("SELECT COUNT(*) c FROM deposits WHERE status = 'pending' AND gateway = 'manual'").get() as any).c,
      pendingWithdrawals: (db.prepare("SELECT COUNT(*) c FROM withdrawals WHERE status = 'pending'").get() as any).c,
      tomanTotal: (db.prepare('SELECT COALESCE(SUM(toman),0) c FROM players').get() as any).c,
    };
    return {
      season: ctx.views.season(), lock: lockState(ctx), overrides, defaults: defaultSettings(), effective: w.settings, fields: FIELDS,
      maps: MAPS.map(m => ({ id: m.id, name: m.name, desc: m.desc, valleyBlock: m.valleyBlock, dangerBlob: m.dangerBlob })),
      counts, seasons: db.prepare('SELECT id, number, map_id, started_at, started_by_admin, pool, players_joined, treasure_at, closed_at FROM seasons ORDER BY id DESC LIMIT 20').all(),
      gateway: config.zarinpalMerchant ? 'zarinpal' : 'manual', now: now(),
    };
  });

  // ذخیره‌ی تنظیمات: فقط اعدادی که با پیش‌فرض فرق دارند؛ مقادیر مخرب با دلیل رد می‌شوند
  app.post('/api/admin/settings', async (req) => {
    guard(req); unlocked();
    const input = body(req).overrides ?? {};
    const def = defaultSettings(); const out: Record<string, number> = {}; const errors: string[] = [];
    for (const f of FIELDS) {
      const v = input[f.path]; if (v === undefined || v === null || v === '') continue;
      const n = Number(v); if (!Number.isFinite(n)) { errors.push(`${f.label}: عدد نیست`); continue; }
      const e = validateField(f, n); if (e) { errors.push(`${f.label}: ${e}`); continue; }
      if (n !== getPath(def, f.path)) out[f.path] = n;
    }
    if (input.mapId !== undefined) { const m = Number(input.mapId) | 0; if (m >= 1 && m <= 10 && m !== def.mapId) out.mapId = m; else if (m !== def.mapId) errors.push('شناسه‌ی نقشه باید بین ۱ و ۱۰ باشد'); }
    for (const e of validateSettings(applyOverrides(out))) errors.push(e);
    if (errors.length) throw new GameError(errors.join('؛ '), 400);
    w.saveOverrides(out); w.loadSettings();
    return { ok: true, overrides: out };
  });
  app.post('/api/admin/settings/reset', async (req) => { guard(req); unlocked(); w.saveOverrides({}); w.loadSettings(); return { ok: true }; });

  // آغاز فصل تازه: دنیا از نو ساخته می‌شود؛ بازیکنان با ورود بعدی به فصل تازه می‌پیوندند
  app.post('/api/admin/season/start', async (req) => {
    guard(req); unlocked();
    db.prepare('INSERT INTO admin_cmds(type, at, applied_at) VALUES (?, ?, ?)').run('start', now(), now());
    const s = w.createSeason(true);
    ctx.ws.broadcast({ type: 'season', reset: true, season: ctx.views.season() });
    return { ok: true, season: { id: s.id, number: s.number, mapId: s.map_id } };
  });

  // ---------- پرونده‌ی بازیکن ----------
  app.get('/api/admin/players', async (req) => {
    guard(req); const q = String((req.query as any).q ?? '').slice(0, 30);
    return db.prepare(`SELECT p.id, p.name, p.toman, p.blocked, p.coins, p.xp, p.last_seen, p.created_at, p.quit, p.season_id, p.iban, (SELECT name FROM clans WHERE id = p.clan_id) clan,
      (SELECT COUNT(*) FROM tiles t WHERE t.season_id = p.season_id AND t.owner_type = 'player' AND t.owner_id = p.id) tiles
      FROM players p WHERE p.name LIKE ? ORDER BY p.last_seen DESC LIMIT 100`).all(`%${q}%`);
  });
  app.get('/api/admin/player/:id', async (req) => {
    guard(req); const id = Number((req.params as any).id) | 0;
    const p = w.playerRow(id); if (!p) throw new GameError('بازیکن پیدا نشد', 404);
    const { pass_hash, ...safe } = p;
    return {
      player: safe, units: JSON.parse(p.units), inSeason: p.season_id === w.season.id && !p.quit,
      view: p.season_id === w.season.id && !p.quit ? ctx.views.actorView(w.playerActor(p), now()) : null,
      logs: db.prepare('SELECT t, kind, text, x, y FROM logs WHERE who_type = ? AND who_id = ? ORDER BY id DESC LIMIT 200').all('player', id),
      tx: db.prepare('SELECT t, type, amount, note FROM transactions WHERE player_id = ? ORDER BY id DESC LIMIT 200').all(id),
      deposits: db.prepare('SELECT * FROM deposits WHERE player_id = ? ORDER BY id DESC LIMIT 50').all(id),
      withdrawals: db.prepare('SELECT * FROM withdrawals WHERE player_id = ? ORDER BY id DESC LIMIT 50').all(id),
      tickets: db.prepare('SELECT * FROM tickets WHERE player_id = ? ORDER BY id DESC LIMIT 50').all(id),
    };
  });
  app.post('/api/admin/player/:id/credit', async (req) => {
    guard(req); const id = Number((req.params as any).id) | 0; const { amount, note } = body(req);
    const n = Math.floor(Number(amount)); if (!Number.isFinite(n) || n === 0) throw new GameError('مبلغ معتبر نیست');
    if (!w.playerRow(id)) throw new GameError('بازیکن پیدا نشد', 404);
    a.creditToman(id, n, `تنظیم دستی ادمین: ${String(note ?? '').slice(0, 100)}`, now(), 'deposit');
    return { ok: true };
  });

  // ---------- پشتیبانی ----------
  app.get('/api/admin/tickets', async (req) => {
    guard(req); const st = String((req.query as any).status ?? 'open');
    return db.prepare(`SELECT t.*, p.name FROM tickets t JOIN players p ON p.id = t.player_id ${st === 'all' ? '' : 'WHERE t.status = ?'} ORDER BY t.id DESC LIMIT 200`).all(...(st === 'all' ? [] : [st]));
  });
  app.post('/api/admin/ticket/:id', async (req) => {
    guard(req); const id = Number((req.params as any).id) | 0; const { reply, status } = body(req);
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as any; if (!t) throw new GameError('تیکت پیدا نشد', 404);
    if (typeof reply === 'string' && reply.trim()) db.prepare("UPDATE tickets SET reply = ?, replied_at = ?, status = 'closed' WHERE id = ?").run(reply.trim(), now(), id);
    if (status === 'open' || status === 'closed') db.prepare('UPDATE tickets SET status = ? WHERE id = ?').run(status, id);
    ctx.ws.notify(t.player_id, { type: 'ticket' });
    return { ok: true };
  });

  // ---------- واریز دستی و برداشت‌ها ----------
  app.get('/api/admin/deposits', async (req) => { guard(req); const st = String((req.query as any).status ?? 'pending'); return db.prepare('SELECT d.*, p.name FROM deposits d JOIN players p ON p.id = d.player_id WHERE d.status = ? ORDER BY d.id DESC LIMIT 200').all(st); });
  app.post('/api/admin/deposit/:id', async (req) => {
    guard(req); const id = Number((req.params as any).id) | 0; const action = body(req).action;
    const d = db.prepare("SELECT * FROM deposits WHERE id = ? AND status = 'pending'").get(id) as any; if (!d) throw new GameError('واریز در انتظار پیدا نشد', 404);
    if (action === 'approve') { db.prepare("UPDATE deposits SET status = 'ok', verified_at = ?, ref_id = 'manual' WHERE id = ?").run(now(), id); a.creditToman(d.player_id, d.amount, 'شارژ دستی (تأیید ادمین)', now()); }
    else if (action === 'reject') db.prepare("UPDATE deposits SET status = 'rejected' WHERE id = ?").run(id);
    else throw new GameError('عمل نامعتبر');
    ctx.ws.notify(d.player_id, { type: 'wallet' });
    return { ok: true };
  });
  app.get('/api/admin/withdrawals', async (req) => { guard(req); const st = String((req.query as any).status ?? 'pending'); return db.prepare('SELECT wd.*, p.name FROM withdrawals wd JOIN players p ON p.id = wd.player_id WHERE wd.status = ? ORDER BY wd.id DESC LIMIT 200').all(st); });
  app.post('/api/admin/withdrawal/:id', async (req) => {
    guard(req); const id = Number((req.params as any).id) | 0; const { action, note } = body(req);
    const wd = db.prepare("SELECT * FROM withdrawals WHERE id = ? AND status = 'pending'").get(id) as any; if (!wd) throw new GameError('برداشت در انتظار پیدا نشد', 404);
    if (action === 'paid') db.prepare("UPDATE withdrawals SET status = 'paid', processed_at = ?, note = ? WHERE id = ?").run(now(), String(note ?? '').slice(0, 200), id);
    else if (action === 'reject') { db.prepare("UPDATE withdrawals SET status = 'rejected', processed_at = ?, note = ? WHERE id = ?").run(now(), String(note ?? '').slice(0, 200), id); a.creditToman(wd.player_id, wd.amount, `برگشت برداشت رد‌شده: ${String(note ?? '')}`, now(), 'deposit'); }
    else throw new GameError('عمل نامعتبر');
    ctx.ws.notify(wd.player_id, { type: 'wallet' });
    return { ok: true };
  });

  app.get('/api/admin/logs', async (req) => { guard(req); return db.prepare('SELECT l.*, CASE l.who_type WHEN \'player\' THEN (SELECT name FROM players WHERE id = l.who_id) ELSE (SELECT name FROM clans WHERE id = l.who_id) END name FROM logs l WHERE season_id = ? ORDER BY id DESC LIMIT 300').all(w.season.id); });
  app.get('/api/admin/report', async (req) => { guard(req); return { season: ctx.views.season(), leaderboard: ctx.views.leaderboard() }; });
}
