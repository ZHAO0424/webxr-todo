import * as THREE from 'three';
import { R, GLOW, INK } from './palette.js';
import { makeRng, paint, toTexture, toon, flat, glow, pixelize } from './pixel.js';

// 画法约定（TPU = 18，一米 18 像素）：
// - 用成团的色块表现质感，不撒随机噪点；
// - 每种材质只用自己色阶里的 3~4 个颜色；
// - 受光面在左（夕阳从西边来）。
// 平铺贴图的画布尺寸 = 它代表的米数 × 18。

const tiles = {
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
      if (d < 2.5) g.px(x, y, '#a06030');
      else if (d < 4.5) g.px(x, y, '#6a3a20');
      else if (d < 7.5 && (x + y) % 2 === 0) g.px(x, y, '#3a2010');
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

export function buildMaterials(seed = 7) {
  const r = makeRng(seed);
  const tex = {};
  for (const [k, fn] of Object.entries(tiles)) tex[k] = toTexture(fn(r), { tile: true });
  for (const [k, fn] of Object.entries(decals)) tex[k] = toTexture(fn(r));
  for (const [k, fn] of Object.entries(lit)) tex[k] = toTexture(fn(r));
  for (const [k, fn] of Object.entries(glows)) tex[k] = toTexture(fn(r));

  const M = { tex };
  for (const k of Object.keys(tiles)) M[k] = toon(tex[k]);
  for (const k of Object.keys(decals)) M[k] = toon(tex[k], { alphaTest: 0.5 });
  for (const k of Object.keys(lit)) M[k] = flat(tex[k]);
  M.herbRack = toon(tex.herbRack, { alphaTest: 0.5, side: THREE.DoubleSide });
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
  return M;
}
