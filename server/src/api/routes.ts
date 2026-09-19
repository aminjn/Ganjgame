// مسیرهای بازیکن (REST). همه‌ی پاسخ‌ها JSON؛ خطاهای قانون بازی با ۴۰۰ و متن فارسی.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { GameError, type ActorRef } from '../game/world.js';
import type { Ctx } from './ctx.js';
import { signToken, verifyToken } from '../auth.js';
import { requestPayment, verifyPayment } from '../payments/zarinpal.js';

const COOKIE = 'ganj_session';
const WEEK = 7 * 86400000;

export function playerIdOf(req: FastifyRequest, secret: string): number | null {
  const raw = (req.cookies as any)?.[COOKIE] ?? (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);
  const t = verifyToken(raw, secret);
  return t && t.role === 'player' ? t.sub : null;
}

export function registerPlayerRoutes(app: FastifyInstance, ctx: Ctx) {
  const { w, a, views, engine, config } = ctx;
  const now = () => Date.now();
  const body = (req: FastifyRequest) => (req.body ?? {}) as any;
  const setSession = (reply: FastifyReply, id: number) => {
    reply.setCookie(COOKIE, signToken({ sub: id, role: 'player', exp: now() + 30 * 86400000 }, config.jwtSecret), { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 30 * 86400 });
  };
  // احراز هویت + پیوستن خودکار به فصل جاری
  const auth = (req: FastifyRequest): number => {
    const id = playerIdOf(req, config.jwtSecret); if (!id) throw new GameError('وارد نشده‌اید', 401);
    const p = w.playerRow(id); if (!p) throw new GameError('حساب پیدا نشد', 401);
    if (p.season_id !== w.season.id && !w.closed) { try { a.joinSeason(id, now()); } catch { /* ظرفیت پر: تماشاگر */ } }
    ctx.db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(now(), id);
    return id;
  };
  const actor = (req: FastifyRequest, id: number) => {
    const p = w.playerRow(id);
    if (p.season_id !== w.season.id || p.quit) throw new GameError('در این فصل حضور ندارید');
    const control = (body(req).control ?? p.control) as 'player' | 'clan';
    return a.actorFor(id, control);
  };
  const viewerRef = (id: number): ActorRef | null => { const p = w.playerRow(id); if (!p || p.season_id !== w.season.id || p.quit) return null; return p.control === 'clan' && p.clan_id ? { type: 'clan', id: p.clan_id } : { type: 'player', id }; };

  // ---------- حساب ----------
  app.post('/api/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { name, password } = body(req);
    const id = a.register(String(name ?? ''), String(password ?? ''), now());
    setSession(reply, id);
    return views.me(id, now());
  });
  app.post('/api/auth/login', { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const { name, password } = body(req);
    const id = a.login(String(name ?? ''), String(password ?? ''));
    setSession(reply, id);
    return views.me(id, now());
  });
  app.post('/api/auth/logout', async (_req, reply) => { reply.clearCookie(COOKIE, { path: '/' }); return { ok: true }; });
  app.get('/api/me', async (req) => views.me(auth(req), now()));
  app.get('/api/session', async (req) => { const id = playerIdOf(req, config.jwtSecret); return { loggedIn: !!id && !!w.playerRow(id), season: views.season(), settings: views.publicSettings(), now: now() }; });

  // ---------- دنیا ----------
  app.get('/api/season', async () => ({ ...views.season(), leaderboard: views.leaderboard() }));
  app.get('/api/region', async (req) => {
    const q = req.query as any; const id = playerIdOf(req, config.jwtSecret);
    return views.region(Number(q.x) | 0, Number(q.y) | 0, Number(q.r ?? 24), id ? viewerRef(id) : null);
  });
  app.get('/api/tile', async (req) => {
    const q = req.query as any; const id = playerIdOf(req, config.jwtSecret);
    let viewer = null; if (id) { try { viewer = actor(req, id); } catch { viewer = null; } }
    return views.tileInfo(Number(q.x) | 0, Number(q.y) | 0, viewer, now());
  });

  // ---------- کوچ / نیرو ----------
  app.post('/api/move/plan', async (req) => { const id = auth(req); const { x, y } = body(req); return a.planMove(actor(req, id), { x: x | 0, y: y | 0 }, now()); });
  app.post('/api/move/start', async (req) => { const id = auth(req); const { x, y } = body(req); const plan = a.startMove(actor(req, id), { x: x | 0, y: y | 0 }, now()); ctx.ws.caravanChanged(actor(req, id)); return { plan, me: views.me(id, now()) }; });
  app.post('/api/move/cancel', async (req) => { const id = auth(req); const ac = actor(req, id); a.cancelMove(ac, now()); ctx.ws.caravanChanged(ac); return views.me(id, now()); });
  app.post('/api/units/buy', async (req) => { const id = auth(req); const { type, n } = body(req); a.buyUnits(actor(req, id), type, Number(n) | 0, now()); return views.me(id, now()); });
  app.post('/api/rest', async (req) => { const id = auth(req); a.rest(actor(req, id), now()); return views.me(id, now()); });
  app.post('/api/control', async (req) => { const id = auth(req); a.switchControl(id, body(req).control === 'clan' ? 'clan' : 'player'); return views.me(id, now()); });
  app.post('/api/season/quit', async (req) => { const id = auth(req); a.quitSeason(id, now()); return views.me(id, now()); });

  // ---------- کیف پول ----------
  app.post('/api/wallet/buy-coins', async (req) => { const id = auth(req); a.buyCoins(id, Number(body(req).n) | 0, now()); ctx.ws.seasonChanged(); return views.me(id, now()); });
  app.post('/api/wallet/iban', async (req) => { const id = auth(req); const { iban, ownerName } = body(req); a.setIban(id, String(iban ?? ''), String(ownerName ?? '')); return views.me(id, now()); });
  app.post('/api/wallet/withdraw', async (req) => { const id = auth(req); a.requestWithdraw(id, Number(body(req).amount), now()); return views.me(id, now()); });
  app.post('/api/wallet/deposit', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const id = auth(req); const amount = Math.floor(Number(body(req).amount));
    if (!Number.isFinite(amount) || amount < 10000 || amount > 500_000_000) throw new GameError('مبلغ شارژ باید بین ۱۰٬۰۰۰ و ۵۰۰٬۰۰۰٬۰۰۰ تومان باشد');
    if (!config.zarinpalMerchant) {
      // درگاه تنظیم نشده: ثبت واریز دستی برای تأیید ادمین (کارت‌به‌کارت)
      const r = ctx.db.prepare("INSERT INTO deposits(player_id, amount, gateway, status, created_at) VALUES (?, ?, 'manual', 'pending', ?)").run(id, amount, now());
      return { manual: true, depositId: Number(r.lastInsertRowid), amount };
    }
    const pay = await requestPayment({ merchant: config.zarinpalMerchant, sandbox: config.zarinpalSandbox }, amount, `شارژ کیف پول بازی گنج — ${w.playerRow(id).name}`, `${config.publicUrl}/api/wallet/verify`);
    ctx.db.prepare("INSERT INTO deposits(player_id, amount, gateway, authority, status, created_at) VALUES (?, ?, 'zarinpal', ?, 'pending', ?)").run(id, amount, pay.authority, now());
    return { manual: false, url: pay.url };
  });
  app.get('/api/wallet/verify', async (req, reply) => {
    const q = req.query as any; const authority = String(q.Authority ?? ''); const status = String(q.Status ?? '');
    const d = ctx.db.prepare("SELECT * FROM deposits WHERE authority = ? AND gateway = 'zarinpal'").get(authority) as any;
    if (!d) return reply.redirect('/?deposit=notfound');
    if (d.status !== 'pending') return reply.redirect('/?deposit=' + (d.status === 'ok' ? 'ok' : 'failed'));
    if (status !== 'OK') { ctx.db.prepare("UPDATE deposits SET status = 'cancelled' WHERE id = ?").run(d.id); return reply.redirect('/?deposit=cancelled'); }
    const v = await verifyPayment({ merchant: config.zarinpalMerchant, sandbox: config.zarinpalSandbox }, d.amount, authority);
    if (!v.ok) { ctx.db.prepare("UPDATE deposits SET status = 'failed' WHERE id = ?").run(d.id); return reply.redirect('/?deposit=failed'); }
    ctx.db.prepare("UPDATE deposits SET status = 'ok', verified_at = ?, ref_id = ? WHERE id = ?").run(now(), v.refId ?? '', d.id);
    a.creditToman(d.player_id, d.amount, `شارژ زرین‌پال (پیگیری ${v.refId ?? '—'})`, now());
    return reply.redirect('/?deposit=ok');
  });

  // ---------- بازار آرتیفکت ----------
  app.get('/api/market', async () => a.market());
  app.post('/api/market/offer', async (req) => { const id = auth(req); const { artifactId, amount } = body(req); a.makeOffer(id, Number(artifactId) | 0, Number(amount), now()); ctx.ws.notify(ownerOfArtifact(ctx, Number(artifactId) | 0), { type: 'offer' }); return views.me(id, now()); });
  app.post('/api/market/respond', async (req) => { const id = auth(req); const { offerId, accept } = body(req); const o = ctx.db.prepare('SELECT bidder_id FROM offers WHERE id = ?').get(Number(offerId) | 0) as any; a.respondOffer(id, Number(offerId) | 0, !!accept, now()); if (o) ctx.ws.notify(o.bidder_id, { type: 'offer' }); return views.me(id, now()); });
  app.post('/api/market/withdraw', async (req) => { const id = auth(req); a.withdrawOffer(id, Number(body(req).offerId) | 0, now()); return views.me(id, now()); });

  // ---------- کلن ----------
  app.get('/api/clans', async (req) => views.clans(String((req.query as any).q ?? '').slice(0, 30)));
  app.post('/api/clan/create', async (req) => { const id = auth(req); a.createClan(id, String(body(req).name ?? ''), now()); return views.me(id, now()); });
  app.post('/api/clan/join', async (req) => { const id = auth(req); a.requestJoin(id, Number(body(req).clanId) | 0, now()); ctx.ws.notifyClanOfficers(Number(body(req).clanId) | 0, { type: 'clan' }); return views.me(id, now()); });
  app.post('/api/clan/respond', async (req) => { const id = auth(req); const { requestId, accept } = body(req); const r = ctx.db.prepare('SELECT player_id FROM clan_requests WHERE id = ?').get(Number(requestId) | 0) as any; a.respondJoin(id, Number(requestId) | 0, !!accept, now()); if (r) ctx.ws.notify(r.player_id, { type: 'clan' }); return views.me(id, now()); });
  app.post('/api/clan/deposit', async (req) => { const id = auth(req); a.clanDeposit(id, Number(body(req).amount) | 0, now()); return views.me(id, now()); });
  app.post('/api/clan/donate', async (req) => { const id = auth(req); const { type, n } = body(req); a.donateUnits(id, type, Number(n) | 0, now()); return views.me(id, now()); });
  app.post('/api/clan/camp', async (req) => { const id = auth(req); const { x, y } = body(req); a.setClanCamp(id, { x: x | 0, y: y | 0 }, now()); return views.me(id, now()); });
  app.post('/api/clan/vote', async (req) => { const id = auth(req); a.vote(id, Number(body(req).candidateId) | 0, now()); return views.me(id, now()); });
  app.post('/api/clan/chat', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => { const id = auth(req); a.chat(id, String(body(req).text ?? ''), now()); const p = w.playerRow(id); ctx.ws.notifyClan(p.clan_id, { type: 'chat' }); return { ok: true }; });
  app.get('/api/clan/chat', async (req) => {
    const id = auth(req); const p = w.playerRow(id); if (!p.clan_id) return [];
    const after = Number((req.query as any).after ?? 0) | 0;
    return ctx.db.prepare('SELECT c.id, c.player_id, p.name, c.t, c.text FROM clan_chat c JOIN players p ON p.id = c.player_id WHERE c.clan_id = ? AND c.id > ? ORDER BY c.id LIMIT 100').all(p.clan_id, after);
  });

  // ---------- پشتیبانی ----------
  app.post('/api/support/ticket', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => { const id = auth(req); const { subject, body: b } = body(req); a.ticket(id, String(subject ?? ''), String(b ?? ''), now()); return views.me(id, now()); });

  void engine;
}

function ownerOfArtifact(ctx: Ctx, artifactId: number): number {
  const r = ctx.db.prepare("SELECT owner_id FROM artifacts WHERE id = ? AND owner_type = 'player'").get(artifactId) as any; return r?.owner_id ?? 0;
}
