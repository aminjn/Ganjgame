// چانک‌های زمین: مش سه‌بعدی واقعی، flat-shaded با رنگ رأس، بدون بافت.
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial, Color } from 'three';
import type { makeHeight } from './height';

export const CHUNK = 16;
export const SUB = 2; // هر کاشی ۲×۲ زیرمربع

export class TerrainChunks {
  material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  chunks = new Map<string, Mesh>();
  constructor(private H: ReturnType<typeof makeHeight>) {}

  build(cx: number, cz: number): Mesh {
    const n = CHUNK * SUB;
    const step = 1 / SUB;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const hs = new Float32Array((n + 1) * (n + 1));
    const cs = new Float32Array((n + 1) * (n + 1) * 3);
    const c = new Color();
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const wx = x0 + i * step, wz = z0 + j * step;
      const k = j * (n + 1) + i;
      hs[k] = this.H.height(wx, wz);
      this.H.color(wx, wz, c);
      cs[k * 3] = c.r; cs[k * 3 + 1] = c.g; cs[k * 3 + 2] = c.b;
    }
    const pos = new Float32Array(n * n * 6 * 3);
    const col = new Float32Array(n * n * 6 * 3);
    let p = 0;
    const put = (i: number, j: number) => {
      const k = j * (n + 1) + i;
      pos[p] = x0 + i * step; pos[p + 1] = hs[k]; pos[p + 2] = z0 + j * step;
      col[p] = cs[k * 3]; col[p + 1] = cs[k * 3 + 1]; col[p + 2] = cs[k * 3 + 2];
      p += 3;
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      // قطر متغیر تا مثلث‌بندی هم الگوی شبکه‌ای نداشته باشد
      if (((i + j) & 1) === 0) { put(i, j); put(i, j + 1); put(i + 1, j); put(i + 1, j); put(i, j + 1); put(i + 1, j + 1); }
      else { put(i, j); put(i + 1, j + 1); put(i + 1, j); put(i, j); put(i, j + 1); put(i + 1, j + 1); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new Mesh(g, this.material);
    m.receiveShadow = true;
    m.castShadow = false;
    m.userData.chunk = true;
    return m;
  }

  // چانک‌های لازم برای ناحیه‌ی دید را می‌سازد و بقیه را حذف می‌کند. برمی‌گرداند آیا تغییری شد.
  update(minX: number, minZ: number, maxX: number, maxZ: number, add: (m: Mesh) => void, remove: (m: Mesh) => void): boolean {
    const need = new Set<string>();
    const c0x = Math.floor(minX / CHUNK), c0z = Math.floor(minZ / CHUNK), c1x = Math.floor(maxX / CHUNK), c1z = Math.floor(maxZ / CHUNK);
    let changed = false;
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      if (cx < 0 || cz < 0 || cx * CHUNK >= 1000 || cz * CHUNK >= 1000) continue;
      const k = `${cx},${cz}`; need.add(k);
      if (!this.chunks.has(k)) { const m = this.build(cx, cz); this.chunks.set(k, m); add(m); changed = true; }
    }
    for (const [k, m] of this.chunks) if (!need.has(k)) { remove(m); m.geometry.dispose(); this.chunks.delete(k); changed = true; }
    return changed;
  }

  clear(remove: (m: Mesh) => void) { for (const m of this.chunks.values()) { remove(m); m.geometry.dispose(); } this.chunks.clear(); }
}
