import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 录片模式的后处理（只在 film.html 里用；XR 不能用 EffectComposer，主页面的像素化、调色都在材质里做）。
// 顺序：场景 → 移轴（横、竖两遍）→ 光晕 → 调色 + 暗角 → 颗粒 → 输出（sRGB）。

const quad = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** 移轴：离焦点那一行越远越糊，中间一条带完全清楚（像《The Sandpit》的后期移轴）。分横竖两遍做高斯。 */
const TiltShift = {
  uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, texel: { value: new THREE.Vector2() }, center: { value: 0.5 }, band: { value: 0.12 }, maxBlur: { value: 6 } },
  vertexShader: quad,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 dir, texel; uniform float center, band, maxBlur;
    varying vec2 vUv;
    void main() {
      float d = max(0.0, abs(vUv.y - center) - band) / max(0.05, 0.5 - band);
      float r = clamp(d, 0.0, 1.0); r = r * r * maxBlur; // 像素
      if (r < 0.35) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 acc = vec4(0.0); float ws = 0.0;
      for (int i = -6; i <= 6; i++) {
        float t = float(i) / 6.0, w = exp(-t * t * 2.5);
        acc += texture2D(tDiffuse, vUv + dir * texel * t * r) * w; ws += w;
      }
      gl_FragColor = acc / ws;
    }`,
};

/** 调色 + 暗角（线性空间）：暗部偏紫、亮部偏暖，和 palette.js 的色阶一个方向；轻微提饱和、加一点对比。 */
const Grade = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.08 }, contrast: { value: 1.06 }, shadow: { value: new THREE.Color('#1a0c2a') }, warm: { value: new THREE.Color('#fff0dc') }, vignette: { value: 0.32 }, aspect: { value: 16 / 9 } },
  vertexShader: quad,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float sat, contrast, vignette, aspect; uniform vec3 shadow, warm;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = max(vec3(0.0), (c - 0.18) * contrast + 0.18);
      c += shadow * (1.0 - smoothstep(0.0, 0.2, l)) * 0.35;
      c *= mix(vec3(1.0), warm, smoothstep(0.25, 1.0, l));
      vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) / max(aspect, 1.0);
      c *= 1.0 - vignette * smoothstep(0.25, 0.75, length(p) * 1.4);
      gl_FragColor = vec4(c, src.a);
    }`,
};

export function createPost(renderer, scene, camera, W, H) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }); // composer 的缓冲不吃 antialias，自己给 MSAA
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const tiltH = new ShaderPass(TiltShift), tiltV = new ShaderPass(TiltShift);
  tiltV.uniforms.dir.value.set(0, 1);
  for (const p of [tiltH, tiltV]) { p.uniforms.texel.value.set(1 / W, 1 / H); composer.addPass(p); }
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.5, 0.8);
  composer.addPass(bloom);
  const grade = new ShaderPass(Grade);
  grade.uniforms.aspect.value = W / H;
  composer.addPass(grade);
  const film = new FilmPass(0.12, false);
  composer.addPass(film);
  composer.addPass(new OutputPass());

  const scale = H / 1080; // 糊的程度按 1080p 定，换分辨率看起来一样
  return {
    composer,
    /** 每帧：焦点那一行（0 底 … 1 顶）、糊的程度（1080p 下的像素）、夜色（光晕跟着夜色变强）。 */
    set({ center = 0.5, band = 0.12, blur = 6, night = 0 }) {
      for (const { uniforms: u } of [tiltH, tiltV]) { u.center.value = center; u.band.value = band; u.maxBlur.value = blur * scale; }
      bloom.strength = 0.12 + 0.55 * night;
    },
    render(dt) { composer.render(dt); },
  };
}
