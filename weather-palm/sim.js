// 掌心气象台 · 天气与生态模拟（纯数据 + 纯函数，不依赖 three.js，Node 里能直接测）
//
// 一座野外的小岛：几座山（雪顶、岩壁、山坡上的林子），山泉流成溪、跌成瀑布，汇进湖和水塘；
// 草甸、花海、湿地；岛上住着兔子、鹿、狐狸（野鸭、鱼、青蛙、鸟、蝴蝶、萤火虫在渲染层）。没有人。
//
// 坐标：岛的局部坐标，单位米，岛心在原点，y 朝上，岛底 y = 0；-z 是"北"（离你远的一侧）。
// 用法：const w = createWorld(seed); 每 0.1 s 调一次 step(w, inputs)；渲染层只读 w。
// inputs = { hands: [HandTracker.state…], strikes: [{x,z}], shade: Float32Array(N*N) | null, burns: [{x,z,r}] }
// 每步产生的事件放在 w.events（渲染层读完清空），用来放声音和特效。

export const R = 0.17;            // 岛半径
export const PLINTH = 0.012;      // 底座厚度
export const N = 24;              // 网格边长（格）
export const CELL = (2 * R) / N;  // 每格约 1.4 cm
export const DT = 0.1;
export const DAY_LEN = 180;       // 一天的秒数（夜里两倍速）

// ---------- 布局（渲染层和模拟共用） ----------
export const LAYOUT = {
  peaks: [
    { x: 0.004, z: -0.088, h: 0.092, s: 0.042, name: 'main' },   // 主峰：雪顶
    { x: -0.094, z: -0.046, h: 0.058, s: 0.034, name: 'west' },
    { x: 0.09, z: -0.064, h: 0.05, s: 0.03, name: 'east' },
  ],
  // 山泉：每条第一个点是泉眼
  rivers: [
    [[0.012, -0.058], [0.006, -0.04], [-0.01, -0.03], [-0.016, -0.008], [-0.004, 0.012], [-0.018, 0.032], [-0.024, 0.06]],
    [[-0.072, -0.024], [-0.054, -0.008], [-0.032, -0.002], [-0.016, -0.012]],
    [[0.074, -0.04], [0.078, -0.016], [0.062, 0.006], [0.07, 0.03], [0.052, 0.05], [0.06, 0.09]],
  ],
  lakes: [{ x: -0.042, z: 0.092, r: 0.036 }, { x: 0.064, z: 0.112, r: 0.019 }],
  meadows: [{ x: -0.045, z: 0.02 }, { x: 0.012, z: 0.112 }, { x: -0.11, z: 0.05 }, { x: 0.025, z: 0.0 }, { x: 0.024, z: 0.06 }],   // 东边是峡谷，草甸都在中间和西边
  flowers: { x0: -0.02, x1: 0.035, z0: 0.09, z1: 0.14 },
  bigTrees: [{ x: -0.012, z: 0.078 }, { x: -0.105, z: 0.085 }],      // 草甸里孤零零的两棵大树（雷最爱劈）
};

const segDist = (P, x, z) => {
  let best = 1;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};
export function riverDist(x, z) { let b = 1; for (const P of LAYOUT.rivers) b = Math.min(b, segDist(P, x, z)); return b; }
// 湖岸不是正圆：半径随方向起伏（两三个"湖湾"）
export function lakeDist(x, z) {
  let b = 1;
  for (const [i, l] of LAYOUT.lakes.entries()) {
    const a = Math.atan2(z - l.z, x - l.x);
    const r = l.r * (1 + 0.16 * Math.sin(a * 3 + i * 2.1) + 0.09 * Math.sin(a * 5 + 1.3 + i) + 0.05 * Math.sin(a * 9 + i * 4));
    b = Math.min(b, Math.hypot(x - l.x, z - l.z) - r);
  }
  return b;
}   // 负数 = 在湖里
// 便宜的二维值噪声（确定性）
const hh = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hh(i, j) * (1 - u) + hh(i + 1, j) * u) * (1 - v) + (hh(i, j + 1) * (1 - u) + hh(i + 1, j + 1) * u) * v;
}

// 东边的红石峡谷（照美国西南、新疆那种红色砂岩峡谷）
export const CANYON = {
  buttes: [{ x: 0.142, z: 0.03, r: 0.011, h: 0.05 }, { x: 0.128, z: -0.008, r: 0.008, h: 0.04 }, { x: 0.118, z: 0.075, r: 0.007, h: 0.034 }],
  spires: [{ x: 0.135, z: 0.055, r: 0.0035, h: 0.03 }, { x: 0.112, z: 0.022, r: 0.003, h: 0.024 }, { x: 0.146, z: 0.0, r: 0.003, h: 0.026 }],
};
export function inCanyon(x, z) {
  return x > 0.034 + 0.007 * Math.sin(z * 50) && z > -0.032 && z < 0.088 && Math.hypot(x, z) < R - 0.018;
}
const canyonRiver = (x, z) => { const P = LAYOUT.rivers[2]; let best = 1; for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; };
// 植被分区（种什么树、地上落什么叶）：maple 枫林 / sakura 樱花林 / ginkgo 银杏 / conifer 针叶林 / canyon 峡谷 / mixed 杂树
export function biomeAt(x, z) {
  if (inCanyon(x, z)) return 'canyon';
  if (z < -0.035) return 'conifer';
  const w1 = vnoise(x * 9 + 2, z * 9 - 5) * 0.03;
  if (Math.hypot(x + 0.1, z + 0.005) < 0.05 + w1) return 'maple';            // 西坡
  if (Math.hypot(x + 0.035, z - 0.125) < 0.05 + w1 && lakeDist(x, z) > 0.004) return 'sakura';   // 南湖边
  if (Math.hypot(x - 0.0, z - 0.03) < 0.028 + w1) return 'ginkgo';           // 中间
  if (Math.hypot(x - 0.03, z - 0.11) < 0.03 + w1) return 'sakura';
  return 'mixed';
}
// 地形高度（岛底到地面），渲染层建网格也用它
export function height(x, z) {
  const r = Math.hypot(x, z);
  if (r > R) return PLINTH;
  let h = PLINTH + 0.003;
  for (const p of LAYOUT.peaks) {
    const d = Math.hypot(x - p.x, z - p.z) / p.s;
    // 山：尖顶 + 一道道山脊和冲沟（两层脊状噪声），不是光溜溜的馒头 / 金字塔
    const r1 = 1 - Math.abs(vnoise(x * 60 + p.x * 9, z * 60) * 2 - 1), r2 = 1 - Math.abs(vnoise(x * 150 + 3, z * 150 - p.z * 7) * 2 - 1);
    const ang = Math.atan2(z - p.z, x - p.x), spurs = 0.5 + 0.5 * Math.cos(ang * 5 + p.x * 40);   // 五条山梁
    h += p.h * Math.exp(-Math.pow(d, 1.6) * 0.95) * (0.62 + 0.3 * r1 + 0.12 * r2 + 0.14 * spurs * Math.min(1, d));
  }
  // 北边一道山脊把三座山连起来
  const ridgeZ = -0.07 - 0.02 * Math.cos(x * 22);
  h += 0.022 * Math.exp(-(((z - ridgeZ) / 0.03) ** 2)) * Math.exp(-((x / 0.12) ** 4));
  // 北半边一道红石崖：崖顶是一片台地（上面长林子），崖面朝南（正对着看的人）几乎是竖的；崖边线弯弯曲曲；三条溪在崖上切出豁口跌下来
  {
    const edge = -0.03 + 0.012 * Math.sin(x * 26 + 0.5) + 0.006 * Math.sin(x * 61) + 0.004 * (vnoise(x * 90, 3) - 0.5);
    // 两级：下面一道崖、崖腰一溜平台（宽窄不一），再往里一道崖到顶；崖面是一整面墙（1 mm 内立起来），不是一根根柱子
    const inside = (edge - z) >= 0 ? 1 : 0;
    const ledge = 0.006 + 0.004 * vnoise(x * 40 + 2, 1.7);
    const upper = (edge - ledge - z) >= 0 ? 1 : 0;
    const side = Math.exp(-(((Math.abs(x) - 0.0) / 0.135) ** 6));          // 东西两头收掉
    const notch = 1 - Math.exp(-((riverDist(x, z) / 0.0065) ** 2));         // 溪切出的豁口
    const top = PLINTH + 0.044 + 0.006 * (vnoise(x * 30 + 7, z * 30) - 0.5);
    const frac = inside * (0.52 + 0.06 * vnoise(x * 50, 9)) + upper * (0.48 - 0.06 * vnoise(x * 50, 9));
    const mesa = PLINTH + 0.003 + (top - PLINTH - 0.003) * frac * side * (0.3 + 0.7 * notch);
    h = Math.max(h, mesa);
  }
  // 山坡切成一级级台地（像红石崖那样：一道道几块高的陡坎，坎上一溜平台），越高切得越整齐；台阶高度随地方变一点
  {
    const base = PLINTH + 0.003, rel = h - base;
    if (rel > 0.008) {
      const st = 0.0052 + 0.0016 * vnoise(x * 18 + 5, z * 18), u = rel / st, fl = Math.floor(u), fr = u - fl;
      const sm = fr < 0.42 ? 0 : fr > 0.88 ? 1 : ((fr - 0.42) / 0.46) ** 2 * (3 - 2 * (fr - 0.42) / 0.46);
      const wgt = Math.min(1, (rel - 0.008) / 0.016) * (0.5 + 0.5 * vnoise(x * 26 - 2, z * 26 + 4));
      h = base + rel + ((fl + sm) * st - rel) * wgt;
    }
  }
  h += 0.009 * (vnoise(x * 45, z * 45) - 0.5) + 0.004 * (vnoise(x * 140, z * 140) - 0.5);   // 丘陵起伏：草甸上一个个小土包
  // 溪谷和湖往下挖
  const rd = riverDist(x, z);
  h -= 0.007 * Math.exp(-(rd * rd) / (2 * 0.006 * 0.006));
  const ld = lakeDist(x, z);
  if (ld < 0.012) h = Math.min(h, PLINTH + 0.003 + Math.max(-0.006, ld * 0.5));
  // 红石峡谷：溪两侧是平顶的台地（一溜竖直的崖壁），溪在中间切出两级峡谷：崖腰一级窄平台、谷底是溪
  if (inCanyon(x, z)) {
    const base = PLINTH + 0.003, rd2 = canyonRiver(x, z), wob = 0.0025 * Math.sin(z * 90 + x * 40) + 0.0015 * Math.sin(z * 210);
    const plateauW = 0.04 + 0.008 * Math.sin(z * 55 + 1.0);
    let hc;
    if (rd2 + wob < 0.009) hc = base + 0.002;                      // 谷底（溪）
    else if (rd2 + wob < 0.016) hc = base + 0.021;                 // 崖腰平台
    else if (rd2 + wob < plateauW) hc = base + 0.04 + 0.003 * (vnoise(x * 40, z * 40) > 0.6 ? 1 : 0);   // 台地顶
    else hc = base + 0.004 + 0.002 * vnoise(x * 60, z * 60);       // 台地外的荒漠
    for (const b of CANYON.buttes) if (Math.hypot(x - b.x, z - b.z) < b.r * (1 + 0.15 * Math.sin(Math.atan2(z - b.z, x - b.x) * 5))) hc = Math.max(hc, base + b.h);
    for (const sp of CANYON.spires) { const d = Math.hypot(x - sp.x, z - sp.z); if (d < sp.r) hc = Math.max(hc, base + sp.h * (d < sp.r * 0.6 ? 1 : 0.7)); }
    h = hc;
  }
  // 边缘是卵石滩，往下收
  const e = Math.max(0, (r - (R - 0.014)) / 0.014);
  h = h * (1 - e) + (PLINTH + 0.0015) * e;
  return Math.max(PLINTH + 0.0005, h);
}
// 土质：没长草的时候地面是什么。0 褐土  1 沙丘  2 红黏土  3 碎石坡  4 干泥滩（龟裂）
// 不同的土长草快慢不一样：沙、碎石难长，泥滩、褐土好长
export const SOIL = { DIRT: 0, SAND: 1, CLAY: 2, SCREE: 3, MUD: 4 };
export const SOIL_GROW = [1, 0.45, 0.8, 0.55, 1.15];
export function soilAt(x, z) {
  const h = height(x, z) - PLINTH, ld = lakeDist(x, z), rd = riverDist(x, z);
  if (inCanyon(x, z)) return canyonRiver(x, z) < 0.012 && h < 0.01 ? SOIL.MUD : SOIL.CLAY;   // 峡谷：红土，谷底是泥
  if (ld < 0.02 || (rd < 0.012 && h < 0.012)) return SOIL.MUD;
  if (h > 0.03 || slope(x, z) > 1.0) return SOIL.SCREE;
  const a = vnoise(x * 13 + 4.2, z * 13 - 1.3), b = vnoise(x * 24 - 7, z * 24 + 2);
  if (x + 0.04 * (vnoise(x * 30, z * 30 + 5) - 0.5) + 0.02 * Math.sin(z * 40) > 0.02 && a > 0.52) return SOIL.SAND;   // 东边一片沙丘（边界弯弯曲曲）
  if (a < 0.34 || (b > 0.7 && z < 0.02)) return SOIL.CLAY;    // 西边、崖下是红土
  return SOIL.DIRT;
}
// 坡度（米 / 米）
export function slope(x, z) { const e = 0.003; return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); }

// 格子类型
export const T = { OUT: 0, GRASS: 1, FLOWER: 2, FOREST: 3, ROCK: 4, SNOW: 5, WATER: 6, BEACH: 7, MARSH: 8 };
export const cellCenter = (i, j) => [-R + (i + 0.5) * CELL, -R + (j + 0.5) * CELL];
export const cellIndex = (x, z) => {
  const i = Math.floor((x + R) / CELL), j = Math.floor((z + R) / CELL);
  return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
};
export function cellType(x, z) {
  const L = LAYOUT, r = Math.hypot(x, z);
  if (r > R) return T.OUT;
  const ld = lakeDist(x, z);
  if (riverDist(x, z) < 0.006 || ld < 0) return T.WATER;
  const a = Math.atan2(z, x), shore = Math.sin(a * 3 + 0.7) + 0.6 * Math.sin(a * 7 + 2);
  if (r > R - (shore > 0.2 ? 0.011 : 0.0045)) return T.BEACH;   // 卵石滩宽一段窄一段，有的地方草直接长到岛边
  if (ld < 0.006 && Math.sin(Math.atan2(z, x) * 4 + x * 90) > -0.3) return T.BEACH;
  const f = L.flowers;
  if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && ld > 0.008) return T.FLOWER;
  if (ld < 0.016 && height(x, z) < PLINTH + 0.01) return T.MARSH;
  const h = height(x, z) - PLINTH;
  if (inCanyon(x, z)) return slope(x, z) > 0.8 ? T.ROCK : T.GRASS;
  if (h > 0.078) return T.SNOW;
  if (h > 0.06 || (h > 0.034 && slope(x, z) > 1.35)) return T.ROCK;
  const forest = vnoise(x * 32 + 3, z * 32 - 1);
  if (h > 0.015 || (forest > 0.55 && L.meadows.every(m => Math.hypot(m.x - x, m.z - z) > 0.03))) return T.FOREST;
  return T.GRASS;
}
const PLANT = new Set([T.GRASS, T.FLOWER, T.FOREST, T.MARSH]);
const LAND = new Set([T.GRASS, T.FLOWER, T.FOREST, T.MARSH, T.BEACH]);

// 会被闪电劈的高处：山尖、草甸里的大树
export function talls() {
  return [...LAYOUT.peaks.map(p => ({ x: p.x, z: p.z, y: height(p.x, p.z), name: 'peak' })),
    ...LAYOUT.bigTrees.map(t => ({ x: t.x, z: t.z, y: height(t.x, t.z) + 0.03, name: 'tree' }))];
}
// 劈哪：手掌投影点 4 cm 内最高的东西，没有就劈在地上
export function strikeTarget(w, x, z) {
  let best = null;
  for (const t of talls()) if (Math.hypot(t.x - x, t.z - z) < 0.04 && (!best || t.y > best.y)) best = t;
  if (best) return { x: best.x, z: best.z, y: best.y, name: best.name };
  const r = Math.hypot(x, z), k = r > R - 0.01 ? (R - 0.01) / r : 1;
  return { x: x * k, z: z * k, y: height(x * k, z * k), name: 'ground' };
}

// ---------- 随机数（可存档、可复现） ----------
function rng(w) { let t = (w.seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

// ---------- 动物 ----------
// green：荒岛上绿到多少它才来；where：在哪出生（不给就在草甸）；cap：吃饱了最多繁殖到几只
export const SPECIES = {
  rabbit: { speed: 0.016, range: 0.03, home: [T.GRASS, T.FLOWER], hides: true, green: 0.3, cap: 14 },
  deer: { speed: 0.012, range: 0.045, home: [T.GRASS, T.FLOWER, T.FOREST], green: 0.45, cap: 7 },
  fox: { speed: 0.02, range: 0.05, home: [T.FOREST, T.GRASS], nocturnal: true, green: 0.6, cap: 4 },
  squirrel: { speed: 0.018, range: 0.02, home: [T.FOREST], green: 0.4, cap: 8, where: (x, z) => cellType(x, z) === T.FOREST && !inCanyon(x, z) },
  heron: { speed: 0.007, range: 0.016, home: [T.MARSH, T.BEACH, T.GRASS], green: 0.35, cap: 3, where: (x, z) => lakeDist(x, z) > 0.002 && lakeDist(x, z) < 0.012 },
  goat: { speed: 0.012, range: 0.03, home: [T.GRASS], green: 0.4, cap: 5, where: (x, z) => inCanyon(x, z) && cellType(x, z) === T.GRASS },
  boar: { speed: 0.013, range: 0.05, home: [T.FOREST, T.GRASS], green: 0.55, cap: 4, where: (x, z) => cellType(x, z) === T.FOREST && !inCanyon(x, z) },
  bear: { speed: 0.01, range: 0.05, home: [T.FOREST, T.GRASS], green: 0.7, cap: 2, where: (x, z) => cellType(x, z) === T.FOREST && z < -0.02 },
};
// 岛的等级（0–8）决定有几只：完成两个"需要"升一级，新来的物种从林子边走出来
export function wantAnimals(level) {
  return {
    rabbit: 3 + (level >= 2 ? 2 : 0) + (level >= 4 ? 1 : 0) + (level >= 6 ? 2 : 0),
    deer: (level >= 1 ? 2 : 0) + (level >= 5 ? 1 : 0) + (level >= 7 ? 1 : 0),
    fox: (level >= 3 ? 1 : 0) + (level >= 8 ? 1 : 0),
    squirrel: (level >= 1 ? 2 : 0) + (level >= 5 ? 1 : 0),
    heron: (level >= 2 ? 1 : 0) + (level >= 6 ? 1 : 0),
    goat: (level >= 3 ? 2 : 0),
    boar: (level >= 4 ? 2 : 0),
    bear: (level >= 7 ? 1 : 0),
  };
}
export const MAX_LEVEL = 8;
// 能不能站：陆地、不太陡、没被岩浆盖着
export function walkable(x, z, blocked) {
  if (Math.hypot(x, z) > R - 0.012) return false;
  const t = cellType(x, z);
  if (!LAND.has(t)) return false;
  if (slope(x, z) > 0.9) return false;
  return !(blocked && blocked(x, z));
}

// ---------- 左手菜单里的东西（右手"倒"出去） ----------
// 水、食物、雪、雾霾、旋风、岩浆、闪电、沙、树种、花种、鱼苗、萤火虫
export const TOOLS = ['water', 'food', 'snow', 'smog', 'whirl', 'lava', 'lightning', 'sand', 'seed', 'flower', 'fish', 'firefly'];

// ---------- 世界 ----------
export function createWorld(seed = 1, opts = {}) {
  const barren = opts.start === 'barren';
  const w = {
    v: 2, seed: seed >>> 0 || 1, t: 0, day: 0.3, T: 0.45, sun: 0.6, sunBoost: 0, wind: [0, 0], water: 0.3,
    clouds: [], nextCloudId: 1, drySince: 0, lastRainT: -99, rainAccum: 0, rainNow: 0,
    rainbow: 0, rainbowT: 0, stormUntil: -99, lastStrike: null, gustAccum: 0,
    level: 0, done: 0, festival: false, drought: false, flood: false,
    requests: [], nextReqT: 4, reqSeq: 0, tutorial: ['rain', 'sun', 'wind', 'storm'],
    M: new Float32Array(N * N), G: new Float32Array(N * N), type: new Uint8Array(N * N), boost: new Float32Array(N * N),
    dryT: new Float32Array(N * N), wetT: new Float32Array(N * N), rainCell: new Float32Array(N * N), shade: new Float32Array(N * N), burnt: new Float32Array(N * N),
    snow: new Float32Array(N * N), smog: new Float32Array(N * N), snowCell: new Float32Array(N * N),
    ice: 0, snowNow: 0, smogAvg: 0, snowAvg: 0, food: [], nextFoodId: 1, whirls: [], fish: 6,
    animals: [], nextAnimalId: 1, events: [], stats: { strikes: 0, rainbows: 0, born: 0, eaten: 0 },
    barren, green: 0, soilGrow: new Float32Array(N * N),
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, [x, z] = cellCenter(i, j), ty = cellType(x, z);
    w.type[k] = ty;
    // 开局：西边、林子里湿润，东边草甸偏干
    w.M[k] = ty === T.WATER ? 1 : ty === T.OUT ? 0 : 0.14 + 0.2 * rng(w) * (x < 0 ? 1.5 : 0.7) + (ty === T.FOREST ? 0.12 : 0) + (ty === T.MARSH ? 0.35 : 0);
    w.G[k] = PLANT.has(ty) ? 0.2 + 0.25 * rng(w) + (x < -0.02 || ty === T.FOREST ? 0.3 : 0) : 0;
    w.soilGrow[k] = SOIL_GROW[soilAt(x, z)];
    // 荒岛开局：地干、几乎不长东西（只有水边湿一点，过一阵会自己冒一点绿）
    if (barren) { w.M[k] = ty === T.WATER ? 1 : ty === T.OUT ? 0 : 0.06 + 0.06 * rng(w) + (ty === T.MARSH ? 0.15 : 0); w.G[k] = PLANT.has(ty) ? 0.1 : 0; }
  }
  greenness(w); syncAnimals(w, true);
  return prepare(w);
}
// 岛有多绿（能长草的格子的平均生长度）
export function greenness(w) { let s = 0, n = 0; for (let k = 0; k < N * N; k++) if (PLANT.has(w.type[k])) { s += w.G[k]; n++; } return (w.green = n ? s / n : 0); }

function spawnPoint(w, sp) {
  const S = SPECIES[sp];
  if (S.where) for (let tries = 0; tries < 600; tries++) {   // 有自己的地方：林子、湖边、峡谷……
    const a = rng(w) * Math.PI * 2, r = Math.sqrt(rng(w)) * (R - 0.02), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (walkable(x, z) && S.where(x, z)) return [x, z];
  }
  for (let tries = 0; tries < 200; tries++) {
    const m = LAYOUT.meadows[Math.floor(rng(w) * LAYOUT.meadows.length)];
    const a = rng(w) * Math.PI * 2, d = rng(w) * 0.03, x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d;
    if (walkable(x, z) && S.home.includes(cellType(x, z))) return [x, z];
  }
  return [LAYOUT.meadows[0].x, LAYOUT.meadows[0].z];
}
// 直接设等级（场景预设、测试用）：动物跟着补齐
export function setLevel(w, level) { w.level = level; syncAnimals(w, true); }
function syncAnimals(w, initial = false) {
  const want = wantAnimals(w.level);
  if (w.barren) {   // 荒岛：绿到 0.3 才来第一批兔子，0.35 苍鹭，0.4 松鼠、岩羊，0.45 鹿，0.55 野猪，0.6 狐狸，0.7 熊
    const g = w.green;
    want.rabbit = Math.min(want.rabbit, Math.max(0, Math.floor((g - 0.24) / 0.05)));
    want.deer = g < 0.45 ? 0 : Math.max(want.deer, Math.min(2, Math.floor((g - 0.4) / 0.08)));
    want.fox = g < 0.6 ? 0 : Math.max(want.fox, 1);
    for (const sp of ['squirrel', 'heron', 'goat', 'boar', 'bear']) want[sp] = g < SPECIES[sp].green ? 0 : Math.max(want[sp], 1);
  }
  for (const sp of Object.keys(want)) {
    let have = w.animals.filter(a => a.sp === sp).length;
    while (have < want[sp]) {
      const [x, z] = spawnPoint(w, sp);
      w.animals.push({ id: w.nextAnimalId++, sp, x, z, hx: x, hz: z, tx: x, tz: z, act: 'graze', think: rng(w), timer: rng(w) * 3, face: rng(w) * 6.28, moving: false, hidden: false, look: null, fed: 0, grow: 1 });
      if (!initial) w.events.push({ type: 'animal', sp, x, z });
      have++;
    }
  }
}

// 云：位置 / 半径 / 含水量 / 雨量 / 雷电荷 / 被哪只手握着
function newCloud(w, x, z, y, holder) {
  const c = { id: w.nextCloudId++, x, z, y, r: 0.045, water: 1, rain: 0, charge: 0, storm: 0, holder, age: 0, fade: 0, alpha: 0 };
  w.clouds.push(c); w.events.push({ type: 'cloud', x, z });
  return c;
}
const cloudY = h => Math.max(0.12, Math.min(0.26, h.y - 0.035));

export function sunHeight(w) { return -Math.cos(2 * Math.PI * w.day); }   // day 0.25 日出，0.5 正午，0.75 日落
export const isNight = w => sunHeight(w) < -0.05;

export function step(w, inputs = {}, dt = DT) {
  w.t += dt;
  const hands = (inputs.hands || []).filter(Boolean);
  const sh = sunHeight(w);
  w.day = (w.day + dt / DAY_LEN * (sh < 0 ? 2 : 1)) % 1;

  // --- 手 → 云 / 风 / 太阳 ---
  const held = new Set();
  for (const h of hands) {
    if (h.mode === 'rain' || h.mode === 'charge' || h.mode === 'snow') {
      let c = w.clouds.find(c => c.holder === h.id);
      if (!c) {
        c = w.clouds.filter(c => c.holder == null && Math.hypot(c.x - h.x, c.z - h.z) < 0.06).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
        if (c) c.holder = h.id; else if (w.clouds.length < 8) c = newCloud(w, h.x, h.z, cloudY(h), h.id);
      }
      if (c) {
        held.add(c);
        const k = 1 - Math.exp(-dt * 6);
        c.x += (h.x - c.x) * k; c.z += (h.z - c.z) * k; c.y += (cloudY(h) - c.y) * k;
        c.water = Math.min(1, c.water + dt * 0.5); c.fade = 0;
        if (h.mode === 'rain' || h.mode === 'snow') { c.rain += (h.strength - c.rain) * Math.min(1, dt * 2); c.snow = h.mode === 'snow' ? 1 : 0; }
        else { c.storm = Math.min(1, c.storm + dt * 2); c.charge = h.strength; c.rain += (0.35 - c.rain) * Math.min(1, dt); }
      }
    }
    if (h.mode === 'sun') {
      w.sunBoost = Math.min(1, w.sunBoost + dt * 2 * h.strength);
      for (const c of w.clouds) if (Math.hypot(c.x - h.x, c.z - h.z) < 0.09) { c.water -= dt * 0.6; c.rain *= Math.exp(-dt * 3); }
    }
    if (h.mode === 'wind') {
      const k = Math.min(1, dt * 5), s = 0.4 + 0.6 * h.strength;
      w.wind[0] += (h.dx * s - w.wind[0]) * k; w.wind[1] += (h.dz * s - w.wind[1]) * k;
      if (!w._gust) { w.events.push({ type: 'gust', x: h.x, z: h.z, dx: h.dx, dz: h.dz, s }); w._gust = 1.2; }
    }
  }
  if (w._gust) w._gust = Math.max(0, w._gust - dt);
  if (!hands.some(h => h.mode === 'wind')) { const k = Math.exp(-dt / 1.2); w.wind[0] *= k; w.wind[1] *= k; }
  const wmag = Math.hypot(w.wind[0], w.wind[1]);
  w.gustAccum += Math.max(0, wmag - 0.15) * dt;
  w.sunBoost *= Math.exp(-dt / 6);

  // --- 闪电 ---
  for (const s of inputs.strikes || []) {
    const tg = strikeTarget(w, s.x, s.z);
    w.lastStrike = { ...tg, t: w.t }; w.stormUntil = w.t + 6; w.stats.strikes++;
    w.events.push({ type: 'strike', ...tg });
    forCells(tg.x, tg.z, 0.035, (k, d) => { w.boost[k] = Math.max(w.boost[k], 40 * (1 - d / 0.035)); });   // 雷电固氮：附近长得快
    const c = w.clouds.filter(c => c.storm > 0.2).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    if (c) { c.charge = 0; c.storm = Math.max(c.storm, 0.6); c.rain = 1; c.water = 1; c.burst = 5; }
    request(w, 'storm', 1);
  }
  // --- 左手菜单里的东西 ---
  for (const tl of inputs.tools || []) {
    const a = tl.a ?? 1;
    if (tl.kind === 'water') {   // 浇水：地湿透、积雪化掉、雾霾压下去；倒进溪 / 湖里水位涨
      forCells(tl.x, tl.z, 0.016, k => { w.M[k] = Math.min(1, w.M[k] + 0.6 * a); w.snow[k] = Math.max(0, w.snow[k] - 0.5 * a); w.smog[k] *= Math.exp(-2 * a); });
      if (riverDist(tl.x, tl.z) < 0.012 || lakeDist(tl.x, tl.z) < 0.004) w.water = Math.min(1, w.water + 0.03 * a);
    } else if (tl.kind === 'food') {   // 撒食物：一小堆浆果，附近的动物会过来吃
      // 落点不能站（水里、陡坡上）就滚到旁边最近能站的地方
      let fx = tl.x, fz = tl.z;
      if (!walkable(fx, fz)) { let best = null; for (let r = 0.004; r <= 0.02 && !best; r += 0.004) for (let i = 0; i < 8; i++) { const ax = tl.x + Math.cos(i * 0.785) * r, az = tl.z + Math.sin(i * 0.785) * r; if (walkable(ax, az)) { best = [ax, az]; break; } } if (best) [fx, fz] = best; else fx = null; }
      if (w.food.length < 40 && fx != null) { w.food.push({ id: w.nextFoodId++, x: fx, z: fz, amt: 1, age: 0 }); w.events.push({ type: 'food', x: fx, z: fz }); }
    } else if (tl.kind === 'smog') {   // 雾霾：挡阳光、伤植物，动物躲开；风吹散、雨洗掉
      forCells(tl.x, tl.z, 0.022, (k, d) => { w.smog[k] = Math.min(1, w.smog[k] + 1.6 * a * (1 - d / 0.03)); });
    } else if (tl.kind === 'whirl') {   // 旋风：在岛上乱走一阵，吹散雾霾、推开云、动物躲开
      if (w.whirls.length < 3) { const ang = rng(w) * Math.PI * 2; w.whirls.push({ x: tl.x, z: tl.z, vx: Math.cos(ang) * 0.012, vz: Math.sin(ang) * 0.012, life: 8, age: 0 }); w.events.push({ type: 'whirl', x: tl.x, z: tl.z }); }
    } else if (tl.kind === 'flower') {   // 花种：那一片草长起来
      forCells(tl.x, tl.z, 0.014, k => { w.G[k] = Math.min(1, w.G[k] + 0.5 * a); });
    } else if (tl.kind === 'fish') {   // 鱼苗：只有放进水里才算数
      if (lakeDist(tl.x, tl.z) < 0 || riverDist(tl.x, tl.z) < 0.007) { if (w.fish < 40) { w.fish++; w.events.push({ type: 'fish', x: tl.x, z: tl.z }); } }
      else w.events.push({ type: 'fishFlop', x: tl.x, z: tl.z });
    }
  }
  // --- 旋风 ---
  for (const wh of w.whirls) {
    wh.age += dt; wh.life -= dt;
    const turn = (rng(w) - 0.5) * dt * 3, cs = Math.cos(turn), sn = Math.sin(turn);
    [wh.vx, wh.vz] = [wh.vx * cs - wh.vz * sn, wh.vx * sn + wh.vz * cs];
    wh.x += wh.vx * dt; wh.z += wh.vz * dt;
    const r = Math.hypot(wh.x, wh.z); if (r > R - 0.02) { wh.vx -= wh.x / r * 0.01; wh.vz -= wh.z / r * 0.01; }
    forCells(wh.x, wh.z, 0.035, k => { w.smog[k] *= Math.exp(-dt * 4); });
    for (const cl of w.clouds) { const dx = cl.x - wh.x, dz = cl.z - wh.z, d = Math.hypot(dx, dz) || 1; if (d < 0.06) { cl.x += dx / d * 0.02 * dt; cl.z += dz / d * 0.02 * dt; } }
  }
  if (w.whirls.some(wh => wh.life <= 0)) w.events.push({ type: 'whirlEnd' });
  w.whirls = w.whirls.filter(wh => wh.life > 0);

  // --- 火 / 岩浆烧过的地方：植物没了，慢慢再长 ---
  for (const b of inputs.burns || []) forCells(b.x, b.z, b.r || 0.01, k => { w.G[k] = Math.min(w.G[k], 0.1); w.burnt[k] = 1; });
  // 岩浆烤：周围的地水分被蒸干、草发黄枯掉一些
  for (const s of inputs.scorch || []) forCells(s.x, s.z, 0.012, k => { w.M[k] = Math.max(0, w.M[k] - 0.08 * s.a); w.G[k] = Math.max(0.1, w.G[k] - 0.02 * s.a); w.dryT[k] += 2; });

  // --- 云：放手后自己下完，被风吹着走 ---
  w.rainCell.fill(0); w.snowCell.fill(0);
  let rainArea = 0, raining = 0, snowing = 0;
  for (const c of w.clouds) {
    c.age += dt;
    if (!held.has(c)) {
      c.holder = null;
      c.x += (w.wind[0] * 0.07 + 0.002) * dt; c.z += (w.wind[1] * 0.07) * dt;
      if (c.burst > 0) { c.burst -= dt; c.rain = 1; }
      else { c.water -= dt * 0.11 * (0.3 + c.rain); if (c.water < 0.25) c.rain *= Math.exp(-dt * 1.5); }
      c.storm *= Math.exp(-dt / 8); c.charge *= Math.exp(-dt * 2);
    }
    c.alpha = Math.min(1, c.alpha + dt * 2) * Math.min(1, Math.max(0, c.water + 0.2) * 1.5);
    if (c.rain > 0.02 && c.snow && Math.hypot(c.x, c.z) < R + 0.02) {   // 下雪：落到地上积起来，不直接湿地
      snowing = Math.max(snowing, c.rain);
      forCells(c.x, c.z, c.r, (k, d) => { w.snowCell[k] = Math.max(w.snowCell[k], c.rain * (1 - 0.4 * d / c.r)); });
    } else if (c.rain > 0.02 && Math.hypot(c.x, c.z) < R + 0.02) {
      raining = Math.max(raining, c.rain);
      forCells(c.x, c.z, c.r, (k, d) => { const a = c.rain * (1 - 0.4 * d / c.r); w.rainCell[k] = Math.max(w.rainCell[k], a); });
      rainArea += c.rain * (c.r * c.r) / (R * R);
      w.rainAccum += c.rain * dt;
    }
  }
  w.clouds = w.clouds.filter(c => (c.alpha > 0.01 || c.age < 0.5) && c.water > -0.2 && Math.hypot(c.x, c.z) < R + 0.12);
  const wasRaining = w.rainNow > 0.1;
  w.rainNow = raining; w.snowNow = snowing;
  if (raining > 0.1) { w.lastRainT = w.t; w.drySince = 0; } else w.drySince += dt;
  if (wasRaining && raining <= 0.1) w.events.push({ type: 'rainStop' });
  if (!wasRaining && raining > 0.1) w.events.push({ type: 'rainStart' });

  // --- 日照、温度 ---
  const cover = Math.min(1, w.clouds.reduce((s, c) => s + c.alpha * c.r * c.r / (R * R) * 2.5, 0));
  let snowSum = 0, smogSum = 0, landN = 0;
  for (let k = 0; k < N * N; k++) if (w.type[k] !== T.OUT && w.type[k] !== T.WATER) { snowSum += w.snow[k]; smogSum += w.smog[k]; landN++; }
  w.snowAvg = landN ? snowSum / landN : 0; w.smogAvg = landN ? smogSum / landN : 0;
  w.sun = (Math.max(0, sh) * (1 - 0.6 * cover) + 0.5 * w.sunBoost * (sh > -0.1 ? 1 : 0.3)) * (1 - 0.5 * Math.min(1, w.smogAvg * 2));   // 雾霾挡太阳
  const baseT = 0.3 + 0.35 * Math.max(0, sh) + 0.25 * w.sunBoost - 0.25 * raining - 0.35 * snowing - 0.25 * w.snowAvg + 0.06 * w.smogAvg;
  w.T += (baseT - w.T) * Math.min(1, dt * 0.08);

  // --- 湖面结冰：冷了结、暖了化 ---
  const iceWas = w.ice > 0.5;
  w.ice = Math.max(0, Math.min(1, w.ice + (w.T < 0.24 ? dt * 0.05 : w.T > 0.32 ? -dt * 0.04 : 0)));
  if (iceWas !== w.ice > 0.5) w.events.push({ type: w.ice > 0.5 ? 'freeze' : 'thaw' });

  // --- 水位（溪、湖一起涨落；泉水一直往里补一点） ---
  w.water += (0.4 * rainArea + 0.0006 - 0.0028 - 0.0035 * w.sun * w.T) * dt;
  w.water = Math.max(0.05, Math.min(1, w.water));
  const flood = w.water > 0.85;
  if (flood !== w.flood) { w.flood = flood; w.events.push({ type: flood ? 'flood' : 'floodEnd' }); }

  // --- 格子：湿度、生长 ---
  if (inputs.shade) w.shade.set(inputs.shade); else w.shade.fill(0);
  let meadowM = 0, meadowN = 0;
  for (let k = 0; k < N * N; k++) {
    const ty = w.type[k];
    if (ty === T.OUT) continue;
    if (ty === T.WATER) { w.M[k] = 1; continue; }
    const shade = w.shade[k];
    let m = w.M[k];
    // 积雪：下雪积起来；太阳、气温高就化，化的雪水渗进地里
    let sn = w.snow[k] + 0.06 * w.snowCell[k] * dt;
    const melt = Math.min(sn, (0.003 + 0.08 * w.sun * Math.max(0, w.T - 0.2)) * dt);
    sn -= melt; m += melt * 0.9; w.snow[k] = sn;
    // 雾霾：被风吹散、被雨洗掉，自己也慢慢散
    const sm = w.smog[k];
    if (sm > 0.001) w.smog[k] = Math.max(0, sm - (0.004 + 0.35 * wmag + 0.5 * w.rainCell[k] + (w.whirls.length ? 0.02 : 0)) * sm * dt);
    m += 0.075 * w.rainCell[k] * dt;
    m -= (0.0015 + 0.004 * w.sun * w.T + 0.002 * wmag) * (1 - 0.7 * shade) * (ty === T.FOREST ? 0.6 : 1) * dt;   // 林子里蒸发慢
    if (w._nearWater?.[k]) { const tgt = 0.12 + 0.55 * w.water; if (m < tgt) m += (tgt - m) * dt * 0.05; }
    if (flood && w._nearWater?.[k]) m = Math.min(1, m + dt * 0.1);
    m = Math.max(0, Math.min(1, m));
    w.M[k] = m;
    if (ty === T.GRASS || ty === T.FLOWER) { meadowM += m; meadowN++; }
    if (!PLANT.has(ty)) continue;
    w.dryT[k] = m < 0.15 ? w.dryT[k] + dt : Math.max(0, w.dryT[k] - dt * 2);
    w.wetT[k] = m > 0.96 ? w.wetT[k] + dt : Math.max(0, w.wetT[k] - dt);
    const light = Math.max(0.15, w.sun) * (1 - 0.5 * shade) * (1 - 0.7 * w.smog[k]);
    let g = w.G[k];
    if (m > 0.28 && m < 0.98 && sh > -0.05 && w.snow[k] < 0.4) g += 0.022 * light * (w.boost[k] > 0 ? 2.2 : 1) * (w.burnt[k] > 0 ? 0.6 : 1) * w.soilGrow[k] * dt;
    if (w.dryT[k] > 20) g -= 0.012 * dt;
    if (w.smog[k] > 0.4) g -= 0.008 * (w.smog[k] - 0.4) * dt;   // 雾霾久了，植物发黄
    w.G[k] = Math.max(w.burnt[k] > 0.5 ? 0.05 : 0.1, Math.min(1, g));
    if (w.burnt[k] > 0 && g > 0.5) w.burnt[k] = Math.max(0, w.burnt[k] - dt * 0.02);   // 烧过的地方长回来了
    if (w.boost[k] > 0) w.boost[k] -= dt;
  }
  if (Math.floor(w.t / 2) !== Math.floor((w.t - dt) / 2)) { greenness(w); if (w.barren) syncAnimals(w); }
  // 雾霾顺风飘：每格从上风的邻格拿一点，再整体抹匀一点
  if (w.smogAvg > 0.0005) {
    const src = w.smog.slice(), di = Math.sign(w.wind[0]), dj = Math.sign(w.wind[1]), adv = Math.min(0.5, Math.hypot(w.wind[0], w.wind[1]) * dt * 4);
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const k = j * N + i; if (w.type[k] === T.OUT) continue;
      const nb = (src[k - 1] + src[k + 1] + src[k - N] + src[k + N]) / 4;
      let v = src[k] * 0.96 + nb * 0.04;
      v += (src[(j - dj) * N + (i - di)] - src[k]) * adv;
      w.smog[k] = Math.max(0, Math.min(1, v));
    }
  }
  const avgMeadow = meadowN ? meadowM / meadowN : 0;
  const drought = avgMeadow < 0.17 && w.drySince > 40;
  if (drought !== w.drought) { w.drought = drought; w.events.push({ type: drought ? 'drought' : 'droughtEnd' }); }

  // --- 彩虹：一场像样的雨停了，太阳出来 ---
  if (w.rainbowT > 0) { w.rainbowT -= dt; w.rainbow = Math.min(1, w.rainbow + dt / 1.5); if (w.rainbowT <= 0) w.events.push({ type: 'rainbowEnd' }); }
  else w.rainbow = Math.max(0, w.rainbow - dt / 2);
  if (w.rainbowT <= 0 && raining < 0.1 && w.rainAccum > 4 && w.t - w.lastRainT < 12 && sh > 0.05 && w.sun > 0.15) {
    w.rainbowT = 14; w.rainAccum = 0; w.stats.rainbows++; w.events.push({ type: 'rainbow' });
  }
  if (w.t - w.lastRainT > 30) w.rainAccum = 0;

  updateRequests(w, dt, wmag);
  updateAnimals(w, hands, dt, inputs.blocked);
  for (const f of w.food) f.age += dt;
  w.food = w.food.filter(f => f.amt > 0 && f.age < 120);   // 没人吃的两分钟后烂掉

  // 满级的夜里：漫天萤火
  const fest = w.level >= MAX_LEVEL && isNight(w);
  if (fest !== w.festival) { w.festival = fest; if (fest) w.events.push({ type: 'festival' }); }
  return w;
}

function forCells(x, z, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r + R) / CELL)), i1 = Math.min(N - 1, Math.floor((x + r + R) / CELL));
  const j0 = Math.max(0, Math.floor((z - r + R) / CELL)), j1 = Math.min(N - 1, Math.floor((z + r + R) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const [cx, cz] = cellCenter(i, j), d = Math.hypot(cx - x, cz - z);
    if (d <= r) fn(j * N + i, d);
  }
}
export function cellsAround(x, z, r) { const out = []; forCells(x, z, r, k => out.push(k)); return out; }
export function avgM(w, x, z, r = 0.02) { let s = 0, n = 0; forCells(x, z, r, k => { if (w.type[k] !== T.WATER) { s += w.M[k]; n++; } }); return n ? s / n : 0; }

// ---------- "需要"：草甸要雨、花要太阳、蒲公英要风、山林要场雷雨、兔子要阴凉 ----------
const REQ_NEED = { rain: 1, sun: 7, wind: 3, storm: 1, shade: 4 };
function spawnRequest(w, type) {
  const L = LAYOUT;
  let x, z;
  if (type === 'rain') { const m = [...L.meadows].sort((a, b) => avgM(w, a.x, a.z) - avgM(w, b.x, b.z))[0]; x = m.x; z = m.z; }
  else if (type === 'sun') { x = (L.flowers.x0 + L.flowers.x1) / 2; z = (L.flowers.z0 + L.flowers.z1) / 2; }
  else if (type === 'wind') { x = L.meadows[0].x; z = L.meadows[0].z; }
  else if (type === 'storm') { const p = L.peaks[0]; x = p.x; z = p.z + 0.02; }
  else { const r = w.animals.find(a => a.sp === 'rabbit' && !a.hidden) || L.meadows[1]; x = r.x; z = r.z; }
  const r = { id: ++w.reqSeq, type, x, z, p: 0, t0: w.t };
  w.requests.push(r); w.events.push({ type: 'request', req: type, x, z });
  return r;
}
function request(w, type, amount) { for (const r of w.requests) if (r.type === type) r.p += amount; }

function updateRequests(w, dt, wmag) {
  const night = isNight(w);
  for (const r of w.requests) {
    if (r.type === 'rain') r.p = Math.max(r.p, (avgM(w, r.x, r.z) - 0.25) / 0.33);
    else if (r.type === 'sun') { if (w.rainNow < 0.1) r.p += dt * Math.min(1.5, w.sun * 1.6 + w.sunBoost) / REQ_NEED.sun; }
    else if (r.type === 'wind') r.p += dt * Math.max(0, wmag - 0.15) / REQ_NEED.wind;
    else if (r.type === 'shade') { const k = cellIndex(r.x, r.z); r.p += dt * (k >= 0 ? w.shade[k] : 0) / REQ_NEED.shade; }
    if (r.p >= 1 && !r.done) {
      r.done = true; w.done++;
      if (r.type === 'wind') forCells(r.x, r.z, 0.04, k => { w.G[k] = Math.min(1, w.G[k] + 0.3); });   // 蒲公英的种子飞开，草甸一下子长起来
      w.events.push({ type: 'done', req: r.type, x: r.x, z: r.z });
      const want = Math.min(MAX_LEVEL, Math.floor(w.done / 2));
      if (want > w.level) { w.level = want; w.events.push({ type: 'level', level: want }); syncAnimals(w); }
    }
  }
  w.requests = w.requests.filter(r => !r.done && w.t - r.t0 < 90);
  if (w.t >= w.nextReqT && w.requests.length < 2 && !night) {
    let type = w.tutorial.length ? w.tutorial[0] : null;
    if (type) { if (w.requests.some(r => r.type === type)) type = null; else w.tutorial.shift(); }
    else {
      const pool = ['rain', 'rain', 'sun', 'wind', 'storm'];
      if (w.T > 0.6 && w.sun > 0.5) pool.push('shade', 'shade');
      type = pool[Math.floor(rng(w) * pool.length)];
      if (w.requests.some(r => r.type === type)) type = null;
    }
    if (type) spawnRequest(w, type);
    w.nextReqT = w.t + (w.tutorial.length ? 3 : 18 + rng(w) * 16);
  }
}

// ---------- 动物：每 0.5 s 按身边的天气挑一次做什么 ----------
// 吃草 / 溜达；下雨兔子钻洞、鹿和狐狸躲进林子；打雷四散逃开；手低低地靠近：鹿抬头看，兔子太近就跑；
// 彩虹出来兔子蹦；夜里兔子、鹿睡觉，狐狸出来转；口渴了去水边喝水。
function pickNear(w, a, r, pred) {
  for (let tries = 0; tries < 24; tries++) {
    const ang = rng(w) * Math.PI * 2, d = r * (0.3 + 0.7 * rng(w)), x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
    if (pred(x, z)) return [x, z];
  }
  return null;
}
function updateAnimals(w, hands, dt, blocked) {
  const night = isNight(w), storm = w.t < w.stormUntil;
  for (const a of w.animals) {
    const S = SPECIES[a.sp];
    a.think -= dt; a.timer -= dt;
    const k = cellIndex(a.x, a.z), rainHere = k >= 0 ? w.rainCell[k] : 0;
    const hand = hands.find(h => h.over && Math.hypot(h.x - a.x, h.z - a.z) < 0.07 && h.y < 0.2);
    const ok = (x, z) => walkable(x, z, blocked) && Math.hypot(x - a.hx, z - a.hz) < 0.08;
    if (a.think <= 0) {
      a.think = 0.5;
      let act;
      const smogHere = k >= 0 ? w.smog[k] : 0, whirl = w.whirls.find(wh => Math.hypot(wh.x - a.x, wh.z - a.z) < 0.045);
      const food = (night && !S.nocturnal) || storm ? null : w.food.filter(f => Math.hypot(f.x - a.x, f.z - a.z) < 0.1).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0];
      a.food = food ? food.id : null;
      a.fleeFrom = whirl || (smogHere > 0.45 ? { x: a.x + (rng(w) - 0.5) * 0.01, z: a.z + (rng(w) - 0.5) * 0.01 } : null);
      if (blocked && blocked(a.x, a.z)) act = 'flee';
      else if (storm || a.fleeFrom) act = 'flee';
      else if (food && rainHere < 0.15) act = 'eat';
      else if (night && !S.nocturnal) act = 'sleep';
      else if (rainHere > 0.15) act = S.hides ? 'hide' : 'shelter';
      else if (hand && a.sp === 'rabbit' && Math.hypot(hand.x - a.x, hand.z - a.z) < 0.035) act = 'flee';
      else if (hand) act = 'look';
      else if (w.rainbowT > 0 && a.sp === 'rabbit') act = 'play';
      else if (a.thirst > 40) act = 'drink';
      else act = rng(w) < 0.6 ? 'graze' : 'wander';
      if (act !== a.act) { a.act = act; a.timer = 0; }
      a.look = (act === 'look' && hand) ? Math.atan2(hand.x - a.x, hand.z - a.z) : null;
    }
    a.thirst = (a.thirst || rng(w) * 30) + dt;
    if (a.timer <= 0) {
      a.timer = 1.5 + rng(w) * 4;
      let t = null;
      if (a.act === 'flee') {
        const from = a.fleeFrom || (w.lastStrike && storm ? w.lastStrike : (hands[0] || a));
        // 背对着危险跑；那边是水 / 岩壁就往两侧偏，直到找到能落脚的地方
        const base = Math.atan2(a.z - from.z, a.x - from.x);
        for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          for (let d = 0.04; d >= 0.01 && !t; d -= 0.01) { const ang = base + off + (rng(w) - 0.5) * 0.3, x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d; if (walkable(x, z, blocked)) t = [x, z]; }
          if (t) break;
        }
        a.timer = 1;
      } else if (a.act === 'shelter') t = pickNear(w, a, 0.04, (x, z) => ok(x, z) && cellType(x, z) === T.FOREST);
      else if (a.act === 'drink') {
        t = pickNear(w, a, 0.06, (x, z) => ok(x, z) && (riverDist(x, z) < 0.012 || lakeDist(x, z) < 0.01));
        if (t) a.thirst = 0;
      } else if (a.act === 'graze' || a.act === 'wander' || (a.act === 'sleep' && S.nocturnal)) t = pickNear(w, a, S.range * (a.act === 'graze' ? 0.4 : 1), (x, z) => ok(x, z) && S.home.includes(cellType(x, z)));
      else if (a.act === 'play') t = pickNear(w, a, 0.012, ok);
      else if (a.act === 'eat') { const f = w.food.find(f => f.id === a.food); if (f) t = [f.x + (rng(w) - 0.5) * 0.003, f.z + (rng(w) - 0.5) * 0.003]; a.timer = 0.6; }
      if (t) { a.tx = t[0]; a.tz = t[1]; }
    }
    // 吃东西：到了食物跟前低头吃，吃饱了（一整份）有可能生一只小的
    a.eating = false;
    if (a.act === 'eat') {
      const f = w.food.find(f => f.id === a.food);
      if (f && Math.hypot(f.x - a.x, f.z - a.z) < 0.006) {
        const bite = Math.min(f.amt, dt * 0.2); f.amt -= bite; a.fed += bite; a.eating = true;
        if (f.amt <= 0) { w.stats.eaten++; w.events.push({ type: 'eaten', x: f.x, z: f.z }); }
        if (a.fed >= 1) {
          a.fed = 0;
          const cap = SPECIES[a.sp].cap, have = w.animals.filter(b => b.sp === a.sp).length;
          if (have < cap && a.grow >= 1) {
            w.animals.push({ id: w.nextAnimalId++, sp: a.sp, x: a.x + 0.003, z: a.z + 0.003, hx: a.x, hz: a.z, tx: a.x, tz: a.z, act: 'graze', think: 0.5, timer: 1, face: a.face, moving: false, hidden: false, look: null, fed: 0, grow: 0.45 });
            w.stats.born++; w.events.push({ type: 'born', sp: a.sp, x: a.x, z: a.z });
          }
        }
      }
    }
    if (a.grow < 1) a.grow = Math.min(1, a.grow + dt / 60);   // 小的一分钟长大
    const sp = (a.act === 'flee' ? 2.2 : a.act === 'play' ? 1.5 : a.act === 'graze' ? 0.5 : 1) * S.speed;
    const still = a.act === 'sleep' && !S.nocturnal || a.act === 'look' || a.act === 'hide' || a.eating;
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
    if (!still && d > 0.0015) {
      const s = Math.min(d, sp * dt), nx = a.x + dx / d * s, nz = a.z + dz / d * s;
      // 逃跑时可以踩过岩浆 / 火（不然逃不出来），但不会跑进水里、跑出岛；已经困在走不了的地方就先挪出来
      if (walkable(nx, nz, a.act === 'flee' ? null : blocked) || (a.act === 'flee' && !walkable(a.x, a.z) && cellType(nx, nz) !== T.WATER && Math.hypot(nx, nz) < R - 0.012)) { a.x = nx; a.z = nz; a.face = Math.atan2(dx, dz); a.moving = true; }
      else if (a.act === 'flee') {   // 逃跑的路被水 / 崖挡住：换个方向（不然就卡在原地）
        for (let k = 0; k < 10; k++) { const an = rng(w) * 6.283, cx = a.x + Math.cos(an) * 0.02, cz = a.z + Math.sin(an) * 0.02; if (walkable(cx, cz, blocked)) { a.tx = cx; a.tz = cz; break; } }
        a.moving = false;
      }
      else { a.tx = a.x; a.tz = a.z; a.moving = false; }
    } else a.moving = false;
    if (a.look != null) a.face = a.look;
    a.hidden = a.act === 'hide' || (a.act === 'sleep' && a.sp === 'rabbit');
  }
}

// 靠水的格子（湿度跟着水位走）
export function prepare(w) {
  w._nearWater = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const [x, z] = cellCenter(i, j);
    if (w.type[j * N + i] !== T.WATER && (riverDist(x, z) < 0.022 || lakeDist(x, z) < 0.016)) w._nearWater[j * N + i] = 1;
  }
  return w;
}

// ---------- 存档 ----------
const ARR = ['M', 'G', 'boost', 'burnt', 'snow', 'smog'];
export function save(w) {
  const o = { v: 3, barren: w.barren, seed: w.seed, t: w.t, day: w.day, T: w.T, water: w.water, level: w.level, done: w.done, tutorial: w.tutorial, ice: w.ice, fish: w.fish };
  for (const a of ARR) o[a] = Array.from(w[a], x => Math.round(x * 1000) / 1000);
  return JSON.stringify(o);
}
export function load(json) {
  const o = JSON.parse(json);
  if (o.v !== 3) throw new Error('save version');
  const w = createWorld(o.seed, { start: o.barren ? 'barren' : 'lush' });
  Object.assign(w, { t: o.t, day: o.day, T: o.T, water: o.water, level: o.level, done: o.done, tutorial: o.tutorial, nextReqT: o.t + 4, ice: o.ice || 0, fish: o.fish || 6 });
  for (const a of ARR) if (o[a]) w[a].set(o[a]);
  w.animals = []; greenness(w); syncAnimals(w, true);
  return prepare(w);
}
