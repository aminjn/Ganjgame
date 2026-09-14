// خط لوله‌ی اسپرایت ایزومتریک: هر عنصر یک بیلبورد رو به دوربینِ ثابت است؛ عمق هر بیلبورد از نقطه‌ی لنگرش (پای شیء) گرفته می‌شود
// تا ترتیب پوشانندگی مثل موتورهای ۲بعدی ایزومتریک درست باشد (شیء جلوتر روی شیء عقب‌تر).
import { TextureLoader, Texture, SRGBColorSpace, Mesh, Group, InstancedMesh, PlaneGeometry, Quaternion, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, Material, BufferGeometry } from 'three';

export interface SpriteDef { file: string; w: number; h: number; frames?: number; cols?: number; fps?: number; anchor?: number }

// عمق از لنگر: z کلیپ همه‌ی رأس‌ها برابر z لنگر (مبدأ محلی نمونه)؛ bias عمق را به سمت دوربین می‌آورد
// تا اشیای ایستاده روی یک بلوک بزرگ زمین، زیر خودِ بلوک نروند.
export function anchorDepth(mat: Material, bias = 0) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.anchorBias = { value: bias };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform float anchorBias;`).replace('#include <project_vertex>', `#include <project_vertex>
      vec4 anchorPos = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_INSTANCING
      anchorPos = instanceMatrix * anchorPos;
      #endif
      vec4 anchorView = modelViewMatrix * anchorPos; anchorView.z += anchorBias;
      vec4 anchorClip = projectionMatrix * anchorView;
      gl_Position.z = anchorClip.z / anchorClip.w * gl_Position.w;`);
  };
  mat.needsUpdate = true;
}
export const OBJECT_BIAS = 2.6;

export class SpriteLib {
  private defs = new Map<string, SpriteDef>();
  private textures = new Map<string, Texture>();
  ready = false;
  camQuat = new Quaternion();

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
        try { const t = await loader.loadAsync(base + d.file); t.colorSpace = SRGBColorSpace; t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; this.textures.set(k, t); } catch (e) { console.warn('sprite', k, e); }
      }));
    } catch { /* بدون اسپرایت: مدل‌های سه‌بعدی */ }
    this.ready = true;
  }

  has(path: string): boolean { return this.textures.has(path); }
  def(path: string): SpriteDef | undefined { return this.defs.get(path); }
  texture(path: string): Texture | undefined { return this.textures.get(path); }

  // هندسه‌ی بیلبورد با لنگر در پای تصویر (anchor = سهم ارتفاع از پایین که روی زمین می‌نشیند)
  private geometry(d: SpriteDef): BufferGeometry {
    const g = new PlaneGeometry(d.w, d.h);
    g.translate(0, d.h / 2 - (d.anchor ?? 0) * d.h, 0);
    return g;
  }

  // بیلبورد تکی
  make(path: string, _shadow = false): Group | null {
    const t = this.textures.get(path), d = this.defs.get(path); if (!t || !d) return null;
    const g = new Group();
    const tex = d.frames && d.frames > 1 ? t.clone() : t;
    if (d.frames && d.frames > 1) { tex.repeat.set(1 / (d.cols ?? d.frames), 1); tex.needsUpdate = true; }
    const mat = new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.45, depthWrite: true });
    anchorDepth(mat, OBJECT_BIAS);
    const m = new Mesh(this.geometry(d), mat);
    m.quaternion.copy(this.camQuat);
    m.renderOrder = 3;
    g.add(m);
    g.userData.sprite = m; g.userData.def = d; g.userData.frame = -1;
    return g;
  }

  animate(g: Group, time: number, playing = true) {
    const d = g.userData.def as SpriteDef | undefined; const s = g.userData.sprite as Mesh | undefined;
    if (!d || !s || !d.frames || d.frames <= 1) return;
    const frame = playing ? Math.floor(time * (d.fps ?? 8)) % d.frames : 0;
    if (frame === g.userData.frame) return;
    g.userData.frame = frame;
    const cols = d.cols ?? d.frames;
    const tex = (s.material as MeshBasicMaterial).map!;
    tex.offset.set((frame % cols) / cols, 1 - Math.floor(frame / cols + 1) / Math.ceil(d.frames / cols));
  }

  // بیلبوردهای Instanced (صدها نمونه در یک فراخوانی)
  makeInstanced(path: string, cap: number, camQuat: Quaternion, renderOrder = 2): { mesh: InstancedMesh; def: SpriteDef } | null {
    const t = this.textures.get(path), d = this.defs.get(path); if (!t || !d) return null;
    const mat = new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.45, depthWrite: true });
    anchorDepth(mat, OBJECT_BIAS);
    const im = new InstancedMesh(this.geometry(d), mat, cap); im.count = 0; im.frustumCulled = false; im.renderOrder = renderOrder;
    im.userData.quat = camQuat.clone();
    return { mesh: im, def: d };
  }
}

// زمین کاشی‌شده از اسپرایت‌های کاشی شیت (بلوک ایزومتریک): هر کاشی یک بیلبورد با لنگر در مرکز وجه بالایی
export class TileGround {
  group = new Group();
  private meshes = new Map<string, InstancedMesh>();
  private tmp = new (class { m = new Mesh(); })().m;
  active = false;
  constructor(private lib: SpriteLib) {}

  private mesh(type: string): InstancedMesh | null {
    let im = this.meshes.get(type); if (im) return im;
    const key = 'tiles.' + type; const t = this.lib.texture(key), d = this.lib.def(key); if (!t || !d) return null;
    // پهنای لوزی وجه بالا = √۲ کاشی؛ مرکز لوزی در ۰٫۴۳ ارتفاع تصویر از بالا
    const W = Math.SQRT2 * 1.02, H = W * (d.h / d.w);
    const g = new PlaneGeometry(W, H); g.translate(0, -(0.5 - 0.437) * H, 0);
    const mat = new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, depthWrite: true });
    anchorDepth(mat);
    im = new InstancedMesh(g, mat, 2600); im.count = 0; im.frustumCulled = false; im.renderOrder = 0;
    this.meshes.set(type, im); this.group.add(im);
    return im;
  }

  // هر تصویر کاشی شیت یک «تکه‌ی سرزمین» است نه یک کاشی تکرارشونده؛ پس بلوک‌های همگن ۴×۴ و ۲×۲ با یک تصویر بزرگ کشیده می‌شوند
  // و فقط مرزها تک‌کاشی می‌مانند. مقبره و گنج همیشه تک‌کاشی‌اند.
  populate(minX: number, minZ: number, maxX: number, maxZ: number, terrain: (x: number, y: number) => string, camQuat: Quaternion) {
    const counts = new Map<string, number>();
    for (const im of this.meshes.values()) im.count = 0;
    this.tmp.quaternion.copy(camQuat);
    const put = (t: string, cx: number, cz: number, size: number) => {
      const im = this.mesh(t); if (!im) return;
      const n = counts.get(t) ?? 0; if (n >= 2600) return;
      this.tmp.position.set(cx, 0, cz); this.tmp.scale.set(size, size, 1); this.tmp.updateMatrix();
      im.setMatrixAt(n, this.tmp.matrix); im.count = n + 1; counts.set(t, n + 1);
    };
    const homogeneous = (x0: number, y0: number, size: number): string | null => {
      const t = terrain(x0, y0); if (t === 'tomb' || t === 'treasure') return null;
      for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) { if (x >= 1000 || y >= 1000 || terrain(x, y) !== t) return null; }
      return t;
    };
    const bx0 = Math.floor(Math.max(0, minX) / 4) * 4, bz0 = Math.floor(Math.max(0, minZ) / 4) * 4;
    // از عقب به جلو (ترتیب رسم داخل هر مش)
    for (let by = bz0; by <= maxZ; by += 4) for (let bx = bx0; bx <= maxX; bx += 4) {
      if (bx >= 1000 || by >= 1000) continue;
      const t4 = homogeneous(bx, by, 4);
      if (t4) { put(t4, bx + 2, by + 2, 4); continue; }
      for (let sy = 0; sy < 4; sy += 2) for (let sx = 0; sx < 4; sx += 2) {
        const x2 = bx + sx, y2 = by + sy; if (x2 >= 1000 || y2 >= 1000) continue;
        const t2 = homogeneous(x2, y2, 2);
        if (t2) { put(t2, x2 + 1, y2 + 1, 2); continue; }
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = x2 + dx, y = y2 + dy; if (x >= 1000 || y >= 1000) continue; put(terrain(x, y), x + 0.5, y + 0.5, 1); }
      }
    }
    for (const im of this.meshes.values()) im.instanceMatrix.needsUpdate = true;
    this.active = this.meshes.size > 0;
  }
}
