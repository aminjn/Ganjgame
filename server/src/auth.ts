// رمزنگاری گذرواژه (scrypt داخلی Node) و توکن نشست (HMAC) — بدون وابستگی خارجی
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const h = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, h] = stored.split(':'); if (!salt || !h) return false;
  const c = scryptSync(pw, salt, 64);
  const s = Buffer.from(h, 'hex');
  return c.length === s.length && timingSafeEqual(c, s);
}

export interface TokenPayload { sub: number; role: 'player' | 'admin'; exp: number }
const b64 = (s: string) => Buffer.from(s).toString('base64url');
export function signToken(p: TokenPayload, secret: string): string {
  const body = b64(JSON.stringify(p));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(t: string | undefined, secret: string): TokenPayload | null {
  if (!t) return null;
  const [body, sig] = t.split('.'); if (!body || !sig) return null;
  const want = createHmac('sha256', secret).update(body).digest('base64url');
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload; if (p.exp < Date.now()) return null; return p; } catch { return null; }
}
