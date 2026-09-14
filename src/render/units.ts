// نیروها روی نقشه: کاراکترهای low-poly KayKit (CC0). کاروان با انیمیشن راه‌رفتن/ایستادن و نگاهبان‌ها به‌صورت Instanced.
import {
  Group, Object3D, AnimationMixer, AnimationClip, SkinnedMesh, Mesh, BufferGeometry, Float32BufferAttribute, InstancedMesh, MeshLambertMaterial, MeshPhongMaterial,
  Texture, SRGBColorSpace, Vector3, Color, Bone, Matrix4,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { UnitType } from '../rules/constants';
import { makeLabel } from './markers';
import { RingGeometry, CircleGeometry, MeshBasicMaterial, DoubleSide } from 'three';

function makeRing(color: string): Group {
  const g = new Group();
  const disc = new Mesh(new CircleGeometry(0.34, 24), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.012; g.add(disc);
  const ring = new Mesh(new RingGeometry(0.28, 0.36, 28), new MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  g.renderOrder = 2;
  return g;
}

const CHAR: Record<UnitType, { file: string; weaponR?: string; weaponL?: string }> = {
  soldier:  { file: 'Knight', weaponR: 'sword_1handed', weaponL: 'shield_round' },
  guard:    { file: 'Barbarian', weaponR: 'axe_1handed' },
  archer:   { file: 'Rogue', weaponR: 'crossbow_2handed' },
  explorer: { file: 'Rogue_Hooded', weaponR: 'dagger' },
  guide:    { file: 'Mage', weaponR: 'staff' },
};
const ORDER: UnitType[] = ['soldier', 'guard', 'archer', 'explorer', 'guide'];
const FIG_SCALE = 0.36; // قد کاراکتر ≈ ۰٫۹ کاشی (مثل CoC، نیروها بزرگ و خوانا)
export const UNIT_COLOR: Record<UnitType, string> = { soldier: '#4aa3ff', guard: '#ff6b3d', archer: '#7ee04f', explorer: '#c58bff', guide: '#ffd23f' };

interface Template { scene: Object3D; clips: Record<string, AnimationClip>; material: MeshLambertMaterial; baked: BufferGeometry }
interface Figure { type: UnitType; obj: Object3D; mixer: AnimationMixer; label: ReturnType<typeof makeLabel>; ring: Group; count: number; moving: boolean }

export class Units {
  group = new Group();
  caravan = new Group();
  private templates = new Map<UnitType, Template>();
  private weapons = new Map<string, Object3D>();
  private figures = new Map<UnitType, Figure>();
  private guardianMeshes = new Map<UnitType, InstancedMesh>();
  private guardianRings = new Map<UnitType, InstancedMesh>();
  ready = false;
  private tmp = new Object3D();

  constructor() { this.group.add(this.caravan); }

  async load(base = 'assets/models/') {
    const loader = new GLTFLoader();
    const weaponNames = new Set<string>();
    for (const c of Object.values(CHAR)) { if (c.weaponR) weaponNames.add(c.weaponR); if (c.weaponL) weaponNames.add(c.weaponL); }
    await Promise.all([...weaponNames].map(async w => {
      try { const g = await loader.loadAsync(`${base}props/${w}.glb`); g.scene.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.material = toLambert(o.material); } }); this.weapons.set(w, g.scene); } catch (e) { console.warn('weapon', w, e); }
    }));
    await Promise.all(ORDER.map(async type => {
      const c = CHAR[type];
      try {
        const g = await loader.loadAsync(`${base}kaykit/${c.file}.glb`);
        let material: MeshLambertMaterial | null = null;
        g.scene.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (!material) material = toLambert(o.material); o.material = material; } });
        const clips: Record<string, AnimationClip> = {};
        for (const clip of g.animations) clips[clip.name] = clip;
        const baked = bakePose(g.scene, clips['Idle']);
        this.templates.set(type, { scene: g.scene, clips, material: material!, baked });
        const gm = (material! as MeshLambertMaterial).clone(); gm.side = DoubleSide; // نرمال‌های هندسه‌ی پخته‌شده ممکن است برعکس باشند
        const im = new InstancedMesh(baked, gm, 800);
        im.count = 0; im.castShadow = true; im.frustumCulled = false;
        this.guardianMeshes.set(type, im); this.group.add(im);
        const rg = new InstancedMesh(new RingGeometry(0.75, 0.98, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: UNIT_COLOR[type], transparent: true, opacity: 0.9, depthWrite: false }), 800);
        rg.count = 0; rg.frustumCulled = false; rg.renderOrder = 2;
        this.guardianRings.set(type, rg); this.group.add(rg);
      } catch (e) { console.warn('character', type, e); }
    }));
    this.ready = true;
  }

  private attachWeapons(root: Object3D, type: UnitType) {
    const c = CHAR[type];
    const put = (slot: string, name?: string) => {
      if (!name) return; const w = this.weapons.get(name); if (!w) return;
      const bone = root.getObjectByName(slot); if (!bone) return;
      const inst = w.clone(); bone.add(inst);
    };
    put('handslot.r', c.weaponR); put('handslot.l', c.weaponL);
  }

  // کاروان: یک پیکره به ازای هر نوع نیروی حاضر، با برچسب تعداد
  setCaravan(x: number, y: number, z: number, heading: number, counts: Record<UnitType, number>, moving: boolean, visible: boolean) {
    this.caravan.visible = visible;
    if (!this.ready) return;
    this.caravan.position.set(x, y, z);
    const present = ORDER.filter(t => (counts[t] || 0) > 0);
    // حذف پیکره‌های غایب
    for (const [t, f] of this.figures) if (!present.includes(t)) { this.caravan.remove(f.obj); this.caravan.remove(f.label); this.caravan.remove(f.ring); f.mixer.stopAllAction(); this.figures.delete(t); }
    present.forEach((t, i) => {
      let f = this.figures.get(t);
      const tpl = this.templates.get(t); if (!tpl) return;
      if (!f) {
        const obj = skeletonClone(tpl.scene);
        obj.scale.setScalar(FIG_SCALE);
        this.attachWeapons(obj, t);
        const mixer = new AnimationMixer(obj);
        const label = makeLabel('', '#1c1710', UNIT_COLOR[t]);
        label.scale.setScalar(0.28);
        const ring = makeRing(UNIT_COLOR[t]);
        f = { type: t, obj, mixer, label, ring, count: -1, moving: !moving };
        this.caravan.add(obj); this.caravan.add(label); this.caravan.add(ring);
        this.figures.set(t, f);
      }
      // آرایش: ردیف‌های کوچک پشت پرچم
      // آرایش نیم‌دایره پشت پرچم، در راستای جهت حرکت
      const n = present.length;
      const ang = (i - (n - 1) / 2) * 0.55;
      const r = 0.62;
      const lx = Math.sin(ang) * r, lz = -Math.cos(ang) * r - 0.15; // پشت
      const ox = lx * Math.cos(heading) + lz * Math.sin(heading), oz = -lx * Math.sin(heading) + lz * Math.cos(heading);
      f.obj.position.set(ox, 0, oz);
      f.obj.rotation.y = heading;
      f.ring.position.set(ox, 0, oz);
      f.label.position.set(ox, 1.05, oz);
      if (f.count !== counts[t]) { f.count = counts[t]; const nl = makeLabel('×' + String(counts[t]), '#1c1710', UNIT_COLOR[t]); f.label.material.map = nl.material.map; f.label.material.needsUpdate = true; nl.material.dispose(); }
      if (f.moving !== moving) {
        f.moving = moving;
        f.mixer.stopAllAction();
        const clip = tpl.clips[moving ? 'Walking_A' : 'Idle'] ?? tpl.clips['Idle'];
        if (clip) { const a = f.mixer.clipAction(clip); a.time = i * 0.21; a.play(); }
      }
    });
  }

  // نگاهبان‌ها: یک پیکره‌ی ایستا روی هر خانه‌ی تصاحب‌شده (Instanced، ارزان)
  setGuardians(list: { x: number; y: number; z: number; type: UnitType; rot: number }[]) {
    if (!this.ready) return;
    const counts = new Map<UnitType, number>();
    for (const im of this.guardianMeshes.values()) im.count = 0;
    for (const im of this.guardianRings.values()) im.count = 0;
    for (const g of list) {
      const im = this.guardianMeshes.get(g.type); const rg = this.guardianRings.get(g.type); if (!im || !rg) continue;
      const i = counts.get(g.type) ?? 0; if (i >= 800) continue; counts.set(g.type, i + 1);
      this.tmp.position.set(g.x, g.y, g.z); this.tmp.rotation.set(0, g.rot, 0); this.tmp.scale.setScalar(FIG_SCALE * 0.9); this.tmp.updateMatrix();
      im.setMatrixAt(i, this.tmp.matrix); im.count = i + 1;
      this.tmp.position.set(g.x, g.y + 0.02, g.z); this.tmp.rotation.set(0, 0, 0); this.tmp.scale.setScalar(FIG_SCALE * 0.9); this.tmp.updateMatrix();
      rg.setMatrixAt(i, this.tmp.matrix); rg.count = i + 1;
    }
    for (const im of this.guardianMeshes.values()) im.instanceMatrix.needsUpdate = true;
    for (const im of this.guardianRings.values()) im.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) { for (const f of this.figures.values()) f.mixer.update(dt); }
}

function toLambert(src: any): MeshLambertMaterial {
  const map: Texture | null = src?.map ?? null;
  if (map) map.colorSpace = SRGBColorSpace;
  const m = new MeshPhongMaterial({ map, color: src?.color ? src.color.clone() : new Color(0xffffff), shininess: 22, specular: new Color('#333333') });
  m.name = src?.name ?? '';
  return m as unknown as MeshLambertMaterial;
}

// پز Idle را روی مش‌های اسکلتی می‌پزد و یک هندسه‌ی ایستا (بدون اسکلت) برای Instancing می‌سازد
function bakePose(scene: Object3D, clip: AnimationClip | undefined): BufferGeometry {
  if (clip) { const mixer = new AnimationMixer(scene); const a = mixer.clipAction(clip); a.play(); mixer.update(0.35); }
  scene.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  const v = new Vector3(), nrm = new Vector3();
  const rootInv = new Matrix4().copy(scene.matrixWorld).invert();
  scene.traverse((o: any) => {
    if (!o.isMesh) return;
    const mesh = o as Mesh;
    const g = mesh.geometry;
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    const out = new Float32Array(pos.count * 3);
    const skinned = (mesh as SkinnedMesh).isSkinnedMesh ? (mesh as SkinnedMesh) : null;
    const toRoot = new Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (skinned) { skinned.applyBoneTransform(i, v); v.applyMatrix4(rootInv); } else v.applyMatrix4(toRoot);
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    const bg = new BufferGeometry();
    bg.setAttribute('position', new Float32BufferAttribute(out, 3));
    // UV با getX/getY خوانده می‌شود تا صفت‌های کوانتیزه (نرمال‌شده) درست تبدیل شوند
    const uvs = new Float32Array(pos.count * 2);
    if (uv) for (let i = 0; i < pos.count; i++) { uvs[i * 2] = uv.getX(i); uvs[i * 2 + 1] = uv.getY(i); }
    bg.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    if (g.index) bg.setIndex(g.index.clone());
    bg.computeVertexNormals();
    parts.push(bg.toNonIndexed());
  });
  const merged = mergeGeometries(parts.map(p => { p.deleteAttribute('normal'); return p; }), false) ?? new BufferGeometry();
  merged.computeVertexNormals();
  void nrm; void Bone;
  return merged;
}
