// صحنه‌آرایی low-poly با مدل‌های CC0: درخت‌ها و سنگ‌های Kenney Nature Kit (flat-shaded، رنگ تخت) + بوته/گیاه/سنگریزه‌ی Quaternius.
// پراکندگی با آفست زیرکاشی، چرخش و مقیاس تصادفی — هیچ‌چیز با شبکه هم‌راستا نیست.
import {
  BufferGeometry, Color, InstancedMesh, Material, MeshPhongMaterial, Object3D, Group, Box3, Vector3, Mesh, DoubleSide, FrontSide, Texture, SRGBColorSpace,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { hash2, valueNoise } from '../rules/rng';
import type { SpriteLib } from './sprites';
import { Quaternion } from 'three';
import type { Terrain } from '../rules/constants';

interface Part { geometry: BufferGeometry; material: Material; tintable: boolean }
interface Model { name: string; parts: Part[]; minY: number; height: number; targetH: number }

// پالت طبیعی برای رنگ‌های نام‌دار Kenney (پیش‌فرضشان فیروزه‌ای/نارنجی است)
const KENNEY_COLORS: Record<string, string> = {
  leafsGreen: '#5cb83a', leafsDark: '#3f9a4a', woodBark: '#8a5d3c', woodBarkDark: '#6d4732', woodInner: '#e0bb8f',
  dirt: '#b9a184', grass: '#6dbb45', stone: '#b9b2a8', colorRed: '#e0524c', colorTan: '#e6bd85', colorYellow: '#f4c04a', colorPurple: '#9c6fd8', _defaultMat: '#f0ebe2',
};

interface Lib { base: string; names: string[]; targetH: Record<string, number> }
const KENNEY: Lib = {
  base: 'assets/models/kenney/',
  names: [
    'tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_tall', 'tree_thin', 'tree_plateau', 'tree_blocks', 'tree_simple',
    'tree_pineDefaultA', 'tree_pineDefaultB', 'tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineTallD', 'tree_pineRoundA', 'tree_pineRoundB', 'tree_pineRoundC',
    'tree_pineSmallA', 'tree_pineSmallB', 'tree_pineGroundA', 'tree_pineGroundB', 'tree_default_dark', 'tree_thin_dark', 'tree_tall_dark', 'tree_simple_dark', 'tree_plateau_dark',
    'rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallD', 'rock_smallA', 'rock_smallB', 'rock_smallC',
    'stone_largeA', 'stone_largeB', 'stone_tallA', 'stone_tallB', 'stone_tallC', 'stone_smallA', 'stone_smallB', 'stone_smallC',
    'stump_round', 'stump_old', 'log', 'log_large', 'plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'grass', 'grass_large', 'grass_leafs',
    'flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redB', 'flower_yellowB', 'mushroom_red', 'mushroom_tan', 'mushroom_redGroup', 'lily_large', 'lily_small',
  ],
  targetH: { tree_pineTall: 1.8, tree_pine: 1.5, tree_pineSmall: 1.0, tree_pineGround: 0.8, tree_tall: 1.6, tree_: 1.35, rock_tall: 1.2, rock_large: 0.42, rock_small: 0.22, stone_tall: 1.3, stone_large: 0.42, stone_small: 0.22, stump: 0.28, log: 0.22, plant: 0.32, grass: 0.3, flower: 0.3, mushroom: 0.22, lily: 0.1 },
};
const QUATERNIUS: Lib = {
  base: 'assets/models/',
  names: ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Grass_Common_Tall', 'Grass_Wispy_Tall', 'Mushroom_Common', 'Flower_3_Group', 'Flower_4_Group', 'Plant_1_Big', 'Clover_1'],
  targetH: { Rock_Medium: 0.5, Pebble_Round: 0.14, Bush_Common: 0.42, Fern_1: 0.28, Grass_Common_Tall: 0.28, Grass_Wispy_Tall: 0.3, Mushroom_Common: 0.16, Flower_3_Group: 0.2, Flower_4_Group: 0.2, Plant_1_Big: 0.32, Clover_1: 0.12 },
};

const GROUPS: Record<string, string[]> = {
  tree: ['tree_oak', 'tree_detailed', 'tree_detailed', 'tree_tall', 'tree_thin', 'tree_simple', 'tree_default'],
  pine: ['tree_pineDefaultA', 'tree_pineDefaultB', 'tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineTallD', 'tree_pineRoundA', 'tree_pineRoundB', 'tree_pineRoundC'],
  pineSmall: ['tree_pineSmallA', 'tree_pineSmallB', 'tree_pineGroundA', 'tree_pineGroundB'],
  darkTree: ['tree_default_dark', 'tree_thin_dark', 'tree_tall_dark', 'tree_simple_dark', 'tree_plateau_dark'],
  dead: ['stump_old', 'stump_round', 'log', 'log_large', 'tree_thin_dark', 'tree_simple_dark'],
  rockBig: ['rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallD', 'stone_tallA', 'stone_tallB', 'stone_tallC'],
  rock: ['rock_largeA', 'rock_largeB', 'rock_largeC', 'stone_largeA', 'stone_largeB', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'],
  pebble: ['rock_smallA', 'rock_smallB', 'rock_smallC', 'stone_smallA', 'stone_smallB', 'stone_smallC', 'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3'],
  bush: ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'Bush_Common', 'Bush_Common_Flowers'],
  grass: ['grass', 'grass_large', 'grass_leafs', 'Grass_Common_Tall', 'Grass_Wispy_Tall', 'Clover_1'],
  flower: ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redB', 'flower_yellowB', 'Flower_3_Group', 'Flower_4_Group'],
  marshPlant: ['Fern_1', 'Plant_1_Big', 'mushroom_red', 'mushroom_tan', 'mushroom_redGroup', 'Mushroom_Common'],
  lily: ['lily_large', 'lily_small'],
};

interface Spawn { group: string; chance: number; scale: [number, number]; tint?: Color; leafTint?: Color }
const SPAWNS: Record<Terrain, Spawn[]> = {
  safe:     [{ group: 'tree', chance: 0.05, scale: [0.85, 1.2] }, { group: 'grass', chance: 0.05, scale: [0.8, 1.2] }, { group: 'flower', chance: 0.04, scale: [0.9, 1.2] }, { group: 'pebble', chance: 0.03, scale: [0.8, 1.4] }, { group: 'bush', chance: 0.02, scale: [0.8, 1.1] }],
  plain:    [{ group: 'tree', chance: 0.04, scale: [0.9, 1.25] }, { group: 'bush', chance: 0.03, scale: [0.8, 1.2] }, { group: 'grass', chance: 0.06, scale: [0.8, 1.2] }, { group: 'flower', chance: 0.05, scale: [0.9, 1.2] }, { group: 'pebble', chance: 0.02, scale: [0.8, 1.4] }],
  mountain: [{ group: 'pine', chance: 0.16, scale: [0.8, 1.3] }, { group: 'pineSmall', chance: 0.08, scale: [0.8, 1.3] }, { group: 'rockBig', chance: 0.07, scale: [0.7, 1.4] }, { group: 'rock', chance: 0.10, scale: [0.7, 1.4] }, { group: 'pebble', chance: 0.08, scale: [0.9, 1.6] }],
  marsh:    [{ group: 'darkTree', chance: 0.16, scale: [0.8, 1.2], leafTint: new Color('#8ea86a') }, { group: 'dead', chance: 0.10, scale: [0.9, 1.3] }, { group: 'marshPlant', chance: 0.22, scale: [0.9, 1.4] }, { group: 'lily', chance: 0.12, scale: [0.8, 1.2] }],
  danger:   [{ group: 'dead', chance: 0.12, scale: [0.9, 1.4], tint: new Color('#8c6a52'), leafTint: new Color('#9c6f4a') }, { group: 'darkTree', chance: 0.06, scale: [0.8, 1.2], leafTint: new Color('#a8764f') }, { group: 'rock', chance: 0.10, scale: [0.7, 1.4], tint: new Color('#9a7568') }, { group: 'rockBig', chance: 0.03, scale: [0.7, 1.2], tint: new Color('#9a7568') }, { group: 'marshPlant', chance: 0.02, scale: [0.9, 1.3] }],
  hell:     [{ group: 'rockBig', chance: 0.10, scale: [0.8, 1.6], tint: new Color('#6e5550') }, { group: 'rock', chance: 0.18, scale: [0.8, 1.6], tint: new Color('#6e5550') }, { group: 'dead', chance: 0.06, scale: [0.8, 1.2], tint: new Color('#5a4038') }],
  tomb:     [],
  treasure: [],
  valley:   [],
};

// هر گروه صحنه‌آرایی → اسپرایت‌های شیت مرجع (اگر موجود باشند، به‌جای مدل سه‌بعدی)
const GROUP_SPRITES: Record<string, string[]> = {
  tree: ['scenery.tree', 'scenery.tree', 'scenery.tree2', 'scenery.bush'], pine: ['scenery.tree2', 'scenery.tree2', 'scenery.big_rock'], pineSmall: ['scenery.bush', 'scenery.rock'],
  darkTree: ['scenery.dead_tree', 'scenery.dead_tree', 'scenery.tree'], dead: ['scenery.dead_tree', 'scenery.bones', 'scenery.ruin'],
  rockBig: ['scenery.big_rock', 'scenery.ruin', 'scenery.statue'], rock: ['scenery.rock', 'scenery.rock', 'scenery.big_rock'], pebble: ['scenery.rock'],
  bush: ['scenery.bush', 'scenery.flower'], grass: ['scenery.grass', 'scenery.grass', 'scenery.flower'], flower: ['scenery.flower'],
  marshPlant: ['scenery.mushroom', 'scenery.reeds', 'scenery.reeds'], lily: ['scenery.reeds'],
};
const TERRAIN_EXTRA: Partial<Record<Terrain, { key: string; chance: number }[]>> = {
  danger: [{ key: 'scenery.fire', chance: 0.012 }, { key: 'scenery.bones', chance: 0.01 }, { key: 'scenery.crystal', chance: 0.005 }],
  hell: [{ key: 'scenery.fire', chance: 0.03 }, { key: 'scenery.crystal', chance: 0.015 }],
  mountain: [{ key: 'scenery.crystal', chance: 0.012 }, { key: 'scenery.statue', chance: 0.005 }],
  safe: [{ key: 'scenery.sign', chance: 0.004 }],
  marsh: [{ key: 'scenery.bones', chance: 0.02 }],
  plain: [{ key: 'scenery.pond', chance: 0.005 }, { key: 'scenery.ruin', chance: 0.003 }],
};

export class Scenery {
  group = new Group();
  sprites: SpriteLib | null = null;
  private spriteMeshes = new Map<string, InstancedMesh>();
  private spriteCounts = new Map<string, number>();
  private models = new Map<string, Model>();
  private meshes = new Map<string, InstancedMesh[]>();
  ready = false;
  private capacity = 400;
  private tmpO = new Object3D();
  private tmpC = new Color();

  constructor(mobile: boolean) { if (mobile) this.capacity = 260; }

  private async loadLib(loader: GLTFLoader, lib: Lib) {
    const box = new Box3(), size = new Vector3();
    await Promise.all(lib.names.map(async name => {
      try {
        const gltf = await loader.loadAsync(lib.base + name + '.glb');
        const parts: Part[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o: Object3D) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          let g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
          // سایه‌زنی نرم و گرد (سبک CoC): رأس‌های مشترک ادغام و نرمال‌ها نرم می‌شوند
          if (lib === KENNEY) {
            g.deleteAttribute('normal'); if (g.getAttribute('color')) g.deleteAttribute('color');
            try { g = mergeVertices(g, 1e-4); } catch { /* هندسه‌ی کوانتیزه: ادغام ممکن نیست */ }
            g.computeVertexNormals();
          } else if (!g.getAttribute('normal')) g.computeVertexNormals();
          const src = m.material as any;
          const mname: string = src.name || '';
          const map: Texture | null = src.map ?? null;
          if (map) map.colorSpace = SRGBColorSpace;
          let color: Color;
          let cutout = false, flat = true;
          if (KENNEY_COLORS[mname]) { color = new Color(KENNEY_COLORS[mname]); }
          else if (/leaf|leaves/i.test(mname)) { color = new Color('#78c24e').multiplyScalar(1.45); cutout = true; flat = false; }
          else if (/rock|pebble/i.test(mname + name)) { color = new Color('#a39a8f'); }
          else if (src.alphaTest > 0 || /grass|flower|petal|plant|fern|clover|mushroom/i.test(mname + name)) { color = new Color(0xffffff); cutout = true; flat = false; }
          else { color = src.color ? src.color.clone() : new Color(0xffffff); }
          const useMap = !!map && !KENNEY_COLORS[mname] && !/rock|pebble/i.test(name);
          const mat = new MeshPhongMaterial({ map: useMap ? map : null, color, alphaTest: cutout ? 0.4 : 0, side: cutout ? DoubleSide : FrontSide, shininess: 18, specular: new Color('#2a2a2a') });
          void flat;
          mat.name = mname;
          parts.push({ geometry: g, material: mat, tintable: /leaf|grass|stone|rock|dirt|bark|wood/i.test(mname + name) });
        });
        box.setFromObject(gltf.scene); box.getSize(size);
        const key = Object.keys(lib.targetH).sort((a, b) => b.length - a.length).find(k => name.startsWith(k)) ?? name;
        this.models.set(name, { name, parts, minY: box.min.y, height: size.y || 1, targetH: lib.targetH[key] ?? 1 });
      } catch (e) { console.warn('model failed', name, e); }
    }));
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all([this.loadLib(loader, KENNEY), this.loadLib(loader, QUATERNIUS)]);
    for (const [name, model] of this.models) {
      const list: InstancedMesh[] = [];
      for (const part of model.parts) {
        const im = new InstancedMesh(part.geometry, part.material, this.capacity);
        im.castShadow = true; im.receiveShadow = true; im.count = 0; im.frustumCulled = false;
        this.group.add(im); list.push(im);
      }
      this.meshes.set(name, list);
    }
    this.ready = true;
  }

  private spriteMesh(key: string, camQuat: Quaternion): InstancedMesh | null {
    if (!this.sprites?.has(key)) return null;
    let im = this.spriteMeshes.get(key);
    if (!im) { const r = this.sprites.makeInstanced(key, this.capacity * 2, camQuat); if (!r) return null; im = r.mesh; this.spriteMeshes.set(key, im); this.group.add(im); }
    return im;
  }
  private placeSprite(key: string, wx: number, wz: number, h: number, sc: number, camQuat: Quaternion): boolean {
    const im = this.spriteMesh(key, camQuat); if (!im) return false;
    const n = this.spriteCounts.get(key) ?? 0; if (n >= this.capacity * 2) return true;
    this.tmpO.position.set(wx, h, wz); this.tmpO.quaternion.copy(camQuat); this.tmpO.scale.setScalar(sc); this.tmpO.updateMatrix();
    im.setMatrixAt(n, this.tmpO.matrix); im.count = n + 1; this.spriteCounts.set(key, n + 1);
    return true;
  }

  populate(minX: number, minZ: number, maxX: number, maxZ: number, terrain: (x: number, y: number) => Terrain, height: (x: number, z: number) => number, water: (x: number, z: number) => number, seed: number, skip: (x: number, y: number) => boolean, camQuat?: Quaternion) {
    if (!this.ready) return;
    const counts = new Map<string, number>();
    for (const list of this.meshes.values()) for (const im of list) im.count = 0;
    for (const im of this.spriteMeshes.values()) im.count = 0;
    this.spriteCounts.clear();
    const useSprites = !!(this.sprites?.ready && camQuat);
    for (let y = minZ; y <= maxZ; y++) for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= 1000 || y >= 1000) continue;
      const t = terrain(x, y);
      const spawns = SPAWNS[t];
      if (skip(x, y)) continue;
      if (useSprites && TERRAIN_EXTRA[t]) {
        let es = 300;
        for (const e of TERRAIN_EXTRA[t]!) { es += 7; if (hash2(x, y, seed + es) < e.chance) { const wx = x + 0.2 + hash2(x, y, seed + es + 1) * 0.6, wz = y + 0.2 + hash2(x, y, seed + es + 2) * 0.6; this.placeSprite(e.key, wx, wz, height(wx, wz), 0.8 + hash2(x, y, seed + es + 3) * 0.4, camQuat!); } }
      }
      if (!spawns.length) continue;
      let salt = 0;
      for (const sp of spawns) {
        salt += 17;
        // جنگل‌های لکه‌ای: تراکم درخت با نویز کم‌بسامد کم و زیاد می‌شود (به‌جای پاشیدن یکنواخت)
        const clustered = /tree|pine|dead/i.test(sp.group);
        const density = clustered ? Math.max(0, Math.min(2.2, (valueNoise(x / 9, y / 9, seed + 77) - 0.3) * 3.2)) : 1;
        if (hash2(x, y, seed + salt) >= sp.chance * density * (useSprites ? 0.22 : 1)) continue;
        const ox0 = 0.12 + hash2(x, y, seed + salt + 2) * 0.76, oz0 = 0.12 + hash2(x, y, seed + salt + 3) * 0.76;
        if (useSprites && GROUP_SPRITES[sp.group]) {
          const keys = GROUP_SPRITES[sp.group].filter(k => this.sprites!.has(k));
          if (keys.length) {
            const key = keys[Math.floor(hash2(x, y, seed + salt + 1) * keys.length)];
            const wx0 = x + ox0, wz0 = y + oz0; const h0 = height(wx0, wz0);
            if (sp.group === 'lily' && h0 > water(wx0, wz0) - 0.05) continue;
            const sc0 = 0.8 + hash2(x, y, seed + salt + 5) * 0.4;
            this.placeSprite(key, wx0, wz0, sp.group === 'lily' ? water(wx0, wz0) : h0, sc0, camQuat!);
            continue;
          }
        }
        const names = GROUPS[sp.group];
        const name = names[Math.floor(hash2(x, y, seed + salt + 1) * names.length)];
        const model = this.models.get(name); if (!model) continue;
        const list = this.meshes.get(name)!;
        const idx = counts.get(name) ?? 0;
        if (idx >= this.capacity) continue;
        const ox = 0.12 + hash2(x, y, seed + salt + 2) * 0.76, oz = 0.12 + hash2(x, y, seed + salt + 3) * 0.76;
        const wx = x + ox, wz = y + oz;
        const h = height(wx, wz);
        const wl = water(wx, wz);
        const isLily = sp.group === 'lily';
        if (isLily && h > wl - 0.05) continue; // نیلوفر فقط روی آب
        if (!isLily && t === 'marsh' && h < wl) { if (sp.group !== 'dead' && sp.group !== 'darkTree') continue; } // زیر آب: فقط درخت‌های مرده/تیره بیرون می‌زنند
        counts.set(name, idx + 1);
        const rot = hash2(x, y, seed + salt + 4) * Math.PI * 2;
        const sc = (sp.scale[0] + hash2(x, y, seed + salt + 5) * (sp.scale[1] - sp.scale[0])) * (model.targetH / model.height);
        const sink = sp.group.startsWith('rock') || sp.group === 'pebble' ? -0.05 * sc : 0;
        this.tmpO.position.set(wx, (isLily ? wl : h) - model.minY * sc + sink, wz);
        this.tmpO.rotation.set(0, rot, 0);
        this.tmpO.scale.setScalar(sc);
        this.tmpO.updateMatrix();
        for (let i = 0; i < list.length; i++) {
          const im = list[i];
          im.setMatrixAt(idx, this.tmpO.matrix);
          const part = model.parts[i];
          const tint = part.tintable ? (sp.leafTint && /leaf/i.test((part.material as any).name || '') ? sp.leafTint : sp.tint) : undefined;
          // تنوع ملایم روشنایی هر نمونه
          const v = 0.9 + hash2(x, y, seed + salt + 6) * 0.2;
          const hue = (hash2(x, y, seed + salt + 7) - 0.5) * 0.12;
          this.tmpC.setRGB(v * (1 + hue), v, v * (1 - hue)); if (tint) this.tmpC.multiply(tint);
          im.setColorAt(idx, this.tmpC);
          im.count = idx + 1;
        }
      }
    }
    for (const list of this.meshes.values()) for (const im of list) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    for (const im of this.spriteMeshes.values()) im.instanceMatrix.needsUpdate = true;
  }
}
