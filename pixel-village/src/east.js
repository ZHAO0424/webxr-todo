import * as THREE from 'three';
import { UNIT, block, box, prism, bakeStatic, makeRng } from './pixel.js';
import { R, GLOW } from './palette.js';
import { addEastMaterials } from './textures.js';
import { buildTerrain, rawHeight } from './terrain.js';
import { streamZ, BAND, STREAM_HALF, WATER_Y } from './layout.js';
import { house, wallSeg, lantern } from './buildings.js';
import * as PROPS from './props.js';
import { tagged, tag, collectThings } from './things.js';
import { voxelTree, voxelGeometry } from './voxel.js';
import { is } from './season.js';
import { findFloating } from './audit.js';
import { fixCoplanar } from './coplanar.js';
import { Sprites } from './sprites.js';
import { Smoke, Fireflies, Rain } from './fx.js';
import { shrine, stoneTablet, floraGeometries } from './roadside.js';
import { fieldCrops, gardenShapes } from './farmland.js';

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
const CELL_E = 0.5; // 湖水离岸远近按半米一格算
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

/**
 * 东南角一大片湖：从村子那头流过来的小溪到这儿就汇进湖里（南边的溪只剩西边一段），冲沟的口子也开在湖边；
 * 湖一直铺到东边、南边的沙盘边上。shoreZ(u)：北岸线（往东越来越往北收）；lakeR < 1 在水里（1 以上每 4 米加 1，岸边一圈沙、竹子柳树都按它算）。
 */
const LAKE_U0 = -2; // 湖从这儿往东
const shoreZ = (u) => 35.5 - 0.42 * u + 1.2 * Math.sin(u * 0.35) + 0.6 * Math.sin(u * 0.9 + 1);
const lakeR = (u, z) => (u < LAKE_U0 ? 9 : 1 + (shoreZ(u) - z) / 4);
const inChannel = () => false;
const LAKE_Y = WATER_Y - 0.3; // 湖面比小溪低一截：溪水漫过石坝跌进湖里
const DAM_U = LAKE_U0; // 小石坝：溪到这儿进湖
/** 湖边一圈毛石砌的驳岸（岸沿铺石头）：湖北岸一圈 + 湖西头那道直边。 */
const quay = (u, z) => lakeR(u, z) < 1.25 || (u >= LAKE_U0 - 0.6 && u < LAKE_U0 + 0.1 && z > sz(u));
/**
 * 黄土冲沟：当年的山洪从东头山口冲下来，在黄土坡上刨出一道五到八米深的沟，斜劈过坡，一直通到坡下的大湖。
 * 两岸是陡立的黄土崖，沟底长着草和几棵柳树，中间一条踩出来的小路；老街在沟上过一座土拱桥。
 * OLDBED：沟的中线；沟底宽 2 × OLDBED_HALF；gullyDepth：沟有多深（山口那头浅、出山口就深，到湖边坡矮了自然浅）。
 */
const OLDBED = [[45, -1], [35, 2], [25, 6.5], [16, 11.5], [11, 17.5], [10, 24], [12, 29]]; // 沟口开在湖边
const OLDBED_HALF = 3.0;
const gullyDepth = (u) => 8 * smooth(44, 37, u);
/** 东北的青石崖（煤窑就开在崖脚）：崖面朝南，崖顶上是老林子。 */
const cliffZ = (u) => (u < 27 ? -99 : -13.6);
const streamHalf = (u) => STREAM_HALF + 0.8 * smooth(-44, -30, u); // 河湾里水面宽一些（接缝处和村子一样宽）

/**
 * 一处老宅（宅基地）：u, z 是宅基地中心，rot 转角（度；正面 / 院门朝 +z 转过 rot，有的朝北对着老街）；w × d 宅基地多大；
 * 房子都是囫囵的（大水以后空了几十年，收拾收拾就能住），每家都有自己的院子；样子看家境（kind）：
 *   court 院墙围着的大院（王家、周家带厢房、门楼）  row 连着的两间铺面 + 前院  stone 石头房 + 矮石墙  wood 木板房 + 篱笆院
 *   fence 土坯小屋 + 荆条篱笆  cave 靠崖窑洞 + 窑院
 * house：正房 [宽, 深, 墙高]；mat：墙的料（brick 青砖 / adobe 土坯 / rubble 毛石 / wood 木板）；roof：瓦顶 roof / 石板 slate / 草顶 thatch；
 * annex：连着正房的那一间；pen：院里的牲口圈（好人家 cow 牛棚，中等 pig 猪圈 / coop 鸡窝，穷人家没有）；
 * tree：院里的树；extra：磨盘、铁匠炉、木料、羊圈；who：原来是谁家的（现在村里哪户的祖宅）；state 2 = 囫囵的（0 / 1 留给旧存档）。
 */
/**
 * 开局模式：默认老宅都是囫囵的；废墟开局（main.js 按 ?ruins=1 在建场景之前设）时，没人住的老宅塌的塌、漏的漏（RUIN_STATE），
 * 新居民住进哪一处，那一处才修成囫囵的。
 */
let RUINS = false;
export const setRuins = (on) => { RUINS = !!on; };
export const ruinsMode = () => RUINS;
const RUIN_STATE = { old1: 1, old2: 1, old3: 0, old4: 1, old5: 0, old6: 1, old7: 0, old8: 0, old9: 1, old10: 0, old11: 0, old12: 1 }; // 0 塌了 / 1 能遮雨（大户人家的砖瓦房塌得慢）
export const HOUSES = [
  { id: 'old1', u: -20.5, z: 9.1, rot: 178, w: 11, d: 8.5, kind: 'court', mat: 'brick', roof: 'roof', house: [5.6, 3.8, 3.0], wing: true, pen: 'cow', who: '王家', state: 2, story: '王村长的爷爷那辈住在这儿，是老石峪数得着的大院：青砖瓦房，正房带厢房，院门有门楼，西墙根一座牛棚。大水那年一家人搬去了下游，院子一直空着。' },
  { id: 'old2', u: -22.5, z: -2.3, rot: -4, w: 9.5, d: 5.5, kind: 'row', mat: 'brick', roof: 'roof', house: [4.6, 3.4, 3.0], annex: [3.8, 3.4, 2.7], who: '孙家', state: 2, story: '孙掌柜家的老铺面：临着老街两间连着的屋，两间青砖瓦房连着，一间做铺面（木板门、柜台），一间住人，门前一片石板铺的场子。' },
  { id: 'old3', u: -10, z: 6.6, rot: 184, w: 8, d: 6.5, kind: 'stone', house: [4.6, 3.4, 2.6], extra: 'mill', pen: 'coop', who: '赵家', state: 2, story: '赵家的老磨坊，青石垒的。大水从门里冲进来，把石磨盘冲到了门外，墙根还留着一道黄泥印子；院里搭着鸡窝。' },
  { id: 'old4', u: 12.6, z: 5.5, rot: 186, w: 9, d: 8, kind: 'court', mat: 'rubble', roof: 'slate', house: [4.6, 3.6, 2.8], tree: 'persimmon', pen: 'pig', who: '陈家', state: 2, story: '陈老汉出生在这院里。他说大水那天他才八九岁，是被他爹扛在肩上从齐腰深的水里背出去的。院里那棵老柿子树还年年结果，猪圈空着。' },
  { id: 'old5', u: -11.5, z: -17, rot: 8, w: 7, d: 6, kind: 'fence', house: [3.8, 3.0, 2.4], who: '杨家', state: 2, story: '杨家给唐东家当长工时住的小院：一间土坯草房，一圈荆条篱笆，别的什么也没有。' },
  { id: 'old6', u: -35.8, z: 9, rot: 14, w: 9, d: 7, kind: 'stone', house: [5.4, 3.8, 2.8], tree: 'locust', pen: 'coop', who: '吴家', state: 2, story: '吴家老宅，石头垒的，石板盖顶。院墙外一棵老槐树，墙根一座鸡窝。' },
  { id: 'old7', u: -13, z: -3.6, rot: -6, w: 8, d: 6, kind: 'fence', house: [5.4, 3.8, 3.0], extra: 'lumber', who: '刘家', state: 2, story: '刘木匠家的土坯草房，篱笆小院。木匠家的房子梁最粗，院里还码着他没用完的木料。' },
  { id: 'old8', u: -2.5, z: -3.8, rot: 3, w: 7, d: 6, kind: 'stone', house: [4.2, 3.2, 2.6], extra: 'forge', who: '张家', state: 2, story: '张家头一代铁匠在这儿打铁：一间石头屋，院里一座铁匠炉，地上埋着烧黑的炉渣。' },
  { id: 'old9', u: 38.5, z: 10.3, rot: -20, w: 9.5, d: 7.5, kind: 'court', mat: 'adobe', roof: 'roof', house: [5.0, 3.8, 3.0], wing: true, pen: 'cow', tree: 'jujube', who: '周家', state: 2, story: '周家药铺原先开在这儿，前店后院，院里一座牛棚。屋里的药柜早没了，墙上还看得出一格格药斗子的印子。' },
  { id: 'old10', u: -38.3, z: -2.8, rot: 4, w: 8, d: 6.5, kind: 'cave', extra: 'pen', who: '马家', state: 2, story: '马家放羊时住的靠崖窑，挖在西头山根的黄土崖里，冬暖夏凉，门前一圈石头羊圈。' },
  { id: 'old11', u: -2.5, z: 6.6, rot: 176, w: 6.5, d: 6, kind: 'fence', house: [3.8, 3.0, 2.4], who: '郑家', state: 2, story: '剃头匠老郑家的老屋，就一间，篱笆小院，在老街南边、场院跟前。他说小时候秋天就在场院的谷草垛里钻着玩。' },
  { id: 'old12', u: 26, z: 14.2, rot: -24, w: 7, d: 5.5, kind: 'stone', house: [5.0, 3.4, 2.8], tree: 'persimmon', who: '李家', state: 2, story: '据说是早年教书先生住的石头房，在冲沟南岸的崖边上，院里一棵柿子树。大水没淹到，是年久没人住才空的。' },
];
const PEN = { w: 3.0, d: 2.6 }; // 牲口圈：在院子前面靠西的角上
/** 宅基地里各样东西的位置（本地坐标，原点在宅基地中心，+z 朝院门）：正房、院门、房门、院里站人的地方。 */
function plotLayout(p) {
  const { w, d } = p, [hw, hd] = p.house ?? [w - 1.5, 2.6], aw = p.annex?.[0] ?? 0;
  const hz = p.kind === 'cave' ? -d / 2 + 0.7 : -d / 2 + hd / 2 + (p.kind === 'court' ? 1.1 : 0.5), hx = p.kind === 'court' && p.wing ? -w * 0.12 : aw / 2;
  const gx = p.kind === 'cave' ? -0.6 : Math.round(w * 0.14 * 10) / 10;
  const front = p.kind === 'cave' ? -d / 2 + 1.5 : hz + hd / 2; // 正房前脸（窑洞是窑脸）
  let y0 = front + 0.6, y1 = d / 2 - 0.5;
  if (y1 - y0 < 1) { y0 = d / 2 + 0.6; y1 = d / 2 + 1.4; } // 院子太浅：门前站人
  const xl = p.pen ? -w / 2 + PEN.w + 0.6 : -w / 2 + 0.8, xr = p.extra === 'pen' ? w / 2 - 3.6 : w / 2 - 0.8; // 牲口圈、羊圈让开
  const mid = (y0 + y1) / 2;
  return {
    hx, hz, hw, hd, gx, front, aw,
    door: p.kind === 'cave' ? [-1.2, front + 0.6] : [hx - hw / 5, front + 0.6],
    gate: [gx, d / 2 + 0.8],
    spots: { yard: [gx * 0.4, mid], sweepA: [Math.max(-w / 4, xl + 0.3), mid], sweepB: [Math.min(w / 4, xr - 0.3), mid], work: [Math.min(0.5, xr - 0.6), mid] },
    area: [xl, y0, xr, y1],
  };
}

/** 原住户：u, z 是院子中心。 */
const HOMES = {
  riverTemple: { u: -22.5, z: 17.5, w: 13, d: 6 }, // 河神庙（西头）和柳婆婆、水生住的小屋（东头）隔开一段，中间一棵树：坡上看着石潭
  mason: { u: -21, z: -18, w: 9, d: 7 }, // 葛家石匠院
  limeKiln: { u: 23.5, z: -6.8, w: 9, d: 7 }, // 白家石灰窑：东头，挨着煤窑和青石崖（烧石灰的青石就从崖上撬）
  duckYard: { u: -30, z: 27, w: 8, d: 6 }, // 苗家鸭棚：湖西头、小溪边上
};
const HOME_NAMES = { riverTemple: '河神庙', mason: '葛家石匠院', limeKiln: '白家石灰窑', duckYard: '苗家鸭棚' };
/** 各行当的地方：煤窑口、培育田、山货收购棚、进山口、蜂场、放牛草场；石潭边的亭子。 */
const MINE = { u: 36, z: -9.1, w: 13, d: 9 }; // 煤窑口前的大场子（后沿贴着青石崖）
const TRIAL = { u0: -5, u1: 5, z0: -21, z1: -15 };
const SHED = { u: 14, z: -24, w: 8, d: 5 };
const MGATE = { u: 12, z: -31, w: 6, d: 3 };
const APIARY = { u: 16.5, z: -16, w: 7, d: 5 }; // 林子下面向阳的一块（蜂采坡上的野花、林子里的槐花）
const PASTURE = { u0: -43, u1: -30, z0: -22, z1: -10 }; // 西头山坳里一块平草场
const ANCESTRAL = { u: -3, z: -24.6, w: 8, d: 4 }; // 老祠堂的遗址：只剩台基和柱础
/** 村里过日子的地方：场院（打谷、晒粮）、菜园、果园、祖坟；其余的坡都开成梯田种庄稼（见 farmAt）。 */
const THRESH = { u: -8.5, z: 14.6, w: 10, d: 5.6 }; // 场院：老街南边、塘上头一块平场，谷草垛、碌碡、晒粮的席子
const GARDENS = [{ u: -32, z: -4.6, w: 3.5, d: 5 }, { u: 5.2, z: -7, w: 5, d: 4.5 }]; // 院边的菜园子：篱笆围着，一畦畦白菜
const ORCH = { u: -12, z: 28.5, w: 10, d: 6 }; // 坡脚溪边的果园：柿子、核桃一行行
const GRAVE = { u: 26, z: -20, w: 6, d: 4 }; // 林子边的祖坟
/** 这条线以北是高大的老林子：西头从草场后面起，往东越来越往南压，东北角（青石崖顶上）整个是林子。 */
const forestZ = (u) => -27 + 14 * smooth(16, 42, u) + 1.5 * Math.sin(u * 0.45);

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
  if (quay(u, z) && lakeR(u, z) >= 1) return { h: 0.6, type: 'stone' }; // 驳岸：岸沿一圈石头，侧面毛石砌到水里
  if (z > s + half) return { h: Math.max(0, Math.floor((0.5 + Math.min(1.0, (z - s - half) * 0.18) + 0.25 * Math.sin(x * 0.3)) / 1.2) * 1.2), type: 'grass' }; // 溪南的河滩，和村子一样
  if (z > s - half - 3) return { h: 0.6, type: 'gravel' }; // 北岸的卵石滩
  if (lakeR(u, z) < 1.4) return { h: 0.6, type: 'sand' }; // 湖边一圈沙滩
  if (inRect(u, z, PASTURE)) return { h: terrace((PASTURE.u0 + PASTURE.u1) / 2, (PASTURE.z0 + PASTURE.z1) / 2), type: 'grass' }; // 放牛的草场：一大块平的
  if (z < cliffZ(u)) return { h: q(terrace(u, z) + 6 + 1.2 * Math.sin(u * 0.3) + (cliffZ(u) - z) * 0.3, 1.2), type: cliffZ(u) - z > 3 ? 'forest' : 'stone' }; // 青石崖：比崖脚高出七八米，崖顶是林子
  for (const g of GARDENS) if (Math.abs(u - g.u) < g.w / 2 + 0.5 && Math.abs(z - g.z) < g.d / 2 + 0.5) return { h: terrace(g.u, g.z), type: Math.abs(u - g.u) < g.w / 2 && Math.abs(z - g.z) < g.d / 2 ? 'field' : 'grass', crop: 3 }; // 菜园：平平的一块
  if (inRect(u, z, TRIAL)) { const strip = Math.floor((u - TRIAL.u0) / 2); return { h: terrace(0, -18), type: 'field', crop: [1, 2, 3, 0, 1][Math.min(4, strip)] }; } // 培育田：一畦一样庄稼，比着种
  const t = terrace(u, z);
  const dg = toLine(u, z, OLDBED);
  if (dg < OLDBED_HALF) return { h: Math.max(0.6, q(slope(u, z) - gullyDepth(u), 0.3)), type: dg < 0.6 ? 'path' : 'grass' }; // 冲沟底：顺着坡慢慢往下，中间一条踩出来的小路
  const forest = z < forestZ(u) && !(Math.abs(u - MGATE.u) < 2.2 && z > MGATE.z - MGATE.d / 2); // 北边的林子（进山口前那段路留出来，牌坊背后都是树）
  return { h: t, type: forest ? 'forest' : 'grass' };
}

/** 西边和村子的山梁接上：高度渐变到村子地形（交界处完全一样）；北边村子那头是高山梁，绕出一道山嘴慢慢落下来。 */
/** 坡上没盖房子、没派别的用处的地方都开成梯田（每级、每段一种庄稼，有几片荒着）：冲沟边、塘边、林子边、果园、坟地、草场不开。 */
const near2 = (u, z, r, m) => Math.abs(u - r.u) < r.w / 2 + m && Math.abs(z - r.z) < r.d / 2 + m;
function farmAt(x, z, h, wild) {
  const u = x - OX;
  if (wild || z < forestZ(u) + 1.5 || z < cliffZ(u) + 1 || inRect(u, z, PASTURE) || toLine(u, z, OLDBED) < OLDBED_HALF + 1.8 || lakeR(u, z) < 1.7 || z > sz(u) - streamHalf(u) - 4) return false;
  if (near2(u, z, ORCH, 1) || near2(u, z, GRAVE, 1.5) || near2(u, z, THRESH, 1)) return false;
  return [0, 1, 2, 1][(Math.round(h / 1.2) + Math.floor((u + 45) / 16)) % 4];
}

function natural(x, z) {
  const u = x - OX, g = ground(u, z), w = 1 - smooth(-45, -37 + 7 * (1 - smooth(18, 24, z)), u);
  if (w <= 0 || inRect(u, z, PASTURE)) return g; // 草场是山坳里平平的一块，不跟山梁
  const v = Math.max(0, Math.floor(rawHeight(x, z) / 1.2) * 1.2);
  return { h: q(g.h + (v - g.h) * w, 0.6), type: w > 0.5 && !['gravel', 'stone'].includes(g.type) ? 'grass' : g.type, crop: g.crop };
}

function water(x, z) {
  const u = x - OX, s = sz(u);
  if (lakeR(u, z) < 1) return LAKE_Y;
  if (u < LAKE_U0 + 6 && Math.abs(z - s) < streamHalf(u)) return u < DAM_U ? WATER_Y : LAKE_Y; // 西边一段小溪，过了石坝就是湖
  return null;
}

/** 落差侧面：坡上的坎子是黄土坎（不是砌的）；青石崖是一层层夹着煤线的青石。 */
function sideMat(M) {
  return (type, drop, x, z) => {
    if (type === 'stone') return quay(x - OX, z) ? M.rubble : M.coalRock; // 湖边是毛石驳岸；青石崖夹着煤线
    if (type === 'path' || type === 'pad') return null;
    if (drop >= 0.6) return M.bankWall;
    return null;
  };
}

// ---------------------------------------------------------------- 路网

const ROAD = {
  west: [-44.7, 27], g1: [-36, 24], tmp: [-23, 22], lw: [-12, 22], pS: [3, 17.5], lkN: [6, 19.5], ford: [19, 16.5], pastG: [27, 20], eR: [36, 15.5], // 从村东口过来：顺着溪边绕过山嘴，沿湖北岸往东（在沟口过一道土埂）
  duckG: [-30, 31.5], // 下到湖西头的鸭棚
  c1: [-29, 12], // 上坡去老街
  st0: [-37, 3.2], st1: [-28.5, 1], st1b: [-19, 3.5], st2: [-7.5, 0.5], stM: [3.5, 2], st3: [10.5, -1], st4: [21, -1], st5: [30, -2.5], // 老街：顺着坡弯弯扭扭
  ln0: [-29, -11], ln1: [-21, -9.5], ln2: [-7.5, -12.5], ln2b: [8, -11.2], ln3: [17, -13], ln3b: [21, -12.5], // 上坡的小路
  pgate: [-36, -8.6], pastIn: [-36, -11.4], // 西头的草场（栅栏南边留的口子进去）
  mineF: [35, -3.4], up1: [8, -21], shedF: [14, -20.5], up2: [8, -27], gateN: [12, -29.5], // 煤窑、山货棚、进山口
  apF: [16.5, -13.3],
};
const EDGES = [
  ['west', 'g1'], ['g1', 'tmp'], ['tmp', 'lw'], ['lw', 'pS'], ['pS', 'lkN'], ['ford', 'pastG'], ['pastG', 'eR'], ['ln3', 'apF'],
  ['g1', 'duckG'],
  ['g1', 'c1'], ['c1', 'st1'], ['pS', 'stM'], ['ford', 'st4'],
  ['st0', 'st1'], ['st1', 'st1b'], ['st1b', 'st2'], ['st2', 'stM'], ['stM', 'st3'], ['st3', 'st4'], ['st4', 'st5'], ['st5', 'mineF'],
  ['st1', 'ln0'], ['st2', 'ln2'],
  ['ln0', 'ln1'], ['ln1', 'ln2'], ['ln2', 'ln2b'], ['ln2b', 'ln3'], ['ln3', 'ln3b'],
  ['ln0', 'pgate'], ['pgate', 'pastIn'],
  ['ln2b', 'up1'], ['up1', 'shedF'], ['up1', 'up2'], ['up2', 'gateN'],
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
function ruinHouse(M, { w = 5.2, d = 4, h = 2.8, state = 0, seed = 1, mat = 'adobe', roof = null, lit = false, chimney = true }) {
  const rand = makeRng(seed);
  const roofMat = roof ?? (mat === 'rubble' ? 'slate' : 'thatch'); // 石头房盖石板，土坯房、木板房苫草；好人家瓦顶
  if (state >= 2) { // 囫囵的：有人住才点灯
    const hs = house(M, { w, d, h, wall: mat, rise: 1.3, roofMat, chimney, lit, front: [{ k: 'door', x: -w / 5 }, { k: lit ? 'windowLit' : 'window', x: w / 5, y: 1.0 }] });
    hs.object.userData.windows = hs.windows; // 亮灯的窗户（夜里窗前放光晕）
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
 * 一处老宅：按 kind 搭——正房（连着的那间、厢房）、院子（院墙 / 矮石墙 / 篱笆 / 石板场子 / 窑院）、牲口圈、院里的东西、树。原点在宅基地中心。
 * 每处自己一个随机数种子：有人住进来时整处重搭（点上灯），别的东西不挪窝。state < 2（旧存档）还是塌了的样子。
 */
function ruinPlot(M, spec) {
  const g = new THREE.Group();
  const { w, d, kind } = spec, s = spec.state, rand = makeRng(1000 + HOUSES.indexOf(spec) * 97), L = plotLayout(spec), lit = !!spec.owner;
  const mat = spec.mat ?? (kind === 'stone' ? 'rubble' : kind === 'wood' ? 'wood' : 'adobe');
  if (kind === 'cave') g.add(caveFace(M, spec, rand));
  else {
    const [hw, hd, hh] = spec.house;
    const hs = ruinHouse(M, { w: hw, d: hd, h: hh, state: s, seed: 300 + spec.u * 7 + spec.z, mat, roof: spec.roof, lit });
    hs.position.set(L.hx, 0, L.hz);
    g.add(hs);
    if (spec.annex) { // 连着正房的那一间（共一道山墙），矮一点、草顶
      const [aw, ad, ah] = spec.annex;
      const an = ruinHouse(M, { w: aw, d: ad, h: ah, state: s, seed: 400 + spec.u, mat, roof: spec.roof, lit, chimney: false }); // 和正房一样的料
      an.position.set(L.hx - hw / 2 - aw / 2 + 0.02, 0, L.hz);
      g.add(an);
    }
  }
  if (spec.wing) { // 东厢房：小一点，在正房东边
    const wing = ruinHouse(M, { w: 2.6, d: 2.4, h: 2.3, state: s, seed: 500 + spec.u * 3, mat, roof: spec.roof, lit, chimney: false });
    wing.position.set(w / 2 - 2.1, 0, L.hz + 0.2);
    g.add(wing);
  }
  // 院子：前墙在院门那儿留口；塌了的（旧存档）缺几段
  const gapAt = (L.gx + w / 2) / w;
  const run = (x0, z0, x1, z1, gap, h, wm, t, cap) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.0));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
      if (gap !== null && Math.abs(tm - gap) < 0.7 / len + 0.05) continue; // 院门的口
      const fallen = rand() < 0.3, low = 0.45 + rand() * 0.55; // 每段都掷一样多的骰子
      if (s < 2 && fallen) continue;
      g.add(wallSeg(M, x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1, { h: s >= 2 ? h : h * low, mat: wm, t, cap: s >= 2 && cap }));
    }
  };
  const ring = (h, wm, t, cap) => { run(-w / 2, -d / 2, w / 2, -d / 2, null, h, wm, t, cap); run(-w / 2, -d / 2, -w / 2, d / 2, null, h, wm, t, cap); run(w / 2, -d / 2, w / 2, d / 2, null, h, wm, t, cap); run(-w / 2, d / 2, w / 2, d / 2, gapAt, h, wm, t, cap); };
  if (kind === 'court') {
    ring(1.15, mat === 'brick' ? 'brick' : mat === 'rubble' ? 'rubble' : 'adobe', 0.35, true); // 齐胸高的院墙：院里看得见
    for (const sx of [-1, 1]) g.add(block(L.gx + sx * 1.15 - 0.25, 0, d / 2 - 0.45, L.gx + sx * 1.15 + 0.25, 2.3, d / 2 + 0.1, M.brick)); // 门楼两根砖垛
    g.add(block(L.gx - 1.45, 2.3, d / 2 - 0.55, L.gx + 1.45, 2.5, d / 2 + 0.2, M.roof)); // 门楼顶
  } else if (kind === 'stone') ring(1.0, 'rubble', 0.5, false);
  else if (kind === 'fence' || kind === 'wood') {
    const gx0 = L.gx - 0.6, gx1 = L.gx + 0.6, broken = s < 2;
    wattle(M, g, -w / 2, -d / 2, w / 2, -d / 2, rand, broken); wattle(M, g, -w / 2, -d / 2, -w / 2, d / 2, rand, broken); wattle(M, g, w / 2, -d / 2, w / 2, d / 2, rand, broken);
    wattle(M, g, -w / 2, d / 2, gx0, d / 2, rand, broken); wattle(M, g, gx1, d / 2, w / 2, d / 2, rand, broken);
  } else if (kind === 'row') { // 铺面：两边矮墙，门前石板场子敞着对着老街，摆一张卖东西的条桌
    run(-w / 2, -d / 2, -w / 2, d / 2, null, 1.0, 'adobe', 0.35, true); run(w / 2, -d / 2, w / 2, d / 2, null, 1.0, 'adobe', 0.35, true);
    for (let x = -w / 2 + 0.6; x < w / 2 - 0.5; x += 1.3) for (let z = L.front + 0.35; z < d / 2 - 0.3; z += 1.1) g.add(block(x, 0, z, x + 1.2, 0.05, z + 1.0, M.paving ?? M.stone, { outline: false }));
    g.add(block(L.hx - 1.0, 0, L.front + 0.5, L.hx + 0.6, 0.8, L.front + 1.0, M.wood)); // 条桌
  } else if (kind === 'cave') { // 窑院：前面一道矮土墙
    run(-w / 2, d / 2, w / 2, d / 2, gapAt, 1.0, 'adobe', 0.35, true);
    run(-w / 2, -d / 2 + 1.5, -w / 2, d / 2, null, 1.0, 'adobe', 0.35, true);
  }
  // 牲口圈：院子前面靠西的角上（好人家牛棚：栅栏 + 草棚 + 料槽；猪圈；鸡窝）
  const px0 = -w / 2 + 0.3, px1 = px0 + PEN.w, pz1 = d / 2 - 0.3, pz0 = pz1 - PEN.d;
  if (spec.pen === 'cow') {
    g.add(P.fence(M, px0, pz0, px1, pz1, { h: 1.0 }));
    g.add(block(px0 - 0.1, 1.6, pz0 - 0.1, px1 + 0.1, 1.75, pz0 + 1.1, M.thatch)); // 草棚顶
    for (const x of [px0 + 0.1, px1 - 0.1]) g.add(block(x - 0.08, 0, pz0 + 0.95, x + 0.08, 1.6, pz0 + 1.1, M.wood));
    g.add(P.trough(M, (px0 + px1) / 2, pz0 + 0.5));
    g.add(P.haystack(M, px1 - 0.6, pz1 - 0.6, 0.45, 0.9));
  } else if (spec.pen === 'pig') g.add(P.pigsty(M, px0, pz0, px1, pz1, { gate: [px1 - 1.2, px1 - 0.4] }));
  else if (spec.pen === 'coop') g.add(P.coop(M, px0 + 1.0, pz0 + 1.2));
  // 院里：水缸、柴垛、树
  const yz = Math.min(d / 2 - 1.0, L.front + 1.2);
  if (s < 2) rubbleHeap(M, g, -w / 2 + 1.2, yz, 0.9, rand, M[mat === 'wood' ? 'rubble' : mat === 'brick' ? 'adobe' : mat]);
  else if (kind !== 'row' && kind !== 'cave') {
    g.add(P.vat(M, w / 2 - 0.9, -d / 2 + 0.8));
    if (!spec.pen && !spec.extra) g.add(P.firewood(M, -w / 2 + 1.3, yz + 0.2, 1.4));
  }
  if (spec.extra === 'mill') { // 冲到门外的磨盘：一扇斜靠在墙根，一扇平躺在地上
    for (const [x, z, a] of [[w / 2 + 0.9, 0.2, 0.9], [w / 2 + 1.0, -1.6, 0]]) { const m = prism(0.62, 0.62, 0.22, M.stone, 12); m.position.set(x, a ? 0.55 : 0.11, z); m.rotation.z = a; m.userData.tilted = a > 0; g.add(m); }
  }
  if (spec.extra === 'forge') { // 院里的铁匠炉：砖炉膛、一块铁砧、一地炉渣
    g.add(block(-w / 2 + 0.4, 0, yz - 0.5, -w / 2 + 1.5, 1.0, yz + 0.5, M.brick));
    g.add(block(-w / 2 + 2.0, 0, yz - 0.2, -w / 2 + 2.5, 0.5, yz + 0.2, M.iron), block(-w / 2 + 1.85, 0.5, yz - 0.25, -w / 2 + 2.65, 0.62, yz + 0.25, M.iron));
    g.add(block(-w / 2 + 0.4, 0, yz + 0.6, -w / 2 + 1.6, 0.06, yz + 1.1, M.ink, { outline: false }));
  }
  if (spec.extra === 'lumber') g.add(P.lumber(M, -w / 2 + 1.6, yz + 0.3)); // 木匠没用完的木料
  if (spec.extra === 'pen') { // 窑前的石头羊圈
    const x0 = w / 2 - 3.2, x1 = w / 2 - 0.3, z0 = -d / 2 + 2.0, z1 = d / 2 - 0.3;
    for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x0, z1], [x1, z1]], [[x0, z0], [x0, z1 - 1.0]]]) g.add(wallSeg(M, a[0], a[1], b[0], b[1], { h: 0.8, mat: 'rubble', t: 0.45, cap: false })); // 羊从院里那边的口子进出
    if (s >= 2) {
      for (const x of [x0 + 0.35, x1 - 0.35]) g.add(block(x - 0.07, 0, z0 + 1.15, x + 0.07, 1.35, z0 + 1.29, M.wood)); // 靠着后墙的草棚：两根柱子
      g.add(block(x0 + 0.2, 1.35, z0 + 0.1, x1 - 0.2, 1.5, z0 + 1.45, M.thatch));
      g.add(block(x0 + 0.5, 0, z1 - 0.8, x0 + 1.7, 0.35, z1 - 0.4, M.stone)); // 石槽
      g.add(P.haystack(M, x1 - 0.7, z0 + 0.7, 0.4, 0.8)); // 棚下一小垛干草
    }
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
  shrine.object.position.set(-4.2, 0, -1.2);
  tag(shrine.object, 'riverTemple');
  g.add(shrine.object);
  const hut = house(M, { w: 4.2, d: 3.4, h: 2.6, wall: 'adobe', rise: 1.1, roofMat: 'thatch', chimney: true, front: [{ k: 'door', x: -0.8 }, { k: 'windowLit', x: 0.9, y: 1.0 }] });
  hut.object.position.set(4.0, 0, -1.2); // 柳婆婆的小屋在东头，和庙隔开一段
  g.add(hut.object);
  const stele = new THREE.Group(); // 水则碑：一块石碑，碑身上一道红漆横线
  stele.add(block(-0.45, 0, -0.18, 0.45, 0.25, 0.18, M.stone), block(-0.32, 0.25, -0.09, 0.32, 1.6, 0.09, M.stone), block(-0.33, 1.05, -0.1, 0.33, 1.11, 0.1, M.redCloth, { outline: false }));
  stele.position.set(-4.2, 0, 1.9);
  g.add(tag(stele, 'floodStele'));
  const burner = prism(0.2, 0.15, 0.28, M.iron, 6);
  burner.position.set(-4.2, 0.14, 0.9);
  g.add(burner);
  return { object: g, home: hut, burner: new THREE.Vector3(-4.2, 0.5, 0.9) };
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

/** 石潭边的亭子：石头台基、四根红柱、四角攒尖的瓦顶，三面坐凳栏杆，朝南敞着看潭。原点在台基中心。 */
function pavilion(M) {
  const g = new THREE.Group();
  g.add(block(-1.6, 0, -1.6, 1.6, 0.35, 1.6, M.stone));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(sx * 1.3 - 0.12, 0.35, sz * 1.3 - 0.12, sx * 1.3 + 0.12, 2.6, sz * 1.3 + 0.12, M.redwood));
  for (const [x0, z0, x1, z1] of [[-1.3, -1.3, 1.3, -1.2], [-1.3, -1.3, -1.2, 1.3], [1.2, -1.3, 1.3, 1.3]]) g.add(block(x0, 0.35, z0, x1, 0.8, z1, M.wood)); // 坐凳栏杆
  g.add(block(-1.55, 2.6, -1.55, 1.55, 2.75, 1.55, M.redwood));
  const roof = prism(0.1, 2.3, 1.2, M.roof, 4); // 四角攒尖顶
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.35;
  g.add(roof, block(-0.12, 3.9, -0.12, 0.12, 4.25, 0.12, M.ridge));
  return tag(g, 'pavilion');
}

/** 一丛竹子：五六根竹竿（一节一节的），上半截一簇簇竹叶往外披。体素边长 0.12 米。 */
function bambooGeo(seed) {
  const r = makeRng(seed), vox = new Map();
  const put = (x, y, z, c) => vox.set(`${x},${y},${z}`, c);
  for (let k = 0; k < 6; k++) {
    const bx = Math.round((r() - 0.5) * 8), bz = Math.round((r() - 0.5) * 8), H = 28 + Math.floor(r() * 14), lean = (r() - 0.5) * 0.12;
    for (let y = 0; y < H; y++) { const x = bx + Math.round(lean * y); put(x, y, bz, y % 6 === 5 ? R.grass[1] : y > H * 0.6 ? R.leaf[3] : R.leaf[2]); } // 竹节深一点
    for (let n = 0; n < 5; n++) { // 叶子：竿子上半截往外披的一簇簇
      const y0 = Math.floor(H * (0.45 + r() * 0.5)), dir = r() * Math.PI * 2, cx = bx + Math.round(lean * y0);
      for (let i = 1; i < 7; i++) { const x = cx + Math.round(Math.cos(dir) * i), z = bz + Math.round(Math.sin(dir) * i), y = y0 - Math.floor(i / 2); put(x, y, z, i % 2 ? R.leaf[4] : R.leaf[3]); put(x, y - 1, z, R.leaf[3]); if (i > 2) put(x + (i % 2), y, z + 1 - (i % 2), R.leaf[4]); }
    }
  }
  const solid = (x, y, z) => vox.has(`${x},${y},${z}`), color = (x, y, z) => vox.get(`${x},${y},${z}`);
  return voxelGeometry([-12, 0, -12], [13, 46, 13], solid, color, 0.12, [-0.06, 0, -0.06]);
}

/** 一丛芦苇（湖边浅水里）：一根根细秆、几片斜出去的叶子，夏天青、秋天黄（顶上白芦花）、冬天枯黄，春天才冒出半截。voxel 边长 0.08 米。 */
function reedGeo(seed) {
  const r = makeRng(seed), vox = new Map();
  const put = (x, y, z, c) => vox.set(`${x},${y},${z}`, c);
  const sea = is('winter') ? 'winter' : is('autumn') ? 'autumn' : is('spring') ? 'spring' : 'summer';
  const stem = { spring: [R.grass[2], R.grass[3]], summer: [R.leaf[2], R.leaf[3]], autumn: [R.wheat[2], R.harvest[2]], winter: [R.wheat[1], R.wheat[2]] }[sea];
  const plume = { spring: null, summer: R.wheat[3], autumn: R.white[2], winter: R.wheat[3] }[sea];
  const tall = sea === 'spring' ? 0.55 : 1;
  for (let k = 0; k < 9; k++) {
    const bx = Math.round((r() - 0.5) * 7), bz = Math.round((r() - 0.5) * 7), H = Math.round((14 + r() * 10) * tall), lean = (r() - 0.5) * 0.25;
    for (let y = 0; y < H; y++) put(bx + Math.round(lean * y), y, bz, y > H * 0.5 ? stem[1] : stem[0]);
    if (plume) for (let y = H; y < H + 3; y++) { const x = bx + Math.round(lean * y); put(x, y, bz, plume); put(x + 1, y - 1, bz, plume); } // 芦花
    const ly = Math.floor(H * 0.4), dir = r() < 0.5 ? 1 : -1; // 一片斜出去的叶子
    for (let i = 1; i < 4; i++) put(bx + Math.round(lean * ly) + dir * i, ly + i, bz, stem[0]);
  }
  const solid = (x, y, z) => vox.has(`${x},${y},${z}`), color = (x, y, z) => vox.get(`${x},${y},${z}`);
  return voxelGeometry([-9, 0, -9], [10, 30, 10], solid, color, 0.08, [-0.04, 0, -0.04]);
}

/**
 * 湖水的材质（除了冬天）：按离岸远近分四档颜色（岸边浅、发青，越往湖心越深越蓝），斜着看映出天色；
 * 一道道短横的波纹慢慢漂、忽明忽暗，岸边一圈碎浪花，白天偶尔闪一下阳光，夜里波纹映着月光。
 * 都按一米 18 像素的格子算（和地上的贴图一样大的像素），不用后处理。shore：离岸远近的贴图（0 岸边 … 1 离岸 6 米以上）。
 */
function lakeWaterMaterial(M, shore, box) {
  const mat = new THREE.MeshToonMaterial({ map: M.water.map, gradientMap: M.water.gradientMap });
  const uniforms = { uTime: { value: 0 }, uShore: { value: shore }, uBox: { value: new THREE.Vector4(...box) }, uSky: { value: new THREE.Color('#b4c8f0') }, uNight: { value: 0 } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vLp;\nvarying vec3 vWp;\nvarying float vUp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLp = position; vUp = normal.y; vWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTime;\nuniform float uNight;\nuniform sampler2D uShore;\nuniform vec4 uBox;\nuniform vec3 uSky;\nvarying vec3 vLp;\nvarying vec3 vWp;\nvarying float vUp;\nfloat wHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
  float wGlint = 0.0;
  {
    vec2 px = floor(vLp.xz * 18.0);
    float dep = texture2D(uShore, (vLp.xz - uBox.xy) / (uBox.zw - uBox.xy)).r;
    float band = floor(min(dep, 0.999) * 4.0);
    vec3 col = band < 0.5 ? vec3(0.25, 0.46, 0.44) : band < 1.5 ? vec3(0.17, 0.37, 0.44) : band < 2.5 ? vec3(0.12, 0.29, 0.41) : vec3(0.09, 0.22, 0.36);
    float f = 1.0 - clamp(normalize(cameraPosition - vWp).y, 0.0, 1.0);
    col = mix(col, uSky * 0.55, 0.05 + 0.3 * f * f);
    float row = floor(px.y / 4.0), dir = mod(row, 2.0) * 2.0 - 1.0;
    float qx = px.x + floor(uTime * 1.5 + row * 3.7) * dir;
    vec2 cell = floor(vec2(qx / 7.0, row));
    float h = wHash(cell);
    float lx = mod(qx, 7.0), ly = mod(px.y, 4.0), len = 2.0 + floor(h * 4.0);
    float on = step(h, mix(0.3, 0.14, dep)) * step(0.15, sin(uTime * 1.1 + h * 40.0));
    if (on > 0.5 && ly < 0.5 && lx < len) { col = mix(col, uSky * 0.35 + vec3(0.32, 0.42, 0.46), 0.55); wGlint = 1.0; }
    else if (on > 0.5 && ly < 1.5 && lx < len) col *= 0.9;
    if (dep < 0.08 && wHash(px + floor(uTime * 2.0)) > 0.55) { col = mix(col, vec3(0.62, 0.72, 0.70), 0.6); wGlint = 0.3; }
    if (dep > 0.2 && wHash(px * 1.31 + floor(uTime * 4.0)) > 0.9985) col = mix(col, vec3(0.95), 1.0 - uNight);
    if (vUp < 0.5) col = vec3(0.12, 0.28, 0.40);
    diffuseColor.rgb = col;
  }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(0.3, 0.38, 0.5) * wGlint * uNight * 0.35;');
  };
  mat.customProgramCacheKey = () => 'east-lake';
  return mat;
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

/** 导航用的老宅轮廓：院墙 / 篱笆一整圈（院门那儿留口；铺面前头敞着）+ 房子的地盘 + 牲口圈。人都只走院门、不进屋（有人住进来不用重算导航）。 */
function plotNavShape(spec) {
  const { w, d, kind } = spec, L = plotLayout(spec), out = [];
  const box3 = (x0, z0, x1, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0)); m.position.set((x0 + x1) / 2, 0.5, (z0 + z1) / 2); return m; };
  const t = 0.2, gx = L.gx;
  if (kind !== 'cave') out.push(box3(-w / 2 - t, -d / 2 - t, -w / 2 + t, d / 2 + t), box3(w / 2 - t, -d / 2 - t, w / 2 + t, d / 2 + t));
  if (kind === 'court' || kind === 'stone' || kind === 'fence' || kind === 'wood') out.push(box3(-w / 2, -d / 2 - t, w / 2, -d / 2 + t));
  if (kind !== 'row') { out.push(box3(-w / 2, d / 2 - t, gx - 0.65, d / 2 + t), box3(gx + 0.65, d / 2 - t, w / 2, d / 2 + t)); }
  if (kind === 'cave') out.push(box3(-w / 2, -d / 2 - 1.6, w / 2, L.front - 0.1), box3(-w / 2 - t, L.front, -w / 2 + t, d / 2));
  else out.push(box3(L.hx - L.hw / 2 - L.aw - 0.2, L.hz - L.hd / 2 - 0.2, L.hx + L.hw / 2 + 0.2, L.hz + L.hd / 2 + 0.2)); // 正房（连着那间）
  if (spec.wing) out.push(box3(w / 2 - 3.6, L.hz + 0.2 - 1.4, w / 2 - 0.6, L.hz + 0.2 + 1.4));
  if (spec.pen) out.push(box3(-w / 2, d / 2 - 0.3 - PEN.d - 0.2, -w / 2 + 0.3 + PEN.w + 0.2, d / 2));
  if (spec.extra === 'pen') { const x0 = w / 2 - 3.2, x1 = w / 2 - 0.3, z0 = -d / 2 + 2.0, z1 = d / 2 - 0.3; out.push(box3(x0 - 0.25, z0 - 0.25, x1 + 0.25, z0 + 0.25), box3(x1 - 0.25, z0, x1 + 0.25, z1 + 0.25), box3(x0 - 0.25, z1 - 0.25, x1, z1 + 0.25), box3(x0 - 0.25, z0, x0 + 0.25, z1 - 1.0)); } // 羊圈只挡墙，圈里羊走得动
  if (spec.extra === 'mill') out.push(box3(w / 2 + 0.2, -2.3, w / 2 + 1.7, 0.9));
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

/** 山货场（进山口下面）：晾山货的木架、地上的竹匾，拖下山的原木、木工台、劈柴墩，一排背篓、一副背架。原点在场子中心（8 × 5），+z 朝南。 */
function gatherShed(M) {
  const g = new THREE.Group();
  g.add(P.herbRacks(M, -2.1, -1.3, 2)); // 晾山货的木架：蘑菇、山楂、核桃（x -3.8 … -0.4）
  const fills = is('autumn') ? [M.persimmonMat ?? M.corn, M.hawthornMat ?? M.corn] : [M.millet ?? M.corn, M.wheat];
  fills.forEach((fill, i) => g.add(P.dryingMat(M, fill, 1.0, 1.3).translateX(-3.0 + i * 1.2).translateZ(1.4))); // 地上晒的竹匾
  g.add(P.lumber(M, 2.0, -1.6)); // 从山上拖下来的原木（x 0.3 … 3.7，z -2.3 … -0.2）
  g.add(P.workbench(M, 2.2, 1.4)); // 破板子、做背架的木工台
  g.add(block(-0.1, 0, 0.3, 0.5, 0.55, 0.9, M.wood)); // 劈柴的木墩，上面斜插一把斧子
  g.add(block(0.15, 0.55, 0.55, 0.25, 0.95, 0.65, M.wood), block(0.0, 0.85, 0.5, 0.4, 1.0, 0.7, M.iron));
  for (let i = 0; i < 3; i++) g.add(block(-1.0 + i * 0.55, 0, 1.65, -0.6 + i * 0.55, 0.8, 2.05, M.wheat)); // 一排背篓（上山背山货）
  g.add(block(-0.2, 0, -2.3, -0.05, 1.6, -2.15, M.wood), block(0.2, 0, -2.3, 0.35, 1.6, -2.15, M.wood), block(-0.2, 1.1, -2.3, 0.35, 1.2, -2.15, M.wood)); // 靠着的背架
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

// ---------------------------------------------------------------- 搭老村址

/**
 * M：村子的材质（共用）。返回 { object, terrain, nodes, things, placeAt, whereAt, work, houses, plots, homes, animals, blockNav, update, … }。
 */
export function buildEast(M) {
  addEastMaterials(M);
  for (const p of HOUSES) p.state = RUINS ? RUIN_STATE[p.id] ?? 0 : 2;
  const root = new THREE.Group();
  root.scale.setScalar(UNIT);
  const rand = makeRng(717);

  // 1. 路网节点跟着地面；各行当的地方（戏台、煤窑口……）的平台取中心的坡高（平台挖进坡里，和村子的 padLevel 一样）
  const lvl = (u, z) => Math.max(0.6, q(slope(u, z), 0.6));
  const pads = [];
  const pad = (u, z, w, d, rot = 0, level = lvl(u, z)) => { pads.push({ x: W(u), z, rot: (rot * Math.PI) / 180, w, d, level }); return level; };
  for (const s of [MINE, SHED, MGATE, ANCESTRAL]) s.level = pad(s.u, s.z, s.w, s.d);
  APIARY.level = pad(APIARY.u, APIARY.z, APIARY.w, APIARY.d, 0, q(natural(W(ROAD.ln3[0]), ROAD.ln3[1]).h, 0.3)); // 蜂场和门口的小路一样高
  for (const r of [THRESH, GRAVE]) r.level = pad(r.u, r.z, r.w, r.d);
  const nodes = {};
  for (const [name, [u, z]] of Object.entries(ROAD)) nodes[name] = { x: W(u), z, h: q(natural(W(u), z).h, 0.3) };
  nodes.west.h = Math.round(rawHeight(nodes.west.x, nodes.west.z) / 0.3) * 0.3; // 和村子那头的路口（layout.js 的 eastGate）一样算：接缝两边路面一样高
  const onPadLevel = { mineF: MINE, shedF: SHED, gateN: MGATE, apF: APIARY };
  for (const [k, s] of Object.entries(onPadLevel)) nodes[k].h = s.level;
  nodes.pastIn.h = nodes.pgate.h = terrace((PASTURE.u0 + PASTURE.u1) / 2, (PASTURE.z0 + PASTURE.z1) / 2); // 草场门口和草场一样高（小路从上坡的小路爬过去）

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
    const [x0, z0] = at(gx, free ? d / 2 + 0.2 : d / 2 - 0.3), hg = Math.round((level + ((jh - level) * 1.7) / run) / 0.3) * 0.3;
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
  const terrain = buildTerrain(M, { pads, nodes, edges, aprons, bounds: EAST_BOUNDS, natural, water, farm: farmAt, sideMat: sideMat(M), cropMats: [M.stubbleW, M.furrow, M.furrow, M.sprout] });
  root.add(terrain.object);
  let lakeMat = null;
  if (!is('winter')) { // 冬天湖面结冰：用村里那张冰面贴图
    const N = [Math.round((EAST_BOUNDS.x1 - EAST_BOUNDS.x0) / CELL_E), Math.round((EAST_BOUNDS.z1 - EAST_BOUNDS.z0) / CELL_E)], dist = new Float32Array(N[0] * N[1]).fill(1e9), q0 = [];
    for (let j = 0; j < N[1]; j++) for (let i = 0; i < N[0]; i++) { const x = EAST_BOUNDS.x0 + (i + 0.5) * CELL_E, z = EAST_BOUNDS.z0 + (j + 0.5) * CELL_E; if (!terrain.isWater(x, z)) { dist[j * N[0] + i] = 0; q0.push(j * N[0] + i); } }
    for (let pass = 0; pass < 2; pass++) for (let j0 = 0; j0 < N[1]; j0++) for (let i0 = 0; i0 < N[0]; i0++) { // 两遍倒角距离（够用）
      const i = pass ? N[0] - 1 - i0 : i0, j = pass ? N[1] - 1 - j0 : j0, k = j * N[0] + i, sgn = pass ? 1 : -1;
      for (const [di, dj, w] of [[sgn, 0, 1], [0, sgn, 1], [sgn, sgn, 1.41], [-sgn, sgn, 1.41]]) { const ni = i + di, nj = j + dj; if (ni >= 0 && nj >= 0 && ni < N[0] && nj < N[1]) dist[k] = Math.min(dist[k], dist[nj * N[0] + ni] + w); }
    }
    const data = new Uint8Array(N[0] * N[1]);
    for (let k = 0; k < data.length; k++) data[k] = Math.min(255, Math.round((dist[k] * CELL_E / 6) * 255));
    const shore = new THREE.DataTexture(data, N[0], N[1], THREE.RedFormat);
    shore.magFilter = shore.minFilter = THREE.LinearFilter;
    shore.needsUpdate = true;
    lakeMat = lakeWaterMaterial(M, shore, [EAST_BOUNDS.x0, EAST_BOUNDS.z0, EAST_BOUNDS.x1, EAST_BOUNDS.z1]);
    terrain.object.traverse((o) => { if (o.material === M.water) o.material = lakeMat; });
  }

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
  const roller = P.roller(M, 0, 0); // 大水冲进沟底的石碾（碾框早烂了）
  roller.position.set(W(13), terrain.heightAt(W(13), 13.6), 13.6);
  roller.rotation.set(0.25, 0.6, 0);
  roller.userData.tilted = true;
  root.add(roller);
  at(MINE, coalMine(M));
  at(MGATE, mountainGate(M));
  at(SHED, gatherShed(M));
  at(APIARY, apiary(M));
  at(ANCESTRAL, ancestralRuin(M));
  { // 场院：两座谷草垛、碌碡、一堆谷子、晒粮的席子、扬场的簸箕、几袋粮
    const g = new THREE.Group();
    g.add(P.haystack(M, -3.6, -1.2, 1.3, 2.7), P.haystack(M, -1.0, -1.6, 1.1, 2.3), P.roller(M, 1.6, 0.4));
    g.add(P.grainHeap(M, M.millet ?? M.corn, 1.1, 0.7).translateX(3.6).translateZ(-1.0), P.dryingMat(M, M.corn, 2.4, 1.6).translateX(-1.6).translateZ(1.4), P.winnower(M).translateX(3.4).translateZ(1.2), P.sacks(M, 3).translateX(4.2).translateZ(-2.2));
    at(THRESH, tag(g, 'oldThresh'));
  }
  at(GRAVE, tag(P.graves(M, is('spring')), 'oldGraves'));
  for (const gd of GARDENS) { // 菜园：一圈篱笆，地头一个稻草人、一口水缸
    const lv = terrain.heightAt(W(gd.u), gd.z), f = P.fence(M, W(gd.u - gd.w / 2), gd.z - gd.d / 2, W(gd.u + gd.w / 2), gd.z + gd.d / 2, { h: 0.8, gap: [0.4, 0.62] });
    f.position.y = lv;
    root.add(tag(f, 'veggie'));
    if (is('summer', 'autumn')) root.add(P.scarecrow(M, W(gd.u + gd.w / 2 - 0.8), gd.z - gd.d / 2 + 0.8, 0.4).translateY(lv)); // 稻草人：庄稼、菜快熟的时候
  }
  // 土拱桥：老街（ford—st4）从沟上过，路面下是一道垫起来的土埂；两面各砌一个黄土拱券，看着像一座土拱桥
  {
    const A = nodes.ford, B = nodes.st4, t0 = (() => { let best = { d: 9, t: 0.5 }; for (let t = 0; t <= 1; t += 0.01) { const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t, d = toLine(x - OX, z, OLDBED); if (d < best.d) best = { d, t }; } return best.t; })();
    const bx = A.x + (B.x - A.x) * t0, bz = A.z + (B.z - A.z) * t0, top = terrain.heightAt(bx, bz), floor = Math.max(0.6, slope(bx - OX, bz) - gullyDepth(bx - OX));
    const bridge = new THREE.Group(), span = OLDBED_HALF * 2 + 0.4, rise = Math.max(1.5, top - floor - 1.0);
    for (const side of [-1, 1]) {
      const z0 = side * 1.25;
      bridge.add(block(-span / 2, floor, z0 - 0.15, span / 2, top + 0.1, z0 + 0.15, M.loess)); // 拱脸
      for (let k = 0; k < 6; k++) { const w = (span - 1.0) * Math.sqrt(1 - (k / 6) ** 2); bridge.add(block(-w / 2, floor, z0 - 0.17, w / 2, floor + (rise * (k + 1)) / 6, z0 + 0.17, M.ink, { outline: false })); } // 拱洞（黑的）
      bridge.add(block(-span / 2 - 0.2, top, z0 - 0.2, span / 2 + 0.2, top + 0.7, z0 + 0.2, M.adobe)); // 桥栏：矮土墙
    }
    bridge.position.set(bx, 0, bz);
    bridge.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2;
    root.add(tag(bridge, 'earthBridge'));
  }
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
  place(P.well(M, 0, 0), near(nodes.stM.x + 2.6, nodes.stM.z + 2.4, 2.4, 2.4, 3)); // 老街当腰的老井
  for (const n of ['st1', 'stM', 'st4', 'ln2b']) place(tag(stoneTablet(M), 'oldTablet'), near(nodes[n].x - 1.6, nodes[n].z - 1.4, 0.8, 0.6, 2.5), nodes[n].x, nodes[n].z);
  const hp = (k, lx, lz) => [W(HOMES[k].u) + lx, HOMES[k].z + lz];
  place(P.firewood(M, 0, 0, 2.0), near(...hp('mason', -4.0, 2.6), 2.2, 0.8, 1.5));
  place(P.vat(M, 0, 0), near(...hp('riverTemple', 4.6, 1.2), 1, 1, 1.5));
  place(P.cornRack(M, 0, 0, 2.4), near(...hp('riverTemple', 4.4, -2.8), 2.6, 0.8, 2));
  place(P.haystack(M, 0, 0, 1.1, 2.2), near(...hp('duckYard', -4.6, 1.0), 2.4, 2.4, 2));
  place(P.haystack(M, 0, 0, 1.3, 2.6), near(W(PASTURE.u1 + 2.4), PASTURE.z0 + 2.5, 2.8, 2.8, 3));
  place(P.firewood(M, 0, 0, 1.6), near(...hp('limeKiln', -4.8, 1.0), 1.8, 0.8, 1.5));
  if (is('summer', 'autumn')) root.add(P.scarecrow(M, W(TRIAL.u0 + 3), (TRIAL.z0 + TRIAL.z1) / 2 + 0.5, 0.3).translateY(terrain.heightAt(W(0), -18)));
  if (is('winter')) for (const [k, dx] of [['riverTemple', 3.4], ['mason', -2.6], ['duckYard', 3.0], ['limeKiln', -3.2]]) { const h = HOMES[k], spot = near(W(h.u) + dx, h.z + h.d / 2 + 2.6, 1.2, 1.2, 2.5); if (spot) place(P.snowman(M, 0, 0), spot, W(h.u), h.z + h.d / 2 + 1); } // 冬天：孩子们在门外堆的雪人（脸朝院门）
  root.add(trialMarkers(M, terrain.heightAt(W(0), -18)));
  const pastureLevel = terrain.heightAt(W((PASTURE.u0 + PASTURE.u1) / 2), (PASTURE.z0 + PASTURE.z1) / 2);
  const fence = P.fence(M, W(PASTURE.u0 + 0.6), PASTURE.z0 + 0.6, W(PASTURE.u1 - 0.6), PASTURE.z1 - 0.6, { h: 1.0, gap: [0.48, 0.6] }); // 栅栏缩进草场里一点（边上是坎子），南边留口
  fence.position.y = pastureLevel;
  root.add(fence);
  root.add(P.trough(M, W(PASTURE.u1 - 3), PASTURE.z0 + 2).translateY(pastureLevel));
  root.add(brokenBridge(M, W(-32), sz(-32)));
  const drift = driftPile(M);
  drift.position.set(W(-26), 0.6, sz(-26) - streamHalf(-26) - 1.4);
  root.add(drift);
  { // 小石坝：溪水到湖西头漫过一排条石跌进湖里（条石中间留着过水的口子），两头毛石砌的坝肩
    const s0 = sz(DAM_U), half = streamHalf(DAM_U), xa = W(DAM_U - 1.0), xb = W(DAM_U - 0.35), dam = new THREE.Group();
    dam.add(block(xa, LAKE_Y - 0.6, s0 - half - 0.2, xb, WATER_Y - 0.08, s0 + half + 0.2, M.rubble, { outline: false })); // 坝身（水底下）
    for (let z = s0 - half + 0.05; z < s0 + half - 0.3; z += 0.85) dam.add(block(xa - 0.05, WATER_Y - 0.1, z, xb + 0.05, WATER_Y + 0.14, z + 0.55, M.stone)); // 一块块条石，中间的口子过水
    for (const sg of [-1, 1]) {
      const zi = s0 + sg * (half - 0.1), zo = s0 + sg * (half + 1.3), top = terrain.heightAt(W(DAM_U - 0.7), s0 + sg * (half + 0.9)) + 0.3;
      dam.add(block(W(DAM_U - 1.4), LAKE_Y - 0.6, Math.min(zi, zo), W(DAM_U + 0.1), top, Math.max(zi, zo), M.rubble)); // 坝肩
    }
    root.add(tag(dam, 'smallDam'));
  }
  for (const u of [6, 24]) { // 湖边两处洗衣裳、挑水的石头码头：从岸沿一级级下到水里
    const z0 = shoreZ(u) - 0.2, st = new THREE.Group();
    for (let k = 0; k < 4; k++) st.add(block(W(u) - 0.7, LAKE_Y - 0.5, z0 + k * 0.4, W(u) + 0.7, 0.6 - (k + 1) * 0.42, z0 + (k + 1) * 0.4, M.stone));
    root.add(tag(st, 'lakeSteps'));
  }
  const lakeBox = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 16), new THREE.MeshBasicMaterial({ visible: false })); // 点湖看卡片
  lakeBox.position.set(W(27), LAKE_Y, 33);
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
  const oldWillow = plant('willow', W(-18), 25, 21, 1.45); // 湖西头岸上
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
  const bamboos = []; // 潭边的竹子
  const pick = (w) => { let r = rand(); for (const [k, p] of w) if ((r -= p) < 0) return k; return w[0][0]; };
  for (let x = EAST_BOUNDS.x0 + 1; x < EAST_BOUNDS.x1 - 1; x += 2.1) for (let z = EAST_BOUNDS.z0 + 1; z < EAST_BOUNDS.z1 - 1; z += 2.1) {
    const px = x + (rand() - 0.5) * 1.5, pz = z + (rand() - 0.5) * 1.5, u = px - OX, type = terrain.typeAt(px, pz);
    if (pathNear(px, pz, 1.4) || wet(px, pz) || onPad(px, pz) || decor.some(([dx, dz]) => Math.hypot(px - dx, pz - dz) < 2.2) || inRect(u, pz, { u0: PASTURE.u0 - 1, u1: PASTURE.u1 + 1, z0: PASTURE.z0 - 1, z1: PASTURE.z1 + 1 }) || Math.hypot(px - oldWillow.position.x, pz - oldWillow.position.z) < 3) continue;
    let kind = null;
    if (type === 'forest' && rand() < 0.85) {
      kind = pick([['pine', 0.4], ['oak', 0.35], ['locust', 0.15], ['bush', 0.1]]);
      if (kind !== 'bush') { tall.push([kind, px, pz, 1.35 + rand() * 0.55 + smooth(-27, -34, pz) * 0.3]); continue; } // 高大的林子
    } else if (type === 'stone' && lakeR(u, pz) > 1.6 && !quay(u, pz) && rand() < 0.12) kind = rand() < 0.6 ? 'pine' : 'bush'; // 石缝里的松树
    else if (type === 'grass' && toLine(u, pz, OLDBED) < OLDBED_HALF - 0.6 && rand() < 0.35) kind = 'willow'; // 沟底的柳树
    else if ((type === 'grass' || type === 'sand') && lakeR(u, pz) < 2.4 && lakeR(u, pz) > 1.4 && Math.sin(u * 0.25) > 0.2) { if (rand() < 0.7) bamboos.push([px, pz, 0.8 + rand() * 0.4]); continue; } // 湖西头、东头岸上两片竹林
    else if (type === 'grass' && lakeR(u, pz) < 2.2 && rand() < 0.35) kind = pick([['willow', 0.7], ['poplar', 0.3]]); // 湖边的柳树
    else if (type === 'grass' && toLine(u, pz, OLDBED) > OLDBED_HALF - 0.5 && toLine(u, pz, OLDBED) < OLDBED_HALF + 3.5 && rand() < 0.45) kind = pick([['willow', 0.3], ['poplar', 0.25], ['locust', 0.25], ['bush', 0.2]]); // 冲沟两岸崖边一溜树
    else if (type === 'grass' && pads.some((q2) => Math.abs(px - q2.x) < q2.w / 2 + 4.5 && Math.abs(pz - q2.z) < q2.d / 2 + 4.5) && rand() < 0.3) kind = pick([['locust', 0.28], ['jujube', 0.2], ['persimmon', 0.22], ['walnut', 0.12], ['cypress', 0.1], ['bush', 0.08]]); // 院前院后的树
    else if (type === 'field' && rand() < 0.02) kind = pick([['persimmon', 0.5], ['walnut', 0.3], ['jujube', 0.2]]); // 地头一棵棵老果树
    else if (type === 'grass' && pz < 14 && rand() < 0.25) kind = pick([['locust', 0.22], ['jujube', 0.18], ['persimmon', 0.2], ['walnut', 0.15], ['cypress', 0.1], ['bush', 0.15]]); // 坡上：老辈人栽的柿子树、核桃树、枣树，没人管也年年结果
    else if (type === 'gravel' && rand() < 0.04) kind = 'willow';
    else if (type === 'grass' && pz > sz(u) && rand() < 0.08) kind = rand() < 0.5 ? 'willow' : 'poplar'; // 溪南
    if (!kind) continue;
    groves[kind].push([px, pz, 0.8 + rand() * 0.35]);
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const x = W(ORCH.u - 3 + i * 3) + (rand() - 0.5) * 0.4, z = ORCH.z - 2 + j * 2.2; if (!terrain.isWater(x, z)) groves[(i + j) % 2 ? 'walnut' : 'persimmon'].push([x, z, 0.75 + rand() * 0.15]); } // 果园一行行
  const plotAt = (p, lx, lz) => { const a = (p.rot * Math.PI) / 180; return [W(p.u) + Math.cos(a) * lx + Math.sin(a) * lz, p.z - Math.sin(a) * lx + Math.cos(a) * lz]; };
  for (const p of HOUSES) if (p.tree) { const [x, z] = plotAt(p, -p.w / 2 + 1.1, p.d / 2 - 1.1); groves[p.tree].push([x, z, 0.85 + rand() * 0.2]); } // 院里长出来的树（墙角）
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  const flora = new THREE.Group();
  const treeTops = []; // 树梢（喜鹊落脚）
  const instance = (kind, seed, list) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(voxelTree(kind, seed, 1), M.voxel, list.length);
    mesh.geometry.computeBoundingBox();
    const top = mesh.geometry.boundingBox.max.y;
    list.forEach(([x, z, s], i) => { mesh.setMatrixAt(i, m4.compose(p3.set(x, terrain.heightAt(x, z), z), qt, sc.set(s, s, s))); trunks.push([x, z, kind === 'bush' ? 0.3 : 0.4 * Math.min(1.5, s)]); if (kind !== 'bush' && kind !== 'pine' && kind !== 'cypress') treeTops.push([x, terrain.heightAt(x, z) + top * s, z]); });
    mesh.castShadow = mesh.receiveShadow = true;
    flora.add(mesh);
  };
  for (const [kind, list] of Object.entries(groves)) for (let v = 0; v < 2; v++) instance(kind, 800 + v * 17 + kind.length, list.filter((_, i) => i % 2 === v));
  for (const kind of ['pine', 'oak', 'locust']) for (let v = 0; v < 2; v++) instance(kind, 900 + v * 13 + kind.length, tall.filter((t, i) => t[0] === kind && i % 2 === v).map(([, x, z, s]) => [x, z, s]));
  for (let v = 0; v < 3; v++) { // 竹子三种长法，轮着用
    const list = bamboos.filter((_, i) => i % 3 === v);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(bambooGeo(61 + v), M.voxel, list.length);
    list.forEach(([x, z, s], i) => { mesh.setMatrixAt(i, m4.compose(p3.set(x, terrain.heightAt(x, z), z), qt, sc.set(s, s, s))); trunks.push([x, z, 0.5]); });
    mesh.castShadow = mesh.receiveShadow = true;
    flora.add(mesh);
  }
  const reeds = [];
  for (let x = W(LAKE_U0) + 0.5; x < EAST_BOUNDS.x1 - 0.5; x += 1.1) for (let z = 28; z < EAST_BOUNDS.z1 - 0.5; z += 1.1) {
    const px = x + (rand() - 0.5) * 0.8, pz = z + (rand() - 0.5) * 0.8, u = px - OX, r = lakeR(u, pz);
    if (r < 0.62 || r >= 0.97 || !terrain.isWater(px, pz) || Math.sin(u * 0.45 + pz * 0.2) < -0.1 || [6, 24].some((v) => Math.abs(u - v) < 2) || u < DAM_U + 3 || rand() < 0.35) continue;
    reeds.push([px, pz, 0.8 + rand() * 0.35]);
  }
  for (let v = 0; v < 3; v++) {
    const list = reeds.filter((_, i) => i % 3 === v);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(reedGeo(71 + v), M.voxel, list.length);
    list.forEach(([x, z, sc0], i) => mesh.setMatrixAt(i, m4.compose(p3.set(x, LAKE_Y - 0.15, z), qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), sc.set(sc0, sc0, sc0))));
    qt.identity();
    mesh.castShadow = mesh.receiveShadow = true;
    flora.add(mesh);
  }
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
    mine.forEach(([x, z, s], i) => { mesh.setMatrixAt(i, m4.compose(p3.set(x, terrain.heightAt(x, z) - 0.15, z), qt, sc.set(s, s * 0.75, s))); if (!terrain.isWater(x, z)) trunks.push([x, z, 0.5 * s]); });
    mesh.castShadow = mesh.receiveShadow = true;
    flora.add(mesh);
  }
  // 荒草：没人住的老宅、遗址里蒿草长得齐腰深，越靠墙根越密（修好了就拔掉）；路边、坡上的野花野草和村里一样
  const fgeo = floraGeometries(), weeds = Object.fromEntries(Object.keys(fgeo).map((k) => [k, []]));
  const weedKind = (r) => (r < 0.42 ? 'tuft' : r < 0.72 ? 'foxtail' : r < 0.82 ? 'aster' : r < 0.92 ? 'daisy' : 'pebbles');
  for (const p of HOUSES) {
    if (p.state >= 2) continue; // 囫囵的院子不长荒草
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
  for (const r of [ANCESTRAL]) for (let du = -r.w / 2 - 1; du <= r.w / 2 + 1; du += 0.4) for (let dz = -r.d / 2 - 1; dz <= r.d / 2 + 1; dz += 0.4) {
    if (rand() > 0.5) continue;
    const x = W(r.u + du) + (rand() - 0.5) * 0.3, z = r.z + dz + (rand() - 0.5) * 0.3, t = terrain.typeAt(x, z);
    if (t === 'path' || t === 'stream') continue;
    weeds[weedKind(rand())].push([x, z, terrain.heightAt(x, z) + (Math.abs(du) < 3.7 && dz > -1.8 && dz < 0.9 && r === ANCESTRAL ? 0.82 : 0), 1.1 + rand() * 0.8, null]); // 祠堂台基缝里也长
  }
  const pathDist = (x, z) => { for (const r of [0.5, 1.0, 1.5, 2.0]) for (let a = 0; a < 8; a++) if (terrain.typeAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r) === 'path') return r; return Infinity; };
  for (let x = EAST_BOUNDS.x0 + 1; x < EAST_BOUNDS.x1 - 1; x += 0.5) for (let z = EAST_BOUNDS.z0 + 1; z < EAST_BOUNDS.z1 - 1; z += 0.5) {
    const px = x + (rand() - 0.5) * 0.4, pz = z + (rand() - 0.5) * 0.4;
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
  // 地里的庄稼（和村子、西沟同一套）+ 菜园里的白菜
  const crops = fieldCrops(M, terrain.fieldCells, rand);
  flora.add(crops);
  const cab = terrain.fieldCells.filter((c) => c.crop === 3 && GARDENS.some((g) => Math.abs(c.x - W(g.u)) < g.w / 2 - 0.3 && Math.abs(c.z - g.z) < g.d / 2 - 0.3) && Math.round(c.x / 0.5) % 2 === 0 && Math.round(c.z / 0.5) % 2 === 0);
  if (cab.length) { const mesh = new THREE.InstancedMesh(gardenShapes.cabbage(), M.voxel, cab.length); cab.forEach((c, i) => mesh.setMatrixAt(i, m4.compose(p3.set(c.x, c.h, c.z), qt.identity(), sc.set(1, 1, 1)))); mesh.receiveShadow = true; flora.add(mesh); }
  flora.userData.count = { crops: crops.userData.count, ...Object.fromEntries(Object.entries(groves).map(([k, l]) => [k, l.length])), tall: tall.length, rocks: rocks.length, weeds: Object.values(weeds).reduce((n, l) => n + l.length, 0) };

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
    ? { name: `${p.ownerName}家（${p.who}老宅）`, tags: [['塌了', '先苫了半边顶', '囫囵的'][p.state], `${p.ownerName}住着`], about: `${p.story}${p.state < 2 ? `如今${p.ownerName}住了进来，正攒石灰、条石和柴火，等着请葛石头来帮着修。` : `如今${p.ownerName}住了进来：扫了院子、通了烟囱，晚上窗户又亮了。`}`, plot: p.id }
    : { name: `${p.who}老宅`, tags: [['塌了', '能遮雨', '囫囵的'][p.state], '空着'], about: `${p.story}（空着：「创建居民」时可以选这儿住）`, plot: p.id };
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
  const fireflies = new Fireflies(root, M.fireflySprite, [[W(4), W(40), 18, 34, 0.6], [W(-36), W(-24), 24, 32, 1.2]], 30, 11);
  const rain = new Rain(root, EAST_BOUNDS, terrain.walkAt, 2200, 17);
  const lights = [];
  const pointLight = (x, y, z, base) => { const l = new THREE.PointLight(GLOW.lamp, 0, 0.07, 1.4); l.position.set(x, y, z); root.add(l); lights.push({ l, base }); };
  pointLight(W(HOMES.riverTemple.u) + 4.0, HOMES.riverTemple.level + 2.2, HOMES.riverTemple.z + 1.2, 0.02);
  pointLight(W(HOMES.duckYard.u) - 1.6, HOMES.duckYard.level + 1.6, HOMES.duckYard.z + 1.4, 0.02);
  pointLight(W(MINE.u + MINE_MOUTH.x), MINE.level + 3.6, MINE.z - MINE.d / 2 + 2.8, 0.03); // 煤窑口的两盏马灯
  const fireLight = (x, y, z, base) => { const l = new THREE.PointLight(GLOW.fire, 0, 0.06, 1.4); l.position.set(x, y, z); root.add(l); lights.push({ l, base, flicker: true }); };
  // 火把（和村里一样：天一擦黑点上，火苗一跳一跳，地上一圈暖光）：煤窑口两边（整夜不灭）、进山口牌坊、土拱桥头、山货场
  const torches = [];
  const torchAt = (x, z, always = false) => { const tr = P.torch(M); tr.object.position.set(x, terrain.walkAt(x, z), z); root.add(tr.object); torches.push({ ...tr, x, z, always }); return tr; };
  for (const sx of [-1, 1]) torchAt(W(MINE.u + MINE_MOUTH.x + sx * 2.7), MINE.z - MINE.d / 2 + 1.3, true);
  torchAt(W(MGATE.u - 2.6), MGATE.z + 0.9);
  torchAt(W(SHED.u + 3.7), SHED.z + 0.4);
  { const A = nodes.st4, B = nodes.ford, len = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / len, uz = (B.z - A.z) / len, k = Math.max(0, toLine(A.x - OX, A.z, OLDBED) - OLDBED_HALF - 1.0); torchAt(A.x + ux * k + uz * 1.4, A.z + uz * k - ux * 1.4); } // 土拱桥北头
  fireLight(torches[3].x, terrain.walkAt(torches[3].x, torches[3].z) + 2.4, torches[3].z, 0.03);
  fireLight(torches[2].x, terrain.walkAt(torches[2].x, torches[2].z) + 2.4, torches[2].z, 0.02);
  // 原住户门口一根挂灯笼的木杆；河神庙檐下一对红灯笼
  const lanterns = [];
  const hang = (x, y, z, s0 = 0.8) => { const l = lantern(M, s0); l.position.set(x, y, z); root.add(l); lanterns.push(l); return l; };
  for (const [k, b] of Object.entries(homes)) {
    if (!b.home) continue;
    const hp0 = b.object.position, ho = b.home.object.position, x = hp0.x + ho.x + b.home.door.x + 1.0, z = hp0.z + ho.z + b.home.door.z - 0.45, y = hp0.y;
    const pole = new THREE.Group();
    pole.add(block(x - 0.06, y, z - 0.06, x + 0.06, y + 2.5, z + 0.06, M.wood), block(x - 0.06, y + 2.38, z - 0.55, x + 0.06, y + 2.48, z + 0.06, M.wood));
    root.add(pole);
    hang(x, y + 2.38, z - 0.45, 0.65);
  }
  for (const sx of [-1, 1]) hang(temple.object.position.x - 4.2 + sx * 1.1, temple.object.position.y + 2.6, temple.object.position.z + 0.55, 0.7);
  // 窗前的光晕（和村里一样）：原住户的屋子、有人住的老宅
  const halos = [];
  const addHalos = (obj, key) => {
    root.updateMatrixWorld(true);
    obj.traverse((o) => {
      for (const wv of o.userData.windows ?? []) {
        const v = root.worldToLocal(o.localToWorld(wv.clone()));
        const sp = new THREE.Sprite(M.windowHalo);
        sp.scale.set(2.2, 2.2, 1);
        sp.position.copy(v);
        sp.userData.key = key;
        root.add(sp);
        halos.push(sp);
      }
    });
  };
  for (const [k, b] of Object.entries(homes)) if (b.home) { b.home.object.userData.windows = b.home.windows; addHalos(b.object, k); }
  for (const p of HOUSES) if (p.owner) addHalos(plots[p.id], p.id);
  const ownWindow = M.windowLit.clone(); // 老村址自己的窗户：天黑才亮
  ownWindow.onBeforeCompile = M.windowLit.onBeforeCompile;
  ownWindow.customProgramCacheKey = M.windowLit.customProgramCacheKey;
  root.traverse((o) => { if (o.material === M.windowLit) o.material = ownWindow; });

  // 点到地上（没碰到物件）：这一片叫什么
  const PLACE = {
    oldbed: { name: '黄土冲沟', tags: ['土崖', '柳树'], about: '六十多年前那场山洪从东头山口冲下来，在黄土坡上刨出这道五六米深的沟，一直通到坡下的大湖。两岸是陡立的黄土崖，沟底长满了草，几棵柳树，一条小路；老街在沟上过一座土拱桥。夏天下大雨，沟里还会走一回水。' },
    beach: { name: '河滩', tags: ['卵石', '柳树'], about: '小溪北岸的卵石滩。水生常在这儿捞上游冲下来的漂木，晒干了当柴卖；苗家的鸭子一早就下到这里的浅水。' },
    lake: { name: '大湖', tags: ['竹林', '柳树'], about: '坡下一大片湖，冲沟从东北一路下来就通到这儿。北岸一排柳树，东西两头两片竹林，钓鱼的人爱坐在岸边。' },
    stone: { name: '青石崖', tags: ['煤线'], about: '老村址东北角的一面青石崖，石层里夹着一道道黑亮的煤线，崖顶上长满了老林子。崖脚凿了个大煤窑口，冬天村里烧的煤就从这儿背出去；白家烧石灰的青石也从这崖上撬。' },
    forest: { name: '东山老林', tags: ['油松', '槲栎', '野猪'], about: '老村址背后的老林子，树又高又密。进山口的石牌坊往北，一条石阶钻进林子里。采山货、打猎的人从这儿上山，林子边上常有野猪拱过的土。' },
    field: { name: '培育田', tags: ['良种'], about: '一溜五畦试验田，每畦一样庄稼，畦头插着木牌写着是什么种、哪天种的。农技员在这儿挑穗大粒饱的留种。' },
    fallow: { name: '撂荒的梯田', tags: ['荒地'], about: '大水以前这几级梯田种麦子，人一搬走就撂了荒，田埂还在，地里长满了草。新来的人要是想种地，翻一翻就能种。' },
    pasture: { name: '放牛草场', tags: ['黄牛'], about: '旧河道东边一大块平坦的草场，围着一圈木栅栏。村里几家寄养的牛白天在这儿吃草，放牛的人看着。' },
    slope: { name: '老石峪', tags: ['老村址'], about: '石峪村原来就在这面坡上。大水以后大半人家搬去了下游，留下一坡塌了的老宅。地是好地，就是好些年没人种了。' },
    south: { name: '溪南草滩', tags: [], about: '小溪南边的一溜草滩，和村口那边连着。' },
  };
  const placeAt = (x, z) => {
    const u = x - OX, t = terrain.typeAt(x, z);
    if (quay(u, z)) return PLACE.lake;
    if (t === 'stream' || z > sz(u) + streamHalf(u)) return z > sz(u) ? PLACE.south : PLACE.beach;
    if (toLine(u, z, OLDBED) < OLDBED_HALF + 0.3) return PLACE.oldbed;
    if (t === 'gravel') return PLACE.beach;
    if (t === 'stone') return PLACE.stone;
    if (t === 'forest' || z < forestZ(u)) return PLACE.forest;
    if (t === 'field') return PLACE.field;
    if (inRect(u, z, PASTURE)) return PLACE.pasture;
    return PLACE.slope;
  };

  // 原住户的院子（给村民系统当"家"用，village.js 包成和村里院落一样的接口）：本地坐标都相对院子中心
  root.updateMatrixWorld(true);
  const SPOTS = {
    riverTemple: { yard: [2.0, 1.6], work: [-4.2, 0.6], stele: [-3.1, 2.4], sweepA: [-1.0, 1.4], sweepB: [2.4, 2.0] },
    mason: { yard: [0, 2.0], work: [1.3, 1.9], pile: [1.6, 0.6], sweepA: [-1.0, 2.2], sweepB: [0.6, 2.6] },
    limeKiln: { yard: [0, 2.4], work: [2.2, 2.4], stone: [0.2, 1.4], sweepA: [-1.4, 1.6], sweepB: [0.8, 2.8] },
    duckYard: { yard: [-1.5, 2.1], pen: [2.3, 3.4], sweepA: [-2.6, 2.0], sweepB: [-0.6, 2.4] },
  };
  const FACE = { mason: [2.3, 1.6], limeKiln: [2.2, 0.6], riverTemple: [-4.2, -0.6] };
  const homeSpecs = Object.fromEntries(Object.entries(homes).map(([k, b]) => {
    const h = HOMES[k], hp = b.home.object.position, door = [hp.x + b.home.door.x, hp.z + b.home.door.z];
    return [k, { id: k, x: W(h.u), z: h.z, w: h.w, d: h.d, level: h.level, gate: [0, h.d / 2 + 0.8], doors: { house: door }, spots: SPOTS[k], face: FACE[k] }];
  }));
  const ring = (cx, cz, r, n) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r]);
  const forestEdge = [];
  for (let u = -22; u <= 43; u += 3) if (Math.abs(u - APIARY.u) > APIARY.w / 2 + 1) forestEdge.push([W(u), forestZ(u) + 1.4]);
  const work = {
    beach: [ // 水塘边一圈 + 溪北的卵石滩：捞漂木、钓鱼、看水
      ...Array.from({ length: 9 }, (_, i) => { const u = 2 + i * 4.5; return [W(u), shoreZ(u) - 1.2]; }), // 湖北岸的沙滩
      ...Array.from({ length: 6 }, (_, i) => { const u = -34 + i * 4; return [W(u), sz(u) - streamHalf(u) - 1.2]; }),
    ],
    temple: { at: [W(HOMES.riverTemple.u) - 4.2, HOMES.riverTemple.z + 1.5], face: [W(HOMES.riverTemple.u) - 4.2, HOMES.riverTemple.z - 1.2] },
    stele: [W(HOMES.riverTemple.u) - 3.2, HOMES.riverTemple.z + 2.4],
    digs: [...OLDBED.slice(0, -1).map(([u, z]) => [W(u), z]), ...HOUSES.map((p, i) => plotAt(p, (i % 2 ? 1 : -1) * (p.w / 2 + 1.2), 0)), [W(ANCESTRAL.u), ANCESTRAL.z + ANCESTRAL.d / 2 + 0.8]], // 刨旧物：旧河道里、老宅墙外、老祠堂遗址
    mine: { at: [W(MINE.u + MINE_MOUTH.x), MINE.z - MINE.d / 2 + 0.9], face: [W(MINE.u + MINE_MOUTH.x), MINE.z - MINE.d / 2 - 1], heap: [W(MINE.u) + 1.5, MINE.z + 1.4] }, // 挖煤：洞口里头刨、背出来倒在煤堆上
    pasture: ring((W(PASTURE.u0) + W(PASTURE.u1)) / 2, (PASTURE.z0 + PASTURE.z1) / 2, 4, 8),
    apiary: [[W(APIARY.u) - 1.3, APIARY.z - 0.1], [W(APIARY.u) + 1.3, APIARY.z - 0.1], [W(APIARY.u), APIARY.z - 0.1]],
    trial: [[W(-4), TRIAL.z1 + 1.2], [W(0), TRIAL.z1 + 1.2], [W(4), TRIAL.z1 + 1.2], [W(-2), TRIAL.z0 - 0.8], [W(2), TRIAL.z0 - 0.8]],
    gather: [W(SHED.u) + 1.6, SHED.z + 1.8], // 山货收购棚前：采回来的山货倒在这儿晾
    forest: forestEdge, // 林子边：采山货、下套子
  };
  const animals = [ // 林子边的野猪、草场上的牛（village.js 放进 extraAnimals）
    ...[[-26, -14], [-2, 10], [16, 24]].map(([u0, u1]) => ({ kind: 'boar', role: 'boar', worldArea: [W(u0), Math.min(forestZ(u0), forestZ(u1)) - 5, W(u1), Math.max(forestZ(u0), forestZ(u1)) + 2], ownerText: '东山上的野物' })),
    ...Array.from({ length: 4 }, () => ({ kind: 'ox', role: 'cow', worldArea: [W(PASTURE.u0 + 1.5), PASTURE.z0 + 1.5, W(PASTURE.u1 - 1.5), PASTURE.z1 - 1.5], ownerText: '老村址草场（各家寄养）', about: '村里几家寄养在草场上的黄牛，白天在栅栏里低头吃草，放牛的人看着；农忙时各家牵回去犁地、拉车。' })),
  ];

  // 老村址的鸡狗鹅鸭、树上的喜鹊、马家老窑羊圈里寄养的羊
  const ma = HOUSES.find((h) => h.id === 'old10'), pen = [plotAt(ma, ma.w / 2 - 2.7, -ma.d / 2 + 2.5), plotAt(ma, ma.w / 2 - 0.8, ma.d / 2 - 0.8)];
  const swimmers = is('winter') ? [W(-35), 24.5, W(-25), 31] : [W(-34), 29, W(30), EAST_BOUNDS.z1]; // 冬天湖上结冰：鸭鹅在鸭棚门口转
  const spread = []; // 喜鹊落脚的树：挑十来棵隔得开的
  for (const tp of treeTops.filter((_, i) => i % 3 === 0)) if (tp[2] > -24 && spread.every((o) => Math.hypot(o[0] - tp[0], o[2] - tp[2]) > 9)) spread.push(tp);
  const magpie = (i) => {
    const mine = spread.filter((_, k) => k % 3 === i % 3).slice(0, 6);
    if (mine.length < 2) return null;
    const perches = mine.map(([x, y, z]) => [x, y - 0.05, z]);
    const hops = perches.map((a, ia) => perches.map((b, ib) => ({ j: ib, d: Math.hypot(a[0] - b[0], a[2] - b[2]) })).filter((o) => o.j !== ia && o.d < 40).map(({ j, d }) => ({ j, lift: 1.5 + d * 0.1 })));
    return { kind: 'magpie', role: 'bird', perches, hops, ownerText: '老村址的喜鹊', about: '在老村址的树梢之间飞来飞去，喳喳地叫。村里人说喜鹊登枝，好事将至。' };
  };
  const extra = [
    { kind: 'dog', role: 'dog', worldArea: [W(-30), -2, W(-6), 5], ownerText: '葛石头家的大黄', about: '葛石头家的黄狗，白天在老街上溜达，见了生人先叫两声，再摇着尾巴凑过去闻。' },
    { kind: 'dogBlack', role: 'dog', worldArea: [W(18), -9, W(34), -1], ownerText: '白家看石灰窑的黑子', about: '白家的黑狗，守着石灰窑和煤窑口那一片，夜里有点动静就叫。' },
    ...Array.from({ length: 4 }, () => ({ kind: 'goose', role: 'goose', worldArea: swimmers, swim: true, ownerText: '苗家鸭棚的大白鹅', about: '苗家养的大白鹅，一早从鸭棚出来，顺着小溪游过石坝下到湖里，比狗还会看门。' })),
    ...Array.from({ length: 6 }, () => ({ kind: 'duck', role: 'duck', worldArea: swimmers, swim: true, ownerText: '苗家鸭棚的鸭子', about: '苗家放的鸭子，白天在小溪和湖西头的浅水里找吃的，傍晚一赶就排着队回棚。' })),
    ...[0, 1, 2, 3].map(magpie).filter(Boolean),
    ...Array.from({ length: 3 }, () => ({ kind: 'sheep', role: 'sheep', worldArea: [Math.min(pen[0][0], pen[1][0]), Math.min(pen[0][1], pen[1][1]), Math.max(pen[0][0], pen[1][0]), Math.max(pen[0][1], pen[1][1])], ownerText: '寄养在马家老窑羊圈的羊', about: '村里羊倌寄养在马家老窑羊圈里的几只绵羊。马家搬走以后羊圈空了好些年，如今又有羊在里头咩咩叫。' })),
    ...['hen', 'henBrown', 'rooster'].map((kind) => ({ kind, role: 'chicken', worldArea: [W(HOMES.riverTemple.u + 2.4), HOMES.riverTemple.z - 1, W(HOMES.riverTemple.u + 6.2), HOMES.riverTemple.z + 3], ownerText: '柳婆婆家的鸡', about: '柳婆婆养的几只鸡，在河神庙东边的小院里刨食。' })),
  ];
  animals.push(...extra);

  let last = 0, litAt = -9; // 最近一次上香的钟点

  /** 老宅换个样子（住进来先苫半边顶 = 1，修好了 = 2）：整处重搭、单独合批，卡片跟着改。 */
  function setPlotState(id, state, force = false) {
    const spec = HOUSES.find((h) => h.id === id), old = plots[id];
    if (!spec || !old || (spec.state === state && !force)) return;
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
    for (const h of halos.filter((sp) => sp.userData.key === id)) { root.remove(h); halos.splice(halos.indexOf(h), 1); }
    if (spec.owner) addHalos(g, id);
    for (const t of things) if (t.spec?.plot === id) { t.spec = plotCard(spec); t.box.max.y = Math.max(t.box.max.y, g.position.y + 5); }
  }
  return {
    lightIncense(hour) { litAt = hour; },
    setPlotState,
    /** 新来的人住进一处老宅：记下是谁，塌了的先苫上半边顶。 */
    claim(id, p) { const h = HOUSES.find((x) => x.id === id); if (!h) return null; h.owner = p.id; h.ownerName = p.nick || p.name; for (const t of things) if (t.spec?.plot === id) t.spec = plotCard(h); setPlotState(id, RUINS ? 2 : Math.max(h.state, p.houseState ?? 1), true); return h; }, // 有人住了：整处重搭（废墟开局：修成囫囵的），晚上点灯
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
      for (const [s, name] of [[MINE, '煤窑口'], [SHED, '山货场'], [MGATE, '进山口'], [APIARY, '蜂场'], [ANCESTRAL, '老祠堂遗址'], [THRESH, '场院'], [ORCH, '果园'], [GRAVE, '祖坟']]) if (Math.abs(u - s.u) < s.w / 2 + 1 && Math.abs(z - s.z) < s.d / 2 + 1) return name;
      return placeAt(x, z).name;
    },
    work,
    animals,
    swimFrom: [W(-20), sz(-20)], // 鸭鹅从这儿（小溪里）游得到的地方
    waterY: (x, z) => (terrain.isWater(x, z) ? terrain.heightAt(x, z) : null),
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
      const late = hour > 21.5 || hour < 4.6;
      for (const { l, base, flicker } of lights) l.intensity = base * n * (late && !flicker ? 0 : 1) * (flicker ? 0.92 + (Math.floor(t * 9 + l.position.x) % 3) * 0.04 : 1);
      for (const tr of torches) {
        tr.fire.visible = n > 0.1 && (tr.always || !late);
        const f = tr.fire.userData.flame;
        f.scale.y = Math.floor(t * 8 + tr.x) % 3 === 0 ? 0.68 : 0.6;
        f.position.x = Math.floor(t * 6 + tr.z) % 2 ? 0.03 : -0.03;
      }
      for (const sp of halos) sp.visible = n > 0.05 && !late;
      for (const lt of lanterns) lt.rotation.z = Math.round(Math.sin(t * 1.3 + lt.position.x) * 2) * 0.04;
      if (lakeMat) { const U = lakeMat.userData.uniforms; U.uTime.value = t; U.uNight.value = n; U.uSky.value.set(light.sky); }
      sprites.face(viewer);
    },
  };
}
