// موجودات روی خانه‌های موجوددارِ تصاحب‌نشده (اسپرایت شیت مرجع، Instanced رو به دوربین ثابت)
import { Group, InstancedMesh, Object3D, Quaternion } from 'three';
import type { Terrain } from '../rules/constants';
import { hash2 } from '../rules/rng';
import type { SpriteLib } from './sprites';

const DENSITY: Partial<Record<Terrain, number>> = { mountain: 0.02, marsh: 0.02, danger: 0.03, hell: 0.045 };
const KEY: Partial<Record<Terrain, string>> = { mountain: 'monsters.mountain', marsh: 'monsters.marsh', danger: 'monsters.danger', hell: 'monsters.hell', tomb: 'monsters.tomb', treasure: 'monsters.treasure' };
const CAP = 600;

export class Monsters {
  group = new Group();
  private meshes = new Map<string, InstancedMesh>();
  private tmp = new Object3D();

  populate(sprites: SpriteLib, camQuat: Quaternion, minX: number, minZ: number, maxX: number, maxZ: number, terrain: (x: number, y: number) => Terrain, height: (x: number, z: number) => number, owned: (x: number, y: number) => boolean, seed: number) {
    if (!sprites.ready) return;
    const counts = new Map<string, number>();
    for (const im of this.meshes.values()) im.count = 0;
    const put = (key: string, wx: number, wz: number, sc: number) => {
      let im = this.meshes.get(key);
      if (!im) { const r = sprites.makeInstanced(key, CAP, camQuat); if (!r) return; im = r.mesh; this.meshes.set(key, im); this.group.add(im); }
      const n = counts.get(key) ?? 0; if (n >= CAP) return;
      this.tmp.position.set(wx, height(wx, wz), wz); this.tmp.quaternion.copy(camQuat); this.tmp.scale.setScalar(sc); this.tmp.updateMatrix();
      im.setMatrixAt(n, this.tmp.matrix); im.count = n + 1; counts.set(key, n + 1);
    };
    for (let y = minZ; y <= maxZ; y++) for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= 1000 || y >= 1000 || owned(x, y)) continue;
      const t = terrain(x, y); const key = KEY[t]; if (!key || !sprites.has(key)) continue;
      if (t === 'tomb' || t === 'treasure') { put(key, x + 0.5 + 0.9, y + 0.5 + 0.6, t === 'treasure' ? 1.2 : 1.0); continue; }
      if (hash2(x, y, seed + 555) >= (DENSITY[t] ?? 0)) continue;
      const wx = x + 0.2 + hash2(x, y, seed + 556) * 0.6, wz = y + 0.2 + hash2(x, y, seed + 557) * 0.6;
      put(key, wx, wz, 0.85 + hash2(x, y, seed + 558) * 0.3);
    }
    for (const im of this.meshes.values()) im.instanceMatrix.needsUpdate = true;
  }
}
