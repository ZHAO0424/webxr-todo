// 掌心气象台 · 美术：方块世界（照"我的世界"一类体素游戏的路子，贴图、模型全部是这里程序生成的，不用任何现成素材）
//
// 规则：
//   1. 一个方块 B = 1.6 mm（岛直径约 210 块，照像素村落西沟的密度），每个面 4×4 个贴图像素（一个贴图像素 TX = 0.4 mm，比这更细眼镜里会闪）。地形、树、云都按方块网格对齐；
//      动物、小物件不一定占满整块，但贴图像素一样大，整个岛的"像素密度"处处相同。
//   2. 光照照方块游戏的做法：顶面最亮、南北面次之、东西面最暗（固定的面明暗），再加方块角落的环境光遮蔽；
//      不用卡通分档、不描边、不用柔光——这些让画面显得"幼稚"。
//   3. 颜色自然、偏灰：草绿、土褐、石灰；随湿度和生长度变（像方块游戏的群系色调）。
//      但光学透视眼镜里暗 = 看不见，所以最暗的颜色也保持在中灰以上（自测里有暗部审计）。
//   4. 贴图全在着色器里按像素格算（哈希 + 噪声），不用图片。
import * as THREE from 'three';
import * as S from './sim.js';

export const B = 0.0016;               // 一个方块
export const TX = B / 4;               // 一个贴图像素
export const TPB = 4;                  // 每块几个贴图像素
export const PB = 0.0032;              // 草、花、蘑菇这些交叉面片植物的格子大小（不跟着方块缩，8×8 像素）
export const PX = 0.0008;              // 动物、小物件建模用的格子（= 2 个贴图像素）
export const INK = '#1a1230';
export const STEP = B, CELL = B;       // 地形：一格一个方块，一级台阶一个方块高

// ---------- 调色板（方块的底色；贴图在着色器里叠） ----------
export const RAMP = {
  basalt: ['#4a4652', '#5a5662', '#6a6672', '#7c7884', '#918c98'],
  sand: ['#b8a878', '#cdbd8a', '#dccd9a', '#e8dbab', '#f2e6bc'],
  water: ['#2d55b8', '#3463c8', '#3b72d6', '#5088e0', '#78a8ec'],
};
const _c = new THREE.Color();
export const rgb = hex => _c.set(hex).clone();
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- 共用的着色器小工具 ----------
export const COMMON_GLSL = /* glsl */`
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
// 面上的二维坐标（顶面用 xz，侧面用水平方向 + y）
vec2 faceUV(vec3 P, vec3 N) { return abs(N.y) > 0.5 ? P.xz : abs(N.x) > 0.5 ? vec2(P.z, P.y) : vec2(P.x, P.y); }
// 方块游戏的固定面明暗：顶 1.0、南北 0.8、东西 0.62、底 0.5
vec3 s2l(vec3 c) { return pow(c, vec3(2.2)); }   // 着色器里写的颜色是 sRGB 值，参与计算前转成线性
float faceShade(vec3 N) { return N.y > 0.5 ? 1.0 : N.y < -0.5 ? 0.5 : abs(N.z) > 0.5 ? 0.8 : 0.62; }
`;

// 几种贴图（给物件用）：0 细纹  1 树皮  2 树叶  3 白桦皮  4 皮毛  5 纯色（云）  6 圆石
export const OBJ_GLSL = /* glsl */`
vec3 objTex(vec3 base, vec3 P, vec3 N, float pat) {
  // 去噪：每个体素一个颜色（轻微色差），不在体素里画贴图
  vec2 tb = floor(faceUV(P, N) / ${B.toFixed(6)} + 0.001);
  float nb = h21(tb + floor(P.y / ${B.toFixed(6)}) * 0.37);
  int k = int(pat + 0.5);
  if (k == 5) return base;
  if (k == 1) return base * (0.95 + 0.07 * nb);                                   // 树皮
  if (k == 3) return h21(vec2(tb.x, floor(P.y / ${B.toFixed(6)}) + 3.0)) > 0.78 ? s2l(vec3(0.4, 0.38, 0.38)) : base * (0.97 + 0.04 * nb);   // 白桦：一块块黑灰斑
  if (k == 2) return base * (0.94 + 0.09 * nb);                                   // 树叶
  if (k == 4) return base * (0.95 + 0.06 * h21(floor(faceUV(P, N) / ${TX.toFixed(6)})));   // 皮毛（小动物，保留一点）
  if (k == 6) return base * (0.9 + 0.14 * nb);                                    // 圆石
  return base * (0.97 + 0.05 * nb);
}
`;

// ---------- 体素网格（贪心合面）：颜色函数返回 hex 或 [hex, 贴图编号] ----------
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const colorCache = new Map();
const lin = hex => { if (!colorCache.has(hex)) colorCache.set(hex, rgb(hex)); return colorCache.get(hex); };
const AO_LV = [0.62, 0.76, 0.89, 1.0];   // 0 = 角落被三面挡住
export function voxelGeometry(min, max, solid, color, size = PX, origin = [0, 0, 0], skipDown = true, ao = true) {
  const pos = [], nor = [], col = [], pat = [], idx = [];
  const D = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const st = [1, D[0], D[0] * D[1]];
  const Sx = new Uint8Array(D[0] * D[1] * D[2]);
  for (let z = min[2]; z < max[2]; z++) for (let y = min[1]; y < max[1]; y++) for (let x = min[0]; x < max[0]; x++) if (solid(x, y, z)) Sx[(z - min[2]) * st[2] + (y - min[1]) * st[1] + (x - min[0])] = 1;
  const solidAt = (x, y, z) => (x < min[0] || y < min[1] || z < min[2] || x >= max[0] || y >= max[1] || z >= max[2]) ? 0 : Sx[(z - min[2]) * st[2] + (y - min[1]) * st[1] + (x - min[0])];
  const p = [0, 0, 0];
  for (let f = 0; f < 6; f++) {
    if (skipDown && f === 3) continue;
    const n = FACES[f].n, a = n[0] ? 0 : n[1] ? 1 : 2, u = a === 0 ? 1 : 0, v = a === 2 ? 1 : 2;
    const mask = new Array(D[u] * D[v]), off = n[a] * st[a];
    for (let s = min[a]; s < max[a]; s++) {
      mask.fill(null);
      const out = s + n[a] < min[a] || s + n[a] >= max[a];
      for (let j = 0; j < D[v]; j++) for (let i = 0, k = (s - min[a]) * st[a] + j * st[v]; i < D[u]; i++, k += st[u]) {
        if (Sx[k] !== 1 || (!out && Sx[k + off] === 1)) continue;
        p[a] = s; p[u] = min[u] + i; p[v] = min[v] + j;
        const r = color(p[0], p[1], p[2], f);
        // 四个角的 AO（方块游戏的做法：看面外那一层的两个侧邻和一个角邻）
        let aos = '';
        if (r && ao) for (const [cu, cv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const du = cu ? 1 : -1, dv = cv ? 1 : -1, q = [p[0], p[1], p[2]]; q[a] += n[a];
          const s1 = solidAt(q[0] + (u === 0 ? du : 0), q[1] + (u === 1 ? du : 0), q[2] + (u === 2 ? du : 0));
          const s2 = solidAt(q[0] + (v === 0 ? dv : 0), q[1] + (v === 1 ? dv : 0), q[2] + (v === 2 ? dv : 0));
          const qc = [q[0], q[1], q[2]]; qc[u] += du; qc[v] += dv; const s3 = solidAt(qc[0], qc[1], qc[2]);
          aos += s1 && s2 ? 0 : 3 - s1 - s2 - s3;
        }
        mask[j * D[u] + i] = r ? (Array.isArray(r) ? r[0] + '|' + r[1] : r + '|0') + '|' + aos : null;
      }
      for (let j = 0; j < D[v]; j++) for (let i = 0; i < D[u];) {
        const key = mask[j * D[u] + i];
        if (!key) { i++; continue; }
        let w = 1; while (i + w < D[u] && mask[j * D[u] + i + w] === key) w++;
        let h = 1;
        grow: while (j + h < D[v]) { for (let k = 0; k < w; k++) if (mask[(j + h) * D[u] + i + k] !== key) break grow; h++; }
        for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) mask[(j + jj) * D[u] + i + k] = null;
        const [hex, pt, aos] = key.split('|'), c = lin(hex), base = pos.length / 3;
        for (const cr of FACES[f].c) {
          const q = [0, 0, 0];
          q[a] = s + cr[a]; q[u] = min[u] + i + (cr[u] ? w : 0); q[v] = min[v] + j + (cr[v] ? h : 0);
          pos.push(origin[0] + q[0] * size, origin[1] + q[1] * size, origin[2] + q[2] * size);
          // 这个角对应 aos 的哪一位：(cu, cv) → 0:(0,0) 1:(1,0) 2:(1,1) 3:(0,1)
          const ci = cr[u] ? (cr[v] ? 2 : 1) : (cr[v] ? 3 : 0), aoK = aos ? AO_LV[Number(aos[ci])] : 1;
          nor.push(n[0], n[1], n[2]); col.push(c.r * aoK, c.g * aoK, c.b * aoK); pat.push(Number(pt));
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        i += w;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPat', new THREE.Float32BufferAttribute(pat, 1));
  g.setIndex(idx);
  return g;
}
// 一组方块（单位：PX）→ 体素几何。boxes: [x0,y0,z0,x1,y1,z1, color | (x,y,z,f)=>color]
export function boxesGeometry(boxes, origin = [0, 0, 0], size = PX) {
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const b of boxes) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b[k]); mx[k] = Math.max(mx[k], b[k + 3]); }
  const find = (x, y, z) => { for (let i = boxes.length - 1; i >= 0; i--) { const b = boxes[i]; if (x >= b[0] && x < b[3] && y >= b[1] && y < b[4] && z >= b[2] && z < b[5]) return b; } return null; };
  return voxelGeometry(mn, mx, (x, y, z) => !!find(x, y, z), (x, y, z, f) => { const b = find(x, y, z); return typeof b[6] === 'function' ? b[6](x, y, z, f) : b[6]; }, size, origin, true);
}

// ---------- 地形：一格一根方块柱 ----------
export const NG = Math.ceil(2 * S.R / CELL);
const hq = new Float32Array(NG * NG).fill(NaN), tq = new Uint8Array(NG * NG), sq = new Uint8Array(NG * NG);
for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
  const x = -S.R + (i + 0.5) * CELL, z = -S.R + (j + 0.5) * CELL;
  if (Math.hypot(x, z) > S.R - CELL * 0.3) continue;
  hq[j * NG + i] = Math.max(S.PLINTH, Math.round(S.height(x, z) / STEP) * STEP);
  tq[j * NG + i] = S.cellType(x, z);
  sq[j * NG + i] = S.soilAt(x, z);
}
// 渲染层用的地面高度（和画出来的方块一致）
export function H(x, z) {
  const i = Math.floor((x + S.R) / CELL), j = Math.floor((z + S.R) / CELL);
  if (i < 0 || j < 0 || i >= NG || j >= NG) return S.PLINTH;
  const h = hq[j * NG + i]; return Number.isNaN(h) ? S.PLINTH : h;
}
// 吸到方块中心
export const snapB = v => (Math.floor((v + S.R) / B) + 0.5) * B - S.R;
const T = S.T;
// 地表种类：0 草地  1 林地  2 湿地  3 雪  4 沙滩  5 河床砾石  6 岩石
const KIND = { [T.GRASS]: 0, [T.FLOWER]: 0, [T.FOREST]: 1, [T.MARSH]: 2, [T.SNOW]: 3, [T.BEACH]: 4, [T.WATER]: 5, [T.ROCK]: 6 };

// 接地阴影：树、石头脚下压暗一圈
export const SHN = NG * 2;
const shData = new Uint8Array(SHN * SHN);
export const shadowTex = new THREE.DataTexture(shData, SHN, SHN, THREE.RedFormat, THREE.UnsignedByteType);
shadowTex.magFilter = shadowTex.minFilter = THREE.NearestFilter; shadowTex.unpackAlignment = 1;   // 宽不是 4 的倍数，默认按 4 字节对齐上传会错行
export const contact = {
  clear() { shData.fill(0); },
  stamp(x, z, r, k = 1) {   // 往南（朝看的人）偏：太阳大多在北边天上
    const cx = x + r * 0.15, cz = z + r * 0.5, g = 2 * S.R / SHN;
    for (let j = Math.max(0, Math.floor((cz - r * 1.3 + S.R) / g)); j <= Math.min(SHN - 1, Math.ceil((cz + r * 1.3 + S.R) / g)); j++)
      for (let i = Math.max(0, Math.floor((cx - r + S.R) / g)); i <= Math.min(SHN - 1, Math.ceil((cx + r + S.R) / g)); i++) {
        const d = Math.hypot(-S.R + (i + 0.5) * g - cx, (-S.R + (j + 0.5) * g - cz) / 1.2) / r;
        if (d > 1) continue;
        shData[j * SHN + i] = Math.max(shData[j * SHN + i], Math.min(255, (d < 0.65 ? 1 : 0.55) * k * 255));
      }
  },
  commit() { shadowTex.needsUpdate = true; },
};

export function buildTerrain(shared, SHADE_GLSL) {
  const pos = [], nor = [], kind = [], ext = [], top = [], bot = [], idx = [];
  const quad = (p, n, k, e) => { const b = pos.length / 3; const tp = Math.max(...p.map(v => v[1])), bt = Math.min(...p.map(v => v[1])); for (const v of p) pos.push(...v); for (let i = 0; i < 4; i++) { nor.push(...n); kind.push(k); ext.push(e); top.push(tp); bot.push(bt); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  const X = i => -S.R + i * CELL;
  const kindAt = (i, j) => {
    const t = tq[j * NG + i], h = hq[j * NG + i] - S.PLINTH;
    const q = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, r = q - Math.floor(q), wob = (Math.sin(i * 0.7) + Math.sin(j * 0.9)) * 0.004 + (r - 0.5) * 0.006;
    if (t === T.SNOW || t === T.ROCK || t === T.FOREST) {
      if (h + wob > 0.072) return 3;
      if (t !== T.FOREST && h + wob > 0.058) return 6;
      if (t === T.ROCK) return 6;
    }
    return KIND[t] ?? 0;
  };
  // 顶面：二维贪心，同高同种类的拼成矩形
  const KA = new Int8Array(NG * NG).fill(-1), used = new Uint8Array(NG * NG);
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) if (!Number.isNaN(hq[j * NG + i])) { const kk = kindAt(i, j); KA[j * NG + i] = kk <= 2 ? kk + 10 * sq[j * NG + i] : kk; }
  const same = (a, b) => KA[b] >= 0 && !used[b] && hq[b] === hq[a] && KA[b] === KA[a];
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
    const a = j * NG + i; if (KA[a] < 0 || used[a]) continue;
    let w = 1; while (i + w < NG && same(a, j * NG + i + w)) w++;
    let hgt = 1;
    grow: while (j + hgt < NG) { for (let q = 0; q < w; q++) if (!same(a, (j + hgt) * NG + i + q)) break grow; hgt++; }
    for (let jj = 0; jj < hgt; jj++) for (let q = 0; q < w; q++) used[(j + jj) * NG + i + q] = 1;
    const h = hq[a];
    quad([[X(i), h, X(j)], [X(i), h, X(j + hgt)], [X(i + w), h, X(j + hgt)], [X(i + w), h, X(j)]], [0, 1, 0], KA[a], 0);
  }
  // 侧面：比邻居高的地方立一面，沿边把一样的连成长条
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const sideKey = (i, j, di, dj) => {
    const h = hq[j * NG + i]; if (Number.isNaN(h)) return null;
    const ni = i + di, nj = j + dj, nh = ni < 0 || nj < 0 || ni >= NG || nj >= NG ? NaN : hq[nj * NG + ni];
    const outside = Number.isNaN(nh), lo = outside ? 0 : nh;
    if (lo >= h) return null;
    return { h, lo, k: KA[j * NG + i], e: outside ? 1 : 0 };
  };
  const eq = (a, b) => a && b && a.h === b.h && a.lo === b.lo && a.k === b.k && a.e === b.e;
  for (const [di, dj] of DIRS) {
    if (di !== 0) {
      for (let i = 0; i < NG; i++) for (let j = 0; j < NG;) {
        const s0 = sideKey(i, j, di, dj); if (!s0) { j++; continue; }
        let n = 1; while (j + n < NG && eq(s0, sideKey(i, j + n, di, dj))) n++;
        const x = di === 1 ? X(i + 1) : X(i), z0 = X(j), z1 = X(j + n);
        if (di === 1) quad([[x, s0.lo, z1], [x, s0.lo, z0], [x, s0.h, z0], [x, s0.h, z1]], [1, 0, 0], s0.k, s0.e);
        else quad([[x, s0.lo, z0], [x, s0.lo, z1], [x, s0.h, z1], [x, s0.h, z0]], [-1, 0, 0], s0.k, s0.e);
        j += n;
      }
    } else {
      for (let j = 0; j < NG; j++) for (let i = 0; i < NG;) {
        const s0 = sideKey(i, j, di, dj); if (!s0) { i++; continue; }
        let n = 1; while (i + n < NG && eq(s0, sideKey(i + n, j, di, dj))) n++;
        const z = dj === 1 ? X(j + 1) : X(j), x0 = X(i), x1 = X(i + n);
        if (dj === 1) quad([[x0, s0.lo, z], [x1, s0.lo, z], [x1, s0.h, z], [x0, s0.h, z]], [0, 0, 1], s0.k, s0.e);
        else quad([[x1, s0.lo, z], [x0, s0.lo, z], [x0, s0.h, z], [x1, s0.h, z]], [0, 0, -1], s0.k, s0.e);
        i += n;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aExt', new THREE.Float32BufferAttribute(ext, 1));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  g.setAttribute('aBot', new THREE.Float32BufferAttribute(bot, 1));
  g.setIndex(idx);
  // 每根柱子有几个方块高（着色器里查邻居，做方块角落的环境光遮蔽）
  const ht = new Uint8Array(NG * NG);
  for (let k = 0; k < NG * NG; k++) ht[k] = Number.isNaN(hq[k]) ? 0 : Math.round(hq[k] / STEP);
  const htTex = new THREE.DataTexture(ht, NG, NG, THREE.RedFormat, THREE.UnsignedByteType);
  htTex.magFilter = htTex.minFilter = THREE.NearestFilter; htTex.unpackAlignment = 1; htTex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uSH: { value: shadowTex }, uSHN: { value: SHN }, uHT: { value: htTex }, uNG: { value: NG }, uMG: { value: null }, uR: { value: S.R }, uAmbC: { value: new THREE.Color(1, 1, 1) }, uSunC: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFlash: { value: 0 } },
    vertexShader: `
      attribute float aKind, aExt, aTop, aBot; varying vec3 vP; varying vec3 vN; varying float vK, vE, vTop, vBot;
      void main() { vP = position; vN = normal; vK = aKind; vE = aExt; vTop = aTop; vBot = aBot; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: SHADE_GLSL + COMMON_GLSL + `
      uniform sampler2D uMG, uHT, uSH; uniform float uR, uTime, uFlash, uNG, uSHN; uniform vec3 uAmbC, uSunC, uSunDir;
      varying vec3 vP; varying vec3 vN; varying float vK, vE, vTop, vBot;
      const float BK = ${B.toFixed(6)}, TXS = ${TX.toFixed(6)};
      float colH(vec2 xz) { vec2 c = floor((xz + uR) / BK); return texture(uHT, (c + 0.5) / uNG).r * 255.0; }
      // ---- 方块贴图（t = 贴图像素坐标；n、n2 = 每个贴图像素的随机数） ----
      vec3 DIRT = vec3(0.55, 0.4, 0.28), STONE = vec3(0.54, 0.54, 0.56), SAND = vec3(0.86, 0.81, 0.62), SNOWC = vec3(0.95, 0.97, 1.0);
      // 荒地的土：沙丘（一道道风纹）、红黏土（龟裂）、碎石坡、干泥滩（大块龟裂、发白）
      vec3 texSoil(int soil, vec2 t, vec3 P, float n, float n2) {
        if (soil == 1) { float rip = fract((t.x * 0.8 + t.y * 0.6) / 3.0 + 0.6 * vnoise(t * 0.3)); return vec3(0.88, 0.78, 0.56) * (rip < 0.34 ? 0.93 : 1.0) * (0.97 + 0.04 * n); }   // 沙丘：一道道风纹（按块）
        if (soil == 2) { float crack = abs(vnoise(t * 0.45) - 0.5) < 0.05 ? 0.88 : 1.0; return vec3(0.78, 0.52, 0.4) * crack * (0.96 + 0.06 * n); }
        if (soil == 3) { float c = h21(t + 5.1); return (c > 0.66 ? vec3(0.66, 0.64, 0.62) : c > 0.33 ? vec3(0.6, 0.58, 0.58) : vec3(0.64, 0.6, 0.54)) * (0.97 + 0.04 * n); }
        if (soil == 4) { float crack = abs(vnoise(t * 0.3) - 0.5) < 0.04 ? 0.88 : 1.0; return vec3(0.74, 0.67, 0.56) * crack * (0.97 + 0.04 * n); }
        return vec3(0.0);
      }
      vec3 texDirt(float n, float n2) { return DIRT * (0.94 + 0.08 * n); }
      // 崖壁的岩层：按高度分层（每层 1–2 块厚，层线微微起伏），越低越暖（红砂岩），高处灰白
      vec3 strata(vec3 P, vec2 t, float n) {
        float y = P.y / BK + 0.6 * sin(P.x * 140.0 + P.z * 90.0) + 0.4 * sin(P.z * 210.0);
        float band = floor(y / 1.5), hb = h21(vec2(band, 7.3));
        float warm = 1.0 - smoothstep(0.035, 0.07, P.y);
        // 收调色板：只用一族暖色（红砂、奶黄、浅赭），高处褪成暖灰
        vec3 a = mix(vec3(0.64, 0.62, 0.62), vec3(0.74, 0.5, 0.4), warm);
        vec3 b = mix(vec3(0.72, 0.7, 0.68), vec3(0.86, 0.74, 0.58), warm);
        vec3 c = mix(vec3(0.6, 0.58, 0.58), vec3(0.8, 0.6, 0.44), warm);
        vec3 col = hb < 0.45 ? a : hb < 0.75 ? b : c;
        return col * (0.97 + 0.05 * n);
      }
      vec3 texStone(vec2 t, float n) { float b = vnoise(t * 0.5); return STONE * (b > 0.62 ? 1.06 : b < 0.3 ? 0.93 : 1.0) * (0.97 + 0.05 * n); }
      vec3 texSand(float n, float n2) { return SAND * (0.96 + 0.05 * n); }
      vec3 texGravel(vec2 t, float n) { float c = h21(t); return (c > 0.6 ? vec3(0.64, 0.62, 0.6) : c > 0.3 ? vec3(0.58, 0.56, 0.56) : vec3(0.62, 0.56, 0.5)) * (0.97 + 0.04 * n); }
      vec3 texSnow(float n) { return SNOWC * (0.97 + 0.03 * n); }
      // 草的颜色（群系色调）：长得好是绿，缺水发黄，烧过发灰
      vec2 gXZ;   // 当前像素的位置（群系色按地方变）
      vec3 grassTint(float G, float M, int k) {
        float reg = vnoise(gXZ * 38.0 + 3.0), reg2 = vnoise(gXZ * 21.0 - 7.0);
        vec3 lush = k == 1 ? vec3(0.4, 0.58, 0.3) : k == 2 ? vec3(0.46, 0.56, 0.34) : vec3(0.52, 0.68, 0.32);
        lush *= 0.97 + 0.06 * reg;                                       // 大片的明暗起伏，色相不变
        vec3 dry = vec3(0.76, 0.7, 0.44);
        vec3 c = mix(dry, lush, smoothstep(0.08, 0.32, M) * smoothstep(0.1, 0.5, G));
        return G < 0.11 ? vec3(0.5, 0.47, 0.42) : c;
      }
      void main() {
        vec3 N = normalize(vN);
        vec3 Pc = vP - N * 0.00001;
        // 去噪：t 是方块坐标（不是贴图像素），每块一个随机数 → 一块一个颜色
        vec2 t = floor(faceUV(Pc, N) / BK + 0.001);
        float n = h21(t + floor(Pc.y / BK) * 0.37), n2 = h21(t * 1.37 + 7.1);
        int kraw = int(vK + 0.5), soil = kraw / 10, k = kraw - soil * 10; gXZ = (floor((Pc.xz + uR) / BK) + 0.5) * BK - uR;
        vec4 s = texture(uMG, (Pc.xz + uR) / (2.0 * uR)); float M = s.r, G = s.g, SN = s.b, SM = s.a;
        vec3 col;
        if (N.y > 0.5) {
          vec3 tint = grassTint(G, M, k);
          if (k == 0 || k == 1 || k == 2) {
            // 草：一个个贴图像素深浅不一；长得不好的地方露出土
            bool bare = h21(t * 0.71 + 3.3) > smoothstep(0.05, 0.45, G) + 0.15;
            col = tint * (0.95 + 0.07 * n);
            if (bare) col = soil == 0 ? texDirt(n, n2) : texSoil(soil, t, Pc, n, n2);
            if (k == 1 && n2 > 0.94) col = vec3(0.56, 0.44, 0.3);   // 林地：零星落叶
            if (k == 2 && M > 0.3 && vnoise(t * 0.7) > 0.62) col = vec3(0.4, 0.6, 0.7);   // 湿地：一洼洼浅水
            // 湿透了：草地上积水
            if (k == 0 && M > 0.8 && vnoise(t * 0.6 + 5.0) > 0.76 - (M - 0.8)) col = vec3(0.4, 0.6, 0.76);
          } else if (k == 3) col = texSnow(n);
          else if (k == 4) col = n2 > 0.8 ? texGravel(t, n) : texSand(n, n2);
          else if (k == 5) col = texGravel(t, n);
          else col = texStone(t, n);
          if (SN > 0.08 && h21(t * 0.53 + 9.1) < smoothstep(0.08, 0.6, SN)) col = texSnow(n);   // 积雪：一个个像素慢慢盖满
        } else {
          // 侧面：从这一面的顶往下数第几个方块
          float fromTop = (vTop - Pc.y) / BK, kb = floor(fromTop);
          float ty = mod(floor((vTop - Pc.y) / TXS), 4.0);   // 方块里从上往下第几个贴图像素
          float fringe = 1.0 + floor(h21(vec2(t.x, kb)) * 2.0);   // 草皮、雪往下挂 1–2 个像素，参差不齐
          if ((vTop - vBot) / BK < 1.5) fringe += 1.0;             // 只有一格高的小坎：草皮盖得更多，草地上不会满是褐色的线
          bool grassy = k == 0 || k == 1 || k == 2;
          float stoneFrom = grassy ? 4.0 : k == 4 ? 3.0 : 0.0;
          if (vE > 0.5) stoneFrom += floor(h21(vec2(floor(Pc.x / BK), floor(Pc.z / BK))) * 2.0);
          if (kb < 0.5 && SN > 0.3) col = texSnow(n);   // 积了雪，侧面上沿也是白的
          else if (kb < 0.5 && grassy && G > 0.2 + 0.3 * h21(vec2(t.x, 3.0))) col = grassTint(G, M, k) * (0.92 + 0.05 * n);   // 荒的时候坎子上沿没有草皮
          else if (kb < 0.5 && k == 3) col = texSnow(n);
          else if (kb < stoneFrom) col = k == 4 ? texSand(n, n2) : (soil == 1 || soil == 2) ? texSoil(soil, t, Pc, n, n2) * 0.95 : texDirt(n, n2);
          else col = (k == 6 || k == 3 || kb > 5.0) && Pc.y > 0.016 ? strata(Pc, t, n) : texStone(t, n);
          // 岛的外沿最底下两个方块：更深的基岩
          if (vE > 0.5 && kb >= stoneFrom) {
            float yy = Pc.y / BK + 0.8 * sin(atan(Pc.z, Pc.x) * 7.0) + 0.5 * sin(atan(Pc.z, Pc.x) * 17.0);
            if (yy < 1.6) col = vec3(0.6, 0.55, 0.56) * (0.96 + 0.05 * n);                                        // 最底下：深色基岩（不能太暗）
            else if (yy < 2.4) col = h21(vec2(t.x, 1.0)) > 0.3 ? vec3(1.0, 0.64, 0.24) : vec3(0.96, 0.44, 0.16);   // 岩浆脉
            else if (yy < 3.6) col = vec3(0.64, 0.62, 0.62) * (0.97 + 0.04 * n);
            else if (yy < 4.3) col = vec3(0.46, 0.72, 0.84);                                    // 地下水层
            else if (yy < 6.0) col = texGravel(t, n);
            else col = vec3(0.74, 0.56, 0.44) * (0.97 + 0.04 * n);                                                  // 红土层
            if (h21(t * 0.37 + 2.0) > 0.975) col = h21(t) > 0.5 ? vec3(0.98, 0.86, 0.4) : vec3(0.5, 0.86, 0.72);  // 矿点：金、铜绿
          }
        }
        // 方块角落的环境光遮蔽（按贴图像素分档的平滑光照）
        float ao = 0.0;
        if (N.y > 0.5) {
          vec2 cb = floor((Pc.xz + uR) / BK), f = fract((Pc.xz + uR) / BK);
          float me = colH(Pc.xz);
          vec2 dirs[8]; dirs[0] = vec2(1, 0); dirs[1] = vec2(-1, 0); dirs[2] = vec2(0, 1); dirs[3] = vec2(0, -1); dirs[4] = vec2(1, 1); dirs[5] = vec2(-1, 1); dirs[6] = vec2(1, -1); dirs[7] = vec2(-1, -1);
          for (int i = 0; i < 8; i++) {
            vec2 d = dirs[i];
            if (colH(Pc.xz + d * BK) <= me + 0.5) continue;
            // 离那条边 / 那个角越近越暗
            vec2 e = vec2(d.x > 0.0 ? f.x : d.x < 0.0 ? 1.0 - f.x : 1.0, d.y > 0.0 ? f.y : d.y < 0.0 ? 1.0 - f.y : 1.0);
            float w = i < 4 ? (d.x != 0.0 ? e.x : e.y) : max(e.x, e.y);
            ao = max(ao, smoothstep(0.35, 1.0, w) * (i < 4 ? 0.34 : 0.24));
          }
          float sh = texture(uSH, (floor((Pc.xz + uR) / (2.0 * uR) * uSHN) + 0.5) / uSHN).r;
          ao = max(ao, sh > 0.8 ? 0.3 : sh > 0.4 ? 0.17 : 0.0);   // 树、石头脚下的阴影
        } else {
          float up = (Pc.y - vBot) / BK;
          if (vE < 0.5) ao = (1.0 - smoothstep(0.0, 0.9, up)) * 0.28;   // 墙脚
        }
        col = mix(col, vec3(0.66, 0.62, 0.5), SM * 0.45);   // 雾霾：发灰发黄
        col = s2l(col);
        float light = faceShade(N) * (1.0 - ao);
        // 侧面跟着太阳走：朝太阳的崖面亮、偏暖，背阴的暗一档、偏冷（斜阳时最明显）
        float sideSun = N.y < 0.5 ? dot(N.xz, normalize(uSunDir.xz + 1e-5)) : 0.0;
        float sunLow = 1.0 - smoothstep(0.25, 0.8, uSunDir.y);
        light *= 1.0 + 0.2 * sideSun * (0.5 + 0.5 * sunLow);
        vec3 lit = col * (uAmbC * light + uSunC * (N.y > 0.5 ? 0.3 : 0.12 + 0.3 * max(sideSun, 0.0))) + uFlash * 0.25;
        gl_FragColor = vec4(applyShade(lit, Pc), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return { geometry: g, material: mat };
}

// 溪往下跌一级的地方（画瀑布的白沫）
export function waterfalls() {
  const out = [];
  for (const P of S.LAYOUT.rivers) {
    let prev = null;
    for (let i = 0; i < P.length - 1; i++) {
      const n = Math.ceil(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) / (TX * 2));
      for (let k = 0; k <= n; k++) {
        const x = P[i][0] + (P[i + 1][0] - P[i][0]) * k / n, z = P[i][1] + (P[i + 1][1] - P[i][1]) * k / n, h = H(x, z);
        if (prev && prev.h - h > STEP * 0.5) out.push({ x, z, y: h, drop: prev.h - h });
        prev = { x, z, h };
      }
    }
  }
  return out;
}

// ---------- 水：溪和湖每格一块水面，水位决定盖到哪 ----------
export function buildWater(shared) {
  const pos = [], dA = [], pondA = [], idx = [];
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
    const h = hq[j * NG + i]; if (Number.isNaN(h)) continue;
    const x = -S.R + (i + 0.5) * CELL, z = -S.R + (j + 0.5) * CELL;
    const rd = S.riverDist(x, z), ld = S.lakeDist(x, z), pd = 1 + ld / 0.03;
    const pond = ld < 0.006, river = rd < 0.012;
    if (!pond && !river) continue;
    const x0 = -S.R + i * CELL, z0 = -S.R + j * CELL, b = pos.length / 3;
    pos.push(x0, h, z0, x0, h, z0 + CELL, x0 + CELL, h, z0 + CELL, x0 + CELL, h, z0);
    for (let k = 0; k < 4; k++) { dA.push(pond && (!river || pd < 1) ? pd : rd); pondA.push(pond && (!river || pd < 1) ? 1 : 0); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // 溪往下跌一格的地方：立一面竖着的水（落下来的水），贴图往下流
  const vA = new Array(pos.length / 3).fill(0);
  const isRiver = (i, j) => { if (i < 0 || j < 0 || i >= NG || j >= NG || Number.isNaN(hq[j * NG + i])) return false; return S.riverDist(-S.R + (i + 0.5) * CELL, -S.R + (j + 0.5) * CELL) < 0.008; };
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
    if (!isRiver(i, j)) continue;
    const h = hq[j * NG + i], rd = S.riverDist(-S.R + (i + 0.5) * CELL, -S.R + (j + 0.5) * CELL);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isRiver(i + di, j + dj)) continue;
      const lo = hq[(j + dj) * NG + i + di]; if (lo >= h) continue;
      const b = pos.length / 3, x0 = -S.R + i * CELL, z0 = -S.R + j * CELL;
      let q;
      if (di === 1) q = [[x0 + CELL, lo, z0], [x0 + CELL, lo, z0 + CELL], [x0 + CELL, h, z0 + CELL], [x0 + CELL, h, z0]];
      else if (di === -1) q = [[x0, lo, z0 + CELL], [x0, lo, z0], [x0, h, z0], [x0, h, z0 + CELL]];
      else if (dj === 1) q = [[x0 + CELL, lo, z0 + CELL], [x0, lo, z0 + CELL], [x0, h, z0 + CELL], [x0 + CELL, h, z0 + CELL]];
      else q = [[x0, lo, z0], [x0 + CELL, lo, z0], [x0 + CELL, h, z0], [x0, h, z0]];
      for (const v of q) { pos.push(...v); dA.push(rd); pondA.push(0); vA.push(1); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aD', new THREE.Float32BufferAttribute(dA, 1)); g.setAttribute('aPond', new THREE.Float32BufferAttribute(pondA, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(vA, 1));
  g.setIndex(idx);
  const u = { uIce: { value: 0 }, uWater: { value: 0.3 }, uRain: { value: 0 }, uTime: shared.uTime, uFill: { value: null }, uR: { value: S.R }, uLight: { value: new THREE.Color(1, 1, 1) },
    uCam: { value: new THREE.Vector3(0, 0.4, 0.4) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunK: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: `attribute float aD, aPond, aV; uniform float uWater; varying float vD, vPond, vCov, vV; varying vec3 vP;
      void main() {
        float cov = aPond > 0.5 ? 0.82 + 0.32 * uWater : 0.0034 + 0.0062 * uWater;
        vD = aD; vPond = aPond; vCov = cov; vV = aV;
        vec3 p = position; p.y += 0.0009 + 0.0032 * uWater; vP = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    // 照 Terraglass 的水：清的水体（浅处看得见底、越深越蓝越不透明）、平滑的小波浪、
    // 斜着看反射天光（菲涅尔）、太阳的高光一闪一闪、岸边一圈白浪；波浪按 0.4 mm 的格子取样，和方块世界的颗粒一致
    fragmentShader: COMMON_GLSL + `
      uniform float uTime, uRain, uR, uIce, uSunK; uniform sampler2D uFill; uniform vec3 uLight, uCam, uSunDir; varying float vD, vPond, vCov, vV; varying vec3 vP;
      const float TXS = ${TX.toFixed(6)};
      void main() {
        if (vD > vCov) discard;
        if (texture(uFill, (vP.xz + uR) / (2.0 * uR)).r > 0.5) discard;   // 被岩浆石、沙子填出来的陆地
        vec2 t = floor(vP.xz / TXS);
        vec2 q = (t + 0.5) * TXS;
        float depth = clamp(1.0 - vD / vCov, 0.0, 1.0);
        if (vV > 0.5) {   // 落下来的水：竖着一道道往下冲的白和浅蓝
          vec2 tv = floor(vec2(vP.x + vP.z, vP.y) / TXS);
          float st = h21(vec2(tv.x, floor(tv.y * 0.35 + uTime * 9.0 + h21(vec2(tv.x, 1.0)) * 7.0)));
          vec3 c = st > 0.78 ? vec3(0.94, 0.98, 1.0) : st > 0.4 ? vec3(0.56, 0.8, 0.94) : vec3(0.42, 0.68, 0.9);
          gl_FragColor = vec4(s2l(c) * min(uLight, vec3(1.1)), st > 0.78 ? 0.95 : 0.8);
          #include <colorspace_fragment>
          return;
        }
        // 小波浪的法线（三组正弦叠起来；下雨时更碎）
        float a = 0.00007 + 0.00006 * uRain;
        float p1 = q.x * 900.0 + uTime * 1.7, p2 = q.y * 760.0 - uTime * 1.3, p3 = (q.x + q.y) * 1400.0 + uTime * 2.6, p4 = (q.x - q.y) * 2100.0 - uTime * 3.4;
        float dx = a * (900.0 * cos(p1) + 0.6 * 1400.0 * cos(p3) + uRain * 0.5 * 2100.0 * cos(p4));
        float dz = a * (760.0 * cos(p2) + 0.6 * 1400.0 * cos(p3) - uRain * 0.5 * 2100.0 * cos(p4));
        vec3 N = normalize(vec3(-dx, 1.0, -dz)), V = normalize(uCam - vP), L = normalize(uSunDir);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(vec3(0.8, 0.88, 0.96), vec3(0.5, 0.7, 0.94), clamp(R.y * 1.4, 0.0, 1.0));
        float spec = pow(max(dot(R, L), 0.0), 140.0) * uSunK;
        // 水体：浅处青绿（透得见底）→ 深处蓝
        vec3 body = mix(vec3(0.36, 0.8, 0.8), vec3(0.2, 0.5, 0.78), smoothstep(0.1, 0.6, depth));
        body = mix(body, vec3(0.14, 0.36, 0.66), smoothstep(0.6, 1.0, depth));
        float al = mix(0.32, 0.86, smoothstep(0.05, 0.75, depth));
        // 浅水底的焦散：水底一道道亮纹
        float ca = abs(sin(t.x * 0.55 + uTime * 1.3 + sin(t.y * 0.4 + uTime))) * abs(sin(t.y * 0.5 - uTime * 1.1 + sin(t.x * 0.35)));
        body += vec3(0.25, 0.3, 0.25) * smoothstep(0.7, 0.9, ca) * (1.0 - smoothstep(0.2, 0.6, depth));
        vec3 c = mix(body, sky, fres * 0.85);
        al = max(al, fres * 0.9);
        c += vec3(1.0, 0.95, 0.85) * spec * 1.6; al = min(1.0, al + spec);
        if (h21(t + floor(uTime * 4.0)) > 0.997 - uRain * 0.02) { c = vec3(0.9, 0.96, 1.0); al = 0.95; }   // 雨点溅起的白点
        // 岸边一圈白浪：贴着岸，一涌一涌
        float surf = vPond > 0.5 ? 0.07 + 0.05 * sin(uTime * 1.6 + (t.x + t.y) * 0.18) + 0.025 * h21(floor(t / 2.0)) : 0.04 * step(0.7, h21(floor(t / 2.0) + floor(uTime * 3.0)));   // 溪边只零星几点白（不然整条溪发白）
        if (depth < surf) { c = vec3(0.95, 0.98, 1.0); al = 0.92; }
        else if (depth < surf + 0.035 && h21(t + floor(uTime * 2.0)) > 0.5) { c = mix(c, vec3(0.95, 0.98, 1.0), 0.6); al = max(al, 0.7); }
        // 结冰：淡蓝白的冰面，一道道白的裂纹；冰从岸边往里结
        if (uIce > 0.02 && h21(floor(t / 2.0) + 2.3) < uIce * (1.2 - depth * 0.6)) {
          c = vec3(0.8, 0.9, 0.97) * (0.95 + 0.05 * h21(floor(t / 3.0)));
          if (mod(t.x + t.y * 2.0, 9.0) < 1.0 && h21(t * 0.3) > 0.4) c = vec3(0.96, 0.99, 1.0);
          al = 0.94;
        }
        gl_FragColor = vec4(s2l(c) * min(uLight, vec3(1.15)), al);
        #include <colorspace_fragment>
      }`,
  });
  return { geometry: g, material: mat, uniforms: u };
}

// ---------- 树：按方块搭（1.6 mm 一块）。树冠是几团"球"拼起来、边上啃掉几块；顶上一层亮、底下一层暗（像素村落的两色树冠） ----------
const LOG = '#7a5a3c', BIRCH = '#e4e0d6', SPRUCE_LOG = '#5e4630';
export const LEAF = {
  oak: ['#4e8434', '#568c38', '#4a7e32'], birch: ['#6e9440', '#789c46'], spruce: ['#3f7450', '#447a54'], pine: ['#467648', '#4c7c4c'],
  cypress: ['#467446'], big: ['#4e8436', '#56883a'], bush: ['#527e38', '#5a863c'],
  maple: ['#c06a40', '#c87848', '#b86240'], golden: ['#c8a44c', '#d0ae56', '#c09a48'], rust: ['#c08048', '#b87844'], blossom: ['#e0a8b4', '#e8b8c2'], plum: ['#9a7aa0', '#a484aa'],
  jacaranda: ['#a090c8', '#a898d0'], bluespruce: ['#5a8a8a', '#60908e'], willow: ['#6e9a44', '#78a24a'], acacia: ['#86983e', '#8ea044'], palm: ['#60984a', '#68a050'], cactus: ['#64965a', '#6c9e60'],
};
const shadeHex = (hex, k) => { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return '#' + c.getHexString(); };
export const TREE_KINDS_ALL = ['oak', 'birch', 'spruce', 'pine', 'cypress', 'bush', 'big', 'maple', 'golden', 'rust', 'blossom', 'jacaranda', 'bluespruce', 'willow', 'acacia', 'palm', 'cactus'];
export function treeGeometry(kind, seed = 1) {
  const q = rng(seed * 7919 + kind.length * 31);
  const cells = new Map(), key = (x, y, z) => `${x},${y},${z}`;
  const put = (x, y, z, c) => cells.set(key(x, y, z), c);
  const leafCol = (pal) => pal[Math.floor(q() * pal.length)];
  const leaf = (x, y, z, c) => { if (!cells.has(key(x, y, z))) cells.set(key(x, y, z), [c, 2, 'L']); };
  // 一团树叶：椭球，边上随机啃掉
  const blob = (cx, cy, cz, rx, ry, rz, pal, bite = 0.35) => {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
      if (d > 1.05) continue;
      if (d > 0.62 && q() < bite) continue;
      leaf(x, y, z, leafCol(pal));
    }
  };
  const trunk = (h, c, pat = 1, w = 1, lean = [0, 0]) => {
    for (let y = 0; y < h; y++) { const ox = Math.round(lean[0] * y / h), oz = Math.round(lean[1] * y / h); for (let x = 0; x < w; x++) for (let z = 0; z < w; z++) put(x + ox, y, z + oz, [c, pat]); }
  };
  const branch = (x0, y0, dx, dz, n, c) => { for (let i = 1; i <= n; i++) put(x0 + dx * i, y0 + Math.floor(i / 2), dz * i, [c, 1]); };
  if (kind === 'oak' || kind === 'maple' || kind === 'golden' || kind === 'rust' || kind === 'blossom' || kind === 'jacaranda') {
    // 盆景式：主干往上，分出 2–3 根斜枝；每根枝头一片扁平的云团，顶上一片最大的；云团之间留缝，看得见枝
    const pal = LEAF[kind], h = 6 + Math.floor(q() * 3);
    const lean = [Math.round((q() - 0.5) * 2), Math.round((q() - 0.5) * 2)];
    trunk(h, LOG, 1, 1, lean);
    const tx = lean[0], tz = lean[1];
    const nb = 2 + Math.floor(q() * 2);
    for (let i = 0; i < nb; i++) {
      const an = i / nb * 6.283 + q() * 0.8, len = 3 + Math.floor(q() * 2), y0 = h - 3 + Math.floor(q() * 2);
      const dx = Math.cos(an), dz = Math.sin(an);
      let x = tx, z = tz, y = y0;
      for (let k = 1; k <= len; k++) { x = tx + Math.round(dx * k); z = tz + Math.round(dz * k); y = y0 + Math.floor(k * 0.7); put(x, y, z, [LOG, 1]); }
      blob(x, y + 1, z, 2.4 + q() * 0.8, 1.2, 2.2 + q() * 0.8, pal, 0.3);
    }
    blob(tx, h + 2, tz, 3.0 + q() * 0.6, 1.6, 2.8 + q() * 0.6, pal, 0.3);
    if (q() < 0.6) blob(tx + Math.round((q() - 0.5) * 2), h + 4, tz, 1.8, 0.9, 1.8, pal, 0.35);
  } else if (kind === 'birch') {
    const h = 7 + Math.floor(q() * 3), r = 2 + q() * 0.6;
    blob(0, h, 0, r, r * 1.5, r, LEAF.birch, 0.45);
    blob((q() - 0.5) * 2, h - 2.5, (q() - 0.5) * 2, r * 0.8, r * 0.8, r * 0.8, LEAF.birch, 0.5);
    trunk(h + 1, BIRCH, 3);
  } else if (kind === 'spruce' || kind === 'bluespruce') {   // 云杉：一层层枝盘，越往上越窄；每层边上往下垂一格；层间露树干
    const h = 12 + Math.floor(q() * 4), tiers = 5 + Math.floor(q() * 2), pal = LEAF[kind];
    trunk(h, SPRUCE_LOG);
    for (let i = 0; i < tiers; i++) {
      const y = 3 + Math.round(i * (h - 3) / tiers), r = (1 - i / tiers) * (3.8 + q() * 0.5) + 0.6;
      for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
        const d = Math.hypot(x, z) + (q() - 0.5) * 0.6;
        if (d <= r) leaf(x, y, z, leafCol(pal));
        if (d <= r - 1.1) leaf(x, y + 1, z, leafCol(pal));
        if (d > r - 1.0 && d <= r && q() < 0.55) leaf(x, y - 1, z, leafCol(pal));   // 枝梢下垂
      }
    }
    leaf(0, h, 0, pal[0]); leaf(0, h + 1, 0, pal[0]); leaf(0, h + 2, 0, pal[0]);
  } else if (kind === 'pine') {     // 油松：树干高、微微歪，顶上两三片平平的松针盘
    const h = 10 + Math.floor(q() * 4), lean = [Math.round((q() - 0.5) * 3), Math.round((q() - 0.5) * 3)];
    trunk(h, SPRUCE_LOG, 1, 1, lean);
    const pads = 2 + Math.floor(q() * 2);
    for (let i = 0; i < pads; i++) {
      const y = h - i * 2.6, ox = lean[0] * (y / h) + (q() - 0.5) * 3, oz = lean[1] * (y / h) + (q() - 0.5) * 3, r = 3.2 - i * 0.6 + q() * 0.6;
      blob(ox, y, oz, r, 1.0, r * (0.8 + q() * 0.3), LEAF.pine, 0.3);
      if (i > 0) branch(Math.round(lean[0] * y / h), Math.round(y) - 1, Math.sign(ox - lean[0] * y / h) || 1, 0, 2, SPRUCE_LOG);
    }
  } else if (kind === 'willow') {   // 柳树：粗短的干，圆冠，四周一缕缕垂到地面的柳条
    const h = 6 + Math.floor(q() * 2), r = 3.4;
    trunk(h, LOG, 1, 1); branch(0, h - 2, 1, 0, 2, LOG); branch(0, h - 1, -1, 0, 2, LOG);
    blob(0, h + 1, 0, r, 1.8, r, LEAF.willow, 0.25);
    for (let a = 0; a < 14; a++) {
      const an = a / 14 * 6.283 + q() * 0.3, rx = Math.round(Math.cos(an) * r * 0.95), rz = Math.round(Math.sin(an) * r * 0.95), len = 3 + Math.floor(q() * 4);
      for (let y = h; y > h - len; y--) leaf(rx, y, rz, leafCol(LEAF.willow));
    }
  } else if (kind === 'acacia') {   // 金合欢：斜着分叉的干，顶上一片平平的伞
    const h = 6 + Math.floor(q() * 2), dx = q() < 0.5 ? 1 : -1;
    trunk(3, LOG);
    for (let i = 0; i < 4; i++) { put(dx * (1 + i), 3 + i, 0, [LOG, 1]); put(-dx * Math.floor(i / 2), 3 + i, 0, [LOG, 1]); }
    blob(dx * 4, h + 1, 0, 3.4, 0.9, 2.8, LEAF.acacia, 0.3); blob(-dx, h, 0.5, 2.6, 0.8, 2.4, LEAF.acacia, 0.3);
  } else if (kind === 'palm') {     // 棕榈：弯弯的细干，顶上八片往下垂的叶
    const h = 9 + Math.floor(q() * 3), bend = q() < 0.5 ? 1 : -1;
    for (let y = 0; y < h; y++) put(Math.round(bend * (y / h) ** 2 * 2.5), y, 0, ['#9a7a52', 1]);
    const tx = Math.round(bend * 2.5);
    for (let a = 0; a < 8; a++) {
      const dx = Math.round(Math.cos(a * 0.785)), dz = Math.round(Math.sin(a * 0.785));
      for (let i = 1; i <= 4; i++) leaf(tx + dx * i, h - Math.floor(i * i / 5), dz * i, leafCol(LEAF.palm));
    }
    leaf(tx, h, 0, LEAF.palm[0]); leaf(tx, h + 1, 0, LEAF.palm[1]);
  } else if (kind === 'cactus') {   // 仙人掌：一根柱子 + 一两条胳膊；有的顶上开一朵花
    const h = 5 + Math.floor(q() * 4);
    for (let y = 0; y < h; y++) put(0, y, 0, [leafCol(LEAF.cactus), 4]);
    const arm = (d, y0, len) => { put(d, y0, 0, [LEAF.cactus[0], 4]); for (let y = 0; y < len; y++) put(d * 2, y0 + y, 0, [LEAF.cactus[1], 4]); };
    arm(1, 2 + Math.floor(q() * 2), 2 + Math.floor(q() * 2)); if (q() < 0.6) arm(-1, 3, 2);
    if (q() < 0.5) put(0, h, 0, [q() < 0.5 ? '#e870a0' : '#f0c040', 0]);
  } else if (kind === 'cypress') {  // 侧柏：一根窄窄的深绿柱子
    const h = 10 + Math.floor(q() * 4);
    blob(0, h * 0.55 + 1, 0, 1.7, h * 0.5, 1.7, LEAF.cypress, 0.25);
    trunk(3, SPRUCE_LOG);
  } else if (kind === 'bush') {
    blob(0, 1, 0, 1.9 + q() * 0.5, 1.4, 1.9 + q() * 0.5, seed % 2 ? LEAF.bush : LEAF.plum.concat(LEAF.bush, LEAF.bush), 0.3);
    put(0, 0, 0, [LOG, 1]);
  } else if (kind === 'big') {      // 草甸里的大橡树：两格粗、板根、很大的树冠
    const h = 9;
    trunk(h, LOG, 1, 2);
    put(-1, 0, 0, [LOG, 1]); put(2, 0, 1, [LOG, 1]); put(0, 0, 2, [LOG, 1]); put(1, 0, -1, [LOG, 1]); put(-1, 1, 1, [LOG, 1]);
    branch(1, h - 3, 1, 0, 3, LOG); branch(0, h - 2, -1, 0, 3, LOG);
    blob(0.5, h + 2, 0.5, 5.6, 3.6, 5.6, LEAF.big);
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + q(); blob(0.5 + Math.cos(a) * 4.5, h + 1 + q() * 2.5, 0.5 + Math.sin(a) * 4.5, 3, 2.4, 3, LEAF.big); }
  }
  // 三色树冠（Terraglass 的树就是靠这个立起来的）：顶上露天的亮、偏暖黄；底下悬空的暗、偏冷；朝太阳那侧（+x、−z）再亮一点
  const HI = new THREE.Color('#e8f0a0'), LO = new THREE.Color('#3a5a6a');
  for (const [k, c] of cells) {
    if (c[2] !== 'L') continue;
    const [x, y, z] = k.split(',').map(Number);
    const up = cells.has(key(x, y + 1, z)), dn = cells.has(key(x, y - 1, z));
    const sunSide = !cells.has(key(x + 1, y, z)) || !cells.has(key(x, y, z - 1));
    const col = new THREE.Color(c[0]);
    if (!up) col.lerp(HI, 0.12).multiplyScalar(1.06);
    else if (!dn) col.lerp(LO, 0.35).multiplyScalar(0.78);
    else if (!sunSide) col.multiplyScalar(0.86);
    if (sunSide && up) col.multiplyScalar(1.05);
    cells.set(k, ['#' + col.getHexString(), 2]);
  }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const k of cells.keys()) { const p = k.split(',').map(Number); for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a] + 1); } }
  const ox = kind === 'big' ? -B : -B / 2;
  return voxelGeometry(mn, mx, (x, y, z) => cells.has(key(x, y, z)), (x, y, z) => cells.get(key(x, y, z)), B, [ox, 0, ox], true);
}
// 水晶簇：碎石坡、崖上的发光晶体（一簇三五根，底下淡紫、往上青白、尖上白）
export function crystalGeometry(seed = 1) {
  const q = rng(seed * 131 + 7), cells = new Map(), key = (x, y, z) => `${x},${y},${z}`;
  const n = 3 + Math.floor(q() * 3);
  for (let i = 0; i < n; i++) {
    const x = i === 0 ? 0 : Math.round((q() - 0.5) * 4), z = i === 0 ? 0 : Math.round((q() - 0.5) * 4), h = i === 0 ? 6 + Math.floor(q() * 3) : 2 + Math.floor(q() * 4);
    const lean = i === 0 ? 0 : Math.sign(x || 1);
    for (let y = 0; y < h; y++) {
      const xx = x + (y > h / 2 ? lean : 0), c = y === h - 1 ? '#f2fcff' : y > h * 0.55 ? '#a8eef4' : y > h * 0.25 ? '#8ccfe8' : '#b49ae6';
      cells.set(key(xx, y, z), [c, 5]);
      if (i === 0 && y < h - 2) cells.set(key(xx + 1, y, z), [y > h * 0.5 ? '#9ee2f0' : '#a890e0', 5]);
    }
  }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const k of cells.keys()) { const p = k.split(',').map(Number); for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a] + 1); } }
  return voxelGeometry(mn, mx, (x, y, z) => cells.has(key(x, y, z)), (x, y, z) => cells.get(key(x, y, z)), B, [-B / 2, 0, -B / 2], true, false);
}
// 林子里的小东西：倒木、树桩
export function logGeometry(len = 7) { return voxelGeometry([0, 0, 0], [len, 1, 1], () => true, (x, y, z, f) => f === 0 || f === 1 ? ['#a88a60', 1] : [LOG, 1], B, [-len * B / 2, 0, -B / 2], true); }
export function stumpGeometry() { return voxelGeometry([0, 0, 0], [1, 2, 1], () => true, (x, y, z, f) => f === 2 ? ['#b8966a', 1] : [LOG, 1], B, [-B / 2, 0, -B / 2], true); }

// ---------- 动物（PX 为单位的小方块，原点在脚底中心，朝 +z）：自然的毛色，不描边、不画腮红 ----------
export function animalGeometry() {
  const F = '#8a6a4c', Fd = '#6e5440', Fl = '#b89a78', W = '#e8e2d8', K = '#2a2420', P = 4;   // P：皮毛贴图
  const rabbitBody = boxesGeometry([[-2, 1, -3, 2, 4, 2, (x, y, z, f) => [y < 2 ? Fd : F, P]], [-1, 2, -4, 1, 4, -3, [W, P]], [-2, 0, 0, -1, 1, 2, [Fd, P]], [1, 0, 0, 2, 1, 2, [Fd, P]], [-2, 0, -3, -1, 1, -1, [Fd, P]], [1, 0, -3, 2, 1, -1, [Fd, P]]]);
  const rabbitHead = boxesGeometry([[-1, -1, -1, 2, 2, 2, (x, y, z, f) => f === 4 && y === 0 && (x === -1 || x === 1) ? K : [F, P]],
    [-1, 2, -2, 0, 4, 0, [Fd, P]], [1, 2, -2, 2, 4, 0, [Fd, P]]]);
  const deerBody = boxesGeometry([[-2, 7, -5, 2, 12, 4, (x, y, z, f) => f === 3 || y === 7 ? [Fl, P] : ['#8c5e3a', P]],
    [-2, 0, 2, -1, 7, 3, ['#6e4a30', P]], [1, 0, 2, 2, 7, 3, ['#6e4a30', P]], [-2, 0, -4, -1, 7, -3, ['#6e4a30', P]], [1, 0, -4, 2, 7, -3, ['#6e4a30', P]], [-1, 10, -6, 1, 12, -5, [W, P]], [-1, 11, 4, 1, 15, 6, ['#8c5e3a', P]]]);
  const deerHead = boxesGeometry([[-2, -1, -1, 2, 3, 4, (x, y, z, f) => f === 4 && y === 0 ? K : f === 4 && y === 1 && (x === -2 || x === 1) ? K : ['#946640', P]], [-3, 2, 0, -2, 3, 1, ['#7a5236', P]], [2, 2, 0, 3, 3, 1, ['#7a5236', P]],
    [-2, 3, 0, -1, 7, 1, '#d8ccb4'], [-4, 6, 0, -1, 7, 1, '#d8ccb4'], [-3, 7, 0, -2, 8, 1, '#d8ccb4'], [1, 3, 0, 2, 7, 1, '#d8ccb4'], [1, 6, 0, 4, 7, 1, '#d8ccb4'], [2, 7, 0, 3, 8, 1, '#d8ccb4']]);
  const foxBody = boxesGeometry([[-2, 3, -4, 2, 7, 3, (x, y, z, f) => f === 3 || y === 3 ? [W, P] : ['#d06a2a', P]], [-2, 0, 1, -1, 3, 2, K], [1, 0, 1, 2, 3, 2, K], [-2, 0, -3, -1, 3, -2, K], [1, 0, -3, 2, 3, -2, K],
    [-1, 4, -9, 2, 7, -4, (x, y, z) => z < -7 ? [W, P] : ['#c4622a', P]]]);
  const foxHead = boxesGeometry([[-2, -1, -1, 2, 2, 3, (x, y, z, f) => f === 4 && y === 0 && (x === -2 || x === 1) ? K : y < 0 ? [W, P] : ['#d06a2a', P]], [-1, -1, 3, 1, 1, 5, (x, y, z) => z === 4 && y === 0 ? K : [W, P]], [-2, 2, 0, -1, 4, 1, ['#a8501e', P]], [1, 2, 0, 2, 4, 1, ['#a8501e', P]]]);
  const frog = boxesGeometry([[-2, 0, -2, 2, 2, 2, (x, y, z, f) => f === 2 && (x === -2 || x === 1) && z === 1 ? K : ['#5a8a3a', P]], [-2, 2, 0, -1, 3, 2, (x, y, z, f) => f === 2 ? '#e8e0b0' : ['#5a8a3a', P]], [1, 2, 0, 2, 3, 2, (x, y, z, f) => f === 2 ? '#e8e0b0' : ['#5a8a3a', P]], [-3, 0, -2, -2, 1, 0, ['#4a7430', P]], [2, 0, -2, 3, 1, 0, ['#4a7430', P]]]);
  return { rabbitBody, rabbitHead, deerBody, deerHead, foxBody, foxHead, frog,
    headAt: { rabbit: [0, 3.5 * PX, 2.5 * PX], deer: [0, 13 * PX, 4.5 * PX], fox: [0, 6.5 * PX, 3 * PX] } };
}

// ---------- 野外的小东西 ----------
export function propsGeometry() {
  // 石块：一到三个苔藓圆石方块（方块大小，和地形一样）
  const mossy = (x, y, z, f) => f === 2 && ((x * 7 + z * 3) % 5 < 2) ? ['#6a8a4a', 0] : ['#8a8a8a', 6];
  const boulder = voxelGeometry([-2, 0, -2], [2, 3, 2], (x, y, z) => { const d = ((x + 0.5) / 2.2) ** 2 + ((y + 0.2) / 2.6) ** 2 + ((z + 0.5) / 2) ** 2; return d < 1 && !(y === 2 && (x + z) % 2 === 0); }, mossy, B, [0, 0, 0], true);
  const lily = boxesGeometry([[-3, 0, -3, 3, 1, 3, (x, y, z) => x >= 0 && x <= 0 && z >= 0 ? null : ['#4a8a34', 0]]], [0, 0, 0], TX);
  const duck = boxesGeometry([[-3, 0, -2, 3, 3, 2, ['#e8e4dc', 4]], [1, 3, -1, 4, 6, 1, (x, y, z, f) => f === 0 && y === 4 ? '#2a2420' : ['#3a6a3a', 4]], [4, 4, -1, 6, 5, 1, '#d89a3a']]);
  const sapling = boxesGeometry([[0, 0, 0, 1, 4, 1, ['#6e5236', 1]], [-1, 3, 0, 2, 5, 1, ['#5a9a3a', 2]], [0, 3, -1, 1, 6, 2, ['#4f8a32', 2]]]);
  return { boulder, lily, duck, sapling };
}

// ---------- 交叉面片的植物（草、花、蕨、芦苇、蘑菇）：两块交叉的方块大小面片，贴图按像素抠出来 ----------
export function crossGeometry(heightBlocks = 1) {
  const h = PB * heightBlocks, w = PB * 0.5;
  const p = [-w, 0, -w, w, 0, w, w, h, w, -w, h, -w, -w, 0, w, w, 0, -w, w, h, -w, -w, h, w];
  const uv = [0, 0, 1, 0, 1, heightBlocks, 0, heightBlocks, 0, 0, 1, 0, 1, heightBlocks, 0, heightBlocks];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}
// 植物贴图：x 0–7、y 0–（8 × 高几格）；返回 vec4(颜色, 有没有)。tint = 实例颜色（草的群系色、花色）
export const PLANT_GLSL = /* glsl */`
vec4 plantTex(int kind, vec2 t, vec3 tint) {
  float x = t.x, y = t.y, n = h21(t);
  if (kind == 0) {            // 草：一根根草叶，高矮不一
    float hb = 2.0 + floor(h21(vec2(x, 1.0)) * 6.0);
    if (h21(vec2(x, 2.0)) < 0.3 || y >= hb) return vec4(0.0);
    return vec4(tint * (0.72 + 0.4 * y / 8.0) * (0.92 + 0.1 * n), 1.0);
  }
  if (kind == 1) {            // 蕨：中间一根茎，两边一片片小叶
    float half_ = 3.5 - y * 0.42;
    if (y > 7.0 || abs(x - 3.5) > half_ + 0.5) return vec4(0.0);
    if (abs(x - 3.5) > 0.6 && mod(x + y, 2.0) < 1.0) return vec4(0.0);
    return vec4(tint * (0.75 + 0.3 * n), 1.0);
  }
  if (kind == 2) {            // 花：绿茎 + 花头（实例颜色），中间一个花蕊
    if (y < 5.0) return (x == 3.0 || (x == 4.0 && y == 2.0) || (x == 2.0 && y == 3.0)) ? vec4(s2l(vec3(0.34, 0.56, 0.24)) * (0.9 + 0.2 * n), 1.0) : vec4(0.0);
    if (y > 7.0 || x < 2.0 || x > 4.0) return vec4(0.0);
    if (x == 3.0 && y == 6.0) return vec4(s2l(vec3(0.95, 0.82, 0.3)), 1.0);
    return vec4(tint * (0.9 + 0.15 * n), 1.0);
  }
  if (kind == 3) {            // 芦苇：两根长秆，顶上褐色的穗（两格高）
    bool stalk = x == 2.0 || x == 5.0 || (x == 3.0 && y < 11.0);
    if (!stalk || y > 15.0 - (x == 5.0 ? 2.0 : 0.0)) return vec4(0.0);
    return y > 11.0 && x != 3.0 ? vec4(s2l(vec3(0.5, 0.36, 0.22)) * (0.9 + 0.2 * n), 1.0) : vec4(tint * (0.8 + 0.25 * n), 1.0);
  }
  if (kind == 4) {            // 蘑菇：短柄 + 帽子（实例颜色），帽子上几个白点
    if (y < 3.0) return (x == 3.0 || x == 4.0) ? vec4(s2l(vec3(0.86, 0.82, 0.74)), 1.0) : vec4(0.0);
    if (y > 5.0 || x < 1.0 || x > 6.0 || (y == 5.0 && (x < 2.0 || x > 5.0))) return vec4(0.0);
    return (mod(x + y * 3.0, 4.0) < 1.0 && y > 3.0) ? vec4(s2l(vec3(0.94, 0.92, 0.88)), 1.0) : vec4(tint, 1.0);
  }
  return vec4(0.0);
}
`;

// ---------- 云：方块游戏那种平平的、一格一格的云 ----------
// 每朵云用固定的种子生成一张格子图（cell = 2 方块宽、1.25 方块厚），渲染层按 alpha 隐去一部分格子
export const CLOUD_CELL = 0.0032, CLOUD_H = 0.0024;   // 云也按细格子（是地形方块的两倍）
export function cloudCells(id, rCells = 7) {
  const q = rng(id * 1013 + 7), out = [];
  const ax = rCells * (0.9 + q() * 0.3), az = rCells * (0.65 + q() * 0.25), lumps = Array.from({ length: 4 }, () => [(q() - 0.5) * rCells, (q() - 0.5) * rCells * 0.7, 2 + q() * 3]);
  for (let i = -rCells - 2; i <= rCells + 2; i++) for (let j = -rCells - 2; j <= rCells + 2; j++) {
    let inside = (i / ax) ** 2 + (j / az) ** 2 < 1;
    for (const [lx, lz, lr] of lumps) if ((i - lx) ** 2 + (j - lz) ** 2 < lr * lr) inside = true;
    if (!inside) continue;
    const edge = (i / ax) ** 2 + (j / az) ** 2;
    out.push({ i, j, h: edge < 0.35 && q() < 0.5 ? 2 : 1, r: q(), edge });
  }
  return out;
}
