// دنیای سه‌بعدی: دیورامای کج‌شده‌ی رومیزی. دوربین ثابت (~۵۵ درجه، fov 30، بدون چرخش yaw)، خورشید گرم ~۳۵ درجه با سایه، نور محیطی سرد.
import {
  Scene, PerspectiveCamera, WebGLRenderer, DirectionalLight, HemisphereLight, Color, Fog, Vector3, Vector2, Raycaster, Mesh, Group,
  PCFSoftShadowMap, NeutralToneMapping, SRGBColorSpace, Object3D, Sprite,
} from 'three';
import type { Terrain } from '../rules/constants';
import { makeHeight, type TerrainFn } from './height';
import { TerrainChunks } from './terrainMesh';
import { Scenery } from './scenery';
import { makeCamp, makeCaravan, makeTomb, makeTreasure, makeSelection, makeLabel, buildOwnedOverlay, makeFlag, disposeObject } from './markers';
import { makeComposer } from './post';
import { PLAYER_COLOR, CLAN_COLOR } from './palette';

export interface P { x: number; y: number }
export interface Markers {
  camp: P | null;
  clanCamp: P | null;
  caravan: { from: P; to: P; progress: number; clan: boolean } | null;
  caravanIdle: { at: P; clan: boolean } | null;
  tombs: P[];
  owned: { x: number; y: number; clan: boolean }[];
  treasure: P;
  path: P[] | null;
  participation: P | null;
}

const PITCH = 55 * Math.PI / 180;
const FOV = 30;
const SUN_ELEV = 35 * Math.PI / 180;
const SUN_AZ = 150 * Math.PI / 180;

export class World {
  scene = new Scene();
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  private composer!: ReturnType<typeof makeComposer>;
  private sun: DirectionalLight;
  private chunks!: TerrainChunks;
  private H!: ReturnType<typeof makeHeight>;
  private scenery: Scenery;
  private terrainGroup = new Group();
  private markerGroup = new Group();
  private ownedMesh: Mesh | null = null;
  private pathGroup = new Group();
  private selection = makeSelection();
  private campObj: Group | null = null;
  private clanCampObj: Group | null = null;
  private caravanObj: Group | null = null;
  private tombObjs: Group[] = [];
  private treasureObj: Group | null = null;
  private participationObj: Group | null = null;
  private seed = 1;
  target = new Vector3(500, 0, 500);
  private zoom = 1;
  private baseDist = 30;
  private lastLoad = new Vector2(-9999, -9999);
  private lastLoadZoom = -1;
  private raf = 0;
  private raycaster = new Raycaster();
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean; tx: number; tz: number } | null = null;
  private pinch: { d: number; zoom: number } | null = null;
  private markers: Markers | null = null;
  private t0 = performance.now();
  private terrainFn: TerrainFn = () => 'safe';
  private skipFn: (x: number, y: number) => boolean = () => false;
  private followFrames = 0;
  private followTarget: Vector3 | null = null;
  onTap: ((tile: P) => void) | null = null;
  mobile: boolean;
  frameMs = 16;

  constructor(private canvas: HTMLCanvasElement, mobile: boolean) {
    this.mobile = mobile;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    this.renderer = new WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.camera = new PerspectiveCamera(FOV, 1, 1, 400);
    const bg = new Color('#bfd6ea');
    this.scene.background = bg;
    this.scene.fog = new Fog(bg, 60, 160);

    // خورشید گرم با زاویه‌ی کم (~۳۵ درجه) — سایه‌های بلند و خوانا
    this.sun = new DirectionalLight(new Color('#ffe2bd'), 3.1);
    this.sun.castShadow = true;
    const sm = mobile ? 2048 : 4096;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 220;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    // نور محیطی سرد و نرم: سایه‌ها آبی‌فام، نه سیاه
    this.scene.add(new HemisphereLight(new Color('#c9dcff'), new Color('#7d8c62'), 1.15));

    this.scene.add(this.terrainGroup);
    this.scene.add(this.markerGroup);
    this.scene.add(this.pathGroup);
    this.selection.visible = false; this.markerGroup.add(this.selection);
    this.scenery = new Scenery(mobile);
    this.scene.add(this.scenery.group);

    this.composer = makeComposer(this.renderer, this.scene, this.camera, 2, 2, mobile);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
  }

  async init() { await this.scenery.load(); this.lastLoad.set(-9999, -9999); }

  setTerrain(fn: TerrainFn, seed: number, skip: (x: number, y: number) => boolean) {
    this.terrainFn = fn; this.seed = seed; this.skipFn = skip;
    this.H = makeHeight(fn, seed);
    if (this.chunks) this.chunks.clear(m => this.terrainGroup.remove(m));
    this.chunks = new TerrainChunks(this.H, seed);
    this.lastLoad.set(-9999, -9999);
  }

  heightAt(x: number, z: number) { return this.H ? this.H.height(x, z) : 0; }

  resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.composer.setSize(w, h);
    this.composer.bloom.resolution.set(Math.floor(w / 2), Math.floor(h / 2));
    // پهنای دید پایه ≈ ۱۷ کاشی (روی گوشی عمودی ارتفاع دید بیشتر است)
    const width = this.camera.aspect < 0.8 ? 9 : 14;
    this.baseDist = width / (2 * Math.tan(FOV / 2 * Math.PI / 180) * this.camera.aspect);
    this.baseDist = Math.max(16, Math.min(56, this.baseDist));
    this.lastLoad.set(-9999, -9999);
  }

  get dist() { return this.baseDist * this.zoom; }

  setFocus(x: number, y: number, animate = false) {
    if (animate) { this.followTarget = new Vector3(x + 0.5, 0, y + 0.5); this.followFrames = 40; }
    else { this.target.set(x + 0.5, 0, y + 0.5); this.followTarget = null; }
  }

  setSelection(t: P | null) {
    if (!t) { this.selection.visible = false; return; }
    this.selection.visible = true;
    this.selection.position.set(t.x + 0.5, this.heightAt(t.x + 0.5, t.y + 0.5) + 0.08, t.y + 0.5);
  }

  setMarkers(m: Markers) {
    this.markers = m;
    const place = (o: Object3D, p: P, lift = 0) => { o.position.set(p.x + 0.5, this.heightAt(p.x + 0.5, p.y + 0.5) + lift, p.y + 0.5); };
    if (m.camp) { if (!this.campObj) { this.campObj = makeCamp(PLAYER_COLOR); this.markerGroup.add(this.campObj); } place(this.campObj, m.camp); }
    if (m.clanCamp) { if (!this.clanCampObj) { this.clanCampObj = makeCamp(CLAN_COLOR); this.markerGroup.add(this.clanCampObj); } place(this.clanCampObj, m.clanCamp); }
    else if (this.clanCampObj) { this.markerGroup.remove(this.clanCampObj); this.clanCampObj = null; }
    // مقبره‌ها
    while (this.tombObjs.length < m.tombs.length) { const t = makeTomb(); this.tombObjs.push(t); this.markerGroup.add(t); }
    while (this.tombObjs.length > m.tombs.length) { const t = this.tombObjs.pop()!; this.markerGroup.remove(t); disposeObject(t); }
    m.tombs.forEach((p, i) => place(this.tombObjs[i], p));
    if (!this.treasureObj) { this.treasureObj = makeTreasure(); this.markerGroup.add(this.treasureObj); }
    place(this.treasureObj, m.treasure);
    if (m.participation) { if (!this.participationObj) { this.participationObj = makeFlag(new Color('#7CFC9A')); this.markerGroup.add(this.participationObj); } place(this.participationObj, m.participation); }
    // کاروان
    const car = m.caravan ?? (m.caravanIdle ? { from: m.caravanIdle.at, to: m.caravanIdle.at, progress: 0, clan: m.caravanIdle.clan } : null);
    if (car) {
      if (!this.caravanObj || this.caravanObj.userData.clan !== car.clan) {
        if (this.caravanObj) { this.markerGroup.remove(this.caravanObj); disposeObject(this.caravanObj); }
        this.caravanObj = makeCaravan(car.clan ? CLAN_COLOR : PLAYER_COLOR); this.caravanObj.userData.clan = car.clan; this.markerGroup.add(this.caravanObj);
      }
      const x = car.from.x + (car.to.x - car.from.x) * car.progress + 0.5, z = car.from.y + (car.to.y - car.from.y) * car.progress + 0.5;
      this.caravanObj.position.set(x, this.heightAt(x, z) + 0.02, z);
    } else if (this.caravanObj) { this.markerGroup.remove(this.caravanObj); this.caravanObj = null; }
    // خانه‌های خودی
    if (this.ownedMesh) { this.markerGroup.remove(this.ownedMesh); this.ownedMesh.geometry.dispose(); this.ownedMesh = null; }
    const view = this.viewBounds();
    const vis = m.owned.filter(o => o.x >= view.minX - 2 && o.x <= view.maxX + 2 && o.y >= view.minZ - 2 && o.y <= view.maxZ + 2);
    if (vis.length) { this.ownedMesh = buildOwnedOverlay(vis, (x, z) => this.heightAt(x, z)); this.markerGroup.add(this.ownedMesh); }
    // مسیر با شماره‌ی قدم و نشان مقصد
    for (const c of [...this.pathGroup.children]) { this.pathGroup.remove(c); if ((c as Sprite).isSprite) (c as Sprite).material.dispose(); else disposeObject(c); }
    if (m.path && m.path.length) {
      m.path.forEach((p, i) => {
        const s = makeLabel(String(i + 1)); place(s, p, 0.55); this.pathGroup.add(s);
      });
      const dest = makeFlag(new Color('#ff6b5a')); place(dest, m.path[m.path.length - 1]); this.pathGroup.add(dest);
    }
  }

  // ناحیه‌ی زمین که دوربین می‌بیند (به کاشی)
  viewBounds() {
    const d = this.dist;
    const halfH = Math.tan(FOV / 2 * Math.PI / 180) * d;
    const halfW = halfH * this.camera.aspect;
    const vz = halfH / Math.sin(PITCH);
    return {
      minX: Math.floor(this.target.x - halfW * 1.35 - 3), maxX: Math.ceil(this.target.x + halfW * 1.35 + 3),
      minZ: Math.floor(this.target.z - vz * 1.9 - 3), maxZ: Math.ceil(this.target.z + vz * 1.1 + 3),
    };
  }

  private updateCamera() {
    const d = this.dist;
    this.camera.position.set(this.target.x, this.target.y + Math.sin(PITCH) * d, this.target.z + Math.cos(PITCH) * d);
    this.camera.lookAt(this.target);
    this.camera.far = d * 5; this.camera.near = Math.max(0.5, d * 0.05); this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as Fog; fog.near = d * 1.6; fog.far = d * 3.4;
    // خورشید: ناحیه‌ی سایه دور هدف، با قفل به تکسل تا سایه‌ها نلرزند
    const sunDir = new Vector3(Math.cos(SUN_ELEV) * Math.cos(SUN_AZ), Math.sin(SUN_ELEV), Math.cos(SUN_ELEV) * Math.sin(SUN_AZ));
    const b = this.viewBounds();
    const ext = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.55 + 4;
    const sc = this.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix();
    const texel = (2 * ext) / this.sun.shadow.mapSize.x;
    const tx = Math.round(this.target.x / texel) * texel, tz = Math.round(this.target.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.copy(this.sun.target.position).addScaledVector(sunDir, 90);
    this.sun.target.updateMatrixWorld();
  }

  private loadAround() {
    if (!this.chunks) return;
    const b = this.viewBounds();
    const moved = Math.abs(this.target.x - this.lastLoad.x) > 3 || Math.abs(this.target.z - this.lastLoad.y) > 3 || this.lastLoadZoom !== this.zoom;
    if (!moved) return;
    this.lastLoad.set(this.target.x, this.target.z); this.lastLoadZoom = this.zoom;
    const changed = this.chunks.update(b.minX, b.minZ, b.maxX, b.maxZ, m => this.terrainGroup.add(m), m => this.terrainGroup.remove(m));
    if (changed || this.scenery.ready) this.scenery.populate(b.minX, b.minZ, b.maxX, b.maxZ, this.terrainFn, (x, z) => this.H.height(x, z), (x, z) => this.H.water(x, z), this.seed, this.skipFn);
    if (this.markers) this.setMarkers(this.markers);
  }

  private animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    const t = (performance.now() - this.t0) / 1000;
    if (this.followTarget && this.followFrames > 0) { this.target.lerp(this.followTarget, 0.12); this.followFrames--; }
    this.updateCamera();
    this.loadAround();
    const pulse = 0.9 + Math.sin(t * 4) * 0.1;
    this.selection.scale.setScalar(pulse);
    for (const tb of this.tombObjs) { const cap = tb.userData.cap as Mesh; cap.rotation.y = t; cap.position.y = 1.05 + Math.sin(t * 2) * 0.05; }
    if (this.treasureObj) { const gem = this.treasureObj.userData.gem as Mesh; gem.rotation.y = t * 1.3; gem.position.y = 0.78 + Math.sin(t * 2.2) * 0.06; }
    if (this.caravanObj) { this.caravanObj.position.y += 0; (this.caravanObj.userData.ring as Mesh).scale.setScalar(pulse); }
    const s = performance.now();
    this.composer.composer.render();
    this.frameMs = this.frameMs * 0.9 + (performance.now() - s) * 0.1;
  };

  start() { if (!this.raf) this.animate(); }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  private pick(px: number, py: number): P | null {
    const r = this.canvas.getBoundingClientRect();
    const nd = new Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(nd, this.camera);
    const hits = this.raycaster.intersectObjects(this.terrainGroup.children, true).filter(h => !h.object.userData.water);
    if (!hits.length) return null;
    const p = hits[0].point;
    return { x: Math.floor(p.x), y: Math.floor(p.z) };
  }

  private bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) { this.drag = { x: e.clientX, y: e.clientY, moved: false, tx: this.target.x, tz: this.target.z }; this.followTarget = null; }
      else if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom }; this.drag = null; }
    });
    c.addEventListener('pointermove', e => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom = Math.max(0.6, Math.min(2.6, this.pinch.zoom * this.pinch.d / Math.max(1, d)));
        return;
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < 6) return;
      this.drag.moved = true;
      const upp = (2 * Math.tan(FOV / 2 * Math.PI / 180) * this.dist) / c.clientHeight; // واحد به ازای هر پیکسل
      this.target.x = Math.max(0, Math.min(1000, this.drag.tx - dx * upp));
      this.target.z = Math.max(0, Math.min(1000, this.drag.tz - (dy * upp) / Math.sin(PITCH)));
    });
    const up = (e: PointerEvent) => {
      const was = this.drag;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) {
        this.drag = null;
        if (was && !was.moved && this.onTap) { const t = this.pick(e.clientX, e.clientY); if (t) this.onTap(t); }
      }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.max(0.6, Math.min(2.6, this.zoom * Math.pow(1.1, e.deltaY / 100))); }, { passive: false });
  }
}
