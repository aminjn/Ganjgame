// پنل ادمین (حالت چندنفره): همه‌چیز از سرور خوانده و روی سرور ذخیره می‌شود. هیچ لینکی از بازی به این‌جا نیست.
import { FIELDS, defaultSettings, applyOverrides, validateField, validateSettings, getPath, type FieldMeta } from './rules/settings';
import { MAPS, createTerrain, mapById } from './rules/terrain';
import { num, dateTime, faDigits, pct } from './rules/format';
import { TERRAIN, type Terrain } from './rules/constants';
import { drawTerrainPreview } from './ui/minimap';
import { api, ApiError } from './net/client';

type ATab = 'status' | 'season' | 'numbers' | 'player' | 'support' | 'money' | 'saved';
const ATABS: { id: ATab; label: string }[] = [
  { id: 'status', label: 'وضعیت و امنیت' }, { id: 'season', label: 'فصل و نقشه' }, { id: 'numbers', label: 'اعداد و قیمت‌ها' },
  { id: 'player', label: 'پرونده‌ی بازیکن' }, { id: 'support', label: 'پشتیبانی' }, { id: 'money', label: 'واریز و برداشت' }, { id: 'saved', label: 'تنظیمات ذخیره‌شده' },
];
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

interface Status { season: any; lock: { locked: boolean; reason: string }; overrides: Record<string, number>; defaults: any; effective: any; fields: FieldMeta[]; maps: any[]; counts: Record<string, number>; seasons: any[]; gateway: string; now: number }

let tab: ATab = 'status';
let status: Status | null = null;
let draft: Record<string, number> = {};
let errors: Record<string, string> = {};
let players: any[] = []; let playerFile: any = null;
let tickets: any[] = []; let ticketFilter = 'open';
let deposits: any[] = []; let withdrawals: any[] = [];
let logs: any[] = [];
const shareCache = new Map<number, Record<string, number>>();

async function call<T = any>(path: string, body?: unknown): Promise<T | null> {
  try { return await api<T>(path, body); }
  catch (e: any) { if (e instanceof ApiError && e.code === 401) { renderLogin(); return null; } alert(e.reason ?? String(e)); return null; }
}
async function loadStatus() { const s = await call<Status>('/admin/status'); if (s) { status = s; draft = { ...s.overrides }; } return s; }

function renderLogin() {
  $('lockbar').className = 'lockbar locked'; $('lockbar').textContent = 'ورود ادمین لازم است';
  $('atabs').innerHTML = '';
  $('content').innerHTML = `<div class="card"><h3>ورود به پنل</h3><form data-act="login" class="row"><input name="password" type="password" placeholder="گذرواژه‌ی ادمین (ADMIN_PASSWORD در سرور)" required autofocus /><button class="primary">ورود</button></form></div>`;
}

async function render() {
  if (!status) { renderLogin(); return; }
  const lock = status.lock;
  const lb = $('lockbar'); lb.className = `lockbar ${lock.locked ? 'locked' : 'open'}`; lb.textContent = (lock.locked ? 'قفل: ' : 'باز: ') + lock.reason;
  $('atabs').innerHTML = ATABS.map(t => `<button data-tab="${t.id}" class="${t.id === tab ? 'active' : ''}">${t.label}</button>`).join('') + '<button data-act="logout">خروج</button>';
  const html = { status: statusHtml, season: seasonHtml, numbers: numbersHtml, player: playerHtml, support: supportHtml, money: moneyHtml, saved: savedHtml }[tab]();
  $('content').innerHTML = html;
  if (tab === 'season') drawPreviews();
}

function statusHtml(): string {
  const st = status!, se = st.season, c = st.counts;
  const s = st.effective;
  return `<div class="card"><h3>خلاصه‌ی فصل ${faDigits(se.number)}</h3><div class="kv">
      <span>نقشه‌ی فعال</span><span>${num(se.mapId)} — ${esc(se.mapName)}</span>
      <span>آغاز فصل</span><span>${dateTime(se.startedAt)} ${se.startedByAdmin ? '(با فرمان ادمین)' : '(بی‌فرمان)'}</span>
      <span>استخر جایزه</span><span>${num(se.pool)} تومان</span>
      <span>ارزش لحظه‌ای هر آرتیفکت (${pct(s.artifactShare)})</span><span>${num(se.prizes.artifact)} تومان</span>
      <span>ارزش گنج اصلی (کف ${num(s.treasureFloor)} / ${pct(s.treasureShare)})</span><span>${num(se.prizes.treasure)} تومان</span>
      <span>جایزه‌ی مشارکت (${pct(s.participationShare)})</span><span>${num(se.prizes.participation)} تومان</span>
      <span>مجموع سهم جایزه‌ها</span><span>${pct(s.treasureShare + 10 * s.artifactShare + s.participationShare)} استخر</span>
      <span>بازیکنان شرکت‌کننده / فعال / آنلاین</span><span>${num(se.playersJoined)} / ${num(c.active)} / ${num(c.online)}</span>
      <span>کل حساب‌ها</span><span>${num(c.players)}</span>
      <span>کلن‌ها</span><span>${num(c.clans)}</span>
      <span>خانه‌های تصاحب‌شده / کاروان در راه</span><span>${num(c.tiles)} / ${num(c.migrations)}</span>
      <span>مقبره‌های آشکارشده</span><span>${num(se.tombsRevealed)}</span>
      <span>گنج</span><span>${se.treasure ? `فتح شده توسط ${esc(se.treasure.by)} (${dateTime(se.treasure.at)})` : 'فتح نشده'}</span>
      <span>بستن فصل</span><span>${se.closed ? `بسته شد (${dateTime(se.closedAt)})` : se.endsAt ? `تا ${dateTime(se.endsAt)}` : '—'}</span>
      <span>مجموع تومان در کیف پول‌ها</span><span>${num(c.tomanTotal)} تومان</span>
      <span>درگاه پرداخت</span><span>${st.gateway === 'zarinpal' ? 'زرین‌پال' : 'دستی (تأیید ادمین)'}</span>
      <span>تیکت باز / واریز در انتظار / برداشت در انتظار</span><span>${num(c.openTickets)} / ${num(c.pendingDeposits)} / ${num(c.pendingWithdrawals)}</span></div></div>
    ${se.report ? `<div class="card"><h3>گزارش گنج نهایی</h3><table><tr><th>جایزه</th><th>برنده</th><th>ارزش</th><th>هزینه‌ی برنده</th></tr>${se.report.rows.map((r: any) => `<tr><td>${esc(r.title)}</td><td>${r.winner ? esc(r.winner) : '—'}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}</td><td class="n">${num(r.value)}</td><td>${r.winner ? `${esc(r.costLabel)}: ${num(r.cost)} سکه (${num(r.costToman)} تومان)` : '—'}</td></tr>`).join('')}</table></div>` : ''}
    <div class="card"><h3>فصل‌های پیشین</h3><table><tr><th>#</th><th>نقشه</th><th>آغاز</th><th>استخر</th><th>بازیکنان</th><th>گنج</th><th>بسته</th></tr>${st.seasons.map(x => `<tr><td>${num(x.number)}</td><td>${num(x.map_id)}</td><td>${dateTime(x.started_at)}</td><td class="n">${num(x.pool)}</td><td class="n">${num(x.players_joined)}</td><td>${x.treasure_at ? dateTime(x.treasure_at) : '—'}</td><td>${x.closed_at ? dateTime(x.closed_at) : '—'}</td></tr>`).join('')}</table></div>
    <div class="card"><h3>لاگ اخیر فصل</h3><div class="row"><button data-act="loadLogs">بارگذاری ۳۰۰ رویداد آخر</button></div><div class="log">${logs.map(l => `<div><time>${dateTime(l.t)}</time>[${l.who_type === 'clan' ? 'کلن' : 'بازیکن'} ${esc(l.name)}] ${esc(l.text)}</div>`).join('')}</div></div>`;
}

function mapShares(id: number): Record<string, number> {
  let c = shareCache.get(id); if (c) return c;
  const s = applyOverrides(status!.overrides);
  const gen = createTerrain(mapById(id), s.valleyBlock, s.dangerBlob);
  const counts: Record<string, number> = {}; let n = 0;
  for (let x = 2; x < 1000; x += 9) for (let y = 2; y < 1000; y += 9) { n++; const t = gen.at(x, y); counts[t] = (counts[t] || 0) + 1; }
  c = {}; for (const k of Object.keys(counts)) c[k] = counts[k] / n;
  shareCache.set(id, c); return c;
}

function seasonHtml(): string {
  const lock = status!.lock;
  const sel = draft.mapId ?? status!.overrides.mapId ?? 1;
  const maps = MAPS.map(m => {
    const sh = mapShares(m.id);
    const line = (['danger', 'mountain', 'marsh', 'plain', 'safe', 'valley'] as Terrain[]).map(t => `${TERRAIN[t].name} ${pct(sh[t] || 0)}`).join(' · ');
    return `<div class="map ${m.id === sel ? 'sel' : ''}" data-map="${m.id}"><canvas id="prev${m.id}"></canvas><b>${num(m.id)}. ${esc(m.name)}</b><div class="shares">${esc(m.desc)}<br>${line}<br>هسته ${num(m.coreRadius)} · دره ${num(m.valleyBlock)} · لکه‌ی خطر ${num(m.dangerBlob)}</div></div>`;
  }).join('');
  return `<div class="card"><h3>نقشه‌ی فصل بعد</h3><p class="muted">ده نقشه از یک مولد می‌آیند و فقط در چیدمان زمین فرق دارند. پیش‌نمایش‌ها از دل خودِ کد بازی کشیده می‌شوند. نقشه‌ی تازه با آغاز فصل بعدی اعمال می‌شود، نه در میانه‌ی فصل جاری.</p>
    <div class="maps">${maps}</div>
    ${lock.locked ? '<p class="warn">در میانه‌ی فصل قابل تغییر نیست.</p>' : `<div class="row" style="margin-top:10px"><button class="primary" data-act="saveMap">ذخیره‌ی انتخاب نقشه (${num(sel)})</button></div>`}</div>
    <div class="card"><h3>آغاز فصل تازه</h3><p class="muted">سرور همان لحظه تنظیمات و نقشه را از نو می‌خواند و دنیا را می‌سازد؛ همه‌ی بازیکنان با ورود بعدی به فصل تازه می‌پیوندند (کمپ تازه، صفر سکه و نیرو؛ تومان و شبا می‌ماند). از این لحظه کل پنل تا بسته شدن فصل با پرداخت پایان فصل قفل است.</p>
    ${lock.locked ? '<p class="warn">فصلی که آغاز شده در میان راه پایان‌دادنی نیست.</p>' : '<div class="row"><button class="danger" data-act="startSeason">آغاز فصل تازه</button></div>'}</div>`;
}

function drawPreviews() {
  const s = applyOverrides(status!.overrides);
  for (const m of MAPS) {
    const c = document.getElementById(`prev${m.id}`) as HTMLCanvasElement | null; if (!c) continue;
    const gen = createTerrain(m, s.valleyBlock, s.dangerBlob);
    drawTerrainPreview(c, (x, y) => gen.at(x, y), 100);
  }
}

function numbersHtml(): string {
  const lock = status!.lock;
  const def = defaultSettings();
  const groups = new Map<string, FieldMeta[]>();
  for (const f of FIELDS) { if (!groups.has(f.group)) groups.set(f.group, []); groups.get(f.group)!.push(f); }
  let html = `<div class="card"><p class="muted">بیش از ${num(FIELDS.length)} عدد قابل ویرایش. فقط اعدادی ذخیره می‌شوند که با پیش‌فرض فرق دارند. بازه‌ی پیشنهادی محدودیت ندارد (فقط یادآوری خاکستری)؛ مقادیر مخرب با دلیل رد می‌شوند.</p>
    ${lock.locked ? '<p class="warn">ورودی‌ها فقط‌خواندنی: فصل در جریان است.</p>' : `<div class="row"><button class="primary" data-act="saveNumbers">ذخیره‌ی اعداد</button><button data-act="resetAll">بازگشت همه به پیش‌فرض</button></div>`}
    ${errors._ ? `<p class="warn">${esc(errors._)}</p>` : ''}</div>`;
  for (const [g, fields] of groups) {
    html += `<div class="card"><h3>${esc(g)}</h3>`;
    for (const f of fields) {
      const d = getPath(def, f.path) as number;
      const v = draft[f.path] ?? d;
      const changed = draft[f.path] !== undefined && draft[f.path] !== d;
      const outOfRange = (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max);
      html += `<div class="field"><span>${esc(f.label)}${changed ? ' <span class="chip gold">تغییر</span>' : ''}</span>
        <input type="number" step="any" data-field="${f.path}" value="${v}" ${lock.locked ? 'readonly' : ''} />
        <span class="hint">${esc(f.unit)}</span>
        <span class="hint def">پیش‌فرض ${num(d, 4)} · بازه‌ی پیشنهادی ${f.min !== undefined ? num(f.min, 4) : '—'} تا ${f.max !== undefined ? num(f.max, 4) : '—'}</span>
        ${lock.locked ? '<span></span>' : `<button data-act="resetField" data-field="${f.path}">پیش‌فرض</button>`}
        ${errors[f.path] ? `<span class="err">${esc(errors[f.path])}</span>` : outOfRange ? `<span class="remind">یادآوری: بیرون از بازه‌ی پیشنهادی است؛ ذخیره می‌شود.</span>` : ''}</div>`;
    }
    html += `</div>`;
  }
  return html;
}

function playerHtml(): string {
  const list = players.map(p => `<tr><td><button data-act="openPlayer" data-id="${p.id}">${esc(p.name)}</button></td><td class="n">${num(p.toman)}</td><td class="n">${num(p.coins)}</td><td class="n">${num(p.xp)}</td><td class="n">${num(p.tiles)}</td><td>${esc(p.clan ?? '—')}</td><td>${p.last_seen ? dateTime(p.last_seen) : '—'}</td><td>${p.quit ? 'انصراف' : p.season_id === status!.season.id ? 'در فصل' : 'فصل قبلی'}</td></tr>`).join('');
  let file = '';
  if (playerFile) {
    const p = playerFile.player, v = playerFile.view;
    file = `<div class="card"><h3>پرونده‌ی «${esc(p.name)}»</h3><div class="kv">
      <span>تومان / بلوکه</span><span>${num(p.toman)} / ${num(p.blocked)}</span><span>شبا</span><span>${esc(p.iban || '—')} ${esc(p.owner_name)}</span>
      <span>عضویت</span><span>${dateTime(p.created_at)}</span><span>آخرین حضور</span><span>${p.last_seen ? dateTime(p.last_seen) : '—'}</span>
      ${v ? `<span>سکه</span><span>${num(v.coins)}</span><span>تجربه / سطح</span><span>${num(v.xp)} / ${num(v.level)}</span><span>نیروی آزاد</span><span>${Object.entries(v.units).map(([k, n]) => `${esc(k)}:${num(n as number)}`).join(' ')}</span>
      <span>انرژی</span><span>${num(v.energy)}</span><span>کمپ / کاروان</span><span>${v.camp ? `(${num(v.camp.x)}، ${num(v.camp.y)})` : '—'} / ${v.pos ? `(${num(v.pos.x)}، ${num(v.pos.y)})` : '—'}</span>
      <span>خانه‌ها / آرتیفکت</span><span>${num(v.tiles)} / ${num(v.artifacts.length)}</span><span>سکه‌ی خرج‌شده</span><span>${num(v.spentCoins)}</span>` : '<span>وضعیت فصل</span><span>در این فصل حضور ندارد</span>'}</div>
      <form data-act="credit" class="row" style="margin-top:8px"><input name="amount" type="number" placeholder="مبلغ تومان (منفی = کسر)" required /><input name="note" placeholder="توضیح" /><button data-id="${p.id}">تنظیم دستی کیف پول</button></form></div>
      <div class="card"><h3>لاگ فعالیت</h3><div class="log">${playerFile.logs.map((l: any) => `<div><time>${dateTime(l.t)}</time>${esc(l.text)}</div>`).join('') || '<div class="muted">خالی</div>'}</div></div>
      <div class="card"><h3>تراکنش‌های مالی</h3><table>${playerFile.tx.map((t: any) => `<tr><td>${esc(t.note)}</td><td class="n">${num(t.amount)}</td><td>${dateTime(t.t)}</td></tr>`).join('') || '<tr><td class="muted">خالی</td></tr>'}</table></div>
      <div class="card"><h3>واریزها و برداشت‌ها</h3><table>${playerFile.deposits.map((d: any) => `<tr><td>شارژ (${esc(d.gateway)})</td><td class="n">${num(d.amount)}</td><td>${esc(d.status)}</td><td>${dateTime(d.created_at)}</td></tr>`).join('')}${playerFile.withdrawals.map((d: any) => `<tr><td>${d.kind === 'payout' ? 'واریز پایان فصل' : 'برداشت'}</td><td class="n">${num(d.amount)}</td><td>${esc(d.status)}</td><td>${dateTime(d.created_at)}</td></tr>`).join('') || ''}</table></div>`;
  }
  return `<div class="card"><h3>بازیکنان</h3><form data-act="searchPlayers" class="row"><input name="q" placeholder="جستجوی نام" /><button>جستجو</button></form>
    <table><tr><th>نام</th><th>تومان</th><th>سکه</th><th>تجربه</th><th>خانه</th><th>کلن</th><th>آخرین حضور</th><th>وضعیت</th></tr>${list || '<tr><td class="muted" colspan="8">جستجو کنید</td></tr>'}</table></div>${file}`;
}

function supportHtml(): string {
  const head = `<div class="card"><div class="row"><button data-act="tickets" data-status="open" class="${ticketFilter === 'open' ? 'primary' : ''}">باز</button><button data-act="tickets" data-status="closed" class="${ticketFilter === 'closed' ? 'primary' : ''}">بسته</button><button data-act="tickets" data-status="all" class="${ticketFilter === 'all' ? 'primary' : ''}">همه</button></div><p class="muted">تیکت‌ها بیرون از وضعیت فصل نگه داشته می‌شوند و با آغاز فصل تازه پاک نمی‌شوند.</p></div>`;
  if (!tickets.length) return head + `<div class="card"><p class="muted">تیکتی نیست.</p></div>`;
  return head + tickets.map(t => `<div class="card"><h3>${esc(t.subject)} <span class="chip">${t.status === 'open' ? 'باز' : 'بسته'}</span></h3>
    <div class="muted">${esc(t.name)} — ${dateTime(t.created_at)}</div><p>${esc(t.body)}</p>
    ${t.reply ? `<p class="ok">پاسخ (${dateTime(t.replied_at)}): ${esc(t.reply)}</p>` : ''}
    <div class="row"><textarea id="reply${t.id}" rows="2" placeholder="پاسخ">${esc(t.reply ?? '')}</textarea></div>
    <div class="row"><button class="primary" data-act="reply" data-id="${t.id}">ثبت پاسخ و بستن</button>${t.status === 'closed' ? `<button data-act="reopen" data-id="${t.id}">باز کردن دوباره</button>` : `<button data-act="closeTicket" data-id="${t.id}">بستن بی‌پاسخ</button>`}</div></div>`).join('');
}

function moneyHtml(): string {
  const dep = deposits.map(d => `<tr><td>${esc(d.name)}</td><td class="n">${num(d.amount)}</td><td>${dateTime(d.created_at)}</td><td><button class="primary" data-act="deposit" data-id="${d.id}" data-action="approve">تأیید (پول رسیده)</button> <button data-act="deposit" data-id="${d.id}" data-action="reject">رد</button></td></tr>`).join('');
  const wd = withdrawals.map(w => `<tr><td>${esc(w.name)}</td><td class="n">${num(w.amount)}</td><td dir="ltr">${esc(w.iban)}<br>${esc(w.owner_name)}</td><td>${w.kind === 'payout' ? 'پایان فصل' : 'درخواست'}</td><td>${dateTime(w.created_at)}</td><td><div class="row"><input id="wnote${w.id}" placeholder="شماره‌ی پیگیری / توضیح" /></div><button class="primary" data-act="withdrawal" data-id="${w.id}" data-action="paid">پرداخت شد</button> <button data-act="withdrawal" data-id="${w.id}" data-action="reject">رد (برگشت به کیف پول)</button></td></tr>`).join('');
  return `<div class="card"><h3>شارژهای دستی در انتظار تأیید</h3><p class="muted">وقتی درگاه فعال نیست، بازیکن مبلغ را کارت‌به‌کارت می‌کند و شما پس از دیدن واریز تأیید می‌کنید. با تأیید، تومان به کیف پولش اضافه می‌شود.</p>
    <table><tr><th>بازیکن</th><th>مبلغ</th><th>زمان</th><th></th></tr>${dep || '<tr><td class="muted" colspan="4">چیزی در انتظار نیست</td></tr>'}</table></div>
    <div class="card"><h3>برداشت‌های در انتظار پرداخت</h3><p class="muted">مبلغ از کیف پول بازیکن کم شده است؛ پس از واریز به شبا «پرداخت شد» را بزنید. «رد» مبلغ را به کیف پول برمی‌گرداند.</p>
    <table><tr><th>بازیکن</th><th>مبلغ</th><th>شبا</th><th>نوع</th><th>زمان</th><th></th></tr>${wd || '<tr><td class="muted" colspan="6">چیزی در انتظار نیست</td></tr>'}</table></div>`;
}

function savedHtml(): string {
  const lock = status!.lock;
  return `<div class="card"><h3>تنظیمات ذخیره‌شده روی سرور</h3><p class="muted">فقط مقادیر متفاوت با پیش‌فرض. بازی اول مقادیر مخصوص نقشه را می‌نشاند و بعد این اعداد را رویش می‌گذارد. تنظیمات فصل جاری در آغاز فصل عکس‌برداری شده و تا بسته شدن فصل ثابت است.</p>
    <pre>${esc(JSON.stringify(status!.overrides, null, 2))}</pre>
    ${lock.locked ? '' : '<div class="row"><button class="danger" data-act="clearSaved">پاک کردن همه‌ی تنظیمات ذخیره‌شده</button></div>'}</div>`;
}

function collectDraft() {
  errors = {};
  const def = defaultSettings();
  document.querySelectorAll<HTMLInputElement>('input[data-field]').forEach(inp => {
    const f = FIELDS.find(x => x.path === inp.dataset.field)!;
    const v = Number(inp.value);
    const d = getPath(def, f.path) as number;
    const err = validateField(f, v);
    if (err) { errors[f.path] = err; return; }
    if (v === d) delete draft[f.path]; else draft[f.path] = v;
  });
}
async function saveOverrides(o: Record<string, number>) {
  const r = await call('/admin/settings', { overrides: o });
  if (r) { shareCache.clear(); await loadStatus(); errors._ = ''; alert('ذخیره شد.'); }
  return !!r;
}

document.body.addEventListener('click', async e => {
  const t = e.target as HTMLElement;
  const tb = t.closest('[data-tab]') as HTMLElement | null;
  if (tb) { tab = tb.dataset.tab as ATab; if (tab === 'support') tickets = (await call(`/admin/tickets?status=${ticketFilter}`)) ?? []; if (tab === 'money') { deposits = (await call('/admin/deposits?status=pending')) ?? []; withdrawals = (await call('/admin/withdrawals?status=pending')) ?? []; } if (tab === 'player' && !players.length) players = (await call('/admin/players?q=')) ?? []; await loadStatus(); render(); return; }
  const mp = t.closest('[data-map]') as HTMLElement | null;
  if (mp && status && !status.lock.locked) { draft.mapId = Number(mp.dataset.map); render(); return; }
  const el = t.closest('[data-act]') as HTMLElement | null; if (!el) return;
  if (el.tagName === 'FORM' || el.closest('form[data-act]') === el) return;
  const act = el.dataset.act; const id = Number(el.dataset.id);
  switch (act) {
    case 'logout': await call('/admin/logout'); status = null; renderLogin(); return;
    case 'saveMap': { const o: Record<string, number> = { ...status!.overrides, mapId: draft.mapId ?? 1 }; if (o.mapId === 1) delete o.mapId; await saveOverrides(o); break; }
    case 'saveNumbers': {
      collectDraft();
      if (Object.keys(errors).length) { errors._ = 'برخی مقادیر رد شدند؛ دلیل زیر هر فیلد نوشته شده.'; break; }
      const cross = validateSettings(applyOverrides(draft));
      if (cross.length) { errors._ = cross.join(' — '); break; }
      await saveOverrides({ ...draft }); break;
    }
    case 'resetField': { delete draft[el.dataset.field!]; break; }
    case 'resetAll': { draft = draft.mapId ? { mapId: draft.mapId } : {}; break; }
    case 'clearSaved': { if (confirm('همه‌ی تنظیمات ذخیره‌شده پاک شود؟')) { const r = await call('/admin/settings/reset'); if (r) { shareCache.clear(); await loadStatus(); } } break; }
    case 'startSeason': {
      if (!confirm('فصل تازه آغاز شود؟ کل پنل تا بسته شدن فصل قفل می‌شود و همه‌ی بازیکنان با ورود بعدی به فصل تازه می‌پیوندند.')) return;
      const r = await call('/admin/season/start');
      if (r) { alert(`فصل ${faDigits(r.season.number)} با نقشه‌ی ${faDigits(r.season.mapId)} آغاز شد.`); await loadStatus(); }
      break;
    }
    case 'loadLogs': logs = (await call('/admin/logs')) ?? []; break;
    case 'openPlayer': playerFile = await call(`/admin/player/${id}`); break;
    case 'tickets': ticketFilter = el.dataset.status!; tickets = (await call(`/admin/tickets?status=${ticketFilter}`)) ?? []; break;
    case 'reply': { const text = (document.getElementById(`reply${id}`) as HTMLTextAreaElement).value.trim(); if (!text) return; await call(`/admin/ticket/${id}`, { reply: text }); tickets = (await call(`/admin/tickets?status=${ticketFilter}`)) ?? []; break; }
    case 'reopen': await call(`/admin/ticket/${id}`, { status: 'open' }); tickets = (await call(`/admin/tickets?status=${ticketFilter}`)) ?? []; break;
    case 'closeTicket': await call(`/admin/ticket/${id}`, { status: 'closed' }); tickets = (await call(`/admin/tickets?status=${ticketFilter}`)) ?? []; break;
    case 'deposit': await call(`/admin/deposit/${id}`, { action: el.dataset.action }); deposits = (await call('/admin/deposits?status=pending')) ?? []; await loadStatus(); break;
    case 'withdrawal': { const note = (document.getElementById(`wnote${id}`) as HTMLInputElement | null)?.value ?? ''; await call(`/admin/withdrawal/${id}`, { action: el.dataset.action, note }); withdrawals = (await call('/admin/withdrawals?status=pending')) ?? []; await loadStatus(); break; }
    default: return;
  }
  render();
});
document.body.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target as HTMLFormElement; const act = form.dataset.act;
  const v = (n: string) => (form.querySelector(`[name=${n}]`) as HTMLInputElement | null)?.value ?? '';
  if (act === 'login') { const r = await call('/admin/login', { password: v('password') }); if (r) { await loadStatus(); render(); } return; }
  if (act === 'searchPlayers') { players = (await call(`/admin/players?q=${encodeURIComponent(v('q'))}`)) ?? []; render(); return; }
  if (act === 'credit') { const id = Number((form.querySelector('button') as HTMLButtonElement).dataset.id); const r = await call(`/admin/player/${id}/credit`, { amount: Number(v('amount')), note: v('note') }); if (r) { playerFile = await call(`/admin/player/${id}`); render(); } return; }
});
document.body.addEventListener('change', e => { const t = e.target as HTMLInputElement; if (t.dataset.field) collectDraft(); });

loadStatus().then(() => render());
setInterval(async () => { if (!status) return; const before = status.lock.locked; const s = await loadStatus(); if (s && s.lock.locked !== before) render(); }, 15000);
