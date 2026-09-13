// کم‌هزینه‌ترین راه (A*) برای کوچ بلند تا ۲۰ خانه، و سفر رایگان از مسیر خانه‌های خودی.
import { type Terrain } from './constants';
import { inMap, neighbors8, tileKey } from './terrain';

export interface P { x: number; y: number }

class MinHeap<T> {
  a: { k: number; v: T }[] = [];
  push(k: number, v: T) { this.a.push({ k, v }); let i = this.a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.a[p].k <= this.a[i].k) break; [this.a[p], this.a[i]] = [this.a[i], this.a[p]]; i = p; } }
  pop(): T | undefined { if (!this.a.length) return undefined; const top = this.a[0].v; const last = this.a.pop()!; if (this.a.length) { this.a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.a.length && this.a[l].k < this.a[m].k) m = l; if (r < this.a.length && this.a[r].k < this.a[m].k) m = r; if (m === i) break; [this.a[m], this.a[i]] = [this.a[i], this.a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

// مسیر از start (خودی) به goal؛ هر خانه‌ی مسیر هزینه‌ی cost(x,y) دارد (Infinity = عبورناپذیر). start در مسیر نیست.
export function findPath(start: P, goal: P, cost: (x: number, y: number) => number, maxLen: number): P[] | null {
  const sk = tileKey(start.x, start.y);
  const g = new Map<string, number>([[sk, 0]]);
  const steps = new Map<string, number>([[sk, 0]]);
  const prev = new Map<string, string>();
  const heap = new MinHeap<{ x: number; y: number; k: string }>();
  const h = (x: number, y: number) => Math.max(Math.abs(x - goal.x), Math.abs(y - goal.y));
  heap.push(h(start.x, start.y), { x: start.x, y: start.y, k: sk });
  const closed = new Set<string>();
  let expanded = 0;
  while (heap.size && expanded < 60000) {
    const cur = heap.pop()!;
    if (closed.has(cur.k)) continue;
    closed.add(cur.k); expanded++;
    if (cur.x === goal.x && cur.y === goal.y) {
      const path: P[] = []; let k = cur.k;
      while (k !== sk) { const [a, b] = k.split(','); path.push({ x: +a, y: +b }); k = prev.get(k)!; }
      return path.reverse();
    }
    const st = steps.get(cur.k)!;
    if (st >= maxLen) continue;
    for (const n of neighbors8(cur.x, cur.y)) {
      if (!inMap(n.x, n.y)) continue;
      const c = cost(n.x, n.y);
      if (!Number.isFinite(c)) continue;
      const nk = tileKey(n.x, n.y);
      const ng = g.get(cur.k)! + c;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng); steps.set(nk, st + 1); prev.set(nk, cur.k);
        heap.push(ng + h(n.x, n.y) * 0.5, { x: n.x, y: n.y, k: nk });
      }
    }
  }
  return null;
}

// مسیر رایگان فقط از خانه‌های خودی (BFS)
export function findOwnPath(start: P, goal: P, own: (x: number, y: number) => boolean, maxLen = 400): P[] | null {
  return findPath(start, goal, (x, y) => (own(x, y) ? 1 : Infinity), maxLen);
}

export function terrainCost(t: Terrain, supply: Record<Terrain, number>, monsters: number): number {
  if (t === 'valley') return Infinity;
  return supply[t] + monsters / 50;
}
