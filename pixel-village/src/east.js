import * as THREE from 'three';
import { UNIT, block, box, prism, bakeStatic, makeRng } from './pixel.js';
import { R, GLOW } from './palette.js';
import { addEastMaterials } from './textures.js';
import { buildTerrain, rawHeight } from './terrain.js';
import { streamZ, BAND, STREAM_HALF, WATER_Y } from './layout.js';
import { house, wallSeg } from './buildings.js';
import * as PROPS from './props.js';
import { tagged, tag, collectThings } from './things.js';
import { voxelTree, voxelGeometry } from './voxel.js';
import { is } from './season.js';
import { findFloating } from './audit.js';
import { fixCoplanar } from './coplanar.js';
import { Sprites } from './sprites.js';
import { Smoke, Fireflies, Rain } from './fx.js';

const P = tagged(PROPS);

/*
 * 老村址（老石峪）：出了村东口，顺着小溪往上游走，绕过山嘴，河谷一下子宽了——石峪村原来就在这儿。
 * 六十多年前一个夏天，后山连下七天雨，山洪从上游的山口冲下来，漫过河湾，从村子当中冲出一条新河道，
 * 塌了大半个村子。水退以后大半人家搬到下游现在的地方重新起屋，老村址只剩几户不肯走的守着。
 * 王家祠堂里的牌位上写的都是"老石峪"；村里各家在这儿都还有一处塌了的老宅。
 * 现在这些老宅空着，等新来的人认下来、修起来住（见 HOUSES）。
 *
 *                  北（高）
 *   ┌────────────────────────────────────────────────┐
 *   │  山（往北越高，东北角一片杂木林）                    │
 *   │    河神庙 柳婆婆    葛家石匠院       白家石灰窑      │ ← 黄土坎上（大水没淹到）
 *   │ ▓▓▓▓▓▓▓▓▓▓▓ 大水冲出来的黄土坎 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
 *   │ 老宅 老宅 老宅 老宅 老宅 老宅   （北排六处）           │
 *   │ ═══════════ 老街 ═══════════════════════         │← 东头：上游的山口
 *   │戏台基  老宅   ░░旧河道（干了的卵石沟）░░░░░░░░░    │
 *   │ 老井        ░░    老宅 老宅 老宅 老宅（南排）        │
 *   │ 鸭棚 歪脖柳   ～～～ 河心洲 ～～～～～～～～～～～～～   │
 *   └────────────────────────────────────────────────┘
 *     ↑ 西边：山嘴后面就是村子（村东口）    南（低）
 *
 * 下面的坐标都写成"老村址本地"的 u（= 世界 x − 90，-45 … 45），z 和村子一样；W(u) 换回世界 x。
 */

export const EAST_BOUNDS = { x0: 45, x1: 135, z0: -36, z1: 36 + BAND.d };
const OX = 90;
const W = (u) => OX + u;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const q = (h, step) => Math.round(h / step) * step;
const sz = (u) => streamZ(W(u)); // 小溪中心线

/** 点到线段：距离和投影参数。 */
function seg(pu, pz, a, b) {
  const du = b[0] - a[0], dz = b[1] - a[1], L2 = du * du + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((pu - a[0]) * du + (pz - a[1]) * dz) / L2));
  return { d: Math.hypot(pu - a[0] - t * du, pz - a[1] - t * dz), t };
}
const toLine = (u, z, line) => Math.min(...line.slice(1).map((b, i) => seg(u, z, line[i], b).d));

/** 黄土坎（大水冲出来的那道坎）的坎沿：坎上是老辈人说的"高地"，大水没淹到。 */
const bankZ = (u) => -12 + 2.2 * Math.sin(u * 0.08 + 0.4);
const PLAIN = 1.8; // 河湾里的平地（老村子）
const TOP = 6.0; // 坎上
/** 旧河道：山洪从东头山口冲进来，穿过村子当中，又在西边归回小溪。干了，一沟白花花的卵石。 */
const OLDBED = [[46, 31], [36, 22], [26, 14], [14, 10], [2, 11], [-8, 16], [-14, 24], [-14, 34]];
const OLDBED_HALF = 2.6;
/** 河心洲：小溪在这一段分成两股，中间夹一条沙洲。 */
const ISLAND = { u0: -4, u1: 24 };
const isle = (u) => (u > ISLAND.u0 && u < ISLAND.u1 ? Math.sin((Math.PI * (u - ISLAND.u0)) / (ISLAND.u1 - ISLAND.u0)) : 0);
const streamHalf = (u) => STREAM_HALF + 0.8 * smooth(-44, -30, u) + 2.4 * isle(u); // 河湾里水面宽一些（接缝处和村子一样宽）

/** 一处老宅（宅基地）：u, z 是院子中心；w × d；who：原来是谁家的（现在村里哪户的祖宅）；state：0 塌了 / 1 能遮雨 / 2 修好了。 */
export const HOUSES = [
  { id: 'old1', u: -22, z: -3, who: '王家', state: 0, story: '王村长的爷爷那辈住在这儿。大水冲塌了东山墙，屋顶整个落了下来，只剩后墙还立着。' },
  { id: 'old2', u: -12, z: -3, who: '孙家', state: 1, story: '孙掌柜家的老铺面。墙还结实，屋顶塌了半边，门板被人拆去烧了火。' },
  { id: 'old3', u: -2, z: -3, who: '赵家', state: 0, story: '赵家的老磨坊。水从门里冲进来，把石磨盘冲到了院外，墙根还留着一道黄泥印子。' },
  { id: 'old4', u: 8, z: -3, who: '陈家', state: 0, story: '陈老汉出生在这院里。他说大水那天他才八九岁，是被他爹扛在肩上从齐腰深的水里背出去的。' },
  { id: 'old5', u: 18, z: -3, who: '杨家', state: 1, story: '杨家给唐东家当长工时住的小院。屋子小，墙倒没塌，补补屋顶就能住。' },
  { id: 'old6', u: 28, z: -3, who: '吴家', state: 0, story: '吴家老宅挨着冲出来的河道，西边半个院子都没了，剩下一间正房歪着。' },
  { id: 'old7', u: -2, z: 22, who: '刘家', state: 0, story: '刘木匠家的老宅。木匠家的房子梁最粗，到今天梁还架在墙上，只是瓦都没了。' },
  { id: 'old8', u: 8, z: 22, who: '张家', state: 0, story: '张家头一代铁匠在这儿打铁。炉子塌了，院里埋着烧黑的炉渣。' },
  { id: 'old9', u: 18, z: 22, who: '周家', state: 1, story: '周家药铺原先开在这儿。屋里的药柜早没了，墙上还看得出一格格药斗子的印子。' },
  { id: 'old10', u: 28, z: 23, who: '马家', state: 0, story: '马家放羊的老院子，离河最近，大水一来就淹到了窗台。' },
  { id: 'old11', u: -20, z: 18, who: '郑家', state: 0, story: '剃头匠老郑家的老宅，就在老戏台边上。他小时候趴在这墙头上看戏。' },
  { id: 'old12', u: -27, z: -19, who: '李家', state: 1, story: '据说是早年教书先生住的。在黄土坎上，大水没淹到，是年久没人住才破的。' },
];
const PLOT = { w: 8, d: 7 }; // 每处宅基地多大

/** 原住户：u, z 是院子中心。 */
const HOMES = {
  riverTemple: { u: -9, z: -19, w: 10, d: 7 }, // 河神庙 + 柳婆婆、水生住的小屋
  mason: { u: 11, z: -19, w: 9, d: 7 }, // 葛家石匠院
  limeKiln: { u: 31, z: -18, w: 9, d: 7 }, // 白家石灰窑
  duckYard: { u: -25, z: 29, w: 8, d: 6 }, // 苗家鸭棚（挨着水）
};
const HOME_NAMES = { riverTemple: '河神庙', mason: '葛家石匠院', limeKiln: '白家石灰窑', duckYard: '苗家鸭棚' };
const PLAZA = { u: -32, z: 16 }; // 老戏台的台基
const WELL = { u: -13, z: 8.5 }; // 老井：老街边上

// ---------------------------------------------------------------- 地面

/** 老村址自己的地面（还没和村子的山梁接上）：{ h, type }。 */
function ground(u, z) {
  const x = W(u), s = sz(u), half = streamHalf(u);
  if (Math.abs(z - s) < 1.0 * isle(u)) return { h: 0, type: 'sand' }; // 河心洲（水面以外的那一条）
  if (z > s + half) return { h: Math.max(0, Math.floor((0.5 + Math.min(1.0, (z - s - half) * 0.18) + 0.25 * Math.sin(x * 0.3)) / 1.2) * 1.2), type: 'grass' }; // 溪南的河滩，和村子一样
  if (z > s - half - 3.2) return { h: 0.6, type: 'gravel' }; // 北岸的卵石滩
  const gorge = smooth(33, 45, u) * smooth(-2, 6, s - half - 3.2 - z); // 东头山口：两边的山挤过来
  const bump = 0.6 * Math.sin(u * 0.17 + z * 0.11) + 0.5 * Math.sin(u * 0.07 - z * 0.19 + 1.3);
  if (toLine(u, z, OLDBED) < OLDBED_HALF) return { h: 0.6 + (gorge > 0.5 ? 1.2 : 0), type: 'gravel' }; // 旧河道
  const bz = bankZ(u);
  if (z > bz) { // 河湾里的平地：老村子；往东头山口那边慢慢升起来
    const h = z > 14 ? PLAIN - 0.6 : PLAIN;
    return { h: q(h + gorge * (5 + bump), 0.6), type: 'grass' };
  }
  const back = bz - z; // 坎上：先是一块平的（原住户的院子），再往北一级级上山
  const h = TOP + Math.max(0, back - 9) * 0.32 + (back > 9 ? bump * 1.2 : 0) + gorge * 3;
  const forest = back > 14 && Math.sin(u * 0.13 + 1) + Math.sin(z * 0.21) > 0.2 - smooth(10, 40, u);
  return { h: Math.max(TOP, Math.floor(h / 1.2) * 1.2), type: forest ? 'forest' : 'grass' };
}

/** 西边 8 米和村子的山梁接上：高度渐变到村子地形（交界处完全一样），地面也换成草坡。 */
function natural(x, z) {
  const u = x - OX, g = ground(u, z), w = 1 - smooth(-45, -37 + 7 * (1 - smooth(18, 24, z)), u); // 北边村子那头是高山梁：绕出一道山嘴慢慢落下来；溪边那条路窄一点
  if (w <= 0) return g;
  const v = Math.max(0, Math.floor(rawHeight(x, z) / 1.2) * 1.2);
  return { h: q(g.h + (v - g.h) * w, 0.6), type: w > 0.5 && g.type !== 'gravel' ? 'grass' : g.type };
}

function water(x, z) {
  const u = x - OX, s = sz(u);
  if (Math.abs(z - s) >= streamHalf(u)) return null;
  if (Math.abs(z - s) < 1.0 * isle(u)) return null; // 河心洲
  return WATER_Y;
}

/** 落差侧面：黄土坎是土崖（不是砌的）；其余照村子。 */
function sideMat(M) {
  return (type, drop, x, z) => {
    const u = x - OX;
    if (drop >= 1.2 && z < bankZ(u) + 1.5 && type !== 'path') return M.bankWall;
    if (type === 'gravel') return drop >= 0.6 ? M.bankWall : null;
    if (type === 'sand') return M.soil;
    return null;
  };
}

// ---------------------------------------------------------------- 路网

const ROAD = {
  west: [-44.7, 27], g1: [-38, 22], plaza: [-29, 20], // 从村东口过来：顺着溪边，绕过山嘴
  sW: [-28, 4.5], s1: [-17, 4.5], s2: [-7, 4.5], s3: [3, 4.5], s4: [13, 4.5], s5: [23, 4.5], sE: [36, 4.5], // 老街
  ford: [3, 17], lW: [-7, 27.5], lE: [33, 27.5], // 过旧河道到南排
  up1: [-7, -9], up2: [13, -9], up3: [36, -8], // 上坎的坡道（从两处老宅之间上去）
  tWW: [-27, -14.5], tW: [-9, -14.5], tM: [11, -14.5], tE: [31, -13.5], // 坎上的小路：各家门口
  duck: [-25, 24.5],
  bW: [-7, 34], bE: [30, 30], bD: [-19, 32.5], // 下到河滩（卵石滩比平地低一级）
};
const EDGES = [
  ['west', 'g1'], ['g1', 'plaza'], ['plaza', 'sW'], ['g1', 'duck'],
  ['sW', 's1'], ['s1', 's2'], ['s2', 's3'], ['s3', 's4'], ['s4', 's5'], ['s5', 'sE'],
  ['s3', 'ford'], ['ford', 'lW'], ['ford', 'lE'],
  ['s2', 'up1'], ['up1', 'tW'], ['s4', 'up2'], ['up2', 'tM'], ['sE', 'up3'], ['up3', 'tE'], ['tW', 'tM'], ['tM', 'tE'], ['tWW', 'tW'], ['lW', 'bW'], ['lE', 'bE'], ['duck', 'bD'], ['bD', 'bW'],
];

// ---------------------------------------------------------------- 物件

/** 地上的大石头：大水冲下来的圆石，半埋在地里。voxel 边长 0.14 米。 */
function boulderGeo(seed) {
  const r = makeRng(seed);
  const [a, b, c] = [4 + r() * 2, 3 + r() * 1.5, 3.5 + r() * 2];
  const solid = (x, y, z) => y >= 0 && Math.hypot(x / a, (y - 0.5) / b, z / c) < 1 + Math.sin(x * 1.3 + z * 0.7 + seed) * 0.08;
  const color = (x, y, z, f) => (f === 2 ? (x + z) % 4 ? R.stone[3] : R.stone[4] : f === 1 || f === 5 ? R.stone[2] : R.stone[1]);
  return voxelGeometry([-7, 0, -7], [8, 5, 8], solid, color, 0.14, [-0.07, 0, -0.07]);
}

/** 一堆碎土坯、碎石头：几块方块错着堆。 */
function rubbleHeap(M, g, x, z, s, rand, mat) {
  for (let i = 0; i < 6; i++) {
    const w = (0.35 + rand() * 0.4) * s, h = (0.18 + rand() * 0.25) * s, dx = (rand() - 0.5) * s * 1.2, dz = (rand() - 0.5) * s * 0.9, y = i > 3 ? h * 0.8 : 0;
    const b = block(x + dx - w / 2, y, z + dz - w / 2, x + dx + w / 2, y + h, z + dz + w / 2, i % 3 ? mat : M.rubble);
    b.rotation.y = rand() * 1.2;
    g.add(b);
  }
}

/**
 * 破房子：土坯墙、门洞、窗洞。state 0：墙头参差、塌了一角、没顶，几根椽子横七竖八；1：墙齐全，屋顶塌了半边（前坡没了，露着椽子）；
 * 2：修好了（一栋完整的土坯房，草顶 / 瓦顶，有烟囱）。原点在地面中心，正面朝 +z。
 */
function ruinHouse(M, { w = 5.2, d = 4, h = 2.8, state = 0, seed = 1 }) {
  const rand = makeRng(seed);
  if (state >= 2) {
    const hs = house(M, { w, d, h, wall: 'adobe', rise: 1.3, roofMat: 'thatch', chimney: true, lit: true, front: [{ k: 'door', x: -w / 5 }, { k: 'windowLit', x: w / 5, y: 1.0 }] });
    return hs.object;
  }
  const g = new THREE.Group();
  g.add(block(-w / 2 - 0.2, 0, -d / 2 - 0.2, w / 2 + 0.2, 0.3, d / 2 + 0.2, M.stone)); // 台基
  const T = 0.4, col = 0.5;
  const top = (k, n) => (state === 1 ? h : h - (rand() < 0.35 ? 0.6 + rand() * 1.2 : rand() * 0.4) * (k === 0 || k === n - 1 ? 0.5 : 1)); // 墙头参差（墙角留得高）
  const wallRun = (len, place, gaps = []) => { // 一面墙按 0.5 米一段竖着砌，墙头高低不一；gaps：[起, 止, 下沿, 上沿]（门洞、窗洞）
    const n = Math.round(len / col);
    for (let k = 0; k < n; k++) {
      const a = -len / 2 + k * col, b = a + col, mid = (a + b) / 2, t = top(k, n);
      const gap = gaps.find(([g0, g1]) => mid > g0 && mid < g1);
      if (!gap) { place(a, b, 0.3, t); continue; }
      if (gap[2] > 0.3) place(a, b, 0.3, gap[2]);
      if (gap[3] < t) place(a, b, gap[3], t);
    }
  };
  const lost = state === 0 ? (rand() < 0.5 ? 1 : -1) : 0; // 塌了的那一角：东南 / 西南
  wallRun(w, (a, b, y0, y1) => g.add(block(a, y0, -d / 2, b, y1, -d / 2 + T, M.adobe))); // 后墙
  for (const sx of [-1, 1]) wallRun(d - 2 * T, (a, b, y0, y1) => { // 山墙：塌了的那边前半截没了
    if (sx === lost && a > -0.2) return;
    g.add(block(sx * w / 2 - (sx > 0 ? T : 0), y0, a, sx * w / 2 + (sx > 0 ? 0 : T), y1, b, M.adobe));
  });
  wallRun(w, (a, b, y0, y1) => { // 前墙：门洞、窗洞
    if (lost && a * lost > w / 2 - 1.6) return;
    g.add(block(a, y0, d / 2 - T, b, y1, d / 2, M.adobe));
  }, [[-w / 5 - 0.5, -w / 5 + 0.5, 0.3, 2.1], [w / 5 - 0.45, w / 5 + 0.45, 1.0, 1.8]]);
  g.add(block(-w / 2 - 0.03, 0.3, -d / 2 - 0.03, w / 2 + 0.03, 0.8, -d / 2 + T + 0.03, M.rubble)); // 石头墙基（后墙）
  if (lost) rubbleHeap(M, g, lost * (w / 2 - 0.4), d / 2 + 0.3, 1.6, rand, M.adobe); // 塌下来的那一角
  // 屋顶的木头：1 = 后坡还在、前坡只剩椽子；0 = 一根梁斜搭在墙上，几根椽子掉在屋里
  if (state === 1) {
    const run = d / 2 + 0.4, rise = 1.3, L = Math.hypot(run, rise), a = Math.atan2(rise, run);
    const slab = box(w + 0.1, 0.18, L, M.thatch);
    slab.position.set(0, h + rise / 2 + 0.09, -run / 2);
    slab.rotation.x = -a;
    g.add(slab);
    for (let x = -w / 2 + 0.3; x < w / 2; x += 0.6) { const r = box(0.1, 0.1, L, M.wood); r.position.set(x, h + rise / 2, run / 2); r.rotation.x = a; g.add(r); }
    g.add(block(-w / 2, h + rise, -0.12, w / 2, h + rise + 0.16, 0.12, M.wood)); // 脊檩
    for (let k = 0; k < 4; k++) { const zk = (d / 2) * (1 - (k + 1) / 5); for (const sx of [-1, 1]) g.add(block(sx > 0 ? w / 2 - T : -w / 2, h + (k * rise) / 4, -zk, sx > 0 ? w / 2 : -w / 2 + T, h + ((k + 1) * rise) / 4, zk, M.adobe)); } // 山尖
  } else {
    const beam = box(0.18, 0.18, d + 0.3, M.wood);
    beam.position.set(-lost * w * 0.15, h - 0.6, 0);
    beam.rotation.x = 0.35 * (rand() < 0.5 ? 1 : -1);
    beam.userData.tilted = true;
    g.add(beam);
    for (let i = 0; i < 3; i++) { const r = box(0.1, 0.1, 1.6 + rand(), M.wood); r.position.set((rand() - 0.5) * (w - 1.4), 0.36 + i * 0.1, (rand() - 0.5) * (d - 1.6)); r.rotation.y = rand() * 3; g.add(r); }
  }
  g.userData.thing = 'ruin';
  return g;
}

/**
 * 一处老宅：院墙（毛石 / 土坯，塌了好几段）、院门的门洞、破房子、院里的杂物。原点在院子中心。
 * 每处自己一个随机数种子：修房子时整处重搭（setPlotState），没修的地方和原来一模一样。
 */
function ruinPlot(M, spec) {
  const g = new THREE.Group();
  const { w, d } = PLOT, s = spec.state, rand = makeRng(1000 + HOUSES.indexOf(spec) * 97);
  const hs = ruinHouse(M, { state: s, seed: 300 + spec.u * 7 + spec.z });
  hs.position.set(0, 0, -d / 2 + 2.3);
  g.add(hs);
  // 院墙：三面 + 南墙（院门的门洞在中间偏东）；塌了的地方断开，墙头高低不一
  const wallH = s >= 2 ? 1.6 : 1.1;
  const run = (x0, z0, x1, z1, gapAt = null) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.0));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
      if (gapAt && Math.abs(tm - gapAt) < 0.16) continue; // 门洞
      const fallen = rand() < 0.3, low = 0.45 + rand() * 0.55; // 每段都掷一样多的骰子：修好以后别的东西不挪窝
      if (s < 2 && fallen) continue; // 塌了的一段
      const hh = s >= 2 ? wallH : wallH * low;
      g.add(wallSeg(M, x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1, { h: hh, mat: s >= 2 ? 'adobe' : 'rubble', t: 0.35, cap: s >= 2 }));
    }
  };
  run(-w / 2, -d / 2, w / 2, -d / 2);
  run(-w / 2, -d / 2, -w / 2, d / 2);
  run(w / 2, -d / 2, w / 2, d / 2);
  run(-w / 2, d / 2, w / 2, d / 2, 0.62);
  if (s < 2) { // 院里：荒草、碎瓦、倒了的水缸 / 碾盘
    rubbleHeap(M, g, -w / 2 + 1.4, d / 2 - 1.2, 0.9, rand, M.adobe);
    if (rand() < 0.5) { const v = prism(0.42, 0.3, 0.7, M.loess, 8); v.rotation.z = Math.PI / 2; v.position.set(w / 2 - 1.3, 0.42, d / 2 - 1.5); v.userData.tilted = true; g.add(v); } // 倒着的破缸
  } else {
    g.add(P.vat(M, w / 2 - 1.2, d / 2 - 1.4));
    g.add(P.firewood(M, -w / 2 + 1.5, d / 2 - 1.0, 1.6));
  }
  g.userData.plot = spec.id;
  return g;
}

/**
 * 河神庙：坎沿上一间小砖庙（红门、灰瓦），供着河神，门口一块"水则碑"刻着大水那年的水位；
 * 东边一间土坯小屋是柳婆婆和水生住的。原点在院子中心，正面朝南（朝河）。
 */
function riverTemple(M) {
  const g = new THREE.Group();
  const shrine = house(M, { w: 3.6, d: 3.0, h: 2.6, wall: 'brick', rise: 1.1, lit: false, front: [{ k: 'gateRed', x: 0, s: 0.8 }, { k: 'signBoard', x: 0, y: 2.05, s: 0.45 }] });
  shrine.object.position.set(-2.4, 0, -1.2);
  tag(shrine.object, 'riverTemple');
  g.add(shrine.object);
  const hut = house(M, { w: 4.2, d: 3.4, h: 2.6, wall: 'adobe', rise: 1.1, roofMat: 'thatch', chimney: true, front: [{ k: 'door', x: -0.8 }, { k: 'windowLit', x: 0.9, y: 1.0 }] });
  hut.object.position.set(2.6, 0, -1.4);
  g.add(hut.object);
  const stele = new THREE.Group(); // 水则碑：一块石碑，碑身上一道红漆横线
  stele.add(block(-0.45, 0, -0.18, 0.45, 0.25, 0.18, M.stone), block(-0.32, 0.25, -0.09, 0.32, 1.6, 0.09, M.stone), block(-0.33, 1.05, -0.1, 0.33, 1.11, 0.1, M.redCloth, { outline: false }));
  stele.position.set(-2.4, 0, 1.9);
  g.add(tag(stele, 'floodStele'));
  const burner = prism(0.2, 0.15, 0.28, M.iron, 6);
  burner.position.set(-2.4, 0.14, 0.9);
  g.add(burner);
  return { object: g, home: hut, burner: new THREE.Vector3(-2.4, 0.5, 0.9) };
}

/** 葛家石匠院：土坯房 + 院里码着的条石、打了一半的石磨盘、石碾滚子。 */
function masonYard(M) {
  const g = new THREE.Group();
  const hs = house(M, { w: 5, d: 3.6, h: 2.8, wall: 'loess', rise: 1.2, chimney: true });
  hs.object.position.set(-1.6, 0, -1.6);
  g.add(hs.object);
  const pile = new THREE.Group();
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) pile.add(block(-1.0 + i * 0.7 + row * 0.35, row * 0.35, -0.3, -0.4 + i * 0.7 + row * 0.35, row * 0.35 + 0.33, 0.3, M.stone));
  pile.position.set(2.6, 0, -0.6);
  g.add(tag(pile, 'stonePile'));
  for (const [x, z, a] of [[2.3, 1.6, 0], [3.4, 1.9, 0.5]]) { const s = prism(0.62, 0.62, 0.22, M.stone, 12); s.position.set(x, 0.11 + a * 0.3, z); s.rotation.x = a; s.userData.tilted = a > 0; g.add(tag(s, 'millstoneBlank')); }
  const roll = prism(0.32, 0.32, 1.0, M.stone, 8);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(-2.4, 0.32, 1.6);
  g.add(tag(roll, 'stonePile'));
  g.add(block(0.4, 0, 0.8, 1.2, 0.5, 1.4, M.wood)); // 垫着凿石头的木墩
  return { object: g, home: hs };
}

/** 白家石灰窑：一座毛石砌的圆窑（上小下大，顶上冒烟），旁边一间小屋、一堆青石、一堆烧好的白灰。 */
function limeKiln(M) {
  const g = new THREE.Group();
  const kiln = new THREE.Group();
  const body = prism(1.3, 1.8, 3.2, M.rubble, 10);
  body.position.y = 1.6;
  const rim = prism(1.35, 1.35, 0.3, M.stone, 10);
  rim.position.y = 3.3;
  kiln.add(body, rim, block(-0.45, 0, 1.45, 0.45, 1.0, 1.85, M.ink, { outline: false })); // 窑门（黑洞洞的）
  kiln.position.set(2.2, 0, -0.6);
  g.add(tag(kiln, 'limeKiln'));
  const hs = house(M, { w: 4, d: 3.2, h: 2.6, wall: 'adobe', roof: 'flat', chimney: false });
  hs.object.position.set(-2.2, 0, -1.6);
  g.add(hs.object);
  for (let i = 0; i < 5; i++) { const b = boxRock(M.stone, 0.5 + (i % 2) * 0.2); b.position.set(-0.4 + (i % 3) * 0.5, 0.2 + (i > 2 ? 0.3 : 0), 2.0 + (i % 2) * 0.3); g.add(b); } // 青石
  const lime = prism(0.3, 0.9, 0.55, M.plaster, 8); // 烧好的石灰，一堆白
  lime.position.set(3.4, 0.27, 2.2);
  g.add(tag(lime, 'limePile'));
  return { object: g, home: hs, chimney: new THREE.Vector3(2.2, 3.6, -0.6) };
}
const boxRock = (mat, s) => { const b = box(s, s * 0.7, s * 0.8, mat); b.rotation.y = s * 3; return b; };

/** 苗家鸭棚：矮土坯小屋 + 鸭棚 + 一圈芦苇栅栏，挨着水。 */
function duckYard(M) {
  const g = new THREE.Group();
  const hs = house(M, { w: 4.2, d: 3.2, h: 2.5, wall: 'adobe', rise: 1.0, roofMat: 'thatch', chimney: true });
  hs.object.position.set(-1.6, 0, -1.2);
  g.add(hs.object);
  g.add(P.duckHouse(M, 2.4, -1.0));
  g.add(P.fence(M, 0.8, 0.6, 3.8, 2.8, { h: 0.7, gap: [0.3, 0.6] }));
  return { object: g, home: hs };
}

/** 老戏台的台基：一块毛石砌的高台，台口两块柱础，上面的木头台子早没了；台前一片空地。 */
function stageBase(M) {
  const g = new THREE.Group();
  g.add(block(-3, 0, -2.2, 3, 1.1, 2.2, M.rubble), block(-3.1, 1.1, -2.3, 3.1, 1.25, 2.3, M.stone));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(sx * 2.6 - 0.25, 1.25, sz * 1.8 - 0.25, sx * 2.6 + 0.25, 1.45, sz * 1.8 + 0.25, M.stone)); // 柱础
  const post = block(2.35, 1.45, 1.55, 2.85, 2.6, 2.05, M.wood); // 只剩一根烧黑的柱子茬
  g.add(post);
  return tag(g, 'oldStage');
}

/** 冲歪的老石桥：两个桥墩斜在水里，一根独木搭在上面（走不过去，只是看着）。 */
function brokenBridge(M, x, z) {
  const g = new THREE.Group();
  for (const [dz, a] of [[-1.6, 0.12], [1.4, -0.18]]) { const p = block(-0.8, -1.6, -0.6, 0.8, 0.6, 0.6, M.rubble); p.position.z += dz; p.rotation.x = a; p.userData.tilted = true; g.add(p); }
  const log = prism(0.18, 0.18, 4.2, M.wood, 8);
  log.rotation.x = Math.PI / 2 + 0.05;
  log.position.set(0.2, 0.75, 0);
  log.userData.tilted = true;
  g.add(log);
  g.position.set(x, 0, z);
  return tag(g, 'oldBridge');
}

/** 漂木堆：河滩上码着捞上来的漂木（水生的营生）。 */
function driftPile(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const L = 1.6 + (i % 3) * 0.5, log = prism(0.13, 0.13, L, M.wood, 6);
    log.rotation.set(0, i * 0.5, Math.PI / 2);
    log.position.set((i % 3) * 0.3 - 0.3, 0.13 + Math.floor(i / 3) * 0.24, (i % 2) * 0.35 - 0.2);
    g.add(log);
  }
  return tag(g, 'driftwood');
}

/** 导航用的老宅轮廓：一整圈院墙（院门那儿留口）+ 房子的地盘。墙塌没塌、房子修没修，人都只走院门、不进屋（修好以后不用重算导航）。 */
function plotNavShape(spec) {
  const { w, d } = PLOT, out = [];
  const box3 = (x0, z0, x1, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0)); m.position.set((x0 + x1) / 2, 0.5, (z0 + z1) / 2); return m; };
  const t = 0.2, gx = -w / 2 + 0.62 * w;
  out.push(box3(-w / 2 - t, -d / 2 - t, w / 2 + t, -d / 2 + t), box3(-w / 2 - t, -d / 2, -w / 2 + t, d / 2 + t), box3(w / 2 - t, -d / 2, w / 2 + t, d / 2 + t));
  out.push(box3(-w / 2, d / 2 - t, gx - 0.65, d / 2 + t), box3(gx + 0.65, d / 2 - t, w / 2, d / 2 + t));
  out.push(box3(-2.8, -d / 2 + 2.3 - 2.2, 2.8, -d / 2 + 2.3 + 2.2)); // 房子
  return out;
}

// ---------------------------------------------------------------- 搭老村址

/**
 * M：村子的材质（共用）。返回 { object, terrain, nodes, things, placeAt, work, houses, blockNav, update }。
 */
export function buildEast(M) {
  addEastMaterials(M);
  const root = new THREE.Group();
  root.scale.setScalar(UNIT);
  const rand = makeRng(717);

  // 1. 路网节点的高度
  const nodes = {};
  for (const [name, [u, z]] of Object.entries(ROAD)) nodes[name] = { x: W(u), z, h: q(natural(W(u), z).h, 0.3) };
  nodes.west.h = Math.round(rawHeight(nodes.west.x, nodes.west.z) / 0.3) * 0.3; // 和村子那头的路口（layout.js 的 eastGate）一样算：接缝两边路面一样高
  for (const k of ['sW', 's1', 's2', 's3', 's4', 's5', 'sE']) nodes[k].h = PLAIN;
  for (const k of ['tWW', 'tW', 'tM', 'tE']) nodes[k].h = TOP;
  nodes.ford.h = PLAIN - 0.6;
  nodes.lW.h = nodes.lE.h = PLAIN - 0.6;

  const pads = [];
  const plotLevel = (p) => (p.z < bankZ(p.u) ? TOP : p.z > 14 ? PLAIN - 0.6 : PLAIN);
  for (const p of HOUSES) pads.push({ x: W(p.u), z: p.z, rot: 0, w: PLOT.w, d: PLOT.d, level: plotLevel(p) });
  for (const [k, h] of Object.entries(HOMES)) pads.push({ x: W(h.u), z: h.z, rot: 0, w: h.w, d: h.d, level: k === 'duckYard' ? PLAIN - 0.6 : TOP });
  pads.push({ x: W(PLAZA.u), z: PLAZA.z, rot: 0, w: 9, d: 9, level: PLAIN + 0.6 });
  nodes.plaza.h = PLAIN + 0.6;
  nodes.duck.h = PLAIN - 0.6;
  for (const k of ['bW', 'bE', 'bD']) nodes[k].h = 0.6;

  // 2. 地形
  const terrain = buildTerrain(M, { pads, nodes, edges: EDGES, bounds: EAST_BOUNDS, natural, water, farm: false, sideMat: sideMat(M) });
  root.add(terrain.object);

  // 3. 老宅、原住户、老戏台、老井、断桥、漂木
  const plots = {};
  for (const p of HOUSES) {
    const g = ruinPlot(M, p);
    g.position.set(W(p.u), plotLevel(p), p.z);
    root.add(g);
    plots[p.id] = g;
  }
  const homes = {};
  const put = (k, built) => { const h = HOMES[k]; built.object.position.set(W(h.u), k === 'duckYard' ? PLAIN - 0.6 : TOP, h.z); root.add(built.object); homes[k] = built; return built; };
  const temple = put('riverTemple', riverTemple(M));
  put('mason', masonYard(M));
  const kiln = put('limeKiln', limeKiln(M));
  put('duckYard', duckYard(M));
  const stage = stageBase(M);
  stage.position.set(W(PLAZA.u) - 1.5, PLAIN + 0.6, PLAZA.z - 0.5);
  root.add(stage);
  const well = P.well(M, W(WELL.u), WELL.z);
  well.position.y = PLAIN;
  root.add(well);
  const roller = P.roller(M, 0, 0); // 倒在旧河道边上的石碾（碾框早烂了）
  roller.position.set(W(-4), 0.6, 10.5);
  roller.rotation.set(0.25, 0.6, 0);
  roller.userData.tilted = true;
  root.add(roller);
  root.add(brokenBridge(M, W(-32), sz(-32)));
  const drift = driftPile(M);
  drift.position.set(W(-15), 0.6, sz(-15) - streamHalf(-15) - 1.6);
  root.add(drift);

  // 4. 树：歪脖子老柳（大水里没倒）、河滩上的柳树杨树、坎上的槐树、东北的杂木林；冲下来的大圆石
  const trunks = [];
  const plant = (kind, x, z, seed, scale) => {
    const m = new THREE.Mesh(voxelTree(kind, seed, scale), M.voxel);
    m.castShadow = m.receiveShadow = true;
    m.position.set(x, terrain.heightAt(x, z), z);
    m.userData.tree = true;
    root.add(m);
    trunks.push([x, z, 0.45]);
    return m;
  };
  const oldWillow = plant('willow', W(-11), sz(-11) - streamHalf(-11) - 1.4, 21, 1.45);
  oldWillow.rotation.z = 0.12; // 歪脖子
  oldWillow.userData.tilted = true;
  const willowBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6, 2.4), new THREE.MeshBasicMaterial({ visible: false })); // 点它看卡片
  willowBox.position.set(oldWillow.position.x, oldWillow.position.y + 3, oldWillow.position.z);
  willowBox.userData.dynamic = true;
  root.add(tag(willowBox, 'oldWillow'));

  const pathNear = (x, z, r) => [0, 1.57, 3.14, 4.71].some((a) => terrain.typeAt(x + Math.cos(a) * r, z + Math.sin(a) * r) === 'path') || terrain.typeAt(x, z) === 'path';
  const wet = (x, z) => [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].some(([dx, dz]) => terrain.typeAt(x + dx, z + dz) === 'stream');
  const onPad = (x, z, m = 1.5) => pads.some((p) => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m);
  const groves = { willow: [], poplar: [], locust: [], oak: [], pine: [], bush: [], jujube: [] };
  const pick = (w) => { let r = rand(); for (const [k, p] of w) if ((r -= p) < 0) return k; return w[0][0]; };
  for (let x = EAST_BOUNDS.x0 + 1; x < EAST_BOUNDS.x1 - 1; x += 2.3) for (let z = EAST_BOUNDS.z0 + 1; z < EAST_BOUNDS.z1 - 1; z += 2.3) {
    const px = x + (rand() - 0.5) * 1.6, pz = z + (rand() - 0.5) * 1.6, u = px - OX, type = terrain.typeAt(px, pz);
    if (pathNear(px, pz, 1.4) || wet(px, pz) || onPad(px, pz) || Math.hypot(px - oldWillow.position.x, pz - oldWillow.position.z) < 3) continue;
    let kind = null;
    if (type === 'forest' && rand() < 0.75) kind = pick([['oak', 0.35], ['pine', 0.3], ['locust', 0.2], ['bush', 0.15]]);
    else if (type === 'grass' && pz < bankZ(u) && rand() < 0.12) kind = pick([['locust', 0.4], ['jujube', 0.3], ['bush', 0.3]]); // 坎上、山坡
    else if (type === 'grass' && pz > bankZ(u) && pz < sz(u) && rand() < 0.05) kind = pick([['bush', 0.6], ['jujube', 0.4]]); // 荒了的平地：酸枣丛
    else if (type === 'gravel' && pz > sz(u) - 8 && rand() < 0.1) kind = rand() < 0.6 ? 'willow' : 'poplar'; // 河滩
    else if (type === 'grass' && pz > sz(u) && rand() < 0.08) kind = rand() < 0.5 ? 'willow' : 'poplar'; // 溪南
    if (!kind) continue;
    groves[kind].push([px, pz, 0.8 + rand() * 0.35]);
  }
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  const flora = new THREE.Group();
  for (const [kind, list] of Object.entries(groves)) {
    for (let v = 0; v < 2; v++) {
      const mine = list.filter((_, i) => i % 2 === v);
      if (!mine.length) continue;
      const mesh = new THREE.InstancedMesh(voxelTree(kind, 800 + v * 17 + kind.length, 1), M.voxel, mine.length);
      mine.forEach(([x, z, s], i) => { mesh.setMatrixAt(i, m4.compose(p3.set(x, terrain.heightAt(x, z), z), qt, sc.set(s, s, s))); trunks.push([x, z, kind === 'bush' ? 0.3 : 0.4]); });
      mesh.castShadow = mesh.receiveShadow = true;
      flora.add(mesh);
    }
  }
  const rocks = []; // 大水冲下来的圆石：旧河道里、河滩上，平地上也散着几块
  for (let i = 0; i < 600 && rocks.length < 46; i++) {
    const x = EAST_BOUNDS.x0 + 4 + rand() * 84, z = -14 + rand() * 50, t = terrain.typeAt(x, z);
    if (t === 'stream' || t === 'path' || t === 'pad' || pathNear(x, z, 1.4) || onPad(x, z, 0.8)) continue;
    if (t !== 'gravel' && rand() > 0.15) continue;
    rocks.push([x, z, 0.7 + rand() * 0.9]);
  }
  for (let v = 0; v < 3; v++) {
    const mine = rocks.filter((_, i) => i % 3 === v);
    if (!mine.length) continue;
    const mesh = new THREE.InstancedMesh(boulderGeo(31 + v), M.voxel, mine.length);
    mine.forEach(([x, z, s], i) => { mesh.setMatrixAt(i, m4.compose(p3.set(x, terrain.heightAt(x, z) - 0.15, z), qt, sc.set(s, s * 0.75, s))); trunks.push([x, z, 0.5 * s]); });
    mesh.castShadow = mesh.receiveShadow = true;
    flora.add(mesh);
  }
  flora.userData.count = { ...Object.fromEntries(Object.entries(groves).map(([k, l]) => [k, l.length])), rocks: rocks.length };

  // 5. 自检、导航障碍、物件包围盒；老宅一处一处单独合批（以后修房子要换掉一处），其余整体合批
  root.userData.coplanar = fixCoplanar(root, (o) => o === terrain.object || o.userData.tree || o.isSprite);
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const blockers = [];
  for (const p of HOUSES) for (const m of plotNavShape(p)) { // 老宅按整圈院墙 + 房子地盘挡路
    m.position.add(plots[p.id].position);
    m.updateMatrixWorld(true);
    blockers.push([m, m.matrixWorld.clone()]);
  }
  const collect = (o) => {
    if (o === terrain.object || o === flora || o.userData.dynamic || o.userData.tree || o.userData.walkable || o.userData.plot) return;
    if (o.isMesh && !(o.geometry instanceof THREE.PlaneGeometry) && !o.geometry.type.includes('Circle')) blockers.push([o, new THREE.Matrix4().multiplyMatrices(toRoot, o.matrixWorld)]);
    for (const k of o.children) collect(k);
  };
  for (const k of root.children) collect(k);
  root.userData.floating = findFloating(root, terrain);
  const things = collectThings(root, {});
  const plotCard = (p) => p.owner
    ? { name: `${p.ownerName}家（${p.who}老宅）`, tags: [['塌了', '先苫了半边顶', '修好了'][p.state], `${p.ownerName}住着`], about: `${p.story}${p.state < 2 ? `如今${p.ownerName}住了进来，正攒石灰、条石和柴火，等着请葛石头来帮着修。` : `${p.ownerName}请葛石头帮着修好了：补了墙、上了新草顶，烟囱又冒烟了。`}`, plot: p.id }
    : { name: `${p.who}老宅`, tags: [['塌了', '能遮雨', '修好了'][p.state], '空着'], about: `${p.story}（空着：「创建居民」时可以选这儿住）`, plot: p.id };
  for (const t of things) { // 老宅的卡片：谁家的、怎么塌的、现在谁住着
    const p = HOUSES.find((h) => h.id === (t.obj.userData.plot ?? t.obj.parent?.userData.plot));
    if (p && (t.thing === 'ruin' || t.thing === 'house')) { t.thing = 'ruin'; t.spec = plotCard(p); }
  }
  for (const g of Object.values(plots)) { bakeStatic(g); g.userData.dynamic = true; }
  root.userData.bake = bakeStatic(root);
  root.add(flora);
  root.userData.flora = flora.userData.count;

  // 6. 会动的：庙前香炉、石灰窑的烟、鸭棚和各家的炊烟、河滩的萤火虫、雨
  const sprites = new Sprites(root, M);
  const smoke = { size: 0.9, rise: 2.6, drift: 0.8, life: 0.3 };
  const kilnSmoke = new Smoke(root, sprites, kiln.chimney.clone().add(kiln.object.position), 91, { ...smoke, size: 1.2, colors: [R.white[2], R.smoke[2]] });
  const incense = new Smoke(root, sprites, temple.burner.clone().add(temple.object.position), 93, { size: 0.35, rise: 1.6, drift: 0.6, life: 0.25 });
  const chimneys = Object.values(homes).filter((h) => h.home?.chimney).map((h, i) => new Smoke(root, sprites, h.home.chimney.clone().add(h.home.object.position).add(h.object.position), 95 + i, smoke));
  const fireflies = new Fireflies(root, M.fireflySprite, [[W(-20), W(20), 24, 32, 0.6], [W(-36), W(-24), 20, 30, 1.2]], 30, 11);
  const rain = new Rain(root, EAST_BOUNDS, terrain.walkAt, 2200, 17);
  const lights = [];
  const pointLight = (x, y, z, base) => { const l = new THREE.PointLight(GLOW.lamp, 0, 0.07, 1.4); l.position.set(x, y, z); root.add(l); lights.push({ l, base }); };
  pointLight(W(HOMES.riverTemple.u) + 2.6, TOP + 2.2, HOMES.riverTemple.z + 1.2, 0.02);
  pointLight(W(HOMES.duckYard.u) - 1.6, PLAIN + 1.6, HOMES.duckYard.z + 1.4, 0.02);
  const ownWindow = M.windowLit.clone(); // 老村址自己的窗户：天黑才亮
  ownWindow.onBeforeCompile = M.windowLit.onBeforeCompile;
  ownWindow.customProgramCacheKey = M.windowLit.customProgramCacheKey;
  root.traverse((o) => { if (o.material === M.windowLit) o.material = ownWindow; });

  // 点到地上（没碰到物件）：这一片叫什么
  const PLACE = {
    oldbed: { name: '旧河道', tags: ['卵石'], about: '六十多年前那场山洪冲出来的河道，从东头山口一直冲到西边，正好从老村子当中穿过去。水早退了，只剩一沟白花花的卵石，夏天下大雨还会走一回水。' },
    beach: { name: '河滩', tags: ['卵石', '柳树'], about: '小溪北岸的卵石滩。水生常在这儿捞上游冲下来的漂木，晒干了当柴卖；苗家的鸭子一早就下到这里的浅水。' },
    island: { name: '河心洲', tags: ['细沙'], about: '小溪在这一段分成两股，中间夹着一条沙洲。水浅的时候卷起裤腿就能走过去，孩子们爱在上面捡好看的石头。' },
    bank: { name: '黄土坎', tags: ['大水的痕迹'], about: '大水冲出来的一道土坎，坎上是老辈人说的"高地"——那年水就漫到坎根底下。肯留下来的几户都住在坎上。' },
    plain: { name: '老石峪', tags: ['老村址'], about: '石峪村原来就在这片河湾里。大水以后大半人家搬去了下游，留下一街两排塌了的老宅。地是好地，就是没人敢再住在河边。' },
    hill: { name: '东山', tags: ['槐树', '杂木林'], about: '老村址背后的山。山坡上有几棵老槐树，再往上是一片杂木林。' },
    south: { name: '溪南草滩', tags: [], about: '小溪南边的一溜草滩，和村口那边连着。' },
  };
  const placeAt = (x, z) => {
    const u = x - OX, t = terrain.typeAt(x, z);
    if (t === 'sand') return PLACE.island;
    if (t === 'stream' || z > sz(u) + streamHalf(u)) return z > sz(u) ? PLACE.south : PLACE.beach;
    if (t === 'gravel') return toLine(u, z, OLDBED) < OLDBED_HALF + 0.5 ? PLACE.oldbed : PLACE.beach;
    if (Math.abs(z - bankZ(u)) < 1.5) return PLACE.bank;
    return z < bankZ(u) ? PLACE.hill : PLACE.plain;
  };

  // 门口（人站这儿进屋）：原住户的家、老宅
  const doorOf = (built, k) => { const v = built.home.door.clone(); built.home.object.localToWorld(v); return root.worldToLocal(v); };
  root.updateMatrixWorld(true);
  // 原住户的院子（给村民系统当"家"用，village.js 包成和村里院落一样的接口）：本地坐标都相对院子中心
  const SPOTS = {
    riverTemple: { yard: [0.4, 1.6], work: [-2.4, 0.4], stele: [-1.3, 2.6], sweepA: [-0.6, 1.4], sweepB: [1.8, 2.4] },
    mason: { yard: [0, 2.0], work: [1.3, 1.9], pile: [1.6, 0.6], sweepA: [-1.0, 2.2], sweepB: [0.6, 2.6] },
    limeKiln: { yard: [0, 2.4], work: [2.2, 2.4], stone: [0.2, 1.4], sweepA: [-1.4, 1.6], sweepB: [0.8, 2.8] },
    duckYard: { yard: [-1.5, 2.1], pen: [2.3, 3.4], sweepA: [-2.6, 2.0], sweepB: [-0.6, 2.4] },
  };
  const FACE = { mason: [2.3, 1.6], limeKiln: [2.2, 0.6], riverTemple: [-2.4, -0.6] };
  const homeSpecs = Object.fromEntries(Object.entries(homes).map(([k, b]) => {
    const h = HOMES[k], hp = b.home.object.position, door = [hp.x + b.home.door.x, hp.z + b.home.door.z];
    return [k, { id: k, x: W(h.u), z: h.z, w: h.w, d: h.d, level: k === 'duckYard' ? PLAIN - 0.6 : TOP, gate: [0, h.d / 2 + 0.8], doors: { house: door }, spots: SPOTS[k], face: FACE[k] }];
  }));
  const work = {
    doors: Object.fromEntries(Object.entries(homes).map(([k, b]) => [k, (() => { const v = doorOf(b, k); return [v.x, v.z]; })()])),
    plots: Object.fromEntries(HOUSES.map((p) => [p.id, { gate: [W(p.u) + PLOT.w * 0.12, p.z + PLOT.d / 2 + 0.8], door: [W(p.u) - 1.04, p.z - PLOT.d / 2 + 2.3 + 2.9] }])),
    beach: Array.from({ length: 10 }, (_, i) => { const u = -20 + i * 4; return [W(u), sz(u) - streamHalf(u) - 1.2]; }),
    temple: { at: [W(HOMES.riverTemple.u) - 2.4, HOMES.riverTemple.z + 1.5], face: [W(HOMES.riverTemple.u) - 2.4, HOMES.riverTemple.z - 1.2] },
    stele: [W(HOMES.riverTemple.u) - 1.4, HOMES.riverTemple.z + 2.6],
    mason: [W(HOMES.mason.u) + 1.0, HOMES.mason.z + 1.4],
    kiln: [W(HOMES.limeKiln.u) + 2.2, HOMES.limeKiln.z + 1.8],
  };

  let last = 0, litAt = -9; // 最近一次上香的钟点

  /** 老宅换个样子（住进来先苫半边顶 = 1，修好了 = 2）：整处重搭、单独合批，卡片跟着改。 */
  function setPlotState(id, state) {
    const spec = HOUSES.find((h) => h.id === id), old = plots[id];
    if (!spec || !old || spec.state === state) return;
    spec.state = state;
    const g = ruinPlot(M, spec);
    g.position.copy(old.position);
    g.traverse((o) => { if (o.material === M.windowLit) o.material = ownWindow; });
    root.remove(old);
    old.traverse((o) => o.geometry?.dispose());
    root.add(g);
    bakeStatic(g);
    g.userData.dynamic = true;
    plots[id] = g;
    for (const t of things) if (t.spec?.plot === id) { t.spec = plotCard(spec); t.box.max.y = Math.max(t.box.max.y, g.position.y + 5); }
  }
  return {
    lightIncense(hour) { litAt = hour; },
    setPlotState,
    /** 新来的人住进一处老宅：记下是谁，塌了的先苫上半边顶。 */
    claim(id, p) { const h = HOUSES.find((x) => x.id === id); if (!h) return null; h.owner = p.id; h.ownerName = p.nick || p.name; for (const t of things) if (t.spec?.plot === id) t.spec = plotCard(h); setPlotState(id, Math.max(h.state, p.houseState ?? 1)); return h; },
    plotState: (id) => HOUSES.find((x) => x.id === id)?.state,
    object: root,
    terrain,
    nodes,
    things,
    placeAt,
    /** 这个位置叫什么（卡片上"在哪儿"）：原住户家、老宅、否则看这一片。 */
    whereAt(x, z) {
      const u = x - OX;
      for (const [k, h] of Object.entries(HOMES)) if (Math.abs(u - h.u) < h.w / 2 + 0.5 && Math.abs(z - h.z) < h.d / 2 + 0.5) return HOME_NAMES[k];
      const p = HOUSES.find((h) => Math.abs(u - h.u) < PLOT.w / 2 + 0.3 && Math.abs(z - h.z) < PLOT.d / 2 + 0.3);
      if (p) return p.owner ? `${p.ownerName ?? ''}家（${p.who}老宅）` : `${p.who}老宅`;
      return placeAt(x, z).name;
    },
    work,
    edges: EDGES,
    houses: HOUSES,
    plots,
    homes: homeSpecs,
    blockNav(nav) {
      for (const [m, rel] of blockers) nav.blockMesh(m, rel, terrain.walkAt);
      for (const [x, z, r] of trunks) nav.blockDisc(x, z, r);
    },
    update(t, { light, weather, viewer, hour = 12 }) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      const n = light.night;
      const cooking = (hour > 5.5 && hour < 7) || (hour > 11 && hour < 12.5) || (hour > 17.5 && hour < 19);
      for (const c of chimneys) c.update(dt, cooking && weather !== 'rain');
      kilnSmoke.update(dt, !is('winter'));
      incense.update(dt, hour >= litAt && hour < litAt + 1.2);
      fireflies.update(t);
      for (const ff of fireflies.flies) ff.visible &&= n > 0.4 && weather !== 'rain' && is('summer');
      rain.update(dt, weather === 'rain');
      const k = Math.min(1, n * 1.1) * (hour > 21.5 || hour < 4.6 ? 0 : 1);
      ownWindow.color.setRGB(0.42 + 0.58 * k, 0.36 + 0.64 * k, 0.34 + 0.66 * k);
      for (const { l, base } of lights) l.intensity = base * n * (hour > 21.5 || hour < 4.6 ? 0 : 1);
      sprites.face(viewer);
    },
  };
}
