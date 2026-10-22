import * as THREE from 'three';
import { UNIT, block, box, prism, bakeStatic, makeRng } from './pixel.js';
import { R, GLOW } from './palette.js';
import { addWestMaterials } from './textures.js';
import { buildTerrain, rawHeight } from './terrain.js';
import { streamZ, BAND, squeeze, STREAM_HALF, WATER_Y } from './layout.js';
import { house, facade } from './buildings.js';
import * as PROPS from './props.js';
import { tagged, tag, collectThings } from './things.js';
import { voxelTree, voxelGeometry } from './voxel.js';
import { fieldCrops } from './farmland.js';
import { is } from './season.js';
import { findFloating } from './audit.js';
import { fixCoplanar } from './coplanar.js';
import { Sprites } from './sprites.js';
import { Smoke, Fireflies, Rain } from './fx.js';

const P = tagged(PROPS);

/*
 * 西沟：出了村西口，翻过山梁，小溪往下游流进一道山沟。和村子同一个世界坐标（x 往西接着排），
 * 沙盘一样大（90 × 72 米），主程序把整个世界平移过来就切到这儿。
 *
 *                  北（高）
 *   ┌────────────────────────────────────────────────┐
 *   │  起伏的石头山（往北越高）   │ 崖顶平台（22 米，古道顶上）     │
 *   │ ～瀑布 ▓▓ 半崖上的山神庙 ▓▓▓ 红石崖 ▓▓ 挂壁古道（崖腰 15 米，中段凿进崖里，开一排窗洞）
 *   │  深潭     崖脚的林子（往东越宽）                    │ ← 东边：翻过山梁就是村子
 *   │   山溪   大片梯田：谷子、高粱、玉米，有的已经割了   柿子园 │
 *   │   ～～                             水磨坊  拦河坝      │
 *   │  ～～～～～～～～～～ 小溪（从村子流过来） ～～～～～～～～～ │
 *   └────────────────────────────────────────────────┘
 *                  南（低）
 *
 * 下面的坐标都写成"西沟本地"的 u（= 世界 x + 90，-45 … 45），z 和村子一样；W(u) 换回世界 x。
 */

// 和村子一样，南边插进一条 BAND.d 宽的地（layout.js 的 BAND）：小溪、拦河坝、水轮、水磨坊跟着溪往南挪，地形按 squeeze 折回原来的坐标算
export const WEST_BOUNDS = { x0: -135, x1: -45, z0: -36, z1: 36 + BAND.d };
const OX = -90;
const W = (u) => OX + u;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const q = (h, step) => Math.round(h / step) * step;

/** 崖顶边沿（崖壁上沿）：折线，挂壁古道的几段直路正好沿着它。 */
const CLIFF = [[-46, -18.5], [-34, -21], [-24, -19.5], [-16, -21], [-6, -20], [4, -19.5], [16, -21.5], [28, -20.5], [40, -22.5], [46, -23]];
function zTop(u) {
  for (let i = 0; i < CLIFF.length - 1; i++) {
    const [ua, za] = CLIFF[i], [ub, zb] = CLIFF[i + 1];
    if (u <= ub) return za + ((zb - za) * (u - ua)) / (ub - ua);
  }
  return CLIFF[CLIFF.length - 1][1];
}

/** 崖腰平台（挂壁古道）：u ≥ -16 才有，宽 3 米；u ≥ -6 一直是 15 米高，再往西顺着崖脚斜着下到 10.8 米。 */
const BENCH_W = 3;
const benchH = (u) => (u >= -6 ? 15 : 15 - ((-6 - u) / 10) * 4.2);
const PLATEAU = 22.2;
const TUNNEL = [4, 28]; // 这一段凿进崖里，外侧开窗洞

/**
 * 半崖上的山神庙：古道上方往崖里凿进一个深龛（18.6 米），口宽里窄，木头小庙整个缩在里面；
 * 龛上面的山一级级往后退着升高（不突出一块石头）。龛东头一道凿在崖里的石阶下到古道。
 */
const NICHE = { c: -11.5, half: 4.6, taper: 0.18, depth: 5.6, h: 18.6 };
const nicheHalf = (back) => NICHE.half - back * NICHE.taper; // 离崖面 back 米处龛有多宽（一半）
const inNiche = (u, back) => back <= NICHE.depth && Math.abs(u - NICHE.c) <= nicheHalf(back);
const STAIR = { u0: NICHE.c + NICHE.half - 0.3, u1: -1, depth: 1.8 };

/** 瀑布：后山的泉水顺着山沟流到崖边，直落进崖脚的深潭；潭水顺着山沟弯弯曲曲流进南边的小溪。 */
const FALL_U = -25;
const POOL = { u: FALL_U, z: zTop(FALL_U) + 3.2, r: 3.3 };
const SPRING = [[-27, -37], [FALL_U, zTop(FALL_U)]];
const CREEK = [[FALL_U, POOL.z], [-21, -8], [-27, 2], [-23, 12], [-29, 21], [-31, streamZ(W(-31))]];
const CREEK_HALF = 0.8;

/**
 * 水磨坊：小溪北岸；上游一道拦河石坝（坝下水面低一级），坝下一架大水轮占三分之二的河道。
 * 水轮前后这一段河道拉成直的（streamAt），轮子不会戳进弯着的河岸里。
 */
const WHEEL_U = 18.5;
const WEIR_U = 21; // 世界 x 是整数，正好落在 0.5 米格子线上：坝两边的水面在这条线上断开
const STRAIGHT = [13, 26];
const WHEEL_Z = streamZ(W(WHEEL_U));
function streamAt(u) {
  const k = smooth(STRAIGHT[0] - 4, STRAIGHT[0], u) * (1 - smooth(STRAIGHT[1], STRAIGHT[1] + 4, u));
  return streamZ(W(u)) + (WHEEL_Z - streamZ(W(u))) * k;
}
const streamAt0 = (u) => streamAt(u) - BAND.d; // 插那条地之前的位置（地形按原来的坐标算）
const MILL = { u: 16, w: 9, d: 6.4, level: -0.6 }; // 磨坊挖低一级，贴着坝下的水面（水轮下沿才浸得到水），整个平台都在坝下游
MILL.z = Math.min(...[-4.5, 0, 4.5].map((du) => streamAt(MILL.u + du))) - STREAM_HALF - 0.4 - MILL.d / 2;

/** 点到线段：距离和投影参数。 */
function seg(pu, pz, a, b) {
  const du = b[0] - a[0], dz = b[1] - a[1], L2 = du * du + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((pu - a[0]) * du + (pz - a[1]) * dz) / L2));
  return { d: Math.hypot(pu - a[0] - t * du, pz - a[1] - t * dz), t, len: Math.sqrt(L2) };
}

/** 崖顶：右边（古道顶上）一段是平的；往西是起伏的石头山，离崖边越远越高。 */
function peaks(u, z) {
  const back = zTop(u) - z;
  const bump = 2 + 3.6 * Math.sin(u * 0.23 + 1) + 2.4 * Math.sin(u * 0.11 - z * 0.17) + 2 * Math.sin(z * 0.31 + u * 0.07);
  return Math.max(0, bump) * smooth(0, 7, back) + back * 0.25;
}
/** 庙龛四周的山：龛口上方先压到 3.6 米，再往后、往两边一级级升高（不会一整块石头悬在庙顶上）。 */
const nicheCap = (u, back) => NICHE.h + 3.6 + 1.2 * Math.max(0, back - NICHE.depth) + 1.5 * Math.max(0, Math.abs(u - NICHE.c) - nicheHalf(Math.min(back, NICHE.depth)));
const springFloor = (z) => PLATEAU + (zTop(FALL_U) - z) * 0.3; // 泉水沟的沟底，往北一路升高
function plateau(u, z) {
  const zt = zTop(u);
  let h = PLATEAU + (z < -31 ? 0.6 : 0);
  if (u > 38) h += q(1.4 * Math.sin(u * 0.21) + 0.8 * Math.sin(z * 0.4 + u * 0.1), 0.6);
  const w = smooth(2, 8, u);
  if (w < 1) {
    const rug = PLATEAU + peaks(u, z);
    h = q(rug + (h - rug) * w, 0.6);
    const d = seg(u, z, ...SPRING).d; // 泉水冲出来的一道沟
    if (d < 6) h = Math.min(h, q(springFloor(z) + 0.6 + Math.max(0, d - 0.9) * 1.8, 0.6));
    h = Math.max(PLATEAU, Math.min(h, q(nicheCap(u, zt - z), 0.6)));
  }
  const rocky = zt - z < 2.5 || (w < 1 && peaks(u, z) > 5 && (Math.floor(u * 0.7) + Math.floor(z * 0.5)) % 3 !== 0);
  return { h, type: rocky ? 'rock' : 'grass' };
}

/** 西沟自己的地面（还没和村子的山梁接上）：{ h, type, crop }。 */
function ground(u, z) {
  z = squeeze(z); // 南边插进来的那条地：折回原来的坐标
  const zt = zTop(u);
  if (z < zt) {
    const back = zt - z;
    if (inNiche(u, back)) return { h: NICHE.h, type: 'rock' }; // 庙龛
    if (u > STAIR.u0 && u <= STAIR.u1 && back <= STAIR.depth) return { h: q(15 + ((STAIR.u1 - u) / (STAIR.u1 - STAIR.u0)) * (NICHE.h - 15), 0.3), type: 'rock' }; // 崖里的石阶
    return plateau(u, z);
  }
  if (u >= -16 && z < zt + BENCH_W) return { h: q(benchH(u), 0.3), type: 'rock' };
  const x = W(u), zs = streamAt0(u);
  if (z > zs + STREAM_HALF) return { h: Math.max(0, Math.floor((0.5 + Math.min(1.0, (z - zs - STREAM_HALF) * 0.18) + 0.25 * Math.sin(x * 0.3)) / 1.2) * 1.2), type: 'grass' }; // 溪南的河滩，和村子一样
  const s = z - zt - (u >= -16 ? BENCH_W : 0); // 离崖脚多远
  let h = 10.5 - 5.5 * smooth(0, 22, s) - 0.15 * Math.max(0, s - 16) + 0.7 * Math.sin(u * 0.21 + z * 0.13) + 0.5 * Math.sin(u * 0.07 - z * 0.2);
  h = Math.max(1.2, h);
  if (u > 26 && u < 38 && z > -4 && z < 10) return { h: q(h, 0.6), type: 'grass' }; // 柿子园、核桃树
  if (s < 20 + 2.5 * Math.sin(u * 0.15)) return { h: q(h, 0.6), type: 'forest' };
  if (z > zs - 3.2) return { h: Math.max(1.2, q(h, 1.2)), type: 'grass' }; // 溪边的荒坡
  const hh = Math.max(1.2, Math.floor(h / 1.2) * 1.2);
  // 一层梯田一样庄稼：0 割完的茬地（立着谷个子）、1 谷子 / 高粱、2 玉米、3 刚出苗的冬小麦
  const crop = [1, 0, 1, 3, 2, 1, 0, 1][(((Math.round(hh / 1.2) + Math.floor(u / 14)) % 8) + 8) % 8];
  return { h: hh, type: 'field', crop };
}

/** 东边 8 米和村子的山梁接上：高度渐变到村子地形（交界处完全一样），地面也换成草坡。 */
function natural(x, z) {
  const u = x - OX, g = ground(u, z), w = smooth(37, 45, u);
  if (w <= 0) return g;
  const v = Math.max(0, Math.floor(rawHeight(x, z) / 1.2) * 1.2);
  return { h: q(g.h + (v - g.h) * w, 0.6), type: w > 0.5 && g.type !== 'rock' ? 'grass' : g.type, crop: g.crop };
}

/** 山溪沿线的水面：从深潭往下，按地面高度一级级往下跌（跌水），只降不升。 */
const creekLevels = (() => {
  const out = [];
  let lv = q(ground(POOL.u, POOL.z).h, 0.6) - 1.2;
  POOL.level = lv;
  for (let i = 0; i < CREEK.length - 1; i++) {
    const a = CREEK[i], b = CREEK[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const levels = [];
    for (let d = 0; d <= L + 0.25; d += 0.5) {
      const t = Math.min(1, d / L);
      lv = Math.min(lv, Math.floor((ground(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t).h - 0.9) / 0.6) * 0.6);
      levels.push(lv);
    }
    out.push(levels);
  }
  return out;
})();

function water(x, z) {
  const u = x - OX;
  if (z < zTop(u)) return seg(u, z, ...SPRING).d < 0.7 ? Math.floor((springFloor(z) - 0.3) / 0.6) * 0.6 : null; // 山上的泉水，顺着沟一级级下来
  if (Math.hypot(u - POOL.u, z - POOL.z) < POOL.r) return POOL.level;
  if (Math.abs(z - streamAt(u)) < STREAM_HALF) return u > WEIR_U ? WATER_Y : WATER_Y - 0.6; // 拦河坝下面低一级
  let best = null;
  for (let i = 0; i < CREEK.length - 1; i++) {
    const s = seg(u, z, CREEK[i], CREEK[i + 1]);
    if (s.d < CREEK_HALF && (!best || s.d < best.d)) best = { d: s.d, lv: creekLevels[i][Math.min(creekLevels[i].length - 1, Math.round((s.t * s.len) / 0.5))] };
  }
  return best ? best.lv : null;
}

/** 落差侧面：崖顶、崖腰是红砂岩崖壁；林子里的坎子也是露出来的石头；梯田照村子的毛石堰。 */
function sideMat(M) {
  return (type, drop, x, z) => {
    if (z < zTop(x - OX) && drop >= 0.6 && x - OX < 37) return M.cliff; // 崖上的山：坎子都是露出来的红石头，不是砌的
    if (type === 'rock') return drop >= 0.6 ? M.cliff : null;
    if (type === 'forest') return drop >= 0.6 ? M.cliff : M.soil;
    if (type === 'grass' && drop >= 2.4) return M.cliff;
    if ((type === 'pad' && drop >= 1.2) || (type === 'path' && drop >= 2.4)) return M.cliff; // 庙龛、崖里石阶下面还是崖壁，不是砌的墙
    return null;
  };
}

// ---------------------------------------------------------------- 路网

const ROAD = { // 主路从村子过来，在沟中间拐上崖脚、接到古道；再往西全是梯田
  east: [44.7, 8], f1: [31, 9.5], f2: [16, 11], f3: [2, 9],
  d1: [-13, -11], d2: [-6, -1],
  outW: [-44.7, -12], cw1: [-30, -8], cw2: [-18, -12], // 山外来的路：从西头顺着崖脚过来（过山溪），接上古道——骡帮走这条
  fordW: [-23.7, -10.1], fordE: [-20.9, -11.5], // 过山溪的石板桥两头（两头一样高，桥面只高一级）
  ridge: [28.5, -26], // 崖顶草坡：从古道东头一段石阶爬上来，羊倌赶羊上来吃草
};
const GALLERY = [44.7, 40, 28, 16, 4, -6, -16]; // 古道上的点：正好落在崖边折线的拐点上
const GNAME = (u) => `g${u}`;
const TEMPLE = { back: 3.0, w: 6.2, d: 3.6 }; // 庙基中心离崖面 3 米：庙门缩在崖里 1.4 米

const EDGES = [
  ['east', 'f1'], ['f1', 'f2'], ['f2', 'f3'], ['f1', 'mill'],
  ...GALLERY.slice(1).map((u, i) => [GNAME(GALLERY[i]), GNAME(u)]),
  ['g-16', 'd1'], ['d1', 'd2'], ['d2', 'f3'], ['g4', 'stair'], ['stair', 'temple'],
  ['outW', 'cw1'], ['cw1', 'fordW'], ['fordW', 'fordE'], ['fordE', 'cw2'], ['cw2', 'd1'], ['g40', 'ridge'],
];

// ---------------------------------------------------------------- 物件

/** 地上的大石头：扁椭球 + 起伏，顶面受光亮。voxel 边长 0.14 米。 */
function boulderGeo(seed) {
  const r = makeRng(seed);
  const [a, b, c] = [4 + r() * 2, 2.5 + r() * 1.5, 3.5 + r() * 2];
  const solid = (x, y, z) => y >= 0 && Math.hypot(x / a, (y - 0.5) / b, z / c) < 1 + Math.sin(x * 1.3 + z * 0.7 + seed) * 0.12;
  const color = (x, y, z, f) => (f === 2 ? (x + z) % 4 ? R.rock[4] : R.rock[5] : f === 1 || f === 5 ? R.rock[3] : R.rock[2]);
  return voxelGeometry([-7, 0, -7], [8, 5, 8], solid, color, 0.14, [-0.07, 0, -0.07]);
}

/**
 * 立式水轮：两圈轮缘、十根粗轮辐一圈一组，十块宽刮水板横跨两圈（轮子宽 width），绕 x 轴转；
 * 轮轴从一侧轮缘往 +x 伸 axle 米，gearAt 米处装一个大立齿轮（面上一圈木齿，跟着一起转）。原点在轮心。
 */
function waterWheel(M, axle, r = 1.9, width = 2.1, gearAt = 0) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const hub = prism(0.32, 0.32, width + 0.5, M.wood, 8);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  const axleBar = prism(0.12, 0.12, axle - width / 2, M.wood, 8); // 轮轴也跟着转
  axleBar.rotation.z = Math.PI / 2;
  axleBar.position.x = (axle + width / 2) / 2;
  spin.add(axleBar);
  if (gearAt) {
    const gear = prism(GEAR.r, GEAR.r, 0.16, M.wood, 12);
    gear.rotation.z = Math.PI / 2;
    gear.position.x = gearAt;
    spin.add(gear);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, y = Math.cos(a) * (GEAR.r - 0.08), z = Math.sin(a) * (GEAR.r - 0.08); spin.add(block(gearAt + 0.08, y - 0.04, z - 0.04, gearAt + 0.24, y + 0.04, z + 0.04, M.wood)); } // 木齿（朝北，拨灯笼齿轮）
  }
  const N = 10, c = Math.cos(Math.PI / N) * r, hl = Math.sin(Math.PI / N) * r + 0.04;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const spoke = new THREE.Group();
    spoke.rotation.x = a;
    const arc = new THREE.Group(); // 轮缘：两根轮辐之间一段
    arc.rotation.x = a + Math.PI / N;
    for (const s of [-1, 1]) {
      spoke.add(block(s * width / 2 - 0.09, 0.2, -0.08, s * width / 2 + 0.09, r, 0.08, M.wood)); // 轮辐
      const t = 0.1 + (i % 2) * 0.015; // 相邻两段轮缘在轮辐处搭着，厚度错开一点，不共面闪烁
      arc.add(block(s * width / 2 - t, c - 0.11 - (i % 2) * 0.01, -hl, s * width / 2 + t, c + 0.11 + (i % 2) * 0.01, hl, M.wood));
    }
    spoke.add(block(-width / 2, r - 0.7, -0.07, width / 2, r + 0.1, 0.07, M.wood)); // 刮水板
    spin.add(spoke, arc);
  }
  g.add(spin);
  g.userData.dynamic = true;
  g.userData.spin = spin;
  return g;
}

/** 一盏挂着的灯笼 + 光晕（不合批，夜里跟着村子的灯笼一起亮）。 */
function lanternAt(M, x, y, z) {
  const g = new THREE.Group();
  g.add(block(-0.12, 0, -0.12, 0.12, 0.32, 0.12, M.lantern, { outline: false }));
  const halo = new THREE.Sprite(M.haloSprite);
  halo.scale.set(0.9, 0.9, 1); // 光晕小一圈：两盏挨着的灯笼叠在一起，大了整片崖壁发红
  halo.position.y = 0.16;
  g.add(halo);
  g.position.set(x, y, z);
  g.userData.dynamic = true;
  return g;
}

/**
 * 水磨坊（照太行山里的老磨坊）：毛石墙基、土坯墙、石板顶的正房（烟囱、匾、檐下挂柿子串和辣椒），
 * 西边一座敞着的磨棚，溪里的大水轮就在棚子南边。传动看得见：水轮的轴伸进磨棚，轴头一个大立齿轮，
 * 齿轮上的木齿拨着一个灯笼形的小齿轮，小齿轮套在竖轴上，竖轴穿过磨台带着上扇磨盘转，磨盘上吊着一个装粮食的木斗。
 * 磨棚坡顶上摊着柿饼、山楂片晾晒。原点在平台中心，正面朝南（朝溪）。
 * wheelX / wheelZ：水轮在哪（本地），wheelY：轮心高度（本地）。返回 { object, wheel, millstone（竖着转的那组）}。
 */
const GEAR = { z: 1.8, r: 0.6, pin: 0.28 }; // 立齿轮在轴上的位置、半径；灯笼齿轮半径
function watermill(M, wheelX, wheelZ, wheelY) {
  const g = new THREE.Group();
  const hall = house(M, { w: 5.2, d: 4.2, h: 3.0, wall: 'adobe', rise: 1.5, roofMat: 'slate', chimney: true, front: [{ k: 'door', x: 1.0 }, { k: 'windowLit', x: -1.3, y: 1.0 }, { k: 'signBoard', x: 1.0, y: 2.45, s: 0.6 }] });
  hall.object.position.set(-1.8, 0, 0.4);
  g.add(hall.object);
  for (const [k, x] of [['persimmonString', -4.0], ['chiliString', -3.4], ['persimmonString', 0.3]]) if (k === 'chiliString' || is('autumn', 'winter')) facade(g, M, k, x, 1.6, 2.55); // 柿子串：秋天挂上，晾到冬天

  // 磨棚：四根柱子 + 往南斜的石板单坡顶（坡上晾柿饼、山楂片）
  const shed = new THREE.Group();
  const [sx0, sx1, sz0, sz1] = [wheelX - 1.6, wheelX + 1.6, 0.2, 3.0];
  for (const [x, z, h] of [[sx0, sz0, 3.3], [sx1, sz0, 3.3], [sx0, sz1, 2.9], [sx1, sz1, 2.9]]) shed.add(block(x - 0.12, 0, z - 0.12, x + 0.12, h, z + 0.12, M.wood));
  const slope = Math.atan2(0.4, sz1 - sz0), L = Math.hypot(0.4, sz1 - sz0) + 0.6;
  const roof = box(sx1 - sx0 + 0.5, 0.15, L, M.slate);
  roof.rotation.x = slope;
  roof.position.set(wheelX, 3.2, (sz0 + sz1) / 2);
  shed.add(roof);
  for (const [k, x0, x1] of is('autumn') ? [['persimmonMat', sx0 + 0.1, wheelX - 0.1], ['hawthornMat', wheelX + 0.1, sx1 - 0.1]] : []) { // 晒柿饼、山楂片：秋天
    const mat = box(x1 - x0, 0.05, L - 0.9, M[k], { outline: false });
    mat.rotation.x = slope;
    mat.position.set((x0 + x1) / 2, 3.31, (sz0 + sz1) / 2);
    shed.add(mat);
  }
  // 磨台：四条腿的木台子，上面下扇磨盘不动；竖轴、灯笼齿轮、上扇磨盘、木斗一起转
  const deckY = 1.9, mx = wheelX, mz = GEAR.z - 0.42;
  for (const dx of [-0.95, 0.95]) for (const dz of [-0.75, 0.75]) shed.add(block(mx + dx - 0.08, 0, mz + dz - 0.08, mx + dx + 0.08, deckY, mz + dz + 0.08, M.wood));
  shed.add(block(mx - 1.05, deckY - 0.15, mz - 0.85, mx + 1.05, deckY, mz + 0.85, M.wood));
  const lower = prism(0.62, 0.62, 0.2, M.stone, 12);
  lower.position.set(mx, deckY + 0.1, mz);
  shed.add(lower);
  const millstone = new THREE.Group();
  millstone.position.set(mx, 0, mz);
  const upper = prism(0.58, 0.58, 0.2, M.stone, 12);
  upper.position.y = deckY + 0.3;
  const shaft = prism(0.06, 0.06, deckY + 0.55 - 1.15, M.wood, 6);
  shaft.position.y = (1.15 + deckY + 0.55) / 2;
  const hopper = prism(0.38, 0.12, 0.35, M.wood, 4); // 粮斗：上大下小
  hopper.position.y = deckY + 0.85;
  hopper.rotation.y = Math.PI / 4;
  millstone.add(upper, shaft, hopper);
  for (const y of [1.2, 1.55]) { const disc = prism(GEAR.pin, GEAR.pin, 0.05, M.wood, 8); disc.position.y = y; millstone.add(disc); } // 灯笼齿轮：上下两片 + 一圈木棍
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; millstone.add(block(Math.cos(a) * (GEAR.pin - 0.04) - 0.03, 1.2, Math.sin(a) * (GEAR.pin - 0.04) - 0.03, Math.cos(a) * (GEAR.pin - 0.04) + 0.03, 1.55, Math.sin(a) * (GEAR.pin - 0.04) + 0.03, M.wood)); }
  millstone.userData.dynamic = true;
  shed.add(millstone);
  for (const [x, z] of [[mx + 0.75, mz - 0.55], [mx + 0.45, mz - 0.6]]) shed.add(block(x - 0.18, deckY, z - 0.14, x + 0.18, deckY + 0.42, z + 0.14, M.plaster)); // 台上两袋粮食
  g.add(shed);

  // 水轮：轴朝北伸进磨棚；岸边一个石墩托着轴，轴头是大立齿轮
  const wheel = waterWheel(M, wheelZ - (GEAR.z - 0.3), 2.2, 2.1, wheelZ - GEAR.z);
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(wheelX, wheelY, wheelZ);
  g.add(wheel);
  g.add(block(wheelX - 0.35, -0.6, 3.0, wheelX + 0.35, wheelY - 0.12, 3.5, M.rubble)); // 托轴的石墩
  g.add(block(wheelX - 0.3, -0.6, GEAR.z + 0.35, wheelX + 0.3, wheelY - 0.12, GEAR.z + 0.75, M.wood)); // 齿轮前的轴托
  // 院里：靠墙的旧磨盘、一根幌子、门口的灯笼
  for (const [x, a] of [[-4.0, 0.25], [-3.7, 0.4]]) { const s = prism(0.6, 0.6, 0.2, M.stone, 10); s.rotation.set(Math.PI / 2 - a, 0, 0); s.position.set(x, 0.58, 2.85 + a * 0.3); g.add(s); }
  g.add(block(0.62, 0, -1.9, 0.77, 3.4, -1.75, M.wood)); // 幌子杆
  facade(g, M, 'flag', 0.7, 1.8, -1.65, { scale: 1.1 });
  g.add(lanternAt(M, sx1 + 0.1, 2.3, sz1 + 0.1));
  tag(hall.object, 'watermill'); tag(shed, 'watermill'); tag(wheel, 'watermill');
  return { object: g, wheel, millstone };
}

/**
 * 半崖上的山神庙（照山西那些挂在崖上的木构小庙）：木板墙、红柱前廊、灰瓦顶，四个檐角往上翘；
 * 庙整个缩在石龛里，门前一截木栈台伸出崖面，下面木梁插进崖里、斜撑顶着——古道就从栈台底下过；
 * 栈台西头一座小钟亭。原点在庙基中心，正面朝南（崖外）；face：崖面离原点多远（往南）。
 */
function temple(M, face) {
  const g = new THREE.Group();
  const w = 5.0, d = 3.2, h = 2.7;
  const hall = house(M, { w, d, h, wall: 'wood', rise: 1.2, porch: 0.9, lit: false, front: [{ k: 'door', x: 0 }, { k: 'window', x: -1.5, y: 0.9, s: 0.8 }, { k: 'window', x: 1.5, y: 0.9, s: 0.8 }, { k: 'signBoard', x: 0, y: 2.15, s: 0.55 }] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) hall.object.add(block(sx * (w / 2 + 0.05) - 0.14, h + 0.05, sz * (d / 2 + 0.45) - 0.14, sx * (w / 2 + 0.05) + 0.14, h + 0.45, sz * (d / 2 + 0.45) + 0.14, M.ridge)); // 翘起的檐角
  tag(hall.object, 'mountainTemple');
  g.add(hall.object);
  const deck0 = d / 2, deck1 = face + 1.0;
  g.add(block(-3.2, 0, deck0, 3.2, 0.15, deck1, M.wood)); // 栈台
  for (const x of [-2.4, -0.8, 0.8, 2.4]) { // 插进崖里的梁 + 斜撑
    g.add(block(x - 0.1, -0.25, face - 0.6, x + 0.1, 0, deck1, M.wood));
    const dz = deck1 - 0.15 - face, dy = 1.8;
    const strut = box(0.16, Math.hypot(dz, dy), 0.16, M.wood);
    strut.rotation.x = Math.atan2(dz, dy);
    strut.position.set(x, -0.25 - dy / 2, face + dz / 2);
    g.add(strut);
  }
  for (let x = -3.1; x <= 3.11; x += 1.24) g.add(block(x - 0.05, 0.15, deck1 - 0.12, x + 0.05, 1.0, deck1 - 0.02, M.redwood)); // 栏杆
  g.add(block(-3.2, 0.92, deck1 - 0.14, 3.2, 1.02, deck1, M.redwood));
  for (const s of [-1, 1]) g.add(block(s * 3.2 - 0.05, 0.92, face - 0.3, s * 3.2 + 0.05, 1.02, deck1, M.redwood));
  // 钟亭：四根红柱、一个四角攒尖顶、一口铜钟
  const bell = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bell.add(block(sx * 0.5 - 0.06, 0, sz * 0.5 - 0.06, sx * 0.5 + 0.06, 1.9, sz * 0.5 + 0.06, M.redwood));
  const cap = prism(0.06, 0.95, 0.6, M.roof, 4);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 2.2;
  const bronze = prism(0.17, 0.26, 0.42, M.gold, 8);
  bronze.position.y = 1.4;
  bell.add(cap, bronze, block(-0.55, 1.85, -0.04, 0.55, 1.92, 0.04, M.wood));
  bell.position.set(-2.4, 0.15, face + 0.2);
  g.add(bell);
  const burner = prism(0.2, 0.15, 0.28, M.iron, 6);
  burner.position.set(1.2, 0.29, face - 0.4);
  g.add(burner);
  g.add(lanternAt(M, 1.7, 2.3, deck0 + 0.15), lanternAt(M, -1.7, 2.3, deck0 + 0.15));
  tag(g, 'mountainTemple');
  g.userData.inCliff = true;
  return { object: g, burner: new THREE.Vector3(1.2, 0.6, face - 0.4) };
}

/** 砍倒的木头：一根放倒的原木（截面露着年轮），或者一截树桩。 */
function felled(M, kind) {
  const g = new THREE.Group();
  if (kind === 'stump') {
    const s = prism(0.3, 0.36, 0.5, M.wood, 8);
    s.position.y = 0.25;
    const top = prism(0.28, 0.28, 0.04, M.straw, 8);
    top.position.y = 0.51;
    g.add(s, top);
  } else {
    const log = prism(0.26, 0.26, 2.6, M.wood, 8);
    log.rotation.z = Math.PI / 2;
    log.position.y = 0.26;
    for (const sx of [-1, 1]) { const end = prism(0.24, 0.24, 0.04, M.straw, 8); end.rotation.z = Math.PI / 2; end.position.set(sx * 1.31, 0.26, 0); g.add(end); }
    g.add(log, block(0.4, 0.4, -0.05, 0.5, 0.95, 0.05, M.wood)); // 没砍干净的一根枝杈
  }
  return tag(g, kind === 'stump' ? 'stump' : 'log');
}

/** 原木垛：截齐的原木码成三层——底下三根、中间两根、顶上一根，两头露着年轮，前后打两根木桩挡着不滚。 */
function logPile(M) {
  const g = new THREE.Group();
  const r = 0.24, len = 3.2;
  [3, 2, 1].forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * 2 * r, y = r + row * r * Math.sqrt(3);
      const log = prism(r, r, len, M.wood, 8);
      log.rotation.z = Math.PI / 2;
      log.position.set((row % 2) * 0.08, y, z);
      g.add(log);
      for (const sx of [-1, 1]) { const end = prism(r - 0.03, r - 0.03, 0.04, M.straw, 8); end.rotation.z = Math.PI / 2; end.position.set((row % 2) * 0.08 + sx * (len / 2 + 0.01), y, z); g.add(end); }
    }
  });
  for (const sx of [-1.1, 1.1]) for (const sz of [-1, 1]) g.add(block(sx - 0.05, 0, sz * 0.82 - 0.05, sx + 0.05, 0.75, sz * 0.82 + 0.05, M.wood));
  return tag(g, 'logPile');
}

/**
 * 挂壁古道：路在崖腰平台上。TUNNEL 那几段凿进崖里——上面一整块崖石压着（顶面和崖顶齐平），
 * 外侧留一道石墙，开一排窗洞透光；其余几段是明路，外沿砌一道矮石墙。
 * pts：古道上的点（世界坐标 + 高度），从东往西。
 */
function cliffRoad(M, pts, terrain) {
  const g = new THREE.Group();
  const lidMats = [M.cliff, M.cliff, M.rockTop, M.cliff, M.cliff, M.cliff]; // +x -x +y -y +z -z
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    let nx = uz, nz = -ux;
    if (nz < 0) { nx = -nx; nz = -nz; } // 朝外（南）
    const rot = -Math.atan2(dz, dx);
    const piece = (along, across, y0, y1, len, depth, mat) => { // 沿路的一块：along 沿路方向偏移，across 往外偏移
      const m = box(len, y1 - y0, depth, Array.isArray(mat) ? M.cliff : mat, { outline: !Array.isArray(mat) && mat !== M.cliff });
      if (Array.isArray(mat)) m.material = mat;
      m.position.set(A.x + ux * along + nx * across, (y0 + y1) / 2, A.z + uz * along + nz * across);
      m.rotation.y = rot;
      g.add(m);
    };
    const u0 = A.x - OX, u1 = B.x - OX;
    const inTunnel = Math.min(u0, u1) >= TUNNEL[0] - 0.01 && Math.max(u0, u1) <= TUNNEL[1] + 0.01;
    if (inTunnel) {
      const base = Math.min(A.h, B.h), top = base + 2.6;
      piece(L / 2, -0.05, top, PLATEAU + 0.06, L + 0.4, 3.9, lidMats); // 头顶的崖石
      piece(L / 2, 1.45, base - 0.1, base + 0.9, L + 0.4, 0.7, M.cliff); // 窗台
      piece(L / 2, 1.45, top - 0.4, top, L + 0.4, 0.7, M.cliff); // 窗楣
      for (let s = 0.2; s < L; s += 4) piece(s + 1.1, 1.45, base + 0.9, top - 0.4, 2.2, 0.7, M.cliff); // 窗洞之间的石柱
    } else {
      for (let s = 0.4; s < L - 0.6; s += 2.2) { // 明路：外沿一段段矮石墙
        const x = A.x + ux * (s + 0.8) + nx * 1.3, z = A.z + uz * (s + 0.8) + nz * 1.3;
        piece(s + 0.8, 1.3, terrain.walkAt(x - nx * 1.3, z - nz * 1.3), terrain.walkAt(x - nx * 1.3, z - nz * 1.3) + 0.7, 1.6, 0.4, M.rubble);
      }
    }
  }
  tag(g, 'cliffRoad');
  g.userData.inCliff = true;
  return g;
}

/** 石板桥：两块青石板搭在溪上，两头石墩。b 来自地形（中心、走向、桥面高、长度）。 */
function slabBridge(M, b) {
  const g = new THREE.Group();
  const half = b.len / 2;
  const deck = block(-0.9, b.deck - 0.25, -half, 0.9, b.deck, half, M.stone);
  deck.userData.walkable = true;
  g.add(deck);
  for (const s of [-1, 1]) g.add(block(-1.0, b.deck - 1.6, s * half - 0.5, 1.0, b.deck - 0.25, s * half + 0.1 * s, M.rubble));
  g.position.set(b.x, 0, b.z);
  g.rotation.y = b.rot;
  g.userData.onBridge = true;
  tag(g, 'slabBridge');
  return g;
}

// ---------------------------------------------------------------- 搭西沟

/**
 * M：村子的材质（共用，夜里灯火跟着一起变）。返回 { object, terrain, nodes, things, placeAt, update }。
 * update(t, { light, weather, viewer, hour }) 每帧调（不显示的时候也便宜）。
 */
export function buildWest(M) {
  addWestMaterials(M);
  const root = new THREE.Group();
  root.scale.setScalar(UNIT);
  const rand = makeRng(515);

  // 1. 路网节点的高度：古道上是平台的高度，庙前是石龛的高度，其余跟着地面
  const nodes = {};
  for (const [name, [u, z]] of Object.entries(ROAD)) nodes[name] = { x: W(u), z, h: q(natural(W(u), z).h, 0.3) };
  nodes.east.h = Math.round(rawHeight(nodes.east.x, nodes.east.z) / 0.3) * 0.3; // 和村子那头的路口（layout.js 的 westGate）一样算法：接缝两边路面一样高
  for (const u of GALLERY) nodes[GNAME(u)] = { x: W(u), z: zTop(u) + 1.4, h: q(benchH(u), 0.3) };
  const seam = nodes[GNAME(GALLERY[0])]; // 古道东头接村子（layout.js 的 westCliff）：和村子路口一样算高度，接缝两边路面一样高
  seam.h = Math.round(rawHeight(seam.x, seam.z) / 0.3) * 0.3;
  nodes.ridge.h = PLATEAU;
  nodes.fordW.h = nodes.fordE.h = Math.max(nodes.fordW.h, nodes.fordE.h);
  nodes.stair = { x: W(STAIR.u1 - 0.5), z: zTop(STAIR.u1 - 0.5) - 0.9, h: 15 };
  nodes.temple = { x: W(STAIR.u0 - 0.8), z: zTop(STAIR.u0 - 0.8) - 0.9, h: NICHE.h }; // 栈台东头
  const millLevel = MILL.level;
  nodes.mill = { x: W(MILL.u + MILL.w / 2 + 0.6), z: MILL.z, h: millLevel };
  const templeZ = zTop(NICHE.c) - TEMPLE.back;
  const pads = [
    { x: W(MILL.u), z: MILL.z, rot: 0, w: MILL.w, d: MILL.d, level: millLevel },
    { x: W(NICHE.c), z: templeZ, rot: 0, w: TEMPLE.w, d: TEMPLE.d, level: NICHE.h },
  ];

  // 2. 地形
  const terrain = buildTerrain(M, { pads, nodes, edges: EDGES, bounds: WEST_BOUNDS, natural, water, farm: false, sideMat: sideMat(M), cropMats: [M.stubbleW, M.furrow, M.furrow, M.sprout] });
  root.add(terrain.object);

  // 3. 地标：挂壁古道、半崖上的山神庙、水磨坊和拦河坝、石板桥
  root.add(cliffRoad(M, GALLERY.map((u) => nodes[GNAME(u)]), terrain));
  const tp = temple(M, TEMPLE.back);
  tp.object.position.set(W(NICHE.c), NICHE.h, templeZ);
  root.add(tp.object);

  const mill = watermill(M, WHEEL_U - MILL.u, WHEEL_Z - MILL.z, WATER_Y - 0.6 + 2.2 - 0.5 - millLevel); // 轮子下沿浸在坝下的水里
  mill.object.position.set(W(MILL.u), millLevel, MILL.z);
  root.add(mill.object);
  const weirZ = WHEEL_Z; // 拦河坝：一道毛石坝横在溪上（这段河道是直的），坝顶比上游水面高一点
  root.add(tag(block(W(WEIR_U), WATER_Y - 1.6, weirZ - STREAM_HALF - 0.3, W(WEIR_U) + 0.6, WATER_Y + 0.12, weirZ + STREAM_HALF + 0.3, M.rubble), 'weir'));
  root.add(P.firewood(M, W(MILL.u - 2.0), MILL.z - 2.6, 3.4).translateY(millLevel));
  root.add(P.vat(M, W(MILL.u - 4.0), MILL.z + 1.6).translateY(millLevel));
  for (const b of terrain.bridges) root.add(slabBridge(M, b));

  // 瀑布、深潭：点它看卡片（地形上的跌水面本身没有标签，放一个看不见的盒子）
  const fallBox = new THREE.Mesh(new THREE.BoxGeometry(3, PLATEAU - POOL.level, POOL.r * 2 + 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  fallBox.position.set(W(FALL_U), (PLATEAU + POOL.level) / 2, POOL.z - 0.6);
  fallBox.userData.dynamic = true;
  root.add(tag(fallBox, 'waterfall'));

  // 4. 收秋：地里的庄稼、茬地里的谷个子；地头的大车、谷草垛、稻草人、看青棚
  const flatSpot = (u0, z0, w, d, r = 5) => {
    for (let rr = 0; rr <= r; rr += 0.5) for (let a = 0; a < 16; a++) {
      const x = W(u0) + Math.cos(a * 0.39) * rr, z = z0 + Math.sin(a * 0.39) * rr, h = terrain.heightAt(x, z);
      const ok = [-w / 2, 0, w / 2].every((dx) => [-d / 2, 0, d / 2].every((dz) => terrain.heightAt(x + dx, z + dz) === h && ['field', 'grass'].includes(terrain.typeAt(x + dx, z + dz))));
      if (ok) return [x, z, h];
    }
    return null;
  };
  const put = (obj, s) => { if (s) { obj.position.set(s[0], s[2], s[1]); root.add(obj); } };
  put(P.cart(M, 0, 0, 0.3), flatSpot(12, 14, 3.4, 2.2));
  put(P.haystack(M, 0, 0, 1.2, 2.4), flatSpot(30, 13, 2.6, 2.6));
  put(P.haystack(M, 0, 0, 1.0, 2.0), flatSpot(-4, 15, 2.2, 2.2));
  put(P.haystack(M, 0, 0, 1.1, 2.2), flatSpot(-20, 4, 2.4, 2.4));
  if (is('summer', 'autumn')) { put(P.fieldHut(M, 0, 0, 0), flatSpot(4, 18, 3, 2.4)); put(P.fieldHut(M, 0, 0, 0), flatSpot(-36, 14, 3, 2.4)); } // 看青棚、稻草人：庄稼快熟的时候
  const crops = fieldCrops(M, terrain.fieldCells, rand); // 和村子同一套庄稼（麦苗地只是地皮）
  const scare = terrain.fieldCells.filter((c, i) => i % 41 === 0 && (c.crop === 1 || c.crop === 2));
  for (let i = 0; i < 4 && scare.length; i++) { const c = scare.splice(Math.floor(rand() * scare.length), 1)[0], rot = rand() * 6; if (is('summer', 'autumn')) root.add(P.scarecrow(M, c.x, c.z, rot).translateY(c.h)); } // 稻草人：夏秋（随机数四季照样用掉）

  // 5. 树：庙顶上一棵歪脖子松、古道上方崖边一棵松（参与合批）；成片的山林、果园、大石头用实例化（不合批）
  const plant = (kind, x, z, seed, scale) => {
    const m = new THREE.Mesh(voxelTree(kind, seed, scale), M.voxel);
    m.castShadow = m.receiveShadow = true;
    m.position.set(x, terrain.heightAt(x, z), z);
    m.userData.tree = true;
    root.add(m);
  };
  plant('pine', W(NICHE.c + 3), zTop(NICHE.c) - NICHE.depth - 2.2, 7, 1.1);
  plant('pine', W(10), zTop(10) - 1.2, 9, 1.15);

  const pathNear = (x, z, r) => [0, 1.57, 3.14, 4.71].some((a) => terrain.typeAt(x + Math.cos(a) * r, z + Math.sin(a) * r) === 'path') || terrain.typeAt(x, z) === 'path';
  const wet = (x, z) => [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].some(([dx, dz]) => terrain.typeAt(x + dx, z + dz) === 'stream');

  // 庙下面那段下山路两边：林子里有人砍过树——几截树桩、放倒的原木、码起来的木料和柴火；其余还是树
  const taken = [];
  const level = (x, z, w, d, rot = 0) => { // 转过 rot 的 w × d 范围内一样高、都是林地或草坡，返回高度
    const h = terrain.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
    return [-w / 2, 0, w / 2].every((a) => [-d / 2, 0, d / 2].every((b) => { const px = x + a * c + b * s, pz = z - a * s + b * c; return terrain.heightAt(px, pz) === h && ['forest', 'grass'].includes(terrain.typeAt(px, pz)); })) ? h : null;
  };
  const along = [['g-16', 'd1'], ['d1', 'd2'], ['d2', 'f3']];
  let logs = 0;
  for (const [a, b] of along) {
    const A = nodes[a], B = nodes[b], L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
    for (let s = 1.5; s < L - 1; s += 2.2) for (const side of [-1, 1]) {
      const r = rand(), kind = r < 0.3 ? 'stump' : r < 0.55 && logs < 5 ? 'log' : null; // 原木就五根
      if (!kind) continue;
      let spot = null;
      const along0 = Math.atan2(-uz, ux);
      for (let off = kind === 'stump' ? 1.2 : 1.8; off < 4.5 && !spot; off += 0.3) { // 树桩挨着路边，原木往外一点
        const x = A.x + ux * s - uz * off * side, z = A.z + uz * s + ux * off * side;
        if (pathNear(x, z, 0.8)) continue;
        if (kind === 'stump') { const h = level(x, z, 0.8, 0.8); if (h !== null) spot = [x, z, h, rand() * 6, 0]; continue; }
        for (const yaw of [along0 + Math.PI / 2, along0 + Math.PI / 2 + 0.4, along0 + Math.PI / 2 - 0.4, along0]) { // 原木顺着坡斜躺：两头搭在上下两级坎子上
          const c = Math.cos(yaw) * 1.3, sn = Math.sin(yaw) * 1.3;
          const h0 = terrain.heightAt(x - c, z + sn), h1 = terrain.heightAt(x + c, z - sn), hm = terrain.heightAt(x, z);
          const soil = [[x - c, z + sn], [x, z], [x + c, z - sn]].every(([px, pz]) => ['forest', 'grass'].includes(terrain.typeAt(px, pz)));
          if (soil && Math.abs(h1 - h0) <= 1.3 && hm <= Math.max(h0, h1) + 0.01 && hm >= Math.min(h0, h1) - 0.01) { spot = [x, z, (h0 + h1) / 2, yaw, Math.atan2(h1 - h0, 2.6)]; break; }
        }
      }
      if (!spot) continue;
      const [x, z, h, yaw, pitch] = spot;
      const o = felled(M, kind);
      o.position.set(x, h, z);
      o.rotation.set(0, yaw, pitch);
      o.userData.tilted = true; // 斜躺着，悬空自检跳过
      root.add(o);
      if (kind === 'log') logs++;
      taken.push([x, z, kind === 'log' ? 2.0 : 0.6]);
    }
  }
  // 林子下沿（挨着梯田）：码成三角的原木垛、柴火垛、木料堆，找路边一块平地
  for (const [n, k, w, d] of [['f3', 'logPile', 3.6, 1.8], ['d2', 'logPile', 3.6, 1.8], ['d1', 'firewood', 2.6, 1.4]]) {
    const N = nodes[n];
    let spot = null;
    for (let r = 2.4; r < 10 && !spot; r += 0.5) for (let a = 0; a < 16 && !spot; a++) {
      const x = N.x + Math.cos(a * 0.39) * r, z = N.z + Math.sin(a * 0.39) * r, h = level(x, z, w, d, 0.2);
      if (h !== null && !pathNear(x, z, 1.4) && !taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + 1.5)) spot = [x, z, h];
    }
    if (!spot) continue;
    const o = k === 'logPile' ? logPile(M) : P.firewood(M, 0, 0, 2.2);
    o.position.set(spot[0], spot[2], spot[1]);
    o.rotation.y = 0.2;
    root.add(o);
    taken.push([spot[0], spot[1], w / 2 + 0.5]);
  }

  const trunks = [], fellable = [];
  const groves = { pine: [], smoke: [], oak: [], walnut: [], cypress: [], bush: [], persimmon: [] };
  const pick = (w) => { let r = rand(); for (const [k, p] of w) if ((r -= p) < 0) return k; return w[0][0]; };
  const FOREST = [['pine', 0.3], ['smoke', 0.22], ['oak', 0.25], ['cypress', 0.08], ['walnut', 0.05], ['bush', 0.1]];
  const RIM = [['pine', 0.35], ['smoke', 0.45], ['cypress', 0.2]];
  const RIDGE = [['cypress', 0.3], ['persimmon', 0.3], ['bush', 0.4]]; // 东边山梁上，和村子那边一样稀稀落落
  const nearNiche = (u, z) => { const b = zTop(u) - z; return u > NICHE.c - NICHE.half - 1.5 && u < STAIR.u1 + 1 && b > -0.5 && b < NICHE.depth + 2.5; }; // 庙龛、崖里石阶这一块崖上不种
  for (let x = WEST_BOUNDS.x0 + 1; x < WEST_BOUNDS.x1 - 1; x += 2.3) for (let z = WEST_BOUNDS.z0 + 1; z < WEST_BOUNDS.z1 - 1; z += 2.3) {
    const px = x + (rand() - 0.5) * 1.6, pz = z + (rand() - 0.5) * 1.6, u = px - OX, type = terrain.typeAt(px, pz);
    if (pathNear(px, pz, 1.4) || wet(px, pz) || nearNiche(u, pz) || taken.some(([tx, tz, tr]) => Math.hypot(px - tx, pz - tz) < tr + 0.6) || pads.some((p) => Math.abs(px - p.x) < p.w / 2 + 1.5 && Math.abs(pz - p.z) < p.d / 2 + 1.5)) continue;
    let kind = null;
    if (type === 'forest' && rand() < 0.78) kind = pick(FOREST);
    else if (pz < zTop(u) && type === 'grass' && rand() < 0.3) kind = pick(RIM); // 崖顶、山上
    else if (pz < zTop(u) && type === 'rock' && rand() < 0.1) kind = rand() < 0.6 ? 'smoke' : 'pine'; // 石缝里的红叶
    else if (type === 'grass' && u > 39 && rand() < 0.1) kind = pick(RIDGE);
    else if (type === 'field' && rand() < 0.015) kind = 'bush'; // 地头的酸枣丛
    if (!kind) continue;
    groves[kind].push([px, pz, 0.8 + rand() * 0.35]);
    if (type === 'forest' && kind !== 'bush') fellable.push([px, pz]); // 砍柴的人来砍这些
  }
  for (const [a, b] of along) { // 下山步道两边：林子贴着路长，稠一点（树桩、原木、木料垛占了的地方空着）
    const A = nodes[a], B = nodes[b], L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
    for (let s = 0.8; s < L - 0.5; s += 1.7) for (const side of [-1, 1]) {
      const off = 1.5 + rand() * 1.2, x = A.x + ux * s - uz * off * side + (rand() - 0.5) * 0.5, z = A.z + uz * s + ux * off * side + (rand() - 0.5) * 0.5;
      if (terrain.typeAt(x, z) !== 'forest' || pathNear(x, z, 1.0) || taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + 0.4)) continue;
      if (Object.values(groves).some((l) => l.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 1.3))) continue;
      const kind = pick(FOREST.filter(([k]) => k !== 'bush'));
      groves[kind].push([x, z, 0.75 + rand() * 0.3]);
      fellable.push([x, z]);
    }
  }
  for (let u = 27.5; u < 37; u += 3.4) for (let z = -2.5; z < 9; z += 3.6) { // 柿子园、核桃：一行行
    const x = W(u + (rand() - 0.5) * 0.6), zz = z + (rand() - 0.5) * 0.6;
    if (terrain.typeAt(x, zz) !== 'grass' || pathNear(x, zz, 1.2)) continue;
    groves[(Math.round(u) + Math.round(z)) % 3 ? 'persimmon' : 'walnut'].push([x, zz, 0.85 + rand() * 0.2]);
  }
  for (const [du, dz] of [[-6.2, -3.6], [5.8, -4.0], [6.6, 1.6]]) groves[du > 6 ? 'walnut' : 'persimmon'].push([W(MILL.u + du), MILL.z + dz, 0.95]); // 磨坊边的柿子树、核桃树
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  const flora = new THREE.Group();
  const SEEDS = 2; // 每种树两个样子，轮着用
  for (const [kind, list] of Object.entries(groves)) {
    if (!list.length) continue;
    for (let v = 0; v < SEEDS; v++) {
      const mine = list.filter((_, i) => i % SEEDS === v);
      if (!mine.length) continue;
      const mesh = new THREE.InstancedMesh(voxelTree(kind, 600 + v * 17 + kind.length, 1), M.voxel, mine.length);
      mine.forEach(([x, z, s], i) => { mesh.setMatrixAt(i, m4.compose(p3.set(x, terrain.heightAt(x, z), z), qt, sc.set(s, s, s))); trunks.push([x, z, kind === 'bush' ? 0.3 : 0.4]); });
      mesh.castShadow = mesh.receiveShadow = true;
      flora.add(mesh);
    }
  }
  // 大石头：崖脚、溪边、山上
  const rocks = [];
  for (let i = 0; i < 500 && rocks.length < 80; i++) {
    const x = WEST_BOUNDS.x0 + 1 + rand() * 88, z = -34 + rand() * 62, u = x - OX, t = terrain.typeAt(x, z);
    const footOfCliff = t === 'forest' && z - zTop(u) < 7;
    if (!(footOfCliff || (t === 'rock' && z < zTop(u)) || (wet(x, z) && t !== 'stream' && t !== 'path')) || pathNear(x, z, 1.2) || nearNiche(u, z)) continue;
    rocks.push([x, z, 0.7 + rand() * 0.8]);
  }
  for (let v = 0; v < 3; v++) {
    const mine = rocks.filter((_, i) => i % 3 === v);
    const mesh = new THREE.InstancedMesh(boulderGeo(11 + v), M.voxel, mine.length);
    mine.forEach(([x, z, s], i) => { mesh.setMatrixAt(i, m4.compose(p3.set(x, terrain.heightAt(x, z) - 0.1, z), qt, sc.set(s, s * 0.8, s))); trunks.push([x, z, 0.5 * s]); });
    mesh.castShadow = mesh.receiveShadow = true;
    flora.add(mesh);
  }
  flora.add(crops);
  flora.userData.count = { ...Object.fromEntries(Object.entries(groves).map(([k, l]) => [k, l.length])), rocks: rocks.length, ...crops.userData.count };

  // 6. 共面闪烁、悬空自检；记下要投影进导航网格的东西（合批会拆掉网格，所以先记），合批前收集点物件用的包围盒
  root.userData.coplanar = fixCoplanar(root, (o) => o === terrain.object || o.userData.tree || o.isSprite);
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const blockers = [];
  const collect = (o) => { // 和村子一样：房子、墙、道具、树干算障碍；地形、会动的、能踩的（栈台、桥面）不算
    if (o === terrain.object || o === flora || o.userData.dynamic || o.userData.tree || o.userData.walkable) return;
    if (o.isMesh && !(o.geometry instanceof THREE.PlaneGeometry) && !o.geometry.type.includes('Circle')) blockers.push([o, new THREE.Matrix4().multiplyMatrices(toRoot, o.matrixWorld)]);
    for (const k of o.children) collect(k);
  };
  for (const k of root.children) collect(k);
  root.userData.floating = findFloating(root, terrain);
  const things = collectThings(root, {});
  root.userData.bake = bakeStatic(root);
  root.add(flora);
  root.userData.flora = flora.userData.count;

  // 7. 会动的：瀑布和拦河坝的水雾、山溪边的萤火虫、雨、几盏灯
  const sprites = new Sprites(root, M);
  const spray = { size: 0.9, rise: 2.2, drift: 0.6, life: 0.35, colors: [R.white[2], R.water[4]] };
  const mist = [
    ...[0, 1, 2].map((i) => new Smoke(root, sprites, new THREE.Vector3(W(FALL_U) + (i - 1) * 0.8, POOL.level + 0.2, zTop(FALL_U) + 0.9), 40 + i, spray)),
    ...[0, 1].map((i) => new Smoke(root, sprites, new THREE.Vector3(W(WEIR_U) - 0.4, WATER_Y - 0.5, weirZ + (i - 0.5) * 1.6), 50 + i, { ...spray, size: 0.6, rise: 1.0 })),
  ];
  const fireflies = new Fireflies(root, M.fireflySprite, [[W(-30), W(-20), POOL.z - 3, POOL.z + 3, POOL.level], [W(-31), W(-21), 0, 16, 2], [W(14), W(26), MILL.z + 2, MILL.z + 6, 0]], 36, 9);
  const rain = new Rain(root, WEST_BOUNDS, terrain.walkAt, 2200, 13);
  const lights = [];
  const pointLight = (x, y, z, base, color = GLOW.lamp, dist = 0.07) => { // 只照亮门口一小片（西沟大半是黑的，光铺太开整片崖都发红）
    const l = new THREE.PointLight(color, 0, dist, 1.4);
    l.position.set(x, y, z);
    root.add(l);
    lights.push({ l, base });
  };
  pointLight(W(WHEEL_U + 1.7), millLevel + 2.2, MILL.z + 3.1, 0.032);
  pointLight(W(NICHE.c), NICHE.h + 1.2, templeZ + TEMPLE.d / 2 + 1.0, 0.014, GLOW.lamp, 0.045); // 只照栈台：崖壁是红石头，光铺开了整面崖都发红
  const millWindow = M.windowLit.clone(); // 磨坊自己的窗户：天黑才亮
  millWindow.onBeforeCompile = M.windowLit.onBeforeCompile;
  millWindow.customProgramCacheKey = M.windowLit.customProgramCacheKey;
  root.traverse((o) => { if (o.material === M.windowLit) o.material = millWindow; });
  const incense = new Smoke(root, sprites, tp.burner.clone().add(tp.object.position), 77, { size: 0.35, rise: 1.6, drift: 0.6, life: 0.25 });
  for (const m of incense.puffs) m.visible = false; // 香炉平时是冷的：有人来上了香才冒烟
  let litAt = -9; // 最近一次上香的钟点；一炷香烧一个来钟头

  // 点到地上（没碰到物件）：这一片叫什么
  const PLACE = {
    forest: { name: '西沟山林', tags: ['油松', '黄栌', '槲栎'], about: '崖脚下的一片杂木林。黄栌一到秋天就红透了，夹在油松的墨绿里格外显眼。村里人进山砍柴、采药，都往这里来。' },
    field: { name: '西沟梯田', tags: ['谷子', '高粱', '玉米'], about: '顺着山坡垒起的一层层旱地梯田，靠天吃饭。正赶上秋收：有的地已经割完，谷个子一捆捆立在茬地里晾着。' },
    cliff: { name: '红石崖', tags: ['红砂岩'], about: '太行山常见的红砂岩崖壁，一层层像码起来的书页。崖上是起伏的石头山，石缝里长着松柏和黄栌，风一吹，红叶就往崖下飘。' },
    stream: { name: '山溪', tags: [], about: '瀑布下的深潭漫出来，顺着山沟一路跌跌撞撞流到南边，和村里流过来的小溪汇在一起。' },
    slope: { name: '西沟', tags: [], about: '出了村西口、翻过山梁就是西沟：北边是红石崖，崖腰有一条挂壁古道，沟里是梯田和山林。' },
  };
  const placeAt = (x, z) => {
    const t = terrain.typeAt(x, z), u = x - OX;
    if (t === 'stream') return PLACE.stream;
    if (t === 'forest') return PLACE.forest;
    if (t === 'field') return PLACE.field;
    if (t === 'rock' || z < zTop(u)) return PLACE.cliff;
    return PLACE.slope;
  };

  // 村民到西沟来干的活：下地（主路边那几层梯田）、砍柴（路边林子里的树）、磨面（磨台北边站着，脸朝磨盘）
  const f2 = nodes.f2;
  const work = {
    fieldWest: terrain.fieldCells.filter((c) => (c.crop === 1 || c.crop === 2) && Math.hypot(c.x - f2.x, c.z - f2.z) < 9).map((c) => [c.x, c.z]),
    woods: fellable.map(([x, z]) => { // 林子里一级级坎子人上不去：砍路边的树，站在离树最近的路面上
      let best = null;
      for (let dx = -3; dx <= 3; dx += 0.5) for (let dz = -3; dz <= 3; dz += 0.5) {
        const d = Math.hypot(dx, dz);
        if (d < 0.8 || d > 3 || terrain.typeAt(x + dx, z + dz) !== 'path' || (best && d >= best.d)) continue;
        best = { d, at: [x + dx, z + dz] };
      }
      return best && { at: best.at, tree: [x, z] };
    }).filter(Boolean),
    mill: { at: [W(WHEEL_U), MILL.z - 0.15], face: [W(WHEEL_U), MILL.z + GEAR.z - 0.42] },
    temple: { at: [W(NICHE.c), templeZ + TEMPLE.d / 2 + 0.9], face: [W(NICHE.c), templeZ], light: (hour) => { litAt = hour; } }, // 上香：栈台上、庙门前
    pasture: (() => { // 崖顶平台上的草坡（古道窗洞顶上那一片，离崖边远一点）
      const out = [];
      for (let u = 10; u < 35; u += 1) for (let z = -34; z < -24; z += 1) if (terrain.typeAt(W(u), z) === 'grass' && zTop(u) - z > 3) out.push([W(u), z]);
      return out;
    })(),
    caravan: ['outW', 'cw2', 'd1', 'g-16', 'g4', 'g28', GNAME(GALLERY[0])].map((n) => [nodes[n].x, nodes[n].z]), // 骡帮进村：山外 → 崖脚 → 挂壁古道 → 古道东头（再往东是村子）
  };

  let fallStep = 0, last = 0;
  return {
    object: root,
    terrain,
    nodes,
    things,
    placeAt,
    work,
    edges: EDGES,
    /** 把西沟的房子、道具、树干、石头投影进（覆盖村子和西沟的）导航网格。 */
    blockNav(nav) {
      for (const [m, rel] of blockers) nav.blockMesh(m, rel, terrain.walkAt);
      for (const [x, z, r] of trunks) nav.blockDisc(x, z, r);
    },
    update(t, { light, weather, viewer, hour = 12 }) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      const n = light.night;
      const step = Math.floor(t * 10); // 跌水往下滚，一次一个像素
      const frozen = is('winter'); // 冬天瀑布冻成冰挂、水轮冻住不转，也没有水雾
      if (step !== fallStep && !frozen) { fallStep = step; M.tex.fall.offset.y = (step % 36) / 36; }
      const turn = frozen ? 0 : Math.round((t * 0.6) / (Math.PI / 16)) * (Math.PI / 16); // 水轮按一格一格转
      mill.wheel.userData.spin.rotation.x = -turn;
      mill.millstone.rotation.y = turn * (GEAR.r / GEAR.pin); // 灯笼齿轮小，竖轴和磨盘转得快一倍多
      for (const m of mist) m.update(dt, !frozen);
      incense.update(dt, hour >= litAt && hour < litAt + 1.2);
      fireflies.update(t);
      for (const ff of fireflies.flies) ff.visible &&= n > 0.4 && weather !== 'rain' && is('summer'); // 萤火虫：夏夜
      rain.update(dt, weather === 'rain');
      const k = Math.min(1, n * 1.1);
      millWindow.color.setRGB(0.42 + 0.58 * k, 0.36 + 0.64 * k, 0.34 + 0.66 * k);
      for (const { l, base } of lights) l.intensity = base * n * (0.92 + (Math.floor(t * 9 + l.position.x) % 3) * 0.04);
      sprites.face(viewer);
    },
  };
}
