// پنل ادمین: شش تب. هیچ لینکی از بازی به این‌جا نیست. فقط اعدادی ذخیره می‌شوند که با پیش‌فرض فرق دارند.
import { FIELDS, defaultSettings, applyOverrides, validateField, validateSettings, getPath, type FieldMeta } from './rules/settings';
import { MAPS, createTerrain, mapById } from './rules/terrain';
import * as S from './rules/state';
import type { State } from './rules/state';
import { artifactValue, treasureValue, participationValue } from './rules/economy';
import { num, dateTime, faDigits, pct } from './rules/format';
import { TERRAIN, type Terrain, KEY_ADMIN, KEY_ADMIN_CMD, KEY_SUPPORT, KEY_STATE, KEY_SEASON } from './rules/constants';
import { loadOverrides, saveOverrides, readSeason, writeSeason, writeCmd, readCmd, readTickets, writeTickets, readStateRaw } from './ui/storage';
import { drawTerrainPreview } from './ui/minimap';

type ATab = 'status' | 'season' | 'numbers' | 'player' | 'support' | 'saved';
const ATABS: { id: ATab; label: string }[] = [
  { id: 'status', label: 'وضعیت و امنیت' }, { id: 'season', label: 'فصل و نقشه' }, { id: 'numbers', label: 'اعداد و قیمت‌ها' },
  { id: 'player', label: 'پرونده‌ی بازیکن' }, { id: 'support', label: 'پشتیبانی' }, { id: 'saved', label: 'تنظیمات ذخیره‌شده' },
];
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

let tab: ATab = 'status';
let overrides = loadOverrides();
let draft: Record<string, number> = { ...overrides };
let errors: Record<string, string> = {};
const shareCache = new Map<number, Record<string, number>>();

function loadState(): State | null { const raw = readStateRaw(); if (!raw) return null; return S.deserialize(raw).state; }

interface LockInfo { locked: boolean; reason: string }
function lockInfo(): LockInfo {
  const st = loadState();
  const mark = readSeason();
  if (st && st.seasonClosed) return { locked: false, reason: `فصل ${faDigits(st.season)} با پرداخت پایان فصل بسته شده؛ تنظیمات باز است.` };
  if (mark && mark.startedByAdmin && (!st || st.season === mark.season)) return { locked: true, reason: `قفل: ادمین «آغاز فصل تازه» را برای فصل ${faDigits(mark.season)} زده است.` };
  if (st && S.seasonInProgress(st)) return { locked: true, reason: `قفل: بازیکن عملاً بازی فصل ${faDigits(st.season)} را شروع کرده (سکه خریده، خانه گرفته، نیرو دارد، تجربه گرفته یا استخر پر شده).` };
  return { locked: false, reason: 'تنظیمات باز است — همه‌چیز را پیش از آغاز فصل ست کنید.' };
}

function render() {
  const lock = lockInfo();
  const lb = $('lockbar'); lb.className = `lockbar ${lock.locked ? 'locked' : 'open'}`; lb.textContent = lock.reason;
  $('atabs').innerHTML = ATABS.map(t => `<button data-tab="${t.id}" class="${t.id === tab ? 'active' : ''}">${t.label}</button>`).join('');
  const html = { status: statusHtml, season: seasonHtml, numbers: numbersHtml, player: playerHtml, support: supportHtml, saved: savedHtml }[tab](lock);
  $('content').innerHTML = html;
  if (tab === 'season') drawPreviews();
}

function statusHtml(): string {
  const st = loadState();
  const s = applyOverrides(overrides);
  if (!st) return `<div class="card"><h3>وضعیت</h3><p class="muted">هنوز وضعیتی از بازی ذخیره نشده است. بازی را یک‌بار باز کنید.</p></div>`;
  const checks = S.sanitize(JSON.parse(JSON.stringify(st)), s, S.makeGen(st, s)); // روی کپی — این‌جا چیزی نوشته نمی‌شود
  const cmd = readCmd();
  return `<div class="card"><h3>خلاصه‌ی فصل ${faDigits(st.season)}</h3><div class="kv">
      <span>نقشه‌ی فعال</span><span>${num(st.mapId)} — ${esc(mapById(st.mapId).name)}</span>
      <span>استخر جایزه</span><span>${num(st.pool)} تومان</span>
      <span>ارزش لحظه‌ای هر آرتیفکت (${pct(s.artifactShare)})</span><span>${num(artifactValue(st.pool, s))} تومان</span>
      <span>ارزش گنج اصلی (کف ${num(s.treasureFloor)} / ${pct(s.treasureShare)})</span><span>${num(treasureValue(st.pool, s))} تومان</span>
      <span>جایزه‌ی مشارکت (${pct(s.participationShare)})</span><span>${num(participationValue(st.pool, s))} تومان</span>
      <span>مجموع سهم جایزه‌ها</span><span>${pct(s.treasureShare + 10 * s.artifactShare + s.participationShare)} استخر</span>
      <span>بازیکنان شرکت‌کننده</span><span>${num(st.playersJoined)}</span>
      <span>خانه‌های تصاحب‌شده</span><span>${num(Object.keys(st.owned).length)}</span>
      <span>گنج</span><span>${st.treasure ? `فتح شده (${dateTime(st.treasure.at)})` : 'فتح نشده'}</span>
      <span>فصل بسته</span><span>${st.seasonClosed ? 'بله' : 'نه'}</span>
      <span>آخرین فرمان ادمین</span><span>${cmd ? `#${num(cmd.id)} در ${dateTime(cmd.at)}` : '—'}</span>
      <span>آخرین تیک بازی</span><span>${dateTime(st.lastTick)}</span></div></div>
    <div class="card"><h3>بازبینی یکپارچگی (${num(checks.length)} ردیف)</h3><table><tr><th>بررسی</th><th>وضعیت</th><th>توضیح</th></tr>
      ${checks.map(c => `<tr><td>${esc(c.name)}</td><td class="${c.ok ? 'ok' : 'warn'}">${c.ok ? 'درست' : 'ایراد'}</td><td>${esc(c.note)}</td></tr>`).join('')}</table>
      <p class="muted">این بازبینی روی کپی انجام می‌شود؛ اصلاح واقعی هنگام بارگذاری بازی رخ می‌دهد.</p></div>
    <div class="card"><h3>کلیدهای ذخیره‌سازی مشترک</h3><div class="kv"><span>تنظیمات</span><span>${KEY_ADMIN}</span><span>فرمان آغاز فصل</span><span>${KEY_ADMIN_CMD}</span><span>تیکت‌ها</span><span>${KEY_SUPPORT}</span><span>وضعیت بازی</span><span>${KEY_STATE}</span><span>نشان فصل</span><span>${KEY_SEASON}</span></div></div>`;
}

function mapShares(id: number): Record<string, number> {
  let c = shareCache.get(id);
  if (c) return c;
  const s = applyOverrides(overrides);
  const gen = createTerrain(mapById(id), s.valleyBlock, s.dangerBlob);
  const counts: Record<string, number> = {}; let n = 0;
  for (let x = 2; x < 1000; x += 9) for (let y = 2; y < 1000; y += 9) { n++; const t = gen.at(x, y); counts[t] = (counts[t] || 0) + 1; }
  c = {}; for (const k of Object.keys(counts)) c[k] = counts[k] / n;
  shareCache.set(id, c);
  return c;
}

function seasonHtml(lock: LockInfo): string {
  const sel = draft.mapId ?? overrides.mapId ?? 1;
  const maps = MAPS.map(m => {
    const sh = mapShares(m.id);
    const line = (['danger', 'mountain', 'marsh', 'plain', 'safe', 'valley'] as Terrain[]).map(t => `${TERRAIN[t].name} ${pct(sh[t] || 0)}`).join(' · ');
    return `<div class="map ${m.id === sel ? 'sel' : ''}" data-map="${m.id}"><canvas id="prev${m.id}"></canvas><b>${num(m.id)}. ${esc(m.name)}</b><div class="shares">${esc(m.desc)}<br>${line}<br>هسته ${num(m.coreRadius)} · دره ${num(m.valleyBlock)} · لکه‌ی خطر ${num(m.dangerBlob)}</div></div>`;
  }).join('');
  const mark = readSeason();
  return `<div class="card"><h3>نقشه‌ی فصل بعد</h3><p class="muted">ده نقشه از یک مولد می‌آیند و فقط در چیدمان زمین فرق دارند. پیش‌نمایش‌ها از دل خودِ کد بازی کشیده می‌شوند. نقشه‌ی تازه با آغاز فصل بعدی اعمال می‌شود، نه در میانه‌ی فصل جاری.</p>
    <div class="maps">${maps}</div>
    ${lock.locked ? '<p class="warn">در میانه‌ی فصل قابل تغییر نیست.</p>' : `<div class="row" style="margin-top:10px"><button class="primary" data-act="saveMap">ذخیره‌ی انتخاب نقشه (${num(sel)})</button></div>`}</div>
    <div class="card"><h3>آغاز فصل تازه</h3><p class="muted">دقیقاً همان کار «انصراف از فصل» در خود بازی را می‌کند: بازی در تیک بعدی فرمان را می‌بیند، تنظیمات و نقشه را از نو می‌خواند، دنیا را می‌سازد و نمای کل سرزمین را از نو می‌کشد. از این لحظه کل پنل تا بسته شدن فصل با پرداخت پایان فصل قفل است.</p>
    <div class="kv"><span>نشان فصل</span><span>${mark ? `فصل ${num(mark.season)} — ${mark.startedByAdmin ? 'با فرمان ادمین' : 'بی‌فرمان'} — ${mark.closed ? 'بسته' : 'باز'}` : '—'}</span></div>
    ${lock.locked ? '<p class="warn">فصلی که آغاز شده در میان راه پایان‌دادنی نیست.</p>' : '<div class="row"><button class="danger" data-act="startSeason">آغاز فصل تازه</button></div>'}</div>`;
}

function drawPreviews() {
  const s = applyOverrides(overrides);
  for (const m of MAPS) {
    const c = document.getElementById(`prev${m.id}`) as HTMLCanvasElement | null; if (!c) continue;
    const gen = createTerrain(m, s.valleyBlock, s.dangerBlob);
    drawTerrainPreview(c, (x, y) => gen.at(x, y), 100);
  }
}

function numbersHtml(lock: LockInfo): string {
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
  const st = loadState();
  if (!st) return `<div class="card"><p class="muted">وضعیتی ذخیره نشده است.</p></div>`;
  const s = applyOverrides(overrides);
  const p = st.player;
  return `<div class="card"><h3>خلاصه‌ی وضعیت «${esc(p.name ?? 'بی‌نام')}»</h3><div class="kv">
      <span>تومان / بلوکه</span><span>${num(p.toman)} / ${num(p.blocked)}</span><span>سکه</span><span>${num(p.coins)}</span>
      <span>تجربه / سطح</span><span>${num(p.xp)} / ${num(S.levelOf(st, s, 'player'))}</span><span>نیروی آزاد</span><span>${Object.entries(p.units).map(([k, v]) => `${esc(k)}:${num(v as number)}`).join(' ')}</span>
      <span>انرژی</span><span>${num(p.energy)}</span><span>کمپ / کاروان</span><span>${p.camp ? `(${num(p.camp.x)}، ${num(p.camp.y)})` : '—'} / ${p.pos ? `(${num(p.pos.x)}، ${num(p.pos.y)})` : '—'}</span>
      <span>خانه‌ها</span><span>${num(Object.values(st.owned).filter(o => o.owner === 'player').length)}</span><span>آرتیفکت</span><span>${num(p.artifacts.length)}</span>
      <span>سکه‌ی خرج‌شده</span><span>${num(p.spentCoins)}</span><span>شبا</span><span>${esc(p.iban || '—')} ${esc(p.ownerName)}</span>
      <span>کلن</span><span>${st.clan ? `${esc(st.clan.name)} — خزانه ${num(st.clan.treasury)} — سطح ${num(S.levelOf(st, s, 'clan'))}` : '—'}</span></div></div>
    <div class="card"><h3>لاگ فعالیت</h3><div class="log">${st.log.slice(0, 60).map(l => `<div><time>${dateTime(l.t)}</time>[${l.who === 'clan' ? 'کلن' : 'بازیکن'}] ${esc(l.text)}</div>`).join('') || '<div class="muted">خالی</div>'}</div></div>
    <div class="card"><h3>تراکنش‌های مالی</h3><table>${st.tx.slice(0, 60).map(t => `<tr><td>${esc(t.note)}</td><td class="n">${num(t.amount)}</td><td>${dateTime(t.t)}</td></tr>`).join('') || '<tr><td class="muted">خالی</td></tr>'}</table></div>`;
}

function supportHtml(): string {
  const tickets = readTickets();
  if (!tickets.length) return `<div class="card"><p class="muted">تیکتی نیست. تیکت‌ها بیرون از وضعیت بازی نگه داشته می‌شوند و با ریست پاک نمی‌شوند.</p></div>`;
  return tickets.map(t => `<div class="card"><h3>${esc(t.subject)} <span class="chip">${t.status === 'open' ? 'باز' : 'بسته'}</span></h3>
    <div class="muted">${esc(t.player)} — ${dateTime(t.createdAt)}</div><p>${esc(t.body)}</p>
    ${t.reply ? `<p class="ok">پاسخ (${dateTime(t.repliedAt!)}): ${esc(t.reply)}</p>` : ''}
    <div class="row"><textarea id="reply${t.id}" rows="2" placeholder="پاسخ">${esc(t.reply ?? '')}</textarea></div>
    <div class="row"><button class="primary" data-act="reply" data-id="${t.id}">ثبت پاسخ و بستن</button>${t.status === 'closed' ? `<button data-act="reopen" data-id="${t.id}">باز کردن دوباره</button>` : ''}</div></div>`).join('');
}

function savedHtml(lock: LockInfo): string {
  return `<div class="card"><h3>تنظیمات ذخیره‌شده (${KEY_ADMIN})</h3><p class="muted">فقط مقادیر متفاوت با پیش‌فرض. بازی اول مقادیر مخصوص نقشه را می‌نشاند و بعد این اعداد را رویش می‌گذارد.</p>
    <pre>${esc(JSON.stringify(overrides, null, 2))}</pre>
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

document.body.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const tb = t.closest('[data-tab]') as HTMLElement | null;
  if (tb) { tab = tb.dataset.tab as ATab; render(); return; }
  const mp = t.closest('[data-map]') as HTMLElement | null;
  if (mp && !lockInfo().locked) { draft.mapId = Number(mp.dataset.map); render(); return; }
  const el = t.closest('[data-act]') as HTMLElement | null; if (!el) return;
  const act = el.dataset.act;
  const lock = lockInfo();
  if (lock.locked && act !== 'reply' && act !== 'reopen') { alert('پنل قفل است: ' + lock.reason); return; }
  switch (act) {
    case 'saveMap': { overrides = { ...overrides, mapId: draft.mapId ?? 1 }; if (overrides.mapId === 1) delete overrides.mapId; saveOverrides(overrides); shareCache.clear(); break; }
    case 'saveNumbers': {
      collectDraft();
      if (Object.keys(errors).length) { errors._ = 'برخی مقادیر رد شدند؛ دلیل زیر هر فیلد نوشته شده.'; break; }
      const s = applyOverrides(draft);
      const cross = validateSettings(s);
      if (cross.length) { errors._ = cross.join(' — '); break; }
      overrides = { ...draft }; saveOverrides(overrides); shareCache.clear(); errors._ = ''; alert('ذخیره شد.');
      break;
    }
    case 'resetField': { const f = el.dataset.field!; delete draft[f]; break; }
    case 'resetAll': { draft = draft.mapId ? { mapId: draft.mapId } : {}; break; }
    case 'clearSaved': { if (confirm('همه‌ی تنظیمات ذخیره‌شده پاک شود؟')) { overrides = {}; draft = {}; saveOverrides(overrides); shareCache.clear(); } break; }
    case 'startSeason': {
      if (!confirm('فصل تازه آغاز شود؟ کل پنل تا بسته شدن فصل قفل می‌شود.')) return;
      const prev = readCmd();
      const id = (prev?.id ?? 0) + 1;
      const st = loadState();
      const season = (st?.season ?? 0) + 1;
      writeCmd({ id, type: 'newSeason', at: Date.now() });
      writeSeason({ season, startedAt: Date.now(), startedByAdmin: true, closed: false, lastCmd: readSeason()?.lastCmd ?? 0 });
      alert(`فرمان آغاز فصل ${faDigits(season)} ثبت شد؛ بازی در تیک بعدی آن را اعمال می‌کند.`);
      break;
    }
    case 'reply': {
      const id = Number(el.dataset.id); const tickets = readTickets(); const tk = tickets.find(x => x.id === id); if (!tk) return;
      const text = (document.getElementById(`reply${id}`) as HTMLTextAreaElement).value.trim(); if (!text) return;
      tk.reply = text; tk.repliedAt = Date.now(); tk.status = 'closed'; writeTickets(tickets); break;
    }
    case 'reopen': { const id = Number(el.dataset.id); const tickets = readTickets(); const tk = tickets.find(x => x.id === id); if (tk) { tk.status = 'open'; writeTickets(tickets); } break; }
  }
  render();
});
document.body.addEventListener('change', e => { const t = e.target as HTMLInputElement; if (t.dataset.field) collectDraft(); });

render();
setInterval(() => { const lb = $('lockbar'); const lock = lockInfo(); const cls = `lockbar ${lock.locked ? 'locked' : 'open'}`; if (lb.className !== cls) render(); }, 2000);
