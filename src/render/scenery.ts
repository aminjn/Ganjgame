// صحنه‌آرایی با مدل‌های CC0 طبیعت Quaternius: پراکندگی با آفست زیرکاشی، چرخش و مقیاس تصادفی — هیچ‌چیز با شبکه هم‌راستا نیست.
import {
  BufferGeometry, Color, InstancedMesh, Material, Matrix4, MeshLambertMaterial, Object3D, Group, Box3, Vector3, Mesh, DoubleSide, FrontSide, Texture, SRGBColorSpace,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { hash2 } from '../rules/rng';
import type { Terrain } from '../rules/constants';
import { HELL_ROCK_TINT, DANGER_LEAF_TINT, MARSH_LEAF_TINT } from './palette';

interface Part { geometry: BufferGeometry; material: Material; leaf: boolean }
interface Model { name: string; parts: Part[]; minY: number; height: number; targetH: number }

// نام مدل → ارتفاع هدف به واحد کاشی
const TARGET_H: Record<string, number> = {
  CommonTree: 2.2, Pine: 2.5, DeadTree: 1.9, Rock_Medium: 0.6, Pebble_Round: 0.16, Bush_Common: 0.45, Bush_Common_Flowers: 0.45,
  Fern_1: 0.3, Grass_Common_Tall: 0.3, Grass_Wispy_Tall: 0.32, Mushroom_Common: 0.18, Flower_3_Group: 0.22, Flower_4_Group: 0.22, Plant_1_Big: 0.35, Clover_1: 0.14,
};
const NAMES = [
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5',
  'DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
  'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Grass_Common_Tall', 'Grass_Wispy_Tall',
  'Mushroom_Common', 'Flower_3_Group', 'Flower_4_Group', 'Plant_1_Big', 'Clover_1',
];
const GROUPS: Record<string, string[]> = {
  tree: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'],
  pine: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'],
  dead: ['DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5'],
  rock: ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'],
  pebble: ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3'],
  bush: ['Bush_Common', 'Bush_Common_Flowers'],
  grass: ['Grass_Common_Tall', 'Grass_Wispy_Tall', 'Clover_1', 'Flower_3_Group', 'Flower_4_Group'],
  marshPlant: ['Fern_1', 'Mushroom_Common', 'Plant_1_Big'],
};

interface Spawn { group: string; chance: number; scale: [number, number]; tint?: Color; leafTint?: Color }
// چیدمان هر زمین: کم‌جزئیات، تا زمین با نیروها رقابت نکند
const SPAWNS: Record<Terrain, Spawn[]> = {
  safe:     [{ group: 'tree', chance: 0.05, scale: [0.8, 1.2] }, { group: 'grass', chance: 0.10, scale: [0.8, 1.3] }, { group: 'pebble', chance: 0.03, scale: [0.8, 1.4] }],
  plain:    [{ group: 'tree', chance: 0.035, scale: [0.85, 1.25] }, { group: 'bush', chance: 0.03, scale: [0.8, 1.2] }, { group: 'grass', chance: 0.12, scale: [0.8, 1.3] }, { group: 'pebble', chance: 0.02, scale: [0.8, 1.4] }],
  mountain: [{ group: 'pine', chance: 0.22, scale: [0.75, 1.3] }, { group: 'rock', chance: 0.14, scale: [0.7, 1.5] }, { group: 'pebble', chance: 0.08, scale: [0.9, 1.6] }],
  marsh:    [{ group: 'dead', chance: 0.16, scale: [0.8, 1.2], leafTint: MARSH_LEAF_TINT }, { group: 'marshPlant', chance: 0.14, scale: [0.9, 1.5] }, { group: 'grass', chance: 0.05, scale: [0.9, 1.3] }],
  danger:   [{ group: 'dead', chance: 0.16, scale: [0.8, 1.3], leafTint: DANGER_LEAF_TINT }, { group: 'rock', chance: 0.12, scale: [0.7, 1.4], tint: new Color('#9a6f60') }, { group: 'marshPlant', chance: 0.03, scale: [0.9, 1.3] }],
  hell:     [{ group: 'rock', chance: 0.28, scale: [0.8, 1.7], tint: HELL_ROCK_TINT }, { group: 'dead', chance: 0.08, scale: [0.7, 1.1], leafTint: new Color('#6b4a3e') }],
  tomb:     [],
  treasure: [],
  valley:   [],
};

// نرمال‌های کروی برای کارت‌های برگ: نور نرم و روشن به‌جای کارت‌های نیمه‌سیاه
function sphericalNormals(g: BufferGeometry) {
  g.computeBoundingBox();
  const b = g.boundingBox!; const c = new Vector3(); b.getCenter(c); c.y = b.min.y + (b.max.y - b.min.y) * 0.45;
  const pos = g.getAttribute('position'); const nrm = g.getAttribute('normal');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).sub(c); v.y *= 0.8; v.normalize(); nrm.setXYZ(i, v.x, v.y + 0.25, v.z); }
  nrm.needsUpdate = true;
}

export class Scenery {
  group = new Group();
  private models = new Map<string, Model>();
  private meshes = new Map<string, InstancedMesh[]>(); // model → یک InstancedMesh به ازای هر part
  ready = false;
  private capacity = 500;
  private tmpM = new Matrix4();
  private tmpO = new Object3D();
  private tmpC = new Color();

  constructor(private mobile: boolean) { if (mobile) this.capacity = 320; }

  async load(base = 'assets/models/'): Promise<void> {
    const loader = new GLTFLoader();
    const box = new Box3(), size = new Vector3();
    await Promise.all(NAMES.map(async name => {
      try {
        const gltf = await loader.loadAsync(base + name + '.glb');
        const parts: Part[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o: Object3D) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
          const src = m.material as any;
          const map: Texture | null = src.map ?? null;
          if (map) map.colorSpace = SRGBColorSpace;
          const mname: string = src.name || '';
          const leaf = /leaf|leaves/i.test(mname);
          const cutout = leaf || src.alphaTest > 0 || /grass|flower|petal|plant|fern|clover|mushroom/i.test(mname + name);
          const rock = /rock|pebble/i.test(mname + name);
          let color = src.color ? src.color.clone() : new Color(0xffffff);
          if (leaf) {
            // ماسک برگ روشن است؛ رنگ استایلایز از این‌جا می‌آید
            color = /pine/i.test(mname) ? new Color('#4f9a52') : /twisted/i.test(mname) ? new Color('#8cc65a') : new Color('#78c24e');
            color.multiplyScalar(1.45);
            sphericalNormals(g);
          } else if (rock) { color = new Color('#a39a8f'); }
          else if (/bark/i.test(mname)) { color = /dead/i.test(mname) ? new Color(1.7, 1.55, 1.4) : new Color(1.15, 1.1, 1.05); }
          const mat = new MeshLambertMaterial({ map: rock ? null : map, color, alphaTest: cutout ? 0.4 : 0, side: cutout ? DoubleSide : FrontSide, flatShading: rock });
          parts.push({ geometry: g, material: mat, leaf: cutout });
        });
        box.setFromObject(gltf.scene); box.getSize(size);
        const key = Object.keys(TARGET_H).find(k => name.startsWith(k)) ?? name;
        this.models.set(name, { name, parts, minY: box.min.y, height: size.y || 1, targetH: TARGET_H[key] ?? 1 });
      } catch (e) { console.warn('model failed', name, e); }
    }));
    for (const [name, model] of this.models) {
      const list: InstancedMesh[] = [];
      for (const part of model.parts) {
        const im = new InstancedMesh(part.geometry, part.material, this.capacity);
        im.castShadow = true; im.receiveShadow = !part.leaf; im.count = 0; im.frustumCulled = false;
        this.group.add(im); list.push(im);
      }
      this.meshes.set(name, list);
    }
    this.ready = true;
  }

  // چیدن همه‌ی نمونه‌های ناحیه‌ی دید
  populate(minX: number, minZ: number, maxX: number, maxZ: number, terrain: (x: number, y: number) => Terrain, height: (x: number, z: number) => number, seed: number, skip: (x: number, y: number) => boolean) {
    if (!this.ready) return;
    const counts = new Map<string, number>();
    for (const list of this.meshes.values()) for (const im of list) im.count = 0;
    const budget = { n: 0 };
    for (let y = minZ; y <= maxZ; y++) for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= 1000 || y >= 1000) continue;
      const t = terrain(x, y);
      const spawns = SPAWNS[t];
      if (!spawns.length || skip(x, y)) continue;
      let salt = 0;
      for (const sp of spawns) {
        salt += 17;
        if (hash2(x, y, seed + salt) >= sp.chance) continue;
        const names = GROUPS[sp.group];
        const name = names[Math.floor(hash2(x, y, seed + salt + 1) * names.length)];
        const model = this.models.get(name); if (!model) continue;
        const list = this.meshes.get(name)!;
        const idx = counts.get(name) ?? 0;
        if (idx >= this.capacity) continue;
        counts.set(name, idx + 1);
        const ox = 0.12 + hash2(x, y, seed + salt + 2) * 0.76, oz = 0.12 + hash2(x, y, seed + salt + 3) * 0.76;
        const wx = x + ox, wz = y + oz;
        const rot = hash2(x, y, seed + salt + 4) * Math.PI * 2;
        const sc = (sp.scale[0] + hash2(x, y, seed + salt + 5) * (sp.scale[1] - sp.scale[0])) * (model.targetH / model.height);
        const h = height(wx, wz);
        this.tmpO.position.set(wx, h - model.minY * sc + (sp.group === 'rock' || sp.group === 'pebble' ? -0.04 * sc : 0), wz);
        this.tmpO.rotation.set(0, rot, 0);
        this.tmpO.scale.setScalar(sc);
        this.tmpO.updateMatrix();
        for (let i = 0; i < list.length; i++) {
          const im = list[i];
          im.setMatrixAt(idx, this.tmpO.matrix);
          const part = model.parts[i];
          const tint = part.leaf ? sp.leafTint : sp.tint;
          im.setColorAt(idx, tint ? this.tmpC.copy(tint) : this.tmpC.setRGB(1, 1, 1));
          im.count = idx + 1;
        }
        budget.n++;
      }
    }
    for (const list of this.meshes.values()) for (const im of list) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
}
