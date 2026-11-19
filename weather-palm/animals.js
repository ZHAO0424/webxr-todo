// 掌心气象台 · 动物模型（照像素村落的做法：侧视像素画 → 按到轮廓的距离"充气"成体素）
//
// 每种动物一张侧视像素画（面朝右），身体 + 两套腿 = 两帧走路；第三帧"低头"（吃草 / 喝水 / 啄食）是把头那几列往下挪两格。
// 充气：每个像素到轮廓的距离越远越厚（中间鼓、边上薄），再按体素建网格（带四角 AO）。
// 颜色都保持在中灰以上——光学透视眼镜里暗 = 看不见。全部自己画的，不用现成素材。
import * as THREE from 'three';
import { voxelGeometry } from './art.js';

export const AP = 0.00045;  // 动物像素画的一格（0.45 mm；整体比树小得多，比例照真实体型、小动物略夸大才看得见）

// keys：字符 → 颜色；body：身体（面朝右，从上往下）；legs：两帧腿（接在身体下面）；head：头从第几列开始（低头帧挪这些列）；plump：最厚几格；scale：整体缩放
export const ANIMAL_ART = {
  rabbit: {   // 野兔：灰褐、白肚皮、长耳朵
    keys: { f: '#a08870', F: '#84705c', w: '#eee8dc', k: '#3a302a', n: '#e0a0a0', e: '#d0a890' },
    body: [
      '.........fe.',
      '.........fe.',
      '........ffff',
      '........fkfn',
      '.wfffffffff.',
      'wwfffffffff.',
      '.wFfffffFw..',
      '..FFFFFFFw..',
    ],
    legs: [['..FF....Fw..'], ['...FF..Fw...']],
    head: 8, plump: 2, scale: 0.7,
  },
  deer: {     // 梅花鹿：栗色、背上一排白点、白肚皮、鹿角
    keys: { b: '#b07640', B: '#8e5e34', s: '#f2e6cc', w: '#f0e8d8', k: '#3a2a24', n: '#4a3a32', a: '#e6d8b8', h: '#6a5040' },
    body: [
      '.............a..a.',
      '.............aa.a.',
      '..............aa..',
      '.............bbbb.',
      '.............bkbbn',
      '.............bbbb.',
      '..w.........bbb...',
      '.wbbbbbbbbbbbbb...',
      '.bbsbbbsbbbsbbb...',
      '.bbbbsbbbbsbbbb...',
      '..bbbbbbbbbbbbB...',
      '..BwwwwwwwwwwBB...',
    ],
    legs: [['..B..B......B..B..', '..B..B......B..B..', '..B..B......B..B..', '..h..h......h..h..'],
           ['...BB........BB...', '...BB........BB...', '...BB........BB...', '...hh........hh...']],
    head: 12, plump: 2, scale: 1,
  },
  fox: {      // 赤狐：橙红、白胸、黑袜子、蓬松尾巴带白尖
    keys: { o: '#dc7430', O: '#bc5c28', w: '#f4eee4', k: '#2e2622', n: '#2e2622', b: '#5a4640', t: '#f4eee4' },
    body: [
      '..........o.o...',
      '..........ooo...',
      '..........okooon',
      '..........owwww.',
      'tooo.ooooooww...',
      'tooooooooooo....',
      '.too.OoooooO....',
      '......wwwww.....',
    ],
    legs: [['......b.b..b.b..', '......b.b..b.b..'], ['.......bb...bb...', '.......bb...bb...']],
    head: 10, plump: 2, scale: 0.8,
  },
  squirrel: { // 松鼠：红褐、大尾巴竖着卷、白肚皮
    keys: { r: '#c06c32', R: '#9c5a2c', w: '#f2e6d2', k: '#2e2622' },
    body: [
      '.rr......r.',
      'rrrr....rrr',
      'rRrr...rrkr',
      'rrRr...rrrw',
      '.rrr..rrrw.',
      '..rrrrrrrw.',
      '...rRrrrw..',
      '....RRRR...',
    ],
    legs: [['....R..R...'], ['.....RR....']],
    head: 7, plump: 2, scale: 0.5,
  },
  boar: {     // 野猪：灰褐、背上一溜深色鬃毛、白獠牙、粉鼻头
    keys: { g: '#8a7466', G: '#6e5e54', m: '#5e524c', t: '#f4eee0', k: '#2e2622', n: '#d4a69a' },
    body: [
      '...mmmmmm.......',
      '..ggggggggggg...',
      '.gggggggggggggg.',
      'gggggggggggggkgn',
      'ggggggggggggggtn',
      '.GgggggggggggGg.',
      '..GGGGGGGGGGGG..',
    ],
    legs: [['...G.G.....G.G..', '...G.G.....G.G..'], ['....GG......GG..', '....GG......GG..']],
    head: 12, plump: 3, scale: 1,
  },
  heron: {    // 苍鹭：灰白、黑冠羽、黄嘴、细长腿（站在湖边）
    keys: { w: '#eef0f4', g: '#aab2be', G: '#8c94a2', k: '#3a3a44', y: '#ecc458', l: '#d4aa58' },
    body: [
      '.......kkgg.....',
      '........gwwyyy..',
      '........ww......',
      '........ww......',
      '.......ww.......',
      '..gggggww.......',
      '.ggGggggw.......',
      'GGgggggww.......',
      '..ggggww........',
    ],
    legs: [['.....l..l.......', '.....l..l.......', '.....l..l.......', '....ll.ll.......'],
           ['.....l..l.......', '.....l..l.......', '.....l.l........', '....llll........']],
    head: 8, plump: 1, scale: 1,
  },
  goat: {     // 岩羊：米白、弯角、小胡子（峡谷里）
    keys: { w: '#eee8da', W: '#d4ccbc', h: '#b09878', k: '#3a302a', n: '#c8a89a', b: '#dcd4c4', f: '#7a6a5a' },
    body: [
      '..........hh...',
      '.........h.ww..',
      '..........wkww.',
      '..........wwwwn',
      '.w.......wwbb..',
      'wwwwwwwwwwwb...',
      'wWwwwwwwwww....',
      '.wwwwwwwwww....',
      '.WwwwwwwwWW....',
    ],
    legs: [['.W.W....W.W....', '.f.f....f.f....'], ['..WW.....WW....', '..ff.....ff....']],
    head: 9, plump: 2, scale: 0.95,
  },
  sheep: {    // 绵羊：一团米白的毛、深色的脸和腿（成群吃草）
    keys: { w: '#f4f0e6', W: '#dcd6c8', f: '#6a5e58', k: '#3a3230', n: '#e0b0a8' },
    body: [
      '..wWwwwWww....',
      '.wwwwwwwwwwff.',
      'wwwwwwwwwwwfkf',
      'wwwwwwwwwwwfff',
      'wwwwwwwwwww.fn',
      '.wwwwwwwwww...',
      '..WWWWWWWW....',
    ],
    legs: [['..f.f...f.f...', '..f.f...f.f...'], ['...ff....ff...', '...ff....ff...']],
    head: 11, plump: 3, scale: 0.9,
  },
  cow: {      // 奶牛：白底灰斑（不用纯黑：眼镜里黑 = 看不见）、粉鼻子、米色小角
    keys: { w: '#f2efe8', b: '#6a6068', k: '#2e2628', n: '#e8a8a0', h: '#e8dcc0' },
    body: [
      '............h..h',
      '............wbbw',
      '.bbwwwwwbbwwwbkb',
      'bbbwwwwbbbwwwwbb',
      'wwwwwbbwwwwwwwnn',
      'wwwbbbwwwwbbww..',
      'wwwwwwwwwwwwww..',
      '.wwwnnwwwwwwww..',
    ],
    legs: [['..w.w......w.w..', '..k.k......k.k..'], ['...ww......ww...', '...kk......kk...']],
    head: 12, plump: 3, scale: 1.35,
  },
  bear: {     // 棕熊：棕色、浅色口鼻（针叶林里，个子大）
    keys: { b: '#946a4a', B: '#78563c', m: '#cca882', k: '#2e2622' },
    body: [
      '.............bb..',
      '..bbbbbbbbbbbbbbb',
      '.bbbbbbbbbbbbbkbm',
      'bbbbbbbbbbbbbbbmm',
      'bbbbbbbbbbbbbbbb.',
      'bbbbbbbbbbbbbbB..',
      '.BbbbbbbbbbbbBB..',
      '..BBBBBBBBBBBB...',
    ],
    legs: [['..BB.BB....BB.BB.', '..BB.BB....BB.BB.'], ['...BBB......BBB..', '...BBB......BBB..']],
    head: 13, plump: 3, scale: 1.45,
  },
};

const toGrid = (rows, keys) => {
  const h = rows.length, wd = Math.max(...rows.map(r => r.length));
  return Array.from({ length: h }, (_, y) => Array.from({ length: wd }, (_, x) => keys[rows[y][x]] ?? null));
};
// 三帧：0、1 走路（两套腿），2 低头（头那几列整体往下挪两格）
function frames(art) {
  const out = [];
  for (let f = 0; f < 3; f++) {
    const legs = art.legs[f === 2 ? 0 : f];
    let g = toGrid([...art.body, ...legs], art.keys);
    if (f === 2) {
      const H = g.length, W = g[0].length, ng = Array.from({ length: H }, () => new Array(W).fill(null));
      const bodyH = art.body.length;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = g[y][x]; if (!c) continue;
        if (x >= art.head && y < bodyH) { const ny = Math.min(bodyH - 1, y + 2); if (!ng[ny][x]) ng[ny][x] = c; }
        else if (!ng[y][x]) ng[y][x] = c;
      }
      g = ng;
    }
    out.push(g);
  }
  return out;
}
// 充气：按到轮廓的距离（4 邻域距离变换），中间厚、边上薄
function inflate(g, plump) {
  const H = g.length, W = Math.max(...g.map(r => r.length));
  const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < W) ? g[y][x] : null;
  const dist = Array.from({ length: H }, () => new Array(W).fill(0)), q = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !at(x + dx, y + dy))) { dist[y][x] = 1; q.push([x, y]); }
  }
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (at(nx, ny) && !dist[ny][nx]) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); } }
  }
  const half = (x, y) => Math.min(plump, Math.round(dist[y][x] * 0.9));
  const cx = Math.floor(W / 2);
  const solid = (x, y, z) => { const ix = x + cx, iy = H - 1 - y; const c = at(ix, iy); return !!c && Math.abs(z) <= half(ix, iy); };
  const color = (x, y, z, f) => {
    const c = at(x + cx, H - 1 - y);
    if (!c) return null;
    // 面朝右（+x）的那侧眼睛 / 鼻子只画在两侧表面上，身体侧面的花纹也只在两侧——充气后中间那层用主色
    return [c, 4];
  };
  const geo = voxelGeometry([-cx - 1, 0, -plump - 1], [W - cx + 1, H, plump + 2], solid, color, AP, [0, 0, 0], true, true);
  geo.rotateY(-Math.PI / 2);   // 画的时候面朝 +x，模型约定面朝 +z
  return geo;
}
const cache = {};
// 某种动物的三帧几何
export function animalFrames(sp) {
  if (cache[sp]) return cache[sp];
  const art = ANIMAL_ART[sp];
  return (cache[sp] = frames(art).map(g => { const geo = inflate(g, art.plump); geo.scale(art.scale, art.scale, art.scale); return geo; }));
}
