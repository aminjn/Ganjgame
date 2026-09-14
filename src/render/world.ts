// دنیای سه‌بعدی: دیورامای کج‌شده‌ی رومیزی. دوربین ثابت (~۵۵ درجه، fov 30، بدون چرخش yaw)، خورشید گرم ~۳۵ درجه با سایه، نور محیطی سرد.
import {
  Scene, OrthographicCamera, WebGLRenderer, DirectionalLight, HemisphereLight, Color, Fog, Vector3, Vector2, Raycaster, Mesh, Group,
  VSMShadowMap, NeutralToneMapping, SRGBColorSpace, Object3D, Sprite,
} from 'three';
import type { Terrain } from '../rules/constants';
import { makeHeight, type TerrainFn } from './height';
import { TerrainChunks } from './terrainMesh';
import { Scenery } from './scenery';
import { makeCamp, makeCaravan, makeTomb, makeTreasure, makeSelection, makeLabel, buildOwnedOverlay, makeFlag, disposeObject, loadProps } from './markers';
import { TorusGeometry, MeshBasicMaterial } from 'three';
import { Units } from './units';
import { Territory } from './territory';
import { SpriteLib, TileGround } from './sprites';
import { Monsters } from './monsters';
import type { UnitType } from '../rules/constants';
import { makeComposer } from './post';
import { PLAYER_COLOR, CLAN_COLOR } from './palette';

export interface P { x: number; y: number }
export interface Markers {
  caravanUnits: Record<UnitType, number>;
  guardians: { x: number; y: number; type: UnitType }[];
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

// نمای ایزومتریک واقعی (اورتوگرافیک) هماهنگ با زاویه‌ی هنر شیت مرجع: yaw ثابت ۴۵ درجه (هرگز نمی‌چرخد)، pitch ۵۲ درجه
const PITCH = 52 * Math.PI / 180;
const YAW = 45 * Math.PI / 180;
const SUN_ELEV = 48 * Math.PI / 180;
// بردارهای پایه‌ی صفحه‌ی نمایش روی زمین
const RIGHT = new Vector3(Math.cos(YAW), 0, -Math.sin(YAW));      // راستِ صفحه
const FORWARD = new Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));   // بالای صفحه (دور شدن از دوربین)

export class World {
  scene = new Scene();
  camera: OrthographicCamera;
  tiles: TileGround;
  renderer: WebGLRenderer;
  private composer!: ReturnType<typeof makeComposer>;
  private sun: DirectionalLight;
  private chunks!: TerrainChunks;
  private H!: ReturnType<typeof makeHeight>;
  private scenery: Scenery;
  private units = new Units();
  private territory = new Territory();
  sprites = new SpriteLib();
  private monsters = new Monsters();
  private ownedFn: (x: number, y: number) => boolean = () => false;
  private spriteObjs: Group[] = [];
  private lastFrame = performance.now();
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
  private baseDist = 17;
  private aspect = 1;
  private lastLoad = new Vector2(-9999, -9999);
  private lastLoadZoom = -1;
  private raf = 0;
  private raycaster = new Raycaster();
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean; tx: number; tz: number } | null = null;
  private pinch: { d: number; zoom: number } | null = null;
  private markers: Markers | null = null;
  private lastHeading = 0;
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
    this.renderer.shadowMap.type = VSMShadowMap;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.camera = new OrthographicCamera(-10, 10, 10, -10, 1, 400);
    this.camera.position.set(-FORWARD.x * Math.cos(PITCH) * 100, Math.sin(PITCH) * 100, -FORWARD.z * Math.cos(PITCH) * 100);
    this.camera.lookAt(0, 0, 0);
    this.sprites.camQuat.copy(this.camera.quaternion);
    this.tiles = new TileGround(this.sprites);
    this.scene.add(this.tiles.group);
    const bg = new Color('#a9dcec');
    this.scene.background = bg;
    this.scene.fog = new Fog(bg, 60, 160);

    // خورشید گرم با زاویه‌ی کم (~۳۵ درجه) — سایه‌های بلند و خوانا
    this.sun = new DirectionalLight(new Color('#fff1d6'), 2.6);
    this.sun.castShadow = true;
    const sm = 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = mobile ? 3 : 5;
    this.sun.shadow.blurSamples = mobile ? 6 : 12;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 220;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    // نور محیطی سرد و نرم: سایه‌ها آبی‌فام، نه سیاه
    this.scene.add(new HemisphereLight(new Color('#dbeeff'), new Color('#8ea06a'), 1.5));

    this.scene.add(this.terrainGroup);
    this.scene.add(this.markerGroup);
    this.scene.add(this.pathGroup);
    this.selection.visible = false; this.markerGroup.add(this.selection);
    this.scenery = new Scenery(mobile);
    this.scene.add(this.scenery.group);
    this.scene.add(this.units.group);
    this.scene.add(this.territory.group);
    this.scene.add(this.monsters.group);

    this.composer = makeComposer(this.renderer, this.scene, this.camera, 2, 2, mobile);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
  }

  async init() {
    await Promise.all([this.scenery.load(), this.units.load(), loadProps(), this.sprites.load()]);
    this.units.sprites = this.sprites; this.scenery.sprites = this.sprites;
    this.setTerrain(this.terrainFn, this.seed, this.skipFn, this.ownedFn);
    // نشانه‌ها با پراپ‌های واقعی از نو ساخته شوند
    for (const o of [this.campObj, this.clanCampObj, this.treasureObj, ...this.tombObjs]) if (o) { this.markerGroup.remove(o); disposeObject(o); }
    this.campObj = null; this.clanCampObj = null; this.treasureObj = null; this.tombObjs = [];
    this.lastLoad.set(-9999, -9999);
    if (this.markers) this.setMarkers(this.markers);
  }

  setTerrain(fn: TerrainFn, seed: number, skip: (x: number, y: number) => boolean, owned?: (x: number, y: number) => boolean) {
    this.terrainFn = fn; this.seed = seed; this.skipFn = skip; if (owned) this.ownedFn = owned;
    this.H = makeHeight(fn, seed, this.sprites.ready && this.sprites.has('units.soldier.idle'));
    if (this.chunks) this.chunks.clear(m => this.terrainGroup.remove(m));
    this.chunks = new TerrainChunks(this.H, seed);
    this.lastLoad.set(-9999, -9999);
  }

  heightAt(x: number, z: number) { return this.H ? this.H.height(x, z) : 0; }

  resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this.composer.setSize(w, h);
    // پهنای دید پایه به واحد جهان روی صفحه (روی گوشی عمودی باریک‌تر)
    this.baseDist = this.aspect < 0.8 ? 11 : 17;
    this.lastLoad.set(-9999, -9999);
  }

  get dist() { return this.baseDist * this.zoom; } // پهنای دید (واحد جهان روی صفحه)

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
    const build = (key: string, fallback: () => Group): Group => { const sp = this.sprites.make('buildings.' + key); if (sp) { this.spriteObjs.push(sp); return sp; } return fallback(); };
    if (m.camp) { if (!this.campObj) { this.campObj = build('camp', () => makeCamp(PLAYER_COLOR)); this.markerGroup.add(this.campObj); } place(this.campObj, m.camp); }
    if (m.clanCamp) { if (!this.clanCampObj) { this.clanCampObj = build('clan_camp', () => makeCamp(CLAN_COLOR, true)); this.markerGroup.add(this.clanCampObj); } place(this.clanCampObj, m.clanCamp); }
    else if (this.clanCampObj) { this.markerGroup.remove(this.clanCampObj); this.clanCampObj = null; }
    // مقبره‌ها
    while (this.tombObjs.length < m.tombs.length) { const t = build('tomb', makeTomb); this.tombObjs.push(t); this.markerGroup.add(t); }
    while (this.tombObjs.length > m.tombs.length) { const t = this.tombObjs.pop()!; this.markerGroup.remove(t); disposeObject(t); }
    m.tombs.forEach((p, i) => place(this.tombObjs[i], p));
    if (!this.treasureObj) { this.treasureObj = build('treasure', makeTreasure); this.markerGroup.add(this.treasureObj); }
    place(this.treasureObj, m.treasure);
    if (m.participation) { if (!this.participationObj) { this.participationObj = makeFlag(new Color('#7CFC9A')); this.markerGroup.add(this.participationObj); } place(this.participationObj, m.participation); }
    const view = this.viewBounds();
    // کاروان
    const car = m.caravan ?? (m.caravanIdle ? { from: m.caravanIdle.at, to: m.caravanIdle.at, progress: 0, clan: m.caravanIdle.clan } : null);
    if (car) {
      if (!this.caravanObj || this.caravanObj.userData.clan !== car.clan) {
        if (this.caravanObj) { this.markerGroup.remove(this.caravanObj); disposeObject(this.caravanObj); }
        const sp = this.sprites.make('buildings.caravan');
        this.caravanObj = sp ?? makeCaravan(car.clan ? CLAN_COLOR : PLAYER_COLOR); this.caravanObj.userData.clan = car.clan; this.markerGroup.add(this.caravanObj);
        if (sp) { const ring = new Mesh(new TorusGeometry(1.1, 0.04, 6, 40), new MeshBasicMaterial({ color: car.clan ? CLAN_COLOR : PLAYER_COLOR })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; sp.add(ring); sp.userData.ring = ring; }
      }
      const x = car.from.x + (car.to.x - car.from.x) * car.progress + 0.5, z = car.from.y + (car.to.y - car.from.y) * car.progress + 0.5;
      const h = this.heightAt(x, z);
      this.caravanObj.position.set(x, h + 0.02, z);
      const dx = car.to.x - car.from.x, dz = car.to.y - car.from.y;
      const heading = (dx || dz) ? Math.atan2(dx, dz) : this.lastHeading;
      this.lastHeading = heading;
      this.units.setCaravan(x, h + 0.02, z, heading, m.caravanUnits, !!m.caravan, true);
    } else { if (this.caravanObj) { this.markerGroup.remove(this.caravanObj); this.caravanObj = null; } this.units.setCaravan(0, 0, 0, 0, m.caravanUnits, false, false); }
    // نگاهبان‌ها روی خانه‌های تصاحب‌شده‌ی داخل دید
    const gv = m.guardians.filter(g => g.x >= view.minX - 2 && g.x <= view.maxX + 2 && g.y >= view.minZ - 2 && g.y <= view.maxZ + 2);
    const gl = gv.map(g => { const gx = g.x + 0.5 + Math.sin(g.x * 12.9 + g.y * 3.1) * 0.22, gz = g.y + 0.5 + Math.cos(g.x * 5.3 + g.y * 7.7) * 0.22; return { x: gx, y: this.heightAt(gx, gz), z: gz, type: g.type, rot: (g.x * 7 + g.y * 13) % 6.28 }; });
    this.units.setGuardians(this.units.setGuardianSprites(gl, this.camera.quaternion));
    void (() => gv.map(g => { const gx = g.x + 0.5 + Math.sin(g.x * 12.9 + g.y * 3.1) * 0.22, gz = g.y + 0.5 + Math.cos(g.x * 5.3 + g.y * 7.7) * 0.22; return { x: gx, y: this.heightAt(gx, gz), z: gz, type: g.type, rot: (g.x * 7 + g.y * 13) % 6.28 }; }));
    // خانه‌های خودی
    if (this.ownedMesh) { this.markerGroup.remove(this.ownedMesh); this.ownedMesh.geometry.dispose(); this.ownedMesh = null; }
    const vis = m.owned.filter(o => o.x >= view.minX - 2 && o.x <= view.maxX + 2 && o.y >= view.minZ - 2 && o.y <= view.maxZ + 2);
    if (vis.length) { this.ownedMesh = buildOwnedOverlay(vis, (x, z) => this.heightAt(x, z)); this.markerGroup.add(this.ownedMesh); }
    // برجک و پرچم روی خانه‌های تصاحب‌شده‌ی داخل دید
    const campKeys = new Set([m.camp ? `${m.camp.x},${m.camp.y}` : '', m.clanCamp ? `${m.clanCamp.x},${m.clanCamp.y}` : '']);
    this.territory.set(vis.map(o => ({ x: o.x, y: o.y, clan: o.clan, camp: campKeys.has(`${o.x},${o.y}`) })), (x, z) => this.heightAt(x, z), this.sprites, this.camera.quaternion);

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
    const halfW = this.dist / 2;
    const halfH = halfW / this.aspect;
    const vz = halfH / Math.sin(PITCH);
    const r = (halfW + vz) * 0.72 + 3;
    return {
      minX: Math.floor(this.target.x - r), maxX: Math.ceil(this.target.x + r),
      minZ: Math.floor(this.target.z - r), maxZ: Math.ceil(this.target.z + r),
    };
  }

  private updateCamera() {
    const d = 120;
    this.camera.position.set(this.target.x - FORWARD.x * Math.cos(PITCH) * d, this.target.y + Math.sin(PITCH) * d, this.target.z - FORWARD.z * Math.cos(PITCH) * d);
    this.camera.lookAt(this.target);
    const hw = this.dist / 2, hh = hw / this.aspect;
    this.camera.left = -hw; this.camera.right = hw; this.camera.top = hh; this.camera.bottom = -hh; this.camera.near = 1; this.camera.far = 400; this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as Fog; fog.near = 1000; fog.far = 2000;
    if (this.sprites.ready) { this.sun.castShadow = false; this.composer.outline.mat.uniforms.strength.value = 0; this.composer.bloom.strength = 0.08; }
    // خورشید: ناحیه‌ی سایه دور هدف، با قفل به تکسل تا سایه‌ها نلرزند
    // خورشید از بالا-چپ صفحه تا سایه‌ها به پایین-راست بیفتند (مثل CoC)
    const sunDir = new Vector3().addScaledVector(RIGHT, -0.62).addScaledVector(FORWARD, 0.45).normalize().multiplyScalar(Math.cos(SUN_ELEV));
    sunDir.y = Math.sin(SUN_ELEV);
    const b = this.viewBounds();
    const ext = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.5 + 3;
    void ext;
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
    if (changed || this.scenery.ready) this.scenery.populate(b.minX, b.minZ, b.maxX, b.maxZ, this.terrainFn, (x, z) => this.heightAt(x, z), (x, z) => (this.tiles.active ? -1 : this.H.water(x, z)), this.seed, this.skipFn, this.camera.quaternion);
    this.monsters.populate(this.sprites, this.camera.quaternion, b.minX, b.minZ, b.maxX, b.maxZ, this.terrainFn, (x, z) => this.heightAt(x, z), this.ownedFn, this.seed);
    void this.tiles;
    if (this.markers) this.setMarkers(this.markers);
  }

  private animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    const t = (performance.now() - this.t0) / 1000;
    const nowMs = performance.now(); const dt = Math.min(0.1, (nowMs - this.lastFrame) / 1000); this.lastFrame = nowMs;
    this.units.update(dt);
    if (this.followTarget && this.followFrames > 0) { this.target.lerp(this.followTarget, 0.12); this.followFrames--; }
    this.updateCamera();
    this.loadAround();
    const pulse = 0.9 + Math.sin(t * 4) * 0.1;
    this.selection.scale.setScalar(pulse);
    for (const sp of this.spriteObjs) this.sprites.animate(sp, t);
    for (const tb of this.tombObjs) { const cap = tb.userData.cap as Mesh | undefined; if (!cap) continue; cap.rotation.y = t; cap.position.y = (tb.userData.capBase ?? (tb.userData.capBase = cap.position.y)) + Math.sin(t * 2) * 0.05; }
    if (this.treasureObj && this.treasureObj.userData.gem) { const gem = this.treasureObj.userData.gem as Mesh; gem.rotation.y = t * 1.3; gem.position.y = (this.treasureObj.userData.gemBase ?? (this.treasureObj.userData.gemBase = gem.position.y)) + Math.sin(t * 2.2) * 0.06; }
    if (this.caravanObj) { this.caravanObj.position.y += 0; (this.caravanObj.userData.ring as Mesh).scale.setScalar(pulse); }
    const s = performance.now();
    this.composer.update();
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
      const upp = this.dist / c.clientWidth; // واحد به ازای هر پیکسل (اورتوگرافیک)
      const mx = -dx * upp, mf = (dy * upp) / Math.sin(PITCH);
      this.target.x = Math.max(0, Math.min(1000, this.drag.tx + RIGHT.x * mx + FORWARD.x * mf));
      this.target.z = Math.max(0, Math.min(1000, this.drag.tz + RIGHT.z * mx + FORWARD.z * mf));
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
