// زمین نقاشی‌گونه (اصلاحیه‌ی ۴): بافت رویه‌ای روی GPU — چمن با لکه و خاک، سنگ با ترک، مرداب با گل و برکه،
// سرزمین خطر خشک و ترک‌خورده، جهنم سوخته با رگه‌ی گداخته، دره‌ی عمیق. مرز زمین‌ها با نویز موج‌دار و نرم آمیخته می‌شود.
import { DataTexture, NearestFilter, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2 } from 'three';
import type { Terrain } from '../rules/constants';

export const TERRAIN_ID: Record<Terrain, number> = { safe: 0, plain: 1, mountain: 2, marsh: 3, danger: 4, hell: 5, tomb: 6, treasure: 7, valley: 8 };

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
  varying vec3 vWorld;

  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm2(vec2 p) { return vnoise(p) * 0.65 + vnoise(p * 2.13 + 7.7) * 0.35; }
  float fbm3(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.07 + 3.1) * 0.3 + vnoise(p * 4.3 + 9.2) * 0.15; }
  float idAt(vec2 tile) { vec2 uv = (tile - origin + 0.5) / texSize; return floor(texture2D(tTerrain, uv).r * 255.0 + 0.5); }

  // رنگ هر نوع زمین در نقطه‌ی p (مختصات جهان)
  vec3 terrainColor(float id, vec2 p, vec2 q) {
    vec2 s = p + seed;
    if (id < 1.5) { // چمن (امن/دشت)
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
    if (id < 2.5) { // کوهستان: سنگ با ترک و سنگریزه
      float big = fbm3(s * 0.4);
      float mid = fbm3(s * 1.3 + 15.0);
      vec3 c = mix(vec3(0.40, 0.38, 0.34), vec3(0.64, 0.61, 0.54), big * 0.6 + mid * 0.4);
      float crack = abs(vnoise(s * 2.1 + 2.0) - 0.5) + 0.35 * abs(vnoise(s * 4.7 + 5.0) - 0.5);
      c *= 0.82 + 0.22 * smoothstep(0.02, 0.16, crack);
      c *= 0.9 + 0.2 * vnoise(s * 11.0);
      float pebble = smoothstep(0.78, 0.92, vnoise(s * 6.0 + 21.0));
      c = mix(c, vec3(0.74, 0.71, 0.64), pebble * 0.6);
      float moss = smoothstep(0.7, 0.85, fbm2(s * 0.5 + 40.0));
      return mix(c, vec3(0.40, 0.50, 0.28), moss * 0.45);
    }
    if (id < 3.5) { // مرداب: گل تیره، لجن، برکه
      float big = fbm3(s * 0.5);
      vec3 c = mix(vec3(0.22, 0.27, 0.14), vec3(0.36, 0.42, 0.20), big);
      float pool = fbm2(s * 0.55 + 23.0);
      c = mix(c, vec3(0.16, 0.26, 0.24), smoothstep(0.58, 0.68, pool));
      float slime = vnoise(s * 1.6 + 8.0);
      c = mix(c, vec3(0.44, 0.56, 0.22), smoothstep(0.7, 0.85, slime) * 0.7);
      c *= 0.9 + 0.2 * vnoise(s * 8.0);
      return c;
    }
    if (id < 4.5) { // سرزمین خطر: خاک خشک ترک‌خورده
      float big = fbm3(s * 0.4);
      vec3 c = mix(vec3(0.48, 0.28, 0.20), vec3(0.70, 0.46, 0.30), big);
      float crack = abs(vnoise(s * 1.9 + 3.0) - 0.5) + 0.3 * abs(vnoise(s * 4.1 + 6.0) - 0.5);
      c *= 0.7 + 0.4 * smoothstep(0.012, 0.11, crack);
      float ash = smoothstep(0.68, 0.82, fbm2(s * 0.2 + 51.0));
      c = mix(c, vec3(0.35, 0.30, 0.28), ash);
      c *= 0.9 + 0.2 * vnoise(s * 9.0);
      return c;
    }
    if (id < 5.5) { // جهنمی: زمین سوخته با رگه‌ی گداخته
      float big = fbm3(s * 0.5);
      vec3 c = mix(vec3(0.16, 0.10, 0.09), vec3(0.32, 0.17, 0.14), big);
      float vein = smoothstep(0.02, 0.0, abs(vnoise(s * 1.6 + 11.0) - 0.5)) * smoothstep(0.55, 0.8, fbm2(s * 0.5 + 4.0));
      c += vec3(1.0, 0.42, 0.12) * vein * 0.55;
      float ember = smoothstep(0.86, 0.97, vnoise(s * 5.0 + 27.0)) * smoothstep(0.5, 0.75, fbm2(s * 0.4 + 9.0));
      c += vec3(1.0, 0.35, 0.08) * ember * 0.5;
      c *= 0.9 + 0.2 * vnoise(s * 9.0);
      return c;
    }
    if (id < 6.5) { // مقبره: سنگفرش بنفش-خاکستری
      vec2 g = fract(q * 2.0); float line = smoothstep(0.0, 0.07, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
      vec3 c = mix(vec3(0.42, 0.34, 0.46), vec3(0.58, 0.50, 0.62), vnoise(s * 3.0));
      return c * (0.7 + 0.3 * line);
    }
    if (id < 7.5) { // خانه‌ی گنج: سنگفرش طلایی
      vec2 g = fract(q * 3.0); float line = smoothstep(0.0, 0.08, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
      vec3 c = mix(vec3(0.72, 0.58, 0.30), vec3(0.88, 0.76, 0.44), vnoise(s * 3.0));
      return c * (0.7 + 0.3 * line);
    }
    // دره: صخره‌ی تیره‌ی لبه (عمق در بیرون اعمال می‌شود)
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
    col = mix(col, vec3(0.06, 0.045, 0.04), smoothstep(0.45, 1.0, valley));
    col *= 1.0 - 0.35 * smoothstep(0.05, 0.45, valley) * (1.0 - smoothstep(0.45, 1.0, valley));
    // نور آسمانی ملایم و لکه‌های ابر خیلی کم‌بسامد
    col *= 0.93 + 0.14 * fbm2(p * 0.05 + 3.0);
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

export function makeGroundMaterial(tex: DataTexture, originX: number, originZ: number, size: number, seed: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { tTerrain: { value: tex }, origin: { value: new Vector2(originX, originZ) }, texSize: { value: size }, seed: { value: (seed % 1000) * 0.37 } },
    vertexShader: vertex, fragmentShader: fragment,
  });
}
