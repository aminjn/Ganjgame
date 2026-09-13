const FA = '۰۱۲۳۴۵۶۷۸۹';
export function faDigits(s: string | number): string { return String(s).replace(/[0-9]/g, d => FA[+d]); }
export function num(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  const f = n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return faDigits(f.replace(/,/g, '٬'));
}
export function toman(n: number): string { return `${num(Math.floor(n))} تومان`; }
export function coins(n: number, digits = 0): string { return `${num(n, digits)} سکه`; }
export function pct(n: number): string { return `${num(n * 100, 1)}٪`; }
export function secs(s: number): string {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return `${num(s)} ثانیه`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return `${num(m)} دقیقه و ${num(r)} ثانیه`;
  const h = Math.floor(m / 60);
  return `${num(h)} ساعت و ${num(m % 60)} دقیقه`;
}
export function dateTime(t: number): string {
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(t)); } catch { return faDigits(new Date(t).toLocaleString()); }
}
