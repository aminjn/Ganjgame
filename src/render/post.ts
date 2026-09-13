// پس‌پردازش سبک: بلوم با آستانه‌ی بالا، وینیت ملایم، گرید رنگ گرم.
import { WebGLRenderer, Scene, Camera, Vector2, WebGLRenderTarget, HalfFloatType } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.16 }, warmth: { value: 0.03 }, saturation: { value: 1.18 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float warmth; uniform float saturation; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // گرید گرم: کمی قرمز/زرد بیشتر، کمی آبی کمتر؛ کنتراست خیلی ملایم
      c.rgb *= vec3(1.0 + warmth, 1.0 + warmth * 0.45, 1.0 - warmth * 0.6);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * 1.05 + 0.5;
      vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * vignette * 2.2;
      c.rgb *= clamp(v, 0.0, 1.0);
      gl_FragColor = c;
    }`,
};

export function makeComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number, mobile: boolean) {
  // MSAA روی هدف رندر (WebGL2) تا لبه‌های low-poly دندانه‌دار نباشند
  const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: mobile ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(Math.floor(w / 2), Math.floor(h / 2)), mobile ? 0.22 : 0.28, 0.4, 0.9);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return { composer, bloom, grade };
}
