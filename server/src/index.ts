// نقطه‌ی آغاز سرور بازی گنج: Fastify + SQLite + حلقه‌ی تیک + وب‌سوکت + فایل‌های ایستای بازی.
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { openDb } from './db.js';
import { World, GameError } from './game/world.js';
import { Actions } from './game/actions.js';
import { Engine } from './game/tick.js';
import { Views } from './api/views.js';
import { Hub } from './api/ws.js';
import { registerPlayerRoutes } from './api/routes.js';
import { registerAdminRoutes } from './api/admin.js';
import type { Ctx } from './api/ctx.js';

// پشتیبان‌گیری از خط فرمان: node dist/server.mjs --backup /path/to/file.sqlite
if (process.argv.includes('--backup')) {
  const out = process.argv[process.argv.indexOf('--backup') + 1];
  if (!out) { console.error('مسیر فایل پشتیبان لازم است'); process.exit(2); }
  const db = openDb(config.dbPath);
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  console.log(`پشتیبان نوشته شد: ${out}`);
  process.exit(0);
}

export async function buildServer(opts: { dbPath?: string; logger?: boolean } = {}) {
  const db = openDb(opts.dbPath ?? config.dbPath);
  const w = new World(db); w.boot();
  const a = new Actions(w);
  const engine = new Engine(w, a);
  const views = new Views(w, a);
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: config.trustProxy, bodyLimit: 64 * 1024 });
  const ctx: Ctx = { db, w, a, engine, views, ws: null as any, config };
  ctx.ws = new Hub(ctx);
  engine.listeners.push(ev => ctx.ws.onEvent(ev));

  await app.register(cookie);
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof GameError) return reply.code(err.code).send({ error: err.reason });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'خطای داخلی سرور' });
  });

  app.get('/api/health', async () => ({ ok: true, season: w.season.number, closed: w.closed, now: Date.now(), clients: ctx.ws.clients.size }));
  registerPlayerRoutes(app, ctx);
  registerAdminRoutes(app, ctx);
  ctx.ws.attach(app);

  const staticDir = resolve(config.staticDir);
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir, prefix: '/', index: ['index.html'], maxAge: '1h', immutable: false, cacheControl: true, setHeaders(res, path) { if (/\/assets\/.*-[A-Za-z0-9_-]{8}\./.test(path)) res.setHeader('cache-control', 'public, max-age=31536000, immutable'); if (/\.html$/.test(path)) res.setHeader('cache-control', 'no-cache'); } });
  } else app.log.warn(`پوشه‌ی ایستای ${staticDir} پیدا نشد؛ فقط API سرو می‌شود (npm run build در ریشه‌ی پروژه)`);

  // حلقه‌ی تیک
  let ticking = false; let lastTick = Date.now();
  const timer = setInterval(() => {
    if (ticking) return; ticking = true;
    try { engine.tick(Date.now()); lastTick = Date.now(); } catch (e) { app.log.error(e, 'tick failed'); } finally { ticking = false; }
  }, config.tickMs);
  app.addHook('onClose', async () => { clearInterval(timer); db.close(); });
  (app as any).ctx = ctx; (app as any).lastTick = () => lastTick;
  return { app, ctx };
}

const isMain = process.argv[1] && (import.meta.url === new URL(`file://${process.argv[1]}`).href || import.meta.url.endsWith(process.argv[1].split('/').pop()!));
if (isMain) {
  buildServer().then(({ app }) => {
    const stop = () => { app.log.info('خاموش می‌شود…'); app.close().then(() => process.exit(0)); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    return app.listen({ port: config.port, host: config.host });
  }).then(addr => { if (addr) console.log(`بازی گنج روی ${addr} گوش می‌دهد`); }).catch(e => { console.error(e); process.exit(1); });
}
