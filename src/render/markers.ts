// نشانه‌های تعاملی: کمپ، کاروان، مقبره، گنج، خانه‌های خودی، انتخاب، مسیر — روشن‌تر و پرکنتراست‌تر از زمین.
import {
  Group, Mesh, ConeGeometry, CylinderGeometry, BoxGeometry, MeshLambertMaterial, MeshBasicMaterial, Sprite, SpriteMaterial, CanvasTexture,
  BufferGeometry, Float32BufferAttribute, DoubleSide, Color, OctahedronGeometry, PlaneGeometry, SRGBColorSpace, TorusGeometry, Object3D,
} from 'three';
import { PLAYER_COLOR, CLAN_COLOR, TOMB_GLOW, TREASURE_GLOW, SELECT_COLOR } from './palette';
import { faDigits } from '../rules/format';

export function makeCamp(color: Color): Group {
  const g = new Group();
  const tent = new Mesh(new ConeGeometry(0.42, 0.55, 5), new MeshLambertMaterial({ color, flatShading: true }));
  tent.position.y = 0.28; tent.castShadow = true; g.add(tent);
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
  const body = new MeshLambertMaterial({ color: '#f2e6c8', flatShading: true });
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(new ConeGeometry(0.11, 0.26, 5), body);
    m.position.set(-0.22 + i * 0.22, 0.13, 0.22 - (i % 2) * 0.16); m.castShadow = true; g.add(m);
  }
  const ring = new Mesh(new TorusGeometry(0.5, 0.03, 6, 24), new MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.userData.ring = ring;
  return g;
}

export function makeTomb(): Group {
  const g = new Group();
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
