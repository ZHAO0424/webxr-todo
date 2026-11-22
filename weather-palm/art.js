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
  if (k == 7) { vec2 px = floor(faceUV(P, N) * 4.0 + 0.001); float r = h21(px + N.xz * 5.0 + N.y * 9.0); return base * (r > 0.82 ? 1.1 : r < 0.18 ? 0.9 : 0.98 + 0.05 * r); }   // 堆积方块：每面 4×4 像素（单位方块坐标）
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
const hq0 = hq.slice(), dug = new Uint8Array(NG * NG);   // 原始高度（最多往下挖 DIG_MAX 块）；铲子挖过的格子（顶面露土）
export const DIG_MAX = 4;
export const dugAt = (x, z) => { const i = Math.floor((x + S.R) / CELL), j = Math.floor((z + S.R) / CELL); return i >= 0 && j >= 0 && i < NG && j < NG && dug[j * NG + i] === 1; };
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

// 地形分成 CH×CH 格一块：铲子挖一下只重建碰到的那几块（整座岛重建一次要几十毫秒，一块几毫秒）
const CH = 54, NCH = Math.ceil(NG / CH);   // 4×4 块：多一块多一次 draw call，块太小 draw call 超预算
export function buildTerrain(shared, SHADE_GLSL) {
  let pos, nor, kind, ext, top, bot, idx;
  const quad = (p, n, k, e) => { const b = pos.length / 3; const tp = Math.max(...p.map(v => v[1])), bt = Math.min(...p.map(v => v[1])); for (const v of p) pos.push(...v); for (let i = 0; i < 4; i++) { nor.push(...n); kind.push(k); ext.push(e); top.push(tp); bot.push(bt); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  const X = i => -S.R + i * CELL;
  const used = new Uint8Array(NG * NG);
  const kindAt = (i, j) => {
    const t = tq[j * NG + i], h = hq[j * NG + i] - S.PLINTH;
    const q = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, r = q - Math.floor(q), wob = (Math.sin(i * 0.7) + Math.sin(j * 0.9)) * 0.004 + (r - 0.5) * 0.006;
    if (dug[j * NG + i]) return 11;   // 铲子挖开的：露出的土
    if (t === T.SNOW || t === T.ROCK || t === T.FOREST) {
      if (h + wob > 0.072) return 3;
      if (t !== T.FOREST && h + wob > 0.058) return 6;
      if (t === T.ROCK) return 6;
    }
    const x = -S.R + (i + 0.5) * CELL, z = -S.R + (j + 0.5) * CELL;
    if (t === T.ROCK && S.inCanyon(x, z)) return 7;
    const kk = KIND[t] ?? 0;
    if (kk <= 2) { const b = S.biomeAt(x, z); if (b === 'sakura') return 8; if (b === 'maple') return 9; if (b === 'ginkgo') return 10; }
    return kk;
  };
  // 顶面：二维贪心，同高同种类的拼成矩形
  const KA = new Int8Array(NG * NG).fill(-1);
  const setKA = (i, j) => { if (Number.isNaN(hq[j * NG + i])) return; const kk = kindAt(i, j); KA[j * NG + i] = (kk <= 2 || kk >= 8) ? kk + 16 * sq[j * NG + i] : kk; };
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) setKA(i, j);
  const same = (a, b) => KA[b] >= 0 && !used[b] && hq[b] === hq[a] && KA[b] === KA[a];
  function chunkGeometry(c) {
  const i0 = (c % NCH) * CH, j0 = Math.floor(c / NCH) * CH, i1 = Math.min(NG, i0 + CH), j1 = Math.min(NG, j0 + CH);
  pos = []; nor = []; kind = []; ext = []; top = []; bot = []; idx = [];
  for (let j = j0; j < j1; j++) used.fill(0, j * NG + i0, j * NG + i1);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const a = j * NG + i; if (KA[a] < 0 || used[a]) continue;
    let w = 1; while (i + w < i1 && same(a, j * NG + i + w)) w++;
    let hgt = 1;
    grow: while (j + hgt < j1) { for (let q = 0; q < w; q++) if (!same(a, (j + hgt) * NG + i + q)) break grow; hgt++; }
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
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1;) {
        const s0 = sideKey(i, j, di, dj); if (!s0) { j++; continue; }
        let n = 1; while (j + n < j1 && eq(s0, sideKey(i, j + n, di, dj))) n++;
        const x = di === 1 ? X(i + 1) : X(i), z0 = X(j), z1 = X(j + n);
        if (di === 1) quad([[x, s0.lo, z1], [x, s0.lo, z0], [x, s0.h, z0], [x, s0.h, z1]], [1, 0, 0], s0.k, s0.e);
        else quad([[x, s0.lo, z0], [x, s0.lo, z1], [x, s0.h, z1], [x, s0.h, z0]], [-1, 0, 0], s0.k, s0.e);
        j += n;
      }
    } else {
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1;) {
        const s0 = sideKey(i, j, di, dj); if (!s0) { i++; continue; }
        let n = 1; while (i + n < i1 && eq(s0, sideKey(i + n, j, di, dj))) n++;
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
  return g;
  }
  const chunks = Array.from({ length: NCH * NCH }, (_, c) => chunkGeometry(c));
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
      // 红石峡谷的岩层（照美国西南 / 新疆的红砂岩）：深红、橙、奶白、锈红、橙粉一层层，层厚 1–3 块，层线微微起伏
      vec3 canyonStrata(vec3 P, vec2 t, float n) {
        float y = P.y / BK + 0.5 * sin(P.x * 120.0 + P.z * 70.0);
        float band = floor(y / 2.0), hb = h21(vec2(band, 3.9));
        vec3 c = hb < 0.3 ? vec3(0.78, 0.34, 0.24) : hb < 0.5 ? vec3(0.9, 0.54, 0.28) : hb < 0.64 ? vec3(0.94, 0.85, 0.68) : hb < 0.82 ? vec3(0.7, 0.38, 0.28) : vec3(0.9, 0.62, 0.52);
        return c * (0.95 + 0.07 * n);
      }
      vec3 texStone(vec2 t, float n) { float b = vnoise(t * 0.5); return STONE * (b > 0.62 ? 1.06 : b < 0.3 ? 0.93 : 1.0) * (0.97 + 0.05 * n); }
      vec3 texSand(float n, float n2) { return SAND * (0.96 + 0.05 * n); }
      vec3 texGravel(vec2 t, float n) { float c = h21(t); return (c > 0.6 ? vec3(0.64, 0.62, 0.6) : c > 0.3 ? vec3(0.58, 0.56, 0.56) : vec3(0.62, 0.56, 0.5)) * (0.97 + 0.04 * n); }
      vec3 texSnow(float n) { return SNOWC * (0.97 + 0.03 * n); }
      // 草的颜色（群系色调）：长得好是绿，缺水发黄，烧过发灰
      bool canyonZone(vec3 P) { return P.x > 0.034 + 0.007 * sin(P.z * 50.0) && P.z > -0.032 && P.z < 0.088 && length(P.xz) < ${(S.R - 0.018).toFixed(4)}; }
      vec2 gXZ;   // 当前像素的位置（群系色按地方变）
      vec3 grassTint(float G, float M, int k) {
        float reg = vnoise(gXZ * 38.0 + 3.0), reg2 = vnoise(gXZ * 21.0 - 7.0);
        vec3 lush = k == 1 || (k >= 8 && k <= 10) ? vec3(0.4, 0.58, 0.3) : k == 2 ? vec3(0.46, 0.56, 0.34) : vec3(0.52, 0.68, 0.32);
        lush *= 0.97 + 0.06 * reg;                                       // 大片的明暗起伏，色相不变
        if (canyonZone(vec3(gXZ.x, 0.0, gXZ.y))) lush = mix(lush, vec3(0.72, 0.68, 0.4), 0.6);   // 峡谷台地上是干黄的荒漠草
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
        int kraw = int(vK + 0.5), soil = kraw / 16, k = kraw - soil * 16; gXZ = (floor((Pc.xz + uR) / BK) + 0.5) * BK - uR;
        vec4 s = texture(uMG, (Pc.xz + uR) / (2.0 * uR)); float M = s.r, G = s.g, SN = s.b, SM = s.a;
        vec3 col;
        if (N.y > 0.5) {
          vec3 tint = grassTint(G, M, k);
          if (k == 11) col = soil == 0 ? texDirt(n, n2) * (0.9 + 0.08 * n2) : texSoil(soil, t, Pc, n, n2) * 0.92;   // 铲子挖开的：新翻的土
          else if (k == 0 || k == 1 || k == 2 || (k >= 8 && k <= 10)) {
            // 草：一个个贴图像素深浅不一；长得不好的地方露出土
            bool bare = h21(t * 0.71 + 3.3) > smoothstep(0.05, 0.45, G) + 0.15;
            col = tint * (0.95 + 0.07 * n);
            if (bare) col = soil == 0 ? texDirt(n, n2) : texSoil(soil, t, Pc, n, n2);
            if (k == 1 && n2 > 0.94) col = vec3(0.56, 0.44, 0.3);   // 林地：零星落叶
            // 樱花林地上落满粉色花瓣、枫林地上是红叶、银杏林地上是金叶（树长起来才有：G 越高越多）
            float lit = smoothstep(0.35, 0.8, G);
            if (k == 8 && n2 < 0.55 * lit) col = n > 0.5 ? vec3(0.97, 0.76, 0.84) : vec3(0.99, 0.88, 0.92);
            if (k == 9 && n2 < 0.5 * lit) col = n > 0.6 ? vec3(0.9, 0.36, 0.22) : n > 0.25 ? vec3(0.94, 0.52, 0.24) : vec3(0.82, 0.3, 0.26);
            if (k == 10 && n2 < 0.5 * lit) col = n > 0.5 ? vec3(0.96, 0.8, 0.32) : vec3(0.92, 0.7, 0.26);
            if (k == 2 && M > 0.3 && vnoise(t * 0.7) > 0.62) col = vec3(0.4, 0.6, 0.7);   // 湿地：一洼洼浅水
            // 湿透了：草地上积水
            if (k == 0 && M > 0.8 && vnoise(t * 0.6 + 5.0) > 0.76 - (M - 0.8)) col = vec3(0.4, 0.6, 0.76);
          } else if (k == 3) col = texSnow(n);
          else if (k == 4) col = n2 > 0.8 ? texGravel(t, n) : texSand(n, n2);
          else if (k == 5) col = texGravel(t, n);
          else if (k == 7) col = vec3(0.82, 0.48, 0.32) * (0.93 + 0.1 * n);   // 峡谷台地顶的红砂岩
          else col = texStone(t, n);
          if (SN > 0.08 && h21(t * 0.53 + 9.1) < smoothstep(0.08, 0.6, SN)) col = texSnow(n);   // 积雪：一个个像素慢慢盖满
        } else {
          // 侧面：从这一面的顶往下数第几个方块
          float fromTop = (vTop - Pc.y) / BK, kb = floor(fromTop);
          float ty = mod(floor((vTop - Pc.y) / TXS), 4.0);   // 方块里从上往下第几个贴图像素
          float fringe = 1.0 + floor(h21(vec2(t.x, kb)) * 2.0);   // 草皮、雪往下挂 1–2 个像素，参差不齐
          if ((vTop - vBot) / BK < 1.5) fringe += 1.0;             // 只有一格高的小坎：草皮盖得更多，草地上不会满是褐色的线
          bool grassy = k == 0 || k == 1 || k == 2 || (k >= 8 && k <= 10);
          float stoneFrom = grassy || k == 11 ? 4.0 : k == 4 ? 3.0 : 0.0;
          if (vE > 0.5) stoneFrom += floor(h21(vec2(floor(Pc.x / BK), floor(Pc.z / BK))) * 2.0);
          if (kb < 0.5 && SN > 0.3) col = texSnow(n);   // 积了雪，侧面上沿也是白的
          else if (kb < 0.5 && grassy && G > 0.2 + 0.3 * h21(vec2(t.x, 3.0))) col = grassTint(G, M, k) * (0.92 + 0.05 * n);   // 荒的时候坎子上沿没有草皮
          else if (kb < 0.5 && k == 3) col = texSnow(n);
          else if (kb < stoneFrom) col = k == 4 ? texSand(n, n2) : (soil == 1 || soil == 2) ? texSoil(soil, t, Pc, n, n2) * 0.95 : texDirt(n, n2);
          else if (k == 7 || canyonZone(Pc)) col = canyonStrata(Pc, t, n);   // 峡谷：红、橙、奶白、锈红一层层
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
  // 铲子：挖掉 (x,z) 半径 r 里的地面（ok(x,z) 可以否掉某格），每格最多挖 n 块（总深不超过 DIG_MAX 块；最低的地方也能往下挖，底下至少留两块）；返回挖掉了几块
  const dirty = new Set();
  function dig(x, z, r, n = 1, ok = null) {
    let got = 0;
    const ia = Math.floor((x - r + S.R) / CELL), ib = Math.floor((x + r + S.R) / CELL), ja = Math.floor((z - r + S.R) / CELL), jb = Math.floor((z + r + S.R) / CELL);
    for (let j = Math.max(0, ja); j <= Math.min(NG - 1, jb); j++) for (let i = Math.max(0, ia); i <= Math.min(NG - 1, ib); i++) {
      const k = j * NG + i; if (Number.isNaN(hq[k])) continue;
      if (Math.hypot(-S.R + (i + 0.5) * CELL - x, -S.R + (j + 0.5) * CELL - z) > r) continue;
      if (ok && !ok(-S.R + (i + 0.5) * CELL, -S.R + (j + 0.5) * CELL)) continue;   // 调用方说这格不能挖（树下、水里）
      const floor = Math.max(2 * STEP, hq0[k] - DIG_MAX * STEP), m = Math.min(n, Math.round((hq[k] - floor) / STEP));
      if (m <= 0) continue;
      hq[k] = Math.round(hq[k] / STEP - m) * STEP; got += m; dug[k] = 1; ht[k] = Math.round(hq[k] / STEP);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NG || jj >= NG) continue; setKA(ii, jj); dirty.add(Math.floor(jj / CH) * NCH + Math.floor(ii / CH)); }
    }
    return got;
  }
  // 重建挖过的那几块，返回 [[块号, 新几何体]]（旧的由调用方 dispose）
  function refresh() { if (!dirty.size) return []; const out = [...dirty].map(c => [c, chunkGeometry(c)]); dirty.clear(); htTex.needsUpdate = true; return out; }
  return { chunks, material: mat, dig, refresh };
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
// ---------- 岛底：一个托着整座岛的半球（一层层往里收的体素，像浮空岛的底） ----------
// 每层 2 个方块高、方块 2 倍宽（离得远、看得少，省面数）；半径按扁一点的半球收，边上带点岩石的参差。
// 颜色按深度分层，和岛外沿剖面接上：红土 → 砂砾 → 地下水层（蓝）→ 暖灰岩层 → 发光的岩浆脉 → 紫灰基岩，最底下的尖上长着水晶。
// 都保持中灰以上——光学透视眼镜里暗 = 看不见。
export const UNDER_D = 0.13;   // 半球深（比岛半径浅一点，扁一些更像托盘）
export function buildUnderside() {
  const G2 = B * 2, LH = B * 2, R = S.R, N2 = Math.ceil(2 * R / G2), NL = Math.ceil(UNDER_D / LH);
  const X = i => -R + i * G2;
  const hash = (a, b) => { const q = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return q - Math.floor(q); };
  const rad = l => { const u = Math.min(1, (l + 0.5) * LH / UNDER_D); return R * Math.sqrt(Math.max(0, 1 - u * u)); };
  const solid = (i, j, l) => {
    if (l < 0 || l >= NL || i < 0 || j < 0 || i >= N2 || j >= N2) return false;
    const x = -R + (i + 0.5) * G2, z = -R + (j + 0.5) * G2, d = Math.hypot(x, z), a = Math.atan2(z, x);
    // 岩石参差：顶上两层贴着岛边不动，往下越来越参差
    const jag = l < 2 ? 0 : (0.5 * Math.sin(a * 5 + l * 0.7) + 0.35 * Math.sin(a * 11 - l * 1.3) + 0.6 * (hash(Math.round(a * 30), l) - 0.5)) * G2 * Math.min(1, l / 6) * 1.6;
    return d < Math.min(R - 0.0005, rad(l) + jag);
  };
  // 分层颜色（按这一层的深度比例 u）
  const band = (l) => {
    const u = (l + 0.5) * LH / UNDER_D;
    if (u < 0.06) return [0.74, 0.56, 0.44];        // 红土（接岛外沿）
    if (u < 0.14) return [0.7, 0.64, 0.58];         // 砂砾
    if (u < 0.18) return [0.5, 0.74, 0.86];         // 地下水层
    if (u < 0.3) return [0.76, 0.64, 0.5];          // 暖黄岩
    if (u < 0.42) return [0.66, 0.6, 0.6];          // 灰岩
    if (u < 0.46) return [1.0, 0.6, 0.22];          // 岩浆脉（发光）
    if (u < 0.6) return [0.7, 0.58, 0.52];          // 红褐岩
    if (u < 0.78) return [0.62, 0.58, 0.64];        // 紫灰岩
    return [0.6, 0.56, 0.66];                       // 基岩（尖上）
  };
  const pos = [], nor = [], col = [], idx = [];
  const quad = (p, n, c) => { const b0 = pos.length / 3; for (const v of p) { pos.push(...v); nor.push(...n); col.push(...c); } idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); };
  for (let l = 0; l < NL; l++) {
    const y1 = -l * LH, y0 = -(l + 1) * LH, c = band(l);
    // 侧面：沿行 / 列把一样的连成长条
    for (let i = 0; i < N2; i++) for (const di of [1, -1]) for (let j = 0; j < N2;) {
      if (!(solid(i, j, l) && !solid(i + di, j, l))) { j++; continue; }
      let n = 1; while (j + n < N2 && solid(i, j + n, l) && !solid(i + di, j + n, l)) n++;
      const x = di === 1 ? X(i + 1) : X(i), z0 = X(j), z1 = X(j + n);
      if (di === 1) quad([[x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1]], [1, 0, 0], c);
      else quad([[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], [-1, 0, 0], c);
      j += n;
    }
    for (let j = 0; j < N2; j++) for (const dj of [1, -1]) for (let i = 0; i < N2;) {
      if (!(solid(i, j, l) && !solid(i, j + dj, l))) { i++; continue; }
      let n = 1; while (i + n < N2 && solid(i + n, j, l) && !solid(i + n, j + dj, l)) n++;
      const z = dj === 1 ? X(j + 1) : X(j), x0 = X(i), x1 = X(i + n);
      if (dj === 1) quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], c);
      else quad([[x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z]], [0, 0, -1], c);
      i += n;
    }
    // 底面（这一层伸出下一层的部分）、顶面（比上一层伸出去的部分）：按行连成长条
    for (const [dl, ny] of [[1, -1], [-1, 1]]) for (let j = 0; j < N2; j++) for (let i = 0; i < N2;) {
      const ok = (ii) => solid(ii, j, l) && !solid(ii, j, l + dl) && (dl === 1 || l > 0);
      if (!ok(i)) { i++; continue; }
      let n = 1; while (i + n < N2 && ok(i + n)) n++;
      const y = ny < 0 ? y0 : y1, x0 = X(i), x1 = X(i + n), z0 = X(j), z1 = X(j + 1);
      if (ny < 0) quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, -1, 0], c);
      else quad([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], c);
      i += n;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    vertexColors: true,
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vC;
      void main() { vP = position; vN = normal; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vP; varying vec3 vN; varying vec3 vC;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float h31(vec3 p) { return h21(p.xz + p.y * 17.3); }
      void main() {
        vec3 N = normalize(vN), Pi = vP - N * 0.0001;
        vec3 vox = floor(Pi / ${(B * 2).toFixed(6)}), px = floor(Pi / ${TX.toFixed(6)});
        float nv = h31(vox), np = h31(px);
        vec3 c = vC * (0.93 + 0.1 * nv) * (0.95 + 0.06 * np);   // 每个方块深浅略不同 + 贴图像素颗粒
        bool lava = vC.r > 0.95 && vC.g > 0.5 && vC.b < 0.3, aquifer = vC.b > 0.8;
        if (lava) c = np > 0.6 ? vec3(1.0, 0.82, 0.38) : np > 0.25 ? vec3(1.0, 0.6, 0.2) : vec3(0.92, 0.42, 0.16);   // 岩浆脉一闪一闪的熔芯
        if (aquifer && np > 0.82) c = vec3(0.8, 0.94, 1.0);                                                            // 地下水层里的水光
        float depth = -vP.y / ${UNDER_D.toFixed(4)};
        // 矿点和水晶：越深越多（金、铜绿、紫水晶）
        if (!lava && !aquifer && h31(vox + 3.7) > 0.985 - 0.04 * depth) c = h21(vox.xz) > 0.66 ? vec3(0.98, 0.86, 0.4) : h21(vox.xz) > 0.33 ? vec3(0.5, 0.88, 0.76) : vec3(0.78, 0.62, 0.98);
        float light = N.y > 0.5 ? 1.0 : N.y < -0.5 ? 0.74 : abs(N.z) > 0.5 ? 0.9 : 0.82;
        if (!lava) c *= light;
        gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return { geometry: g, material: mat };
}

export function buildWater(shared) {
  const pos = [], dA = [], pondA = [], idx = [], riA = [], sA = [];   // riA / sA：哪条溪、离泉眼多远（堵溪时坝下游不画）
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
    const h = hq[j * NG + i]; if (Number.isNaN(h)) continue;
    const x = -S.R + (i + 0.5) * CELL, z = -S.R + (j + 0.5) * CELL;
    const rd = S.riverDist(x, z), ld = S.lakeDist(x, z), pd = 1 + ld / 0.03, ra = S.riverAlong(x, z);
    const pond = ld < 0.006, river = rd < 0.012;
    if (!pond && !river) continue;
    const x0 = -S.R + i * CELL, z0 = -S.R + j * CELL, b = pos.length / 3;
    pos.push(x0, h, z0, x0, h, z0 + CELL, x0 + CELL, h, z0 + CELL, x0 + CELL, h, z0);
    for (let k = 0; k < 4; k++) { const isPond = pond && (!river || pd < 1); dA.push(isPond ? pd : rd); pondA.push(isPond ? 1 : 0); riA.push(isPond ? -1 : ra.ri); sA.push(ra.s); }
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
      const ra = S.riverAlong(x0 + CELL / 2, z0 + CELL / 2); for (const v of q) { pos.push(...v); dA.push(rd); pondA.push(0); vA.push(1); riA.push(ra.ri); sA.push(ra.s); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aD', new THREE.Float32BufferAttribute(dA, 1)); g.setAttribute('aPond', new THREE.Float32BufferAttribute(pondA, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(vA, 1));
  g.setAttribute('aRi', new THREE.Float32BufferAttribute(riA, 1)); g.setAttribute('aS', new THREE.Float32BufferAttribute(sA, 1));
  g.setIndex(idx);
  const u = { uIce: { value: 0 }, uWater: { value: 0.3 }, uRain: { value: 0 }, uTime: shared.uTime, uFill: { value: null }, uR: { value: S.R }, uLight: { value: new THREE.Color(1, 1, 1) },
    uCam: { value: new THREE.Vector3(0, 0.4, 0.4) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunK: { value: 1 }, uWind: { value: new THREE.Vector2() }, uQ: { value: null }, uQW: { value: 1 }, uQSP: { value: 1 } };   // uQ：每条溪沿途的流量（dam.js，一行一条溪），uQW 宽、uQSP 取样间距
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: `attribute float aD, aPond, aV, aRi, aS; uniform float uWater, uQW, uQSP; uniform sampler2D uQ; varying float vD, vPond, vCov, vV, vDry; varying vec3 vP;
      void main() {
        float q = aRi < -0.5 ? 1.0 : texture(uQ, vec2((floor(aS / uQSP + 0.5) + 0.5) / uQW, (aRi + 0.5) / 3.0)).r * 2.0;   // 这一段的流量（0 干、≈0.6 平时）
        vDry = smoothstep(0.03, 0.45, q);   // 0 = 干了
        float cov = aPond > 0.5 ? 0.82 + 0.32 * uWater : (0.0034 + 0.0062 * uWater) * vDry;   // 水少了溪变窄，干了就没了
        vD = aD; vPond = aPond; vCov = cov; vV = aV;
        vec3 p = position; p.y += 0.0009 + 0.0032 * uWater; vP = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    // 照 Terraglass 的水：清的水体（浅处看得见底、越深越蓝越不透明）、平滑的小波浪、
    // 斜着看反射天光（菲涅尔）、太阳的高光一闪一闪、岸边一圈白浪；波浪按 0.4 mm 的格子取样，和方块世界的颗粒一致
    fragmentShader: COMMON_GLSL + `
      uniform float uTime, uRain, uR, uIce, uSunK; uniform sampler2D uFill; uniform vec3 uLight, uCam, uSunDir; uniform vec2 uWind; varying float vD, vPond, vCov, vV, vDry; varying vec3 vP;
      const float TXS = ${TX.toFixed(6)};
      void main() {
        if (vD > vCov || vDry < 0.02) discard;
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
        // 和倒出来的地表水同一套画法（同调色、同一像素密度）：浅处青、深处蓝；水底焦散亮纹；溪水流着一道道白纹；岸边一圈参差的白沫
        float flow = vPond > 0.5 ? 0.0 : 0.6;
        vec3 c = mix(vec3(0.5, 0.9, 0.9), vec3(0.26, 0.6, 0.92), depth);
        float ca = 1.0 - abs(vnoise(t * 0.22 + vec2(uTime * 0.3, uTime * 0.17)) * 2.0 - 1.0);
        float cb = 1.0 - abs(vnoise(t * 0.31 - vec2(uTime * 0.21, -uTime * 0.26)) * 2.0 - 1.0);
        c += vec3(0.12, 0.14, 0.12) * pow(ca * cb, 6.0) * 3.0;
        float streak = vnoise(vec2(t.x * 0.25 + t.y * 0.25 - uTime * 6.0 * (0.4 + flow), (t.x - t.y) * 0.6));
        if (flow > 0.3 && streak > 0.86 - 0.2 * flow) c = mix(c, vec3(0.95, 0.98, 1.0), 0.65);
        float foam = smoothstep(0.12, 0.04, depth + (vnoise(t * 0.5 + uTime * 0.6) - 0.5) * 0.08);
        c = mix(c, vec3(0.96, 0.98, 1.0), foam * 0.85);
        float al = max(mix(0.5, 0.88, depth), foam * 0.9);
        if (uRain > 0.05 && h21(t + floor(uTime * 4.0)) > 0.997 - uRain * 0.02) { c = vec3(0.9, 0.96, 1.0); al = 0.95; }   // 雨点溅起的白点（只在下雨时）
        // 风浪：顺着风一道道的浪，风大时浪尖起白头（只在湖面上）
        float wm = length(uWind);
        if (wm > 0.15 && vPond > 0.5 && depth > 0.15) {
          vec2 wd = uWind / wm; float crest = sin(dot(q, wd) * 2600.0 - uTime * 6.0 + 2.0 * vnoise(t * 0.2));
          c *= 1.0 + 0.08 * crest * min(1.0, wm);
          if (crest > 0.92 - 0.25 * min(1.0, wm - 0.15) && h21(floor(t / 2.0) + floor(uTime * 2.0)) > 0.45) { c = vec3(0.92, 0.96, 1.0); al = max(al, 0.85); }
        }
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
  maple: ['#d24a2c', '#e0622e', '#c63e30', '#e8823a'], sakura: ['#f2b2c6', '#f6c6d6', '#eaa0b8'], ginkgo: ['#e8c040', '#f0cc52', '#dcb438'], golden: ['#c8a44c', '#d0ae56', '#c09a48'], rust: ['#c08048', '#b87844'], blossom: ['#e0a8b4', '#e8b8c2'], plum: ['#9a7aa0', '#a484aa'],
  jacaranda: ['#a090c8', '#a898d0'], bluespruce: ['#5a8a8a', '#60908e'], willow: ['#6e9a44', '#78a24a'], acacia: ['#86983e', '#8ea044'], palm: ['#60984a', '#68a050'], cactus: ['#64965a', '#6c9e60'],
};
const shadeHex = (hex, k) => { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return '#' + c.getHexString(); };
export const TREE_KINDS_ALL = ['sakura', 'ginkgo', 'oak', 'birch', 'spruce', 'pine', 'cypress', 'bush', 'big', 'maple', 'golden', 'rust', 'blossom', 'jacaranda', 'bluespruce', 'willow', 'acacia', 'palm', 'cactus'];
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
  if (kind === 'oak' || kind === 'maple' || kind === 'golden' || kind === 'rust' || kind === 'blossom' || kind === 'jacaranda' || kind === 'sakura') {
    // 盆景式：主干往上，分出 2–3 根斜枝；每根枝头一片扁平的云团，顶上一片最大的；云团之间留缝，看得见枝
    const pal = LEAF[kind], sak = kind === 'sakura', h = (sak ? 5 : 6) + Math.floor(q() * 3);
    const lean = [Math.round((q() - 0.5) * 2), Math.round((q() - 0.5) * 2)];
    trunk(h, sak ? '#5e3e38' : LOG, 1, 1, lean);   // 樱花：深褐带紫的树干，枝更平、更散
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
  } else if (kind === 'ginkgo') {   // 银杏：直直的干，往上一团团收窄（像火苗），满树金黄
    const h = 8 + Math.floor(q() * 3);
    trunk(h, LOG);
    for (let i = 0; i < 4; i++) { const r = 2.8 - i * 0.55, y = h - 2 + i * 2.2; blob((q() - 0.5) * 1.2, y, (q() - 0.5) * 1.2, r, 1.5, r, LEAF.ginkgo, 0.3); }
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
  const HI = new THREE.Color('#e8f0a0'), LO = new THREE.Color('#3a5a6a'), WHITE_HI = new THREE.Color('#fff6ee');
  const GREENISH = new Set(['oak', 'birch', 'spruce', 'bluespruce', 'pine', 'cypress', 'bush', 'big', 'willow', 'acacia', 'palm', 'cactus']);
  for (const [k, c] of cells) {
    if (c[2] !== 'L') continue;
    const [x, y, z] = k.split(',').map(Number);
    const up = cells.has(key(x, y + 1, z)), dn = cells.has(key(x, y - 1, z));
    const sunSide = !cells.has(key(x + 1, y, z)) || !cells.has(key(x, y, z - 1));
    const col = new THREE.Color(c[0]);
    if (!up) col.lerp(GREENISH.has(kind) ? HI : WHITE_HI, 0.12).multiplyScalar(1.06);
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
// 烧剩的焦树干：一根炭化的主干、根部外张、两三根断枝茬。炭色用偏暖的深灰（不能真黑：眼镜里黑 = 透明），零星浅色是烧裂的炭纹
const CHAR_C = ['#6a6058', '#5c544e', '#746a62'], CRACK = '#a08670', ASH = '#c8c2b8';
const hash3 = (x, y, z, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.3) * 43758.5453; return v - Math.floor(v); };
export function snagGeometry(seed = 1) {
  const q = rng(seed * 131 + 7), cells = new Set(), key = (x, y, z) => `${x},${y},${z}`;
  const h = 8 + Math.floor(q() * 3), lean = [Math.round((q() - 0.5) * 2), Math.round((q() - 0.5) * 2)];
  const at = y => [Math.round(lean[0] * y / h), Math.round(lean[1] * y / h)];
  for (let y = 0; y < h; y++) { const [ox, oz] = at(y); cells.add(key(ox, y, oz)); }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (q() < 0.6) cells.add(key(dx, 0, dz));   // 根
  const nb = 2 + Math.floor(q() * 2);
  for (let b = 0; b < nb; b++) {
    const y0 = Math.floor(h * 0.4 + q() * h * 0.45), [ox, oz] = at(y0), d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(q() * 4)], n = 1 + Math.floor(q() * 2);
    for (let i = 1; i <= n; i++) cells.add(key(ox + d[0] * i, y0 + Math.floor(i / 2), oz + d[1] * i));
  }
  return voxelGeometry([-3, 0, -3], [4, h + 2, 4], (x, y, z) => cells.has(key(x, y, z)),
    (x, y, z) => { const r = hash3(x, y, z, seed); return [r < 0.14 ? CRACK : CHAR_C[Math.floor(r * 3) % 3], 1]; }, B, [-B / 2, 0, -B / 2], true);
}
// 会对道具起反应的小东西（reactors.js）的方块模型。单位 PX；颜色都在中灰以上（眼镜里黑 = 透明）
export function reactorGeometry() {
  const W = '#f0e8d8', WOOD = '#a87a52', DARKW = '#8a6644';
  // 风车：白色塔身 + 红顶 + 小门；叶片单独一个（绕中心转），中心在 (0,0,0)，叶片在 xy 平面
  const millTower = boxesGeometry([
    [-3, 0, -3, 3, 5, 3, W], [-2, 5, -2, 2, 15, 2, W],
    [-3, 15, -3, 3, 16, 3, '#c85a3e'], [-2, 16, -2, 2, 17, 2, '#c85a3e'], [-1, 17, -1, 1, 18, 1, '#d8704e'],
    [-1, 0, 3, 1, 3, 4, WOOD], [-1, 8, 2, 1, 10, 3, '#7ab8e0'], [0, 13, 2, 1, 14, 4, DARKW]]);
  const blade = (rot) => { const b = []; for (let i = 1; i <= 7; i++) for (let j = 0; j < 2; j++) { const [x, y] = rot(j, i); b.push([x, y, 0, x + 1, y + 1, 1, j === 0 ? DARKW : (i % 2 ? W : '#e2d6c2')]); } return b; };
  const millBlades = boxesGeometry([[-1, -1, 0, 1, 1, 2, DARKW],
    ...blade((j, i) => [j, i]), ...blade((j, i) => [-1 - j, -1 - i]), ...blade((j, i) => [i, -1 - j]), ...blade((j, i) => [-1 - i, j])], [0, 0, 0]);
  // 水车：一圈木轮 + 辐条 + 桨板，轮面在 xy 平面，绕 z 转
  const wheel = voxelGeometry([-7, -7, -1], [8, 8, 2], (x, y, z) => { const r = Math.hypot(x, y); return (r > 5.4 && r < 6.6 && z >= 0 && z < 1) || ((x === 0 || y === 0) && r < 6 && z === 0) || (r >= 6 && r < 7.6 && (Math.abs(x) < 0.5 || Math.abs(y) < 0.5 || Math.abs(Math.abs(x) - Math.abs(y)) < 0.6)) || (r < 1.5 && z >= -1 && z < 2); },
    (x, y, z) => [Math.hypot(x, y) >= 6.6 ? '#c09468' : WOOD, 1], PX, [0, 0, 0], false);
  const wheelPosts = boxesGeometry([[-1, 0, -3, 1, 7, -2, DARKW], [-1, 0, 2, 1, 7, 3, DARKW], [-1, 6, -3, 1, 7, 3, DARKW]]);
  // 向日葵：茎 + 两片叶；花盘单独（朝 +z，中心在原点）
  const sunStem = boxesGeometry([[0, 0, 0, 1, 10, 1, '#6aa848'], [1, 3, 0, 3, 4, 1, '#7ab854'], [-2, 5, 0, 0, 6, 1, '#7ab854']], [-PX / 2, 0, -PX / 2]);
  const sunHead = voxelGeometry([-3, -3, 0], [4, 4, 1], (x, y) => Math.hypot(x, y) < 3.3, (x, y) => [Math.hypot(x, y) < 1.6 ? '#9a6a3c' : (Math.abs(x) + Math.abs(y)) % 2 ? '#f4cc38' : '#f8dc5a', 2], PX, [0, 0, 0], false);
  // 蘑菇：白杆 + 红伞带白点（伞单独，好单独发光）
  const shroomStem = boxesGeometry([[0, 0, 0, 1, 2, 1, '#f0ead8']], [-PX / 2, 0, -PX / 2]);
  const shroomCap = voxelGeometry([-2, 0, -2], [3, 2, 3], (x, y, z) => y === 0 ? Math.hypot(x, z) < 2.5 : Math.hypot(x, z) < 1.5, (x, y, z, f) => [f === 2 && (x * 3 + z * 5) % 4 === 0 ? '#f8f4ec' : '#e05a4a', 1], PX, [0, 2 * PX, 0], true);
  // 雪人：两段身子 + 头（头单独，被雷劈了会飞）；胡萝卜鼻子，石子眼睛用中灰
  const snowBody = boxesGeometry([[-3, 0, -3, 3, 4, 3, '#f4f6fa'], [-2, 4, -2, 2, 7, 2, '#eef2f8'], [0, 5, 2, 1, 6, 3, '#6a6a74'], [-2, 6, -2, 2, 7, 2, '#d84a3a']]);
  const snowHead = boxesGeometry([[-1, 0, -1, 2, 3, 2, '#f8fafc'], [-1, 2, 2, 0, 3, 3, '#5a5a64'], [1, 2, 2, 2, 3, 3, '#5a5a64'], [0, 1, 2, 1, 2, 4, '#f08a2a']]);
  // 小鸟：身子 + 两只翅膀（翅膀张合靠缩放）
  const bird = boxesGeometry([[-1, 0, -2, 1, 2, 2, '#7a9ac8'], [-1, 1, 2, 1, 3, 3, '#8aaad4'], [0, 1, 3, 1, 2, 4, '#f0b040'], [0, 1, -3, 1, 2, -2, '#6a88b8'], [-3, 2, -1, 3, 3, 1, '#9ab8e0']], [0, 0, 0], PX * 0.6);
  return { millTower, millBlades, wheel, wheelPosts, sunStem, sunHead, shroomStem, shroomCap, snowBody, snowHead, bird };
}
// 塌下来的一堆木炭渣：矮矮一摊碎炭块，顶上落一层白灰
export function charPileGeometry(seed = 1) {
  const q = rng(seed * 977 + 3), hgt = new Map();
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    const d = Math.hypot(x, z) + q() * 0.9; if (d > 2.6) continue;
    hgt.set(x + ',' + z, d < 1 ? 2 + (q() < 0.4 ? 1 : 0) : d < 1.9 ? 1 + (q() < 0.3 ? 1 : 0) : 1);
  }
  const top = (x, z) => hgt.get(x + ',' + z) || 0;
  return voxelGeometry([-2, 0, -2], [3, 4, 3], (x, y, z) => y < top(x, z),
    (x, y, z, f) => { const r = hash3(x, y, z, seed + 5); return [f === 2 && y === top(x, z) - 1 && r < 0.45 ? ASH : r < 0.1 ? CRACK : CHAR_C[Math.floor(r * 7) % 3], 1]; }, B * 0.75, [-B * 0.375, 0, -B * 0.375], true);
}

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
  // 积云：平平的底、圆鼓鼓的顶（中间高、边上低），顶上再鼓出两三团"花菜头"；高度按格子数（每格 CLOUD_H）
  const q = rng(id * 1013 + 7), out = [];
  const ax = rCells * (0.9 + q() * 0.3), az = rCells * (0.65 + q() * 0.25);
  const lumps = Array.from({ length: 4 }, () => [(q() - 0.5) * rCells, (q() - 0.5) * rCells * 0.7, 2 + q() * 3]);
  const tops = Array.from({ length: 3 }, () => [(q() - 0.5) * rCells * 0.9, (q() - 0.5) * rCells * 0.5, rCells * (0.3 + q() * 0.25), 2 + q() * 2.5]);
  const maxH = Math.max(4, Math.round(rCells * 0.75));
  for (let i = -rCells - 2; i <= rCells + 2; i++) for (let j = -rCells - 2; j <= rCells + 2; j++) {
    let e = (i / ax) ** 2 + (j / az) ** 2;
    for (const [lx, lz, lr] of lumps) e = Math.min(e, ((i - lx) ** 2 + (j - lz) ** 2) / (lr * lr) * 0.9);
    if (e >= 1) continue;
    let h = maxH * Math.sqrt(1 - e) * 0.75 + 1;
    for (const [tx, tz, tr, th] of tops) { const d = ((i - tx) ** 2 + (j - tz) ** 2) / (tr * tr); if (d < 1) h += th * Math.sqrt(1 - d); }
    out.push({ i, j, h: Math.max(1, Math.round(h + (q() - 0.5) * 0.8)), r: q(), edge: e });
  }
  return out;
}

// ---------- 手里拿的工具：沙 / 土用小桶、水用水壶、岩浆用铁杯、铲子（体素：容器 0.72 mm 一格，铲子 0.48 mm） ----------
// 原点 = 手捏住的那一点；lip = 倒出来的口（局部坐标，米），倒的时候绕 z 轴往 +x 那边倾
export function heldToolGeometry(kind) {
  const V = kind === 'shovel' ? B * 0.3 : B * 0.45, box = [];   // 缩到原来的一半左右：小桶约 1 cm 宽、铲子约 2 cm 长
  const add = (x0, y0, z0, x1, y1, z1, c) => box.push([x0, y0, z0, x1, y1, z1, c]);
  let lip = [0, 0, 0];
  if (kind === 'sand' || kind === 'soil') {   // 红色的小沙桶（海边玩沙那种）：提手挂在手上，桶里装着沙 / 土
    const fill = kind === 'sand' ? '#ecd9a0' : '#8a5e3c';
    add(-7, -24, -7, 7, -23, 7, '#8a2e24');                                    // 桶底
    add(-7, -23, -7, 7, -9, -6, '#d0503c'); add(-7, -23, 6, 7, -9, 7, '#d0503c');   // 前后壁
    add(-7, -23, -6, -6, -9, 6, '#b84432'); add(6, -23, -6, 7, -9, 6, '#b84432');   // 左右壁
    add(-7, -19, -7, 7, -18, 7, '#8a2e24');                                    // 一道深色箍
    add(-7, -9, -7, 7, -8, 7, '#ece4d6'); box.push([-6, -9, -6, 6, -8, 6, null]);   // 白色卷边（中间空）
    add(-6, -23, -6, 6, -10, 6, fill);                                         // 装满的沙 / 土
    for (let a = 0; a <= 32; a++) { const t = a / 32 * Math.PI, x = Math.round(Math.cos(t) * 7), y = Math.round(-8 + Math.sin(t) * 8); add(x, y - 1, 0, x + 1, y, 1, '#4a4f58'); }   // 提手
    lip = [7 * V, -8 * V, 0];
  } else if (kind === 'water') {   // 水壶：手捏着壶把，壶嘴朝前
    const o = 10;   // 壶身中心在手前 1 cm
    add(o - 6, -22, -6, o + 6, -8, 6, '#5aa8c8');
    add(o - 6, -18, -6, o + 6, -17, 6, '#3a86a8');                             // 一道深色腰线
    add(o - 4, -8, -4, o + 4, -6, 4, '#4a98b8'); add(o - 1, -6, -1, o + 1, -5, 1, '#2a5a70');   // 盖子、钮
    for (let i = 0; i < 8; i++) add(o + 6 + i, -18 + i, -1, o + 8 + i, -16 + i, 1, '#4a98b8');   // 壶嘴（斜着往上）
    add(o - 9, -9, -1, o - 6, -8, 1, '#2a5a70'); add(o - 10, -18, -1, o - 9, -8, 1, '#2a5a70'); add(o - 9, -18, -1, o - 6, -17, 1, '#2a5a70');   // 壶把
    for (const v of box) { v[1] += 9; v[4] += 9; v[0] -= 0; }
    lip = [(o + 15) * V, (-9 + 9) * V, 0];
  } else if (kind === 'lava') {   // 铁杯：长把，杯里是烫的岩浆
    const o = 12;
    add(o - 5, -14, -5, o + 5, -13, 5, '#2e2a2c');
    add(o - 5, -13, -5, o + 5, -2, -4, '#45403f'); add(o - 5, -13, 4, o + 5, -2, 5, '#45403f');
    add(o - 5, -13, -4, o - 4, -2, 4, '#3c3736'); add(o + 4, -13, -4, o + 5, -2, 4, '#3c3736');
    add(o - 4, -13, -4, o + 4, -3, 4, '#ff7a1a'); add(o - 2, -4, -2, o + 2, -3, 2, '#ffd060');   // 岩浆，中间更亮
    for (let i = 0; i < 8; i++) add(o - 6 - i, -6 + Math.round(i * 0.6), -1, o - 5 - i, -5 + Math.round(i * 0.6), 1, '#2e2a2c');   // 长把
    for (const v of box) { v[0] -= 0; v[1] += 1; v[4] += 1; }
    lip = [(o + 5) * V, -1 * V, 0];
  } else if (kind === 'shovel') {   // 铲子：手捏着 T 形把，铲头朝下
    add(-3, -1, -1, 3, 1, 1, '#6a4024');                                       // T 把
    add(-1, -26, -1, 1, -1, 1, '#b0703a');                                     // 木柄
    add(-2, -28, -2, 2, -26, 2, '#5a5f68');                                    // 套筒
    add(-4, -37, -1, 4, -28, 0, '#9aa3ad'); add(-3, -39, -1, 3, -37, 0, '#9aa3ad'); add(-1, -40, -1, 1, -39, 0, '#c4ccd4');   // 铲头（尖）
    lip = [0, -40 * V, 0];
  }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const b of box) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b[k]); mx[k] = Math.max(mx[k], b[k + 3]); }
  const find = (x, y, z) => { for (let i = box.length - 1; i >= 0; i--) { const b = box[i]; if (x >= b[0] && x < b[3] && y >= b[1] && y < b[4] && z >= b[2] && z < b[5]) return b; } return null; };
  const g = voxelGeometry(mn, mx, (x, y, z) => !!find(x, y, z)?.[6], (x, y, z) => find(x, y, z)[6], V, [0, 0, 0], false);
  return { geometry: g, lip };
}
