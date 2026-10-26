import { R, INK } from './palette.js';

/*
 * 小动物：字符画侧视图（面朝右），身体 + 两套腿 = 两帧走路。
 * 第三帧是"低头"（啄食 / 吃草 / 闻地）——身体整体下沉 1 像素、头部再低 1 像素。
 * 每米 18 像素，体型略微夸张（Q 版），和人物比例协调。
 */

const ANIMALS = {
  dog: { // 中华田园犬（黄）
    keys: { y: R.loess[4], Y: R.loess[2], d: R.loess[1], e: R.loess[2], k: INK, n: INK, t: R.loess[3] },
    body: [
      '..........e.e.',
      '..........yyyy',
      '.t.......yykyn',
      '..t......yyyy.',
      '..tyyyyyyyYy..',
      '...yyyyyyyyy..',
      '...YyyyyyyYY..',
    ],
    legs: [['...Y.Y...Y.Y..', '...d.d...d.d..'], ['....YY....YY..', '....dd....dd..']],
  },
  dogBlack: {
    keys: { y: R.slate[3], Y: R.slate[2], d: R.slate[1], e: R.slate[1], k: R.gold[4], n: INK, t: R.slate[3], w: R.white[3] },
    body: [
      '..........e.e.',
      '..........yyyy',
      '.t.......yykyn',
      '..t......yyww.',
      '..tyyyyyyywy..',
      '...yyyyyyyyy..',
      '...YyyyyyyYY..',
    ],
    legs: [['...Y.w...Y.w..', '...d.d...d.d..'], ['....Yw....Yw..', '....dd....dd..']],
  },
  cat: { // 橘猫
    keys: { o: R.autumn[3], O: R.autumn[2], w: R.white[3], g: R.green[4], n: R.pink[3], t: R.autumn[3] },
    body: [
      '........o.o',
      '........ooo',
      't.......gon',
      't..oOoOoooo',
      '.tooooooww.',
      '..OoOoOoo..',
    ],
    legs: [['..o.o..o.o.'], ['...oo...oo.']],
  },
  hen: {
    keys: { w: R.white[3], W: R.white[2], r: R.red[3], k: INK, b: R.gold[3], f: R.gold[2] },
    body: ['....rr..', '...wwkb.', 'W..wwwr.', 'WWwwwww.', '.Wwwwww.', '..wWww..'],
    legs: [['..f..f..'], ['...ff...']],
  },
  henBrown: {
    keys: { w: R.mud[3], W: R.mud[2], r: R.red[3], k: INK, b: R.gold[3], f: R.gold[2] },
    body: ['....rr..', '...wwkb.', 'W..wwwr.', 'WWwwwww.', '.Wwwwww.', '..wWww..'],
    legs: [['..f..f..'], ['...ff...']],
  },
  rooster: {
    keys: { t: R.green[2], T: R.slate[2], G: R.gold[3], R: R.red[2], r: R.red[3], k: INK, b: R.gold[3], f: R.gold[2] },
    body: ['.....rr..', 't...GGkb.', 'tT..GGGr.', 'tTRRRGG..', '.tRRRRR..', '..RRRR...'],
    legs: [['..f..f...'], ['...ff....']],
  },
  duck: {
    keys: { w: R.white[3], W: R.white[2], k: INK, b: R.gold[3], f: R.gold[2] },
    body: ['....ww..', '....wkbb', '....ww..', 'w..wwww.', 'wwwwwww.', '.WwwwW..'],
    legs: [['..f..f..'], ['...ff...']],
  },
  goose: { // 大白鹅，橙色额瘤
    keys: { w: R.white[3], W: R.white[2], k: INK, O: R.autumn[3], f: R.autumn[3] },
    body: ['.......ww.', '.......wkO', '.......wwO', '.......ww.', '.......ww.', 'w....wwww.', 'wwwwwwwww.', '.Wwwwwwww.', '..WwwwwW..'],
    legs: [['...f..f...'], ['....ff....']],
  },
  pig: { // 黑猪
    keys: { p: R.slate[2], P: R.slate[3], s: R.pink[3], k: INK, t: R.slate[2] },
    body: ['............pp..', '.t.ppppppppppp..', 't.pPPPPPpppppkss', '..ppppppppppppss', '..pppppppppppp..', '...pppppppppp...'],
    legs: [['...p.p....p.p...'], ['....pp.....pp...']],
  },
  boar: { // 野猪：棕黑的鬃毛、脊背一道硬鬃、两颗白獠牙
    keys: { p: R.brown[2], P: R.brown[1], m: R.black[2], w: R.white[3], k: INK, t: R.brown[1] },
    body: ['....mmmmm.......', '.t.mmmmmmmmmpp..', 't.pPPpppppppkpww', '..pppppppppppppw', '..pppppppppppp..', '...PPpppppppP...'],
    legs: [['...p.p....p.p...'], ['....pp.....pp...']],
  },
  sheep: {
    keys: { w: R.white[3], W: R.white[2], f: R.slate[2], k: INK },
    body: ['...........ff.', '..wWwWwWw.fkff', '.wwwwwwwwwffff', 'WwWwWwWwWwwff.', '.wwwwwwwwwww..', '..WwWwWwWwW...'],
    legs: [['..f.f....f.f..', '..f.f....f.f..'], ['...ff.....ff..', '...ff.....ff..']],
  },
  donkey: {
    keys: { g: R.slate[3], G: R.slate[2], l: R.grey[2], e: R.slate[2], m: R.slate[1], k: INK, w: R.grey[3], t: R.slate[2] },
    body: [
      '..............e.e...',
      '..............eee...',
      '.............ggggg..',
      '.............ggkgg..',
      '............mggggwww',
      '...........mmgg..ww.',
      '..........mmggg.....',
      '.t.gggggggggggg.....',
      't.GggggggggggggG....',
      't.Gggggggggggggg....',
      '..GgglllllllllgG....',
      '...GGGgggggggGG.....',
    ],
    legs: [
      ['...gg.gg....gg.gg...', '...gg.gg....gg.gg...', '...kk.kk....kk.kk...'],
      ['....ggg......ggg....', '....ggg......ggg....', '....kkk......kkk....'],
    ],
  },
  ox: { // 黄牛：比驴高一头、身子长，肩上一块隆起，两只弯角
    keys: { y: R.mud[3], Y: R.mud[2], l: R.mud[4], h: R.white[2], k: INK, n: R.pink[2], t: R.mud[2] },
    body: [
      '........................h..h..',
      '........................hhhh..',
      '.................YYY....yyyy..',
      '...yyyyyyyyyyyyyyyyyyyyyyyyy..',
      '.tYyyyyyyyyyyyyyyyyyyyyyykyyy.',
      't.Yyyyyyyyyyyyyyyyyyyyyyyyyyyn',
      't.Yyyyyyyyyyyyyyyyyyyyyyyyyynn',
      't.YyyyyyyyyyyyyyyyyyyyyyY.....',
      '..YyyyllllllllllllyyyyYY......',
      '...YYyyyyyyyyyyyyyyyyYY.......',
      '....YYYYYYYYYYYYYYYYYY........',
    ],
    legs: [
      ['....yy.yy.........yy.yy.......', '....yy.yy.........yy.yy.......', '....yy.yy.........yy.yy.......', '....kk.kk.........kk.kk.......'],
      ['.....yyy...........yyy........', '.....yyy...........yyy........', '.....yyy...........yyy........', '.....kkk...........kkk........'],
    ],
  },
  magpie: { // 喜鹊（停着）
    keys: { b: R.black[2], w: R.white[3], t: R.indigo[3], k: R.white[3] },
    body: ['......bb.', '.....bbkb', '....bbbb.', 'tt.wwbbb.', '.ttwwwb..', '...bbb...'],
    legs: [['....b....'], ['....b....']],
  },
  pigeon: { // 鸽子（飞）：两帧翅膀上下
    keys: { g: R.grey[2], G: R.grey[1] },
    frames: [
      ['g.....g', '.g...g.', '..ggg..', '...G...'],
      ['.......', '..ggg..', '.g.G.g.', 'g.....g'],
    ],
  },
};

function rows2grid(rows, keys) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const c = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => keys[rows[y][x]] ?? null));
  return { w, h, c };
}

function withOutline({ w, h, c }) {
  const W = w + 2, H = h + 2;
  const out = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => c[y - 1]?.[x - 1] ?? null));
  const add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (out[y][x]) continue;
    if (out[y][x - 1] || out[y][x + 1] || out[y - 1]?.[x] || out[y + 1]?.[x]) add.push([x, y]);
  }
  for (const [x, y] of add) out[y][x] = INK;
  return { w: W, h: H, c: out };
}

/** 帧列表：[走 A, 走 B, 低头]。每帧是 { w, h, c }（已描边、等尺寸）。 */
function animalFrames(name) {
  const a = ANIMALS[name];
  if (a.frames) return a.frames.map((rows) => withOutline(rows2grid(rows, a.keys)));
  const make = (legs, dip) => {
    const rows = [...a.body.map((r, i) => (dip && i < a.body.length / 2 ? '.' + r.slice(0, -1) : r)), ...legs];
    if (dip) rows.unshift('.'.repeat(a.body[0].length));
    else rows.push('.'.repeat(a.body[0].length));
    return withOutline(rows2grid(rows.slice(dip ? 0 : 0, rows.length), a.keys));
  };
  const f = [make(a.legs[0], false), make(a.legs[1], false), make(a.legs[0], true)];
  const H = Math.max(...f.map((g) => g.h));
  return f.map((g) => ({ ...g, h: H, c: g.h < H ? [...Array.from({ length: H - g.h }, () => Array(g.w).fill(null)), ...g.c] : g.c }));
}

/** 图集：帧横排，每格四周 1 像素透明。返回 { canvas, frames, cellW, cellH }。 */
export function animalAtlas(name) {
  const frames = animalFrames(name);
  const cellW = Math.max(...frames.map((f) => f.w)) + 2;
  const cellH = Math.max(...frames.map((f) => f.h)) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = cellW * frames.length;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d');
  frames.forEach((f, i) => {
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const col = f.c[y][x];
      if (col) { ctx.fillStyle = col; ctx.fillRect(i * cellW + 1 + x, cellH - 1 - f.h + y, 1, 1); }
    }
  });
  return { canvas, frames: frames.length, cellW, cellH };
}

export const ANIMAL_NAMES = Object.keys(ANIMALS);

/** 不描边的侧视帧（给体素"充气"用）：走路两帧；鸽子是扇翅两帧。 */
export function animalGrids(name) {
  const a = ANIMALS[name];
  if (a.frames) return a.frames.map((rows) => rows2grid(rows, a.keys));
  return a.legs.map((legs) => rows2grid([...a.body, ...legs], a.keys));
}
