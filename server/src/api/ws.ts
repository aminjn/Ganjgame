// وب‌سوکت: هر کلاینت ناحیه‌ای از نقشه را دنبال می‌کند و رویدادهای شخصی/کلن/فصل را می‌گیرد.
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { Ctx } from './ctx.js';
import type { GameEvent } from '../game/tick.js';
import type { Actor, ActorRef } from '../game/world.js';
import { playerIdOf } from './routes.js';

interface Client { ws: WebSocket; playerId: number | null; region: { x: number; y: number; r: number } | null }

export class Hub {
  clients = new Set<Client>();
  constructor(public ctx: Ctx) {}

  attach(app: FastifyInstance) {
    app.get('/ws', { websocket: true }, (socket, req) => {
      const c: Client = { ws: socket, playerId: playerIdOf(req, this.ctx.config.jwtSecret), region: null };
      this.clients.add(c);
      socket.on('message', (raw: Buffer) => {
        try {
          const m = JSON.parse(String(raw));
          if (m.type === 'sub') c.region = { x: Number(m.x) | 0, y: Number(m.y) | 0, r: Math.max(1, Math.min(60, Number(m.r) | 0 || 24)) };
          else if (m.type === 'ping') this.send(c, { type: 'pong', now: Date.now() });
        } catch { /* پیام نامعتبر نادیده */ }
      });
      socket.on('close', () => this.clients.delete(c));
      socket.on('error', () => this.clients.delete(c));
      this.send(c, { type: 'hello', now: Date.now(), season: this.ctx.views.season() });
    });
  }
  private send(c: Client, msg: any) { try { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); } catch { /* اتصال بسته */ } }
  private inRegion(c: Client, p: { x: number; y: number } | undefined) { return !!p && !!c.region && Math.abs(p.x - c.region.x) <= c.region.r && Math.abs(p.y - c.region.y) <= c.region.r; }
  private playersOf(ref: ActorRef): number[] { return ref.type === 'player' ? [ref.id] : this.ctx.w.memberIds(ref.id); }

  broadcast(msg: any) { for (const c of this.clients) this.send(c, msg); }
  notify(playerId: number, msg: any) { for (const c of this.clients) if (c.playerId === playerId) this.send(c, msg); }
  notifyClan(clanId: number | null, msg: any) { if (!clanId) return; const ids = new Set(this.ctx.w.memberIds(clanId)); for (const c of this.clients) if (c.playerId && ids.has(c.playerId)) this.send(c, msg); }
  notifyClanOfficers(clanId: number, msg: any) {
    const ids = new Set((this.ctx.db.prepare("SELECT player_id FROM clan_members WHERE clan_id = ? AND role IN ('commander','elder')").all(clanId) as any[]).map(r => r.player_id));
    for (const c of this.clients) if (c.playerId && ids.has(c.playerId)) this.send(c, msg);
  }
  seasonChanged() { this.broadcast({ type: 'season', season: this.ctx.views.season() }); }
  caravanChanged(a: Actor) {
    const m = this.ctx.w.migrationOf(a);
    const msg = { type: 'caravan', actor: { type: a.type, id: a.id, name: a.name }, pos: a.pos, next: m ? m.path[m.step] : null, target: m ? m.path[m.path.length - 1] : null, eta: m ? m.step_start + m.step_seconds * 1000 : null, active: !!m };
    for (const c of this.clients) if (this.inRegion(c, a.pos ?? undefined) || (m && this.inRegion(c, m.path[m.step]))) this.send(c, msg);
  }

  // رویدادهای تیک
  onEvent(ev: GameEvent) {
    const w = this.ctx.w;
    if (ev.data?.broadcast) { this.broadcast({ type: 'event', ev: { t: ev.t, kind: ev.kind, text: ev.text, tile: ev.tile } }); this.seasonChanged(); if (ev.kind === 'season') return; }
    if (ev.kind === 'tile' || ev.kind === 'tomb') {
      const msg = ev.kind === 'tile'
        ? { type: 'tile', tile: { x: ev.tile!.x, y: ev.tile!.y, ownerType: ev.data.owner_type, ownerId: ev.data.owner_id, owner: ev.data.name, guardian: ev.data.guardian, terrain: ev.data.terrain, at: ev.t } }
        : { type: 'tomb', tomb: ev.data };
      for (const c of this.clients) if (ev.kind === 'tomb' || this.inRegion(c, ev.tile)) this.send(c, msg);
      if (ev.kind === 'tomb') this.seasonChanged();
      return;
    }
    // رویداد شخصی: به بازیکن/اعضای کلن
    const ids = new Set(this.playersOf(ev.who));
    const personal = { type: 'event', ev: { t: ev.t, who: ev.who, kind: ev.kind, text: ev.text, tile: ev.tile, data: ev.data } };
    for (const c of this.clients) if (c.playerId && ids.has(c.playerId)) this.send(c, personal);
    if (ev.kind === 'win' || ev.kind === 'lose' || ev.kind === 'move') { try { this.caravanChanged(w.actor(ev.who)); } catch { /* بازیگر حذف شده */ } }
    if (ev.kind === 'artifact' || ev.kind === 'treasure') this.seasonChanged();
  }
}
