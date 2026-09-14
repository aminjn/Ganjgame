// خط لوله‌ی اسپرایت: هر عنصری که در manifest اسپرایت داشته باشد به‌صورت بیلبورد ایزومتریک روی زمین سه‌بعدی نشان داده می‌شود.
import { TextureLoader, Texture, SRGBColorSpace, Sprite, SpriteMaterial, Mesh, CircleGeometry, MeshBasicMaterial, Group, InstancedMesh, PlaneGeometry, Object3D, Quaternion, NearestFilter, LinearFilter } from 'three';

export interface SpriteDef { file: string; w: number; h: number; frames?: number; cols?: number; fps?: number; anchor?: number }

export class SpriteLib {
  private defs = new Map<string, SpriteDef>();
  private textures = new Map<string, Texture>();
  ready = false;

  async load(base = 'assets/sprites/') {
    try {
      const res = await fetch(base + 'manifest.json'); if (!res.ok) return;
      const m = await res.json();
      const walk = (obj: any, prefix: string) => {
        for (const [k, v] of Object.entries(obj)) {
          if (k.startsWith('_')) continue;
          const path = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === 'object' && 'file' in (v as any)) this.defs.set(path, v as SpriteDef);
          else if (v && typeof v === 'object') walk(v, path);
        }
      };
      walk(m, '');
      const loader = new TextureLoader();
      await Promise.all([...this.defs.entries()].map(async ([k, d]) => {
        try { const t = await loader.loadAsync(base + d.file); t.colorSpace = SRGBColorSpace; t.magFilter = LinearFilter; t.minFilter = LinearFilter; this.textures.set(k, t); } catch (e) { console.warn('sprite', k, e); }
      }));
    } catch { /* بدون اسپرایت: مدل‌های سه‌بعدی */ }
    this.ready = true;
  }

  has(path: string): boolean { return this.textures.has(path); }
  def(path: string): SpriteDef | undefined { return this.defs.get(path); }

  // بیلبورد تکی با لنگر در پای شیء و سایه‌ی نرم زیرش
  make(path: string, shadow = true): Group | null {
    const t = this.textures.get(path), d = this.defs.get(path); if (!t || !d) return null;
    const g = new Group();
    const tex = d.frames && d.frames > 1 ? t.clone() : t;
    if (d.frames && d.frames > 1) { tex.repeat.set(1 / (d.cols ?? d.frames), 1); tex.needsUpdate = true; }
    const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.45, depthWrite: true }));
    s.center.set(0.5, d.anchor ?? 0.02);
    s.scale.set(d.w, d.h, 1);
    s.position.y = 0.01;
    g.add(s);
    g.userData.sprite = s; g.userData.def = d; g.userData.frame = -1;
    if (shadow) {
      const sh = new Mesh(new CircleGeometry(d.w * 0.32, 20), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2; sh.position.y = 0.015; sh.scale.set(1, 0.6, 1); g.add(sh);
    }
    return g;
  }

  // انیمیشن شیت افقی
  animate(g: Group, time: number, playing = true) {
    const d = g.userData.def as SpriteDef | undefined; const s = g.userData.sprite as Sprite | undefined;
    if (!d || !s || !d.frames || d.frames <= 1) return;
    const frame = playing ? Math.floor(time * (d.fps ?? 8)) % d.frames : 0;
    if (frame === g.userData.frame) return;
    g.userData.frame = frame;
    const cols = d.cols ?? d.frames;
    const tex = s.material.map!;
    tex.offset.set((frame % cols) / cols, 1 - Math.floor(frame / cols + 1) / Math.ceil(d.frames / cols));
  }

  // بیلبوردهای Instanced (برای صدها نگاهبان/برجک): صفحه‌ای که رو به دوربینِ ثابت است
  makeInstanced(path: string, cap: number, camQuat: Quaternion): { mesh: InstancedMesh; def: SpriteDef } | null {
    const t = this.textures.get(path), d = this.defs.get(path); if (!t || !d) return null;
    const geo = new PlaneGeometry(d.w, d.h); geo.translate(0, d.h / 2, 0);
    const mat = new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.45, depthWrite: true });
    const im = new InstancedMesh(geo, mat, cap); im.count = 0; im.frustumCulled = false;
    im.userData.quat = camQuat.clone();
    return { mesh: im, def: d };
  }
}

export const tmpObj = new Object3D();
void NearestFilter;
