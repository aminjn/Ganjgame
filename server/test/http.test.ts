// آزمون HTTP: ثبت‌نام، کوکی نشست، /api/me، ناحیه، ادمین (قفل/تنظیمات/آغاز فصل)، واریز دستی.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.ADMIN_PASSWORD = 'admin-test';
process.env.JWT_SECRET = 'test-secret';
process.env.STATIC_DIR = '/nonexistent';
const { buildServer } = await import('../src/index');

let app: any;
beforeAll(async () => { ({ app } = await buildServer({ dbPath: ':memory:', logger: false })); await app.ready(); });
afterAll(async () => { await app.close(); });

const cookieOf = (res: any) => (res.headers['set-cookie'] as string[] | string | undefined ?? '').toString().split(';')[0];

describe('http api', () => {
  let cookie = '';
  it('register → cookie → me', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'وب‌بازیکن', password: 'pass123' } });
    expect(r.statusCode).toBe(200);
    cookie = cookieOf(r);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.json().account.name).toBe('وب‌بازیکن');
    expect(me.json().player.tiles).toBe(1);
    const bad = await app.inject({ method: 'GET', url: '/api/me' });
    expect(bad.statusCode).toBe(401);
  });
  it('game errors come back as 400 with Persian reason', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/units/buy', headers: { cookie }, payload: { type: 'guard', n: 10 } });
    expect(r.statusCode).toBe(400); expect(r.json().error).toMatch(/سکه/);
  });
  it('region and tile info', async () => {
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json();
    const c = me.player.camp;
    const reg = (await app.inject({ method: 'GET', url: `/api/region?x=${c.x}&y=${c.y}&r=5`, headers: { cookie } })).json();
    expect(reg.tiles.find((t: any) => t.x === c.x && t.y === c.y).mine).toBe(true);
    const ti = (await app.inject({ method: 'GET', url: `/api/tile?x=${c.x + 1}&y=${c.y}`, headers: { cookie } })).json();
    expect(ti.terrain).toBeTruthy(); expect(ti.plan ?? ti.planError).toBeTruthy();
  });
  it('admin: lock opens/closes with activity, settings validate, season start', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'nope' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'admin-test' } });
    const ac = cookieOf(ok);
    let st = (await app.inject({ method: 'GET', url: '/api/admin/status', headers: { cookie: ac } })).json();
    expect(st.lock.locked).toBe(false);
    const inv = await app.inject({ method: 'POST', url: '/api/admin/settings', headers: { cookie: ac }, payload: { overrides: { treasureShare: 0.9, participationShare: 0.5 } } });
    expect(inv.statusCode).toBe(400);
    const save = await app.inject({ method: 'POST', url: '/api/admin/settings', headers: { cookie: ac }, payload: { overrides: { startCoins: 500, mapId: 3 } } });
    expect(save.statusCode).toBe(200); expect(save.json().overrides).toEqual({ startCoins: 500, mapId: 3 });
    const start = await app.inject({ method: 'POST', url: '/api/admin/season/start', headers: { cookie: ac } });
    expect(start.json().season.mapId).toBe(3);
    st = (await app.inject({ method: 'GET', url: '/api/admin/status', headers: { cookie: ac } })).json();
    expect(st.lock.locked).toBe(true);
    const locked = await app.inject({ method: 'POST', url: '/api/admin/settings', headers: { cookie: ac }, payload: { overrides: { startCoins: 1 } } });
    expect(locked.statusCode).toBe(423);
    // بازیکن با ورود بعدی به فصل تازه می‌پیوندد و سکه‌ی آغازین می‌گیرد
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json();
    expect(me.season.number).toBe(2); expect(me.player.coins).toBe(500);
  });
  it('manual deposit flow when no gateway is configured', async () => {
    const dep = (await app.inject({ method: 'POST', url: '/api/wallet/deposit', headers: { cookie }, payload: { amount: 100000 } })).json();
    expect(dep.manual).toBe(true);
    const ac = cookieOf(await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'admin-test' } }));
    await app.inject({ method: 'POST', url: `/api/admin/deposit/${dep.depositId}`, headers: { cookie: ac }, payload: { action: 'approve' } });
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json();
    expect(me.account.toman).toBe(100000);
  });
});
