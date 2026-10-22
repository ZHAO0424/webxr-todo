import * as THREE from 'three';
import { SKY, HILLS, GLOW } from './palette.js';
import { is } from './season.js';
import { TPU, UNIT, makeRng, paint, toTexture, flat, pixelize } from './pixel.js';

// 4x4 Bayer 矩阵：有序抖动，用来做像素风的渐隐 / 雾
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y, t) => t > BAYER[(y % 4) * 4 + (x % 4)];

/**
 * 一层山：起伏山脊 + 朝西（左，夕阳方向）的坡面亮一档 + 山脊亮边 + 底部抖动渐隐。
 * ramp = [暗, 中, 亮]。
 */
function hillLayer({ w, h, seed, ramp, peak, rough, pagoda = false, trees = false, snow = null }) {
  const r = makeRng(seed);
  const waves = Array.from({ length: 4 }, (_, i) => ({ f: ((i + 1) * (0.5 + r()) * Math.PI * 2) / w, a: rough / (i + 1) ** 0.8, p: r() * 10 }));
  const ridge = (x) => {
    let y = h * (1 - peak);
    for (const wv of waves) y += Math.sin(x * wv.f + wv.p) * wv.a * h;
    return Math.max(2, Math.round(y));
  };
  return paint(w, h, (g) => {
    for (let x = 0; x < w; x++) {
      const top = ridge(x);
      const litSlope = ridge(x - 1) > top; // 往左下降 = 朝西的坡
      for (let y = top; y < h; y++) {
        const depth = y - top;
        g.px(x, y, snow && depth < (litSlope ? 5 : 3) + (x % 3 === 0 ? 1 : 0) ? snow : depth === 0 || (litSlope && depth < 6) ? ramp[2] : depth < 3 ? ramp[1] : ramp[0]); // 冬天：山脊上一层雪
      }
      if (trees && r() > 0.65) { g.rect(x, top - 2, 1, 2, ramp[0]); if (r() > 0.5) g.px(x, top - 3, ramp[0]); }
    }
    if (pagoda) { // 山顶小塔，剪影
      const px = Math.floor(w * 0.66);
      const base = ridge(px);
      for (let k = 0; k < 5; k++) {
        const yy = base - 3 - k * 3;
        g.rect(px - 3 + Math.floor(k / 2), yy, 7 - k, 3, ramp[0]);
        g.rect(px - 4 + Math.floor(k / 2), yy, 9 - k, 1, ramp[0]);
      }
      g.rect(px, base - 19, 1, 3, ramp[0]);
    }
  });
}

/** 山间的雾带：横向一条，上下都抖动渐隐。 */
function mistBand(w, h) {
  return paint(w, h, (g) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const top = Math.round(h * 0.35 + Math.sin(x * 0.04) * h * 0.15 + Math.sin(x * 0.11 + 2) * h * 0.08);
      const bottom = Math.round(h * 0.75 + Math.sin(x * 0.06 + 1) * h * 0.1);
      if (y < top - 1 || y > bottom + 1) continue;
      if ((y === top - 1 || y === bottom + 1) && (x + y) % 2) continue; // 只在上下边缘留一行棋盘格
      g.px(x, y, HILLS.mist);
    }
  });
}

/** 夕阳：实心圆盘 + 两圈台阶状光晕（像素版 bloom）。 */
function sunDisc() {
  const S = 40;
  return paint(S, S, (g) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2);
      if (d < 7) g.px(x, y, GLOW.sun);
      else if (d < 10) g.px(x, y, '#c87a4a');
      else if (d < 15 && dither(x, y, 0.5)) g.px(x, y, '#7a3e30');
      else if (d < 20 && dither(x, y, 0.2)) g.px(x, y, '#4a2428');
    }
  });
}

/** 月亮：圆盘 + 一圈淡淡的光晕；big：中秋的大圆月（金黄、更大）。 */
function moonDisc(big) {
  const S = 40, r = big ? 9 : 6;
  return paint(S, S, (g) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2);
      if (d < r) g.px(x, y, (x * 7 + y * 3) % 11 === 0 && d < r - 2 ? (big ? '#c8a050' : '#9aa0c0') : big ? '#ffe6a0' : '#dfe4f4'); // 几块暗斑
      else if (d < r + 4 && dither(x, y, 0.4)) g.px(x, y, big ? '#5a4628' : '#3a3e5a');
    }
  });
}

/** 桌面模式的天空：竖向硬色带（背景会拉伸到全屏，抖动会变条纹，所以不抖）。 */
export function skyTexture(bands = SKY) {
  const c = paint(1, bands.length, (g) => bands.forEach((b, y) => g.px(0, y, b)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
}

/**
 * 远景：夕阳 + 三层山 + 雾带，都是平面剪影，前后错开，靠双眼视差出纵深。
 * 越远越接近天色（大气透视）——替代了景深模糊，XR 里眼睛自己对焦，不该再糊。
 *
 * 摆放按标准视点（XR 里头在沙盘中心前 dist、上方 height）计算：
 * 每层山脚压在"视线擦过沙盘后沿"那条线以下（藏在沙盘后面），山脊高出 rise 弧度；
 * 每层的像素按距离放大，所有层的像素在视角上和沙盘一样大。
 */
export function buildBackdrop({ dist = 1.05, height = 0.38, back = 0.33 } = {}) {
  const g = new THREE.Group();
  const pxAngle = 0.0012; // 远景像素比沙盘里的粗一些（约 2 倍），像画出来的背景板

  const place = (z, makeCanvas, { rise, below = 0.3, peak = 0.7, widthAngle = 1.3 }) => {
    const range = dist - z;
    const hidden = height - (height * range) / (dist + back);
    const mpp = range * pxAngle;
    const hM = (range * rise + range * below) / peak;
    const w = Math.round((range * widthAngle) / mpp);
    const h = Math.round(hM / mpp);
    const tex = toTexture(makeCanvas(w, h, peak));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w * mpp, h * mpp), flat(tex, { alphaTest: 0.5 }));
    plane.position.set(0, hidden - range * below + (h * mpp) / 2, z);
    g.add(plane);
    return plane;
  };

  // 夕阳在西（左），被最远的山挡住一点
  const sunTex = toTexture(sunDisc());
  const sunRange = dist + 2.4;
  const sunSize = 40 * sunRange * pxAngle;
  const sunMat = pixelize(new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(sunSize, sunSize), sunMat);
  sun.position.set(-0.7, 0.0, -2.4);
  g.add(sun);

  // 月亮在东边（右），天黑了才出来；中秋是一轮又大又黄的圆月
  const moonMat = pixelize(new THREE.MeshBasicMaterial({ map: toTexture(moonDisc(is('autumn'))), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  const moonSize = sunSize * (is('autumn') ? 1.7 : 1.1); // 中秋的月亮格外大
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(moonSize, moonSize), moonMat);
  moon.position.set(0.7, 0.02, -2.4);
  g.add(moon);

  place(-1.9, (w, h, peak) => hillLayer({ w, h, peak, seed: 23, ramp: HILLS.far, rough: 0.16, snow: is('winter') ? '#d8c8d8' : null }), { rise: 0.17 });
  place(-1.35, (w, h) => mistBand(w, h), { rise: 0.03, below: 0.03, peak: 0.6, widthAngle: 1.4 });
  place(-1.0, (w, h, peak) => hillLayer({ w, h, peak, seed: 11, ramp: HILLS.mid, rough: 0.14, pagoda: true, snow: is('winter') ? '#b4a6c4' : null }), { rise: 0.1 });
  place(-0.45, (w, h, peak) => hillLayer({ w, h, peak, seed: 3, ramp: HILLS.near, rough: 0.1, trees: true, snow: is('winter') ? '#86829e' : null }), { rise: 0.04 });

  return {
    object: g,
    update(t, night = 0) { // 天黑了太阳隐去、月亮出来
      moonMat.opacity = Math.max(0, night - 0.3) / 0.7; moon.visible = night > 0.3;
      sunMat.opacity = Math.max(0, 1 - night * 1.4); sun.visible = sunMat.opacity > 0;
    },
  };
}
