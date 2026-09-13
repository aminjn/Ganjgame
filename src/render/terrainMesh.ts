// چانک‌های زمین: مش سه‌بعدی واقعی، flat-shaded با رنگ رأس، بدون بافت. هر کاشی دو مثلث درشت (حس low-poly).
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial, Color, Group } from 'three';
import type { makeHeight } from './height';
import { hash2 } from '../rules/rng';
import { WATER } from './palette';

export const CHUNK = 16;

export class TerrainChunks {
  material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  waterMaterial = new MeshLambertMaterial({ color: WATER, transparent: true, opacity: 0.82, flatShading: true, depthWrite: false });
  chunks = new Map<string, Group>();
  constructor(private H: ReturnType<typeof makeHeight>, private seed: number) {}

  // موقعیت رأس با لرزش کوچک افقی تا چندضلعی‌ها نامنظم باشند (مشترک بین چانک‌ها چون از هش می‌آید)
  private vx(i: number, j: number) { return i + (hash2(i, j, this.seed + 51) - 0.5) * 0.26; }
  private vz(i: number, j: number) { return j + (hash2(i, j, this.seed + 52) - 0.5) * 0.26; }

  build(cx: number, cz: number): Group {
    const n = CHUNK;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const px = new Float32Array((n + 1) * (n + 1)), pz = new Float32Array((n + 1) * (n + 1)), hs = new Float32Array((n + 1) * (n + 1));
    const cs = new Float32Array((n + 1) * (n + 1) * 3);
    const c = new Color();
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const wx = this.vx(x0 + i, z0 + j), wz = this.vz(x0 + i, z0 + j);
      px[k] = wx; pz[k] = wz; hs[k] = this.H.height(wx, wz);
      this.H.color(wx, wz, c);
      cs[k * 3] = c.r; cs[k * 3 + 1] = c.g; cs[k * 3 + 2] = c.b;
    }
    const pos: number[] = [], col: number[] = [];
    const put = (i: number, j: number) => {
      const k = j * (n + 1) + i;
      pos.push(px[k], hs[k], pz[k]); col.push(cs[k * 3], cs[k * 3 + 1], cs[k * 3 + 2]);
    };
    const wpos: number[] = [];
    const putW = (i: number, j: number) => { const k = j * (n + 1) + i; wpos.push(px[k], this.H.water(px[k], pz[k]), pz[k]); };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      // قطر متغیر (هش) تا مثلث‌بندی الگوی شبکه‌ای نداشته باشد
      if (hash2(x0 + i, z0 + j, this.seed + 53) < 0.5) { put(i, j); put(i, j + 1); put(i + 1, j); put(i + 1, j); put(i, j + 1); put(i + 1, j + 1); }
      else { put(i, j); put(i + 1, j + 1); put(i + 1, j); put(i, j); put(i, j + 1); put(i + 1, j + 1); }
      // آب: روی کاشی مرداب و کاشی‌های همسایه‌اش (تا ساحل داخل کاشی کناری شکل بگیرد)
      const tx = x0 + i, tz = z0 + j;
      if (this.H.T(tx, tz) === 'marsh') { putW(i, j); putW(i, j + 1); putW(i + 1, j); putW(i + 1, j); putW(i, j + 1); putW(i + 1, j + 1); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new Mesh(g, this.material);
    m.receiveShadow = true;
    m.userData.chunk = true;
    const grp = new Group();
    grp.add(m);
    if (wpos.length) {
      const wg = new BufferGeometry();
      wg.setAttribute('position', new Float32BufferAttribute(wpos, 3));
      wg.computeVertexNormals(); wg.computeBoundingSphere();
      const w = new Mesh(wg, this.waterMaterial);
      w.receiveShadow = true; w.renderOrder = 1; w.userData.water = true;
      grp.add(w);
    }
    return grp;
  }

  update(minX: number, minZ: number, maxX: number, maxZ: number, add: (m: Group) => void, remove: (m: Group) => void): boolean {
    const need = new Set<string>();
    const c0x = Math.floor(minX / CHUNK), c0z = Math.floor(minZ / CHUNK), c1x = Math.floor(maxX / CHUNK), c1z = Math.floor(maxZ / CHUNK);
    let changed = false;
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      if (cx < 0 || cz < 0 || cx * CHUNK >= 1000 || cz * CHUNK >= 1000) continue;
      const k = `${cx},${cz}`; need.add(k);
      if (!this.chunks.has(k)) { const m = this.build(cx, cz); this.chunks.set(k, m); add(m); changed = true; }
    }
    for (const [k, m] of this.chunks) if (!need.has(k)) { remove(m); this.dispose(m); this.chunks.delete(k); changed = true; }
    return changed;
  }

  private dispose(g: Group) { g.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); }
  clear(remove: (m: Group) => void) { for (const m of this.chunks.values()) { remove(m); this.dispose(m); } this.chunks.clear(); }
}
