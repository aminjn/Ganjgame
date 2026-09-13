// ذخیره‌سازی مشترک بین بازی و پنل ادمین (کلیدهای بند ۱۸ سند اول)
import { KEY_ADMIN, KEY_ADMIN_CMD, KEY_SUPPORT, KEY_SEASON, KEY_STATE, KEY_LOCK } from '../rules/constants';
import { applyOverrides, type Settings } from '../rules/settings';

export function readJson<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fallback; } catch { return fallback; }
}
export function writeJson(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

export function loadSettings(): Settings { return applyOverrides(readJson<Record<string, number>>(KEY_ADMIN, {})); }
export function loadOverrides(): Record<string, number> { return readJson<Record<string, number>>(KEY_ADMIN, {}); }
export function saveOverrides(o: Record<string, number>) { writeJson(KEY_ADMIN, o); }

export interface AdminCmd { id: number; type: 'newSeason'; at: number }
export function readCmd(): AdminCmd | null { return readJson<AdminCmd | null>(KEY_ADMIN_CMD, null); }
export function writeCmd(c: AdminCmd) { writeJson(KEY_ADMIN_CMD, c); }

export interface SeasonMark { season: number; startedAt: number; startedByAdmin: boolean; closed: boolean; lastCmd: number }
export function readSeason(): SeasonMark | null { return readJson<SeasonMark | null>(KEY_SEASON, null); }
export function writeSeason(m: SeasonMark) { writeJson(KEY_SEASON, m); }

export interface Ticket { id: number; player: string; subject: string; body: string; status: 'open' | 'closed'; createdAt: number; reply?: string; repliedAt?: number }
export function readTickets(): Ticket[] { return readJson<Ticket[]>(KEY_SUPPORT, []); }
export function writeTickets(t: Ticket[]) { writeJson(KEY_SUPPORT, t); }

export function readStateRaw(): string | null { try { return localStorage.getItem(KEY_STATE); } catch { return null; } }
export function writeStateRaw(s: string) { try { localStorage.setItem(KEY_STATE, s); } catch { /* ignore */ } }

// قفل ساعت بازی: در هر مرورگر فقط یک نمایه مالک ساعت است؛ اگر ۳ ثانیه نشانه‌ی حیات نداد، نمایه‌ی فعال مالکیت را می‌گیرد.
export interface Lock { owner: string; at: number }
export function readLock(): Lock | null { return readJson<Lock | null>(KEY_LOCK, null); }
export function writeLock(l: Lock) { writeJson(KEY_LOCK, l); }
