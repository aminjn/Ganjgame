// کنترل‌گر رابط بازی (حالت چندنفره): هر عددی که نمایش داده می‌شود از وضعیت واقعی سرور خوانده می‌شود.
// هیچ منطق بازی در کلاینت اجرا نمی‌شود؛ کلاینت فقط نمایش می‌دهد و کنش‌ها را به سرور می‌فرستد.
import * as C from '../rules/constants';
import type { Terrain, UnitType } from '../rules/constants';
import { defaultSettings, type Settings } from '../rules/settings';
import { MAPS, mapById, tileKey, euclid, createTerrain, monsterPowerAt, type TerrainGen } from '../rules/terrain';
import { armyPower, armyLuck, totalUnits, moveSeconds, ALL_UNITS, unitPowerOn, emptyUnits, type UnitCounts } from '../rules/combat';
import { xpProgress, cumulativeXp } from '../rules/level';
import { num, secs, dateTime, faDigits, pct } from '../rules/format';
import { World, type Markers } from '../render/world';
import { drawTerrainPreview, drawOverlay, MINI_COLORS } from './minimap';
import { ico, portrait, artifactIcon, setIconImages, setPortraits, setArtifactIcons } from './icons';
import { api, ApiError, Live } from '../net/client';

type Tab = 'map' | 'army' | 'shop' | 'wallet' | 'artifacts' | 'clan' | 'dashboard';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: 'نقشه', icon: 'home' }, { id: 'army', label: 'لشگر', icon: 'army' }, { id: 'shop', label: 'فروشگاه', icon: 'coin' }, { id: 'wallet', label: 'کیف پول', icon: 'toman' },
  { id: 'artifacts', label: 'آرتیفکت', icon: 'artifact' }, { id: 'clan', label: 'کلن', icon: 'share' }, { id: 'dashboard', label: 'داشبورد', icon: 'level' },
];

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string | number | null | undefined) => faDigits(String(s ?? '')).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

interface P { x: number; y: number }
interface ActorView {
  type: 'player' | 'clan'; id: number; name: string; units: UnitCounts; freeUnits: number; energy: number; coins: number; xp: number; level: number; gateLevel: number;
  progress: { level: number; into: number; need: number }; camp: P | null; pos: P | null; spentCoins: number; unitsBought: number; tiles: number;
  artifacts: { id: number; tombId: number; name: string }[]; artifactCount: number; power: number; moveSeconds: number; restCost: number;
  migration: { kind: string; path: P[]; step: number; stepStart: number; stepSeconds: number; from: P; eta: number } | null;
  inventory: { name: string; value: number; at: number }[]; log: { t: number; kind: string; text: string; x: number | null; y: number | null }[];
}
interface ClanView extends ActorView {
  role: string; officer: boolean; commanderId: number; memberCoins: number; createdAt: number; members: { playerId: number; name: string; weight: number; share: number; role: string }[];
  electionPeriod: number; nextElection: number; myVote: number | null; requests: { id: number; player_id: number; name: string; created_at: number }[]; chat: { id: number; player_id: number; name: string; t: number; text: string }[];
}
interface SeasonView {
  id: number; number: number; mapId: number; mapName: string; seed: number; pool: number; playersJoined: number; activePlayers: number; tilesOwned: number;
  treasure: { at: number; by: string; value: number } | null; participation: any; report: { at: number; rows: any[] } | null; endsAt: number | null; closedAt: number | null; closed: boolean;
  tombsRevealed: number; tombsTotal: number; prizes: { artifact: number; treasure: number; participation: number }; tombs: { id: number; name: string; x: number; y: number; captured: boolean; capturedBy: string | null }[];
  leaderboard?: { players: any[]; clans: any[] };
}
interface Me {
  account: { id: number; name: string; toman: number; blocked: number; iban: string; ownerName: string; control: 'player' | 'clan'; inSeason: boolean; quit: boolean; clanId: number | null };
  player: ActorView | null; clan: ClanView | null; myRequests: any[]; tx: any[]; tickets: any[]; withdrawals: any[]; deposits: any[]; offersMade: any[]; offersReceived: any[];
  season: SeasonView; settings: Partial<Settings>; now: number;
}
interface RegionTile { x: number; y: number; ownerType: 'player' | 'clan'; ownerId: number; owner: string; mine: boolean; guardian: UnitType | null; terrain: Terrain; at: number }
interface Region { cx: number; cy: number; r: number; tiles: Map<string, RegionTile>; caravans: any[]; locks: { x: number; y: number; by: string }[] }

export class Game {
  me: Me | null = null;
  season!: SeasonView;
  s: Settings = defaultSettings();
  gen!: TerrainGen;
  world!: World;
  live!: Live;
  region: Region = { cx: 500, cy: 500, r: 30, tiles: new Map(), caravans: [], locks: [] };
  tab: Tab = 'map';
  selected: P | null = null;
  tileCache: { key: string; at: number; info: any } | null = null;
  market: any[] = [];
  clans: any[] = [];
  minimapBase: ImageData | null = null;
  minimapSeason = -1;
  showMinimap = false;
  clockOffset = 0; // زمان سرور − زمان کلاینت
  online = false;
  busy = false;
  lastMeFetch = 0;
  lastRegionFetch = 0;
  mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  now() { return Date.now() + this.clockOffset; }
  get actor(): ActorView | null { if (!this.me) return null; return this.me.account.control === 'clan' && this.me.clan ? this.me.clan : this.me.player; }
  get clanMode() { return !!this.me && this.me.account.control === 'clan' && !!this.me.clan; }

  async boot() {
    const sess = await api('/session');
    this.applySeason(sess.season, sess.settings, sess.now);
    this.world = new World($('view') as HTMLCanvasElement, this.mobile);
    this.applyTerrainToWorld();
    this.world.onTap = t => this.selectTile(t);
    this.world.start();
    $('tabs').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (b) this.setTab(b.dataset.tab as Tab); });
    document.body.addEventListener('click', e => this.onAction(e));
    document.body.addEventListener('submit', e => { e.preventDefault(); this.onAction(e); });
    $('minimini').addEventListener('click', () => { this.showMinimap = !this.showMinimap; this.tab = 'map'; this.renderAll(); });
    this.live = new Live(m => this.onLive(m), c => { this.online = c; this.renderHud(); });
    this.live.start();
    if (sess.loggedIn) await this.refreshMe(); else this.renderModal();
    this.renderAll();
    await this.world.init();
    setIconImages(['coin', 'toman', 'energy', 'artifact', 'level', 'pool', 'treasure', 'share', 'season', 'luck', 'army', 'home'].filter(n => this.world.sprites.has('icons.' + n)));
    setPortraits(ALL_UNITS.filter(u => this.world.sprites.has(`units.${u}.idle`)));
    setArtifactIcons(['crown', 'crystal', 'medal', 'goblet', 'mask', 'dagger', 'coin', 'necklace', 'orb', 'scroll'].filter(n => this.world.sprites.has('artifacts.' + n)));
    this.focusHome(false);
    await this.refreshRegion(true);
    this.renderAll();
    setInterval(() => this.loop(), 250);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.refreshMe(); this.refreshRegion(true); } });
    const q = new URLSearchParams(location.search).get('deposit');
    if (q) { this.toast(q === 'ok' ? 'شارژ کیف پول با موفقیت انجام شد.' : q === 'cancelled' ? 'پرداخت لغو شد.' : 'پرداخت ناموفق بود.', q === 'ok' ? 'win' : 'lose'); history.replaceState(null, '', location.pathname); }
  }

  applySeason(season: SeasonView, settings: Partial<Settings>, serverNow: number) {
    const seasonChanged = !this.season || this.season.id !== season.id;
    this.season = season;
    this.s = Object.assign(defaultSettings(), settings);
    this.clockOffset = serverNow - Date.now();
    if (seasonChanged) { this.gen = createTerrain(mapById(season.mapId), this.s.valleyBlock, this.s.dangerBlob); this.minimapSeason = -1; if (this.world) this.applyTerrainToWorld(); }
  }
  applyTerrainToWorld() {
    this.world.setTerrain((x, y) => this.terrainAt(x, y), this.season.seed, () => false, (x, y) => this.region.tiles.has(tileKey(x, y)));
  }
  tombAt(x: number, y: number) { return this.season.tombs.find(t => !t.captured && t.x === x && t.y === y); }
  terrainAt(x: number, y: number): Terrain { return this.tombAt(x, y) ? 'tomb' : this.gen.at(x, y); }
  monstersAt(x: number, y: number): number { const s = this.s; return monsterPowerAt(this.terrainAt(x, y), x, y, s.monsters, s.monsterScaleStart, s.monsterScaleDiv, s.hellMinMult, s.hellMaxMult); }
  focusHome(animate: boolean) { const a = this.actor; const p = a?.pos ?? a?.camp ?? { x: C.CENTER, y: C.CENTER }; this.world.setFocus(p.x, p.y, animate); }

  // ---------- داده از سرور ----------
  setMe(me: Me) {
    this.me = me; this.lastMeFetch = Date.now();
    this.applySeason(me.season, me.settings, me.now);
    this.tileCache = null;
    if (!me.account.inSeason && !me.season.closed) this.toast('ظرفیت فصل پر است؛ فعلاً تماشاگر هستید.', 'info');
    this.renderAll();
  }
  async refreshMe() { try { this.setMe(await api('/me')); } catch (e: any) { if (e.code === 401) { this.me = null; this.renderModal(); } else this.toast(e.reason ?? 'خطا', 'lose'); } }
  async refreshRegion(force = false) {
    const f = this.world.target; const cx = Math.floor(f.x), cy = Math.floor(f.z);
    const far = Math.abs(cx - this.region.cx) > 12 || Math.abs(cy - this.region.cy) > 12;
    if (!force && !far && Date.now() - this.lastRegionFetch < 10000) return;
    this.lastRegionFetch = Date.now();
    try {
      const r = await api(`/region?x=${cx}&y=${cy}&r=30`);
      const tiles = new Map<string, RegionTile>(); for (const t of r.tiles) tiles.set(tileKey(t.x, t.y), t);
      const changed = tiles.size !== this.region.tiles.size || far;
      this.region = { cx, cy, r: 30, tiles, caravans: r.caravans, locks: r.locks };
      this.live.subscribe(cx, cy, 30);
      if (changed) this.world.invalidate();
    } catch { /* دفعه‌ی بعد */ }
  }
  onLive(m: any) {
    switch (m.type) {
      case 'hello': this.applySeason(m.season, this.s, m.now); break;
      case 'season': if (m.reset) { this.toast('فصل تازه آغاز شد؛ صفحه از نو بارگذاری می‌شود.', 'info'); setTimeout(() => location.reload(), 1500); } else { this.applySeason(m.season, this.s, this.now()); this.renderHud(); } break;
      case 'tile': { const t = m.tile; const me = this.me; const mine = !!me && (t.ownerType === 'clan' ? me.account.clanId === t.ownerId : (t.ownerId === me.account.id || (!!me.clan && me.clan.members.some(x => x.playerId === t.ownerId)))); this.region.tiles.set(tileKey(t.x, t.y), { ...t, mine }); this.tileCache = null; this.world.invalidate(); break; }
      case 'tomb': api('/session').then(s => this.applySeason(s.season, s.settings, s.now)).catch(() => {}); break;
      case 'caravan': { const i = this.region.caravans.findIndex(c => c.type === m.actor.type && c.id === m.actor.id); const self = !!this.me && ((m.actor.type === 'player' && m.actor.id === this.me.account.id) || (m.actor.type === 'clan' && m.actor.id === this.me.account.clanId)); const entry = { type: m.actor.type, id: m.actor.id, name: m.actor.name, pos: m.pos, next: m.next, target: m.target, eta: m.eta, self }; if (!m.active && !self) { if (i >= 0) this.region.caravans.splice(i, 1); } else if (i >= 0) this.region.caravans[i] = entry; else this.region.caravans.push(entry); if (self) this.refreshMe(); break; }
      case 'event': this.onEvent(m.ev); break;
      case 'offer': case 'clan': case 'chat': case 'ticket': case 'wallet': this.refreshMe(); break;
    }
  }
  onEvent(e: { t: number; kind: string; text: string; tile?: P; data?: any }) {
    if (e.text) this.toast(e.text, e.kind);
    if (e.tile) {
      const m = e.text.match(/تلفات: (\d+)/);
      if (e.kind === 'win') { const xp = e.text.match(/\+(\d+) تجربه/); if (xp) this.world.popText(e.tile, `+${faDigits(xp[1])} تجربه`, '#9df07a'); if (m) setTimeout(() => this.world.popText(e.tile!, `−${faDigits(m[1])}`, '#ff7f6e'), 350); }
      if (e.kind === 'lose') { this.world.popText(e.tile, 'شکست!', '#ff6b5a', true); if (m) setTimeout(() => this.world.popText(e.tile!, `−${faDigits(m[1])}`, '#ff7f6e'), 350); this.world.setFocus(e.tile.x, e.tile.y, true); }
      if (e.kind === 'loot') this.world.popText(e.tile, e.text.replace(' پیدا شد', '').split(' (')[0], '#ffe98a');
      if (e.kind === 'artifact') this.world.popText(e.tile, 'آرتیفکت!', '#d6b3ff', true);
    }
    if (e.kind === 'treasure') this.world.popText({ x: C.CENTER, y: C.CENTER }, 'گنج فتح شد!', '#ffe98a', true);
    if (e.kind === 'season') setTimeout(() => this.refreshMe(), 500);
    if (['win', 'lose', 'move', 'artifact', 'treasure', 'loot', 'clan'].includes(e.kind)) { this.refreshMe(); this.refreshRegion(true); }
  }
  toast(text: string, kind: string) {
    const d = document.createElement('div'); d.className = `toast ${kind}`; d.textContent = faDigits(text);
    const box = $('toasts'); box.prepend(d);
    while (box.children.length > 4) box.lastElementChild!.remove();
    setTimeout(() => d.remove(), 6000);
  }

  // ---------- حلقه‌ی نمایش ----------
  loop() {
    const a = this.actor;
    if (a?.migration && this.now() > a.migration.eta + 3000 && Date.now() - this.lastMeFetch > 3000) this.refreshMe(); // پشتیبان اگر رویداد وب‌سوکت نرسید
    this.refreshRegion();
    this.renderHud();
    this.renderMarkers();
    if (this.tab === 'map') this.renderTileCard(); else this.renderSheet();
    if ((this.miniTick++ & 7) === 0) this.drawMiniCorner();
  }
  miniTick = 0;
  miniBase: ImageData | null = null;
  miniSeason = -1;
  // نقشه‌ی کوچک همیشه‌نمایان گوشه‌ی نقشه: زمین + خانه‌ها + مقبره‌ها + کادر دید
  drawMiniCorner() {
    const c = document.getElementById('minimini') as HTMLCanvasElement | null; if (!c || !this.gen) return;
    c.classList.toggle('hidden', this.tab !== 'map');
    if (this.tab !== 'map') return;
    if (!this.miniBase || this.miniSeason !== this.season.id) { this.miniBase = drawTerrainPreview(c, (x, y) => this.gen.at(x, y), 140); this.miniSeason = this.season.id; }
    const marks: { x: number; y: number; color: string; r?: number }[] = [];
    for (const t of this.region.tiles.values()) marks.push({ x: t.x, y: t.y, color: !t.mine ? '#ff7a5c' : t.ownerType === 'clan' ? '#4fd6ff' : '#ffd54a', r: 1 });
    for (const t of this.season.tombs) if (!t.captured) marks.push({ x: t.x, y: t.y, color: '#b06cff', r: 2 });
    marks.push({ x: 500, y: 500, color: '#ffd54a', r: 2 });
    const a = this.actor; if (a?.camp) marks.push({ x: a.camp.x, y: a.camp.y, color: '#ffffff', r: 1.5 }); if (a?.pos) marks.push({ x: a.pos.x, y: a.pos.y, color: '#ff6b5a', r: 1.5 });
    drawOverlay(c, this.miniBase, marks);
    const ctx = c.getContext('2d')!; const f = this.world.target; const k = c.width / 1000; const b = this.world.viewBounds();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.strokeRect(b.minX * k, b.minZ * k, Math.max(3, (b.maxX - b.minX) * k), Math.max(3, (b.maxZ - b.minZ) * k)); void f;
  }

  // ---------- کنش‌ها ----------
  async call<T = any>(path: string, body?: unknown): Promise<T | null> {
    if (this.busy) return null; this.busy = true;
    try { const r = await api<T>(path, body ?? {}); return r; }
    catch (e: any) { this.toast(e instanceof ApiError ? e.reason : String(e), 'lose'); if (e.code === 401) { this.me = null; this.renderModal(); } return null; }
    finally { this.busy = false; }
  }
  async act(path: string, body?: unknown) { const r = await this.call<Me>(path, body); if (r && (r as any).account) this.setMe(r); else if (r) await this.refreshMe(); return r; }
  onAction(e: globalThis.Event) {
    const t = e.target as HTMLElement;
    const el = (e.type === 'submit' ? t : t.closest('[data-act]')) as HTMLElement | null;
    if (!el) return;
    const act = el.dataset.act; if (!act) return;
    const v = (id: string) => (el.querySelector(`[name=${id}]`) as HTMLInputElement | null)?.value ?? ($(id) as HTMLInputElement | null)?.value ?? '';
    const n = (id: string) => Number(v(id));
    const qty = () => Math.max(1, Math.floor(Number((el.parentElement!.querySelector('input') as HTMLInputElement).value) || 1));
    const control = this.me?.account.control ?? 'player';
    switch (act) {
      case 'login': this.call<Me>('/auth/login', { name: v('name'), password: v('password') }).then(r => { if (r) { this.closeModal(); this.setMe(r); this.focusHome(false); this.refreshRegion(true); } }); return;
      case 'register': this.call<Me>('/auth/register', { name: v('name'), password: v('password') }).then(r => { if (r) { this.closeModal(); this.setMe(r); this.focusHome(false); this.refreshRegion(true); this.showTutorial(); } }); return;
      case 'logout': this.call('/auth/logout').then(() => location.reload()); return;
      case 'tutorialClose': this.closeModal(); return;
      case 'deposit': this.call('/wallet/deposit', { amount: n('amount') }).then(r => { if (!r) return; if (r.manual) { this.toast(`درخواست شارژ ${num(r.amount)} تومان ثبت شد؛ پس از تأیید ادمین به کیف پول اضافه می‌شود.`, 'info'); this.refreshMe(); } else location.href = r.url; }); return;
      case 'buyCoins': this.act('/wallet/buy-coins', { n: n('amount') }); return;
      case 'setIban': this.act('/wallet/iban', { iban: v('iban'), ownerName: v('ownerName') }); return;
      case 'withdraw': this.act('/wallet/withdraw', { amount: n('amount') }); return;
      case 'withdrawAll': { const inp = $('withdrawAmount') as HTMLInputElement; inp.value = String(Math.max(0, (this.me?.account.toman ?? 0) - (this.me?.account.blocked ?? 0))); return; }
      case 'buyUnit': this.act('/units/buy', { type: el.dataset.unit, n: qty(), control }); return;
      case 'rest': this.act('/rest', { control }); return;
      case 'move': if (this.selected) { this.call('/move/start', { ...this.selected, control }).then(r => { if (r) { this.setMe(r.me); this.toast(r.plan.kind === 'free' ? 'سفر آغاز شد.' : `کوچ آغاز شد — تدارکات ${num(r.plan.cost)} سکه.`, 'info'); } }); } return;
      case 'cancelMove': this.act('/move/cancel', { control }); return;
      case 'focusCamp': { const c = this.actor?.camp; if (c) this.world.setFocus(c.x, c.y, true); return; }
      case 'focusCaravan': { const p = this.actor?.pos; if (p) this.world.setFocus(p.x, p.y, true); return; }
      case 'focusCenter': this.world.setFocus(C.CENTER, C.CENTER, true); return;
      case 'focusTile': { const x = Number(el.dataset.x), y = Number(el.dataset.y); this.world.setFocus(x, y, true); this.selectTile({ x, y }); this.setTab('map'); return; }
      case 'toggleMinimap': this.showMinimap = !this.showMinimap; this.renderTileCard(); return;
      case 'closeCard': this.selected = null; this.world.setSelection(null); this.renderTileCard(); return;
      case 'createClan': this.act('/clan/create', { name: v('clanName') }); return;
      case 'joinClan': this.act('/clan/join', { clanId: Number(el.dataset.id) }); return;
      case 'searchClans': this.loadClans(v('q')); return;
      case 'respondJoin': this.act('/clan/respond', { requestId: Number(el.dataset.id), accept: el.dataset.accept === '1' }); return;
      case 'clanDeposit': this.act('/clan/deposit', { amount: Math.max(1, Math.floor(n('amount') || this.s.clanDepositUnit)) }); return;
      case 'clanBuySoldier': this.act('/units/buy', { type: 'soldier', n: this.s.clanSoldierBuy, control: 'clan' }); return;
      case 'donate': this.act('/clan/donate', { type: el.dataset.unit, n: qty() }); return;
      case 'setClanCamp': if (this.selected) this.act('/clan/camp', this.selected); return;
      case 'vote': this.act('/clan/vote', { candidateId: Number(el.dataset.id) }); return;
      case 'chat': { const text = v('text'); if (!text.trim()) return; this.call('/clan/chat', { text }).then(r => { if (r) { const inp = el.querySelector('[name=text]') as HTMLInputElement | null; if (inp) inp.value = ''; this.refreshMe(); } }); return; }
      case 'control': this.act('/control', { control: el.dataset.id }).then(() => this.focusHome(true)); return;
      case 'offer': this.act('/market/offer', { artifactId: Number(el.dataset.id), amount: Number((el.parentElement!.querySelector('input') as HTMLInputElement).value) }); return;
      case 'offerRespond': this.act('/market/respond', { offerId: Number(el.dataset.id), accept: el.dataset.accept === '1' }); return;
      case 'offerWithdraw': this.act('/market/withdraw', { offerId: Number(el.dataset.id) }); return;
      case 'ticket': this.act('/support/ticket', { subject: v('subject'), body: v('body') }).then(r => { if (r) this.toast('تیکت ثبت شد.', 'info'); }); return;
      case 'quit': this.openModal(`<h2>انصراف از فصل</h2><p>همه‌چیز پاک می‌شود: سکه، تجربه، لشگر، خانه‌ها، آرتیفکت‌ها و انبار. فقط موجودی تومانی و شبا می‌ماند. مطمئنی؟</p><div class="row"><button class="danger" data-act="quitConfirm">بله، انصراف</button><button data-act="tutorialClose">نه</button></div>`); return;
      case 'quitConfirm': this.closeModal(); this.act('/season/quit').then(() => { this.selected = null; this.refreshRegion(true); }); return;
      case 'faq': location.href = 'faq.html'; return;
      default: return;
    }
  }
  async loadClans(q = '') { try { this.clans = await api(`/clans?q=${encodeURIComponent(q)}`); this.renderSheet(true); } catch { /* */ } }
  async loadMarket() { try { this.market = await api('/market'); this.renderSheet(true); } catch { /* */ } }
  async loadSeason() { try { const se = await api('/season'); this.season = { ...this.season, ...se }; this.renderSheet(true); } catch { /* */ } }

  setTab(t: Tab) { this.tab = t; if (t === 'artifacts') this.loadMarket(); if (t === 'clan' && !this.me?.clan) this.loadClans(); if (t === 'dashboard') this.loadSeason(); this.renderAll(); }
  selectTile(t: P) { this.selected = t; this.world.setSelection(t); this.tab = 'map'; this.renderAll(); this.fetchTile(t); }
  async fetchTile(t: P) {
    const key = tileKey(t.x, t.y);
    try { const info = await api(`/tile?x=${t.x}&y=${t.y}`); if (this.selected && tileKey(this.selected.x, this.selected.y) === key) { this.tileCache = { key, at: Date.now(), info }; this.renderTileCard(); } } catch { /* */ }
  }

  // ---------- رندر ----------
  renderAll() { this.renderHud(); this.renderTabs(); this.renderMapButtons(); if (this.tab === 'map') { $('sheet').classList.add('hidden'); this.renderTileCard(); } else { $('tilecard').classList.add('hidden'); this.renderSheet(true); } this.renderMarkers(); }
  renderTabs() { $('tabs').innerHTML = TABS.map(t => `<button data-tab="${t.id}" class="${t.id === this.tab ? 'active' : ''}">${ico(t.icon)}<span>${t.label}</span></button>`).join(''); }
  renderMapButtons() {
    const a = this.actor;
    $('mapbtns').innerHTML = `<button data-act="focusCamp">کمپ</button>${a?.pos ? '<button data-act="focusCaravan">کاروان</button>' : ''}<button data-act="focusCenter">گنج</button><button data-act="toggleMinimap">نمای کل</button>`;
  }
  renderHud() {
    const se = this.season, s = this.s, me = this.me, a = this.actor;
    let winner = '';
    if (se.treasure) {
      const left = se.endsAt ? Math.max(0, se.endsAt - this.now()) / 1000 : 0;
      winner = se.closed ? `<div class="winner">فصل ${faDigits(se.number)} بسته شد — برنده: ${esc(se.treasure.by)}</div>` : `<div class="winner">برنده‌ی فصل: ${esc(se.treasure.by)} — بستن فصل تا ${secs(left)}</div>`;
    }
    const xp = a ? a.progress : null;
    $('hud').innerHTML = `
      <span class="name">${this.clanMode ? '⚑ ' + esc(a!.name) : esc(me?.account.name ?? 'مهمان')}</span>
      <span class="badge">${ico('season')}فصل ${faDigits(se.number)}</span>
      ${xp ? `<span class="stat">${ico('level')}سطح <b>${num(xp.level)}</b> <span class="muted">(${num(xp.into)}/${num(xp.need)})</span></span>` : ''}
      ${a ? `<span class="stat">${ico('coin')}${this.clanMode ? 'خزانه' : 'سکه'} <b>${num(a.coins)}</b></span>` : ''}
      ${me ? `<span class="stat green">${ico('toman')}تومان <b>${num(me.account.toman)}</b></span>` : ''}
      <span class="stat cyan">${ico('pool')}استخر <b>${num(se.pool)}</b> تومان</span>
      <span class="stat">${ico('treasure')}گنج <b>${num(se.prizes.treasure)}</b> تومان</span>
      <span class="stat purple">${ico('artifact')}هر آرتیفکت <b>${num(se.prizes.artifact)}</b> تومان</span>
      <span class="stat green">${ico('share')}مشارکت <b>${num(se.prizes.participation)}</b> تومان</span>
      <span class="stat muted">${num(se.activePlayers)} بازیکن${this.online ? '' : ' — <span class="warn">آفلاین</span>'}</span>
      <span class="spacer"></span>
      <button class="help" data-act="faq">راهنما</button>
      ${winner}`;
  }
  renderMarkers() {
    const me = this.me, a = this.actor;
    const m = a?.migration ?? null;
    let caravan: Markers['caravan'] = null, caravanIdle: Markers['caravanIdle'] = null, path: Markers['path'] = null;
    if (m && a) {
      const from = m.step === 0 ? m.from : m.path[m.step - 1]; const to = m.path[m.step] ?? from;
      const progress = Math.max(0, Math.min(1, (this.now() - m.stepStart) / (m.stepSeconds * 1000)));
      caravan = { from, to, progress, clan: this.clanMode }; path = m.path.slice(m.step);
    } else if (a?.pos) caravanIdle = { at: a.pos, clan: this.clanMode };
    const owned: Markers['owned'] = [], guardians: Markers['guardians'] = [], camps: Markers['camps'] = [];
    for (const t of this.region.tiles.values()) { owned.push({ x: t.x, y: t.y, clan: t.ownerType === 'clan', other: !t.mine }); if (t.guardian) guardians.push({ x: t.x, y: t.y, type: t.guardian }); else if (!t.mine) camps.push({ at: { x: t.x, y: t.y }, clan: t.ownerType === 'clan' }); }
    const others = this.region.caravans.filter(c => !c.self && c.pos).map(c => ({ at: c.pos, name: c.name, clan: c.type === 'clan' }));
    this.world.setMarkers({
      caravanUnits: a?.units ?? emptyUnits(), guardians, camp: me?.player?.camp ?? null, clanCamp: me?.clan?.camp ?? null, caravan, caravanIdle,
      tombs: this.season.tombs.filter(t => !t.captured).map(t => ({ x: t.x, y: t.y })), owned, others, camps, treasure: { x: C.CENTER, y: C.CENTER }, path, participation: this.season.participation?.tile ?? null,
    });
  }

  renderTileCard() {
    const card = $('tilecard');
    if (this.tab !== 'map') { card.classList.add('hidden'); return; }
    const s = this.s, a = this.actor, me = this.me;
    let html = '';
    if (this.showMinimap) html += this.minimapHtml();
    if (me && !me.account.inSeason) html += `<div class="card"><h3>${this.season.closed ? 'فصل بسته شده است' : 'ظرفیت فصل پر است'}</h3><p class="muted">${this.season.closed ? 'با آغاز فصل تازه به‌طور خودکار وارد می‌شوید.' : 'جای تازه فقط با انصراف کسی باز می‌شود.'}</p></div>`;
    const m = a?.migration;
    if (m && a) {
      const left = Math.max(0, (m.eta - this.now()) / 1000);
      const p = m.path[m.step];
      const t = this.terrainAt(p.x, p.y); const mp = this.monstersAt(p.x, p.y);
      html += `<div class="card"><h3>کاروان ${this.clanMode ? 'کلن ' : ''}در راه است</h3>
        <div class="kv"><span>مقصد این قدم</span><span>(${num(p.x)}، ${num(p.y)}) ${esc(C.TERRAIN[t].name)}</span>
        <span>قدم</span><span>${num(m.step + 1)} از ${num(m.path.length)}</span>
        <span>موجودات</span><span>${num(mp)}</span>
        <span>قدرت لشگر روی این زمین</span><span>${num(armyPower(a.units, a.energy, t, s), 1)}</span>
        <span>زمان مانده</span><span>${secs(left)}</span></div>
        <div class="progress"><i style="width:${Math.round((1 - left / m.stepSeconds) * 100)}%"></i></div>
        <div class="row"><button class="danger" data-act="cancelMove">لغو کوچ (تدارکات برنمی‌گردد)</button></div></div>`;
    } else if (!this.selected) {
      if (!this.showMinimap && !html) { card.classList.add('hidden'); return; }
      if (!this.selected) html += `<p class="muted">یک خانه را روی نقشه بزن.</p>`;
    }
    if (this.selected) {
      const { x, y } = this.selected;
      const t = this.terrainAt(x, y); const rule = C.TERRAIN[t]; const mp = this.monstersAt(x, y);
      const own = this.region.tiles.get(tileKey(x, y));
      const tomb = this.tombAt(x, y);
      const lock = this.region.locks.find(l => l.x === x && l.y === y);
      const gate = t === 'danger' ? s.gates.danger : t === 'tomb' ? s.gates.tomb : (t === 'treasure' || t === 'hell') ? s.gates.treasure : 0;
      let chips = `<span class="chip">فاصله از مرکز ${num(Math.round(euclid(x, y)))}</span>`;
      if (rule.passable) chips += `<span class="chip">تدارکات ${num(s.supply[t])} سکه</span>`;
      if (mp > 0) chips += `<span class="chip warn">موجودات ${num(mp)}</span>`; else if (rule.passable) chips += `<span class="chip">بی‌موجود</span>`;
      if (gate) chips += `<span class="chip">ورود از سطح ${num(gate)}</span>`;
      if (t === 'treasure' || t === 'hell') chips += `<span class="chip">${num(s.treasureArtifacts)} آرتیفکت</span>`;
      if (tomb) chips += `<span class="chip gold">${esc(tomb.name)}</span>`;
      if (own) chips += `<span class="chip ${own.mine ? 'gold' : 'warn'}">مال ${esc(own.owner)}${own.mine ? ' (خودی)' : ''}${own.guardian ? ' — نگاهبان: ' + C.UNITS[own.guardian].name : ' — کمپ'}</span>`;
      if (lock && !own) chips += `<span class="chip warn">قفل — کاروانی در راه این خانه است</span>`;
      if (this.season.participation?.tile && this.season.participation.tile.x === x && this.season.participation.tile.y === y) chips += `<span class="chip gold">جایزه‌ی مشارکت این‌جا نشست</span>`;
      let action = '';
      const info = this.tileCache?.key === tileKey(x, y) ? this.tileCache.info : null;
      if (a && !m && me?.account.inSeason) {
        if (!info) action += `<p class="muted">در حال بررسی مسیر…</p>`;
        else if (info.plan) {
          const p = info.plan;
          const kindLabel = p.kind === 'free' ? 'سفر رایگان از مسیر خانه‌های خودی' : p.kind === 'long' ? `کوچ بلند (${num(p.steps)} خانه‌ی تازه)` : 'کوچ به خانه‌ی چسبیده';
          action += `<div class="kv"><span>نوع</span><span>${kindLabel}</span><span>تدارکات</span><span>${num(p.cost)} سکه</span><span>زمان تقریبی</span><span>${secs(p.seconds)}</span>`;
          if (p.encounters.count) action += `<span>خانه‌های موجوددار در مسیر</span><span>${num(p.encounters.count)}</span><span>مجموع قدرت موجودات</span><span>${num(p.encounters.totalPower)}</span><span>سخت‌ترین خانه</span><span>(${num(p.encounters.hardest.x)}، ${num(p.encounters.hardest.y)}) با ${num(p.encounters.hardest.power)}</span>`;
          action += `<span>قدرت لشگر تو</span><span>${num(p.army, 1)}${p.encounters.hardest && p.army < p.encounters.hardest.power / s.difficulty ? ' ⚠' : ''}</span></div>`;
          action += `<div class="row"><button class="gold" data-act="move">${p.kind === 'free' ? 'سفر' : 'کوچ'}</button>${this.clanCampButton(own)}</div>`;
        } else {
          action += `<p class="${info.planError === 'کاروان همین‌جاست' ? 'muted' : 'warn'}">${esc(info.planError)}</p>`;
          const b = this.clanCampButton(own); if (b) action += `<div class="row">${b}</div>`;
        }
      }
      html += `<div class="title"><b>${esc(rule.name)} (${num(x)}، ${num(y)})</b><button class="close" data-act="closeCard">✕</button></div><div class="chips">${chips}</div>${action}`;
    }
    if (card.dataset.html !== html) { card.innerHTML = html; card.dataset.html = html; }
    card.classList.remove('hidden');
    if (this.showMinimap) this.drawMinimap();
  }
  clanCampButton(own: RegionTile | undefined) {
    const me = this.me; if (!me?.clan || me.clan.camp || !own) return '';
    if (own.ownerType === 'player' && own.ownerId === me.account.id && me.clan.commanderId === me.account.id) return '<button data-act="setClanCamp">کمپ کلن این‌جا</button>';
    return '';
  }

  minimapHtml() {
    const m = mapById(this.season.mapId);
    return `<div id="minimapWrap"><canvas id="minimap"></canvas>
      <div class="muted center">نمای کل سرزمین — نقشه‌ی ${num(m.id)} از ${num(MAPS.length)}: «${esc(m.name)}» — ${esc(m.desc)}</div>
      <div class="legend">${(['safe', 'plain', 'mountain', 'marsh', 'danger', 'hell', 'valley'] as Terrain[]).map(t => `<span><i style="background:${MINI_COLORS[t]}"></i>${C.TERRAIN[t].name}</span>`).join('')}
      <span><i style="background:#b06cff"></i>مقبره</span><span><i style="background:#ffd54a"></i>گنج / خانه‌های تو</span><span><i style="background:#4fd6ff"></i>کلن</span><span><i style="background:#ff7a5c"></i>دیگران</span><span><i style="background:#ffffff"></i>کمپ</span></div></div>`;
  }
  drawMinimap() {
    const c = document.getElementById('minimap') as HTMLCanvasElement | null; if (!c) return;
    if (!this.minimapBase || this.minimapSeason !== this.season.id) { this.minimapBase = drawTerrainPreview(c, (x, y) => this.gen.at(x, y), 200); this.minimapSeason = this.season.id; }
    const marks: { x: number; y: number; color: string; r?: number }[] = [];
    for (const t of this.region.tiles.values()) marks.push({ x: t.x, y: t.y, color: !t.mine ? '#ff7a5c' : t.ownerType === 'clan' ? '#4fd6ff' : '#ffd54a', r: 1.2 });
    for (const t of this.season.tombs) if (!t.captured) marks.push({ x: t.x, y: t.y, color: '#b06cff', r: 2.5 });
    marks.push({ x: 500, y: 500, color: '#ffd54a', r: 2.5 });
    const me = this.me;
    if (me?.player?.camp) marks.push({ x: me.player.camp.x, y: me.player.camp.y, color: '#ffffff', r: 2 });
    if (me?.clan?.camp) marks.push({ x: me.clan.camp.x, y: me.clan.camp.y, color: '#4fd6ff', r: 2 });
    const a = this.actor; if (a?.pos) marks.push({ x: a.pos.x, y: a.pos.y, color: '#ff6b5a', r: 2 });
    if (c.width !== 200) c.width = 200;
    drawOverlay(c, this.minimapBase, marks);
  }

  renderSheet(force = false) {
    const sheet = $('sheet');
    if (this.tab === 'map') return;
    sheet.classList.remove('hidden');
    const focused = document.activeElement as HTMLElement | null;
    if (!force && focused && sheet.contains(focused) && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;
    if (!this.me) { sheet.innerHTML = '<div class="card"><p class="muted">برای دیدن این بخش وارد شوید.</p></div>'; return; }
    const html = { army: this.armyHtml, shop: this.shopHtml, wallet: this.walletHtml, artifacts: this.artifactsHtml, clan: this.clanHtml, dashboard: this.dashboardHtml, map: () => '' }[this.tab].call(this);
    if (sheet.dataset.html !== html) { sheet.innerHTML = html; sheet.dataset.html = html; }
  }
  noSeason() { return `<div class="card"><p class="muted">در این فصل حضور ندارید.</p></div>`; }

  armyHtml() {
    const a = this.actor; if (!a) return this.noSeason(); const s = this.s;
    let guardians = 0; for (const t of this.region.tiles.values()) if (t.mine && t.guardian && t.ownerType === a.type && t.ownerId === a.id) guardians++;
    const rows = ALL_UNITS.map(u => `<tr><td>${portrait(u, 'lg')}${C.UNITS[u].name}</td><td class="n">${num(a.units[u])}</td><td class="n">${num(unitPowerOn(u, null, s))}</td><td>${C.UNITS[u].bonusTerrains.length ? '×' + faDigits(String(s.terrainBonus)) + ' در ' + C.UNITS[u].bonusTerrains.map(t => C.TERRAIN[t].name).join('، ') : C.UNITS[u].speed ? 'سرعت کوچ' : C.UNITS[u].luck ? 'شانس ' + faDigits(String(s.explorerLuck)) : '—'}</td></tr>`).join('');
    return `<div class="card"><h3>${ico('army', 'lg')}لشگر ${this.clanMode ? 'کلن' : ''}</h3>
      <div class="kv"><span>نیروی آزاد</span><span>${num(totalUnits(a.units))}</span><span>خانه‌های تصاحب‌شده</span><span>${num(a.tiles)} (نگاهبان در دید: ${num(guardians)})</span>
      <span>انرژی</span><span>${num(a.energy, 0)} / ${num(C.ENERGY_MAX)}</span>
      <span>قدرت لشگر (دشت)</span><span>${num(armyPower(a.units, a.energy, 'plain', s), 1)}</span>
      <span>قدرت در کوهستان/مرداب</span><span>${num(armyPower(a.units, a.energy, 'mountain', s), 1)}</span>
      <span>قدرت در خطر/مقبره/گنج</span><span>${num(armyPower(a.units, a.energy, 'danger', s), 1)}</span>
      <span>شانس لشگر</span><span>${num(armyLuck(a.units, s), 1)}</span>
      <span>زمان هر کوچ</span><span>${secs(moveSeconds(a.units, s))}</span></div>
      <div class="progress"><i style="width:${Math.round(a.energy)}%"></i></div>
      <div class="row"><button data-act="rest" ${a.energy >= C.ENERGY_MAX ? 'disabled' : ''}>استراحت فوری (${num(a.restCost, 1)} سکه)</button></div>
      <p class="muted">هر کوچ ${num(s.energyPerMove)} انرژی می‌برد؛ وقتی کاروان در راه نیست ${faDigits(String(s.energyRegen))} واحد در ثانیه پر می‌شود. نیرو فروختنی یا حذف‌کردنی نیست و مرخصی ندارد.</p></div>
      <div class="card"><h3>نیروها</h3><table><tr><th>نیرو</th><th>تعداد</th><th>قدرت</th><th>ویژگی</th></tr>${rows}</table></div>`;
  }
  shopHtml() {
    const a = this.actor; if (!a) return this.noSeason(); const s = this.s;
    const items = ALL_UNITS.map(u => `<div class="unit"><div class="head">${portrait(u, 'xl')}<b>${C.UNITS[u].name}</b> <span class="res">${ico('coin')}${num(s.unitPrice[u])}</span></div><div class="muted">قدرت ${num(s.unitPower[u])}${C.UNITS[u].bonusTerrains.length ? '، ×' + faDigits(String(s.terrainBonus)) + ' در ' + C.UNITS[u].bonusTerrains.map(t => C.TERRAIN[t].name).join('، ') : ''}${C.UNITS[u].luck ? '، شانس ' + faDigits(String(s.explorerLuck)) : ''}${C.UNITS[u].speed ? '، ' + num(s.guidesForHalf) + ' نفر زمان کوچ را نصف می‌کند' : ''}</div>
      <div class="qty"><input type="number" min="1" value="10" /><button class="gold" data-act="buyUnit" data-unit="${u}">خرید</button></div></div>`).join('');
    return `<div class="card"><h3>فروشگاه (${this.clanMode ? 'با سکه‌ی خزانه‌ی کلن' : 'با سکه'})</h3><div class="kv"><span>${this.clanMode ? 'خزانه' : 'سکه'}</span><span>${num(a.coins)}</span></div></div>
      <div class="units">${items}</div>
      <p class="muted">آرتیفکت خریدنی از فروشگاه نیست؛ فقط با تصاحب مقبره یا معامله با بازیکن دیگر.</p>`;
  }
  walletHtml() {
    const me = this.me!, s = this.s, p = me.account;
    const txRows = me.tx.slice(0, 40).map(t => `<tr><td>${esc(t.note)}</td><td class="n">${t.amount >= 0 ? '+' : ''}${num(t.amount)}</td><td>${dateTime(t.t)}</td></tr>`).join('');
    const wd = me.withdrawals.map(w => `<tr><td>${w.kind === 'payout' ? 'واریز پایان فصل' : 'برداشت'}</td><td class="n">${num(w.amount)}</td><td>${w.status === 'pending' ? 'در انتظار' : w.status === 'paid' ? 'پرداخت شد' : 'رد شد'}${w.note ? ` — ${esc(w.note)}` : ''}</td><td>${dateTime(w.created_at)}</td></tr>`).join('');
    const dep = me.deposits.map(d => `<div class="warn">شارژ ${num(d.amount)} تومان (${d.gateway === 'manual' ? 'دستی' : 'درگاه'}) در انتظار تأیید — ${dateTime(d.created_at)}</div>`).join('');
    return `<div class="card"><h3>${ico('toman', 'lg')}کیف پول</h3>
      <div class="kv"><span>موجودی</span><span>${num(p.toman)} تومان</span><span>بلوکه‌شده در پیشنهادها</span><span>${num(p.blocked)} تومان</span><span>موجودی آزاد</span><span>${num(p.toman - p.blocked)} تومان</span></div>${dep}</div>
      <div class="card"><h3>شارژ کیف پول</h3><form data-act="deposit" class="row"><input name="amount" type="number" min="10000" step="1000" placeholder="مبلغ به تومان" required /><button class="primary">پرداخت</button></form><p class="muted">پرداخت از درگاه بانکی؛ اگر درگاه فعال نباشد درخواست ثبت می‌شود و ادمین پس از واریز تأیید می‌کند.</p></div>
      <div class="card"><h3>${ico('coin', 'lg')}خرید سکه</h3><p class="muted">هر سکه ${num(s.coinToman)} تومان. سقف هر بار ${num(s.buyCoinsMax)} سکه. هر خرید، استخر جایزه‌ی فصل را بزرگ می‌کند.</p>
      <form data-act="buyCoins" class="row"><input name="amount" type="number" min="1" placeholder="تعداد سکه" required /><button class="primary">خرید</button></form></div>
      <div class="card"><h3>شبا و برداشت</h3>
      <form data-act="setIban"><div class="row"><input name="iban" placeholder="IR + ۲۴ رقم" value="${esc(p.iban)}" /><input name="ownerName" placeholder="نام صاحب حساب" value="${esc(p.ownerName)}" /><button>ثبت</button></div></form>
      <form data-act="withdraw"><div class="row"><input id="withdrawAmount" name="amount" type="number" min="${s.withdrawMin}" placeholder="مبلغ برداشت (تومان)" /><button type="button" data-act="withdrawAll">کل موجودی</button><button class="primary">برداشت</button></div></form>
      <p class="muted">حداقل برداشت ${num(s.withdrawMin)} تومان، تا سقف موجودی آزاد، فقط با شبای ثبت‌شده. پول بلوکه‌شده برداشت‌کردنی نیست.</p>
      ${wd ? `<table><tr><th>نوع</th><th>مبلغ</th><th>وضعیت</th><th>زمان</th></tr>${wd}</table>` : ''}</div>
      <div class="card"><h3>تراکنش‌ها</h3><table>${txRows || '<tr><td class="muted">تراکنشی نیست</td></tr>'}</table></div>
      <div class="card"><h3>پشتیبانی</h3><form data-act="ticket"><div class="row"><input name="subject" placeholder="موضوع (دست‌کم ۳ نویسه)" /></div><div class="row"><textarea name="body" rows="3" placeholder="شرح (دست‌کم ۱۰ نویسه)"></textarea></div><div class="row"><button>ارسال تیکت</button><a href="faq.html">سوالات پرتکرار</a></div></form>
      ${me.tickets.map(t => `<div class="card"><b>${esc(t.subject)}</b> <span class="chip">${t.status === 'open' ? 'باز' : 'بسته'}</span><div class="muted">${esc(t.body)}</div>${t.reply ? `<div class="ok">پاسخ: ${esc(t.reply)}</div>` : ''}</div>`).join('')}</div>
      <div class="card"><h3>حساب</h3><div class="row"><button data-act="logout">خروج از حساب</button></div></div>
      <div class="card"><h3>انصراف از فصل</h3><p class="muted">فقط مشارکت خودت را پایان می‌دهد، نه فصل را.</p><button class="danger" data-act="quit">انصراف</button></div>`;
  }
  artifactsHtml() {
    const me = this.me!, s = this.s, se = this.season; const av = se.prizes.artifact;
    const mine = [...(me.player?.artifacts ?? []).map(a => ({ ...a, who: 'شخصی' })), ...(me.clan?.artifacts ?? []).map(a => ({ ...a, who: 'به نام کلن' }))];
    const list = mine.map(i => `<tr><td>${artifactIcon(i.tombId)}${esc(i.name)}</td><td>${i.who}</td><td class="n">${num(av)}</td></tr>`).join('');
    const tombs = se.tombs.filter(t => !t.captured).map(t => `<tr><td>${artifactIcon(t.id)}${esc(t.name)}</td><td class="n">(${num(t.x)}، ${num(t.y)})</td><td class="n">${num(Math.round(euclid(t.x, t.y)))}</td><td><button data-act="focusTile" data-x="${t.x}" data-y="${t.y}">نمایش</button></td></tr>`).join('');
    const market = this.market.filter(m => m.owner_id !== me.account.id).map(m => `<tr><td>${artifactIcon(m.tomb_id)}${esc(m.tomb_name)}</td><td>${esc(m.owner_name)}</td><td class="n">${num(m.open_offers)}</td><td><div class="qty"><input type="number" min="${s.offerMin}" step="1000" value="${Math.max(s.offerMin, av)}" /><button data-act="offer" data-id="${m.id}">پیشنهاد</button></div></td></tr>`).join('');
    const received = me.offersReceived.map(o => `<tr><td>${esc(o.tomb_name)}</td><td>${esc(o.bidder_name)}</td><td class="n">${num(o.amount)}</td><td>${dateTime(o.expires_at)}</td><td><button class="gold" data-act="offerRespond" data-id="${o.id}" data-accept="1">قبول</button> <button data-act="offerRespond" data-id="${o.id}" data-accept="0">رد</button></td></tr>`).join('');
    const made = me.offersMade.map(o => `<tr><td>${esc(o.tomb_name)}</td><td>${esc(o.owner_name)}</td><td class="n">${num(o.amount)}</td><td>${({ open: 'باز', accepted: 'قبول شد', rejected: 'رد شد', withdrawn: 'پس گرفته', expired: 'منقضی', cancelled: 'لغو' } as any)[o.status] ?? o.status}</td><td>${o.status === 'open' ? `<button data-act="offerWithdraw" data-id="${o.id}">پس گرفتن</button>` : ''}</td></tr>`).join('');
    return `<div class="card"><h3>${ico('artifact', 'lg')}آرتیفکت‌های تو</h3><p class="muted">ارزش هر آرتیفکت = ${pct(s.artifactShare)} استخر = ${num(av)} تومان. در پایان فصل خودکار فروخته می‌شود؛ شخصی کامل به خودت، کلنی به نسبت سهم.</p>
      <table><tr><th>نام</th><th>مالکیت</th><th>ارزش (تومان)</th></tr>${list || '<tr><td class="muted" colspan="3">هنوز آرتیفکتی نداری</td></tr>'}</table>
      <div class="kv"><span>آرتیفکت برای شرط گنج</span><span>${num(this.actor?.artifactCount ?? 0)} از ${num(s.treasureArtifacts)}</span></div></div>
      <div class="card"><h3>مقبره‌های نمایان (${num(se.tombs.filter(t => !t.captured).length)} از ${num(C.TOMBS_TOTAL)} نام)</h3><table><tr><th>نام</th><th>مختصات</th><th>فاصله</th><th></th></tr>${tombs}</table><p class="muted">ورود از سطح ${num(s.gates.tomb)}. با تصاحب هر مقبره آرتیفکتش همان لحظه به دست می‌آید و مقبره‌ی تازه‌ای دورترین جای ممکن از قلمروی تو ساخته می‌شود.</p></div>
      <div class="card"><h3>بازار آرتیفکت</h3><p class="muted">پیشنهاد با پول بلوکه‌شده (حداقل ${num(s.offerMin)} تومان)؛ مهلت پاسخ ۲۴ ساعت. پول بلوکه‌شده‌ی تو: ${num(me.account.blocked)} تومان.</p>
      <table><tr><th>آرتیفکت</th><th>مالک</th><th>پیشنهاد باز</th><th></th></tr>${market || '<tr><td class="muted" colspan="4">هیچ بازیکن دیگری آرتیفکتی ندارد.</td></tr>'}</table>
      ${received ? `<h4>پیشنهادهای رسیده</h4><table><tr><th>آرتیفکت</th><th>پیشنهاددهنده</th><th>مبلغ</th><th>مهلت</th><th></th></tr>${received}</table>` : ''}
      ${made ? `<h4>پیشنهادهای تو</h4><table><tr><th>آرتیفکت</th><th>مالک</th><th>مبلغ</th><th>وضعیت</th><th></th></tr>${made}</table>` : ''}</div>`;
  }
  clanHtml() {
    const me = this.me!, s = this.s, c = me.clan;
    if (!me.account.inSeason) return this.noSeason();
    if (!c) {
      const list = this.clans.map(k => `<tr><td>${esc(k.name)}</td><td>${esc(k.commander)}</td><td class="n">${num(k.level)}</td><td class="n">${num(k.members)}</td><td>${me.myRequests.some(r => r.clan_id === k.id) ? '<span class="chip">درخواست فرستاده شد</span>' : `<button data-act="joinClan" data-id="${k.id}">درخواست عضویت</button>`}</td></tr>`).join('');
      return `<div class="card"><h3>کلن</h3><p class="muted">ساخت کلن ${num(s.clanCreateCost)} سکه. سقف ${num(s.clanMaxMembers)} نفر. خروج از کلن ممکن نیست. با پیوستن، همه‌ی خانه‌هایت با کلن مشترک می‌شود.</p>
        <form data-act="createClan" class="row"><input name="clanName" placeholder="نام کلن" /><button class="primary">ساخت کلن</button></form></div>
        <div class="card"><h3>پیوستن به کلن</h3><form data-act="searchClans" class="row"><input name="q" placeholder="جستجوی نام کلن" /><button>جستجو</button></form>
        <table><tr><th>کلن</th><th>فرمانده</th><th>سطح</th><th>اعضا</th><th></th></tr>${list || '<tr><td class="muted" colspan="5">کلنی در این فصل نیست.</td></tr>'}</table></div>`;
    }
    const members = c.members.map(m => `<tr><td>${esc(m.name)}${m.role === 'commander' ? ' (فرمانده)' : m.role === 'elder' ? ' (ارشد)' : ''}</td><td class="n">${num(m.weight)}</td><td class="n">${pct(m.share)}</td><td>${c.myVote === m.playerId ? '<span class="chip gold">رأی تو</span>' : `<button data-act="vote" data-id="${m.playerId}">رأی</button>`}</td></tr>`).join('');
    const donate = ALL_UNITS.map(u => `<div class="unit"><div class="head">${portrait(u, 'lg')}<b>${C.UNITS[u].name}</b></div> <span class="muted">تو: ${num(me.player?.units[u] ?? 0)} — کلن: ${num(c.units[u])}</span><div class="qty"><input type="number" min="1" value="1" /><button data-act="donate" data-unit="${u}">اهدا</button></div></div>`).join('');
    const requests = c.officer && c.requests.length ? `<div class="card"><h3>درخواست‌های عضویت</h3><table>${c.requests.map(r => `<tr><td>${esc(r.name)}</td><td>${dateTime(r.created_at)}</td><td><button class="gold" data-act="respondJoin" data-id="${r.id}" data-accept="1">پذیرش</button> <button data-act="respondJoin" data-id="${r.id}" data-accept="0">رد</button></td></tr>`).join('')}</table></div>` : '';
    const chat = c.chat.map(m => `<div><b>${esc(m.name)}:</b> ${esc(m.text)} <time>${dateTime(m.t)}</time></div>`).join('');
    return `<div class="card"><h3>کلن «${esc(c.name)}»</h3>
      <div class="kv"><span>خزانه (فقط سکه)</span><span>${num(c.coins)}</span><span>سطح کلن</span><span>${num(c.level)} (${num(c.xp)} تجربه)</span><span>اعضا</span><span>${num(c.members.length)} از ${num(s.clanMaxMembers)}</span><span>کمپ کلن</span><span>${c.camp ? `(${num(c.camp.x)}، ${num(c.camp.y)})` : 'برپا نشده — فرمانده روی یکی از خانه‌های خودش می‌زند'}</span><span>آرتیفکت کلن</span><span>${num(c.artifacts.length)}</span><span>نقش تو</span><span>${c.role === 'commander' ? 'فرمانده' : c.role === 'elder' ? 'ارشد' : 'عضو'}</span><span>رأی‌گیری بعدی</span><span>${dateTime(c.nextElection)}</span></div>
      <form data-act="clanDeposit" class="row"><input name="amount" type="number" min="1" value="${s.clanDepositUnit}" /><button>واریز سکه به خزانه</button>${c.officer ? `<button type="button" data-act="clanBuySoldier">خرید ${num(s.clanSoldierBuy)} سرباز برای کلن</button>` : ''}</form>
      ${c.officer ? `<div class="row">${this.clanMode ? '<button data-act="control" data-id="player">بازگشت به اکانت خودم</button>' : '<button class="primary" data-act="control" data-id="clan">سوئیچ به اکانت کلن</button>'}</div>` : ''}
      <p class="muted">خزانه هیچ‌وقت پول (تومان) ندارد؛ پول آرتیفکت کلن همان لحظه به نسبت سهم به کیف پول اعضا می‌رود. اهدا برگشت‌ناپذیر است.</p></div>
      ${requests}
      <div class="card"><h3>سهم و رأی</h3><table><tr><th>عضو</th><th>وزن (سکه)</th><th>سهم</th><th></th></tr>${members}</table><p class="muted">سهم = سکه‌ی نیروهای اهدایی + سکه‌ی واریزی به خزانه + سکه‌ی تصاحب خانه‌هایی که با خود آورده. سهم پایه ندارد. وزن رأی همین عدد است؛ رأی‌گیری هر ${num(s.electionDays)} روز و رأی تا پایان دوره قابل تغییر است.</p></div>
      <div class="card"><h3>گفتگوی کلن</h3><div class="log chat">${chat || '<div class="muted">هنوز پیامی نیست</div>'}</div><form data-act="chat" class="row"><input name="text" maxlength="300" placeholder="پیام…" /><button>ارسال</button></form></div>
      <div class="card"><h3>اهدای نیرو (لحظه‌ای، با همان انرژی)</h3><div class="units">${donate}</div></div>`;
  }
  dashboardHtml() {
    const me = this.me!, s = this.s, se = this.season, m = mapById(se.mapId), a = this.actor;
    const logs = (a?.log ?? []).slice(0, 40).map(l => `<div><time>${dateTime(l.t)}</time>${esc(l.text)}</div>`).join('');
    const report = se.report ? `<div class="card"><h3>گزارش گنج نهایی (${dateTime(se.report.at)})</h3><table><tr><th>جایزه</th><th>برنده</th><th>ارزش</th><th>هزینه‌ی برنده</th></tr>${se.report.rows.map((r: any) => `<tr><td>${esc(r.title)}</td><td>${r.winner ? esc(r.winner) : '—'}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}</td><td class="n">${num(r.value)} تومان</td><td>${r.winner ? `${esc(r.costLabel)}: ${num(r.cost)} سکه (${num(r.costToman)} تومان)` : '—'}</td></tr>`).join('')}</table></div>` : '';
    const lb = se.leaderboard;
    const players = lb ? lb.players.slice(0, 20).map((p, i) => `<tr><td>${num(i + 1)}</td><td>${esc(p.name)}${p.id === me.account.id ? ' (تو)' : ''}</td><td class="n">${num(p.level)}</td><td class="n">${num(p.tiles)}</td><td class="n">${num(p.artifacts)}</td></tr>`).join('') : '';
    const clans = lb ? lb.clans.map((c, i) => `<tr><td>${num(i + 1)}</td><td>${esc(c.name)}</td><td class="n">${num(c.level)}</td><td class="n">${num(c.members)}</td><td class="n">${num(c.tiles)}</td></tr>`).join('') : '';
    return `<div class="card"><h3>دنیای بازی</h3><div class="kv">
      <span>فصل</span><span>${num(se.number)}</span>
      <span>نقشه</span><span>نقشه‌ی ${num(m.id)} از ${num(MAPS.length)} — «${esc(m.name)}»</span>
      <span>مشخصات نقشه</span><span>${esc(m.desc)}</span>
      <span>بازیکنان شرکت‌کننده در فصل</span><span>${num(se.playersJoined)} (فعال ${num(se.activePlayers)} — ظرفیت ${num(s.seasonMaxPlayers)})</span>
      <span>استخر جایزه</span><span>${num(se.pool)} تومان</span>
      <span>خانه‌های تصاحب‌شده در کل نقشه</span><span>${num(se.tilesOwned)}</span>
      <span>مقبره‌های نمایان / آشکارشده</span><span>${num(se.tombs.filter(t => !t.captured).length)} / ${num(se.tombsRevealed)}</span>
      <span>سطح ۵ / ۷ / ۱۰ (تجربه)</span><span>${num(cumulativeXp(5, s.xpLevel2, s.xpGrowth))} / ${num(cumulativeXp(7, s.xpLevel2, s.xpGrowth))} / ${num(cumulativeXp(10, s.xpLevel2, s.xpGrowth))}</span>
      ${a ? `<span>تجربه‌ی تو</span><span>${num(a.xp)} (سطح ${num(a.level)})</span><span>سکه‌ی خرج‌شده</span><span>${num(a.spentCoins)}</span>` : ''}
      <span>گنج اصلی</span><span>${se.treasure ? `فتح شد توسط ${esc(se.treasure.by)}` : 'فتح نشده'}</span></div>
      <div class="row"><button data-act="faq">سوالات پرتکرار</button></div></div>
      ${report}
      <div class="card"><h3>رتبه‌بندی فصل</h3>${players ? `<table><tr><th>#</th><th>بازیکن</th><th>سطح</th><th>خانه</th><th>آرتیفکت</th></tr>${players}</table>` : '<p class="muted">در حال بارگذاری…</p>'}
      <h4>۱۰ کلن برتر</h4>${clans ? `<table><tr><th>#</th><th>کلن</th><th>سطح</th><th>اعضا</th><th>خانه</th></tr>${clans}</table>` : '<p class="muted">کلنی در این فصل ساخته نشده است.</p>'}</div>
      <div class="card"><h3>لاگ فعالیت ${this.clanMode ? 'کلن' : 'تو'}</h3><div class="log">${logs || '<div class="muted">هنوز رویدادی نیست</div>'}</div></div>
      <div class="card"><h3>اشیای پیداشده</h3>${a?.inventory.length ? `<table>${a.inventory.map(i => `<tr><td>${esc(i.name)}</td><td class="n">${num(i.value)} سکه</td><td>${dateTime(i.at)}</td></tr>`).join('')}</table>` : '<p class="muted">هنوز چیزی پیدا نشده</p>'}</div>`;
  }

  // ---------- مودال ----------
  renderModal() {
    if (this.me) return;
    this.openModal(`<h2>به بازی گنج خوش آمدی</h2><p class="muted">با نام یکتا و گذرواژه وارد شو؛ فقط همین نام برای بقیه دیده می‌شود.</p>
      <form data-act="login"><div class="row"><input name="name" placeholder="نام بازیکن" minlength="3" maxlength="20" required autofocus /><input name="password" type="password" placeholder="گذرواژه" minlength="6" required /></div><div class="row"><button class="primary">ورود</button></div></form>
      <p class="muted">حساب نداری؟</p>
      <form data-act="register"><div class="row"><input name="name" placeholder="نام تازه" minlength="3" maxlength="20" required /><input name="password" type="password" placeholder="گذرواژه (دست‌کم ۶ نویسه)" minlength="6" required /></div><div class="row"><button>ثبت نام</button></div></form>`);
  }
  showTutorial() {
    const s = this.s;
    this.openModal(`<h2>آموزش کوتاه</h2>
      <p>۱. با تومان سکه بخر (هر سکه ${num(s.coinToman)} تومان). هر خرید استخر جایزه را بزرگ می‌کند.</p>
      <p>۲. با سکه نیرو بخر؛ برای تصاحب هر خانه دست‌کم ۲ نیروی آزاد لازم است و ارزان‌ترین نیرو نگاهبان می‌ماند.</p>
      <p>۳. روی نقشه یک خانه‌ی چسبیده به قلمروت را بزن و کوچ کن (${num(s.moveSeconds)} ثانیه). کوچ بلند تا ${num(s.longMoveMax)} خانه با پیش‌پرداخت.</p>
      <p>۴. سرزمین خطر از سطح ${num(s.gates.danger)}، مقبره از سطح ${num(s.gates.tomb)}، گنج اصلی از سطح ${num(s.gates.treasure)} با ${num(s.treasureArtifacts)} آرتیفکت.</p>
      <p>۵. هرکس اول به گنج در مرکز (${num(C.CENTER)}، ${num(C.CENTER)}) برسد برنده‌ی فصل است. دو بازیکن نمی‌توانند همزمان به یک خانه کوچ کنند؛ اولی خانه را قفل می‌کند.</p>
      <div class="row"><button class="primary" data-act="tutorialClose">شروع</button></div>`);
  }
  openModal(html: string) { $('modal').innerHTML = `<div class="modal"><div class="box">${html}</div></div>`; }
  closeModal() { $('modal').innerHTML = ''; }
}
