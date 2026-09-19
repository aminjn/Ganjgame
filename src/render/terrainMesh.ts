// چانک‌های زمین: مش پیوسته با سایه‌زنی نرم و رنگ رأس (سبک CoC)، بدون بافت. هر کاشی ۲×۲ زیرمربع.
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshPhongMaterial, Color, Group } from 'three';
import type { makeHeight } from './height';
import { hash2 } from '../rules/rng';
import { WATER } from './palette';
import { makeGroundMaterial, makeGroundTexture, TERRAIN_ID } from './ground';

export const CHUNK = 16;
const SUB = 6;

export class TerrainChunks {
  material = new MeshPhongMaterial({ vertexColors: true, shininess: 6, specular: new Color('#1a1a1a') });
  waterMaterial = new MeshPhongMaterial({ color: WATER, transparent: true, opacity: 0.85, shininess: 8, specular: new Color('#3a4a2a'), depthWrite: false });
  chunks = new Map<string, Group>();
  constructor(private H: ReturnType<typeof makeHeight>, private seed: number) {}

  private jx(_i: number, _j: number) { return 0; }
  private jz(_i: number, _j: number) { return 0; }

  build(cx: number, cz: number): Group {
    const n = CHUNK * SUB;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const N = (n + 1) * (n + 1);
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), wpos = new Float32Array(N * 3);
    const c = new Color();
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const gi = x0 * SUB + i, gj = z0 * SUB + j;
      const wx = x0 + i / SUB + this.jx(gi, gj), wz = z0 + j / SUB + this.jz(gi, gj);
      pos[k * 3] = wx; pos[k * 3 + 1] = this.H.height(wx, wz); pos[k * 3 + 2] = wz;
      wpos[k * 3] = wx; wpos[k * 3 + 1] = this.H.water(wx, wz); wpos[k * 3 + 2] = wz;
      this.H.color(wx, wz, c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx: number[] = [], widx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, cc = a + (n + 1), d = cc + 1;
      const flip = hash2(x0 * SUB + i, z0 * SUB + j, this.seed + 53) < 0.5;
      if (flip) idx.push(a, cc, b, b, cc, d); else idx.push(a, d, b, a, cc, d);
      const tx = x0 + Math.floor(i / SUB), tz = z0 + Math.floor(j / SUB);
      if (this.H.T(tx, tz) === 'marsh') { if (flip) widx.push(a, cc, b, b, cc, d); else widx.push(a, d, b, a, cc, d); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // زمین نقاشی‌گونه‌ی GPU در حالت کاشی؛ رنگ رأس فقط پشتیبان مدل سه‌بعدی
    let mat: any = this.material;
    if (this.H.flat) { const size = CHUNK + 2; const tex = makeGroundTexture(size, (i, j) => TERRAIN_ID[this.H.T(x0 - 1 + i, z0 - 1 + j)]); mat = makeGroundMaterial(tex, x0 - 1, z0 - 1, size, this.seed); }
    const m = new Mesh(g, mat);
    m.receiveShadow = true;
    m.userData.chunk = true;
    const grp = new Group();
    grp.add(m);
    if (widx.length && !this.H.flat) {
      const wg = new BufferGeometry();
      wg.setAttribute('position', new Float32BufferAttribute(wpos, 3));
      wg.setIndex(widx);
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

  private dispose(g: Group) { g.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== this.material && o.material !== this.waterMaterial) { o.material.uniforms?.tTerrain?.value?.dispose(); o.material.dispose(); } }); }
  clear(remove: (m: Group) => void) { for (const m of this.chunks.values()) { remove(m); this.dispose(m); } this.chunks.clear(); }
}
