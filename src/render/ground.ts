// زمین نقاشی‌گونه (اصلاحیه‌ی ۴): بافت رویه‌ای روی GPU — چمن با لکه و خاک، سنگ با ترک، مرداب با گل و برکه،
// سرزمین خطر خشک و ترک‌خورده، جهنم سوخته با رگه‌ی گداخته، دره‌ی عمیق. مرز زمین‌ها با نویز موج‌دار و نرم آمیخته می‌شود.
import { DataTexture, NearestFilter, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2, Texture } from 'three';
import type { Terrain } from '../rules/constants';

export const TERRAIN_ID: Record<Terrain, number> = { safe: 0, plain: 1, mountain: 2, marsh: 3, danger: 4, hell: 5, tomb: 6, treasure: 7, valley: 8 };
// بافت‌های نقاشی‌شده‌ی اختیاری (public/assets/textures/index.json): اگر باشند روی زمین می‌نشینند، وگرنه بافت رویه‌ای
export const TEX_KEYS = ['grass', 'dry', 'rock', 'marsh', 'cracked', 'lava', 'stone', 'gold', 'chasm'] as const;
export type TexKey = typeof TEX_KEYS[number];
export type GroundTextures = Partial<Record<TexKey, Texture>>;
const blank = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, RGBAFormat, UnsignedByteType); blank.needsUpdate = true;

const vertex = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */`
  precision highp float;
  uniform sampler2D tTerrain;   // شناسه‌ی زمین هر خانه‌ی این چانک (+۱ حاشیه)
  uniform vec2 origin;          // مختصات خانه‌ی گوشه‌ی بافت
  uniform float texSize;
  uniform float seed;
  uniform sampler2D tGrass, tDry, tRock, tMarsh, tCracked, tLava, tStone, tGold, tChasm;
  uniform float hasTex[9];
  uniform float texScale;
  varying vec3 vWorld;

  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm2(vec2 p) { return vnoise(p) * 0.65 + vnoise(p * 2.13 + 7.7) * 0.35; }
  float fbm3(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.07 + 3.1) * 0.3 + vnoise(p * 4.3 + 9.2) * 0.15; }
  // نقاشی با بافت مرجع: سه نمونه با مقیاس/چرخش متفاوت با نویز آمیخته می‌شوند تا تقارن تکرار آینه‌ای دیده نشود
  vec3 paint(sampler2D t, vec2 s) {
    vec2 u1 = s * texScale;
    vec2 u2 = vec2(-s.y, s.x) * texScale * 0.71 + 0.37;
    vec2 u3 = (s + vec2(13.0, 7.0)) * texScale * 1.37;
    vec3 a = texture2D(t, u1).rgb, b = texture2D(t, u2).rgb, c = texture2D(t, u3).rgb;
    float n1 = fbm2(s * 0.15 + 5.0), n2 = fbm2(s * 0.09 + 41.0);
    vec3 m = mix(mix(a, b, smoothstep(0.3, 0.7, n1)), c, smoothstep(0.35, 0.75, n2));
    return m * (0.86 + 0.28 * fbm3(s * 0.3));
  }
  float idAt(vec2 tile) { vec2 uv = (tile - origin + 0.5) / texSize; return floor(texture2D(tTerrain, uv).r * 255.0 + 0.5); }

  // رنگ هر نوع زمین در نقطه‌ی p (مختصات جهان)
  vec3 terrainColor(float id, vec2 p, vec2 q) {
    vec2 s = p + seed;
    if (id < 1.5) { // چمن (امن/دشت)
      if (id < 0.5 && hasTex[0] > 0.5) return paint(tGrass, s);
      if (id > 0.5 && hasTex[1] > 0.5) return paint(tDry, s);
      float big = fbm3(s * 0.27) * 0.7 + fbm2(s * 1.1 + 33.0) * 0.3;
      vec3 dark = vec3(0.33, 0.50, 0.20), light = vec3(0.60, 0.74, 0.34);
      if (id < 0.5) { dark = vec3(0.39, 0.55, 0.23); light = vec3(0.65, 0.77, 0.37); }
      vec3 c = mix(dark, light, big);
      float blade = vnoise(s * 7.0) * 0.5 + vnoise(s * 13.0 + 2.0) * 0.5;
      c *= 0.88 + 0.24 * blade;
      float dirt = fbm2(s * 0.11 + 19.0);
      vec3 soil = vec3(0.60, 0.48, 0.30) * (0.85 + 0.3 * vnoise(s * 5.0));
      c = mix(c, soil, smoothstep(0.66, 0.78, dirt));
      float clump = smoothstep(0.62, 0.9, vnoise(s * 1.7 + 5.0));
      c = mix(c, dark * 0.85, clump * 0.35);
      return c;
    }
    if (id < 2.5) { // کوهستان: صخره‌ی سرد آبی-خاکستری با برف و ترک (مرجع ۷)
      if (hasTex[2] > 0.5) return paint(tRock, s);
      float big = fbm3(s * 0.4);
      float mid = fbm3(s * 1.3 + 15.0);
      vec3 c = mix(vec3(0.20, 0.23, 0.29), vec3(0.50, 0.54, 0.60), big * 0.6 + mid * 0.4);
      float crack = abs(vnoise(s * 2.1 + 2.0) - 0.5) + 0.35 * abs(vnoise(s * 4.7 + 5.0) - 0.5);
      c *= 0.78 + 0.26 * smoothstep(0.02, 0.16, crack);
      c *= 0.9 + 0.2 * vnoise(s * 11.0);
      float snow = smoothstep(0.62, 0.8, fbm2(s * 0.35 + 40.0)) * smoothstep(0.3, 0.7, vnoise(s * 3.0 + 9.0));
      c = mix(c, vec3(0.78, 0.84, 0.92), snow * 0.8);
      float mist = smoothstep(0.7, 0.95, fbm2(s * 0.12 + 77.0));
      return mix(c, vec3(0.55, 0.62, 0.72), mist * 0.35);
    }
    if (id < 3.5) { // مرداب: گل تیره‌ی آبی-بنفش، برکه‌های فیروزه‌ای، گیاه گلگون (مرجع ۸)
      if (hasTex[3] > 0.5) return paint(tMarsh, s);
      float big = fbm3(s * 0.5);
      vec3 c = mix(vec3(0.10, 0.12, 0.19), vec3(0.22, 0.25, 0.32), big);
      float pool = fbm2(s * 0.55 + 23.0);
      float pm = smoothstep(0.58, 0.68, pool);
      c = mix(c, vec3(0.09, 0.26, 0.28) * (0.8 + 0.4 * vnoise(s * 4.0)), pm);
      float glow = smoothstep(0.8, 0.93, vnoise(s * 3.2 + 8.0)) * smoothstep(0.5, 0.75, fbm2(s * 0.4 + 12.0)) * (1.0 - pm);
      c = mix(c, vec3(0.55, 0.20, 0.30), glow * 0.55);
      float moss = smoothstep(0.66, 0.8, fbm2(s * 0.8 + 50.0)) * (1.0 - pm);
      c = mix(c, vec3(0.24, 0.36, 0.22), moss * 0.6);
      c *= 0.9 + 0.2 * vnoise(s * 8.0);
      return c;
    }
    if (id < 4.5) { // سرزمین خطر: زمین خاکستری-آبی ترک‌خورده با رگه‌های سرخ گداخته (مرجع ۱۰)
      if (hasTex[4] > 0.5) return paint(tCracked, s);
      float big = fbm3(s * 0.4);
      vec3 c = mix(vec3(0.17, 0.18, 0.23), vec3(0.40, 0.41, 0.46), big);
      float crack = abs(vnoise(s * 1.9 + 3.0) - 0.5) + 0.3 * abs(vnoise(s * 4.1 + 6.0) - 0.5);
      c *= 0.7 + 0.4 * smoothstep(0.012, 0.11, crack);
      float vein = smoothstep(0.022, 0.0, abs(vnoise(s * 1.1 + 11.0) - 0.5)) * smoothstep(0.45, 0.7, fbm2(s * 0.3 + 4.0));
      c = mix(c, vec3(1.0, 0.16, 0.08), vein * 0.9);
      float ember = smoothstep(0.88, 0.97, vnoise(s * 6.0 + 27.0)) * smoothstep(0.5, 0.75, fbm2(s * 0.35 + 9.0));
      c += vec3(0.9, 0.2, 0.08) * ember * 0.6;
      float ash = smoothstep(0.7, 0.85, fbm2(s * 0.2 + 51.0));
      c = mix(c, vec3(0.30, 0.28, 0.30), ash * 0.7);
      c *= 0.9 + 0.2 * vnoise(s * 9.0);
      return c;
    }
    if (id < 5.5) { // جهنمی: سنگ سیاه با رودهای گدازه و شعله‌ی بنفش (مرجع ۹)
      if (hasTex[5] > 0.5) return paint(tLava, s);
      float big = fbm3(s * 0.5);
      vec3 c = mix(vec3(0.05, 0.04, 0.06), vec3(0.20, 0.14, 0.16), big);
      float river = smoothstep(0.05, 0.0, abs(vnoise(s * 0.9 + 11.0) - 0.5)) * smoothstep(0.4, 0.7, fbm2(s * 0.4 + 4.0));
      float vein = smoothstep(0.02, 0.0, abs(vnoise(s * 2.4 + 13.0) - 0.5)) * smoothstep(0.5, 0.75, fbm2(s * 0.5 + 6.0));
      float lava = max(river, vein * 0.8);
      c = mix(c, vec3(1.0, 0.45, 0.10), lava);
      c += vec3(1.0, 0.3, 0.05) * river * 0.4;
      float purple = smoothstep(0.84, 0.96, fbm2(s * 0.3 + 31.0)) * (1.0 - lava);
      c = mix(c, vec3(0.40, 0.14, 0.62), purple * 0.5);
      float ember = smoothstep(0.9, 0.98, vnoise(s * 7.0 + 27.0));
      c += vec3(1.0, 0.35, 0.08) * ember * 0.5;
      return c;
    }
    if (id < 6.5) { // مقبره: سنگفرش تیره‌ی ویرانه با رون‌های فیروزه‌ای (مرجع ۶)
      if (hasTex[6] > 0.5) return paint(tStone, s);
      vec2 g = fract(q * 2.0); float line = smoothstep(0.0, 0.07, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
      vec3 c = mix(vec3(0.18, 0.19, 0.23), vec3(0.34, 0.35, 0.40), vnoise(s * 3.0));
      float rune = smoothstep(0.03, 0.0, abs(vnoise(s * 3.5 + 5.0) - 0.5)) * smoothstep(0.5, 0.7, vnoise(s * 0.8));
      c = mix(c * (0.7 + 0.3 * line), vec3(0.2, 0.9, 0.8), rune * 0.8);
      return c;
    }
    if (id < 7.5) { // خانه‌ی گنج: سنگفرش طلایی
      if (hasTex[7] > 0.5) return paint(tGold, s);
      vec2 g = fract(q * 3.0); float line = smoothstep(0.0, 0.08, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
      vec3 c = mix(vec3(0.72, 0.58, 0.30), vec3(0.88, 0.76, 0.44), vnoise(s * 3.0));
      return c * (0.7 + 0.3 * line);
    }
    // دره: صخره‌ی تیره‌ی لبه (عمق در بیرون اعمال می‌شود)
    if (hasTex[8] > 0.5) return paint(tChasm, s);
    float big = fbm3(s * 0.6);
    vec3 c = mix(vec3(0.22, 0.18, 0.16), vec3(0.36, 0.30, 0.26), big);
    float crack = abs(vnoise(s * 2.4) - 0.5);
    return c * (0.7 + 0.4 * smoothstep(0.01, 0.1, crack));
  }

  void main() {
    vec2 p = vWorld.xz;
    // مرز موج‌دار: نقطه‌ی نمونه‌برداری با نویز جابجا می‌شود تا مرزها پله‌ای نباشند
    vec2 wob = vec2(fbm2(p * 0.9 + 17.0), fbm2(p * 0.9 + 61.0)) - 0.5;
    vec2 q = p + wob * 0.85;
    vec2 f = q - 0.5; vec2 t0 = floor(f); vec2 fr = f - t0; fr = fr * fr * (3.0 - 2.0 * fr);
    float w[4]; float ids[4];
    w[0] = (1.0 - fr.x) * (1.0 - fr.y); w[1] = fr.x * (1.0 - fr.y); w[2] = (1.0 - fr.x) * fr.y; w[3] = fr.x * fr.y;
    ids[0] = idAt(t0); ids[1] = idAt(t0 + vec2(1.0, 0.0)); ids[2] = idAt(t0 + vec2(0.0, 1.0)); ids[3] = idAt(t0 + vec2(1.0, 1.0));
    // مرز تیزتر بین زمین‌های ناهمگون (نه لکه‌ی محو)
    vec3 col = vec3(0.0); float valley = 0.0, wet = 0.0, wsum = 0.0;
    for (int i = 0; i < 4; i++) {
      float wi = w[i];
      if (wi < 0.015) continue;
      col += terrainColor(ids[i], p, q) * wi; wsum += wi;
      if (ids[i] > 7.5) valley += wi;
      if (ids[i] > 2.5 && ids[i] < 3.5) wet += wi;
    }
    col /= max(wsum, 0.001);
    // دره: هرچه به مرکز خانه‌های دره نزدیک‌تر، تاریک‌تر (پرتگاه)
    col = mix(col, vec3(0.05, 0.04, 0.04), smoothstep(0.3, 0.75, valley));
    col *= 1.0 + 0.35 * smoothstep(0.08, 0.3, valley) * (1.0 - smoothstep(0.3, 0.5, valley)); // لبه‌ی روشن پرتگاه
    // نور آسمانی ملایم و لکه‌های ابر خیلی کم‌بسامد
    col *= 0.93 + 0.14 * fbm2(p * 0.05 + 3.0);
    // جوّ حلقه‌ای (مرجع ۳): بیرون روشن و روزانه، به سمت مرکز تاریک و سرد با ته‌رنگ سرخ گداخته
    float dc = length(p - vec2(500.0));
    float dark = smoothstep(420.0, 150.0, dc);
    col *= 1.0 - 0.38 * dark;
    col = mix(col, col * vec3(1.08, 0.9, 0.85), dark * 0.6);
    // شبکه‌ی کاشی خیلی محو (سبک تراوین)
    vec2 g = fract(p); float edge = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
    float line = (1.0 - smoothstep(0.0, 0.05, edge)) * 0.07;
    float checker = mod(floor(p.x) + floor(p.y), 2.0) < 0.5 ? 0.015 : -0.015;
    col *= 1.0 - line + checker;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeGroundTexture(size: number, idAt: (i: number, j: number) => number): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const k = (j * size + i) * 4; data[k] = idAt(i, j); data[k + 1] = 0; data[k + 2] = 0; data[k + 3] = 255; }
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

export function makeGroundMaterial(tex: DataTexture, originX: number, originZ: number, size: number, seed: number, textures: GroundTextures = {}): ShaderMaterial {
  const names = ['tGrass', 'tDry', 'tRock', 'tMarsh', 'tCracked', 'tLava', 'tStone', 'tGold', 'tChasm'];
  const texUniforms: Record<string, { value: any }> = {};
  const hasTex: number[] = [];
  TEX_KEYS.forEach((k, i) => { const t = textures[k]; texUniforms[names[i]] = { value: t ?? blank }; hasTex.push(t ? 1 : 0); });
  return new ShaderMaterial({
    uniforms: { tTerrain: { value: tex }, origin: { value: new Vector2(originX, originZ) }, texSize: { value: size }, seed: { value: (seed % 1000) * 0.37 }, ...texUniforms, hasTex: { value: hasTex }, texScale: { value: 0.33 } },
    vertexShader: vertex, fragmentShader: fragment,
  });
}
