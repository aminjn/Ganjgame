// نشانه‌های قلمرو روی هر خانه‌ی تصاحب‌شده: برجک نگهبانی و پرچم (Instanced — ارزان حتی برای صدها خانه).
import {
  Group, InstancedMesh, MeshPhongMaterial, MeshBasicMaterial, CylinderGeometry, ConeGeometry, BoxGeometry, PlaneGeometry, Object3D, Color, DoubleSide, BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAYER_COLOR, CLAN_COLOR } from './palette';
import { hash2 } from '../rules/rng';
import type { SpriteLib } from './sprites';
import { Quaternion } from 'three';

const CAP = 900;

function towerStone(): BufferGeometry {
  const base = new CylinderGeometry(0.16, 0.2, 0.42, 6); base.translate(0, 0.21, 0);
  const rim = new CylinderGeometry(0.22, 0.18, 0.08, 6); rim.translate(0, 0.46, 0);
  const merl: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = new BoxGeometry(0.07, 0.08, 0.07); b.translate(Math.cos(a) * 0.18, 0.54, Math.sin(a) * 0.18); merl.push(b); }
  return mergeGeometries([base, rim, ...merl].map(g => g.toNonIndexed()), false)!;
}
function towerRoof(): BufferGeometry { const c = new ConeGeometry(0.2, 0.22, 6); c.translate(0, 0.62, 0); return c.toNonIndexed(); }
function towerDoor(): BufferGeometry { const d = new BoxGeometry(0.09, 0.14, 0.03); d.translate(0, 0.1, 0.19); return d.toNonIndexed(); }
function pole(): BufferGeometry { const p = new CylinderGeometry(0.016, 0.02, 0.42, 5); p.translate(0, 0.9, 0); const top = new ConeGeometry(0.03, 0.05, 5); top.translate(0, 1.13, 0); return mergeGeometries([p.toNonIndexed(), top.toNonIndexed()], false)!; }
function cloth(): BufferGeometry { const c = new PlaneGeometry(0.28, 0.17, 3, 1); const pos = c.getAttribute('position'); for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin((x + 0.15) * 12) * 0.02); } c.translate(0.15, 1.02, 0); return c.toNonIndexed(); }

export class Territory {
  group = new Group();
  private parts: InstancedMesh[] = [];
  private stone: InstancedMesh; private roof: InstancedMesh; private door: InstancedMesh; private poleM: InstancedMesh; private clothM: InstancedMesh;
  private tmp = new Object3D();
  private c = new Color();
  private spriteTower: InstancedMesh | null = null;
  private spriteTowerClan: InstancedMesh | null = null;
  private spriteTried = false;

  constructor() {
    const mk = (g: BufferGeometry, m: MeshPhongMaterial | MeshBasicMaterial) => { const im = new InstancedMesh(g, m, CAP); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; this.group.add(im); this.parts.push(im); return im; };
    this.stone = mk(towerStone(), new MeshPhongMaterial({ color: '#cfc6b8', shininess: 8, flatShading: true }));
    this.roof = mk(towerRoof(), new MeshPhongMaterial({ color: '#ffffff', shininess: 12, flatShading: true }));
    this.door = mk(towerDoor(), new MeshPhongMaterial({ color: '#6b4426', shininess: 4 }));
    this.poleM = mk(pole(), new MeshPhongMaterial({ color: '#8a5d3c', shininess: 6 }));
    this.clothM = mk(cloth(), new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }));
    this.clothM.castShadow = true;
  }

  set(list: { x: number; y: number; clan: boolean; camp: boolean }[], height: (x: number, z: number) => number, sprites?: SpriteLib, camQuat?: Quaternion) {
    // اگر اسپرایت برجک هست، بیلبورد Instanced به‌جای مدل
    if (sprites && sprites.ready && !this.spriteTried && camQuat) {
      this.spriteTried = true;
      const r = sprites.makeInstanced('buildings.tower', CAP, camQuat) ?? sprites.makeInstanced('markers.player_camp', CAP, camQuat);
      const rc = sprites.makeInstanced('markers.clan_camp', CAP, camQuat);
      if (r) { this.spriteTower = r.mesh; this.group.add(r.mesh); if (rc) { this.spriteTowerClan = rc.mesh; this.group.add(rc.mesh); } for (const p of this.parts) p.visible = false; }
    }
    if (this.spriteTower && camQuat) {
      let k = 0, kc = 0;
      const clanMesh = this.spriteTowerClan ?? this.spriteTower;
      for (const t of list) {
        if (t.camp) continue;
        const tx = t.x + 0.28, tz = t.y + 0.28;
        this.tmp.position.set(tx, height(tx, tz), tz); this.tmp.quaternion.copy(camQuat); this.tmp.scale.setScalar(1); this.tmp.updateMatrix();
        if (t.clan && this.spriteTowerClan) { if (kc < CAP) { clanMesh.setMatrixAt(kc, this.tmp.matrix); kc++; } }
        else if (k < CAP) { this.spriteTower.setMatrixAt(k, this.tmp.matrix); k++; }
      }
      this.spriteTower.count = k; this.spriteTower.instanceMatrix.needsUpdate = true;
      if (this.spriteTowerClan) { this.spriteTowerClan.count = kc; this.spriteTowerClan.instanceMatrix.needsUpdate = true; }
      return;
    }
    let n = 0;
    for (const t of list) {
      if (t.camp || n >= CAP) continue; // کمپ خودش ساختمان دارد
      const col = t.clan ? CLAN_COLOR : PLAYER_COLOR;
      const r1 = hash2(t.x, t.y, 901), r2 = hash2(t.x, t.y, 902);
      // برجک در یک گوشه، پرچم در گوشه‌ی مقابل — جای نگهبان (نزدیک مرکز) خالی می‌ماند
      // برجک در گوشه‌ی خانه، پرچم روی نوک همان برجک — جای نگهبان خالی می‌ماند
      const tx = t.x + 0.22 + r1 * 0.1, tz = t.y + 0.22 + r2 * 0.1;
      const rot = r1 * 0.6 - 0.3;
      this.tmp.position.set(tx, height(tx, tz) - 0.03, tz); this.tmp.rotation.set(0, rot, 0); this.tmp.scale.setScalar(1.15); this.tmp.updateMatrix();
      this.stone.setMatrixAt(n, this.tmp.matrix); this.door.setMatrixAt(n, this.tmp.matrix);
      this.roof.setMatrixAt(n, this.tmp.matrix); this.roof.setColorAt(n, this.c.copy(col).multiplyScalar(0.95));
      this.poleM.setMatrixAt(n, this.tmp.matrix);
      this.clothM.setMatrixAt(n, this.tmp.matrix); this.clothM.setColorAt(n, this.c.copy(col));
      n++;
    }
    for (const im of this.parts) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
}
