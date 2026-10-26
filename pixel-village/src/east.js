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
import { shrine, stoneTablet, floraGeometries } from './roadside.js';

const P = tagged(PROPS);

/*
 * 老村址（老石峪）：出了村东口，顺着小溪往上游走，绕过山嘴，河谷一下子宽了——石峪村原来就在这儿。
 * 六十多年前一个夏天，后山连下七天雨，山洪从东头的山口冲下来，从村子当中冲出一条新河道，一直冲进坡下的水塘，
 * 塌了大半个村子。水退以后大半人家搬到下游现在的地方重新起屋，老村址只剩几户不肯走的守着。
 * 王家祠堂里的牌位上写的都是"老石峪"；村里各家在这儿都还有一处塌了的老宅，现在空着，等新来的人认下来、修起来住。
 *
 * 和村子一样是一面北高南低的坡：一级级黄土坎子（梯田）。老宅不是一排排的——大小、料、样子都不一样（土坯大院、石头房、
 * 木板房、篱笆小院、单独一间、靠崖窑洞），散在坡上不同的高度、各转一点角度，院子贴着坡（比门口的路高的、低的都有，门前几级台阶）；
 * 塌了的院里荒草齐腰深。老街、上坡的小路都是弯的，路口立着石敢当，进来的地方一座老土地庙。
 *
 *                  北（高）
 *   ┌────────────────────────────────────────────────┐
 *   │ ▓青石崖▓▓ │ 高大的老林子 ── 进山口（石牌坊）── 林子 ── 林子一直铺到东北角 │
 *   │ ▓大煤窑口▓  石匠院  杨家  祠堂遗址 山货棚  残墙 李家  ▒▒▒林子▒▒▒ │
 *   │  石灰窑         培育田                    蜂场  ▒▒▒▒▒▒▒ │
 *   │ ～～～ 上坡的小路（弯的）～～～～～～～～～～～～～～～～  马家窑洞 │
 *   │  孙家铺面   刘家木板房  张家铁匠  周家大院                │ ← 东头：上游的山口
 *   │ ～～～～～ 老街（弯的）～～～～～～～～～～～～～～～～ 撂荒地 ░旧河道  │
 *   │ 吴家  王家大院  赵家磨坊  老戏台  陈家      ░░             │
 *   │  河神庙   郑家             ～～ 水塘（湖）～～ ░░  放牛草场   │
 *   │      鸭棚                        歪脖柳                  │
 *   │  ～～～～～～～～～～ 小溪（往西流到村子） ～～～～～～～～～～～   │
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
const inRect = (u, z, r) => u >= r.u0 && u <= r.u1 && z >= r.z0 && z <= r.z1;

/** 点到线段：距离和投影参数。 */
function seg(pu, pz, a, b) {
  const du = b[0] - a[0], dz = b[1] - a[1], L2 = du * du + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((pu - a[0]) * du + (pz - a[1]) * dz) / L2));
  return { d: Math.hypot(pu - a[0] - t * du, pz - a[1] - t * dz), t };
}
const toLine = (u, z, line) => Math.min(...line.slice(1).map((b, i) => seg(u, z, line[i], b).d));

/** 坡下的水塘（湖）：一道窄沟通到南边的小溪。lakeR：到湖心的"椭圆半径"（< 1 在水里）。 */
const LAKE = { u: 6, z: 25, ru: 13, rz: 5 };
const lakeR = (u, z) => Math.hypot((u - LAKE.u) / LAKE.ru, (z - LAKE.z) / LAKE.rz);
const inChannel = (u, z) => Math.abs(u - 12) < 1.5 && z > LAKE.z && z < sz(u);
/** 旧河道：山洪从东头山口冲进来，斜穿过坡，冲进水塘。干了，一沟白花花的卵石。 */
const OLDBED = [[46, 2], [36, 6], [26, 12], [16, 19], [12, 22]];
const OLDBED_HALF = 2.4;
/** 西北角的青石崖（煤矿就开在崖脚）：崖沿往南凸出一点。 */
const cliffZ = (u) => (u > -27 ? -99 : -21.2 + (u < -40 ? 1.2 * Math.sin(u * 0.5) : 0));
const streamHalf = (u) => STREAM_HALF + 0.8 * smooth(-44, -30, u); // 河湾里水面宽一些（接缝处和村子一样宽）

/**
 * 一处老宅（宅基地）：u, z 是宅基地中心，rot 转角（度；正面 / 院门朝 +z 转过 rot，有的朝北对着老街）；w × d 宅基地多大；
 * kind 是什么样的人家（不一样大、不一样的料，散在坡上不同的高度）：
 *   court 土坯 / 毛石院墙围着的院子（大户带厢房）  stone 石头房，矮石墙  wood 木板房  fence 篱笆小院  open 单独一间，没院墙  cave 靠崖窑洞
 * house：正房 [宽, 深, 墙高]；mat：墙的料；tree：院里长出来的树；extra：磨盘、铁匠炉、羊圈；
 * who：原来是谁家的（现在村里哪户的祖宅）；state：0 塌了 / 1 能遮雨 / 2 修好了。
 */
export const HOUSES = [
  { id: 'old1', u: -16, z: 9, rot: 176, w: 11, d: 7.5, kind: 'court', mat: 'adobe', house: [6.4, 4.2, 3.0], wing: true, tree: 'jujube', who: '王家', state: 0, story: '王村长的爷爷那辈住在这儿，是老石峪数得着的大院，正房带厢房。大水冲塌了东山墙，屋顶整个落了下来，只剩后墙还立着；院里一棵枣树倒长得正旺。' },
  { id: 'old2', u: -22, z: -4, rot: -7, w: 6.5, d: 4.5, kind: 'open', mat: 'wood', house: [5.6, 3.6, 3.1], who: '孙家', state: 1, story: '孙掌柜家的老铺面：临着老街一排木板门面，没有院子。门板早被人拆去烧了火，屋顶塌了半边，柜台还在。' },
  { id: 'old3', u: -5.5, z: 5.6, rot: 168, w: 7, d: 5.5, kind: 'stone', house: [4.6, 3.4, 2.6], extra: 'mill', who: '赵家', state: 0, story: '赵家的老磨坊，青石垒的。水从门里冲进来，把石磨盘冲到了门外，墙根还留着一道黄泥印子。' },
  { id: 'old4', u: 13, z: 7, rot: 200, w: 9, d: 7.5, kind: 'court', mat: 'rubble', house: [5.2, 4.0, 2.8], tree: 'persimmon', who: '陈家', state: 0, story: '陈老汉出生在这院里。他说大水那天他才八九岁，是被他爹扛在肩上从齐腰深的水里背出去的。院里那棵老柿子树还年年结果，没人摘。' },
  { id: 'old5', u: -10, z: -17.5, rot: 12, w: 6, d: 5, kind: 'fence', house: [3.8, 3.0, 2.4], who: '杨家', state: 1, story: '杨家给唐东家当长工时住的小院，一圈荆条篱笆。屋子小，墙倒没塌，补补屋顶就能住。' },
  { id: 'old6', u: -36, z: 9.5, rot: 18, w: 9, d: 6.5, kind: 'stone', house: [5.4, 3.8, 2.8], tree: 'locust', who: '吴家', state: 0, story: '吴家老宅，石头垒的。西边半个院子叫水冲没了，剩下一间正房歪着，墙缝里钻出一棵槐树。' },
  { id: 'old7', u: 0, z: -5.2, rot: -12, w: 7, d: 5.5, kind: 'wood', house: [5.4, 3.8, 3.0], who: '刘家', state: 0, story: '刘木匠自己盖的木板房。木匠家的房子梁最粗，到今天几根柱子、梁还架着，板壁掉了一大半。' },
  { id: 'old8', u: 10, z: -6.2, rot: 16, w: 5.5, d: 4.5, kind: 'open', mat: 'rubble', house: [4.2, 3.2, 2.6], extra: 'forge', who: '张家', state: 0, story: '张家头一代铁匠在这儿打铁：一间石头屋，门口就是铁匠炉。炉子塌了，地上埋着烧黑的炉渣。' },
  { id: 'old9', u: 21, z: -5.8, rot: -6, w: 10, d: 7.5, kind: 'court', mat: 'adobe', house: [5.8, 4.2, 3.0], wing: true, who: '周家', state: 1, story: '周家药铺原先开在这儿，前店后院。屋里的药柜早没了，墙上还看得出一格格药斗子的印子。' },
  { id: 'old10', u: 39.5, z: -8, rot: -6, w: 7.5, d: 6, kind: 'cave', extra: 'pen', who: '马家', state: 0, story: '马家放羊时住的靠崖窑，挖在东头山根的黄土崖里，冬暖夏凉。一孔窑脸塌了，门前的石头羊圈还在。' },
  { id: 'old11', u: -9, z: 16, rot: 12, w: 5, d: 4.5, kind: 'open', mat: 'adobe', house: [3.8, 3.0, 2.4], who: '郑家', state: 0, story: '剃头匠老郑家的老屋，就一间，在老戏台边上、水塘坡上。他小时候趴在这屋顶上看戏。' },
  { id: 'old12', u: 23, z: -17.5, rot: 5, w: 7.5, d: 5.5, kind: 'stone', house: [5.0, 3.6, 2.8], tree: 'persimmon', who: '李家', state: 1, story: '据说是早年教书先生住的石头房，在坡最高处、林子边上。大水没淹到，是年久没人住才破的。' },
];
/** 宅基地里各样东西的位置（本地坐标，原点在宅基地中心，+z 朝院门）：正房、院门、房门、院里站人的地方。 */
function plotLayout(p) {
  const { w, d } = p, [hw, hd] = p.house ?? [w - 1.5, 2.6];
  const hz = p.kind === 'cave' ? -d / 2 + 0.7 : -d / 2 + hd / 2 + (p.kind === 'open' ? 0.35 : 0.5), hx = p.kind === 'court' && p.wing ? -w * 0.12 : 0;
  const gx = p.kind === 'cave' ? -0.6 : Math.round(w * 0.14 * 10) / 10;
  const front = p.kind === 'cave' ? -d / 2 + 1.5 : hz + hd / 2; // 正房前脸（窑洞是窑脸）
  let y0 = front + 0.6, y1 = d / 2 - 0.5;
  if (y1 - y0 < 1) { y0 = d / 2 + 0.6; y1 = d / 2 + 1.4; } // 没院子的：门前站人
  const mid = (y0 + y1) / 2, xr = p.extra === 'pen' ? w / 2 - 3.6 : w / 2 - 0.8; // 窑前东半边是羊圈
  return {
    hx, hz, hw, hd, gx, front,
    door: p.kind === 'cave' ? [-1.2, front + 0.6] : [hx - hw / 5, front + 0.6],
    gate: [gx, d / 2 + 0.8],
    spots: { yard: [gx * 0.4, mid], sweepA: [-w / 4, mid], sweepB: [Math.min(w / 4, xr - 0.3), mid], work: [Math.min(0.5, xr - 0.6), mid] },
    area: [-w / 2 + 0.8, y0, xr, y1],
  };
}

/** 原住户：u, z 是院子中心。 */
const HOMES = {
  riverTemple: { u: -23, z: 17, w: 10, d: 7 }, // 河神庙 + 柳婆婆、水生住的小屋：坡上看着水塘
  mason: { u: -21, z: -18, w: 9, d: 7 }, // 葛家石匠院：挨着青石崖
  limeKiln: { u: -36, z: -3, w: 9, d: 7 }, // 白家石灰窑：西头，离青石崖近（烧石灰的青石就从崖上撬）
  duckYard: { u: -14, z: 28, w: 8, d: 6 }, // 苗家鸭棚：水塘、小溪边上
};
const HOME_NAMES = { riverTemple: '河神庙', mason: '葛家石匠院', limeKiln: '白家石灰窑', duckYard: '苗家鸭棚' };
/** 各行当的地方：老戏台台基和老井、煤矿洞口、培育田、山货收购棚、进山口、蜂场、放牛草场。 */
const PLAZA = { u: 0, z: 13, w: 10, d: 6 };
const MINE = { u: -35, z: -16.6, w: 13, d: 9 }; // 煤窑口前的大场子（后沿贴着青石崖）
const TRIAL = { u0: -5, u1: 5, z0: -21, z1: -15 };
const SHED = { u: 14, z: -24, w: 8, d: 5 };
const MGATE = { u: 12, z: -31, w: 6, d: 3 };
const APIARY = { u: 32, z: -14.8, w: 7, d: 5 }; // 林子边向阳的一块（蜂采林子里的槐花、荆条花）
const PASTURE = { u0: 28, u1: 43, z0: 14, z1: 27 };
const ANCESTRAL = { u: -3, z: -24.6, w: 8, d: 4 }; // 老祠堂的遗址：只剩台基和柱础
const WALLRUIN = { u: 16.5, z: -17, w: 4, d: 3 }; // 一截没人认的残墙
const FALLOW = { u0: 23, u1: 35, z0: 3, z1: 11 }; // 一片撂荒的梯田：麦茬地里长满了草
/** 这条线以北是高大的老林子：西边从进山口一带起，往东越来越往南压，东北角整个是林子。 */
const forestZ = (u) => (u <= -27 ? -99 : -27 + 14 * smooth(16, 42, u) + 1.5 * Math.sin(u * 0.45));

// ---------------------------------------------------------------- 地面

/** 坡：和村子一样北高南低，一级级黄土坎子；东头山口两边的山挤过来。 */
function slope(u, z) {
  const north = Math.max(0, 27 - z);
  const bump = 0.7 * Math.sin(u * 0.17 + z * 0.11) + 0.5 * Math.sin(u * 0.07 - z * 0.19 + 1.3);
  const gorge = smooth(36, 45, u) * smooth(2, -6, z) * 5;
  return 0.6 + north * 0.27 + (north / 66) ** 2 * 3 + bump + gorge;
}
const terrace = (u, z) => Math.max(0.6, Math.floor(slope(u, z) / 1.2) * 1.2);

/** 老村址自己的地面（还没和村子的山梁接上）：{ h, type, crop }。 */
function ground(u, z) {
  const x = W(u), s = sz(u), half = streamHalf(u);
  if (z > s + half) return { h: Math.max(0, Math.floor((0.5 + Math.min(1.0, (z - s - half) * 0.18) + 0.25 * Math.sin(x * 0.3)) / 1.2) * 1.2), type: 'grass' }; // 溪南的河滩，和村子一样
  if (z > s - half - 3) return { h: 0.6, type: 'gravel' }; // 北岸的卵石滩
  if (lakeR(u, z) < 1.35) return { h: 0.6, type: 'sand' }; // 水塘边的沙滩
  if (inRect(u, z, PASTURE)) return { h: terrace((PASTURE.u0 + PASTURE.u1) / 2, (PASTURE.z0 + PASTURE.z1) / 2), type: 'grass' }; // 放牛的草场：一大块平的
  if (z < cliffZ(u)) return { h: q(terrace(u, z) + 6 + 1.2 * Math.sin(u * 0.3) + (cliffZ(u) - z) * 0.3, 1.2), type: 'stone' }; // 青石崖：比崖脚高出七八米
  if (inRect(u, z, TRIAL)) { const strip = Math.floor((u - TRIAL.u0) / 2); return { h: terrace(0, -18), type: 'field', crop: [1, 2, 3, 0, 1][Math.min(4, strip)] }; } // 培育田：一畦一样庄稼，比着种
  const t = terrace(u, z);
  if (toLine(u, z, OLDBED) < OLDBED_HALF) return { h: Math.max(0.6, t - 1.2), type: 'gravel' }; // 旧河道：比两边低一级
  if (inRect(u, z, FALLOW) && toLine(u, z, OLDBED) > OLDBED_HALF + 1.5) return { h: t, type: 'field', crop: 0 }; // 撂荒地：多年的麦茬
  const forest = z < forestZ(u) && !(Math.abs(u - MGATE.u) < 2.2 && z > -36); // 北边的林子（进山口那条路留出来）
  return { h: t, type: forest ? 'forest' : 'grass' };
}

/** 西边和村子的山梁接上：高度渐变到村子地形（交界处完全一样）；北边村子那头是高山梁，绕出一道山嘴慢慢落下来。 */
function natural(x, z) {
  const u = x - OX, g = ground(u, z), w = 1 - smooth(-45, -37 + 7 * (1 - smooth(18, 24, z)), u);
  if (w <= 0) return g;
  const v = Math.max(0, Math.floor(rawHeight(x, z) / 1.2) * 1.2);
  return { h: q(g.h + (v - g.h) * w, 0.6), type: w > 0.5 && !['gravel', 'stone'].includes(g.type) ? 'grass' : g.type, crop: g.crop };
}

function water(x, z) {
  const u = x - OX, s = sz(u);
  if (Math.abs(z - s) < streamHalf(u) || lakeR(u, z) < 1 || inChannel(u, z)) return WATER_Y;
  return null;
}

/** 落差侧面：坡上的坎子是黄土坎（不是砌的）；青石崖是一层层夹着煤线的青石。 */
function sideMat(M) {
  return (type, drop, x, z) => {
    if (type === 'stone') return M.coalRock;
    if (type === 'path' || type === 'pad') return null;
    if (drop >= 0.6) return M.bankWall;
    return null;
  };
}

// ---------------------------------------------------------------- 路网

const ROAD = {
  west: [-44.7, 27], g1: [-36, 24], tmp: [-23, 22], lw: [-12, 22], pS: [0, 17.5], lkN: [10, 19], ford: [19, 14], pastG: [27, 21], // 从村东口过来：顺着溪边绕过山嘴，沿水塘北岸往东
  bD: [-20, 33], duckG: [-14, 32], // 下到溪边鸭棚
  c1: [-29, 12], pN: [0, 8.5], // 上坡去老街
  st0: [-37, 3.2], st1: [-27, 1], st1b: [-19, 3.5], st2: [-10, 0], stM: [1, 2], st3: [11, -1.5], st4: [21, 1.5], st5: [30, 0.8], st6: [37, -1.2], // 老街：顺着坡弯弯扭扭
  ln0: [-30, -11], ln1: [-21, -9.5], ln2: [-9, -12.5], ln2b: [8, -11.2], ln3: [17, -13], ln4: [30.5, -9.4], // 上坡的小路
  mineF: [-34, -11.6], up1: [8, -21], shedF: [14, -20.5], up2: [8, -27], gateN: [12, -29.5], // 煤窑、山货棚、进山口
  apF: [31, -12.1],
  pastIn: [31, 21], // 草场里头（栅栏西边留的口子进去）
};
const EDGES = [
  ['west', 'g1'], ['g1', 'tmp'], ['tmp', 'lw'], ['lw', 'pS'], ['pS', 'lkN'], ['lkN', 'ford'], ['ford', 'pastG'],
  ['lw', 'bD'], ['bD', 'duckG'],
  ['g1', 'c1'], ['c1', 'st1'], ['pS', 'pN'], ['pN', 'stM'], ['ford', 'st4'],
  ['st0', 'st1'], ['st1', 'st1b'], ['st1b', 'st2'], ['st2', 'stM'], ['stM', 'st3'], ['st3', 'st4'], ['st4', 'st5'], ['st5', 'st6'],
  ['st1', 'ln0'], ['st2', 'ln2'], ['st5', 'ln4'],
  ['ln0', 'ln1'], ['ln1', 'ln2'], ['ln2', 'ln2b'], ['ln2b', 'ln3'], ['ln3', 'ln4'], ['ln4', 'apF'],
  ['pastG', 'pastIn'],
  ['ln0', 'mineF'], ['ln2b', 'up1'], ['up1', 'shedF'], ['up1', 'up2'], ['up2', 'gateN'],
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
function ruinHouse(M, { w = 5.2, d = 4, h = 2.8, state = 0, seed = 1, mat = 'adobe' }) {
  const rand = makeRng(seed);
  const roofMat = mat === 'rubble' ? 'slate' : 'thatch'; // 石头房盖石板，土坯房、木板房苫草
  if (state >= 2) {
    const hs = house(M, { w, d, h, wall: mat, rise: 1.3, roofMat, chimney: true, lit: true, front: [{ k: 'door', x: -w / 5 }, { k: 'windowLit', x: w / 5, y: 1.0 }] });
    return hs.object;
  }
  if (mat === 'wood') return ruinTimber(M, { w, d, h, state, rand });
  const g = new THREE.Group();
  const WM = M[mat];
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
  wallRun(w, (a, b, y0, y1) => g.add(block(a, y0, -d / 2, b, y1, -d / 2 + T, WM))); // 后墙
  for (const sx of [-1, 1]) wallRun(d - 2 * T, (a, b, y0, y1) => { // 山墙：塌了的那边前半截没了
    if (sx === lost && a > -0.2) return;
    g.add(block(sx * w / 2 - (sx > 0 ? T : 0), y0, a, sx * w / 2 + (sx > 0 ? 0 : T), y1, b, WM));
  });
  wallRun(w, (a, b, y0, y1) => { // 前墙：门洞、窗洞
    if (lost && a * lost > w / 2 - 1.6) return;
    g.add(block(a, y0, d / 2 - T, b, y1, d / 2, WM));
  }, [[-w / 5 - 0.5, -w / 5 + 0.5, 0.3, 2.1], [w / 5 - 0.45, w / 5 + 0.45, 1.0, 1.8]]);
  g.add(block(-w / 2 - 0.03, 0.3, -d / 2 - 0.03, w / 2 + 0.03, 0.8, -d / 2 + T + 0.03, M.rubble)); // 石头墙基（后墙）
  if (lost) rubbleHeap(M, g, lost * (w / 2 - 0.4), d / 2 + 0.3, 1.6, rand, WM); // 塌下来的那一角
  // 屋顶的木头：1 = 后坡还在、前坡只剩椽子；0 = 一根梁斜搭在墙上，几根椽子掉在屋里
  if (state === 1) {
    const run = d / 2 + 0.4, rise = 1.3, L = Math.hypot(run, rise), a = Math.atan2(rise, run);
    const slab = box(w + 0.1, 0.18, L, M[roofMat]);
    slab.position.set(0, h + rise / 2 + 0.09, -run / 2);
    slab.rotation.x = -a;
    g.add(slab);
    for (let x = -w / 2 + 0.3; x < w / 2; x += 0.6) { const r = box(0.1, 0.1, L, M.wood); r.position.set(x, h + rise / 2, run / 2); r.rotation.x = a; g.add(r); }
    g.add(block(-w / 2, h + rise, -0.12, w / 2, h + rise + 0.16, 0.12, M.wood)); // 脊檩
    for (let k = 0; k < 4; k++) { const zk = (d / 2) * (1 - (k + 1) / 5); for (const sx of [-1, 1]) g.add(block(sx > 0 ? w / 2 - T : -w / 2, h + (k * rise) / 4, -zk, sx > 0 ? w / 2 : -w / 2 + T, h + ((k + 1) * rise) / 4, zk, WM)); } // 山尖
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
 * 木板房的残架：柱子、梁还立着，板壁掉了一大半；1 = 后坡还苫着草，2 走 ruinHouse 的 house()。原点在地面中心，正面朝 +z。
 */
function ruinTimber(M, { w, d, h, state, rand }) {
  const g = new THREE.Group();
  g.add(block(-w / 2 - 0.2, 0, -d / 2 - 0.2, w / 2 + 0.2, 0.3, d / 2 + 0.2, M.stone)); // 石头台基
  const posts = [];
  for (const sz of [-1, 1]) for (let k = 0; k <= 3; k++) posts.push([-w / 2 + 0.12 + ((w - 0.24) * k) / 3, sz * (d / 2 - 0.12)]);
  for (const [x, z] of posts) { // 柱子：塌了的那边有两根断了半截
    const top = state === 0 && x > w / 4 && rand() < 0.6 ? h * (0.4 + rand() * 0.3) : h;
    g.add(block(x - 0.12, 0.3, z - 0.12, x + 0.12, top, z + 0.12, M.wood));
  }
  for (const sz of [-1, 1]) if (state > 0 || sz < 0) g.add(block(-w / 2, h - 0.2, sz * (d / 2 - 0.12) - 0.14, state > 0 ? w / 2 : w / 4, h + 0.06, sz * (d / 2 - 0.12) + 0.14, M.wood)); // 檐檩
  const keep = state === 0 ? 0.45 : 0.85;
  const boards = (len, place) => { for (let a = -len / 2; a < len / 2 - 0.05; a += 0.42) if (rand() < keep) place(a, Math.min(a + 0.4, len / 2), state === 0 ? 1.0 + rand() * (h - 1.3) : h - 0.2); };
  boards(w - 0.3, (a, b, top) => g.add(block(a, 0.3, -d / 2 + 0.02, b, top, -d / 2 + 0.12, M.wood))); // 后墙板
  for (const sx of [-1, 1]) boards(d - 0.4, (a, b, top) => g.add(block(sx * (w / 2 - 0.07) - 0.05, 0.3, a, sx * (w / 2 - 0.07) + 0.05, top, b, M.wood)));
  boards(w - 0.3, (a, b, top) => { const mid = (a + b) / 2; if (Math.abs(mid + w / 5) < 0.55 || (Math.abs(mid - w / 5) < 0.45 && top > 1)) return; g.add(block(a, 0.3, d / 2 - 0.12, b, top, d / 2 - 0.02, M.wood)); }); // 前墙板：门洞、窗洞空着
  if (state === 1) { // 后坡还苫着草，前坡只剩椽子
    const run = d / 2 + 0.4, rise = 1.2, L = Math.hypot(run, rise), a = Math.atan2(rise, run);
    const slab = box(w + 0.2, 0.18, L, M.thatch);
    slab.position.set(0, h + rise / 2 + 0.09, -run / 2);
    slab.rotation.x = -a;
    g.add(slab);
    for (let x = -w / 2 + 0.3; x < w / 2; x += 0.7) { const r = box(0.1, 0.1, L, M.wood); r.position.set(x, h + rise / 2, run / 2); r.rotation.x = a; g.add(r); }
    g.add(block(-w / 2, h + rise, -0.12, w / 2, h + rise + 0.16, 0.12, M.wood));
  } else { // 梁斜着落下来，地上一堆板子
    const beam = box(w + 0.2, 0.2, 0.2, M.wood);
    beam.position.set(0.3, h - 0.9, 0.2);
    beam.rotation.z = 0.28;
    beam.userData.tilted = true;
    g.add(beam);
    for (let i = 0; i < 5; i++) { const b = box(0.4, 0.06, 1.4 + rand(), M.wood); b.position.set((rand() - 0.2) * (w - 1.4) / 2, 0.34 + i * 0.07, (rand() - 0.5) * (d - 1.4)); b.rotation.y = rand() * 3; g.add(b); }
  }
  g.userData.thing = 'ruin';
  return g;
}

/** 荆条篱笆：木桩 + 编起来的荆条片；broken = 倒了几片、歪了几根桩。 */
function wattle(M, g, x0, z0, x1, z1, rand, broken, h = 0.95) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.9)), a = Math.atan2(z1 - z0, x1 - x0);
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, gone = broken && rand() < 0.3, lean = broken && rand() < 0.3;
    const px = x0 + (x1 - x0) * t0, pz = z0 + (z1 - z0) * t0;
    g.add(block(px - 0.07, 0, pz - 0.07, px + 0.07, h + 0.15, pz + 0.07, M.wood));
    if (gone) continue;
    const panel = box((t1 - t0) * L, h * (lean ? 0.8 : 0.85), 0.08, M.straw);
    panel.position.set(x0 + (x1 - x0) * (t0 + t1) / 2, h * 0.45, z0 + (z1 - z0) * (t0 + t1) / 2);
    panel.rotation.set(lean ? 0.35 : 0, -a, 0, 'YXZ');
    if (lean) panel.userData.tilted = true;
    g.add(panel);
  }
}

/**
 * 靠崖窑洞：后沿挖进黄土崖，窑脸是土坯 + 青砖券的拱门、拱窗（两孔：一孔住人，一孔塌了），崖顶长着草。
 * 修好了：拱门装上木门、拱窗糊上窗纸、崖顶伸出烟囱。原点在宅基地中心，正面朝 +z。
 */
function caveFace(M, spec, rand) {
  const g = new THREE.Group();
  const { w, d } = spec, s = spec.state, back = -d / 2, face = back + 1.4, H = 3.8;
  g.add(block(-w / 2, 0, back - 1.6, w / 2, H, face, M.loess)); // 黄土崖（窑脸往里都是土）
  g.add(block(-w / 2 - 0.1, H, back - 1.7, w / 2 + 0.1, H + 0.2, face + 0.25, M.grass ?? M.flatRoof)); // 崖顶的草皮，往外挑一点
  g.add(block(-w / 2, 0, face, w / 2, 0.45, face + 0.12, M.rubble)); // 窑脸下的石根
  const arch = (cx, bw, y0, y1, fill) => { // 券洞：方口 + 一层层收窄的券顶
    g.add(block(cx - bw / 2, y0, face - 0.05, cx + bw / 2, y1, face + 0.02, fill, { outline: false }));
    for (let k = 1; k <= 3; k++) { const ww = bw * (1 - k * 0.22); g.add(block(cx - ww / 2, y1 + (k - 1) * 0.16, face - 0.05, cx + ww / 2, y1 + k * 0.16, face + 0.02, fill, { outline: false })); }
    g.add(block(cx - bw / 2 - 0.18, y0, face, cx - bw / 2, y1 + 0.5, face + 0.16, M.brick), block(cx + bw / 2, y0, face, cx + bw / 2 + 0.18, y1 + 0.5, face + 0.16, M.brick)); // 砖券边
    g.add(block(cx - bw / 2 - 0.18, y1 + 0.5, face, cx + bw / 2 + 0.18, y1 + 0.68, face + 0.16, M.brick));
  };
  const door = s >= 2 ? M.wood : M.ink;
  arch(-1.2, 1.2, 0.45, 2.2, door); // 住人的那孔：门
  arch(0.6, 1.0, 1.2, 2.2, s >= 2 ? M.paper ?? M.plaster : M.ink); // 窗
  if (s < 2) { // 另一孔塌了：窑脸掉下来一大块，门前一堆黄土
    g.add(block(w / 2 - 2.4, 0.45, face - 0.6, w / 2 - 0.3, 2.6, face - 0.5, M.ink, { outline: false }));
    rubbleHeap(M, g, w / 2 - 1.4, face + 0.7, 1.7, rand, M.loess);
  } else {
    arch(w / 2 - 1.4, 1.1, 0.45, 2.2, M.wood);
    g.add(block(1.5, H, back + 0.2, 1.9, H + 1.1, back + 0.6, M.brick)); // 烟囱
  }
  g.userData.thing = 'ruin';
  return g;
}

/**
 * 一处老宅：按 kind 搭——院墙（土坯 / 毛石，塌了好几段）或矮石墙、荆条篱笆、或者没有院墙；破房子、院里的杂物、长出来的树。原点在宅基地中心。
 * 每处自己一个随机数种子：修房子时整处重搭（setPlotState），没修的地方和原来一模一样。
 */
function ruinPlot(M, spec) {
  const g = new THREE.Group();
  const { w, d, kind } = spec, s = spec.state, rand = makeRng(1000 + HOUSES.indexOf(spec) * 97), L = plotLayout(spec);
  const mat = spec.mat ?? (kind === 'stone' ? 'rubble' : kind === 'wood' ? 'wood' : 'adobe');
  if (kind === 'cave') g.add(caveFace(M, spec, rand));
  else {
    const [hw, hd, hh] = spec.house;
    const hs = ruinHouse(M, { w: hw, d: hd, h: hh, state: s, seed: 300 + spec.u * 7 + spec.z, mat });
    hs.position.set(L.hx, 0, L.hz);
    g.add(hs);
  }
  if (spec.wing) { // 东厢房：小一点，在正房东边
    const wing = ruinHouse(M, { w: 3.0, d: 2.6, h: 2.4, state: s, seed: 500 + spec.u * 3, mat });
    wing.position.set(w / 2 - 2.0, 0, L.hz + 0.3);
    g.add(wing);
  }
  // 院墙 / 矮石墙 / 篱笆：前墙在院门那儿留口；没修的塌了好几段，墙头高低不一
  const gapAt = (L.gx + w / 2) / w;
  if (kind === 'court' || kind === 'stone') {
    const wallH = kind === 'stone' ? (s >= 2 ? 1.1 : 0.85) : s >= 2 ? 1.6 : 1.1, wm = kind === 'stone' ? 'rubble' : s >= 2 ? 'adobe' : mat === 'rubble' ? 'rubble' : 'adobe';
    const run = (x0, z0, x1, z1, gap = null) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.0));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
        if (gap !== null && Math.abs(tm - gap) < 0.7 / len + 0.05) continue; // 院门的口
        const fallen = rand() < (kind === 'stone' ? 0.4 : 0.3), low = 0.45 + rand() * 0.55; // 每段都掷一样多的骰子：修好以后别的东西不挪窝
        if (s < 2 && fallen) continue;
        g.add(wallSeg(M, x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1, { h: s >= 2 ? wallH : wallH * low, mat: wm, t: kind === 'stone' ? 0.5 : 0.35, cap: s >= 2 && kind === 'court' }));
      }
    };
    run(-w / 2, -d / 2, w / 2, -d / 2);
    run(-w / 2, -d / 2, -w / 2, d / 2);
    run(w / 2, -d / 2, w / 2, d / 2);
    run(-w / 2, d / 2, w / 2, d / 2, gapAt);
    if (kind === 'court' && spec.wing) for (const sx of [-1, 1]) g.add(block(L.gx + sx * 1.15 - 0.25, 0, d / 2 - 0.45, L.gx + sx * 1.15 + 0.25, s >= 2 ? 2.2 : 1.5 + rand() * 0.5, d / 2 + 0.1, M.brick)); // 大户的门楼：两根砖垛
  } else if (kind === 'fence') {
    const broken = s < 2, gx0 = L.gx - 0.6, gx1 = L.gx + 0.6;
    wattle(M, g, -w / 2, -d / 2, w / 2, -d / 2, rand, broken);
    wattle(M, g, -w / 2, -d / 2, -w / 2, d / 2, rand, broken);
    wattle(M, g, w / 2, -d / 2, w / 2, d / 2, rand, broken);
    wattle(M, g, -w / 2, d / 2, gx0, d / 2, rand, broken);
    wattle(M, g, gx1, d / 2, w / 2, d / 2, rand, broken);
  }
  // 院里 / 门口的杂物：没修的是碎土坯、倒了的破缸；修好的是水缸、柴垛
  const yz = Math.min(d / 2 - 1.0, L.front + 1.2);
  if (s < 2) {
    if (kind !== 'cave') rubbleHeap(M, g, -w / 2 + 1.2, yz, 0.9, rand, M[mat === 'wood' ? 'rubble' : mat]);
    if (rand() < 0.6) { const v = prism(0.42, 0.3, 0.7, M.loess, 8); v.rotation.z = Math.PI / 2; v.position.set(w / 2 - 1.1, 0.42, yz); v.userData.tilted = true; g.add(v); } // 倒着的破缸
  } else {
    g.add(P.vat(M, w / 2 - 1.0, yz));
    g.add(P.firewood(M, -w / 2 + 1.4, yz + 0.2, 1.4));
  }
  if (spec.extra === 'mill') { // 冲到门外的磨盘：一扇斜靠在墙根，一扇平躺在地上
    for (const [x, z, a] of [[w / 2 + 0.9, 0.2, 0.9], [w / 2 + 1.0, -1.6, 0]]) { const m = prism(0.62, 0.62, 0.22, M.stone, 12); m.position.set(x, a ? 0.55 : 0.11, z); m.rotation.z = a; m.userData.tilted = a > 0; g.add(m); }
  }
  if (spec.extra === 'forge') { // 门口塌了的铁匠炉：半截砖炉膛、一块铁砧、一地炉渣
    g.add(block(-w / 2 - 1.6, 0, -0.6, -w / 2 - 0.4, s >= 2 ? 1.0 : 0.6, 0.6, M.brick));
    g.add(block(-w / 2 - 1.4, 0, 0.9, -w / 2 - 0.9, 0.5, 1.3, M.iron), block(-w / 2 - 1.55, 0.5, 0.85, -w / 2 - 0.75, 0.62, 1.35, M.iron));
    g.add(block(-w / 2 - 1.8, 0, -1.6, -w / 2 - 0.6, 0.08, -0.8, M.ink, { outline: false }));
  }
  if (spec.extra === 'pen') { // 窑前的石头羊圈（矮石墙，塌了一角）
    const x0 = w / 2 - 3.2, x1 = w / 2 - 0.3, z0 = -d / 2 + 2.0, z1 = d / 2 - 0.3;
    for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x0, z1], [x1 - 1.2, z1]], [[x0, z0], [x0, z1 - 1.0]]]) g.add(wallSeg(M, a[0], a[1], b[0], b[1], { h: 0.8, mat: 'rubble', t: 0.45, cap: false }));
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

/** 导航用的老宅轮廓：院墙 / 篱笆一整圈（院门那儿留口）+ 房子的地盘（窑洞是整面土崖）。墙塌没塌、房子修没修，人都只走院门、不进屋（修好以后不用重算导航）。 */
function plotNavShape(spec) {
  const { w, d, kind } = spec, L = plotLayout(spec), out = [];
  const box3 = (x0, z0, x1, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0)); m.position.set((x0 + x1) / 2, 0.5, (z0 + z1) / 2); return m; };
  const t = 0.2, gx = L.gx;
  if (kind === 'court' || kind === 'stone' || kind === 'fence') {
    out.push(box3(-w / 2 - t, -d / 2 - t, w / 2 + t, -d / 2 + t), box3(-w / 2 - t, -d / 2, -w / 2 + t, d / 2 + t), box3(w / 2 - t, -d / 2, w / 2 + t, d / 2 + t));
    out.push(box3(-w / 2, d / 2 - t, gx - 0.65, d / 2 + t), box3(gx + 0.65, d / 2 - t, w / 2, d / 2 + t));
  }
  if (kind === 'cave') out.push(box3(-w / 2, -d / 2 - 1.6, w / 2, L.front - 0.1));
  else out.push(box3(L.hx - L.hw / 2 - 0.2, L.hz - L.hd / 2 - 0.2, L.hx + L.hw / 2 + 0.2, L.hz + L.hd / 2 + 0.2)); // 正房
  if (spec.wing) out.push(box3(w / 2 - 3.6, L.hz + 0.3 - 1.5, w / 2 - 0.4, L.hz + 0.3 + 1.5));
  if (spec.extra === 'pen') out.push(box3(w / 2 - 3.4, -d / 2 + 1.8, w / 2 - 0.1, d / 2 - 0.1));
  if (spec.extra === 'mill') out.push(box3(w / 2 + 0.2, -2.3, w / 2 + 1.7, 0.9));
  if (spec.extra === 'forge') out.push(box3(-w / 2 - 1.9, -0.8, -w / 2 - 0.3, 1.5));
  return out;
}

/**
 * 煤窑口：青石崖脚凿进去的大窑口。崖前垒出一截夹着煤线的石头窑脸，中间一个一人多高的大洞口，
 * 三道木头撑子（立柱 + 顶梁）一道比一道往里，最外面那道最粗，横梁上挂着红布和马灯；洞里黑着。
 * 一对铁轨从洞里伸出来，轨上一辆装满煤的斗车；洞口东边一座大煤堆、一座小煤堆，西边一座放筐和坑木的棚子。原点在平台中心，洞口朝南（+z）。
 */
const MINE_MOUTH = { x: -1.0, w: 3.6, h: 4.4 }; // 洞口（本地 x 中心、宽、高）
function coalMine(M) {
  const g = new THREE.Group();
  const back = -MINE.d / 2, front = back + 2.2, { x: cx, w: ow, h: oh } = MINE_MOUTH, Hm = 7.6;
  // 窑脸：一溜参差的青石柱子拼起来，两头矮、中间高，前脸进进出出；洞口那几根从洞顶往上起
  const rr = makeRng(41);
  for (let x = -6.4; x < 4.2; x += 0.7) {
    const x1 = Math.min(4.2, x + 0.7), mid = (x + x1) / 2, inMouth = mid > cx - ow / 2 && mid < cx + ow / 2;
    const taper = Math.min(1, (mid + 6.4) / 2.5, (4.2 - mid) / 2.2), top = 2.2 + (Hm - 2.2) * taper + (rr() - 0.4) * 1.4;
    const fz = front - (inMouth ? 0 : 0.15 + rr() * 0.7) - (1 - taper) * 0.8;
    g.add(block(x, inMouth ? oh : 0, back - 0.4, x1, Math.max(inMouth ? oh + 1.2 : 1.6, top), fz, M.coalRock));
    if (!inMouth && rr() < 0.4) g.add(block(x - 0.1, 0, fz - 0.2, x1 + 0.1, 0.5 + rr() * 0.8, fz + 0.35, M.coalRock)); // 脚下掉下来的石块
  }
  g.add(block(cx - ow / 2, 0, back - 0.5, cx + ow / 2, oh, back - 0.35, M.ink, { outline: false })); // 洞里黑着
  for (const [x, y0, y1] of [[cx - ow / 2 + 0.02, 0, oh], [cx + ow / 2 - 0.02, 0, oh]]) g.add(block(x - 0.02, y0, back - 0.35, x + 0.02, y1, back + 0.9, M.ink, { outline: false })); // 洞壁往里越来越黑
  g.add(block(cx - ow / 2, oh - 0.04, back - 0.35, cx + ow / 2, oh, back + 0.9, M.ink, { outline: false }));
  [[back + 0.3, 0.24, 0], [back + 1.2, 0.28, 0], [front + 0.05, 0.4, 0.5]].forEach(([z, t, wide]) => { // 三道撑子：外面那道最粗、横梁两头挑出来
    for (const sx of [-1, 1]) g.add(block(cx + sx * (ow / 2 - 0.25) - t / 2, 0, z - t / 2, cx + sx * (ow / 2 - 0.25) + t / 2, oh - 0.3, z + t / 2, M.wood));
    g.add(block(cx - ow / 2 - wide, oh - 0.3 - t * 0.4, z - t / 2 - 0.02, cx + ow / 2 + wide, oh - 0.3 + t * 0.6, z + t / 2 + 0.02, M.wood));
  });
  g.add(block(cx - 0.9, oh + 0.35, front + 0.01, cx + 0.9, oh + 1.05, front + 0.1, M.wood)); // 窑口上的木牌
  g.add(block(cx - ow / 2 - 0.5, oh - 0.05, front + 0.26, cx + ow / 2 + 0.5, oh + 0.1, front + 0.3, M.redCloth, { outline: false })); // 挂红
  for (const sx of [-1, 1]) g.add(block(cx + sx * (ow / 2 + 0.25) - 0.13, oh - 1.1, front + 0.25, cx + sx * (ow / 2 + 0.25) + 0.13, oh - 0.75, front + 0.5, M.lantern, { outline: false })); // 两盏马灯
  for (const sx of [-0.5, 0.5]) g.add(block(cx + sx - 0.05, 0.02, back - 0.35, cx + sx + 0.05, 0.1, MINE.d / 2 - 1.2, M.iron)); // 两根铁轨
  for (let z = back + 0.1; z < MINE.d / 2 - 1.2; z += 0.6) g.add(block(cx - 0.8, 0, z - 0.1, cx + 0.8, 0.05, z + 0.1, M.wood)); // 枕木
  const cart = new THREE.Group(); // 斗车（装满煤）
  cart.add(block(-0.6, 0.28, -0.45, 0.6, 0.95, 0.45, M.wood), block(-0.55, 0.95, -0.4, 0.55, 1.2, 0.4, M.ink, { outline: false }));
  for (const sx of [-0.45, 0.45]) for (const sz2 of [-0.3, 0.3]) { const wh = prism(0.18, 0.18, 0.08, M.iron, 8); wh.rotation.x = Math.PI / 2; wh.position.set(sx, 0.2, sz2); cart.add(wh); }
  cart.rotation.y = Math.PI / 2;
  cart.position.set(cx, 0, front + 1.4);
  g.add(tag(cart, 'mineCart'));
  const heap = prism(0.35, 2.3, 1.7, M.ink, 9); // 大煤堆，上面滚着几块大煤
  heap.position.set(4.0, 0.85, 1.4);
  g.add(tag(heap, 'coalHeap'));
  for (const [x, y, z, s2] of [[3.2, 0.9, 1.0, 0.4], [4.6, 1.2, 1.6, 0.35], [2.4, 0.2, 2.6, 0.45], [5.4, 0.2, 0.2, 0.3]]) { const b = box(s2, s2 * 0.8, s2, M.ink); b.position.set(x, y + s2 * 0.4, z); b.rotation.y = x; g.add(b); }
  const heap2 = prism(0.2, 1.2, 0.8, M.ink, 8);
  heap2.position.set(4.6, 0.4, -1.6);
  g.add(tag(heap2, 'coalHeap'));
  g.add(P.shed(M, -4.6, 1.8, 3.0, 2.4)); // 放筐、放坑木的棚子
  g.add(P.firewood(M, -4.6, -0.6, 2.2)); // 撑巷道的坑木
  for (let i = 0; i < 3; i++) g.add(block(-5.6 + i * 0.7, 0, 2.6, -5.1 + i * 0.7, 0.55, 3.1, M.wheat)); // 一排煤筐
  tag(g, 'coalMine');
  return g;
}

/** 进山口：一座石头牌坊（两根石柱、一道石梁、梁上一块匾），旁边一块界碑，石阶往北钻进林子。原点在平台中心。 */
function mountainGate(M) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) { g.add(block(sx * 1.6 - 0.3, 0, -0.3, sx * 1.6 + 0.3, 3.4, 0.3, M.stone)); g.add(block(sx * 1.6 - 0.45, 0, -0.45, sx * 1.6 + 0.45, 0.4, 0.45, M.rubble)); }
  g.add(block(-2.2, 3.4, -0.4, 2.2, 3.85, 0.4, M.stone), block(-2.4, 3.85, -0.5, 2.4, 4.05, 0.5, M.slate));
  g.add(block(-0.8, 2.6, 0.31, 0.8, 3.3, 0.38, M.wood)); // 匾
  g.add(block(2.4, 0, 0.6, 2.8, 1.4, 0.8, M.stone)); // 界碑
  return tag(g, 'mountainGate');
}

/** 山货收购棚：一座敞棚，棚下摞着背篓、麻袋，前面一排竹匾晒着蘑菇、核桃、野菜。原点在平台中心。 */
function gatherShed(M) {
  const g = new THREE.Group();
  g.add(P.shed(M, -1.6, -0.6, 3.6, 2.4));
  g.add(P.sacks(M, 3).translateX(-2.6).translateZ(0.9));
  [M.persimmonMat ?? M.corn, M.hawthornMat ?? M.corn, M.corn].forEach((fill, i) => g.add(P.dryingMat(M, fill, 0.9, 1.3).translateX(0.7 + i * 1.0).translateZ(0.9))); // 晒蘑菇、山楂、核桃
  g.add(block(2.6, 0, -1.8, 3.4, 0.9, -1.0, M.wheat)); // 一摞背篓
  return tag(g, 'gatherPoint');
}

/** 培育田边上的木桩小牌（一畦一块）和看田的草棚。u0 … u1：田的东西两头（本地 u），z：南沿。 */
function trialMarkers(M, level) {
  const g = new THREE.Group();
  for (let u = TRIAL.u0 + 1; u < TRIAL.u1; u += 2) {
    g.add(block(W(u) - 0.05, level, TRIAL.z1 + 0.3, W(u) + 0.05, level + 0.9, TRIAL.z1 + 0.4, M.wood));
    g.add(block(W(u) - 0.3, level + 0.6, TRIAL.z1 + 0.42, W(u) + 0.3, level + 0.9, TRIAL.z1 + 0.48, M.paper ?? M.plaster));
  }
  const hut = P.fieldHut(M, 0, 0, 0);
  hut.position.set(W(TRIAL.u1 + 1.6), level, (TRIAL.z0 + TRIAL.z1) / 2);
  g.add(hut);
  const box3 = new THREE.Mesh(new THREE.BoxGeometry(TRIAL.u1 - TRIAL.u0, 1.2, TRIAL.z1 - TRIAL.z0), new THREE.MeshBasicMaterial({ visible: false })); // 点田看卡片
  box3.position.set(W((TRIAL.u0 + TRIAL.u1) / 2), level + 0.6, (TRIAL.z0 + TRIAL.z1) / 2);
  box3.userData.dynamic = true;
  g.add(tag(box3, 'trialField'));
  return g;
}

/** 蜂场：两排蜂箱，中间一条小道，四周一圈野花丛。原点在平台中心。 */
function apiary(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) g.add(P.beehive(M, -2.6 + (i % 3) * 2.6, (i < 3 ? -1.2 : 1.0), 0));
  return tag(g, 'apiary');
}

/** 老祠堂遗址：一座毛石台基，前面两级石阶；台上两排柱础，两根断了半截的石柱，一根倒在台上，半截石碑歪在一边。原点在平台中心。 */
function ancestralRuin(M) {
  const g = new THREE.Group();
  g.add(block(-3.7, 0, -1.8, 3.7, 0.7, 0.9, M.rubble), block(-3.8, 0.7, -1.9, 3.8, 0.82, 1.0, M.stone)); // 台基
  g.add(block(-1.2, 0, 0.9, 1.2, 0.55, 1.3, M.stone), block(-1.2, 0, 1.3, 1.2, 0.28, 1.7, M.stone)); // 石阶
  for (const x of [-3, -1, 1, 3]) for (const z of [-1.3, 0.3]) g.add(block(x - 0.28, 0.82, z - 0.28, x + 0.28, 0.98, z + 0.28, M.stone)); // 柱础
  for (const [x, z, h] of [[-3, -1.3, 1.8], [1, -1.3, 0.9], [3, 0.3, 0.5]]) { const c = prism(0.2, 0.2, h, M.stone, 8); c.position.set(x, 0.98 + h / 2, z); g.add(c); } // 断了的石柱
  const fallen = prism(0.2, 0.2, 2.2, M.stone, 8); // 倒在台上的一根
  fallen.rotation.set(0, 0.3, Math.PI / 2);
  fallen.position.set(-0.6, 1.02, -0.5);
  fallen.userData.tilted = true;
  g.add(fallen);
  const stele = block(-0.35, 0, -0.1, 0.35, 1.3, 0.1, M.stone); // 半截石碑，歪着
  stele.position.set(2.2, 0.82, 0.6);
  stele.rotation.z = -0.35;
  stele.userData.tilted = true;
  g.add(stele);
  return tag(g, 'ancestralRuin');
}

/** 一截残墙：土坯墙拐个角，墙头参差、塌了一个豁口。原点在平台中心。 */
function wallRuin(M, rand) {
  const g = new THREE.Group();
  const seg2 = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.5); for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n; if (rand() < 0.15) continue; g.add(wallSeg(M, x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1, { h: 0.6 + rand() * 1.6, mat: 'adobe', t: 0.4, cap: false })); } };
  seg2(-1.8, -1.0, 1.6, -1.0);
  seg2(-1.8, -1.0, -1.8, 1.2);
  rubbleHeap(M, g, 0.4, 0.2, 1.2, rand, M.adobe);
  return tag(g, 'wallRuin');
}

// ---------------------------------------------------------------- 搭老村址

/**
 * M：村子的材质（共用）。返回 { object, terrain, nodes, things, placeAt, whereAt, work, houses, plots, homes, animals, blockNav, update, … }。
 */
export function buildEast(M) {
  addEastMaterials(M);
  const root = new THREE.Group();
  root.scale.setScalar(UNIT);
  const rand = makeRng(717);

  // 1. 路网节点跟着地面；各行当的地方（戏台、煤窑口……）的平台取中心的坡高（平台挖进坡里，和村子的 padLevel 一样）
  const lvl = (u, z) => Math.max(0.6, q(slope(u, z), 0.6));
  const pads = [];
  const pad = (u, z, w, d, rot = 0, level = lvl(u, z)) => { pads.push({ x: W(u), z, rot: (rot * Math.PI) / 180, w, d, level }); return level; };
  for (const s of [PLAZA, MINE, SHED, MGATE, ANCESTRAL, WALLRUIN]) s.level = pad(s.u, s.z, s.w, s.d);
  APIARY.level = pad(APIARY.u, APIARY.z, APIARY.w, APIARY.d, 0, lvl(APIARY.u, APIARY.z + APIARY.d / 2 + 1)); // 蜂场挖进坡里，和前沿的路差不多高
  const nodes = {};
  for (const [name, [u, z]] of Object.entries(ROAD)) nodes[name] = { x: W(u), z, h: q(natural(W(u), z).h, 0.3) };
  nodes.west.h = Math.round(rawHeight(nodes.west.x, nodes.west.z) / 0.3) * 0.3; // 和村子那头的路口（layout.js 的 eastGate）一样算：接缝两边路面一样高
  const onPadLevel = { pN: PLAZA, pS: PLAZA, mineF: MINE, shedF: SHED, gateN: MGATE, apF: APIARY };
  for (const [k, s] of Object.entries(onPadLevel)) nodes[k].h = s.level;
  nodes.bD.h = 0.6;
  nodes.pastIn.h = nodes.pastG.h = terrace((PASTURE.u0 + PASTURE.u1) / 2, (PASTURE.z0 + PASTURE.z1) / 2); // 草场门口和草场一样高（小路从渡口爬上来）

  // 院子（老宅、原住户）：门外一个路口节点，连一小段路到最近的那条路上（落脚点插在那条路当中）。
  // 原住户的院子和门口的路一样高；老宅贴着坡（free）：比路高的、低的都有，门前那段路是几级台阶（一步不超过一级）
  const aprons = [], edges = [...EDGES];
  const yard = (id, u, z, rot, gx, w, d, free = false) => {
    const a = (rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a), at = (lx, lz) => [W(u) + cs * lx + sn * lz, z - sn * lx + cs * lz];
    const [x1, z1] = at(gx, d / 2 + 1.4);
    let best = null;
    for (const [ea, eb] of EDGES) { const A = nodes[ea], B = nodes[eb], s2 = seg(x1, z1, [A.x, A.z], [B.x, B.z]); if (!best || s2.d < best.d) best = { ...s2, A, B }; }
    const jh = Math.round((best.A.h + (best.B.h - best.A.h) * best.t) / 0.3) * 0.3;
    const run = best.d + 1.7, climb = Math.floor((0.5 * run) / 0.3) * 0.3; // 院门到路上：能爬几级台阶
    const level = free ? Math.max(0.6, Math.min(jh + climb, Math.max(jh - climb, lvl(u, z)))) : Math.max(0.6, Math.min(lvl(u, z) + 2.4, Math.max(lvl(u, z) - 2.4, jh))); // 老宅贴着坡；原住户和路一样高
    pad(u, z, w, d, rot, level);
    const [x0, z0] = at(gx, d / 2 - 0.3), hg = Math.round((level + ((jh - level) * 1.7) / run) / 0.3) * 0.3;
    aprons.push({ x0, z0, x1, z1, w: 1.8, h0: level, h1: hg });
    nodes[`g:${id}`] = { x: x1, z: z1, h: hg };
    nodes[`j:${id}`] = { x: best.A.x + (best.B.x - best.A.x) * best.t, z: best.A.z + (best.B.z - best.A.z) * best.t, h: jh };
    edges.push([`g:${id}`, `j:${id}`]);
    return level;
  };
  for (const p of HOUSES) { p.lay = plotLayout(p); p.level = yard(p.id, p.u, p.z, p.rot, p.lay.gx, p.w, p.d, true); }
  for (const [k, h] of Object.entries(HOMES)) h.level = yard(k, h.u, h.z, 0, 0, h.w, h.d);
  nodes.duckG.h = HOMES.duckYard.level;

  // 2. 地形
  const terrain = buildTerrain(M, { pads, nodes, edges, aprons, bounds: EAST_BOUNDS, natural, water, farm: false, sideMat: sideMat(M), cropMats: [M.stubbleW, M.furrow, M.furrow, M.sprout] });
  root.add(terrain.object);

  // 3. 老宅、原住户、老戏台台基和老井、各行当的地方
  const plots = {};
  for (const p of HOUSES) {
    const g = ruinPlot(M, p);
    g.position.set(W(p.u), p.level, p.z);
    g.rotation.y = (p.rot * Math.PI) / 180;
    root.add(g);
    plots[p.id] = g;
  }
  const homes = {};
  const put = (k, built) => { const h = HOMES[k]; built.object.position.set(W(h.u), h.level, h.z); root.add(built.object); homes[k] = built; return built; };
  const temple = put('riverTemple', riverTemple(M));
  put('mason', masonYard(M));
  const kiln = put('limeKiln', limeKiln(M));
  put('duckYard', duckYard(M));
  const at = (s, obj, dy = 0) => { obj.position.set(W(s.u), s.level + dy, s.z); root.add(obj); return obj; };
  const stage = at(PLAZA, stageBase(M));
  stage.position.x -= 1.6;
  root.add(P.well(M, W(PLAZA.u) + 2.6, PLAZA.z + 0.8).translateY(PLAZA.level));
  const roller = P.roller(M, 0, 0); // 倒在旧河道边上的石碾（碾框早烂了）
  roller.position.set(W(30), terrain.heightAt(W(30), 9.5), 9.5);
  roller.rotation.set(0.25, 0.6, 0);
  roller.userData.tilted = true;
  root.add(roller);
  at(MINE, coalMine(M));
  at(MGATE, mountainGate(M));
  at(SHED, gatherShed(M));
  at(APIARY, apiary(M));
  at(ANCESTRAL, ancestralRuin(M));
  at(WALLRUIN, wallRuin(M, makeRng(55))).rotation.y = 0.5;
  // 路边的小物件（和村里一样）：路口的老土地庙、石敢当；原住户门口的柴垛、水缸、草垛；培育田里的稻草人
  const flatAt = (x, z, w, d) => {
    const h = terrain.heightAt(x, z);
    for (const dx of [-w / 2, 0, w / 2]) for (const dz of [-d / 2, 0, d / 2]) { const t = terrain.typeAt(x + dx, z + dz); if (terrain.heightAt(x + dx, z + dz) !== h || t === 'path' || t === 'stream' || t === 'field' || terrain.isWater(x + dx, z + dz)) return null; }
    return h;
  };
  const near = (x0, z0, w, d, r = 4) => { for (let rr = 0; rr <= r; rr += 0.5) for (let a = 0; a < 16; a++) { const x = x0 + Math.cos((a / 16) * Math.PI * 2) * rr, z = z0 + Math.sin((a / 16) * Math.PI * 2) * rr, h = flatAt(x, z, w, d); if (h !== null) return [x, z, h]; } return null; };
  const decor = [];
  const place = (obj, spot, fx, fz) => { if (!spot) return null; obj.position.set(spot[0], spot[2], spot[1]); if (fx !== undefined) obj.rotation.y = Math.atan2(fx - spot[0], fz - spot[1]); root.add(obj); decor.push([spot[0], spot[1]]); return obj; };
  place(tag(shrine(M), 'oldShrine'), near(nodes.g1.x + 2.6, nodes.g1.z - 2.4, 2.0, 1.6), nodes.g1.x, nodes.g1.z);
  for (const n of ['st1', 'stM', 'st4', 'ln2b']) place(tag(stoneTablet(M), 'oldTablet'), near(nodes[n].x - 1.6, nodes[n].z - 1.4, 0.8, 0.6, 2.5), nodes[n].x, nodes[n].z);
  const hp = (k, lx, lz) => [W(HOMES[k].u) + lx, HOMES[k].z + lz];
  place(P.firewood(M, 0, 0, 2.0), near(...hp('mason', -4.0, 2.6), 2.2, 0.8, 1.5));
  place(P.vat(M, 0, 0), near(...hp('riverTemple', 4.6, 1.2), 1, 1, 1.5));
  place(P.cornRack(M, 0, 0, 2.4), near(...hp('riverTemple', 4.4, -2.8), 2.6, 0.8, 2));
  place(P.haystack(M, 0, 0, 1.1, 2.2), near(...hp('duckYard', -4.6, 1.0), 2.4, 2.4, 2));
  place(P.haystack(M, 0, 0, 1.3, 2.6), near(W(PASTURE.u0 - 2.6), PASTURE.z1 - 2.5, 2.8, 2.8, 3));
  place(P.firewood(M, 0, 0, 1.6), near(...hp('limeKiln', -4.8, 1.0), 1.8, 0.8, 1.5));
  root.add(P.scarecrow(M, W(TRIAL.u0 + 3), (TRIAL.z0 + TRIAL.z1) / 2 + 0.5, 0.3).translateY(terrain.heightAt(W(0), -18)));
  root.add(trialMarkers(M, terrain.heightAt(W(0), -18)));
  const pastureLevel = terrain.heightAt(W((PASTURE.u0 + PASTURE.u1) / 2), (PASTURE.z0 + PASTURE.z1) / 2);
  const fence = P.fence(M, W(PASTURE.u0 + 0.6), PASTURE.z0 + 0.6, W(PASTURE.u1 - 0.6), PASTURE.z1 - 0.6, { h: 1.0, gap: [0.45, 0.6], gapSide: 'west' }); // 栅栏缩进草场里一点（边上是坎子）
  fence.position.y = pastureLevel;
  root.add(fence);
  root.add(P.trough(M, W(PASTURE.u1 - 3), PASTURE.z0 + 2).translateY(pastureLevel));
  root.add(brokenBridge(M, W(-32), sz(-32)));
  const drift = driftPile(M);
  drift.position.set(W(-26), 0.6, sz(-26) - streamHalf(-26) - 1.4);
  root.add(drift);
  const lakeBox = new THREE.Mesh(new THREE.BoxGeometry(LAKE.ru * 1.6, 0.6, LAKE.rz * 1.6), new THREE.MeshBasicMaterial({ visible: false })); // 点水塘看卡片
  lakeBox.position.set(W(LAKE.u), WATER_Y, LAKE.z);
  lakeBox.userData.dynamic = true;
  root.add(tag(lakeBox, 'lake'));

  // 4. 树：歪脖子老柳（大水里没倒）、水塘边的柳树杨树、坡上的槐树枣树、北边高大的林子（进山口两边最高）；冲下来的大圆石
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
  const oldWillow = plant('willow', W(-2), 30.5, 21, 1.45);
  oldWillow.rotation.z = 0.12; // 歪脖子
  oldWillow.userData.tilted = true;
  const willowBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6, 2.4), new THREE.MeshBasicMaterial({ visible: false })); // 点它看卡片
  willowBox.position.set(oldWillow.position.x, oldWillow.position.y + 3, oldWillow.position.z);
  willowBox.userData.dynamic = true;
  root.add(tag(willowBox, 'oldWillow'));

  const pathNear = (x, z, r) => [0, 1.57, 3.14, 4.71].some((a) => terrain.typeAt(x + Math.cos(a) * r, z + Math.sin(a) * r) === 'path') || terrain.typeAt(x, z) === 'path';
  const wet = (x, z) => [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].some(([dx, dz]) => terrain.typeAt(x + dx, z + dz) === 'stream');
  const onPad = (x, z, m = 1.5) => pads.some((p) => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m);
  const groves = { willow: [], poplar: [], locust: [], oak: [], pine: [], bush: [], jujube: [], persimmon: [], walnut: [], cypress: [] };
  const tall = []; // 北边林子里最高的那些（进山口两边）：单独放大
  const pick = (w) => { let r = rand(); for (const [k, p] of w) if ((r -= p) < 0) return k; return w[0][0]; };
  for (let x = EAST_BOUNDS.x0 + 1; x < EAST_BOUNDS.x1 - 1; x += 2.1) for (let z = EAST_BOUNDS.z0 + 1; z < EAST_BOUNDS.z1 - 1; z += 2.1) {
    const px = x + (rand() - 0.5) * 1.5, pz = z + (rand() - 0.5) * 1.5, u = px - OX, type = terrain.typeAt(px, pz);
    if (pathNear(px, pz, 1.4) || wet(px, pz) || onPad(px, pz) || decor.some(([dx, dz]) => Math.hypot(px - dx, pz - dz) < 2.2) || inRect(u, pz, { u0: PASTURE.u0 - 1, u1: PASTURE.u1 + 1, z0: PASTURE.z0 - 1, z1: PASTURE.z1 + 1 }) || Math.hypot(px - oldWillow.position.x, pz - oldWillow.position.z) < 3) continue;
    let kind = null;
    if (type === 'forest' && rand() < 0.85) {
      kind = pick([['pine', 0.4], ['oak', 0.35], ['locust', 0.15], ['bush', 0.1]]);
      if (kind !== 'bush') { tall.push([kind, px, pz, 1.35 + rand() * 0.55 + smooth(-27, -34, pz) * 0.3]); continue; } // 高大的林子
    } else if (type === 'stone' && rand() < 0.12) kind = rand() < 0.6 ? 'pine' : 'bush'; // 石缝里的松树
    else if (type === 'grass' && lakeR(u, pz) < 1.9 && rand() < 0.25) kind = rand() < 0.7 ? 'willow' : 'poplar'; // 水塘边
    else if (type === 'grass' && pz < 14 && rand() < 0.15) kind = pick([['locust', 0.22], ['jujube', 0.18], ['persimmon', 0.2], ['walnut', 0.15], ['cypress', 0.1], ['bush', 0.15]]); // 坡上：老辈人栽的柿子树、核桃树、枣树，没人管也年年结果
    else if (type === 'gravel' && rand() < 0.04) kind = 'willow';
    else if (type === 'grass' && pz > sz(u) && rand() < 0.08) kind = rand() < 0.5 ? 'willow' : 'poplar'; // 溪南
    if (!kind) continue;
    groves[kind].push([px, pz, 0.8 + rand() * 0.35]);
  }
  const plotAt = (p, lx, lz) => { const a = (p.rot * Math.PI) / 180; return [W(p.u) + Math.cos(a) * lx + Math.sin(a) * lz, p.z - Math.sin(a) * lx + Math.cos(a) * lz]; };
  for (const p of HOUSES) if (p.tree) { const [x, z] = plotAt(p, -p.w / 2 + 1.1, p.d / 2 - 1.1); groves[p.tree].push([x, z, 0.85 + rand() * 0.2]); } // 院里长出来的树（墙角）
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  const flora = new THREE.Group();
  const instance = (kind, seed, list) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(voxelTree(kind, seed, 1), M.voxel, list.length);
    list.forEach(([x, z, s], i) => { mesh.setMatrixAt(i, m4.compose(p3.set(x, terrain.heightAt(x, z), z), qt, sc.set(s, s, s))); trunks.push([x, z, kind === 'bush' ? 0.3 : 0.4 * Math.min(1.5, s)]); });
    mesh.castShadow = mesh.receiveShadow = true;
    flora.add(mesh);
  };
  for (const [kind, list] of Object.entries(groves)) for (let v = 0; v < 2; v++) instance(kind, 800 + v * 17 + kind.length, list.filter((_, i) => i % 2 === v));
  for (const kind of ['pine', 'oak', 'locust']) for (let v = 0; v < 2; v++) instance(kind, 900 + v * 13 + kind.length, tall.filter((t, i) => t[0] === kind && i % 2 === v).map(([, x, z, s]) => [x, z, s]));
  const rocks = []; // 大水冲下来的圆石：旧河道里、水塘边、坡上散着几块
  for (let i = 0; i < 700 && rocks.length < 40; i++) {
    const x = EAST_BOUNDS.x0 + 4 + rand() * 84, z = -24 + rand() * 56, t = terrain.typeAt(x, z);
    if (t === 'stream' || t === 'path' || t === 'pad' || t === 'field' || pathNear(x, z, 1.4) || onPad(x, z, 0.8)) continue;
    if (t !== 'gravel' && rand() > 0.12) continue;
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
  // 荒草：没人住的老宅、遗址里蒿草长得齐腰深，越靠墙根越密（修好了就拔掉）；路边、坡上的野花野草和村里一样
  const fgeo = floraGeometries(), weeds = Object.fromEntries(Object.keys(fgeo).map((k) => [k, []]));
  const weedKind = (r) => (r < 0.42 ? 'tuft' : r < 0.72 ? 'foxtail' : r < 0.82 ? 'aster' : r < 0.92 ? 'daisy' : 'pebbles');
  for (const p of HOUSES) {
    const L = p.lay;
    for (let lx = -p.w / 2 - 0.5; lx <= p.w / 2 + 0.5; lx += 0.42) for (let lz = -p.d / 2 - 0.3; lz <= p.d / 2 + 0.5; lz += 0.42) {
      const jx = lx + (rand() - 0.5) * 0.3, jz = lz + (rand() - 0.5) * 0.3;
      if (p.kind === 'cave' ? jz < L.front : Math.abs(jx - L.hx) < L.hw / 2 + 0.3 && Math.abs(jz - L.hz) < L.hd / 2 + 0.3) continue; // 屋里（台基上）、土崖里不长
      if (Math.abs(jx - L.gx) < 0.75 && jz > L.front) continue; // 进院门的那条道踩出来了
      const edge = Math.min(p.w / 2 - Math.abs(jx), p.d / 2 - Math.abs(jz));
      if (rand() > (edge < 0.9 ? 0.8 : 0.4)) continue;
      const [x, z] = plotAt(p, jx, jz);
      if (terrain.typeAt(x, z) === 'path' || terrain.typeAt(x, z) === 'stream') continue;
      weeds[weedKind(rand())].push([x, z, terrain.heightAt(x, z), 1.1 + rand() * 0.9, p.id]);
    }
  }
  for (const r of [ANCESTRAL, WALLRUIN]) for (let du = -r.w / 2 - 1; du <= r.w / 2 + 1; du += 0.4) for (let dz = -r.d / 2 - 1; dz <= r.d / 2 + 1; dz += 0.4) {
    if (rand() > 0.5) continue;
    const x = W(r.u + du) + (rand() - 0.5) * 0.3, z = r.z + dz + (rand() - 0.5) * 0.3, t = terrain.typeAt(x, z);
    if (t === 'path' || t === 'stream') continue;
    weeds[weedKind(rand())].push([x, z, terrain.heightAt(x, z) + (Math.abs(du) < 3.7 && dz > -1.8 && dz < 0.9 && r === ANCESTRAL ? 0.82 : 0), 1.1 + rand() * 0.8, null]); // 祠堂台基缝里也长
  }
  const pathDist = (x, z) => { for (const r of [0.5, 1.0, 1.5, 2.0]) for (let a = 0; a < 8; a++) if (terrain.typeAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r) === 'path') return r; return Infinity; };
  for (let x = EAST_BOUNDS.x0 + 1; x < EAST_BOUNDS.x1 - 1; x += 0.5) for (let z = EAST_BOUNDS.z0 + 1; z < EAST_BOUNDS.z1 - 1; z += 0.5) {
    const px = x + (rand() - 0.5) * 0.4, pz = z + (rand() - 0.5) * 0.4;
    if (terrain.typeAt(px, pz) === 'field' && inRect(px - OX, pz, FALLOW)) { if (rand() < 0.4) weeds[rand() < 0.6 ? 'tuft' : 'foxtail'].push([px, pz, terrain.heightAt(px, pz), 0.9 + rand() * 0.7, null]); continue; } // 撂荒地里的草
    if (terrain.typeAt(px, pz) !== 'grass' || terrain.isWater(px, pz) || onPad(px, pz, 0.3)) continue;
    const d = pathDist(px, pz), south = pz > sz(px - OX) + streamHalf(px - OX);
    if (rand() > (d === Infinity ? (south ? 0.3 : 0.12) * (0.6 + 0.4 * Math.sin(px * 0.7) * Math.sin(pz * 0.9)) : 0.7 - d * 0.22)) continue;
    const r = rand();
    weeds[r < 0.3 ? 'tuft' : r < 0.5 ? 'foxtail' : r < 0.68 ? 'daisy' : r < 0.8 ? 'aster' : r < 0.9 ? 'dandelion' : 'pebbles'].push([px, pz, terrain.heightAt(px, pz), 0.8 + rand() * 0.5, null]);
  }
  const weedOf = {}; // 每处老宅的荒草在哪几个实例上：修好了缩成 0
  const e3 = new THREE.Euler();
  for (const [k, list] of Object.entries(weeds)) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(fgeo[k], M.voxel, list.length);
    list.forEach(([x, z, h, s, plot], i) => {
      mesh.setMatrixAt(i, m4.compose(p3.set(x, h, z), qt.setFromEuler(e3.set(0, Math.floor(rand() * 8) * (Math.PI / 4), 0)), sc.set(s, s, s)));
      if (plot) (weedOf[plot] ??= []).push([mesh, i]);
    });
    qt.identity();
    mesh.receiveShadow = true;
    flora.add(mesh);
  }
  flora.userData.count = { ...Object.fromEntries(Object.entries(groves).map(([k, l]) => [k, l.length])), tall: tall.length, rocks: rocks.length, weeds: Object.values(weeds).reduce((n, l) => n + l.length, 0) };

  // 5. 自检、导航障碍、物件包围盒；老宅一处一处单独合批（以后修房子要换掉一处），其余整体合批
  root.userData.coplanar = fixCoplanar(root, (o) => o === terrain.object || o.userData.tree || o.isSprite);
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const blockers = [];
  for (const p of HOUSES) { // 老宅按整圈院墙 + 房子地盘挡路（跟着老宅转过的角度）
    const holder = new THREE.Group();
    holder.position.copy(plots[p.id].position);
    holder.rotation.y = plots[p.id].rotation.y;
    for (const m of plotNavShape(p)) holder.add(m);
    holder.updateMatrixWorld(true);
    for (const m of holder.children) blockers.push([m, m.matrixWorld.clone()]);
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

  // 6. 会动的：庙前香炉、石灰窑的烟、各家的炊烟、水塘边的萤火虫、雨
  const sprites = new Sprites(root, M);
  const smoke = { size: 0.9, rise: 2.6, drift: 0.8, life: 0.3 };
  const kilnSmoke = new Smoke(root, sprites, kiln.chimney.clone().add(kiln.object.position), 91, { ...smoke, size: 1.2, colors: [R.white[2], R.smoke[2]] });
  const incense = new Smoke(root, sprites, temple.burner.clone().add(temple.object.position), 93, { size: 0.35, rise: 1.6, drift: 0.6, life: 0.25 });
  const chimneys = Object.values(homes).filter((h) => h.home?.chimney).map((h, i) => new Smoke(root, sprites, h.home.chimney.clone().add(h.home.object.position).add(h.object.position), 95 + i, smoke));
  const fireflies = new Fireflies(root, M.fireflySprite, [[W(-6), W(18), 19, 30, 0.6], [W(-36), W(-24), 24, 32, 1.2]], 30, 11);
  const rain = new Rain(root, EAST_BOUNDS, terrain.walkAt, 2200, 17);
  const lights = [];
  const pointLight = (x, y, z, base) => { const l = new THREE.PointLight(GLOW.lamp, 0, 0.07, 1.4); l.position.set(x, y, z); root.add(l); lights.push({ l, base }); };
  pointLight(W(HOMES.riverTemple.u) + 2.6, HOMES.riverTemple.level + 2.2, HOMES.riverTemple.z + 1.2, 0.02);
  pointLight(W(HOMES.duckYard.u) - 1.6, HOMES.duckYard.level + 1.6, HOMES.duckYard.z + 1.4, 0.02);
  pointLight(W(MINE.u + MINE_MOUTH.x), MINE.level + 3.6, MINE.z - MINE.d / 2 + 2.8, 0.03); // 煤窑口的两盏马灯
  const ownWindow = M.windowLit.clone(); // 老村址自己的窗户：天黑才亮
  ownWindow.onBeforeCompile = M.windowLit.onBeforeCompile;
  ownWindow.customProgramCacheKey = M.windowLit.customProgramCacheKey;
  root.traverse((o) => { if (o.material === M.windowLit) o.material = ownWindow; });

  // 点到地上（没碰到物件）：这一片叫什么
  const PLACE = {
    oldbed: { name: '旧河道', tags: ['卵石'], about: '六十多年前那场山洪冲出来的河道，从东头山口斜穿过坡，一直冲进坡下的水塘。水早退了，只剩一沟白花花的卵石，夏天下大雨还会走一回水。' },
    beach: { name: '河滩', tags: ['卵石', '柳树'], about: '小溪北岸的卵石滩。水生常在这儿捞上游冲下来的漂木，晒干了当柴卖；苗家的鸭子一早就下到这里的浅水。' },
    lake: { name: '水塘', tags: ['沙滩', '柳树'], about: '大水那年冲出来的一汪水塘，一道窄沟通着小溪。塘边一圈细沙、几棵柳树，钓鱼的人爱坐在这儿。' },
    stone: { name: '青石崖', tags: ['煤线'], about: '老村址西北角的一面青石崖，石层里夹着一道道黑亮的煤线。崖脚凿了个煤窑口，冬天村里烧的煤就从这儿背出去。' },
    forest: { name: '东山老林', tags: ['油松', '槲栎', '野猪'], about: '老村址背后的老林子，树又高又密。进山口的石牌坊往北，一条石阶钻进林子里。采山货、打猎的人从这儿上山，林子边上常有野猪拱过的土。' },
    field: { name: '培育田', tags: ['良种'], about: '一溜五畦试验田，每畦一样庄稼，畦头插着木牌写着是什么种、哪天种的。农技员在这儿挑穗大粒饱的留种。' },
    fallow: { name: '撂荒的梯田', tags: ['荒地'], about: '大水以前这几级梯田种麦子，人一搬走就撂了荒，田埂还在，地里长满了草。新来的人要是想种地，翻一翻就能种。' },
    pasture: { name: '放牛草场', tags: ['黄牛'], about: '旧河道东边一大块平坦的草场，围着一圈木栅栏。村里几家寄养的牛白天在这儿吃草，放牛的人看着。' },
    slope: { name: '老石峪', tags: ['老村址'], about: '石峪村原来就在这面坡上。大水以后大半人家搬去了下游，留下一坡塌了的老宅。地是好地，就是好些年没人种了。' },
    south: { name: '溪南草滩', tags: [], about: '小溪南边的一溜草滩，和村口那边连着。' },
  };
  const placeAt = (x, z) => {
    const u = x - OX, t = terrain.typeAt(x, z);
    if (t === 'sand' || lakeR(u, z) < 1.2) return PLACE.lake;
    if (t === 'stream' || z > sz(u) + streamHalf(u)) return z > sz(u) ? PLACE.south : PLACE.beach;
    if (t === 'gravel') return toLine(u, z, OLDBED) < OLDBED_HALF + 0.5 ? PLACE.oldbed : PLACE.beach;
    if (t === 'stone') return PLACE.stone;
    if (t === 'forest' || z < forestZ(u)) return PLACE.forest;
    if (t === 'field') return inRect(u, z, FALLOW) ? PLACE.fallow : PLACE.field;
    if (inRect(u, z, PASTURE)) return PLACE.pasture;
    return PLACE.slope;
  };

  // 原住户的院子（给村民系统当"家"用，village.js 包成和村里院落一样的接口）：本地坐标都相对院子中心
  root.updateMatrixWorld(true);
  const SPOTS = {
    riverTemple: { yard: [0.4, 1.6], work: [-2.4, 0.4], stele: [-1.3, 2.6], sweepA: [-0.6, 1.4], sweepB: [1.8, 2.4] },
    mason: { yard: [0, 2.0], work: [1.3, 1.9], pile: [1.6, 0.6], sweepA: [-1.0, 2.2], sweepB: [0.6, 2.6] },
    limeKiln: { yard: [0, 2.4], work: [2.2, 2.4], stone: [0.2, 1.4], sweepA: [-1.4, 1.6], sweepB: [0.8, 2.8] },
    duckYard: { yard: [-1.5, 2.1], pen: [2.3, 3.4], sweepA: [-2.6, 2.0], sweepB: [-0.6, 2.4] },
  };
  const FACE = { mason: [2.3, 1.6], limeKiln: [2.2, 0.6], riverTemple: [-2.4, -0.6] };
  const homeSpecs = Object.fromEntries(Object.entries(homes).map(([k, b]) => {
    const h = HOMES[k], hp = b.home.object.position, door = [hp.x + b.home.door.x, hp.z + b.home.door.z];
    return [k, { id: k, x: W(h.u), z: h.z, w: h.w, d: h.d, level: h.level, gate: [0, h.d / 2 + 0.8], doors: { house: door }, spots: SPOTS[k], face: FACE[k] }];
  }));
  const ring = (cx, cz, r, n) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r]);
  const forestEdge = [];
  for (let u = -22; u <= 43; u += 3) if (Math.abs(u - APIARY.u) > APIARY.w / 2 + 1) forestEdge.push([W(u), forestZ(u) + 1.4]);
  const work = {
    beach: [ // 水塘边一圈 + 溪北的卵石滩：捞漂木、钓鱼、看水
      ...ring(LAKE.u, LAKE.z, 1, 14).map(([u, z]) => [W(LAKE.u + (u - LAKE.u) * LAKE.ru * 1.15), LAKE.z + (z - LAKE.z) * LAKE.rz * 1.15]).filter(([, z]) => z < LAKE.z + 2),
      ...Array.from({ length: 6 }, (_, i) => { const u = -34 + i * 4; return [W(u), sz(u) - streamHalf(u) - 1.2]; }),
    ],
    temple: { at: [W(HOMES.riverTemple.u) - 2.4, HOMES.riverTemple.z + 1.5], face: [W(HOMES.riverTemple.u) - 2.4, HOMES.riverTemple.z - 1.2] },
    stele: [W(HOMES.riverTemple.u) - 1.4, HOMES.riverTemple.z + 2.6],
    digs: [...OLDBED.slice(0, -1).map(([u, z]) => [W(u), z]), ...HOUSES.map((p, i) => plotAt(p, (i % 2 ? 1 : -1) * (p.w / 2 + 1.2), 0)), [W(ANCESTRAL.u), ANCESTRAL.z + ANCESTRAL.d / 2 + 0.8], [W(WALLRUIN.u) + 2.5, WALLRUIN.z + 1.5]], // 刨旧物：旧河道里、老宅墙外、老祠堂遗址、残墙根
    mine: { at: [W(MINE.u + MINE_MOUTH.x), MINE.z - MINE.d / 2 + 0.9], face: [W(MINE.u + MINE_MOUTH.x), MINE.z - MINE.d / 2 - 1], heap: [W(MINE.u) + 1.5, MINE.z + 1.4] }, // 挖煤：洞口里头刨、背出来倒在煤堆上
    pasture: ring((W(PASTURE.u0) + W(PASTURE.u1)) / 2, (PASTURE.z0 + PASTURE.z1) / 2, 4, 8),
    apiary: [[W(APIARY.u) - 1.3, APIARY.z - 0.1], [W(APIARY.u) + 1.3, APIARY.z - 0.1], [W(APIARY.u), APIARY.z - 0.1]],
    trial: [[W(-4), TRIAL.z1 + 1.2], [W(0), TRIAL.z1 + 1.2], [W(4), TRIAL.z1 + 1.2], [W(-2), TRIAL.z0 - 0.8], [W(2), TRIAL.z0 - 0.8]],
    gather: [W(SHED.u) + 1.6, SHED.z + 1.8], // 山货收购棚前：采回来的山货倒在这儿晾
    forest: forestEdge, // 林子边：采山货、下套子
  };
  const animals = [ // 林子边的野猪、草场上的牛（village.js 放进 extraAnimals）
    ...[[-18, -6], [-2, 10], [34, 43]].map(([u0, u1]) => ({ kind: 'boar', role: 'boar', worldArea: [W(u0), Math.min(forestZ(u0), forestZ(u1)) - 5, W(u1), Math.max(forestZ(u0), forestZ(u1)) + 2], ownerText: '东山上的野物' })),
    ...Array.from({ length: 4 }, () => ({ kind: 'ox', role: 'cow', worldArea: [W(PASTURE.u0 + 1.5), PASTURE.z0 + 1.5, W(PASTURE.u1 - 1.5), PASTURE.z1 - 1.5], ownerText: '老村址草场（各家寄养）', about: '村里几家寄养在草场上的黄牛，白天在栅栏里低头吃草，放牛的人看着；农忙时各家牵回去犁地、拉车。' })),
  ];

  let last = 0, litAt = -9; // 最近一次上香的钟点

  /** 老宅换个样子（住进来先苫半边顶 = 1，修好了 = 2）：整处重搭、单独合批，卡片跟着改。 */
  function setPlotState(id, state) {
    const spec = HOUSES.find((h) => h.id === id), old = plots[id];
    if (!spec || !old || spec.state === state) return;
    spec.state = state;
    if (state >= 2) for (const [mesh, i] of weedOf[id] ?? []) { mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); mesh.instanceMatrix.needsUpdate = true; } // 修好了：院里的荒草拔干净
    const g = ruinPlot(M, spec);
    g.position.copy(old.position);
    g.rotation.copy(old.rotation);
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
    /** 这个位置叫什么（卡片上"在哪儿"）：原住户家、老宅、行当的地方、否则看这一片。 */
    whereAt(x, z) {
      const u = x - OX;
      for (const [k, h] of Object.entries(HOMES)) if (Math.abs(u - h.u) < h.w / 2 + 0.5 && Math.abs(z - h.z) < h.d / 2 + 0.5) return HOME_NAMES[k];
      const p = HOUSES.find((h) => Math.hypot(u - h.u, z - h.z) < Math.max(h.w, h.d) / 2 + 0.6);
      if (p) return p.owner ? `${p.ownerName ?? ''}家（${p.who}老宅）` : `${p.who}老宅`;
      for (const [s, name] of [[MINE, '煤窑口'], [SHED, '山货收购棚'], [MGATE, '进山口'], [APIARY, '蜂场'], [PLAZA, '老戏台'], [ANCESTRAL, '老祠堂遗址']]) if (Math.abs(u - s.u) < s.w / 2 + 1 && Math.abs(z - s.z) < s.d / 2 + 1) return name;
      return placeAt(x, z).name;
    },
    work,
    animals,
    edges,
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
