// نشانه‌های تعاملی: کمپ، کاروان، مقبره، گنج، خانه‌های خودی، انتخاب، مسیر — روشن‌تر و پرکنتراست‌تر از زمین.
import {
  Group, Mesh, ConeGeometry, CylinderGeometry, BoxGeometry, MeshLambertMaterial, MeshBasicMaterial, Sprite, SpriteMaterial, CanvasTexture,
  BufferGeometry, Float32BufferAttribute, DoubleSide, Color, OctahedronGeometry, PlaneGeometry, SRGBColorSpace, TorusGeometry, Object3D, MeshPhongMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER_COLOR, CLAN_COLOR, TOMB_GLOW, TREASURE_GLOW, SELECT_COLOR } from './palette';

// پراپ‌های CC0 (Kenney Nature Kit، KayKit Dungeon) — با fallback به هندسه‌ی ساده اگر بارگذاری نشد
const PROPS = new Map<string, Object3D>();
const PROP_COLORS: Record<string, string> = { dirt: '#96836e', grass: '#6aa74c', stone: '#a09991', woodBark: '#75553f', woodInner: '#cfa981', colorRed: '#c9524e', colorTan: '#d6ac78', colorYellow: '#e6b64c', leafsGreen: '#5f9d49', _defaultMat: '#e8e2d8', snow: '#f2efe8' };
export async function loadProps(base = 'assets/models/props/') {
  const loader = new GLTFLoader();
  const names = ['tent_detailedOpen', 'tent_smallOpen', 'campfire_logs', 'statue_obelisk', 'statue_head', 'statue_block', 'chest_gold', 'torch_lit', 'torch_mounted', 'column', 'pillar_decorated', 'rubble_half',
    'wall', 'wall_doorway', 'wall_arched', 'wall_pillar', 'wall_half', 'floor_tile_large', 'floor_tile_small', 'stairs_wide', 'banner_shield_yellow', 'banner_shield_blue', 'banner_triple_yellow', 'banner_thin_red',
    'barrel_large', 'crates_stacked', 'box_stacked', 'coin_stack_large', 'coin_stack_medium', 'sword_shield_gold', 'trunk_large_A', 'keg', 'fence_simple'];
  await Promise.all(names.map(async n => {
    try {
      const g = await loader.loadAsync(base + n + '.glb');
      g.scene.traverse((o: any) => {
        if (!o.isMesh) return;
        const src = o.material; const name: string = src?.name ?? '';
        const map = src?.map ?? null; if (map) map.colorSpace = SRGBColorSpace;
        let color = PROP_COLORS[name] ? new Color(PROP_COLORS[name]) : (src?.color ? src.color.clone() : new Color(0xffffff));
        // سنگ‌کاری KayKit تیره است؛ برای پالت روشن CoC گرم و روشن‌ترش می‌کنیم
        if (map && /^(wall|floor|pillar|stairs|column|barrier|rubble)/.test(n)) color = new Color(1.75, 1.62, 1.42);
        else if (map) color = new Color(1.2, 1.15, 1.08);
        o.material = new MeshPhongMaterial({ map: PROP_COLORS[name] ? null : map, color, shininess: 16, specular: new Color('#2a2a2a') });
        o.castShadow = true; o.receiveShadow = true;
      });
      PROPS.set(n, g.scene);
    } catch (e) { console.warn('prop', n, e); }
  }));
}
function prop(name: string, scale: number): Object3D | null {
  const p = PROPS.get(name); if (!p) return null;
  const o = p.clone(); o.scale.setScalar(scale); return o;
}
function part(g: Group, name: string, scale: number, x: number, z: number, rotY = 0, y = 0): Object3D | null {
  const o = prop(name, scale); if (!o) return null;
  o.position.set(x, y, z); o.rotation.y = rotY; g.add(o); return o;
}
// قطعات KayKit روی شبکه‌ی ۴ واحدی‌اند؛ با این مقیاس هر دیوار ≈ ۰٫۹۶ کاشی می‌شود
const K = 0.24;
// حصار مربعی از دیوارهای سنگی با یک دروازه در جلو
function stoneEnclosure(g: Group, half: number, front: string, colorBanner: string | null) {
  const L = 4 * K; // طول هر دیوار
  const n = Math.max(1, Math.round((2 * half) / L));
  const start = -half + L / 2;
  for (let i = 0; i < n; i++) {
    const x = start + i * L;
    // پشت
    part(g, 'wall', K, x, -half, 0);
    // جلو (وسط: دروازه)
    part(g, i === Math.floor((n - 1) / 2) ? front : 'wall', K, x, half, Math.PI);
    // چپ و راست
    part(g, 'wall', K, -half, x, Math.PI / 2);
    part(g, 'wall', K, half, x, -Math.PI / 2);
  }
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) part(g, 'wall_pillar', K, x, z, 0);
  if (colorBanner) { part(g, colorBanner, K, -half * 0.45, -half + 0.05, 0); part(g, colorBanner, K, half * 0.45, -half + 0.05, 0); }
}
import { faDigits } from '../rules/format';

export function makeCamp(color: Color, clan = false): Group {
  const g = new Group();
  if (PROPS.has('wall') && PROPS.has('tent_detailedOpen')) {
    const half = 0.98;
    // کف سنگی
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) part(g, 'floor_tile_large', 0.25, x, z, 0, -0.02);
    stoneEnclosure(g, half, 'wall_doorway', clan ? 'banner_shield_blue' : 'banner_shield_yellow');
    // چادر فرمانده، آتش، انبار
    const tent = part(g, clan ? 'tent_smallOpen' : 'tent_detailedOpen', clan ? 1.3 : 1.25, -0.2, -0.15, Math.PI * 0.85)!;
    void tent;
    part(g, 'campfire_logs', 0.9, 0.5, 0.35, 0);
    part(g, 'crates_stacked', 0.22, 0.6, -0.5, 0.3);
    part(g, 'barrel_large', 0.2, -0.65, 0.45, 0);
    part(g, 'torch_mounted', 0.3, -0.5, half - 0.1, Math.PI, 0.55);
    part(g, 'torch_mounted', 0.3, 0.5, half - 0.1, Math.PI, 0.55);
    if (clan) part(g, 'tent_smallOpen', 1.1, 0.45, -0.2, Math.PI * 0.6);
    const flag = makeFlag(color); flag.position.set(0, 0, 0.55); flag.scale.setScalar(1.3); g.add(flag);
    const ring = new Mesh(new TorusGeometry(1.35, 0.04, 6, 40), new MeshBasicMaterial({ color })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    return g;
  }
  const tent0 = prop('tent_detailedOpen', 1.35);
  if (tent0) {
    tent0.rotation.y = Math.PI * 0.85; g.add(tent0);
    const fire = prop('campfire_logs', 1.0); if (fire) { fire.position.set(0.62, 0, 0.42); g.add(fire); }
    const flag = makeFlag(color); flag.position.set(-0.55, 0, 0.45); g.add(flag);
    const ring = new Mesh(new TorusGeometry(0.8, 0.035, 6, 32), new MeshBasicMaterial({ color })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    return g;
  }
  const tent = new Mesh(new ConeGeometry(0.5, 0.7, 5), new MeshLambertMaterial({ color, flatShading: true }));
  tent.position.y = 0.36; tent.castShadow = true; g.add(tent);
  const base = new Mesh(new CylinderGeometry(0.5, 0.55, 0.08, 8), new MeshLambertMaterial({ color: '#5a4636' }));
  base.position.y = 0.04; g.add(base);
  const flag = makeFlag(color); flag.position.set(0.35, 0.05, 0.3); g.add(flag);
  return g;
}

export function makeFlag(color: Color): Group {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.025, 0.025, 0.9, 5), new MeshLambertMaterial({ color: '#3b2a1e' }));
  pole.position.y = 0.45; pole.castShadow = true; g.add(pole);
  const cloth = new Mesh(new PlaneGeometry(0.34, 0.2), new MeshBasicMaterial({ color, side: DoubleSide }));
  cloth.position.set(0.17, 0.78, 0); g.add(cloth);
  return g;
}

export function makeCaravan(color: Color): Group {
  const g = new Group();
  const flag = makeFlag(color); g.add(flag);
  const ring = new Mesh(new TorusGeometry(0.5, 0.03, 6, 24), new MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.userData.ring = ring;
  return g;
}

export function makeTomb(): Group {
  const g = new Group();
  if (PROPS.has('wall_arched') && PROPS.has('statue_obelisk')) {
    const half = 0.5;
    part(g, 'floor_tile_large', 0.25, 0, 0, 0, -0.02);
    part(g, 'wall', K, 0, -half, 0);
    part(g, 'wall_arched', K, 0, half, Math.PI);
    part(g, 'wall', K, -half, 0, Math.PI / 2);
    part(g, 'wall', K, half, 0, -Math.PI / 2);
    for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) part(g, 'wall_pillar', K, x, z, 0);
    part(g, 'statue_obelisk', 1.6, 0, -0.05, 0);
    part(g, 'statue_head', 0.9, 0.75, 0.75, -0.7);
    part(g, 'torch_lit', 0.28, -0.42, half + 0.2, 0);
    part(g, 'torch_lit', 0.28, 0.42, half + 0.2, 0);
    part(g, 'banner_thin_red', K, 0, -half + 0.06, 0);
    const cap = new Mesh(new OctahedronGeometry(0.14, 0), new MeshBasicMaterial({ color: TOMB_GLOW }));
    cap.position.y = 1.55; g.add(cap); g.userData.cap = cap;
    return g;
  }
  const ob = prop('statue_obelisk', 1.7);
  if (ob) {
    g.add(ob);
    const head = prop('statue_head', 1.0); if (head) { head.position.set(0.5, 0, 0.36); head.rotation.y = -0.6; g.add(head); }
    const blk = prop('statue_block', 0.9); if (blk) { blk.position.set(-0.48, 0, 0.36); blk.rotation.y = 0.4; g.add(blk); }
    const rub = prop('rubble_half', 0.45); if (rub) { rub.position.set(0.1, 0, -0.5); g.add(rub); }
    const cap = new Mesh(new OctahedronGeometry(0.13, 0), new MeshBasicMaterial({ color: TOMB_GLOW }));
    cap.position.y = 1.75; g.add(cap); g.userData.cap = cap;
    return g;
  }
  const stone = new Mesh(new BoxGeometry(0.34, 0.9, 0.34), new MeshLambertMaterial({ color: '#3d3546', flatShading: true }));
  stone.position.y = 0.45; stone.castShadow = true; g.add(stone);
  const cap = new Mesh(new OctahedronGeometry(0.16, 0), new MeshBasicMaterial({ color: TOMB_GLOW }));
  cap.position.y = 1.05; g.add(cap);
  g.userData.cap = cap;
  const base = new Mesh(new CylinderGeometry(0.5, 0.55, 0.1, 6), new MeshLambertMaterial({ color: '#57506a', flatShading: true }));
  base.position.y = 0.05; g.add(base);
  return g;
}

export function makeTreasure(): Group {
  const g = new Group();
  if (PROPS.has('stairs_wide') && PROPS.has('chest_gold')) {
    const S = 0.25;
    // سکوی سنگی ۲×۲ با پله در جلو
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) part(g, 'floor_tile_large', S, x, z, 0, 0.42);
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) part(g, 'floor_tile_large', S, x, z, 0, 0.02);
    part(g, 'stairs_wide', 0.22, 0, 1.0, Math.PI, -0.02);
    for (const [x, z] of [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]]) part(g, 'pillar_decorated', 0.28, x, z, 0, 0.42);
    part(g, 'banner_triple_yellow', 0.3, 0, -1.05, 0, 0.42);
    part(g, 'chest_gold', 0.62, 0, 0.05, Math.PI, 0.44);
    part(g, 'coin_stack_large', 0.28, -0.62, 0.35, 0.4, 0.44);
    part(g, 'coin_stack_medium', 0.28, 0.62, 0.3, -0.5, 0.44);
    part(g, 'coin_stack_medium', 0.28, 0.5, -0.55, 0.2, 0.44);
    part(g, 'sword_shield_gold', 0.3, -0.55, -0.6, 0.6, 0.65);
    part(g, 'torch_lit', 0.34, -1.25, 1.2, 0);
    part(g, 'torch_lit', 0.34, 1.25, 1.2, 0);
    const gem = new Mesh(new OctahedronGeometry(0.18, 0), new MeshBasicMaterial({ color: TREASURE_GLOW }));
    gem.position.y = 1.35; g.add(gem); g.userData.gem = gem;
    return g;
  }
  const ch = prop('chest_gold', 0.7);
  if (ch) {
    ch.rotation.y = Math.PI; g.add(ch);
    for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3]]) { const t = prop('torch_lit', 0.5); if (t) { t.position.set(x, 0, z); g.add(t); } }
    const c1 = prop('column', 0.45); if (c1) { c1.position.set(-0.6, 0, 0.45); g.add(c1); }
    const c2 = prop('column', 0.45); if (c2) { c2.position.set(0.6, 0, 0.45); g.add(c2); }
    const gem = new Mesh(new OctahedronGeometry(0.16, 0), new MeshBasicMaterial({ color: TREASURE_GLOW }));
    gem.position.y = 0.95; g.add(gem); g.userData.gem = gem;
    const pedestal = new Mesh(new CylinderGeometry(0.95, 1.05, 0.14, 8), new MeshLambertMaterial({ color: '#c9a95c', flatShading: true }));
    pedestal.position.y = 0.06; g.add(pedestal);
    return g;
  }
  const chest = new Mesh(new BoxGeometry(0.6, 0.4, 0.42), new MeshLambertMaterial({ color: '#7a4b23', flatShading: true }));
  chest.position.y = 0.2; chest.castShadow = true; g.add(chest);
  const lid = new Mesh(new BoxGeometry(0.62, 0.14, 0.44), new MeshLambertMaterial({ color: '#9a6330', flatShading: true }));
  lid.position.y = 0.45; g.add(lid);
  const gem = new Mesh(new OctahedronGeometry(0.22, 0), new MeshBasicMaterial({ color: TREASURE_GLOW }));
  gem.position.y = 0.75; g.add(gem);
  g.userData.gem = gem;
  const pedestal = new Mesh(new CylinderGeometry(0.7, 0.8, 0.14, 8), new MeshLambertMaterial({ color: '#c9a95c', flatShading: true }));
  pedestal.position.y = 0.07; g.add(pedestal);
  return g;
}

export function makeSelection(): Mesh {
  const m = new Mesh(new TorusGeometry(0.62, 0.045, 6, 32), new MeshBasicMaterial({ color: SELECT_COLOR }));
  m.rotation.x = Math.PI / 2;
  return m;
}

const labelCache = new Map<string, CanvasTexture>();
export function makeLabel(text: string, bg = '#1c1710', fg = '#ffe9a8'): Sprite {
  let tex = labelCache.get(text + bg);
  if (!tex) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 96;
    const x = c.getContext('2d')!;
    x.fillStyle = bg; x.beginPath(); x.arc(48, 48, 40, 0, Math.PI * 2); x.fill();
    x.strokeStyle = fg; x.lineWidth = 6; x.stroke();
    x.fillStyle = fg; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(faDigits(text), 48, 52);
    tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
    labelCache.set(text + bg, tex);
  }
  const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.setScalar(0.55); s.renderOrder = 10;
  return s;
}

// لایه‌ی خانه‌های خودی: چهارضلعی‌های نیمه‌شفاف که روی زمین می‌نشینند
export function buildOwnedOverlay(tiles: { x: number; y: number; clan: boolean }[], height: (x: number, z: number) => number): Mesh {
  const pos: number[] = [], col: number[] = [];
  const n = 3, step = 1 / n;
  for (const t of tiles) {
    const c = t.clan ? CLAN_COLOR : PLAYER_COLOR;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x0 = t.x + i * step, z0 = t.y + j * step, x1 = x0 + step, z1 = z0 + step;
      const q = [[x0, z0], [x0, z1], [x1, z0], [x1, z0], [x0, z1], [x1, z1]];
      for (const [x, z] of q) { pos.push(x, height(x, z) + 0.06, z); col.push(c.r, c.g, c.b); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  const m = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false }));
  m.renderOrder = 2;
  return m;
}

export function disposeObject(o: Object3D) {
  o.traverse((c: any) => { if (c.geometry) c.geometry.dispose(); if (c.material && !c.material.map) c.material.dispose?.(); });
}
