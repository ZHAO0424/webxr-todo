// 龙舟鼓手 · 3D 层（《大神》式卡通着色 + 描金描边）
// 实体（龙舟、龙头、人、堤、亭、牌坊、柳、灯笼）都是真 3D：三档卡通明暗 + 阴影里的笔触排线 + 边缘光，
// 外面套一层"反向外壳"做描边。光学透视眼镜里黑 = 透明，所以描边用金 / 象牙色而不是墨黑（= 描金），
// 暗面也有亮度下限（uLift），不会整块消失。
// 只读游戏状态：index.html 每帧调 update(ctx)。坐标：沙盘局部（米）；船内部用毫米建模、整体缩放。

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2, clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- 材质 ----------
const SH = {
  light: { value: new V3(-0.45, 1.0, 0.55).normalize() },
  lift: { value: 0.32 },
  rim: { value: new THREE.Color(1.0, 0.86, 0.6) },
  time: { value: 0 },
  hero: { value: new V3(0, 0, 0) },   // 主角船的世界坐标（描边按距离衰减）
  dim: { value: 1 },                   // 场景整体亮度（标题 / 结算卡出现时压暗）
};
const TOON_VS = `
  attribute float aMask;
  varying vec3 vN, vW, vCol; varying vec2 vUv; varying float vMask;
  void main() {
    vec4 p = vec4(position, 1.0); vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * p;
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = uv; vMask = aMask;
    vCol = vec3(1.0);
    #ifdef USE_COLOR
      vCol = color;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vCol *= instanceColor;
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const TOON_FS = `
  uniform vec3 uTint, uLight, uRim; uniform float uLift, uEmit, uUseMap, uRimK, uSpec, uDim, uSat;
  uniform sampler2D uMap;
  varying vec3 vN, vW, vCol; varying vec2 vUv; varying float vMask;
  void main() {
    vec3 base = mix(vCol, vCol * uTint, vMask);
    if (uUseMap > 0.5) { vec4 t = texture2D(uMap, vUv); base = mix(base, t.rgb, t.a); }
    vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vW);
    float ndl = dot(n, uLight);
    // 三档：暗 / 中 / 亮，边界窄
    float band = smoothstep(-0.08, 0.02, ndl) * 0.55 + smoothstep(0.5, 0.58, ndl) * 0.45;
    // 暗面往冷色偏（青紫），亮面略暖：卡通画常用的冷暖对比
    vec3 shade = base * vec3(0.38, 0.4, 0.55);
    vec3 col = mix(shade, base * vec3(1.06, 1.0, 0.92), band);
    float l = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(l), col, uSat);   // 饱和度（默认提一点；对手降下来）
    // 阴影里的笔触排线（世界坐标斜线，像毛笔皴擦）
    float hatch = step(0.62, fract((vW.x * 0.8 + vW.y * 1.3 - vW.z * 0.5) * 1100.0)) * (1.0 - band);
    col *= 1.0 - hatch * 0.16;
    // 边缘光：轮廓一圈暖金
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    col += uRim * rim * uRimK * 0.5;
    // 漆面高光：半角向量的一道硬边金色高光（卡通式，不是写实光斑）
    vec3 hv = normalize(uLight + v); float sp = smoothstep(0.93, 0.95, dot(n, hv)) * uSpec;
    col += vec3(1.0, 0.9, 0.62) * sp * 0.7;
    col += base * uEmit;
    col = max(col, base * uLift) * uDim;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
function toon(o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color(...(o.tint || [1, 1, 1])) }, uLight: SH.light, uRim: SH.rim, uLift: SH.lift, uEmit: { value: o.emit || 0 }, uRimK: { value: o.rimK ?? 0.55 }, uSpec: { value: o.spec ?? 0 }, uSat: { value: o.sat ?? 1.18 }, uDim: SH.dim, uUseMap: { value: o.map ? 1 : 0 }, uMap: { value: o.map || null } },
    vertexShader: TOON_VS, fragmentShader: TOON_FS, vertexColors: o.vertexColors ?? true, side: o.side ?? THREE.FrontSide,
  });
}
// 描金描边：反向外壳，沿世界法线外扩固定宽度（米）
const OUTLINE_VS = `
  uniform float uW; uniform vec3 uHero; varying vec3 vC; varying float vFade;
  void main() {
    vC = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vC = instanceColor;
    #endif
    vec4 p = vec4(position, 1.0); vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * p;
    vec3 wn = normalize(mat3(modelMatrix) * n);
    // 笔意：描边宽度沿表面起伏（0.6–1.4 倍），像毛笔有轻有重
    float nz = sin(w.x * 900.0 + w.y * 1300.0) * 0.5 + sin(w.z * 1700.0 - w.x * 500.0) * 0.5;
    w.xyz += wn * uW * (1.0 + 0.4 * nz);
    // 离主角越远描边越暗（到四成），视线聚到你的船上
    vFade = mix(1.0, 0.4, smoothstep(0.05, 0.22, distance(w.xyz, uHero)));
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const OUTLINE_FS = `uniform vec3 uCol; uniform float uK, uDim; varying vec3 vC; varying float vFade; void main() { gl_FragColor = vec4(mix(uCol, vC * 1.25, uK) * vFade * uDim, 1.0);
  #include <colorspace_fragment>
}`;
function outlineMat(col = [1.0, 0.82, 0.45], w = 0.00035, k = 0) {
  return new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(...col) }, uW: { value: w }, uK: { value: k }, uHero: SH.hero, uDim: SH.dim }, vertexShader: OUTLINE_VS, fragmentShader: OUTLINE_FS, side: THREE.BackSide });
}

// ---------- 几何工具 ----------
// 所有参与合并的几何都要有 position / normal / uv / color / aMask，且都非索引
function prep(g, col = [1, 1, 1], mask = 0) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count, c = new Float32Array(n * 3), m = new Float32Array(n);
  for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; m[i] = mask; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('aMask', new THREE.Float32BufferAttribute(m, 1));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { g.applyMatrix4(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz))); return g; };
// 渐细管：沿控制点的平滑曲线，半径从 r0 到 r1（可传函数）
function taperTube(pts, r0, r1, segs = 16, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new V3(...p)));
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position, rf = typeof r0 === 'function' ? r0 : u => r0 + (r1 - r0) * u;
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs), r = rf(i / segs);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * r, c.y + (pos.getY(k) - c.y) * r, c.z + (pos.getZ(k) - c.z) * r); }
  }
  g.computeVertexNormals();
  return g;
}
const merge = list => mergeGeometries(list, false);

// ---------- 程序化贴图 ----------
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// 船身：透明底，舷边一道金带，两排金鳞，近水线一道浪纹（透明处露出船漆色）
// 船身纹样：透明底上画金线（透明处露出船漆色）。四条船各一种：鳞 / 浪 / 云 / 火（审查 #2-6、#2-7）
function hullTexFor(kind) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,205,95,1)'; g.fillRect(0, 0, w, 11); g.fillRect(0, 16, w, 2);       // 金舷带（窄）：船身要读成船漆色，金只做边（审查 #6-5）
    g.strokeStyle = 'rgba(255,212,120,0.6)'; g.lineWidth = 2;
    if (kind === 0) for (let row = 0; row < 3; row++) { const y = 50 + row * 26, off = (row % 2) * 15; for (let x = -30 + off; x < w + 30; x += 30) { g.beginPath(); g.arc(x, y, 15, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); } }
    if (kind === 1) for (let row = 0; row < 3; row++) { const y = 46 + row * 28; g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin(x * 0.06 + row) * 8); g.stroke(); for (let x = row * 20; x < w; x += 64) { g.beginPath(); g.arc(x, y - 4, 6, Math.PI, TAU * 0.95); g.stroke(); } }
    if (kind === 2) for (let x = 0; x < w; x += 84) for (const [dx, dy, r] of [[0, 70, 14], [20, 62, 10], [36, 72, 12]]) { g.beginPath(); g.arc(x + dx, dy, r, Math.PI * 0.9, Math.PI * 2.6); g.stroke(); }
    if (kind === 3) for (let x = 0; x < w; x += 36) { g.beginPath(); g.moveTo(x, 110); g.bezierCurveTo(x + 6, 80, x + 20, 70, x + 12, 40); g.bezierCurveTo(x + 26, 62, x + 30, 86, x + 26, 110); g.stroke(); }
    g.strokeStyle = 'rgba(255,240,200,0.55)'; g.lineWidth = 2;
    for (let x = 0; x < w; x += 56) { g.beginPath(); g.moveTo(x, 158); g.bezierCurveTo(x + 14, 140, x + 34, 140, x + 40, 154); g.bezierCurveTo(x + 34, 164, x + 25, 160, x + 27, 153); g.stroke(); }
    g.fillStyle = 'rgba(255,205,95,0.95)'; g.fillRect(0, 182, w, 5);
  });
}
// 鼓面：象牙底 + 朱红太极 / 圈纹
const drumTex = canvasTex(256, 256, (g, w) => {
  g.fillStyle = 'rgba(255,240,215,1)'; g.beginPath(); g.arc(128, 128, 126, 0, TAU); g.fill();
  g.strokeStyle = '#d8402a'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 100, 0, TAU); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 60, 0, TAU); g.stroke();
  g.fillStyle = '#d8402a'; for (let k = 0; k < 3; k++) { g.save(); g.translate(128, 128); g.rotate(k * TAU / 3); g.beginPath(); g.arc(0, -28, 22, 0, TAU); g.fill(); g.restore(); }
});
// 牌坊匾
function plaqueTex(text) {
  return canvasTex(512, 192, (g, w, h) => {
    g.fillStyle = '#c8321e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd27a'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
    g.lineWidth = 4; g.strokeRect(30, 30, w - 60, h - 60);
    g.fillStyle = '#ffe2a0'; g.font = '400 118px "STKaiti","KaiTi","Kaiti SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ffb040'; g.shadowBlur = 10; g.fillText(text, w / 2, h / 2 + 6);
  });
}
// 廊檐瓦：竖条瓦垄 + 一道檐口金边（水平平铺，随镜头滚动）
const tileTex = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,190,130,0.55)'; g.lineWidth = 3;
  for (let x = 4; x < w; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h - 12); g.stroke(); }
  g.fillStyle = 'rgba(255,214,120,1)'; g.fillRect(0, h - 10, w, 6);
});
// 石堤：砖缝（浅金线）
const wallTex = canvasTex(256, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,220,160,0.45)'; g.lineWidth = 2;
  for (let r = 0; r < 4; r++) { const y = r * 16; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (r % 2) * 16; x < w; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); } }
  g.fillStyle = 'rgba(255,214,120,0.9)'; g.fillRect(0, 0, w, 4);
  // 几道细裂纹 + 块面明暗（两档）
  g.strokeStyle = 'rgba(255,200,140,0.3)'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { const x = k * 43 + 9; g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 6, 30); g.lineTo(x + 2, 44); g.stroke(); }
  for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? 'rgba(255,230,190,0.07)' : 'rgba(0,0,0,0)'; g.fillRect(k * 32, 16 + (k % 3) * 16, 32, 16); }
});

// ---------- 色板（与 art.js 一致） ----------
const COL = {
  gold: [1.0, 0.72, 0.25], goldHi: [1.0, 0.84, 0.45], verm: [0.92, 0.16, 0.08], ivory: [1.0, 0.93, 0.78], skin: [1.0, 0.74, 0.52], hair: [0.32, 0.22, 0.2],
  qing: [0.12, 0.5, 0.95], lv: [0.15, 0.75, 0.38], zi: [0.58, 0.32, 0.92], stone: [0.42, 0.38, 0.4], wood: [0.72, 0.42, 0.22], willow: [0.45, 0.85, 0.3], white: [1, 1, 1],
};
export const TEAM3 = [
  { hull: COL.verm, cloth: [1.0, 0.96, 0.88], band: [0.95, 0.14, 0.08], outline: [1.0, 0.8, 0.4] },   // 主角船员白衣朱带（审查 #7-3）
  { hull: COL.qing, cloth: [0.92, 0.95, 1.0], band: [0.1, 0.45, 0.95], outline: [0.7, 0.88, 1.0] },
  { hull: COL.lv, cloth: [0.72, 1.0, 0.62], band: [0.1, 0.7, 0.35], outline: [0.85, 1.0, 0.6] },
  { hull: COL.zi, cloth: [1.0, 0.72, 0.9], band: [0.55, 0.25, 0.9], outline: [0.9, 0.8, 1.0] },
];

export function createWorld3D(parent, opts) {
  const { laneZ, raceLen, onSplash } = opts;
  const root = new THREE.Group(); parent.add(root);
  const S = 0.00135;                    // 船：毫米 → 米（船身 72 mm → 约 9.7 cm）
  const toonMats = [];
  const T = o => { const m = toon(o); toonMats.push(m); return m; };
  // 一个"网格 + 描边"对
  function pair(geo, mat, ol = outlineMat(), parentObj = root) {
    const m = new THREE.Mesh(geo, mat), o = new THREE.Mesh(geo, ol); m.add(o); parentObj.add(m); return m;
  }

  // ---------- 龙舟（静态部分合并成一个几何，四条船共用，船漆色走 uTint） ----------
  const hullGeo = (() => {
    const NX = 28, NT = 14, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NX; i++) {
      const x = -36 + i * 72 / NX, f = x / 36, w = 6.2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(f), 3.2)), 0.55) + 0.3, d = 3.6 * (1 - Math.pow(Math.abs(f), 2.4)) + 0.6, top = 4.2 + 2.2 * f * f;
      for (let j = 0; j <= NT; j++) { const th = Math.PI * j / NT; pos.push(x, top - d * Math.sin(th) - (1 - Math.sin(th)) * 0, w * Math.cos(th)); uv.push(i / NX * 3, j / NT); }
    }
    // 绕向：让法线朝船外（描边沿法线外扩）
    for (let i = 0; i < NX; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return prep(g, COL.white, 1);
  })();
  const deckGeo = prep(at(new THREE.PlaneGeometry(66, 9.6, 1, 1), 0, 4.1, 0, -Math.PI / 2), [0.3, 0.13, 0.07], 0);   // 深漆甲板：在眼镜里几乎透明，把人和金线推到前面
  // 舷边金栏：两侧各一条细管
  const railPts = s => { const p = []; for (let k = 0; k <= 12; k++) { const x = -35 + k * 70 / 12, f = x / 36; p.push([x, 4.25 + 2.2 * f * f, s * (6.2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(f), 3.2)), 0.55) + 0.3)]); } return p; };
  const rails = [-1, 1].map(s => prep(taperTube(railPts(s), 0.42, 0.42, 36, 5), COL.goldHi, 0));
  // 座板（横梁）
  const benches = []; for (let k = 0; k < 10; k++) benches.push(prep(at(new THREE.BoxGeometry(1.2, 0.5, 10.8), 18.5 - k * 5.3 - 1.2, 4.35, 0), COL.wood, 0));
  // 龙头：脖子（渐细管）、头骨（椭球）、吻部、上颚、鼻孔、眼、眉骨、角、鬃（火焰管）、牙
  const head = [];
  head.push(prep(taperTube([[33, 4.6, 0], [37, 8.5, 0], [40, 13.5, 0], [43.5, 16.2, 0]], u => 3.2 - 1.0 * u, 0, 18, 10), COL.white, 1));
  head.push(prep(at(new THREE.SphereGeometry(1, 16, 12), 45.2, 16.6, 0, 0, 0, -0.15, 4.4, 3.0, 3.0), COL.white, 1));
  head.push(prep(taperTube([[46, 16.4, 0], [49.5, 16.2, 0], [53.2, 15.5, 0]], u => 2.4 - 0.8 * u, 0, 10, 10), COL.white, 1));
  head.push(prep(at(new THREE.SphereGeometry(1, 10, 8), 53.4, 15.6, 0, 0, 0, 0, 1.5, 1.4, 1.8), COL.goldHi, 0));   // 鼻头
  for (const s of [-1, 1]) {
    head.push(prep(at(new THREE.SphereGeometry(1, 12, 10), 47.2, 17.8, s * 2.2, 0, 0, 0, 1.2, 1.2, 0.9), COL.ivory, 0));   // 眼白
    head.push(prep(at(new THREE.SphereGeometry(1, 8, 6), 47.9, 17.9, s * 2.75, 0, 0, 0, 0.6, 0.7, 0.4), COL.verm, 0));    // 朱瞳
    head.push(prep(taperTube([[44.6, 18.9, s * 2.4], [47, 19.9, s * 2.6], [49.4, 19.2, s * 2.3]], 0.75, 0.25, 10, 5), COL.goldHi, 0));   // 眉骨
    head.push(prep(taperTube([[44.2, 19.4, s * 1.4], [42.4, 22.8, s * 2.2], [39.6, 25.6, s * 2.8], [37, 26.4, s * 3.2]], 0.75, 0.12, 16, 6), COL.goldHi, 0));   // 角
    head.push(prep(taperTube([[41.5, 24.2, s * 2.6], [42.6, 26.6, s * 3.0], [44.2, 27.8, s * 3.2]], 0.5, 0.08, 8, 5), COL.goldHi, 0));    // 角分叉
    for (let q = 0; q < 4; q++) head.push(prep(taperTube([[42.6 - q * 1.1, 18.4 - q * 1.6, s * 1.6], [39.4 - q * 1.2, 20.6 - q * 1.5, s * (2.4 + q * 0.2)], [36 - q * 1.2, 20.4 - q * 1.2, s * 2.9], [33.6 - q, 22.4 - q * 1.2, s * 3.1]], 0.95, 0.05, 14, 5), q % 2 ? COL.white : COL.goldHi, q % 2 ? 1 : 0));   // 鬃
    for (let q = 0; q < 5; q++) head.push(prep(at(new THREE.ConeGeometry(0.42, 1.4, 5), 48.6 + q * 1.0, 14.0, s * (1.7 - q * 0.12), Math.PI), COL.ivory, 0));   // 上牙
  }
  // 龙背脊鳍：沿脖子一排金色三角
  for (let q = 0; q < 6; q++) { const u = q / 6; head.push(prep(at(new THREE.ConeGeometry(0.8, 2.6 - u, 4), 35 + u * 8, 8.4 + u * 9.5, 0, 0, 0, 0.6 - u * 0.4), COL.goldHi, 0)); }
  // 龙尾：三道卷火（渐细管，向上卷）
  const tail = [];
  for (let q = 0; q < 3; q++) tail.push(prep(taperTube([[-34, 5 + q * 0.4, (q - 1) * 1.6], [-38 - q, 9 + q, (q - 1) * 2.2], [-41 - q * 0.6, 14 + q * 1.2, (q - 1) * 2.4], [-39.4 - q * 0.4, 18.4 + q, (q - 1) * 2.2], [-36.8, 17.2 + q * 0.8, (q - 1) * 1.8]], 1.6 - q * 0.3, 0.06, 20, 6), q === 1 ? COL.goldHi : COL.white, q === 1 ? 0 : 1));
  // 鼓：鼓身（朱漆）+ 上下金箍 + 鼓钉
  const drum = [];
  drum.push(prep(at(new THREE.CylinderGeometry(3.2, 3.2, 4.6, 20, 1, true), 25.5, 6.9, 0), COL.verm, 0));
  drum.push(prep(at(new THREE.SphereGeometry(1, 20, 8, 0, TAU, Math.PI * 0.3, Math.PI * 0.4), 25.5, 6.9, 0, 0, 0, 0, 3.5, 3.6, 3.5), COL.verm, 0));
  for (const y of [4.7, 9.1]) drum.push(prep(at(new THREE.TorusGeometry(3.25, 0.32, 6, 24), 25.5, y, 0, Math.PI / 2), COL.goldHi, 0));
  for (let q = 0; q < 12; q++) { const a = q / 12 * TAU; drum.push(prep(at(new THREE.SphereGeometry(0.25, 5, 4), 25.5 + Math.cos(a) * 3.3, 8.6, Math.sin(a) * 3.3), COL.goldHi, 0)); }
  drum.push(prep(at(new THREE.CylinderGeometry(0.4, 0.5, 2.4, 6), 25.5, 3.4, 0), COL.wood, 0));
  // 舵手：站姿（简化）+ 斗笠 + 长舵桨
  const steer = [];
  steer.push(prep(at(new THREE.CylinderGeometry(1.0, 1.4, 6, 8), -31, 7.6, 0), COL.white, 1));
  steer.push(prep(at(new THREE.SphereGeometry(1.25, 10, 8), -31, 11.8, 0), COL.skin, 0));
  steer.push(prep(at(new THREE.ConeGeometry(3.6, 2.0, 16), -31, 13.6, 0), COL.gold, 0));
  steer.push(prep(taperTube([[-30, 10.4, 1.2], [-37, 3, 3.2], [-44, -4.2, 5.2]], 0.35, 0.35, 8, 5), COL.wood, 0));
  steer.push(prep(at(new THREE.SphereGeometry(1, 8, 6), -43.2, -3.2, 5, 0, 0, 0.8, 2.6, 0.6, 1.4), COL.white, 1));
  // 船头小旗杆 + 船尾三角令旗
  const bodyGeo = merge([hullGeo, deckGeo, ...rails, ...benches, ...head, ...tail, ...steer]);
  const drumGeo = merge(drum);   // 鼓单独一个网格：船身换成生成模型后鼓也还在（用户 11-16：鼓是平的）
  // 主角换上生成模型的龙头后，船身用不带程序龙头的这一份
  const bodyGeoNoHead = merge([hullGeo, deckGeo, ...rails, ...benches, ...tail, ...steer]);
  // 下颚（会张合）与鼓面（会闪），各自独立
  const jawGeo = merge([
    prep(taperTube([[0, 0, 0], [3.4, -0.6, 0], [6.8, -1.0, 0]], u => 1.9 - 0.9 * u, 0, 10, 8), COL.white, 1),
    ...[-1, 1].flatMap(s => [0, 1, 2, 3].map(q => prep(at(new THREE.ConeGeometry(0.36, 1.2, 5), 2.2 + q * 1.1, 0.9, s * (1.2 - q * 0.12)), COL.ivory, 0))),
  ]);
  const whiskerGeo = prep(taperTube([[0, 0, 0], [3, 1.4, 0.4], [6, 0.6, 1.0], [7.4, -1.6, 1.2], [6.4, -3.0, 1.0]], 0.4, 0.05, 20, 4), COL.goldHi, 0);
  const drumHeadGeo = prep(at(new THREE.CircleGeometry(3.15, 24), 0, 0, 0, -Math.PI / 2), COL.white, 0);

  const boats = TEAM3.map((tm, i) => {
    const g = new THREE.Group(); g.scale.setScalar(S); root.add(g);
    // 审查 #3：主角要一眼认出——你的船描边更粗更亮；对手船漆降饱和、降一档亮度
    const hero = i === 0, dull = c => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return c.map(v => (v * 0.6 + l * 0.4) * 0.8); };   // 对手：饱和度 ×0.6、亮度 ×0.8
    const bodyMat = T({ tint: hero ? tm.hull : dull(tm.hull), map: hullTexFor(i), rimK: hero ? 1.6 : 0.3, emit: hero ? 0.06 : 0, spec: hero ? 1 : 0.35 });
    const body = pair(bodyGeo, bodyMat, outlineMat(hero ? [1.0, 0.86, 0.5] : tm.outline.map(v => v * 0.6), hero ? 0.00038 : 0.00016), g);
    const jaw = new THREE.Group(); jaw.position.set(46.6, 14.4, 0); g.add(jaw);
    pair(jawGeo, bodyMat, outlineMat(tm.outline, 0.0003), jaw);
    const whiskers = [-1, 1].map(s => { const w = new THREE.Group(); w.position.set(52.6, 15.2, s * 1.6); w.scale.z = s; g.add(w); pair(whiskerGeo, T({ rimK: 0.4 }), outlineMat(tm.outline, 0.00022), w); return w; });
    const headMat = T({ map: drumTex, emit: 0 });
    const drumHead = pair(drumHeadGeo, headMat, outlineMat([1, 0.85, 0.5], 0.0002), g); drumHead.position.set(25.5, 9.25, 0);
    pair(drumGeo, T({ rimK: hero ? 0.9 : 0.3, spec: hero ? 0.7 : 0.2, tint: hero ? [1, 1, 1] : [0.7, 0.7, 0.7] }), outlineMat(hero ? [1.0, 0.86, 0.5] : [0.6, 0.55, 0.5], hero ? 0.00026 : 0.00014), g);   // 立体鼓：朱漆鼓身 + 金箍 + 鼓钉 + 鼓架
    // 船尾令旗：金杆 + 三角旗（船漆色，描金边），随风摆——四条船各有队旗，主角更大
    const banner = new THREE.Group(); banner.position.set(-35, 6, 0); banner.scale.setScalar(hero ? 0.8 : 0.6); g.add(banner);   // 对手旗杆短：不戳进前一条车道
    pair(prep(new THREE.CylinderGeometry(0.35, 0.4, 22, 6).translate(0, 11, 0), COL.goldHi), T({ rimK: 0.5 }), outlineMat([1, 0.88, 0.55], 0.0002), banner);
    const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(-11 * (hero ? 1.25 : 1), -3.2); tri.lineTo(0, -7 * (hero ? 1.2 : 1)); tri.lineTo(0, 0);
    const cloth = new THREE.Group(); cloth.position.set(0, 21.5, 0); banner.add(cloth);
    pair(prep(new THREE.ShapeGeometry(tri), COL.white, 1), T({ tint: hero ? tm.hull : dull(tm.hull), side: THREE.DoubleSide, rimK: 0.4, emit: hero ? 0.15 : 0 }), outlineMat(hero ? [1, 0.86, 0.5] : tm.outline, 0.00022), cloth);
    return { g, body, jaw, whiskers, headMat, bodyMat, drumHead, tips: [], cloth, headModel: null };
  });

  // ---------- 人：实例化部件（桨手、鼓手、观众共用） ----------
  const MAXSEG = 2000, MAXSPH = 1300, MAXTOR = 200, MAXCONE = 600;
  const segGeo = prep(new THREE.CylinderGeometry(1, 1, 1, 7, 1).translate(0, 0.5, 0)); // 单位圆柱，底在原点、沿 +y
  const sphGeo = prep(new THREE.SphereGeometry(1, 10, 8));
  const torGeo = prep(new THREE.TorusGeometry(1, 0.22, 5, 14).rotateX(Math.PI / 2));
  const coneGeo = prep(new THREE.CylinderGeometry(0.55, 1, 1, 8, 1).translate(0, 0.5, 0));   // 袍子：上窄下宽
  function inst(geo, max, olW) {
    // 人身上的描边取衣服颜色调亮（不是一律金色），不然一群人糊成一片金
    const m = new THREE.InstancedMesh(geo, T({ rimK: 0.5 }), max), o = new THREE.InstancedMesh(geo, outlineMat([1.0, 0.82, 0.45], olW, 0.35), max);   // 人物描边偏金，和船体的描金一致
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); o.instanceMatrix = m.instanceMatrix; m.frustumCulled = o.frustumCulled = false;
    m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); o.instanceColor = m.instanceColor;
    root.add(m, o); return { m, o, n: 0, max };
  }
  const SEG = inst(segGeo, MAXSEG, 0.00015), SPH = inst(sphGeo, MAXSPH, 0.00016), TOR = inst(torGeo, MAXTOR, 0.0001), CONE = inst(coneGeo, MAXCONE, 0.00016);   // 审查 #5-4：人物描边细，船体轮廓粗
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _a = new V3(), _b = new V3(), _d = new V3(), _c = new THREE.Color(), UP = new V3(0, 1, 0);
  // 从 a 到 b 的一段圆柱（半径 r，单位米，沙盘坐标）
  function seg(a, b, r, col) {
    if (SEG.n >= SEG.max) return; _d.subVectors(b, a); const len = _d.length(); if (len < 1e-6) return;
    _q.setFromUnitVectors(UP, _d.multiplyScalar(1 / len)); _m.compose(a, _q, _s.set(r, len, r));
    SEG.m.setMatrixAt(SEG.n, _m); SEG.m.setColorAt(SEG.n++, _c.setRGB(col[0], col[1], col[2]));
  }
  function sph(p, sx, sy, sz, col, q = null) {
    if (SPH.n >= SPH.max) return; _m.compose(p, q || _q.identity(), _s.set(sx, sy, sz));
    SPH.m.setMatrixAt(SPH.n, _m); SPH.m.setColorAt(SPH.n++, _c.setRGB(col[0], col[1], col[2]));
  }
  function tor(p, r, col, q = null) { if (TOR.n >= TOR.max) return; _m.compose(p, q || _q.identity(), _s.set(r, r, r)); TOR.m.setMatrixAt(TOR.n, _m); TOR.m.setColorAt(TOR.n++, _c.setRGB(col[0], col[1], col[2])); }
  function cone(p, r, h, col, q = null) { if (CONE.n >= CONE.max) return; _m.compose(p, q || _q.identity(), _s.set(r, h, r)); CONE.m.setMatrixAt(CONE.n, _m); CONE.m.setColorAt(CONE.n++, _c.setRGB(col[0], col[1], col[2])); }
  // 船内毫米坐标 → 沙盘坐标
  const bp = (g, x, y, z, out = new V3()) => out.set(x, y, z).applyMatrix4(g.matrix);

  // ---------- 桨手 ----------
  const prevTh = TEAM3.map(() => new Float32Array(10).fill(0.85));
  const dimTeam = (tm, i) => i === 0 ? tm : { ...tm, cloth: tm.band.map(v => v * 0.5 + 0.06), band: tm.band.map(v => v * 0.35) };   // 对手船员穿队色、约 0.45 亮度（审查 #10-3：只有你的船员是白衣）
  function rowers(ctx, b, i, bo) {
    const g = bo.g, tm = dimTeam(TEAM3[i], i);
    b.crew.r.forEach((r, j) => {
      const th = r.th; let phi, lift;
      if (th < 0.35) { const u = th / 0.35; phi = 45 - 70 * (u * u * (3 - 2 * u)); lift = 0; }
      else { const u = (th - 0.35) / 0.65; phi = -25 + 70 * (u * u * (3 - 2 * u)); lift = Math.sin(Math.PI * u) * 3; }
      const pr = phi * Math.PI / 180, sn = Math.sin(pr), cs = Math.cos(pr);
      const side = j % 2 ? 1 : -1, ru = 18.5 - j * 5.3, sz = side * 2.6;          // 左右交错坐（两排）
      const lean = pr * 0.62, sl = Math.sin(lean), cl = Math.cos(lean), U = (d, z2 = sz, dx = 0) => bp(g, ru + sl * d + dx * cl, 5.0 + cl * d - dx * sl, z2);
      const hip = U(0), sh = U(5.0);
      seg(hip, U(2.6), 1.05 * S, tm.cloth); seg(U(2.4), sh, 1.35 * S, tm.cloth);       // 腰 + 胸（上宽下窄）
      tor(U(1.2), 1.12 * S, tm.band, _q.setFromAxisAngle(new V3(0, 0, 1), -lean).clone());                         // 腰带
      for (const sd of [-1, 1]) sph(U(4.6, sz + sd * 1.25), 0.75 * S, 0.7 * S, 0.75 * S, tm.cloth);               // 两肩
      sph(U(5.6), 0.55 * S, 0.7 * S, 0.55 * S, COL.skin);                                                           // 脖子
      const hd = U(6.9);
      sph(hd, 1.2 * S, 1.3 * S, 1.15 * S, COL.skin);                                                                 // 头
      sph(U(7.4, sz, -0.7), 0.95 * S, 0.85 * S, 0.95 * S, COL.hair);                                                 // 发髻（脑后）
      const bandQ = _q.setFromAxisAngle(new V3(0, 0, 1), -lean).clone();
      if (TOR.n < TOR.max) { _m.compose(U(7.2), bandQ, _s.set(1.24 * S, 0.55 * S, 1.2 * S)); TOR.m.setMatrixAt(TOR.n, _m); TOR.m.setColorAt(TOR.n++, _c.setRGB(...tm.band)); }   // 头带（扁）
      // 桨：支点在舷外，入水 +45° → −25°，回桨抬起
      const px = ru + 1.6, py = 6 + lift, pz = side * 7.6;
      const OL = i === 0 ? 11 : 9;   // 对手桨短一截：不伸进隔壁车道
      const grip = bp(g, px - sn * 6, py + cs * 6, pz - side * 1.6), tip = bp(g, px + sn * OL, py - cs * OL, pz + side * 0.6);
      seg(grip, tip, 0.32 * S, ctx.mine(i) ? COL.goldHi : COL.gold);
      const bl = bp(g, px + sn * (OL - 1.6), py - cs * (OL - 1.6), pz + side * 0.5);
      _q.setFromUnitVectors(UP, _d.subVectors(tip, grip).normalize());
      sph(bl, 1.05 * S, 2.3 * S, 0.35 * S, tm.hull, _q.clone());
      // 两臂（肩 → 肘 → 手）：上手握桨顶，下手握桨中；肘往外、往下弯
      const lowHand = bp(g, px - sn * 1.5, py + cs * 1.5, pz - side * 1.0);
      for (const [hand, sd] of [[grip, -side], [lowHand, side]]) {
        const shp = U(4.6, sz + sd * 1.25), elb = _b.copy(shp).add(hand).multiplyScalar(0.5).add(_d.set(0, -1.4 * S, sd * 1.0 * S)).clone();
        seg(shp, elb, 0.42 * S, tm.cloth); seg(elb, hand, 0.36 * S, COL.skin); sph(hand, 0.45 * S, 0.45 * S, 0.45 * S, COL.skin);
      }
      bo.tips[j] = tip;
      if (prevTh[i][j] > 0.8 && th < 0.2 && !r.hold) onSplash(tip.x, tip.z, i);
      prevTh[i][j] = th;
    });
  }
  const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3(), _v6 = new V3(), _v7 = new V3(), _v8 = new V3(), _v9 = new V3(), _v10 = new V3(), _v11 = new V3(), _v12 = new V3();
  // 鼓手：面朝桨手，左右手各握鼓槌，按落槌时间抬放
  function drummer(ctx, b, i, bo) {
    const g = bo.g, tm = i === 0 ? { ...TEAM3[0], cloth: [1.0, 0.97, 0.9], band: [0.95, 0.12, 0.06] } : { ...TEAM3[i], cloth: TEAM3[i].band.map(v => v * 0.75 + 0.05) };   // 主角鼓手白衣朱带；对手鼓手穿队色
    // 审查 #2-4：鼓手是你的化身，要一眼看清——放大 1.4 倍，站在鼓后的小台上，身体随落槌前俯
    const K = i === 0 ? 1.8 : 1.3, mine = ctx.mine(i), last = mine ? Math.max(ctx.lastHand[0].t, ctx.lastHand[1].t) : b.lastHit, slam = Math.exp(-Math.max(0, ctx.t - last) * 9);
    const lean = 0.25 * slam, X = (x, y, z = 0) => bp(g, 32.5 + (x - 32.5) * 1 - Math.sin(lean) * (y - 6), 6 + (y - 6) * K * Math.cos(lean), z * K);
    seg(bp(g, 33, 4.6, -2), bp(g, 33, 6, -2), 0.6 * S, COL.goldHi); seg(bp(g, 33, 4.6, 2), bp(g, 33, 6, 2), 0.6 * S, COL.goldHi);   // 小台
    cone(X(32.6, 5.6), 2.1 * S * K, 4.6 * S * K, tm.cloth); seg(X(32.4, 9.3), X(32.2, 12.6), 1.45 * S * K, tm.cloth);   // 下摆外扩的长袍 + 胸（审查 #9-4：不再是白色方块）
    for (const sd of [-1, 1]) sph(X(32.2, 12.2, sd * 1.4), 0.8 * S * K, 0.75 * S * K, 0.8 * S * K, tm.cloth);
    sph(X(32.1, 14.6), 1.3 * S * K, 1.38 * S * K, 1.25 * S * K, COL.skin); sph(X(32.6, 15.2, 0), 1.0 * S * K, 0.9 * S * K, 1.0 * S * K, COL.hair);
    if (TOR.n < TOR.max) { _m.compose(X(32.1, 15.0), _q.identity(), _s.set(1.38 * S * K, 0.6 * S * K, 1.32 * S * K)); TOR.m.setMatrixAt(TOR.n, _m); TOR.m.setColorAt(TOR.n++, _c.setRGB(...tm.band)); }
    // 头带飘带
    seg(X(33.4, 15.0, 0.4), X(35.6, 14.2 + Math.sin(ctx.t * 9) * 0.5, 1.2), 0.25 * S * K, tm.band); seg(X(33.4, 15.0, -0.4), X(35.2, 13.6 + Math.sin(ctx.t * 8) * 0.5, -1.4), 0.25 * S * K, tm.band);
    // 手臂：在船内毫米坐标里做两段骨骼 IK（用户 11-16：之前只是普通弯着，不像打鼓）
    // 动作：鼓槌高举过肩（槌头朝上后方）→ 落槌 0.07 s 内砸到鼓面（手臂前伸、槌头压在鼓面）→ 回弹，0.3 s 内重新举起；左右手交替
    const lx = (x, y) => 32.5 + (x - 32.5) - Math.sin(lean) * (y - 6), ly = y => 6 + (y - 6) * K * Math.cos(lean);
    const UA = 2.9 * K, FA = 2.7 * K, STICK = 3.4 * K;
    for (const hd of [0, 1]) {
      const since = mine ? ctx.t - ctx.lastHand[hd].t : ctx.t - b.lastHit + (b.hits % 2 === hd ? 0 : 0.35);
      const sd = hd ? 1 : -1, sh = _v1.set(lx(32.2, 12.2), ly(12.2), sd * 1.45 * K);
      // 击打姿势：槌头落在鼓面靠近鼓手的一侧
      const drumP = _v2.set(25.5 + 1.4, 9.35, sd * 1.1);
      // 举槌姿势：手在肩的上方偏前，槌头朝上、略向后
      const upHand = _v3.set(sh.x - 0.6 * K, sh.y + (UA + FA) * 0.78, sh.z + sd * 0.5 * K), upDir = _v4.set(0.45, 1, sd * 0.15).normalize();
      // 0–0.07 s：在鼓面上（落槌瞬间略压下）；0.07–0.32 s：回弹举起；之后举着微微晃
      const k = since < 0.07 ? 0 : smooth(0.07, 0.32, since), sq = since < 0.07 ? Math.sin(since / 0.07 * Math.PI) * 0.25 : 0;
      const hitDir = _v5.copy(drumP).sub(sh).normalize().lerp(_v6.set(-0.55, -0.83, 0), 0.5).normalize();
      const dir = _v6.copy(hitDir).lerp(upDir, k).normalize();
      const hitHand = _v7.copy(drumP).addScaledVector(hitDir, -STICK); hitHand.y -= sq;
      const hand = hitHand.lerp(upHand, k); hand.y += Math.sin(ctx.t * 3 + hd) * 0.15 * K * k;
      // 两段骨骼 IK：肘往外、往后、往下
      const d = _v8.copy(hand).sub(sh), L = Math.min(d.length(), UA + FA - 1e-3); d.normalize();
      const along = (UA * UA - FA * FA + L * L) / (2 * L), h = Math.sqrt(Math.max(0, UA * UA - along * along));
      const pole = _v9.set(0.35, -0.5, sd).addScaledVector(d, -_v9.set(0.35, -0.5, sd).dot(d)).normalize();
      const elbow = _v10.copy(sh).addScaledVector(d, along).addScaledVector(pole, h);
      const handP = _v11.copy(sh).addScaledVector(d, L), tip = _v12.copy(handP).addScaledVector(dir, STICK);
      const W_ = p => bp(g, p.x, p.y, p.z);
      seg(W_(sh), W_(elbow), 0.5 * S * K, tm.cloth); seg(W_(elbow), W_(handP), 0.42 * S * K, COL.skin); sph(W_(handP), 0.55 * S * K, 0.55 * S * K, 0.55 * S * K, COL.skin);
      seg(W_(handP), W_(tip), 0.3 * S * K, COL.goldHi); sph(W_(tip), 0.75 * S * K, 0.75 * S * K, 0.75 * S * K, hd ? COL.goldHi : tm.band);
    }
  }

  // ---------- 堤岸、看台、观众 ----------
  // 河道半宽 W（米）：桌面 0.2；头显里加长到 0.5（用户 11-16：VR 里河道延伸长一点）。HM = 扫描半宽（河岸米）
  let W = 0.2, HM = 26; const SC = 0.01;
  let cx = 0; const toX = m => (m - cx) * SC;
  const edge = x => smooth(W, W - 0.035, Math.abs(x));
  // 石堤：远岸、近岸各一条长条，贴图随镜头滚动
  const wallMat = T({ tint: [0.03, 0.022, 0.022], map: wallTex, rimK: 0 });   // 近黑（线性值；sRGB 转换后才是真暗）   // 深石 + 金色砖缝
  wallTex.repeat.set(12, 1);
  const wallGeo = prep(new THREE.BoxGeometry(0.44, 0.007, 0.006), COL.white, 1);
  const farWall = pair(wallGeo, wallMat, outlineMat([0.9, 0.7, 0.45], 0.00018)); farWall.position.set(0, 0.002, -0.11);
  const nearWall = pair(wallGeo, wallMat, outlineMat([0.9, 0.7, 0.45], 0.00018)); nearWall.position.set(0, 0.0, 0.112); nearWall.scale.y = 0.6;
  // 看台：三级台阶（贴图随镜头滚动），每级前沿一道金边
  const plankTex = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,200,100,1)'; g.fillRect(0, 0, w, 3); });
  const standMat = T({ tint: [0.012, 0.008, 0.007], rimK: 0 });   // 线性 0.012 ≈ sRGB 10%：真正的近黑（之前的 0.05 经 sRGB 转换后是 25% 灰）   // 审查 #7-5：看台近黑 = 眼镜里几乎透明，只剩每级前沿的金描边   // 近黑漆 + 每级前沿一道金线   // 审查 #3-5：看台近黑，只留金边   // 深漆色台阶 + 金色板缝   // 审查 #5：看台是画面最大的亮块，压暗 40%
  const stands = [];
  for (let k = 0; k < 3; k++) { const st = pair(prep(new THREE.BoxGeometry(0.44, 0.0055 * (k + 1), 0.008), COL.white, 1), standMat, outlineMat([1, 0.8, 0.42], 0.00028)); st.position.set(0, 0.0055 * (k + 1) / 2, -0.12 - k * 0.008); stands.push(st); }
  const piers = [];
  // 两岸收口：每条堤和看台两端一座石墩（金顶 + 小灯柱），不是被窗口一刀切断（审查 #3-7）
  const pierGeo = merge([prep(at(new THREE.CylinderGeometry(3.2, 3.8, 12, 8), 0, 6, 0), [0.16, 0.12, 0.12], 0), prep(at(new THREE.CylinderGeometry(4.2, 4.2, 1.4, 8), 0, 12.6, 0), COL.goldHi, 0), prep(at(new THREE.CylinderGeometry(0.5, 0.5, 10, 6), 0, 18, 0), COL.verm, 0), prep(at(new THREE.SphereGeometry(1.6, 10, 8), 0, 23.4, 0), [1, 0.4, 0.2], 0)]);
  for (const [x, z, h] of [[-0.222, -0.11, 1], [0.222, -0.11, 1], [-0.222, 0.112, 0.8], [0.222, 0.112, 0.8], [-0.222, -0.13, 1.6], [0.222, -0.13, 1.6]]) { const p = pair(pierGeo, T({ rimK: 0.08 }), outlineMat([1, 0.82, 0.45], 0.00022)); p.position.set(x, 0, z); piers.push(p); p.scale.set(0.001, 0.001 * h, 0.001); }
  // 观众：远岸三层 + 近岸一排；位置用河岸米、60 米循环
  const CROWD_SPAN = 116, crowd = [];   // 116 米循环：头显里加长的河道（±50 cm）也铺得满
  const robes = [COL.verm, COL.gold, COL.qing, COL.lv, COL.zi, COL.ivory, [1, 0.6, 0.7]];
  const R = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(1234);
  const SECTION = [[COL.verm, [1, 0.55, 0.3], COL.goldHi], [COL.qing, [0.6, 0.8, 1.0], COL.ivory], [COL.lv, [0.7, 0.95, 0.5], COL.goldHi], [COL.zi, [0.9, 0.7, 1.0], COL.ivory]];
  // 审查 #2-1：观众是背景，压暗到 0.6、往灰拉 35%，不能和船抢亮度
  const bgDim = c => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return c.map(v => (v * 0.65 + l * 0.35) * 0.42); };
  const secRobe = m => { const p = SECTION[Math.floor(((m % 60) + 60) % 60 / 15) % 4]; const r = R(); return r < 0.6 ? p[0] : r < 0.88 ? p[1] : p[2]; };
  for (let tier = 0; tier < 3; tier++) for (let m = 0; m < CROWD_SPAN; m += 2.0) crowd.push({ m: m + R() * 0.45 + tier * 0.35, z: -0.12 - tier * 0.008 + (R() - 0.5) * 0.003, y: 0.0055 * (tier + 1), ph: R() * TAU, robe: bgDim(secRobe(m)), prop: R() < 0.12 ? 1 : R() < 0.1 ? 2 : 0, s: 0.9 + R() * 0.2 });
  // 近岸观众撤掉（审查 #8-4：灰点糊在主角前面）
  if (false) for (let m = 0; m < CROWD_SPAN; m += 2.1) crowd.push({ m: m + R(), z: 0.122, y: 0.004, ph: R() * TAU, robe: bgDim(robes[Math.floor(R() * robes.length)]), prop: R() < 0.2 ? 1 : 0, s: 1.1 });
  const wrapM = (m, span) => { let k = ((m - cx) % span + span * 1.5) % span - span / 2; return cx + k; };
  const SKIN_BG = [0.42, 0.32, 0.26], HAT_BG = [0.38, 0.3, 0.2];
  crowd.forEach(p => { p.hat = R() < 0.2; p.m += (R() - 0.5) * 0.6; });
  function people(ctx) {
    const t = ctx.t, wave = ctx.wave;
    for (const p of crowd) {
      const x = toX(wrapM(p.m, CROWD_SPAN)), e = edge(x); if (e < 0.25) continue;
      const wv = Math.exp(-Math.pow((x - wave.x) / 0.03, 2)) * Math.max(0, 1 - wave.t / 1.4), ex = clamp(ctx.excite + wv, 0, 1.2);
      const jump = Math.max(0, Math.sin(t * (5 + p.ph) + p.ph)) * 0.0024 * ex, s = p.s * 0.0011 * (0.6 + 0.4 * e);
      const y = p.y + jump;
      cone(_a.set(x, y, p.z), 1.2 * s, 3.6 * s, p.robe);
      sph(_b.set(x, y + 4.6 * s, p.z), 1.05 * s, 1.1 * s, 1.05 * s, SKIN_BG);
      if (p.hat) cone(_a.set(x, y + 5.3 * s, p.z), 1.7 * s, 0.9 * s, HAT_BG, _q.setFromAxisAngle(new V3(1, 0, 0), Math.PI));
      const up = clamp(ex * 1.3 - 0.3 + 0.3 * Math.sin(t * 3 + p.ph), 0, 1), sw = Math.sin(t * 7 + p.ph * 3) * 0.8 * up;
      for (const sd of [-1, 1]) seg(_a.set(x + sd * 0.8 * s, y + 3.2 * s, p.z), _d.set(x + sd * (1.8 - up * 0.6 + sw * 0.3) * s, y + (1.6 + up * 4.4) * s, p.z), 0.32 * s, p.robe);
      if (p.prop === 1) { cone(_a.set(x, y + 6.4 * s, p.z), 3.4 * s, 1.2 * s, p.robe, _q.setFromAxisAngle(new V3(1, 0, 0), Math.PI)); seg(_a.set(x, y + 3 * s, p.z), _d.set(x, y + 7.2 * s, p.z), 0.18 * s, COL.wood); }
      if (p.prop === 2) seg(_a.set(x + 1.4 * s, y + 3 * s, p.z), _d.set(x + 1.4 * s, y + 9 * s, p.z), 0.16 * s, COL.wood);
    }
    // 看台分间：每 6 米一根朱柱，柱顶金珠，柱间一条横枋
    for (let m = Math.floor((cx - HM) / 6) * 6; m < cx + HM; m += 6) { const x = toX(m), e = edge(x); if (e < 0.2) continue; seg(_a.set(x, 0.0, -0.137), _d.set(x, 0.034, -0.137), 0.0008, COL.verm); sph(_b.set(x, 0.0348, -0.137), 0.0011, 0.0011, 0.0011, COL.goldHi); seg(_a.set(x, 0.031, -0.137), _d.set(toX(m + 6), 0.031, -0.137), 0.0003, COL.verm);
      // 幡：柱上垂一条窄长的队色旗（四队轮换），随风轻摆，给看台一个节奏（审查 #7-5）
    }
    for (let m = Math.floor((cx - HM) / 2) * 2 + 1; m < cx + HM; m += 2) { const x = toX(m); if (edge(x) > 0.2) { seg(_a.set(x, 0.0042, 0.109), _d.set(x, 0.0095, 0.109), 0.00045, COL.stone); sph(_b.set(x, 0.0099, 0.109), 0.0007, 0.0007, 0.0007, COL.goldHi); seg(_a.set(x, 0.0082, 0.109), _d.set(toX(m + 2), 0.0082, 0.109), 0.00022, COL.goldHi); } }
    // 看台朱柱（每 4 米）+ 远岸望柱（每 2 米）
    for (let m = Math.floor((cx - HM) / 2) * 2; m < cx + HM; m += 2) { const x = toX(m); if (edge(x) > 0.2) { seg(_a.set(x, 0.006, -0.109), _d.set(x, 0.0125, -0.109), 0.00045, COL.stone); sph(_b.set(x, 0.0128, -0.109), 0.0007, 0.0007, 0.0007, COL.goldHi); seg(_a.set(x, 0.0108, -0.109), _d.set(toX(m + 2), 0.0108, -0.109), 0.00022, COL.goldHi); } }
  }

  // ---------- 水面：浮世绘鱼鳞浪（着色器），加光、低亮度；船边泛白 ----------
  const waterU = { uW: { value: 0.2 }, uPh: { value: 0 }, uCA: { value: new THREE.Color(0.25, 0.72, 0.9) }, uCB: { value: new THREE.Color(1.0, 0.82, 0.45) }, uBr: { value: 0.26 }, uDim: { value: 1 }, uCx: { value: 0 }, uT: SH.time, uBoats: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uGain: { value: 1 } };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.22, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: waterU,
    vertexShader: `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uCx, uT, uGain, uDim, uW, uPh, uBr; uniform vec3 uCA, uCB; uniform vec4 uBoats[4];
      varying vec3 vP;
      void main() {
        float m = uCx + vP.x * 100.0;                     // 河岸米
        vec2 q = vec2(m * 0.3 + uPh * 0.15, vP.z * 85.0 + 0.3 * sin(m * 0.3 + uPh * 0.6));   // uPh：随赛段变速的水流相位   // 审查 #3：鳞放大一倍
        // 鱼鳞浪：错位的半圆弧
        // 青海波：一层层错开的同心半圆，只画弧线（三道），弧下压住上一排
        vec2 cell = vec2(q.x * 0.8 + 0.5 * floor(q.y * 0.8), q.y * 0.8);
        vec2 f = fract(cell) - vec2(0.5, 0.0);
        float r = length(f * vec2(1.0, 1.15));
        float on = step(0.0, f.y) * step(r, 0.5);
        float arcs = 0.0;
        for (int k = 0; k < 3; k++) arcs += smoothstep(0.035, 0.0, abs(r - 0.18 - float(k) * 0.14)) * (1.0 - float(k) * 0.2);
        arcs *= on;
        float shimmer = 0.55 + 0.45 * sin(m * 1.3 - uPh * 1.8 + vP.z * 70.0);
        vec3 col = mix(uCA, uCB, 0.3 + 0.3 * sin(m * 0.21)) * arcs * uBr * shimmer;   // 配色 / 亮度跟着赛段（曲子）换
        // 船边泛白：尾迹 V 形 + 船头白
        for (int i = 0; i < 4; i++) {
          vec4 b = uBoats[i]; float dx = vP.x - b.x, dz = vP.z - b.y;
          float behind = clamp(-dx / 0.12, 0.0, 1.0);
          float v = exp(-pow((abs(dz) - (-dx) * 0.18) / (0.002 + 0.006 * behind), 2.0)) * step(dx, 0.0) * (1.0 - behind) * b.z;
          float bowFoam = exp(-(pow((dx - 0.003) / 0.006, 2.0) + pow(dz / 0.007, 2.0))) * b.z;
          // 船头 V 形浪：从船头向后张开的两道楔形亮带，越往后越宽越淡
          float back = clamp(-dx / 0.06, 0.0, 1.0), vw = 0.0012 + 0.004 * back;
          float vee = exp(-pow((abs(dz) - 0.006 - (-dx) * 0.22) / vw, 2.0)) * step(dx, 0.002) * (1.0 - back) * b.z;
          col += vec3(0.85, 0.95, 1.0) * (bowFoam * 0.22 + vee * 0.28) * (0.7 + 0.3 * sin(dx * 900.0 - uT * 12.0));
        }
        col *= smoothstep(uW, uW - 0.035, abs(vP.x)) * smoothstep(0.108, 0.094, abs(vP.z)) * uGain * uDim;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, ...opts.AR_GLOW,
  }));
  water.position.y = 0.0002; water.renderOrder = 2; root.add(water);

  const WATER_SEG = {
    start: { a: new THREE.Color(0.25, 0.72, 0.9), b: new THREE.Color(1.0, 0.82, 0.45), br: 0.26, flow: 1.0 },
    cruise: { a: new THREE.Color(0.2, 0.85, 0.7), b: new THREE.Color(0.85, 0.97, 1.0), br: 0.22, flow: 0.55 },
    sprint: { a: new THREE.Color(1.0, 0.42, 0.18), b: new THREE.Color(1.0, 0.86, 0.4), br: 0.34, flow: 2.2 },
  };
  let segTarget = WATER_SEG.start, flow = 1, lastT = 0;

  // ---------- 亭、牌坊、柳、灯笼 ----------
  // 起翘屋面：四角上翘的歇山顶近似（由一圈截面放样）
  function roofGeoFn(w, d, h, lift) {
    const g = new THREE.BufferGeometry(), pos = [], idx = [], N = 12, M = 6;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
      const u = i / N * 2 - 1, v = j / M;                       // u 沿檐长，v 从檐口到屋脊
      const corner = Math.pow(Math.abs(u), 4) * lift * (1 - v);
      pos.push(u * w * (1 - v * 0.35), v * h + corner + 0.15 * h * (1 - v) * (1 - v) * -1, d * (1 - v));
    }
    // 前坡法线朝上、朝外；后坡是镜像，绕向反过来，法线同样朝外
    const ridx = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); ridx.push(a, a + 1, b, b, a + 1, b + 1); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const back = new THREE.BufferGeometry(); back.setAttribute('position', new THREE.Float32BufferAttribute(pos.map((v, k) => k % 3 === 2 ? -v : v), 3)); back.setIndex(ridx);
    g.computeVertexNormals(); back.computeVertexNormals();
    return merge([prep(g, COL.white, 1), prep(back, COL.white, 1)]);
  }
  // 檐口金线：沿屋面前后檐口的一条细管（四角随屋面一起起翘）
  function eaveRim(w, d, h, lift, r = 0.9) {
    const out = [];
    for (const sz of [-1, 1]) { const pts = []; for (let i = 0; i <= 16; i++) { const u = i / 16 * 2 - 1; pts.push([u * w, Math.pow(Math.abs(u), 4) * lift - 0.15 * h, sz * d]); } out.push(prep(taperTube(pts, r, r, 32, 5), COL.goldHi, 0)); }
    out.push(prep(taperTube([[-w * 0.65, h, 0], [w * 0.65, h, 0]], r * 1.3, r * 1.3, 4, 5), COL.goldHi, 0));   // 正脊
    return out;
  }
  const pavGeo = (() => {
    const L = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.push(prep(at(new THREE.CylinderGeometry(1.0, 1.1, 26, 10), sx * 12, 13, sz * 7), COL.verm, 0));
    L.push(prep(at(new THREE.BoxGeometry(27, 1.6, 16), 0, 25.8, 0), COL.goldHi, 0));
    for (const sz of [-1, 1]) L.push(prep(at(new THREE.BoxGeometry(24, 0.6, 0.6), 0, 6, sz * 7), COL.verm, 0));    // 栏杆
    L.push(at(roofGeoFn(19, 12, 7, 4), 0, 27, 0)); L.push(...eaveRim(19, 12, 7, 4).map(g => at(g, 0, 27, 0)));
    L.push(at(roofGeoFn(12, 8, 6, 3.4), 0, 34, 0)); L.push(...eaveRim(12, 8, 6, 3.4, 0.4).map(g => at(g, 0, 34, 0)));
    L.push(prep(at(new THREE.SphereGeometry(1.3, 10, 8), 0, 40.8, 0), COL.goldHi, 0));                                // 宝顶
    return merge(L);
  })();
  const pavMat = T({ tint: [0.6, 0.16, 0.1], rimK: 0.45, spec: 0.5 });   // 审查 #8：深朱瓦，不再是粉色平面
  const PAV = new THREE.InstancedMesh(pavGeo, pavMat, 10), PAVO = new THREE.InstancedMesh(pavGeo, outlineMat([1, 0.84, 0.48], 0.0003), 10);
  PAVO.instanceMatrix = PAV.instanceMatrix; PAV.frustumCulled = PAVO.frustumCulled = false; root.add(PAV, PAVO);
  // 牌坊：四柱三间，两层檐，中匾（贴图字）
  const archG = new THREE.Group(); root.add(archG); archG.scale.setScalar(0.001);
  {
    const L = [];
    [-34, -13, 13, 34].forEach((x, i) => { const h = i === 1 || i === 2 ? 64 : 50; L.push(prep(at(new THREE.CylinderGeometry(1.5, 1.7, h, 10), x, h / 2 + 4, 0), COL.verm, 0)); L.push(prep(at(new THREE.BoxGeometry(5, 4, 5), x, 2, 0), COL.stone, 0)); });
    L.push(prep(at(new THREE.BoxGeometry(72, 2.2, 3), 0, 46, 0), COL.goldHi, 0)); L.push(prep(at(new THREE.BoxGeometry(30, 2.2, 3), 0, 60, 0), COL.goldHi, 0));
    L.push(at(roofGeoFn(14, 5, 5, 3), -24, 51, 0)); L.push(at(roofGeoFn(14, 5, 5, 3), 24, 51, 0)); L.push(at(roofGeoFn(22, 6, 7, 4), 0, 66, 0));
    for (const [x, y, w, d, h, l] of [[-24, 51, 14, 5, 5, 3], [24, 51, 14, 5, 5, 3], [0, 66, 22, 6, 7, 4]]) L.push(...eaveRim(w, d, h, l, 0.5).map(g => at(g, x, y, 0)));
    const archMesh = pair(merge(L), T({ tint: [0.62, 0.16, 0.1], rimK: 0.5 }), outlineMat([1, 0.86, 0.5], 0.00035), archG);
    const plaque = pair(prep(new THREE.PlaneGeometry(22, 8)), T({ map: plaqueTex('终 点'), rimK: 0.2 }), outlineMat([1, 0.86, 0.5], 0.0002), archG);
    plaque.position.set(0, 54, 1.6);
    // 对联：两侧竖条
    for (const s of [-1, 1]) { const p = pair(prep(new THREE.PlaneGeometry(4, 26), [0.95, 0.3, 0.2]), T({ rimK: 0.2 }), outlineMat([1, 0.86, 0.5], 0.00018), archG); p.position.set(s * 13, 30, 1.8); }
  }
  // 柳：树干 + 一圈垂枝（细管），整棵合并；按河岸米实例化
  const willowGeo = (() => {
    const bark = [0.78, 0.5, 0.3], L = [prep(taperTube([[0, 0, 0], [2.2, 8, 0.6], [3.4, 16, -0.4], [6.4, 22, 0.2]], 2.0, 0.9, 14, 7), bark, 0)];
    const branches = [[[6.4, 22, 0.2], [2, 28, 1], [-5, 30, 2], [-10, 27, 2.5]], [[6.4, 22, 0.2], [10, 28, -1], [15, 29, -2], [19, 25, -2]], [[5, 20, 0], [6, 27, 4], [7, 30, 8], [8, 27, 11]]];
    branches.forEach((b, k) => {
      L.push(prep(taperTube(b, 0.9, 0.3, 14, 5), bark, 0));
      const curve = new THREE.CatmullRomCurve3(b.map(p => new V3(...p)));
      for (let q = 1; q <= 7; q++) {
        const p = curve.getPointAt(q / 8), len = 10 + ((q * 7 + k * 3) % 6) * 2.4, sw = (q % 2 ? 1 : -1) * 0.8;
        L.push(prep(taperTube([[p.x, p.y, p.z], [p.x + sw, p.y - len * 0.35, p.z + 0.4], [p.x + sw * 1.6, p.y - len * 0.7, p.z + 0.2], [p.x + sw * 1.8, p.y - len, p.z]], 0.28, 0.06, 10, 4), q % 3 ? COL.willow : [0.7, 0.95, 0.4], 0));
        L.push(prep(at(new THREE.SphereGeometry(0.35, 5, 4), p.x + sw * 1.8, p.y - len, p.z), COL.goldHi, 0));    // 丝尖金点
      }
    });
    return merge(L);
  })();
  const WIL = new THREE.InstancedMesh(willowGeo, T({ rimK: 0.4 }), 4), WILO = new THREE.InstancedMesh(willowGeo, outlineMat([0.85, 1.0, 0.6], 0.00018), 4);
  WILO.instanceMatrix = WIL.instanceMatrix; WIL.frustumCulled = WILO.frustumCulled = false; root.add(WIL, WILO);
  // ---------- 两岸加料（2026-11-16 用户：两岸内容丰富一点） ----------
  // 远岸看台后：一排江南民居（白墙黛瓦、马头墙、金色檐线、窗里暖光），大小错落；看台和民居之间一排小柳树
  const houseGeo = (() => {
    const wall = [0.62, 0.56, 0.48], tile = [0.12, 0.1, 0.12], L = [];
    L.push(prep(at(new THREE.BoxGeometry(22, 14, 10), 0, 7, 0), wall, 0));
    L.push(prep(roofGeoFn(13, 6.5, 5, 1.5), tile, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 14, 0)));
    L.push(...eaveRim(13, 6.5, 5, 1.5, 0.35).map(g => at(g, 0, 14, 0)));
    for (const sx of [-1, 1]) {   // 马头墙：两端山墙高出屋面，墙头一道黛瓦 + 金线
      L.push(prep(at(new THREE.BoxGeometry(1.4, 22, 11), sx * 11.2, 11, 0), wall, 0));
      L.push(prep(at(new THREE.BoxGeometry(2.4, 0.9, 12), sx * 11.2, 22.4, 0), tile, 0));
      L.push(prep(at(new THREE.BoxGeometry(2.6, 0.35, 12.4), sx * 11.2, 22.9, 0), COL.goldHi, 0));
    }
    L.push(prep(at(new THREE.BoxGeometry(4, 6, 0.4), 0, 3, 5.2), [0.9, 0.35, 0.15], 0));          // 朱门
    for (const sx of [-1, 1]) L.push(prep(at(new THREE.BoxGeometry(3.2, 2.6, 0.4), sx * 6.5, 9, 5.2), [1.0, 0.75, 0.35], 0));   // 窗里透出暖光
    return merge(L);
  })();
  const HOUSE = new THREE.InstancedMesh(houseGeo, T({ tint: [0.95, 0.9, 0.84], rimK: 0.35, emit: 0.08 }), 20), HOUSEO = new THREE.InstancedMesh(houseGeo, outlineMat([1, 0.82, 0.45], 0.0002), 20);
  HOUSEO.instanceMatrix = HOUSE.instanceMatrix; HOUSE.frustumCulled = HOUSEO.frustumCulled = false; root.add(HOUSE, HOUSEO);
  // 近岸：岸顶一丛丛菖蒲、艾草（端午挂的），矮，不挡你的船
  const reedGeo = (() => {
    const L = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7 - 0.5) * 1.3, h = 7 + (k * 37 % 5), tip = [Math.sin(a) * h * 0.55, h, Math.cos(k * 2.1) * 1.2];
      L.push(prep(taperTube([[0, 0, 0], [tip[0] * 0.3, h * 0.5, tip[2] * 0.4], tip], 0.35, 0.05, 6, 3), k % 3 ? COL.willow : [0.75, 0.95, 0.35], 0));
    }
    L.push(prep(at(new THREE.SphereGeometry(0.6, 5, 4), 0, 6.5, 0), COL.goldHi, 0));   // 艾草穗
    return merge(L);
  })();
  const REED = new THREE.InstancedMesh(reedGeo, T({ rimK: 0.5 }), 50), REEDO = new THREE.InstancedMesh(reedGeo, outlineMat([0.8, 1.0, 0.55], 0.00012), 50);
  REEDO.instanceMatrix = REED.instanceMatrix; REED.frustumCulled = REEDO.frustumCulled = false; root.add(REED, REEDO);
  const FWIL = new THREE.InstancedMesh(willowGeo, T({ rimK: 0.3, tint: [0.7, 0.7, 0.7] }), 14), FWILO = new THREE.InstancedMesh(willowGeo, outlineMat([0.7, 0.9, 0.5], 0.00014), 14);
  FWILO.instanceMatrix = FWIL.instanceMatrix; FWIL.frustumCulled = FWILO.frustumCulled = false; root.add(FWIL, FWILO);
  // 灯笼：车削体（朱红，自发光）+ 金顶金底
  const lanternGeo = (() => {
    const pts = []; for (let k = 0; k <= 10; k++) { const v = k / 10; pts.push(new THREE.Vector2(Math.sin(Math.PI * v) * 2.6 + 0.6, v * 4.4 - 2.2)); }
    return merge([prep(new THREE.LatheGeometry(pts, 12), [1.0, 0.3, 0.16], 0), prep(at(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 10), 0, 2.4, 0), COL.goldHi, 0), prep(at(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 10), 0, -2.4, 0), COL.goldHi, 0), prep(at(new THREE.CylinderGeometry(0.15, 0.15, 3, 4), 0, -4, 0), COL.goldHi, 0)]);
  })();
  const LAN = new THREE.InstancedMesh(lanternGeo, T({ emit: 0.45, rimK: 0.6 }), 96), LANO = new THREE.InstancedMesh(lanternGeo, outlineMat([1, 0.75, 0.35], 0.00015), 96);
  LANO.instanceMatrix = LAN.instanceMatrix; LAN.frustumCulled = LANO.frustumCulled = false; root.add(LAN, LANO);

  const flagTex = canvasTex(256, 160, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff5a2a'); gr.addColorStop(1, '#b81c10'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,220,140,0.5)'; g.lineWidth = 3; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(k * 52 + 10, h - 6, 22, Math.PI, TAU); g.stroke(); }
    g.strokeStyle = '#ffd27a'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffe2a0'; g.font = '400 70px "STKaiti","KaiTi","Kaiti SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('夺标', w / 2, h / 2 + 4);
  });
  const flagGeo = prep(new THREE.PlaneGeometry(1, 0.62, 12, 4)), flagBase = Float32Array.from(flagGeo.attributes.position.array);
  const flagG = new THREE.Group(); flagG.visible = false; root.add(flagG);
  const flagCloth = pair(flagGeo, T({ map: flagTex, side: THREE.DoubleSide, rimK: 0.3, emit: 0.15 }), outlineMat([1, 0.86, 0.5], 0.00025), flagG);
  flagCloth.position.set(-0.5, 0.31, 0); flagG.add(flagCloth);
  const flagPole = pair(prep(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8).translate(0, -0.2, 0), COL.goldHi), T({ rimK: 0.6 }), outlineMat([1, 0.9, 0.6], 0.0002), flagG);
  pair(prep(at(new THREE.SphereGeometry(0.07, 10, 8), 0, 0.62, 0), COL.goldHi), T({ emit: 0.4 }), outlineMat([1, 0.9, 0.6], 0.0002), flagG);
  function flag(ctx) {
    const f = ctx.flag; flagG.visible = !!f; if (!f) return;
    const rise = f.stage === 'up' ? smooth(0, 0.6, f.t) * 0.03 : Math.sin(ctx.t * 2) * 0.002;
    flagG.position.set(f.p.x, f.p.y + rise, f.p.z); flagG.scale.setScalar(0.026);
    const pos = flagGeo.attributes.position;
    for (let k = 0; k < pos.count; k++) { const x = flagBase[k * 3], y = flagBase[k * 3 + 1], u = x + 0.5; pos.setXYZ(k, x, y + Math.sin(ctx.t * 5 - u * 4) * 0.04 * u, Math.sin(ctx.t * 6 - u * 5 + y * 2) * 0.09 * u); }
    pos.needsUpdate = true; flagGeo.computeVertexNormals();
  }
  let tallHidden = false;
  function props(ctx) {
    const t = ctx.t;
    PAV.visible = PAVO.visible = WIL.visible = WILO.visible = !tallHidden;
    // 亭子：每 50 米
    let n = 0;
    // 远岸亭台：每 15 米一座，大小错落、前后错开（避开牌坊附近）
    for (let m = Math.floor((cx - HM) / 15) * 15 + 4; m < cx + HM && n < 10; m += 15) { const x = toX(m); if (Math.abs(x) > W + 0.03 || Math.abs(m - raceLen) < 12) continue; const k = ((m / 15) % 3 + 3) % 3; _q.setFromEuler(new THREE.Euler(0, (k - 1) * 0.25, 0)); _m.compose(_a.set(x, 0.004, -0.158 - k * 0.012), _q, _s.setScalar(0.001 * (0.85 + 0.25 * k) * (0.6 + 0.4 * edge(x)))); PAV.setMatrixAt(n++, _m); }
    PAV.count = PAVO.count = n; PAV.instanceMatrix.needsUpdate = true;
    // 牌坊
    const ax = toX(raceLen); archG.visible = Math.abs(ax) < W + 0.06 && !tallHidden; archG.position.set(ax, 0.003, -0.176); archG.scale.setScalar(0.0015 * (0.5 + 0.5 * edge(ax)));
    // 柳：近岸每 20 米，枝条随风轻摆（整棵小幅摆动）
    n = 0;
    // 柳树只在两头（|x| > 13 cm），不挡主角
    for (let m = Math.floor((cx - HM) / 10) * 10 + 3; m < cx + HM && n < 4; m += 10) { const x = toX(m); if (Math.abs(x) > W || x < 0.13) continue; _q.setFromEuler(new THREE.Euler(Math.sin(t * 1.3 + m) * 0.03, m, Math.sin(t * 1.1 + m) * 0.04)); _m.compose(_a.set(x, 0.004, 0.113), _q, _s.setScalar(0.0009 * edge(x))); WIL.setMatrixAt(n++, _m); }   // 左前方（x < -0.06）留给 HUD，不放柳树
    WIL.count = WILO.count = n; WIL.instanceMatrix.needsUpdate = true;
    // 远岸民居：每 7 米一栋，大小 / 进深 / 朝向错落；避开牌坊
    HOUSE.visible = HOUSEO.visible = FWIL.visible = FWILO.visible = !tallHidden;
    n = 0;
    for (let m = Math.floor((cx - HM) / 7) * 7 + 2; m < cx + HM && n < 20; m += 7) {
      const x = toX(m); if (n >= 20 || Math.abs(x) > W + 0.02 || Math.abs(m - raceLen) < 9) continue;
      const k = ((Math.round(m / 7) % 4) + 4) % 4; _q.setFromEuler(new THREE.Euler(0, (k - 1.5) * 0.08, 0));
      _m.compose(_a.set(x + (k % 2) * 0.006, 0.004, -0.178 - (k % 3) * 0.008), _q, _s.set(0.0011 * (0.85 + 0.12 * k), 0.0011 * (0.8 + 0.25 * (k % 2)), 0.0011).multiplyScalar(0.6 + 0.4 * edge(x))); HOUSE.setMatrixAt(n++, _m);
    }
    HOUSE.count = HOUSEO.count = n; HOUSE.instanceMatrix.needsUpdate = true;
    // 远岸小柳：看台和民居之间，每 9 米
    n = 0;
    for (let m = Math.floor((cx - HM) / 9) * 9 + 5; m < cx + HM && n < 14; m += 9) { const x = toX(m); if (Math.abs(x) > W) continue; _q.setFromEuler(new THREE.Euler(Math.sin(t * 1.2 + m) * 0.03, m * 1.7, Math.sin(t + m) * 0.04)); _m.compose(_a.set(x, 0.004, -0.15), _q, _s.setScalar(0.0007 * edge(x))); FWIL.setMatrixAt(n++, _m); }
    FWIL.count = FWILO.count = n; FWIL.instanceMatrix.needsUpdate = true;
    // 近岸菖蒲 / 艾草：每 2.6 米一丛，随风摆
    n = 0;
    for (let m = Math.floor((cx - HM) / 2.6) * 2.6; m < cx + HM && n < 50; m += 2.6) {
      const x = toX(m) + Math.sin(m * 3.1) * 0.004; if (Math.abs(x) > W) continue;
      _q.setFromEuler(new THREE.Euler(0, m * 2.3, Math.sin(t * 1.8 + m) * 0.08));
      _m.compose(_a.set(x, 0.003, 0.114 + Math.sin(m * 1.7) * 0.003), _q, _s.setScalar(0.0011 * (0.8 + 0.4 * Math.abs(Math.sin(m * 5.3))) * edge(x))); REED.setMatrixAt(n++, _m);
    }
    REED.count = REEDO.count = n; REED.instanceMatrix.needsUpdate = true;
    // 灯笼：柳间灯串（每 20 米 5 盏）+ 终点线两侧
    n = 0;
    for (let m = Math.floor((cx - HM) / 20) * 20 + 7; m < cx + HM; m += 20) for (let k = 1; k <= 5; k++) {
      const mm = m + k * 20 / 6, x = toX(mm); if (Math.abs(x) > W || n >= 90 || x < -0.06) continue;
      const sag = Math.sin(Math.PI * k / 6) * 0.01; _q.setFromEuler(new THREE.Euler(0, 0, Math.sin(t * 2 + k + m) * 0.08));
      _m.compose(_a.set(x, 0.027 - sag, 0.136), _q, _s.setScalar(0.0009 * edge(x))); LAN.setMatrixAt(n++, _m);
    }
    for (let m = Math.floor((cx - HM) / 6) * 6 + 3; m < cx + HM; m += 6) { const x = toX(m); if (Math.abs(x) > W || n >= 90) continue; _q.setFromEuler(new THREE.Euler(0, 0, Math.sin(t * 2 + m) * 0.06)); _m.compose(_a.set(x, 0.026, -0.137), _q, _s.setScalar(0.00085 * edge(x))); LAN.setMatrixAt(n++, _m); }
    for (let k = 0; k < 6 && Math.abs(ax) < W; k++) { _m.compose(_a.set(ax + (k % 2 ? 0.035 : -0.035), 0.066 - Math.floor(k / 2) * 0.014, -0.172), _q.identity(), _s.setScalar(0.0008)); LAN.setMatrixAt(n++, _m); }
    LAN.count = LANO.count = n; LAN.instanceMatrix.needsUpdate = true;
  }

  return {
    // 主角龙头换成生成模型（Tripo）：保留模型自带的贴图做底色，套同一套卡通着色 + 描金描边；
    // opts：rot = [x, y, z] 欧拉角（把模型的"前方"转到船头 +x）、len = 龙头在船内毫米单位里的长度、at = 安放点
    async loadHeroHead(url, opts = {}) { return this.loadBoatModel(0, url, opts); },
    // 任意一条船换生成模型：i = 车道（0 是你）。对手材质降一档：整体压暗、边光弱、描边细（主角仍是最亮的）
    async loadBoatModel(i, url, opts = {}) {
      const gltf = await new GLTFLoader().loadAsync(url);
      const model = gltf.scene, holder = new THREE.Group(), bo = boats[i], hero = i === 0;
      model.rotation.set(...(opts.rot || [0, 0, 0]));
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new V3()), len = opts.len || 26;
      const k = len / Math.max(size.x, size.y, size.z);
      model.scale.multiplyScalar(k); model.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(model);
      model.position.sub(new V3((b2.min.x + b2.max.x) / 2, opts.alignTop ? b2.max.y : b2.min.y, (b2.min.z + b2.max.z) / 2));   // 底面（或顶面）中心对到原点
      let tris = 0;
      const meshes = []; model.traverse(o => { if (o.isMesh) meshes.push(o); });   // 先收集再改：边遍历边加描边子网格会无限递归
      meshes.forEach(o => {
        const src = o.material, map = src.map || null;
        if (map) map.colorSpace = THREE.SRGBColorSpace;
        // 审查 #7-1：对手要明显退后——贴图压到 0.6、饱和度降到 0.72、细银描边；主角保持全亮
        o.material = T({ map, vertexColors: false, tint: hero ? [1, 1, 1] : [0.6, 0.6, 0.62], sat: hero ? 1.18 : 0.5, rimK: hero ? 1.3 : 0.2, spec: hero ? 0.8 : 0.15, emit: hero ? 0.04 : 0 });
        o.add(new THREE.Mesh(o.geometry, outlineMat(hero ? [1.0, 0.86, 0.5] : [0.5, 0.52, 0.58], hero ? 0.00034 : 0.00013)));
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      });
      holder.add(model); holder.position.set(...(opts.at || [36, 4.6, 0])); if (opts.squash) holder.scale.set(...opts.squash); bo.g.add(holder);   // squash：生成的船偏宽偏深，压扁到和桨手、桨的位置对得上
      // replaceBody：整条船换成生成模型（藏掉程序船身，连同龙头、龙尾、程序鼓身）；否则只换龙头
      if (opts.replaceBody) bo.body.visible = false;
      else { bo.body.geometry = bodyGeoNoHead; bo.body.children[0].geometry = bodyGeoNoHead; }
      bo.jaw.visible = false; bo.whiskers.forEach(w => w.visible = false);
      bo.headModel = holder;
      return { tris, size: size.toArray().map(v => +v.toFixed(3)) };
    },
    // 玩家一下鼓：二十支桨尖一齐溅水
    hitSpray(i) { for (const p of boats[i].tips) if (p) onSplash(p.x, p.z, i); },
    TEAM3, dbg: () => ({ pav: PAV.count, pavPos: PAV.count ? new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(PAV.instanceMatrix.array, 0)).toArray() : null, arch: archG.visible, cx }),
    setDim(v) { SH.dim.value = v; waterU.uDim.value = v; tallHidden = v < 0.6; },
    setXR(on) { SH.lift.value = on ? 0.45 : 0.32; waterU.uGain.value = on ? 1.25 : 1; this.setWidth(on ? 0.5 : 0.2); },
    // 河道半宽：堤、看台按比例拉长，石墩挪到新两头，扫描范围跟着变
    setWidth(w) {
      W = w; HM = w / SC + 6; waterU.uW.value = w;
      const k = (w + 0.02) / 0.22; farWall.scale.x = nearWall.scale.x = k; stands.forEach(st => st.scale.x = k);
      piers.forEach(p => p.position.x = Math.sign(p.position.x) * (w + 0.022));
    },
    // 赛段（= 配乐曲子）→ 水面配色、亮度、流速：起航青金 / 巡航《茉莉花》碧玉慢流 / 冲刺《急急风》朱金急流
    setSeg(seg) { segTarget = WATER_SEG[seg] || WATER_SEG.start; },
    // 光照方向随沙盘旋转（头显里 world 有 yaw）
    setLightFrom(dioObj) { SH.light.value.set(-0.45, 1.0, 0.55).normalize().transformDirection(dioObj.matrixWorld); },
    update(ctx) {
      cx = ctx.cx; SH.time.value = ctx.t; waterU.uCx.value = cx;
      { const dt = Math.min(0.05, Math.max(0, ctx.t - lastT)), a = Math.min(1, dt * 1.2); lastT = ctx.t;   // 约 1 s 渐变过去
        waterU.uCA.value.lerp(segTarget.a, a); waterU.uCB.value.lerp(segTarget.b, a); waterU.uBr.value += (segTarget.br - waterU.uBr.value) * a; flow += (segTarget.flow - flow) * a; waterU.uPh.value += dt * flow; }
      SEG.n = SPH.n = TOR.n = CONE.n = 0;
      boats[0].g.getWorldPosition(SH.hero.value);
      ctx.boats.forEach((b, i) => {
        const bo = boats[i], bow = toX(b.pos), x0 = bow - 36 * S, e = edge(x0);
        bo.g.visible = e > 0.02;
        const bob = Math.sin(ctx.t * 2.2 + i) * 0.0003 - (b.force > 0 ? 0.0003 * Math.min(1, b.force / 12) : 0);
        const sinceHit = ctx.t - b.lastHit, surge = sinceHit < 0.5 ? 0.0022 * Math.exp(-sinceHit * 7) * Math.sin(Math.min(1, sinceHit / 0.08) * Math.PI * 0.5) : 0;
        bo.g.position.set(x0 + surge, 0.0008 + bob, laneZ[i]); bo.g.rotation.z = Math.sin(ctx.t * 1.7 + i * 2) * 0.012 + (b.force > 0 ? -0.01 : 0);
        bo.g.scale.setScalar(S * (0.85 + 0.15 * e) * (i === 0 ? 1 : 0.85)); bo.g.updateMatrix();   // 对手整船 0.85：车道间留出空隙
        // 张口：吼叫 / 鼓点
        const roar = ctx.mine(i) ? Math.max(0, 1 - (ctx.t - ctx.roarT) / 1.2) : 0, hitOpen = Math.max(0, 1 - (ctx.t - b.lastHit) / 0.25);
        bo.jaw.rotation.z = -Math.max(roar, hitOpen * 0.5) * 0.45;
        bo.cloth.rotation.y = Math.sin(ctx.t * 3.1 + i) * 0.35 - 0.2 * Math.min(1, b.v / 3); bo.cloth.rotation.x = Math.sin(ctx.t * 4.3 + i) * 0.08;
        if (bo.headModel) bo.headModel.rotation.z = Math.sin(ctx.t * 1.6 + i) * 0.025 + hitOpen * 0.09 + roar * 0.18;
        bo.whiskers.forEach((w, k) => { w.rotation.y = Math.sin(ctx.t * 2.4 + k * 1.3 + i) * 0.25; w.rotation.z = Math.sin(ctx.t * 1.9 + k) * 0.15; });
        const hit = Math.max(0, 1 - (ctx.t - b.lastHit) / 0.2);
        bo.headMat.uniforms.uEmit.value = hit * 0.9;
        bo.drumHead.scale.setScalar(1 + 0.25 * Math.sin(Math.min(1, (ctx.t - b.lastHit) / 0.12) * Math.PI) * (ctx.t - b.lastHit < 0.12 ? 1 : 0));
        waterU.uBoats.value[i].set(bow, laneZ[i], Math.min(1, b.v / 3.2) * e, 0);
        if (bo.g.visible) { rowers(ctx, b, i, bo); drummer(ctx, b, i, bo); }
      });
      people(ctx); props(ctx); flag(ctx);
      wallTex.offset.x = cx * SC / 0.44 * 12;
      for (const I of [SEG, SPH, TOR, CONE]) { I.m.count = I.o.count = I.n; I.m.instanceMatrix.needsUpdate = true; if (I.m.instanceColor) I.m.instanceColor.needsUpdate = true; }
    },
  };
}
