import * as THREE from 'three';
import { R, GLOW, INK } from './palette.js';
import { makeRng, paint, toTexture, toon, flat, glow, pixelize } from './pixel.js';
import { season } from './season.js';

// 画法约定（TPU = 18，一米 18 像素）：
// - 用成团的色块表现质感，不撒随机噪点；
// - 每种材质只用自己色阶里的 3~4 个颜色；
// - 受光面在左（夕阳从西边来）。
// 平铺贴图的画布尺寸 = 它代表的米数 × 18。

const TILES = {
  brick: (r) => paint(36, 36, (g) => { // 青砖清水墙：2 像素砖 + 1 像素灰缝，错缝
    g.rect(0, 0, 36, 36, R.mortar[0]);
    for (let row = 0; row < 12; row++) {
      const y = row * 3;
      const off = row % 2 ? 4 : 0;
      for (let x = -off; x < 36; x += 8) {
        const c = r() > 0.85 ? R.brick[2] : r() > 0.8 ? R.brick[4] : R.brick[3];
        g.rectw(x, y, 7, 2, c);
        g.pxw(x, y, R.brick[4]);
      }
    }
  }),

  brickDark: (r) => paint(36, 36, (g) => { // 下碱：同样的砌法，暗一档
    g.rect(0, 0, 36, 36, R.brick[1]);
    for (let row = 0; row < 12; row++) {
      const y = row * 3;
      for (let x = row % 2 ? -4 : 0; x < 36; x += 8) { g.rectw(x, y, 7, 2, r() > 0.8 ? R.brick[1] : R.brick[2]); g.pxw(x, y, R.brick[3]); }
    }
  }),

  loess: (r) => paint(36, 36, (g) => { // 夯土墙：横向夯层 + 草筋
    g.rect(0, 0, 36, 36, R.loess[3]);
    for (let y = 5; y < 36; y += 6) for (let x = 0; x < 36; x++) if ((x * 7 + y) % 11 > 1) g.px(x, y, R.loess[2]);
    for (let i = 0; i < 10; i++) { const x = r() * 36, y = r() * 36; g.rectw(x, y, 2, 1, R.loess[4]); }
    for (let i = 0; i < 4; i++) g.rectw(r() * 36, r() * 36, 3, 2, R.loess[2]);
  }),

  adobe: (r) => paint(36, 36, (g) => { // 土坯砖墙
    g.rect(0, 0, 36, 36, R.loess[1]);
    for (let row = 0; row < 6; row++) {
      for (let x = row % 2 ? -5 : 0; x < 36; x += 10) {
        g.rectw(x, row * 6, 9, 5, r() > 0.7 ? R.loess[2] : R.loess[3]);
        g.rectw(x, row * 6, 9, 1, R.loess[4]);
      }
    }
  }),

  roof: () => paint(16, 16, (g) => { // 合瓦：沿坡向的瓦垄 + 搭接线
    for (let x = 0; x < 16; x++) {
      const c = x % 4;
      g.rect(x, 0, 1, 16, c === 0 ? R.roof[0] : c === 1 ? R.roof[3] : R.roof[2]);
    }
    for (let k = 0; k < 4; k++) for (let y = (k % 2) * 2; y < 16; y += 4) g.rect(k * 4 + 1, y, 3, 1, R.roof[1]);
  }),

  ridge: () => paint(16, 16, (g) => {
    g.rect(0, 0, 16, 16, R.roof[1]);
    g.rect(0, 0, 16, 2, R.roof[3]);
    for (let y = 5; y < 16; y += 5) g.rect(0, y, 16, 1, R.roof[2]);
  }),

  flatRoof: (r) => paint(36, 36, (g) => { // 平顶泥屋面
    g.rect(0, 0, 36, 36, R.loess[2]);
    for (let i = 0; i < 6; i++) { const x = r() * 36, y = r() * 36; g.rectw(x, y, 4, 1, R.loess[1]); g.pxw(x + 4, y + 1, R.loess[1]); }
    for (let i = 0; i < 8; i++) g.rectw(r() * 36, r() * 36, 2, 1, R.loess[3]);
  }),

  wood: () => paint(16, 16, (g) => {
    g.rect(0, 0, 16, 16, R.wood[2]);
    for (let x = 0; x < 16; x += 4) g.rect(x, 0, 1, 16, R.wood[1]);
    g.rect(2, 3, 1, 3, R.wood[3]); g.rect(10, 9, 1, 3, R.wood[3]); g.rect(6, 12, 1, 2, R.wood[3]);
  }),

  redwood: () => paint(8, 8, (g) => { // 朱漆柱子 / 门框
    g.rect(0, 0, 8, 8, R.redwood[2]);
    g.rect(0, 0, 2, 8, R.redwood[3]);
    g.rect(6, 0, 2, 8, R.redwood[1]);
  }),

  paving: () => paint(36, 36, (g) => { // 方砖墁地（四合院院子）
    g.rect(0, 0, 36, 36, R.brick[1]);
    for (let y = 0; y < 36; y += 9) for (let x = 0; x < 36; x += 9) {
      const c = ((x + y) / 9) % 3 === 0 ? R.brick[4] : R.brick[3];
      g.rect(x + 1, y + 1, 8, 8, c);
      g.rect(x + 1, y + 1, 8, 1, R.brick[5]);
    }
  }),

  street: (r) => paint(36, 36, (g) => { // 土路
    g.rect(0, 0, 36, 36, R.dirt[3]);
    for (let i = 0; i < 9; i++) g.rectw(r() * 36, r() * 36, 3, 1, R.dirt[2]);
    for (let i = 0; i < 6; i++) g.rectw(r() * 36, r() * 36, 2, 1, R.dirt[4]);
    for (let i = 0; i < 4; i++) { const x = r() * 36, y = r() * 36; g.pxw(x, y, R.stone[3]); g.pxw(x + 1, y, R.stone[2]); }
  }),

  grass: (r) => paint(36, 36, (g) => { // 秋草：绿里带黄
    g.rect(0, 0, 36, 36, R.grass[3]);
    for (let i = 0; i < 12; i++) g.rectw(r() * 36, r() * 36, 3, 1, R.grass[2]);
    for (let i = 0; i < 10; i++) { const x = r() * 36, y = r() * 36; g.pxw(x, y, R.grass[4]); g.pxw(x - 1, y + 1, R.grass[4]); g.pxw(x + 1, y + 1, R.grass[2]); }
    for (let i = 0; i < 6; i++) g.rectw(r() * 36, r() * 36, 2, 1, R.wheat[3]);
  }),

  stubble: () => paint(18, 18, (g) => { // 收完的麦茬地
    g.rect(0, 0, 18, 18, R.wheat[1]);
    for (let y = 1; y < 18; y += 3) for (let x = (y % 2); x < 18; x += 2) { g.px(x, y, R.wheat[3]); g.px(x, y + 1, R.wheat[2]); }
  }),

  wheat: () => paint(18, 18, (g) => { // 没割的麦子（俯视）
    g.rect(0, 0, 18, 18, R.wheat[2]);
    for (let y = 0; y < 18; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < 18; x += 3) { g.px(x, y, R.wheat[4]); g.px(x + 1, y + 1, R.wheat[3]); }
  }),

  veg: () => paint(36, 36, (g) => { // 菜地：垄沟 + 一棵棵白菜
    g.rect(0, 0, 36, 36, R.dirt[2]);
    for (let y = 0; y < 36; y += 6) {
      g.rect(0, y + 4, 36, 2, R.dirt[1]);
      for (let x = (y / 6) % 2 ? 3 : 0; x < 36; x += 6) {
        g.rect(x + 1, y, 4, 4, R.cabbage[2]);
        g.rect(x + 1, y, 2, 2, R.cabbage[4]);
        g.px(x + 3, y + 1, R.cabbage[3]); g.px(x + 4, y + 3, R.cabbage[1]);
      }
    }
  }),

  threshing: (r) => paint(36, 36, (g) => { // 场院：压实的黄土 + 麦糠
    g.rect(0, 0, 36, 36, R.loess[4]);
    for (let i = 0; i < 14; i++) g.rectw(r() * 36, r() * 36, 2, 1, R.wheat[4]);
    for (let i = 0; i < 6; i++) g.rectw(r() * 36, r() * 36, 3, 1, R.loess[3]);
  }),

  water: () => paint(36, 36, (g) => { // 涝池：暗水 + 波纹 + 晚霞倒影
    g.rect(0, 0, 36, 36, R.water[2]);
    for (const [x, y] of [[2, 3], [18, 7], [8, 15], [26, 20], [12, 28], [30, 32]]) g.rectw(x, y, 5, 1, R.water[1]);
    for (const [x, y] of [[12, 2], [28, 12], [4, 24]]) g.rectw(x, y, 4, 1, R.water[3]);
    for (const [x, y] of [[22, 5], [6, 11], [20, 27]]) g.rectw(x, y, 3, 1, '#f2a070');
  }),

  stone: (r) => paint(36, 36, (g) => { // 条石（台阶、井台、碾盘）
    g.rect(0, 0, 36, 36, R.stone[1]);
    for (let row = 0; row < 6; row++) {
      for (let x = row % 2 ? -6 : 0; x < 36; x += 12) {
        g.rectw(x + 1, row * 6 + 1, 11, 5, r() > 0.5 ? R.stone[2] : R.stone[3]);
        g.rectw(x + 1, row * 6 + 1, 10, 1, R.stone[3]);
        g.pxw(x + 1, row * 6 + 1, R.stone[4]);
      }
    }
  }),

  soil: () => paint(36, 36, (g) => { // 沙盘剖面：黄土台塬的层理
    const bands = [R.loess[3], R.loess[3], R.loess[2], R.loess[3], R.loess[2], R.loess[1], R.loess[2], R.loess[1]];
    for (let x = 0; x < 36; x++) {
      const j = Math.round(Math.sin(x * 0.35) * 1.2);
      for (let y = 0; y < 36; y++) g.px(x, y, bands[Math.floor(((((y + j) % 36) + 36) % 36) / 36 * bands.length)]);
    }
  }),

  straw: () => paint(16, 16, (g) => {
    g.rect(0, 0, 16, 16, R.wheat[2]);
    for (const [x, y, c] of [[1, 0, 3], [4, 3, 4], [8, 1, 3], [12, 5, 1], [3, 9, 3], [10, 10, 4], [14, 12, 3], [6, 13, 1], [0, 6, 1]]) for (let k = 0; k < 4; k++) g.pxw(x, y + k, R.wheat[c]);
  }),

  corn: () => paint(16, 16, (g) => { // 玉米棒子堆
    g.rect(0, 0, 16, 16, R.gold[2]);
    for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 16; x += 5) {
      g.rect(x, y, 4, 3, R.gold[3]);
      g.px(x, y, R.gold[4]); g.px(x + 3, y + 2, R.gold[1]);
    }
  }),

  chiliBed: () => paint(16, 16, (g) => { // 摊开晒的红辣椒（俯视）
    g.rect(0, 0, 16, 16, R.red[1]);
    for (let y = 0; y < 16; y += 3) for (let x = (y / 3) % 2 ? 1 : 3; x < 16; x += 4) { g.rect(x, y, 3, 1, R.red[2]); g.px(x + 1, y, R.red[3]); g.px(x + 2, y + 1, R.green[2]); }
  }),

  trayWood: () => paint(16, 16, (g) => {
    g.rect(0, 0, 16, 16, R.wood[1]);
    g.rect(0, 6, 16, 1, R.wood[0]);
    g.rect(3, 0, 5, 1, R.wood[2]); g.rect(9, 12, 5, 1, R.wood[2]);
  }),

  plaster: () => paint(18, 18, (g) => { // 白灰墙心
    g.rect(0, 0, 18, 18, R.white[2]);
    g.rect(3, 4, 2, 1, R.white[3]); g.rect(12, 11, 3, 1, R.white[1]);
  }),

  gold: () => paint(2, 2, (g) => g.rect(0, 0, 2, 2, R.gold[3])),
  redCloth: () => paint(8, 8, (g) => { g.rect(0, 0, 8, 8, R.red[2]); g.rect(0, 7, 8, 1, R.gold[3]); for (let x = 1; x < 8; x += 3) g.px(x, 3, R.red[3]); }), // 戏台桌围
  ink: () => paint(2, 2, (g) => g.rect(0, 0, 2, 2, INK)),
  iron: () => paint(4, 4, (g) => { g.rect(0, 0, 4, 4, R.slate[2]); g.px(0, 0, R.slate[3]); }),
  deepWater: () => paint(2, 2, (g) => g.rect(0, 0, 2, 2, R.water[0])),
  cloth: () => paint(8, 8, (g) => { g.rect(0, 0, 8, 8, R.indigo[3]); g.rect(0, 0, 8, 1, R.indigo[4]); for (let x = 1; x < 8; x += 3) g.px(x, 4, R.white[3]); }),

  rubble: (r) => paint(36, 36, (g) => { // 毛石墙 / 石堰：大小不一的石块，干砌，缝里发暗
    g.rect(0, 0, 36, 36, R.stone[0]);
    let y = 0;
    while (y < 36) {
      const rh = 4 + Math.floor(r() * 3);
      let x = -Math.floor(r() * 6);
      while (x < 36) {
        const rw = 5 + Math.floor(r() * 6);
        const c = [R.stone[2], R.stone[2], R.stone[3], R.loess[2]][Math.floor(r() * 4)];
        g.rectw(x + 1, y + 1, rw - 1, rh - 1, c);
        g.rectw(x + 1, y + 1, rw - 2, 1, R.stone[3]);
        g.pxw(x + 1, y + 1, R.stone[4]);
        g.rectw(x + 1, y + rh - 1, rw - 1, 1, R.stone[1]);
        x += rw;
      }
      y += rh;
    }
  }),

  slate: () => paint(16, 16, (g) => { // 石板瓦：一片片叠着的青石板
    g.rect(0, 0, 16, 16, R.stone[1]);
    for (let row = 0; row < 4; row++) for (let x = row % 2 ? -3 : 0; x < 16; x += 6) {
      g.rectw(x, row * 4, 5, 3, row % 2 ? R.stone[2] : R.slate[3]);
      g.rectw(x, row * 4 + 2, 5, 1, R.stone[1]);
      g.pxw(x, row * 4, R.stone[3]);
    }
  }),

  millet: () => paint(18, 18, (g) => { // 谷子地：沉甸甸的金黄谷穗
    g.rect(0, 0, 18, 18, R.harvest[1]);
    for (let y = 0; y < 18; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < 18; x += 3) { g.px(x, y, R.gold[4]); g.px(x + 1, y, R.gold[3]); g.px(x, y + 1, R.harvest[2]); }
  }),

  cornfield: () => paint(18, 18, (g) => { // 收了棒子的玉米地：一行行枯黄秸秆
    g.rect(0, 0, 18, 18, R.dirt[2]);
    for (let x = 1; x < 18; x += 4) for (let y = 0; y < 18; y += 3) { g.px(x, y, R.wheat[3]); g.px(x + 1, y + 1, R.wheat[2]); g.px(x - 1, y + 1, R.grass[3]); }
  }),
};

function glyph(g, r, x, y, c, s = 2) { // 伪汉字：s x s 的笔画块，远看像字
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (r() > 0.35 || i === j) g.px(x + i, y + j, c);
}

const decals = {
  gateRed: () => paint(29, 45, (g) => { // 红漆大门：门钉、铺首门环、门框、门槛
    g.rect(0, 0, 29, 45, R.wood[1]);
    g.rect(2, 3, 12, 40, R.redwood[2]); g.rect(15, 3, 12, 40, R.redwood[2]);
    g.rect(14, 3, 1, 40, R.redwood[0]);
    g.rect(2, 3, 2, 40, R.redwood[3]); g.rect(15, 3, 1, 40, R.redwood[3]);
    for (let y = 7; y < 38; y += 5) for (const x of [5, 8, 11, 18, 21, 24]) g.px(x, y, R.gold[3]);
    for (const x of [11, 17]) { g.rect(x, 22, 2, 2, R.gold[2]); g.px(x, 24, R.gold[3]); g.px(x + 1, 25, R.gold[3]); }
    g.rect(0, 43, 29, 2, R.stone[3]);
    g.rect(0, 0, 29, 2, R.wood[2]);
    for (const x of [7, 20]) g.rect(x, 0, 2, 2, R.gold[3]); // 门簪
  }),

  gatePlain: () => paint(25, 40, (g) => { // 普通人家的黑漆木门
    g.rect(0, 0, 25, 40, R.wood[1]);
    g.rect(2, 2, 21, 37, R.black[2]);
    g.rect(12, 2, 1, 37, R.black[0]);
    g.rect(2, 2, 1, 37, R.black[3]);
    for (let y = 8; y < 38; y += 10) { g.rect(3, y, 9, 1, R.black[1]); g.rect(13, y, 9, 1, R.black[1]); }
    g.px(10, 20, R.gold[2]); g.px(14, 20, R.gold[2]);
    g.rect(0, 38, 25, 2, R.stone[2]);
  }),

  brushGate: () => paint(22, 30, (g) => { // 柴门：树枝绑的
    for (let x = 0; x < 22; x += 3) { g.rect(x, 2 + (x % 2), 2, 28, R.wood[2]); g.px(x, 2 + (x % 2), R.wood[3]); }
    g.rect(0, 8, 22, 2, R.wood[1]); g.rect(0, 22, 22, 2, R.wood[1]);
  }),

  plankGate: () => paint(61, 40, (g) => { // 铺子、作坊的木板大门（两扇）
    g.rect(0, 0, 61, 40, R.wood[1]);
    for (let x = 1; x < 60; x += 4) { g.rect(x, 1, 3, 39, (x / 4) % 2 ? R.wood[2] : R.wood[3]); g.px(x, 1, R.wood[4]); }
    for (const y of [6, 20, 34]) g.rect(1, y, 59, 2, R.wood[1]);
    for (const x of [3, 27, 34, 57]) for (const y of [7, 21, 35]) g.px(x, y, R.slate[3]);
    g.rect(30, 0, 1, 40, R.wood[0]);
  }),

  fenceGate: () => paint(30, 22, (g) => { // 栅栏门：两根横木 + 竖条 + 斜撑
    for (let x = 1; x < 30; x += 4) { g.rect(x, 1, 2, 21, R.wood[2]); g.px(x, 1, R.wood[3]); }
    g.rect(0, 5, 30, 2, R.wood[1]); g.rect(0, 15, 30, 2, R.wood[1]);
    for (let i = 0; i < 26; i++) g.px(2 + i, 16 - Math.round(i * 10 / 26), R.wood[3]);
  }),

  door: () => paint(18, 38, (g) => { // 正房门 + 蓝布门帘
    g.rect(0, 0, 18, 38, R.redwood[1]);
    g.rect(1, 1, 16, 37, R.redwood[2]);
    g.rect(2, 4, 14, 34, R.indigo[2]);
    g.rect(2, 4, 14, 3, R.indigo[1]);
    g.rect(2, 4, 3, 34, R.indigo[3]);
    for (let y = 12; y < 36; y += 6) for (let x = 5; x < 15; x += 4) g.px(x, y, R.white[3]);
    g.rect(7, 18, 4, 4, R.white[2]); g.px(8, 19, R.indigo[2]); g.px(9, 20, R.indigo[2]);
  }),

  shutter: () => paint(54, 43, (g) => { // 铺面：铺板卸下一半，露出柜台和货架
    g.rect(0, 0, 54, 43, R.wood[1]);
    g.rect(2, 2, 50, 41, '#1a1220');
    for (let x = 2; x < 18; x += 4) { g.rect(x, 2, 3, 41, R.wood[2]); g.px(x, 2, R.wood[3]); }
    for (let x = 38; x < 52; x += 4) { g.rect(x, 2, 3, 41, R.wood[2]); g.px(x, 2, R.wood[3]); }
    g.rect(18, 8, 20, 1, R.wood[2]); g.rect(18, 16, 20, 1, R.wood[2]); // 货架
    for (let x = 19; x < 37; x += 3) { g.rect(x, 5, 2, 3, x % 2 ? R.red[2] : R.gold[2]); g.rect(x, 13, 2, 3, x % 2 ? R.indigo[3] : R.white[2]); }
    g.rect(18, 28, 20, 15, R.wood[2]); g.rect(18, 28, 20, 2, R.wood[3]); // 柜台
    g.rect(22, 25, 3, 3, R.white[2]); g.rect(30, 24, 4, 4, R.brown[3]); // 坛子
  }),

  window: () => paint(27, 22, (g) => { // 支摘窗（不亮灯）
    g.rect(0, 0, 27, 22, R.redwood[1]);
    g.rect(2, 2, 23, 18, R.paper[1]);
    for (let x = 2; x < 25; x += 4) g.rect(x, 2, 1, 18, R.redwood[1]);
    for (let y = 2; y < 20; y += 4) g.rect(2, y, 23, 1, R.redwood[1]);
    g.rect(11, 8, 5, 5, R.red[2]); g.px(13, 10, R.paper[1]); // 窗花
  }),

  signBoard: (r) => paint(43, 11, (g) => { // 匾额 / 招牌
    g.rect(0, 0, 43, 11, R.gold[2]);
    g.rect(1, 1, 41, 9, R.black[1]);
    for (let x = 5; x < 38; x += 9) glyph(g, r, x, 3, R.gold[4], 5);
  }),

  couplet: (r) => paint(5, 32, (g) => {
    g.rect(0, 0, 5, 32, R.red[2]);
    g.rect(0, 0, 1, 32, R.red[3]);
    for (let y = 2; y < 30; y += 5) glyph(g, r, 1, y, R.black[1], 3);
  }),

  fu: (r) => paint(11, 11, (g) => { // 斗方"福"
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (Math.abs(x - 5) + Math.abs(y - 5) <= 5) g.px(x, y, R.red[2]);
    glyph(g, r, 3, 3, R.gold[3], 5);
  }),

  flag: () => paint(10, 26, (g) => { // 幌子：红布 + 铜环 + 飘带
    g.rect(3, 0, 4, 2, R.gold[3]);
    g.rect(1, 2, 8, 14, R.red[2]); g.rect(1, 2, 2, 14, R.red[3]);
    g.rect(2, 6, 6, 1, R.gold[3]); g.rect(2, 11, 6, 1, R.gold[3]);
    for (const x of [1, 4, 7]) g.rect(x, 16, 2, 9 - (x % 3), R.red[1]);
  }),

  gourd: () => paint(11, 16, (g) => { // 药铺葫芦招幌
    g.px(5, 0, R.red[3]);
    for (let y = 1; y < 16; y++) for (let x = 0; x < 11; x++) {
      const top = Math.hypot(x - 5, y - 4) < 3.2, bottom = Math.hypot(x - 5, y - 10.5) < 5;
      if (top || bottom) g.px(x, y, x < 4 ? R.gold[4] : x > 7 ? R.gold[2] : R.gold[3]);
    }
    g.rect(2, 7, 7, 1, R.red[2]);
  }),

  cornString: () => paint(7, 29, (g) => { // 屋檐下挂的玉米串
    g.rect(3, 0, 1, 3, R.wood[2]);
    for (let y = 3; y < 28; y += 4) for (const dx of [0, 3]) { g.rect(dx, y, 3, 4, R.gold[3]); g.px(dx, y, R.gold[4]); g.px(dx + 2, y + 3, R.gold[2]); }
  }),

  chiliString: () => paint(5, 25, (g) => {
    g.rect(2, 0, 1, 2, R.wood[2]);
    for (let y = 2; y < 25; y += 2) { g.rect(1, y, 3, 2, y % 4 ? R.red[3] : R.red[2]); g.px(y % 4 ? 0 : 4, y + 1, R.red[1]); }
  }),

  herbRack: () => paint(16, 16, (g) => { // 晒药的竹匾（俯视圆）
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.5) continue;
      g.px(x, y, d > 6.5 ? R.wheat[1] : (x * 3 + y * 5) % 7 < 2 ? R.autumn[2] : (x + y) % 5 === 0 ? R.green[3] : R.wheat[2]);
    }
  }),

  bridgeSide: (r) => paint(90, 47, (g) => { // 石拱桥立面：毛石 + 半圆拱洞（透明）+ 一圈拱券石
    const cx = 45, spring = 40, rad = 26;
    g.rect(0, 0, 90, 47, R.stone[1]);
    for (let y = 0; y < 47; y += 5) for (let x = (y / 5) % 2 ? -4 : 0; x < 90; x += 8) { g.rect(x + 1, y + 1, 7, 4, r() > 0.4 ? R.stone[2] : R.stone[3]); g.px(x + 1, y + 1, R.stone[4]); }
    g.rect(0, 0, 90, 2, R.stone[4]);
    for (let y = 0; y < 47; y++) for (let x = 0; x < 90; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - spring;
      const d = y < spring ? Math.hypot(dx, dy) : Math.abs(dx);
      if (d <= rad) g.clear(x, y);
      else if (d <= rad + 3) g.px(x, y, Math.floor(Math.atan2(dy, dx) * 6) % 2 ? R.stone[3] : R.stone[2]);
    }
  }),

  willowSprig: () => paint(16, 10, (g) => { // 清明插柳：门楣上插一把柳枝，细条往下垂
    for (let i = 0; i < 6; i++) { const x = 2 + i * 2 + (i % 2); g.rect(x, 0, 1, 4 + (i * 3) % 6, R.khaki[3]); for (let y = 1; y < 4 + (i * 3) % 6; y += 2) g.px(x + (y % 4 ? 1 : -1), y, R.leaf[4]); }
    g.rect(1, 0, 14, 1, R.wood[2]);
  }),
  mugwort: () => paint(6, 18, (g) => { // 端午的艾草：一束青灰的叶子，红绳扎着
    for (let y = 0; y < 18; y++) { const w = y < 4 ? 2 : y < 12 ? 6 : 4; const x0 = Math.floor((6 - w) / 2); for (let x = x0; x < x0 + w; x++) if ((x + y) % 3) g.px(x, y, y % 4 < 2 ? R.green[3] : R.green[2]); }
    g.rect(1, 12, 4, 1, R.red[3]); g.rect(2, 13, 1, 5, R.green[1]); g.rect(3, 13, 1, 5, R.green[2]);
  }),
  scraps: (r) => paint(36, 36, (g) => { // 春节：门口放过鞭炮，一地红纸屑
    for (let i = 0; i < 70; i++) { const x = r() * 36, y = r() * 36; g.pxw(x, y, r() > 0.3 ? R.red[3] : R.red[2]); if (r() > 0.6) g.pxw(x + 1, y, R.red[2]); }
    for (let i = 0; i < 6; i++) g.pxw(r() * 36, r() * 36, R.gold[3]);
  }),
  blob: () => paint(16, 8, (g) => {
    g.rect(3, 0, 10, 8, INK); g.rect(1, 1, 14, 6, INK); g.rect(0, 2, 16, 4, INK);
  }),
};

// 亮着灯的窗、灯笼、炉火：不受光材质，黄昏里是画面的暖色焦点
const lit = {
  windowLit: () => paint(27, 22, (g) => {
    g.rect(0, 0, 27, 22, R.redwood[1]);
    g.rect(2, 2, 23, 18, GLOW.window);
    g.rect(2, 2, 10, 8, GLOW.windowHi);
    for (let x = 2; x < 25; x += 4) g.rect(x, 2, 1, 18, R.redwood[1]);
    for (let y = 2; y < 20; y += 4) g.rect(2, y, 23, 1, R.redwood[1]);
    g.rect(11, 8, 5, 5, R.red[2]); g.px(13, 10, GLOW.window);
  }),
  lantern: () => paint(4, 4, (g) => { g.rect(0, 0, 4, 4, GLOW.lantern); g.rect(1, 0, 1, 4, GLOW.lanternCore); }),
  fire: () => paint(8, 8, (g) => { g.rect(0, 0, 8, 8, GLOW.fire); g.rect(2, 2, 4, 4, GLOW.fireCore); }),
};

// 发光贴图（叠加混合）：亮度按像素台阶一圈圈衰减，是像素版的 bloom
const glows = {
  halo: () => paint(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 2.5) g.px(x, y, '#a07a3a'); // 暖黄，不往红里偏（叠加混合，几盏叠一起就是一片红）
      else if (d < 4.5) g.px(x, y, '#6a4c24');
      else if (d < 7.5 && (x + y) % 2 === 0) g.px(x, y, '#3a2a14');
    }
  }),
  firefly: () => paint(3, 3, (g) => {
    g.px(1, 1, GLOW.firefly);
    g.px(0, 1, '#4a5a20'); g.px(2, 1, '#4a5a20'); g.px(1, 0, '#4a5a20'); g.px(1, 2, '#4a5a20');
  }),
  ember: () => paint(2, 2, (g) => { g.px(0, 0, GLOW.fireCore); g.px(1, 1, GLOW.fire); }),
  flame: () => paint(8, 11, (g) => { // 火苗：外焰橙、内焰黄白
    const rows = ['...o....', '..oo....', '..ooo...', '.ooyo...', '.oyyoo..', 'ooyyyo..', 'oyywyoo.', 'oywwwyo.', 'oywwwyo.', '.oyyyo..', '..ooo...'];
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') g.px(x, y, { o: '#c85a20', y: '#ffb040', w: '#fff0b0' }[c]); }));
  }),
  groundGlow: () => paint(32, 32, (g) => { // 地面光斑：一圈圈台阶状变暗，最外圈抖动
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      if (d < 0.3) g.px(x, y, '#5a3214');
      else if (d < 0.55) g.px(x, y, '#3e220e');
      else if (d < 0.8) g.px(x, y, '#28160a');
      else if (d < 1 && (x + y) % 2 === 0) g.px(x, y, '#1a0e06');
    }
  }),
};

/** 一次性生成全部贴图与材质。M.tex 里留着贴图本身（动画要改 offset）。 */
/**
 * 露天电影：几帧像素画，放的时候轮着换（颜色偏淡、有几道竖划痕，像老胶片）。
 */
const MOVIE = [
  (g) => { // 山水：太阳、远山、河
    g.rect(0, 0, 48, 22, '#9ab4c8'); g.rect(0, 0, 48, 6, '#b4c8d4');
    g.rect(34, 3, 5, 5, '#f0e0b0');
    for (let x = 0; x < 48; x++) { const h = 9 + Math.round(Math.sin(x * 0.25) * 3 + Math.sin(x * 0.6) * 1.5); g.rect(x, h, 1, 22 - h, '#6a7a7a'); }
    for (let x = 0; x < 48; x++) { const h = 14 + Math.round(Math.sin(x * 0.18 + 1) * 2); g.rect(x, h, 1, 22 - h, '#4a5a52'); }
    g.rect(0, 18, 48, 4, '#8aa0b0'); g.rect(4, 19, 17, 1, '#c0d0d8');
  },
  (g) => { // 骑马的人跑过草原
    g.rect(0, 0, 48, 22, '#c8c0a0'); g.rect(0, 15, 48, 7, '#8a8a5a');
    g.rect(18, 9, 12, 5, '#4a3a2a'); g.rect(28, 6, 3, 5, '#4a3a2a'); g.rect(30, 6, 3, 2, '#4a3a2a');
    for (const lx of [19, 22, 26, 29]) g.rect(lx, 14, 1, 3, '#4a3a2a');
    g.rect(22, 3, 3, 6, '#7a2a2a'); g.rect(22, 1, 3, 2, '#e0b090'); g.rect(18, 10, 4, 1, '#2a2a2a');
  },
  (g) => { // 戏台上两个人对唱
    g.rect(0, 0, 48, 22, '#5a2a2a'); g.rect(0, 17, 48, 5, '#8a5a3a');
    g.rect(13, 6, 6, 11, '#c84a3a'); g.rect(14, 2, 4, 4, '#f0d0a0'); g.rect(12, 1, 8, 2, '#2a2a2a'); g.rect(9, 8, 4, 1, '#f0d0a0');
    g.rect(29, 6, 6, 11, '#3a5aa0'); g.rect(30, 2, 4, 4, '#f0d0a0'); g.rect(29, 1, 6, 2, '#e8c050'); g.rect(35, 9, 4, 1, '#f0d0a0');
  },
  (g) => { // 一张大脸的特写
    g.rect(0, 0, 48, 22, '#3a3a40'); g.rect(16, 2, 16, 18, '#e0b890'); g.rect(16, 1, 16, 4, '#2a2a2a');
    g.rect(19, 9, 3, 2, '#2a2a2a'); g.rect(26, 9, 3, 2, '#2a2a2a'); g.rect(22, 15, 4, 1, '#a04a3a');
  },
].map((draw) => (g) => {
  draw(g);
  for (const x of [7, 31, 44]) for (let y = 0; y < 22; y += 3) g.px(x, y, '#e8e4dc'); // 胶片划痕
});

// ---------------------------------------------------------------- 季节版的地皮、屋顶、水面（见 season.js）

/** 一片雪：底色 + 亮的雪团 + 发蓝的低洼处；dots：雪里露出来的东西 [[颜色, 个数, 宽, 高]]。 */
function snowField(g, r, w, h, dots = []) {
  g.rect(0, 0, w, h, R.snow[3]);
  for (let i = 0; i < (w * h) / 90; i++) g.rectw(r() * w, r() * h, 4, 2, R.snow[4]);
  for (let i = 0; i < (w * h) / 160; i++) g.rectw(r() * w, r() * h, 3, 1, R.snow[2]);
  for (const [c, n, dw, dh] of dots) for (let i = 0; i < n; i++) g.rectw(r() * w, r() * h, dw, dh, c);
}

const SEASON_TILES = {
  winter: {
    grass: (r) => paint(36, 36, (g) => snowField(g, r, 36, 36, [[R.grass[3], 5, 1, 2], [R.grass[2], 4, 2, 1]])), // 雪地，零星露出几根枯草
    roof: () => paint(16, 16, (g) => { // 瓦垄上压着雪：瓦沟发蓝，零星露出瓦头
      for (let x = 0; x < 16; x++) g.rect(x, 0, 1, 16, x % 4 === 0 ? R.snow[2] : x % 4 === 2 ? R.snow[4] : R.snow[3]);
      for (let k = 0; k < 4; k++) g.rect(k * 4, 13 + (k % 2), 1, 2, R.roof[2]);
    }),
    ridge: () => paint(16, 16, (g) => { g.rect(0, 0, 16, 16, R.snow[3]); g.rect(0, 0, 16, 3, R.snow[4]); g.rect(0, 12, 16, 4, R.roof[1]); g.rect(0, 11, 16, 1, R.snow[2]); }),
    flatRoof: (r) => paint(36, 36, (g) => snowField(g, r, 36, 36, [[R.loess[2], 3, 2, 1]])),
    slate: (r) => paint(16, 16, (g) => snowField(g, r, 16, 16, [[R.stone[2], 3, 2, 1]])),
    water: () => paint(36, 36, (g) => { // 结了冰的溪：发蓝的冰面、几道裂纹、几块积雪
      g.rect(0, 0, 36, 36, R.ice[2]);
      for (const [x, y, w] of [[2, 4, 9], [20, 9, 7], [6, 20, 11], [24, 27, 8]]) g.rectw(x, y, w, 1, R.ice[3]);
      for (const [x, y] of [[14, 2], [3, 13], [28, 16], [16, 31]]) { for (let k = 0; k < 5; k++) g.pxw(x + k, y + (k % 2), R.ice[1]); }
      for (const [x, y] of [[26, 3], [9, 27], [31, 22]]) { g.rectw(x, y, 4, 2, R.snow[3]); g.rectw(x + 1, y, 2, 1, R.snow[4]); }
    }),
    street: (r) => paint(36, 36, (g) => { // 踩实了的雪路：中间两道车辙、脚印露出黄土，路边是雪
      g.rect(0, 0, 36, 36, R.snow[2]);
      for (let i = 0; i < 14; i++) g.rectw(r() * 36, r() * 36, 3, 2, R.snow[3]);
      for (const x of [9, 26]) for (let y = 0; y < 36; y++) if ((y * 7 + x) % 9 < 6) g.px(x + ((y >> 3) % 2), y, R.dirt[3]);
      for (let i = 0; i < 10; i++) g.rectw(r() * 36, r() * 36, 2, 1, R.dirt[2]);
    }),
    threshing: (r) => paint(36, 36, (g) => snowField(g, r, 36, 36, [[R.wheat[3], 4, 2, 1]])),
    veg: (r) => paint(36, 36, (g) => { snowField(g, r, 36, 36); for (let y = 4; y < 36; y += 6) g.rect(0, y, 36, 1, R.snow[2]); }), // 菜收完了，雪下一垄垄的印子
    strawTop: (r) => paint(16, 16, (g) => snowField(g, r, 16, 16, [[R.wheat[2], 3, 1, 2]])), // 草顶、草垛顶上的雪（别的季节 strawTop 就是 straw）
  },
  spring: {
    grass: (r) => paint(36, 36, (g) => { // 返青的草：野花星星点点
      g.rect(0, 0, 36, 36, R.grass[3]);
      for (let i = 0; i < 12; i++) g.rectw(r() * 36, r() * 36, 3, 1, R.grass[2]);
      for (let i = 0; i < 10; i++) { const x = r() * 36, y = r() * 36; g.pxw(x, y, R.grass[4]); g.pxw(x - 1, y + 1, R.grass[4]); g.pxw(x + 1, y + 1, R.grass[2]); }
      for (let i = 0; i < 7; i++) g.pxw(r() * 36, r() * 36, [R.gold[4], R.blossom[3], R.white[3]][i % 3]);
    }),
    threshing: (r) => paint(36, 36, (g) => { g.rect(0, 0, 36, 36, R.loess[4]); for (let i = 0; i < 8; i++) g.rectw(r() * 36, r() * 36, 3, 1, R.loess[3]); for (let i = 0; i < 5; i++) g.rectw(r() * 36, r() * 36, 2, 1, R.grass[3]); }),
    veg: () => paint(36, 36, (g) => { // 菜地：刚移栽的小苗
      g.rect(0, 0, 36, 36, R.dirt[2]);
      for (let y = 0; y < 36; y += 6) { g.rect(0, y + 4, 36, 2, R.dirt[1]); for (let x = (y / 6) % 2 ? 3 : 0; x < 36; x += 6) { g.rect(x + 2, y + 1, 2, 2, R.cabbage[3]); g.px(x + 2, y + 1, R.cabbage[4]); } }
    }),
  },
  summer: {},
};

const SEASON_FIELD_TILES = {
  winter: {
    furrow: (r) => paint(18, 18, (g) => { snowField(g, r, 18, 18); for (const y0 of [4, 13]) for (let x = 0; x < 18; x += 3) g.px(x, y0, R.snow[2]); }), // 雪盖着的地，垄的印子
    stubbleW: (r) => paint(18, 18, (g) => { snowField(g, r, 18, 18); for (const y0 of [2, 11]) for (let x = (y0 % 2); x < 18; x += 3) { g.px(x, y0, R.wheat[3]); g.px(x, y0 + 1, R.wheat[2]); } }), // 雪里露出一行行谷茬
    sprout: (r) => paint(18, 18, (g) => { snowField(g, r, 18, 18); for (const y0 of [3, 12]) for (let x = 1; x < 18; x += 4) g.px(x, y0, R.cabbage[2]); }), // 盖着雪的麦苗（"冬天麦盖三层被"）
  },
  spring: {
    furrow: () => paint(18, 18, (g) => { // 刚耕过、种下的地：湿润的黑土垄，垄背上一溜细苗
      for (let y = 0; y < 18; y++) g.rect(0, y, 18, 1, y % 9 === 0 ? R.dirt[3] : y % 9 < 5 ? R.dirt[2] : y % 9 < 8 ? R.dirt[1] : R.dirt[0]);
      for (const y0 of [2, 11]) for (let x = 0; x < 18; x += 3) g.px(x, y0, R.cabbage[3]);
    }),
    stubbleW: () => paint(18, 18, (g) => { // 返青的冬小麦：一行行绿油油的麦苗
      g.rect(0, 0, 18, 18, R.dirt[2]);
      for (const y0 of [0, 9]) { g.rect(0, y0, 18, 5, R.cabbage[2]); for (let x = 0; x < 18; x += 2) { g.px(x, y0, R.cabbage[4]); g.px(x + 1, y0 + 2, R.cabbage[3]); } }
    }),
    sprout: () => paint(18, 18, (g) => {
      g.rect(0, 0, 18, 18, R.dirt[2]);
      for (const y0 of [0, 9]) { g.rect(0, y0, 18, 5, R.cabbage[2]); for (let x = 0; x < 18; x += 2) { g.px(x, y0, R.cabbage[4]); g.px(x + 1, y0 + 2, R.cabbage[3]); } }
    }),
  },
  summer: {
    furrow: (r) => paint(18, 18, (g) => { // 青纱帐底下：松土垄，垄沟里冒着青草
      for (let y = 0; y < 18; y++) g.rect(0, y, 18, 1, y % 9 < 5 ? R.dirt[3] : y % 9 < 8 ? R.dirt[2] : R.dirt[1]);
      for (let i = 0; i < 8; i++) g.rectw(r() * 18, Math.floor(r() * 2) * 9 + 6, 2, 1, R.grass[3]);
    }),
    stubbleW: () => paint(18, 18, (g) => { // 熟透的麦地：金黄的麦穗一行行
      g.rect(0, 0, 18, 18, R.wheat[2]);
      for (let y = 0; y < 18; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < 18; x += 3) { g.px(x, y, R.wheat[4]); g.px(x + 1, y + 1, R.wheat[3]); }
    }),
    sprout: () => paint(18, 18, (g) => {
      g.rect(0, 0, 18, 18, R.wheat[2]);
      for (let y = 0; y < 18; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < 18; x += 3) { g.px(x, y, R.wheat[4]); g.px(x + 1, y + 1, R.wheat[3]); }
    }),
  },
};

const SEASON_WEST_TILES = {
  winter: {
    rockTop: (r) => paint(36, 36, (g) => snowField(g, r, 36, 36, [[R.rock[3], 6, 5, 3], [R.rock[2], 4, 3, 1]])),
    litter: (r) => paint(36, 36, (g) => snowField(g, r, 36, 36, [[R.wood[2], 6, 3, 1], [R.dirt[2], 4, 2, 1]])), // 林下的雪，落着枯枝
    fall: (r) => paint(18, 36, (g) => { // 冻住的瀑布：一道道冰挂
      g.rect(0, 0, 18, 36, R.ice[3]);
      for (let x = 0; x < 18; x += 2) { const len = 10 + Math.floor(r() * 24); for (let k = 0; k < len; k++) g.px(x + (x % 4 ? 1 : 0), k, k < len - 3 ? R.ice[4] : R.ice[2]); }
      for (let i = 0; i < 4; i++) g.rectw(r() * 18, r() * 36, 1, 5, R.ice[1]);
    }),
  },
  spring: {
    litter: (r) => paint(36, 36, (g) => { // 林下：青苔、新草、野花
      g.rect(0, 0, 36, 36, R.dirt[2]);
      for (let i = 0; i < 16; i++) g.rectw(r() * 36, r() * 36, 4, 2, R.grass[2 + (i % 2)]);
      for (let i = 0; i < 8; i++) g.pxw(r() * 36, r() * 36, [R.blossom[3], R.gold[4], R.white[3]][i % 3]);
    }),
  },
  summer: {
    litter: (r) => paint(36, 36, (g) => { g.rect(0, 0, 36, 36, R.dirt[2]); for (let i = 0; i < 20; i++) g.rectw(r() * 36, r() * 36, 4, 2, R.grass[1 + (i % 3)]); }),
  },
};

export function buildMaterials(seed = 7) {
  const r = makeRng(seed);
  const tex = {};
  const tiles = { ...TILES, ...SEASON_TILES[season()] };
  for (const [k, fn] of Object.entries(tiles)) tex[k] = toTexture(fn(r), { tile: true });
  for (const [k, fn] of Object.entries(decals)) tex[k] = toTexture(fn(r));
  for (const [k, fn] of Object.entries(lit)) tex[k] = toTexture(fn(r));
  for (const [k, fn] of Object.entries(glows)) tex[k] = toTexture(fn(r));

  const M = { tex };
  for (const k of Object.keys(tiles)) M[k] = toon(tex[k]);
  for (const k of Object.keys(decals)) M[k] = toon(tex[k], { alphaTest: 0.5 });
  for (const k of Object.keys(lit)) M[k] = flat(tex[k]);
  M.herbRack = toon(tex.herbRack, { alphaTest: 0.5, side: THREE.DoubleSide });
  tex.scraps.wrapS = tex.scraps.wrapT = THREE.RepeatWrapping; tex.scraps.repeat.set(0.5, 0.5); // 鞭炮碎屑铺在地上（按米平铺，36 像素 = 2 米）
  M.bridgeSide = toon(tex.bridgeSide, { alphaTest: 0.5, side: THREE.DoubleSide });
  M.voxel = toon(null, { vertexColors: true }); // 体素（人物、动物、树）：颜色在顶点上
  M.blob = flat(tex.blob, { transparent: true, opacity: 0.35, depthWrite: false });
  M.deepWater = flat(tex.deepWater);
  // 圆形光晕用 THREE.Sprite（永远正对相机），左右眼各自正对也无妨
  const additive = (map, opacity = 1) => pixelize(new THREE.SpriteMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity }));
  M.haloSprite = additive(tex.halo);
  M.fireflySprite = additive(tex.firefly);
  M.emberSprite = additive(tex.ember);
  M.flameSprite = additive(tex.flame);
  M.groundGlow = glow(tex.groundGlow);
  M.windowHalo = additive(tex.halo, 0.5);
  M.glow = glow;
  M.movie = MOVIE.map((f) => flat(toTexture(paint(48, 22, f)))); // 露天电影的几帧
  M.strawTop ??= M.straw;
  addFieldMaterials(M);
  return M;
}

// ---------------------------------------------------------------- 西沟：红砂岩崖壁、林下落叶、跌水、晒秋
// 单独一个随机数种子，加了这些不会挪动村子贴图的随机花纹

const westTiles = {
  cliff: (r) => paint(72, 72, (g) => { // 崖壁：一层层微微起伏的红砂岩，层顶受光亮一线；零星几道竖向节理、几条雨水冲出的暗痕
    const bands = [];
    for (let y = 0; y < 72;) {
      const t = Math.min(72 - y, 3 + Math.floor(r() * 7));
      bands.push({ y, t, c: [R.rock[3], R.rock[3], R.rock[4], R.rock[2]][Math.floor(r() * 4)] });
      y += t;
    }
    const at = (yy) => bands.find((b) => yy >= b.y && yy < b.y + b.t);
    const p1 = r() * 6, p2 = r() * 6;
    for (let x = 0; x < 72; x++) {
      const wave = Math.round(Math.sin((x / 72) * Math.PI * 2 + p1) * 1.4 + Math.sin((x / 72) * Math.PI * 6 + p2) * 0.7); // 周期整除 72，左右能无缝接上
      for (let y = 0; y < 72; y++) {
        const yy = (((y - wave) % 72) + 72) % 72, b = at(yy), k = yy - b.y;
        g.px(x, y, k === 0 ? (b.c === R.rock[4] ? R.rock[5] : R.rock[4]) : k === b.t - 1 && b.t > 3 ? R.rock[2] : b.c);
      }
    }
    for (let i = 0; i < 7; i++) { const x = r() * 72, y = r() * 72, len = 3 + r() * 8; for (let k = 0; k < len; k++) g.pxw(x + Math.floor(k / 4), y + k, R.rock[1]); } // 节理
    for (let i = 0; i < 4; i++) { const x = Math.floor(r() * 72), y = r() * 72, len = 10 + r() * 22; for (let k = 0; k < len; k += 1 + (k % 3 === 2 ? 1 : 0)) g.pxw(x, y + k, R.rock[2]); } // 雨痕
  }),
  rockTop: (r) => paint(36, 36, (g) => { // 崖顶：裸岩 + 石缝里的草
    g.rect(0, 0, 36, 36, R.rock[3]);
    for (let i = 0; i < 7; i++) g.rectw(r() * 36, r() * 36, 6, 4, R.rock[4]);
    for (let i = 0; i < 8; i++) g.rectw(r() * 36, r() * 36, 4, 1, R.rock[2]);
    for (let i = 0; i < 9; i++) { const x = r() * 36, y = r() * 36; g.rectw(x, y, 3, 2, R.grass[2]); g.pxw(x + 1, y, R.grass[3]); }
  }),
  litter: (r) => paint(36, 36, (g) => { // 林下：落叶盖着的土，夹几丛草
    g.rect(0, 0, 36, 36, R.dirt[2]);
    for (let i = 0; i < 10; i++) g.rectw(r() * 36, r() * 36, 4, 2, R.grass[2]);
    for (let i = 0; i < 16; i++) g.rectw(r() * 36, r() * 36, 2, 1, [R.autumn[3], R.red[2], R.harvest[3], R.dirt[3]][Math.floor(r() * 4)]);
    for (let i = 0; i < 6; i++) g.rectw(r() * 36, r() * 36, 3, 1, R.dirt[1]);
  }),
  fall: (r) => paint(18, 36, (g) => { // 跌水：竖着的水纹（往下滚动）
    g.rect(0, 0, 18, 36, R.water[3]);
    for (let x = 0; x < 18; x += 2) {
      const y0 = Math.floor(r() * 36), len = 6 + Math.floor(r() * 14);
      for (let k = 0; k < len; k++) g.pxw(x + (x % 4 ? 1 : 0), y0 + k, k < 2 ? R.white[3] : R.water[4]);
    }
    for (let i = 0; i < 6; i++) g.rectw(r() * 18, r() * 36, 1, 4, R.water[2]);
  }),
  persimmonMat: (r) => paint(18, 18, (g) => { // 竹匾上摊开的柿饼
    g.rect(0, 0, 18, 18, R.wheat[2]);
    for (let y = 0; y < 18; y += 3) g.rect(0, y, 18, 1, R.wheat[1]);
    for (let i = 0; i < 9; i++) { const x = r() * 18, y = r() * 18; g.rectw(x, y, 3, 3, R.autumn[3]); g.pxw(x, y, R.autumn[4]); g.pxw(x + 2, y + 2, R.autumn[2]); }
  }),
  hawthornMat: (r) => paint(18, 18, (g) => { // 晒山楂片：红点点
    g.rect(0, 0, 18, 18, R.wheat[2]);
    for (let y = 0; y < 18; y += 3) g.rect(0, y, 18, 1, R.wheat[1]);
    for (let i = 0; i < 22; i++) { const x = r() * 18, y = r() * 18; g.rectw(x, y, 2, 2, R.red[2]); g.pxw(x, y, R.red[3]); }
  }),
};

// 庄稼地的地皮（村子和西沟共用）：垄沿着梯田（东西向），一米两垄（9 像素一垄：5 像素垄背、4 像素垄沟），和 farmland.js 按垄种的庄稼对得上
const fieldTiles = {
  furrow: (r) => paint(18, 18, (g) => { // 长着庄稼的地：松土的垄背 + 发暗的垄沟，零星落叶
    for (let y = 0; y < 18; y++) g.rect(0, y, 18, 1, y % 9 === 0 ? R.dirt[4] : y % 9 < 5 ? R.dirt[3] : y % 9 < 8 ? R.dirt[2] : R.dirt[1]);
    for (let i = 0; i < 5; i++) g.rectw(r() * 18, Math.floor(r() * 2) * 9 + 2, 2, 1, R.wheat[2]);
  }),
  stubbleW: () => paint(18, 18, (g) => { // 割完的谷子地：垄背上一行行齐刷刷的谷茬
    for (let y = 0; y < 18; y++) g.rect(0, y, 18, 1, y % 9 < 5 ? R.dirt[3] : y % 9 < 8 ? R.dirt[2] : R.dirt[1]);
    for (const y0 of [1, 10]) for (let x = (y0 % 2); x < 18; x += 2) { g.px(x, y0, R.wheat[4]); g.px(x, y0 + 1, R.wheat[3]); g.px(x + 1, y0 + 2, R.wheat[2]); }
  }),
  sprout: () => paint(18, 18, (g) => { // 刚出苗的冬小麦：深色的地，一行行细细的青苗
    g.rect(0, 0, 18, 18, R.dirt[2]);
    for (let y = 0; y < 18; y += 3) { g.rect(0, y + 2, 18, 1, R.dirt[1]); for (let x = (y / 3) % 2; x < 18; x += 2) { g.px(x, y, R.cabbage[3]); g.px(x, y + 1, R.cabbage[2]); } }
  }),
  snowPlain: () => paint(8, 8, (g) => { g.rect(0, 0, 8, 8, R.snow[3]); g.rect(0, 0, 8, 2, R.snow[4]); g.rect(1, 5, 3, 1, R.snow[2]); }), // 雪人
};

const westDecals = {
  persimmonString: () => paint(7, 27, (g) => { // 屋檐下挂的柿子串
    g.rect(3, 0, 1, 27, R.wood[2]);
    for (let y = 2; y < 26; y += 4) for (const dx of [0, 4]) { g.rect(dx, y, 3, 3, R.autumn[3]); g.px(dx, y, R.autumn[4]); g.px(dx + 1, y - 1, R.green[2]); }
  }),
};

// ---------------------------------------------------------------- 老村址（东边）：卵石河滩、沙洲、冲出来的黄土坎

const eastTiles = {
  gravel: (r) => paint(36, 36, (g) => { // 卵石滩：灰白的圆石头一颗挨一颗，石缝里是沙
    g.rect(0, 0, 36, 36, R.loess[3]);
    for (let i = 0; i < 70; i++) { const x = r() * 36, y = r() * 36, w = 2 + Math.floor(r() * 3), c = [R.stone[3], R.stone[3], R.stone[4], R.stone[2], R.white[2]][Math.floor(r() * 5)]; g.rectw(x, y, w, 2, c); g.pxw(x, y, R.stone[4]); g.rectw(x, y + 2, w, 1, R.stone[1]); }
  }),
  sand: (r) => paint(36, 36, (g) => { // 河心洲：细沙，水冲出一道道波纹
    g.rect(0, 0, 36, 36, R.loess[4]);
    for (let y = 2; y < 36; y += 5) for (let x = 0; x < 36; x++) if ((x + y * 3) % 7 < 4) g.px(x, y + (Math.floor(x / 6) % 2), R.loess[3]);
    for (let i = 0; i < 10; i++) g.pxw(r() * 36, r() * 36, R.stone[3]);
  }),
  bankWall: (r) => paint(36, 36, (g) => { // 大水冲出来的黄土坎：竖着的土层、雨水冲出的沟，夹着几块露出来的石头和草根
    g.rect(0, 0, 36, 36, R.loess[3]);
    for (let y = 0; y < 36; y += 4 + Math.floor(r() * 3)) g.rect(0, y, 36, 1, R.loess[2]);
    for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 36), len = 8 + r() * 20; for (let k = 0; k < len; k++) g.pxw(x + (k % 5 === 4 ? 1 : 0), r() * 3 + k, R.loess[1]); }
    for (let i = 0; i < 5; i++) g.rectw(r() * 36, r() * 36, 3, 2, R.stone[2]);
    for (let i = 0; i < 4; i++) g.rectw(r() * 36, 0, 1, 3, R.grass[2]);
  }),
  thatch: (r) => paint(18, 18, (g) => { // 苫房的茅草
    g.rect(0, 0, 18, 18, R.wheat[2]);
    for (let i = 0; i < 40; i++) g.rectw(r() * 18, r() * 18, 1, 4, [R.wheat[3], R.wheat[1], R.harvest[2]][i % 3]);
  }),
};
const SEASON_EAST_TILES = {
  winter: {
    gravel: (r) => paint(36, 36, (g) => snowField(g, r, 36, 36, [[R.stone[3], 14, 2, 1], [R.stone[2], 8, 2, 1]])),
    sand: (r) => paint(36, 36, (g) => snowField(g, r, 36, 36, [[R.loess[3], 6, 3, 1]])),
    thatch: (r) => paint(18, 18, (g) => snowField(g, r, 18, 18, [[R.wheat[2], 6, 1, 2]])),
  },
};

/** 老村址用的材质，加进村子的 M。 */
export function addEastMaterials(M, seed = 53) {
  const r = makeRng(seed);
  for (const [k, fn] of Object.entries({ ...eastTiles, ...SEASON_EAST_TILES[season()] })) { M.tex[k] = toTexture(fn(r), { tile: true }); M[k] = toon(M.tex[k]); }
  return M;
}

/** 庄稼地的地皮：自己一个随机数种子，buildMaterials 最后加进来（不挪动前面贴图的随机花纹）。 */
function addFieldMaterials(M, seed = 47) {
  const r = makeRng(seed);
  for (const [k, fn] of Object.entries({ ...fieldTiles, ...SEASON_FIELD_TILES[season()] })) { M.tex[k] = toTexture(fn(r), { tile: true }); M[k] = toon(M.tex[k]); }
}

/** 西沟用的材质，加进村子的 M（和村子共用一套，夜里窗户、灯笼跟着一起变）。 */
export function addWestMaterials(M, seed = 31) {
  const r = makeRng(seed);
  for (const [k, fn] of Object.entries({ ...westTiles, ...SEASON_WEST_TILES[season()] })) { M.tex[k] = toTexture(fn(r), { tile: true }); M[k] = toon(M.tex[k]); }
  for (const [k, fn] of Object.entries(westDecals)) { M.tex[k] = toTexture(fn(r)); M[k] = toon(M.tex[k], { alphaTest: 0.5, side: THREE.DoubleSide }); }
  return M;
}
