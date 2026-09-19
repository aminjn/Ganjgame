// پس‌پردازش: خط دور تیره بر پایه‌ی عمق (خوانایی اشیا در اندازه‌ی کوچک)، FXAA، بلوم ملایم، اشباع/وینیت.
import { WebGLRenderer, Scene, Camera, Vector2, WebGLRenderTarget, HalfFloatType, DepthTexture, PerspectiveCamera } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderMaterial, UniformsUtils } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const OutlineShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, resolution: { value: new Vector2(1, 1) }, cameraNear: { value: 1 }, cameraFar: { value: 100 }, strength: { value: 0.75 }, thickness: { value: 1.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 resolution; uniform float cameraNear; uniform float cameraFar; uniform float strength; uniform float thickness;
    varying vec2 vUv;
    float lin(float z){ float n = cameraNear, f = cameraFar; float zn = z * 2.0 - 1.0; return (2.0 * n * f) / (f + n - zn * (f - n)); }
    float d(vec2 o){ return lin(texture2D(tDepth, vUv + o * thickness / resolution).x); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float c0 = d(vec2(0.0));
      float dx = max(abs(d(vec2(1.0,0.0)) - c0), abs(d(vec2(-1.0,0.0)) - c0));
      float dy = max(abs(d(vec2(0.0,1.0)) - c0), abs(d(vec2(0.0,-1.0)) - c0));
      float e = max(dx, dy) / max(c0 * 0.012, 0.02);   // ناپیوستگی نسبی عمق = سیلوئت
      float edge = smoothstep(0.8, 2.5, e) * strength;
      c.rgb = mix(c.rgb, c.rgb * 0.22, edge);
      gl_FragColor = c;
    }`,
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.22 }, warmth: { value: 0.05 }, saturation: { value: 1.04 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float warmth; uniform float saturation; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= vec3(1.0 + warmth, 1.0 + warmth * 0.45, 1.0 - warmth * 0.6);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * 1.05 + 0.5;
      vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * vignette * 2.2;
      c.rgb *= clamp(v, 0.0, 1.0);
      gl_FragColor = c;
    }`,
};

// صحنه را در هدف خصوصی (با بافت عمق) رندر می‌کند و همان‌جا خط دور را روی رنگ می‌کشد؛ هدف‌های composer به عمق دست نمی‌زنند.
class OutlineRenderPass extends Pass {
  rt: WebGLRenderTarget; mat: ShaderMaterial; quad: FullScreenQuad;
  constructor(private scene: Scene, private camera: Camera, w: number, h: number) {
    super();
    this.rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, depthTexture: new DepthTexture(w, h) });
    this.mat = new ShaderMaterial({ uniforms: UniformsUtils.clone(OutlineShader.uniforms), vertexShader: OutlineShader.vertexShader, fragmentShader: OutlineShader.fragmentShader });
    this.mat.uniforms.tDepth.value = this.rt.depthTexture;
    this.quad = new FullScreenQuad(this.mat);
  }
  setSize(w: number, h: number) { this.rt.setSize(w, h); this.mat.uniforms.resolution.value.set(w, h); }
  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget) {
    const c = this.camera as PerspectiveCamera;
    this.mat.uniforms.cameraNear.value = c.near; this.mat.uniforms.cameraFar.value = c.far;
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(this.scene, this.camera);
    this.mat.uniforms.tDiffuse.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

export function makeComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number, mobile: boolean) {
  const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  const outline = new OutlineRenderPass(scene, camera, w, h);
  outline.mat.uniforms.thickness.value = mobile ? 0.8 : 1.0;
  composer.addPass(outline);
  const bloom = new UnrealBloomPass(new Vector2(Math.floor(w / 2), Math.floor(h / 2)), mobile ? 0.18 : 0.22, 0.4, 0.92);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  const setSize = (width: number, height: number) => {
    composer.setSize(width, height);
    const pr = renderer.getPixelRatio();
    outline.setSize(width * pr, height * pr);
    fxaa.material.uniforms['resolution'].value.set(1 / (width * pr), 1 / (height * pr));
    bloom.resolution.set(Math.floor(width / 2), Math.floor(height / 2));
  };
  const update = () => { /* عمق و دوربین در خود پاس به‌روز می‌شود */ };
  return { composer, bloom, grade, outline, setSize, update };
}
