// کنترل‌گر رابط بازی: هر عددی که نمایش داده می‌شود از وضعیت واقعی خوانده می‌شود.
import * as C from '../rules/constants';
import type { Terrain, UnitType } from '../rules/constants';
import type { Settings } from '../rules/settings';
import { MAPS, mapById, tileKey, euclid, type TerrainGen } from '../rules/terrain';
import * as S from '../rules/state';
import type { State, Ctx, ActorId, Event } from '../rules/state';
import { armyPower, armyLuck, totalUnits, moveSeconds, ALL_UNITS, unitPowerOn } from '../rules/combat';
import { xpProgress, cumulativeXp } from '../rules/level';
import { artifactValue, treasureValue, participationValue } from '../rules/economy';
import { num, toman, coins, secs, dateTime, faDigits, pct } from '../rules/format';
import { Rng } from '../rules/rng';
import { World, type Markers } from '../render/world';
import { loadSettings, readCmd, readSeason, writeSeason, readTickets, writeTickets, readStateRaw, writeStateRaw, readLock, writeLock, type Ticket } from './storage';
import { drawTerrainPreview, drawOverlay, MINI_COLORS } from './minimap';
import { ico, UNIT_ICON } from './icons';

type Tab = 'map' | 'army' | 'shop' | 'wallet' | 'artifacts' | 'clan' | 'dashboard';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: 'نقشه', icon: 'home' }, { id: 'army', label: 'لشگر', icon: 'army' }, { id: 'shop', label: 'فروشگاه', icon: 'coin' }, { id: 'wallet', label: 'کیف پول', icon: 'toman' },
  { id: 'artifacts', label: 'آرتیفکت', icon: 'artifact' }, { id: 'clan', label: 'کلن', icon: 'guard' }, { id: 'dashboard', label: 'داشبورد', icon: 'level' },
];

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => faDigits(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export class Game {
  st!: State;
  s!: Settings;
  gen!: TerrainGen;
  world!: World;
  tab: Tab = 'map';
  selected: { x: number; y: number } | null = null;
  profile = Math.random().toString(36).slice(2);
  owner = false;
  minimapBase: ImageData | null = null;
  minimapSeason = -1;
  showMinimap = false;
  lastSave = 0;
  dirty = false;
  mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

  async boot() {
    this.s = loadSettings();
    const raw = readStateRaw();
    let tampered = false;
    if (raw) { const r = S.deserialize(raw); if (r.state) { this.st = r.state; tampered = r.tampered; } }
    if (!this.st) this.st = S.newState(this.s, readSeason()?.season ?? 1, (Date.now() % 2147483647) | 0, Date.now());
    this.gen = S.makeGen(this.st, this.s);
    S.sanitize(this.st, this.s, this.gen);
    if (tampered) this.toast('وضعیت ذخیره‌شده دستکاری شده بود و سخت‌گیری شد.', 'lose');
    this.ensureSeasonMark();

    this.world = new World($('view') as HTMLCanvasElement, this.mobile);
    this.applyTerrainToWorld();
    this.world.onTap = t => this.selectTile(t);
    const focus = S.currentActor(this.st).pos ?? this.st.player.camp!;
    this.world.setFocus(focus.x, focus.y);
    this.world.start();
    this.renderAll();
    await this.world.init();
    this.world.setFocus(focus.x, focus.y);
    this.renderMarkers();

    $('tabs').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (b) this.setTab(b.dataset.tab as Tab); });
    document.body.addEventListener('click', e => this.onAction(e));
    document.body.addEventListener('submit', e => { e.preventDefault(); this.onAction(e); });
    setInterval(() => this.loop(), 250);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.loop(); });
    window.addEventListener('beforeunload', () => this.save(true));
  }

  private ensureSeasonMark() {
    const m = readSeason();
    if (!m || m.season !== this.st.season) writeSeason({ season: this.st.season, startedAt: this.st.createdAt, startedByAdmin: this.st.startedByAdmin, closed: this.st.seasonClosed, lastCmd: m?.lastCmd ?? 0 });
  }

  applyTerrainToWorld() {
    this.world.setTerrain((x, y) => S.terrainAt(this.st, this.gen, x, y), this.st.seed, (x, y) => !!this.st.owned[tileKey(x, y)] && false);
  }

  ctx(): Ctx { return { s: this.s, gen: this.gen, now: Date.now() }; }

  // ---------- حلقه ----------
  loop() {
    const now = Date.now();
    const lock = readLock();
    if (!lock || lock.owner === this.profile || now - lock.at > 3000) {
      this.owner = true;
      writeLock({ owner: this.profile, at: now });
      this.checkAdminCmd();
      const events = S.tick(this.st, this.ctx());
      for (const e of events) this.onEvent(e);
      if (events.length) this.dirty = true;
      if (this.dirty || now - this.lastSave > 5000) this.save();
    } else {
      // نمایه‌ی دیگری مالک ساعت است: وضعیت تازه را می‌خوانیم و خودمان را خاموش نمی‌کنیم
      this.owner = false;
      const raw = readStateRaw();
      if (raw) { const r = S.deserialize(raw); if (r.state && r.state.lastTick > this.st.lastTick) { const seasonChanged = r.state.season !== this.st.season; this.st = r.state; if (seasonChanged) { this.s = loadSettings(); this.gen = S.makeGen(this.st, this.s); this.applyTerrainToWorld(); } } }
    }
    this.renderHud();
    this.renderMarkers();
    if (this.tab === 'map') this.renderTileCard(); else this.renderSheet();
  }

  save(force = false) {
    if (!this.owner && !force) return;
    writeStateRaw(S.serialize(this.st));
    this.lastSave = Date.now(); this.dirty = false;
  }

  checkAdminCmd() {
    const cmd = readCmd(); if (!cmd) return;
    const m = readSeason();
    if (m && m.lastCmd >= cmd.id) return;
    // آغاز فصل تازه با فرمان ادمین: تنظیمات و نقشه از نو خوانده می‌شود، دنیا ساخته می‌شود
    this.s = loadSettings();
    this.st = S.quitSeason(this.st, this.s, Date.now(), true);
    this.gen = S.makeGen(this.st, this.s);
    writeSeason({ season: this.st.season, startedAt: this.st.createdAt, startedByAdmin: true, closed: false, lastCmd: cmd.id });
    this.minimapSeason = -1; this.selected = null;
    this.applyTerrainToWorld();
    const c = this.st.player.camp!; this.world.setFocus(c.x, c.y);
    this.save(true);
    this.toast(`فصل ${faDigits(this.st.season)} با فرمان ادمین آغاز شد — نقشه‌ی «${mapById(this.st.mapId).name}».`, 'info');
    this.renderAll();
  }

  onEvent(e: Event) {
    this.toast(e.text, e.kind);
    if (e.kind === 'win' || e.kind === 'lose') { this.dirty = true; }
    if (e.kind === 'treasure' || e.kind === 'season') { writeSeason({ ...(readSeason() ?? { season: this.st.season, startedAt: this.st.createdAt, startedByAdmin: this.st.startedByAdmin, lastCmd: 0 }), closed: this.st.seasonClosed }); }
    if (e.kind === 'lose' && e.tile) { const c = S.actorOf(this.st, e.who).camp; if (c) this.world.setFocus(c.x, c.y, true); }
  }

  toast(text: string, kind: string) {
    const d = document.createElement('div'); d.className = `toast ${kind}`; d.textContent = faDigits(text);
    const box = $('toasts'); box.prepend(d);
    while (box.children.length > 4) box.lastElementChild!.remove();
    setTimeout(() => d.remove(), 6000);
  }

  // ---------- کنش‌ها ----------
  onAction(e: globalThis.Event) {
    const t = e.target as HTMLElement;
    const el = (e.type === 'submit' ? t : t.closest('[data-act]')) as HTMLElement | null;
    if (!el) return;
    const act = el.dataset.act; if (!act) return;
    const now = Date.now();
    const v = (id: string) => (el.querySelector(`[name=${id}]`) as HTMLInputElement | null)?.value ?? ($(id) as HTMLInputElement | null)?.value ?? '';
    const n = (id: string) => Number(v(id));
    const id: ActorId = this.st.control;
    let r: S.Result | null = null;
    switch (act) {
      case 'register': r = S.registerName(this.st, v('name'), now); if (r.ok) { this.closeModal(); this.showTutorial(); } break;
      case 'tutorialClose': this.closeModal(); break;
      case 'deposit': r = S.deposit(this.st, n('amount'), now); break;
      case 'buyCoins': r = S.buyCoins(this.st, this.s, n('amount'), now); break;
      case 'setIban': r = S.setIban(this.st, v('iban'), v('ownerName')); break;
      case 'withdraw': r = S.withdraw(this.st, this.s, n('amount'), now); break;
      case 'withdrawAll': { const inp = $('withdrawAmount') as HTMLInputElement; inp.value = String(Math.max(0, this.st.player.toman - this.st.player.blocked)); return; }
      case 'buyUnit': { const type = el.dataset.unit as UnitType; const q = Math.max(1, Math.floor(Number((el.parentElement!.querySelector('input') as HTMLInputElement).value) || 1)); r = S.buyUnits(this.st, this.s, id, type, q, now); break; }
      case 'rest': r = S.rest(this.st, this.s, id, now); break;
      case 'move': if (this.selected) { r = S.startMove(this.st, this.ctx(), id, this.selected); if (r.ok) { this.dirty = true; } } break;
      case 'cancelMove': r = S.cancelMove(this.st, now); break;
      case 'focusCamp': { const c = S.actorOf(this.st, id).camp; if (c) this.world.setFocus(c.x, c.y, true); return; }
      case 'focusCaravan': { const p = S.actorOf(this.st, id).pos; if (p) this.world.setFocus(p.x, p.y, true); return; }
      case 'focusCenter': this.world.setFocus(C.CENTER, C.CENTER, true); return;
      case 'focusTile': { const x = Number(el.dataset.x), y = Number(el.dataset.y); this.world.setFocus(x, y, true); this.selectTile({ x, y }); this.setTab('map'); return; }
      case 'toggleMinimap': this.showMinimap = !this.showMinimap; this.renderTileCard(); return;
      case 'closeCard': this.selected = null; this.world.setSelection(null); this.renderTileCard(); return;
      case 'createClan': r = S.createClan(this.st, this.s, v('clanName'), now); break;
      case 'clanDeposit': r = S.clanDeposit(this.st, this.s, this.s.clanDepositUnit, now); break;
      case 'clanBuySoldier': r = S.buyUnits(this.st, this.s, 'clan', 'soldier', this.s.clanSoldierBuy, now); break;
      case 'donate': { const type = el.dataset.unit as UnitType; const q = Math.max(1, Math.floor(Number((el.parentElement!.querySelector('input') as HTMLInputElement).value) || 1)); r = S.donateUnits(this.st, this.s, type, q, now); break; }
      case 'setClanCamp': if (this.selected) r = S.setClanCamp(this.st, this.selected, now); break;
      case 'control': r = S.switchControl(this.st, el.dataset.id as ActorId); if (r.ok) { const p = S.currentActor(this.st).pos; if (p) this.world.setFocus(p.x, p.y, true); } break;
      case 'ticket': r = this.sendTicket(v('subject'), v('body')); break;
      case 'quit': this.openModal(`<h2>انصراف از فصل</h2><p>همه‌چیز پاک می‌شود: سکه، استخر جایزه، تجربه، لشگر، خانه‌ها، آرتیفکت‌ها، کلن و نام. فقط موجودی تومانی و شبا می‌ماند. مطمئنی؟</p><div class="row"><button class="danger" data-act="quitConfirm">بله، انصراف</button><button data-act="tutorialClose">نه</button></div>`); return;
      case 'quitConfirm': this.st = S.quitSeason(this.st, this.s, now); this.gen = S.makeGen(this.st, this.s); this.minimapSeason = -1; this.selected = null; this.applyTerrainToWorld(); this.ensureSeasonMark(); this.save(true); this.closeModal(); { const c = this.st.player.camp!; this.world.setFocus(c.x, c.y); } this.renderAll(); return;
      case 'faq': location.href = 'faq.html'; return;
      default: return;
    }
    if (r) { if (!r.ok) this.toast(faDigits(r.reason), 'lose'); else { this.dirty = true; this.save(true); } }
    this.renderAll();
  }

  sendTicket(subject: string, body: string): S.Result {
    subject = subject.trim(); body = body.trim();
    if (subject.length < 3) return { ok: false, reason: 'موضوع دست‌کم ۳ نویسه' };
    if (body.length < 10) return { ok: false, reason: 'شرح دست‌کم ۱۰ نویسه' };
    const tickets = readTickets();
    const mine = tickets.filter(t => t.player === (this.st.player.name ?? '') && t.status === 'open');
    if (mine.length >= C.SUPPORT_MAX_OPEN) return { ok: false, reason: `هر بازیکن همزمان حداکثر ${C.SUPPORT_MAX_OPEN} تیکت باز دارد` };
    tickets.unshift({ id: Date.now(), player: this.st.player.name ?? '', subject, body, status: 'open', createdAt: Date.now() });
    writeTickets(tickets);
    return { ok: true };
  }

  setTab(t: Tab) { this.tab = t; this.renderAll(); }

  selectTile(t: { x: number; y: number }) {
    this.selected = t; this.world.setSelection(t); this.tab = 'map'; this.renderAll();
  }

  // ---------- رندر ----------
  renderAll() { this.renderHud(); this.renderTabs(); this.renderMapButtons(); if (this.tab === 'map') { $('sheet').classList.add('hidden'); this.renderTileCard(); } else { $('tilecard').classList.add('hidden'); this.renderSheet(); } this.renderMarkers(); this.renderModal(); }

  renderTabs() {
    $('tabs').innerHTML = TABS.map(t => `<button data-tab="${t.id}" class="${t.id === this.tab ? 'active' : ''}">${ico(t.icon)}<span>${t.label}</span></button>`).join('');
  }

  renderMapButtons() {
    const a = S.currentActor(this.st);
    $('mapbtns').innerHTML = `<button data-act="focusCamp">کمپ</button>${a.pos ? '<button data-act="focusCaravan">کاروان</button>' : ''}<button data-act="focusCenter">گنج</button><button data-act="toggleMinimap">نمای کل</button>`;
  }

  renderHud() {
    const st = this.st, s = this.s;
    const a = S.currentActor(st);
    const xp = xpProgress(a.xp, s.xpLevel2, s.xpGrowth);
    const clanMode = st.control === 'clan';
    let winner = '';
    if (st.treasure) {
      const left = st.seasonEndsAt ? Math.max(0, st.seasonEndsAt - Date.now()) / 1000 : 0;
      winner = st.seasonClosed ? `<div class="winner">فصل ${faDigits(st.season)} بسته شد — برنده: ${esc(S.actorName(st, st.treasure.by))}</div>`
        : `<div class="winner">برنده‌ی فصل: ${esc(S.actorName(st, st.treasure.by))} — بستن فصل تا ${secs(left)}</div>`;
    }
    $('hud').innerHTML = `
      <span class="name">${clanMode ? '⚑ ' + esc(st.clan!.name) : esc(st.player.name ?? 'بی‌نام')}</span>
      <span class="badge">${ico('season')}فصل ${faDigits(st.season)}</span>
      <span class="stat">${ico('level')}سطح <b>${num(xp.level)}</b> <span class="muted">(${num(xp.into)}/${num(xp.need)})</span></span>
      <span class="stat">${ico('coin')}${clanMode ? 'خزانه' : 'سکه'} <b>${num(S.coinsOf(st, st.control))}</b></span>
      <span class="stat green">${ico('toman')}تومان <b>${num(st.player.toman)}</b></span>
      <span class="stat cyan">${ico('pool')}استخر <b>${num(st.pool)}</b> تومان</span>
      <span class="stat">${ico('treasure')}گنج <b>${num(treasureValue(st.pool, s))}</b> تومان</span>
      <span class="stat purple">${ico('artifact')}هر آرتیفکت <b>${num(artifactValue(st.pool, s))}</b> تومان</span>
      <span class="stat green">${ico('share')}مشارکت <b>${num(participationValue(st.pool, s))}</b> تومان</span>
      <span class="spacer"></span>
      <button class="help" data-act="faq">راهنما</button>
      ${winner}`;
  }

  renderMarkers() {
    const st = this.st;
    const a = S.currentActor(st);
    const m = st.migration;
    let caravan: Markers['caravan'] = null;
    let caravanIdle: Markers['caravanIdle'] = null;
    let path: Markers['path'] = null;
    if (m) {
      const act = S.actorOf(st, m.actor);
      const from = m.step === 0 ? m.from : m.path[m.step - 1];
      const to = m.path[m.step];
      const progress = Math.max(0, Math.min(1, (Date.now() - m.stepStart) / (m.stepSeconds * 1000)));
      caravan = { from, to, progress, clan: m.actor === 'clan' };
      path = m.path.slice(m.step);
      void act;
    } else if (a.pos) caravanIdle = { at: a.pos, clan: st.control === 'clan' };
    const owned = Object.entries(st.owned).map(([k, o]) => { const [x, y] = k.split(',').map(Number); return { x, y, clan: o.owner === 'clan' }; });
    const guardians = Object.entries(st.owned).filter(([, o]) => o.guardian).map(([k, o]) => { const [x, y] = k.split(',').map(Number); return { x, y, type: o.guardian! }; });
    const caravanUnits = m ? S.actorOf(st, m.actor).units : a.units;
    this.world.setMarkers({
      caravanUnits, guardians,
      camp: st.player.camp, clanCamp: st.clan?.camp ?? null, caravan, caravanIdle, tombs: st.tombs.filter(t => !t.captured).map(t => ({ x: t.x, y: t.y })),
      owned, treasure: { x: C.CENTER, y: C.CENTER }, path, participation: st.participation?.tile ?? null,
    });
  }

  tileInfo(x: number, y: number) {
    const st = this.st;
    const t = S.terrainAt(st, this.gen, x, y);
    const mp = S.monstersAt(st, this.ctx(), x, y);
    const o = st.owned[tileKey(x, y)];
    const tomb = S.tombAt(st, x, y);
    return { t, mp, o, tomb, d: euclid(x, y) };
  }

  renderTileCard() {
    const card = $('tilecard');
    if (this.tab !== 'map') { card.classList.add('hidden'); return; }
    const st = this.st, s = this.s, id = st.control;
    const a = S.currentActor(st);
    let html = '';
    if (this.showMinimap) { html += this.minimapHtml(); }
    if (st.migration) {
      const m = st.migration;
      const left = Math.max(0, (m.stepStart + m.stepSeconds * 1000 - Date.now()) / 1000);
      const p = m.path[m.step];
      const info = this.tileInfo(p.x, p.y);
      html += `<div class="card"><h3>کاروان ${m.actor === 'clan' ? 'کلن ' : ''}در راه است</h3>
        <div class="kv"><span>مقصد این قدم</span><span>(${num(p.x)}، ${num(p.y)}) ${esc(C.TERRAIN[info.t].name)}</span>
        <span>قدم</span><span>${num(m.step + 1)} از ${num(m.path.length)}</span>
        <span>موجودات</span><span>${num(info.mp)}</span>
        <span>قدرت لشگر روی این زمین</span><span>${num(armyPower(S.actorOf(st, m.actor).units, S.actorOf(st, m.actor).energy, info.t, s), 1)}</span>
        <span>زمان مانده</span><span>${secs(left)}</span></div>
        <div class="progress"><i style="width:${Math.round((1 - left / m.stepSeconds) * 100)}%"></i></div>
        <div class="row"><button class="danger" data-act="cancelMove">لغو کوچ (تدارکات برنمی‌گردد)</button></div></div>`;
    } else if (!this.selected) {
      if (!this.showMinimap) { card.classList.add('hidden'); return; }
      html += `<p class="muted">یک خانه را روی نقشه بزن.</p>`;
    }
    if (this.selected) {
      const { x, y } = this.selected;
      const info = this.tileInfo(x, y);
      const rule = C.TERRAIN[info.t];
      const gate = info.t === 'danger' ? s.gates.danger : info.t === 'tomb' ? s.gates.tomb : (info.t === 'treasure' || info.t === 'hell') ? s.gates.treasure : 0;
      let chips = `<span class="chip">فاصله از مرکز ${num(Math.round(info.d))}</span>`;
      if (rule.passable) chips += `<span class="chip">تدارکات ${num(s.supply[info.t])} سکه</span>`;
      if (info.mp > 0) chips += `<span class="chip warn">موجودات ${num(info.mp)}</span>`; else if (rule.passable) chips += `<span class="chip">بی‌موجود</span>`;
      if (gate) chips += `<span class="chip">ورود از سطح ${num(gate)}</span>`;
      if (info.t === 'treasure' || info.t === 'hell') chips += `<span class="chip">${num(s.treasureArtifacts)} آرتیفکت</span>`;
      if (info.tomb) chips += `<span class="chip gold">${esc(info.tomb.name)}</span>`;
      if (info.o) chips += `<span class="chip gold">مال ${esc(S.ownerLabel(st, info.o))}${info.o.guardian ? ' — نگاهبان: ' + C.UNITS[info.o.guardian].name : ' — کمپ'}</span>`;
      if (st.participation?.tile && st.participation.tile.x === x && st.participation.tile.y === y) chips += `<span class="chip gold">جایزه‌ی مشارکت این‌جا نشست</span>`;
      let action = '';
      if (!st.migration) {
        const plan = S.planMove(st, this.ctx(), id, { x, y });
        if (plan.ok) {
          const p = plan.plan;
          const kindLabel = p.kind === 'free' ? 'سفر رایگان از مسیر خانه‌های خودی' : p.kind === 'long' ? `کوچ بلند (${num(p.steps)} خانه‌ی تازه)` : 'کوچ به خانه‌ی چسبیده';
          action += `<div class="kv"><span>نوع</span><span>${kindLabel}</span><span>تدارکات</span><span>${num(p.cost)} سکه</span><span>زمان تقریبی</span><span>${secs(p.seconds)}</span>`;
          if (p.encounters.count) action += `<span>خانه‌های موجوددار در مسیر</span><span>${num(p.encounters.count)}</span><span>مجموع قدرت موجودات</span><span>${num(p.encounters.totalPower)}</span><span>سخت‌ترین خانه</span><span>(${num(p.encounters.hardest!.x)}، ${num(p.encounters.hardest!.y)}) با ${num(p.encounters.hardest!.power)}</span>`;
          action += `<span>قدرت لشگر تو</span><span>${num(p.army, 1)}${p.encounters.hardest && p.army < p.encounters.hardest.power / s.difficulty ? ' ⚠' : ''}</span></div>`;
          action += `<div class="row"><button class="gold" data-act="move">${p.kind === 'free' ? 'سفر' : 'کوچ'}</button>${st.clan && !st.clan.camp && info.o?.owner === 'player' && st.clan.commander === st.player.name ? '<button data-act="setClanCamp">کمپ کلن این‌جا</button>' : ''}</div>`;
        } else {
          action += `<p class="${plan.reason === 'کاروان همین‌جاست' ? 'muted' : 'warn'}">${esc(plan.reason)}</p>`;
          if (st.clan && !st.clan.camp && info.o?.owner === 'player' && st.clan.commander === st.player.name) action += `<div class="row"><button data-act="setClanCamp">کمپ کلن این‌جا</button></div>`;
        }
      }
      html += `<div class="title"><b>${esc(rule.name)} (${num(x)}، ${num(y)})</b><button class="close" data-act="closeCard">✕</button></div><div class="chips">${chips}</div>${action}`;
    }
    card.innerHTML = html;
    card.classList.remove('hidden');
    if (this.showMinimap) this.drawMinimap();
  }

  minimapHtml() {
    const m = mapById(this.st.mapId);
    return `<div id="minimapWrap"><canvas id="minimap"></canvas>
      <div class="muted center">نمای کل سرزمین — نقشه‌ی ${num(m.id)} از ${num(MAPS.length)}: «${esc(m.name)}» — ${esc(m.desc)}</div>
      <div class="legend">${(['safe', 'plain', 'mountain', 'marsh', 'danger', 'hell', 'valley'] as Terrain[]).map(t => `<span><i style="background:${MINI_COLORS[t]}"></i>${C.TERRAIN[t].name}</span>`).join('')}
      <span><i style="background:#b06cff"></i>مقبره</span><span><i style="background:#ffd54a"></i>گنج / خانه‌های تو</span><span><i style="background:#4fd6ff"></i>کلن</span><span><i style="background:#ffffff"></i>کمپ</span><span><i style="background:#ff6b5a"></i>کاروان</span></div></div>`;
  }

  drawMinimap() {
    const c = document.getElementById('minimap') as HTMLCanvasElement | null; if (!c) return;
    if (!this.minimapBase || this.minimapSeason !== this.st.season) { this.minimapBase = drawTerrainPreview(c, (x, y) => this.gen.at(x, y), 200); this.minimapSeason = this.st.season; }
    const st = this.st;
    const marks: { x: number; y: number; color: string; r?: number }[] = [];
    for (const [k, o] of Object.entries(st.owned)) { const [x, y] = k.split(',').map(Number); marks.push({ x, y, color: o.owner === 'clan' ? '#4fd6ff' : '#ffd54a', r: 1.2 }); }
    for (const t of st.tombs) if (!t.captured) marks.push({ x: t.x, y: t.y, color: '#b06cff', r: 2.5 });
    marks.push({ x: 500, y: 500, color: '#ffd54a', r: 2.5 });
    if (st.player.camp) marks.push({ x: st.player.camp.x, y: st.player.camp.y, color: '#ffffff', r: 2 });
    if (st.clan?.camp) marks.push({ x: st.clan.camp.x, y: st.clan.camp.y, color: '#4fd6ff', r: 2 });
    const a = S.currentActor(st); if (a.pos) marks.push({ x: a.pos.x, y: a.pos.y, color: '#ff6b5a', r: 2 });
    if (c.width !== 200) c.width = 200;
    drawOverlay(c, this.minimapBase, marks);
  }

  renderSheet() {
    const sheet = $('sheet');
    sheet.classList.remove('hidden');
    const focused = document.activeElement as HTMLElement | null;
    if (focused && sheet.contains(focused) && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return; // در حال تایپ
    const html = { army: this.armyHtml, shop: this.shopHtml, wallet: this.walletHtml, artifacts: this.artifactsHtml, clan: this.clanHtml, dashboard: this.dashboardHtml, map: () => '' }[this.tab].call(this);
    if (sheet.dataset.html !== html) { sheet.innerHTML = html; sheet.dataset.html = html; }
  }

  armyHtml() {
    const st = this.st, s = this.s, id = st.control, a = S.currentActor(st);
    const guardians = Object.values(st.owned).filter(o => o.owner === id && o.guardian).length;
    const rows = ALL_UNITS.map(u => `<tr><td>${ico(UNIT_ICON[u])}${C.UNITS[u].name}</td><td class="n">${num(a.units[u])}</td><td class="n">${num(unitPowerOn(u, null, s))}</td><td>${C.UNITS[u].bonusTerrains.length ? '×' + faDigits(String(s.terrainBonus)) + ' در ' + C.UNITS[u].bonusTerrains.map(t => C.TERRAIN[t].name).join('، ') : C.UNITS[u].speed ? 'سرعت کوچ' : C.UNITS[u].luck ? 'شانس ' + faDigits(String(s.explorerLuck)) : '—'}</td></tr>`).join('');
    const rc = S.restCost(st, s, id);
    return `<div class="card"><h3>${ico('army', 'lg')}لشگر ${id === 'clan' ? 'کلن' : ''}</h3>
      <div class="kv"><span>نیروی آزاد</span><span>${num(totalUnits(a.units))}</span><span>نگاهبان خانه‌ها (آزاد نیستند)</span><span>${num(guardians)}</span>
      <span>انرژی</span><span>${num(a.energy, 0)} / ${num(C.ENERGY_MAX)}</span>
      <span>قدرت لشگر (دشت)</span><span>${num(armyPower(a.units, a.energy, 'plain', s), 1)}</span>
      <span>قدرت در کوهستان/مرداب</span><span>${num(armyPower(a.units, a.energy, 'mountain', s), 1)}</span>
      <span>قدرت در خطر/مقبره/گنج</span><span>${num(armyPower(a.units, a.energy, 'danger', s), 1)}</span>
      <span>شانس لشگر</span><span>${num(armyLuck(a.units, s), 1)}</span>
      <span>زمان هر کوچ</span><span>${secs(moveSeconds(a.units, s))}</span></div>
      <div class="progress"><i style="width:${Math.round(a.energy)}%"></i></div>
      <div class="row"><button data-act="rest" ${a.energy >= C.ENERGY_MAX ? 'disabled' : ''}>استراحت فوری (${num(rc, 1)} سکه)</button></div>
      <p class="muted">هر کوچ ${num(s.energyPerMove)} انرژی می‌برد؛ وقتی کاروان در راه نیست ${faDigits(String(s.energyRegen))} واحد در ثانیه پر می‌شود. نیرو فروختنی یا حذف‌کردنی نیست و مرخصی ندارد.</p></div>
      <div class="card"><h3>نیروها</h3><table><tr><th>نیرو</th><th>تعداد</th><th>قدرت</th><th>ویژگی</th></tr>${rows}</table></div>`;
  }

  shopHtml() {
    const st = this.st, s = this.s, id = st.control;
    const items = ALL_UNITS.map(u => `<div class="unit"><div class="head">${ico(UNIT_ICON[u], 'lg')}<b>${C.UNITS[u].name}</b> <span class="res">${ico('coin')}${num(s.unitPrice[u])}</span></div><div class="muted">قدرت ${num(s.unitPower[u])}${C.UNITS[u].bonusTerrains.length ? '، ×' + faDigits(String(s.terrainBonus)) + ' در ' + C.UNITS[u].bonusTerrains.map(t => C.TERRAIN[t].name).join('، ') : ''}${C.UNITS[u].luck ? '، شانس ' + faDigits(String(s.explorerLuck)) : ''}${C.UNITS[u].speed ? '، ' + num(s.guidesForHalf) + ' نفر زمان کوچ را نصف می‌کند' : ''}</div>
      <div class="qty"><input type="number" min="1" value="10" /><button class="gold" data-act="buyUnit" data-unit="${u}">خرید</button></div></div>`).join('');
    return `<div class="card"><h3>فروشگاه (${id === 'clan' ? 'با سکه‌ی خزانه‌ی کلن' : 'با سکه'})</h3><div class="kv"><span>${id === 'clan' ? 'خزانه' : 'سکه'}</span><span>${num(S.coinsOf(st, id))}</span></div></div>
      <div class="units">${items}</div>
      <p class="muted">آرتیفکت خریدنی از فروشگاه نیست؛ فقط با تصاحب مقبره یا معامله با بازیکن دیگر.</p>`;
  }

  walletHtml() {
    const st = this.st, s = this.s, p = st.player;
    const tickets = readTickets().filter(t => t.player === (p.name ?? ''));
    const txRows = st.tx.slice(0, 30).map(t => `<tr><td>${esc(t.note)}</td><td class="n">${t.amount >= 0 ? '+' : ''}${num(t.amount)}</td><td>${dateTime(t.t)}</td></tr>`).join('');
    return `<div class="card"><h3>${ico('toman', 'lg')}کیف پول</h3>
      <div class="kv"><span>موجودی</span><span>${num(p.toman)} تومان</span><span>بلوکه‌شده در پیشنهادها</span><span>${num(p.blocked)} تومان</span><span>موجودی آزاد</span><span>${num(p.toman - p.blocked)} تومان</span></div>
      ${st.payout && !st.payout.toIban ? `<p class="warn">فصل بسته شد ولی شبا ثبت نشده بود؛ ${num(st.payout.amount)} تومان در کیف پول ماند.</p>` : ''}
      ${st.payout && st.payout.toIban ? `<p class="ok">پایان فصل: ${num(st.payout.amount)} تومان به شبای ثبت‌شده واریز شد.</p>` : ''}</div>
      <div class="card"><h3>واریز وجه</h3><form data-act="deposit" class="row"><input name="amount" type="number" min="1000" step="1000" placeholder="مبلغ به تومان" required /><button class="primary">واریز</button></form></div>
      <div class="card"><h3>${ico('coin', 'lg')}خرید سکه</h3><p class="muted">هر سکه ${num(s.coinToman)} تومان. سقف هر بار ${num(s.buyCoinsMax)} سکه. هر خرید، استخر جایزه‌ی فصل را بزرگ می‌کند.</p>
      <form data-act="buyCoins" class="row"><input name="amount" type="number" min="1" placeholder="تعداد سکه" required /><button class="primary">خرید</button></form></div>
      <div class="card"><h3>شبا و برداشت</h3>
      <form data-act="setIban"><div class="row"><input name="iban" placeholder="IR + ۲۴ رقم" value="${esc(p.iban)}" /><input name="ownerName" placeholder="نام صاحب حساب" value="${esc(p.ownerName)}" /><button>ثبت</button></div></form>
      <form data-act="withdraw"><div class="row"><input id="withdrawAmount" name="amount" type="number" min="${s.withdrawMin}" placeholder="مبلغ برداشت (تومان)" /><button type="button" data-act="withdrawAll">کل موجودی</button><button class="primary">برداشت</button></div></form>
      <p class="muted">حداقل برداشت ${num(s.withdrawMin)} تومان، تا سقف موجودی آزاد، فقط با شبای ثبت‌شده. پول بلوکه‌شده برداشت‌کردنی نیست.</p></div>
      <div class="card"><h3>تراکنش‌ها</h3><table>${txRows || '<tr><td class="muted">تراکنشی نیست</td></tr>'}</table></div>
      <div class="card"><h3>پشتیبانی</h3><form data-act="ticket"><div class="row"><input name="subject" placeholder="موضوع (دست‌کم ۳ نویسه)" /></div><div class="row"><textarea name="body" rows="3" placeholder="شرح (دست‌کم ۱۰ نویسه)"></textarea></div><div class="row"><button>ارسال تیکت</button><a href="faq.html">سوالات پرتکرار</a></div></form>
      ${tickets.map(t => `<div class="card"><b>${esc(t.subject)}</b> <span class="chip">${t.status === 'open' ? 'باز' : 'بسته'}</span><div class="muted">${esc(t.body)}</div>${t.reply ? `<div class="ok">پاسخ: ${esc(t.reply)}</div>` : ''}</div>`).join('')}</div>
      <div class="card"><h3>انصراف از فصل</h3><p class="muted">فقط مشارکت خودت را پایان می‌دهد، نه فصل را.</p><button class="danger" data-act="quit">انصراف</button></div>`;
  }

  artifactsHtml() {
    const st = this.st, s = this.s;
    const av = artifactValue(st.pool, s);
    const list = (who: ActorId) => { const a = who === 'clan' ? st.clan : st.player; if (!a) return ''; return a.artifacts.map(i => `<tr><td>${esc(st.tombs[i]?.name ?? String(i))}</td><td>${who === 'clan' ? 'به نام کلن' : 'شخصی'}</td><td class="n">${num(av)}</td></tr>`).join(''); };
    const tombs = st.tombs.filter(t => !t.captured).map(t => `<tr><td>${esc(t.name)}</td><td class="n">(${num(t.x)}، ${num(t.y)})</td><td class="n">${num(Math.round(euclid(t.x, t.y)))}</td><td><button data-act="focusTile" data-x="${t.x}" data-y="${t.y}">نمایش</button></td></tr>`).join('');
    return `<div class="card"><h3>${ico('artifact', 'lg')}آرتیفکت‌های تو</h3><p class="muted">ارزش هر آرتیفکت = ${pct(s.artifactShare)} استخر = ${num(av)} تومان. در پایان فصل خودکار فروخته می‌شود؛ شخصی کامل به خودت، کلنی به نسبت سهم. فروش دستی وجود ندارد.</p>
      <table><tr><th>نام</th><th>مالکیت</th><th>ارزش (تومان)</th></tr>${list('player')}${list('clan')}${!st.player.artifacts.length && !st.clan?.artifacts.length ? '<tr><td class="muted" colspan="3">هنوز آرتیفکتی نداری</td></tr>' : ''}</table>
      <div class="kv"><span>آرتیفکت برای شرط گنج</span><span>${num(S.artifactCount(st, st.control))} از ${num(s.treasureArtifacts)}</span></div></div>
      <div class="card"><h3>مقبره‌های نمایان (${num(st.tombs.filter(t => !t.captured).length)} از ${num(C.TOMBS_TOTAL)} نام)</h3><table><tr><th>نام</th><th>مختصات</th><th>فاصله</th><th></th></tr>${tombs}</table><p class="muted">ورود از سطح ${num(s.gates.tomb)}. با تصاحب هر مقبره آرتیفکتش همان لحظه به دست می‌آید و مقبره‌ی تازه‌ای دورترین جای ممکن از قلمروی تو ساخته می‌شود.</p></div>
      <div class="card"><h3>بازار آرتیفکت</h3><p class="muted">آرتیفکت فقط بین بازیکنان معامله می‌شود (پیشنهاد با پول بلوکه‌شده، حداقل ${num(s.offerMin)} تومان). در این فصل هیچ بازیکن دیگری آرتیفکتی برای فروش نگذاشته است.</p><div class="kv"><span>پول بلوکه‌شده‌ی تو</span><span>${num(st.player.blocked)} تومان</span></div></div>`;
  }

  clanHtml() {
    const st = this.st, s = this.s, c = st.clan;
    if (!c) return `<div class="card"><h3>کلن</h3><p class="muted">ساخت کلن ${num(s.clanCreateCost)} سکه. سقف ${num(s.clanMaxMembers)} نفر. خروج از کلن ممکن نیست. با پیوستن، همه‌ی خانه‌هایت با کلن مشترک می‌شود.</p>
      <form data-act="createClan" class="row"><input name="clanName" placeholder="نام کلن" /><button class="primary">ساخت کلن</button></form></div>`;
    const shares = S.clanShares(st);
    const members = c.members.map(m => `<tr><td>${esc(m.name)}${m.name === c.commander ? ' (فرمانده)' : ''}</td><td class="n">${num(m.weight)}</td><td class="n">${pct(shares.find(x => x.name === m.name)?.share ?? 0)}</td></tr>`).join('');
    const donate = ALL_UNITS.map(u => `<div class="unit"><div class="head">${ico(UNIT_ICON[u], 'lg')}<b>${C.UNITS[u].name}</b></div> <span class="muted">تو: ${num(st.player.units[u])} — کلن: ${num(c.units[u])}</span><div class="qty"><input type="number" min="1" value="1" /><button data-act="donate" data-unit="${u}">اهدا</button></div></div>`).join('');
    const lvl = S.levelOf(st, s, 'clan');
    const nextVote = new Date(c.createdAt + s.electionDays * 86400000);
    return `<div class="card"><h3>کلن «${esc(c.name)}»</h3>
      <div class="kv"><span>خزانه (فقط سکه)</span><span>${num(c.treasury)}</span><span>سطح کلن</span><span>${num(lvl)} (${num(c.xp)} تجربه)</span><span>اعضا</span><span>${num(c.members.length)} از ${num(s.clanMaxMembers)}</span><span>کمپ کلن</span><span>${c.camp ? `(${num(c.camp.x)}، ${num(c.camp.y)})` : 'برپا نشده — روی یکی از خانه‌های خودت بزن'}</span><span>آرتیفکت کلن</span><span>${num(c.artifacts.length)}</span><span>رأی‌گیری بعدی</span><span>${dateTime(nextVote.getTime())}</span></div>
      <div class="row"><button data-act="clanDeposit">واریز ${num(s.clanDepositUnit)} سکه به خزانه</button><button data-act="clanBuySoldier">خرید ${num(s.clanSoldierBuy)} سرباز برای کلن</button></div>
      <div class="row">${st.control === 'clan' ? '<button data-act="control" data-id="player">بازگشت به اکانت خودم</button>' : '<button class="primary" data-act="control" data-id="clan">سوئیچ به اکانت کلن</button>'}</div>
      <p class="muted">خزانه هیچ‌وقت پول (تومان) ندارد؛ پول آرتیفکت کلن همان لحظه به نسبت سهم به کیف پول اعضا می‌رود. اهدا برگشت‌ناپذیر است.</p></div>
      <div class="card"><h3>سهم و رأی</h3><table><tr><th>عضو</th><th>وزن (سکه)</th><th>سهم</th></tr>${members}</table><p class="muted">سهم = سکه‌ی نیروهای اهدایی + سکه‌ی واریزی به خزانه + سکه‌ی تصاحب خانه‌هایی که با خود آورده. سهم پایه ندارد. وزن رأی همین عدد است؛ رأی‌گیری هر ${num(s.electionDays)} روز.</p></div>
      <div class="card"><h3>اهدای نیرو (لحظه‌ای، با همان انرژی)</h3><div class="units">${donate}</div></div>`;
  }

  dashboardHtml() {
    const st = this.st, s = this.s, m = mapById(st.mapId);
    const who = st.control;
    const logs = st.log.filter(l => l.who === who).slice(0, 40).map(l => `<div><time>${dateTime(l.t)}</time>${esc(l.text)}</div>`).join('');
    const report = st.report ? `<div class="card"><h3>گزارش گنج نهایی (${dateTime(st.report.at)})</h3><table><tr><th>جایزه</th><th>برنده</th><th>ارزش</th><th>هزینه‌ی برنده</th></tr>${st.report.rows.map(r => `<tr><td>${esc(r.title)}</td><td>${r.winner ? esc(r.winner) : '—'}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}</td><td class="n">${num(r.value)} تومان</td><td>${r.winner ? `${esc(r.costLabel)}: ${num(r.cost)} سکه (${num(r.costToman)} تومان)` : '—'}</td></tr>`).join('')}</table></div>` : '';
    const xp = xpProgress(S.currentActor(st).xp, s.xpLevel2, s.xpGrowth);
    return `<div class="card"><h3>دنیای بازی</h3><div class="kv">
      <span>فصل</span><span>${num(st.season)}</span>
      <span>نقشه</span><span>نقشه‌ی ${num(m.id)} از ${num(MAPS.length)} — «${esc(m.name)}»</span>
      <span>مشخصات نقشه</span><span>${esc(m.desc)}</span>
      <span>بازیکنان شرکت‌کننده در فصل</span><span>${num(st.playersJoined)} (ظرفیت ${num(s.seasonMaxPlayers)})</span>
      <span>استخر جایزه</span><span>${num(st.pool)} تومان</span>
      <span>خانه‌های تصاحب‌شده</span><span>${num(Object.keys(st.owned).length)}</span>
      <span>مقبره‌های نمایان / آشکارشده</span><span>${num(st.tombs.filter(t => !t.captured).length)} / ${num(st.tombs.length)}</span>
      <span>سطح ۵ / ۷ / ۱۰ (تجربه)</span><span>${num(cumulativeXp(5, s.xpLevel2, s.xpGrowth))} / ${num(cumulativeXp(7, s.xpLevel2, s.xpGrowth))} / ${num(cumulativeXp(10, s.xpLevel2, s.xpGrowth))}</span>
      <span>تجربه‌ی تو</span><span>${num(S.currentActor(st).xp)} (سطح ${num(xp.level)})</span>
      <span>سکه‌ی خرج‌شده</span><span>${num(S.currentActor(st).spentCoins)}</span>
      <span>گنج اصلی</span><span>${st.treasure ? `فتح شد توسط ${esc(S.actorName(st, st.treasure.by))}` : 'فتح نشده'}</span></div>
      <div class="row"><button data-act="faq">سوالات پرتکرار</button></div></div>
      ${report}
      <div class="card"><h3>رتبه‌بندی فصل</h3><table><tr><th>بازیکن</th><th>سطح</th><th>خانه</th><th>آرتیفکت</th></tr><tr><td>${esc(st.player.name ?? '—')}</td><td class="n">${num(S.levelOf(st, s, 'player'))}</td><td class="n">${num(Object.values(st.owned).filter(o => o.owner === 'player').length)}</td><td class="n">${num(st.player.artifacts.length)}</td></tr></table>
      <h4>کلن‌های فصل</h4>${st.clan ? `<table><tr><th>کلن</th><th>سطح</th><th>اعضا</th><th>خانه</th></tr><tr><td>${esc(st.clan.name)}</td><td class="n">${num(S.levelOf(st, s, 'clan'))}</td><td class="n">${num(st.clan.members.length)}</td><td class="n">${num(Object.keys(st.owned).length)}</td></tr></table>` : '<p class="muted">کلنی در این فصل ساخته نشده است.</p>'}</div>
      <div class="card"><h3>لاگ فعالیت ${who === 'clan' ? 'کلن' : 'تو'}</h3><div class="log">${logs || '<div class="muted">هنوز رویدادی نیست</div>'}</div></div>
      <div class="card"><h3>اشیای پیداشده</h3>${st.player.inventory.length ? `<table>${st.player.inventory.map(i => `<tr><td>${esc(i.name)}</td><td class="n">${num(i.value)} سکه</td><td>${dateTime(i.at)}</td></tr>`).join('')}</table>` : '<p class="muted">هنوز چیزی پیدا نشده</p>'}</div>`;
  }

  // ---------- مودال ----------
  renderModal() {
    if (!this.st.player.name) {
      this.openModal(`<h2>به بازی گنج خوش آمدی</h2><p class="muted">اول یک نام یکتا انتخاب کن؛ فقط همین نام برای بقیه دیده می‌شود.</p>
        <form data-act="register"><div class="row"><input name="name" placeholder="نام بازیکن" minlength="3" maxlength="20" required autofocus /></div><div class="row"><button class="primary">ثبت نام</button></div></form>`);
    }
  }
  showTutorial() {
    const s = this.s;
    this.openModal(`<h2>آموزش کوتاه</h2>
      <p>۱. با تومان سکه بخر (هر سکه ${num(s.coinToman)} تومان). هر خرید استخر جایزه را بزرگ می‌کند.</p>
      <p>۲. با سکه نیرو بخر؛ برای تصاحب هر خانه دست‌کم ۲ نیروی آزاد لازم است و ارزان‌ترین نیرو نگاهبان می‌ماند.</p>
      <p>۳. روی نقشه یک خانه‌ی چسبیده به قلمروت را بزن و کوچ کن (${num(s.moveSeconds)} ثانیه). کوچ بلند تا ${num(s.longMoveMax)} خانه با پیش‌پرداخت.</p>
      <p>۴. سرزمین خطر از سطح ${num(s.gates.danger)}، مقبره از سطح ${num(s.gates.tomb)}، گنج اصلی از سطح ${num(s.gates.treasure)} با ${num(s.treasureArtifacts)} آرتیفکت.</p>
      <p>۵. هرکس اول به گنج در مرکز (${num(C.CENTER)}، ${num(C.CENTER)}) برسد برنده‌ی فصل است.</p>
      <div class="row"><button class="primary" data-act="tutorialClose">شروع</button></div>`);
  }
  openModal(html: string) { $('modal').innerHTML = `<div class="modal"><div class="box">${html}</div></div>`; }
  closeModal() { $('modal').innerHTML = ''; }
}
