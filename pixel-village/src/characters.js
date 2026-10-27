import { R, INK } from './palette.js';
import { season } from './season.js';

/*
 * 程序化像素人物（纸娃娃系统）。
 *
 * 一个人 = 体型 + 肤色 + 发型 + 头饰 + 上衣款式 + 裤 / 围裙 / 腰带 + 手持物。
 * 每个人生成 16 帧：待机 2、干活 2、正面走 4、侧面走 4、背面走 4。
 * 画法：每个部位先铺中间色，左侧亮一档（夕阳从左来），右侧和下沿暗一档，
 * 再加衣缝、盘扣、白底布鞋这些细节；最后统一描 INK 边。
 *
 * 尺寸：每米 18 像素，成年男子约 31 像素高（头 9、身 11、腿 8、鞋 2、颈 1）。
 */

export const FRAME_W = 24;
export const FRAME_H = 40;
export const CELL_W = FRAME_W + 4; // 描边 1 + 透明留边 1，防止相邻帧采样串色
export const CELL_H = FRAME_H + 4;
export const FRAMES = ['idle0', 'idle1', 'work0', 'work1', 'front0', 'front1', 'front2', 'front3', 'side0', 'side1', 'side2', 'side3', 'back0', 'back1', 'back2', 'back3'];

const FEET = 38; // 鞋底所在行
const CX = 12;

// Q 版比例（参考潜水员戴夫）：头大约占身高 1/3，五官才放得下表情
const BODIES = {
  man: { headW: 11, headH: 11, torsoW: 11, torsoH: 9, legH: 7, neck: 1 },
  elder: { headW: 11, headH: 11, torsoW: 11, torsoH: 9, legH: 6, neck: 1 },
  woman: { headW: 11, headH: 11, torsoW: 9, torsoH: 9, legH: 6, neck: 1 },
  child: { headW: 11, headH: 10, torsoW: 9, torsoH: 6, legH: 4, neck: 0 },
};

/**
 * 体型（捏人用）：在男 / 女 / 老人的身量上加减。p.build 不写就是匀称。
 * 帧高 40、脚底在第 38 行：最高的体型（腿 +1、身子 +1）头顶还留着戴帽子的地方。
 */
export const BUILDS = {
  stout: { name: '魁梧', torsoW: 2, legH: 1 },
  thin: { name: '精瘦', torsoW: -2, legH: 1 },
  tall: { name: '高个', torsoH: 1, legH: 1 },
  short: { name: '矮壮', torsoW: 1, legH: -1 },
  fat: { name: '富态', torsoW: 2, torsoH: 1 },
  slim: { name: '苗条', torsoW: -1, legH: 1 },
  petite: { name: '娇小', torsoH: -1, legH: -1 },
  broad: { name: '宽肩', torsoW: 1, torsoH: 1 },
  bent: { name: '佝偻', torsoH: -1, legH: -1, torsoW: 1 },
};
/** 这个人的身量：BODIES 加上体型的增减。 */
export function bodyOf(p) {
  const b = BODIES[p.body] ?? BODIES.man, d = BUILDS[p.build];
  if (!d) return b;
  return { ...b, torsoW: b.torsoW + (d.torsoW ?? 0), torsoH: b.torsoH + (d.torsoH ?? 0), legH: b.legH + (d.legH ?? 0) };
}
/** 发型（捏人用的名字）。 */
export const HAIRS = { short: '短发', crew: '寸头', part: '分头', shaved: '光头', queue: '长辫', bun: '发髻', topknot: '抓髻', twinbuns: '双丫髻', braids: '两条辫子', ponytail: '马尾', fringe: '齐刘海', long: '披发' };

// ---------------------------------------------------------------- 像素网格

class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); }
  px(x, y, col) { if (col && x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = col; }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, col); }
  hline(x0, x1, y, col) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, col); }
  vline(x, y0, y1, col) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, col); }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.c[y * this.w + x] : null; }
  line(x0, y0, x1, y1, col) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), col);
  }
  /** 外描边：透明像素只要四邻有颜色就涂 INK。 */
  outline() {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.px(x, y, INK);
  }
}

/** 带体积感地填一个矩形块：中间色 + 左亮右暗 + 底暗。r 是色阶，base 是中间色下标。 */
function shadedRect(g, x, y, w, h, r, base = 2, { round = false, light = true, collar = false } = {}) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (round && (j === 0 || j === h - 1) && (i === 0 || i === w - 1)) continue;
    let k = base;
    if (light && (i === 0 || (w >= 8 && i === 1 && j > 0))) k = base + 1;
    if (i === w - 1 || (w >= 6 && i === w - 2) || (j === h - 1 && h > 2)) k = base - 1;
    if (collar && j === 1 && i > w / 2 - 3 && i < w / 2 + 2) k = base - 1; // 下巴投在领口的影子
    g.px(x + i, y + j, r[Math.max(0, Math.min(r.length - 1, k))]);
  }
}

// ---------------------------------------------------------------- 四季的衣服

/**
 * 按季节换一身衣服（季节见 season.js）。residents.js 里写的是秋天的穿着：
 * - 冬天：都穿棉袄（衣服上一道道绗线、毛领子），坎肩换成棉袄；男人戴棉帽（狗皮帽子，护耳放下来），
 *   妇女包头巾；过年穿新衣——孩子一身红（女孩粉）、年轻媳妇穿红袄扎红头巾。
 * - 夏天：短袖（胳膊露出来）、不打绑腿；男人换白粗布褂子，下地的戴草帽（毡帽也换成草帽）。
 * - 春秋：照原样。
 */
/** 长衫类（长衫、长衫外罩马褂）：下摆一直盖到脚面。 */
export const isGown = (p) => p.style === 'gown' || p.style === 'magua' || p.style === 'opera' || p.style === 'army';
/** 短褂一类（四季换装只动这几样：冬天絮成棉袄、夏天短袖）；别的款式（羊皮袄、蓑衣、肚兜……）选了就照样穿。 */
const basicStyle = (p) => !p.style || p.style === 'side';
const FLEECE = ['#5a4e4a', '#a89a8a', '#d8ccb8', '#f0e6d4', '#fff8ec']; // 羊皮袄：毛朝外
const STRAW = R.wheat; // 蓑衣
/** 上身用什么颜色：马褂是外罩的颜色，军大衣草绿，羊皮袄羊毛色，白背心白，肚兜底下光着膀子。 */
const upperRamp = (p) => p.style === 'magua' ? R[p.jacket ?? 'black'] : p.style === 'army' ? R.green : p.style === 'sheepskin' ? FLEECE : p.style === 'singlet' ? R.white : p.style === 'doudou' ? R[p.skin] : R[p.top];
/** 长衫类的下摆颜色。 */
const skirtRamp = (p) => p.style === 'army' ? R.green : R[p.top];
const LIGHT_TOPS = new Set(['white', 'pink', 'gold', 'khaki', 'mud', 'cabbage', 'grey', 'wheat']);
/**
 * 衣裳的花样，画在已经铺好底色的一块上（只改已经有颜色的格子）：
 * floral 碎花（浅布红花、深布白花，带一点叶子）、plaid 格子、stripe 竖条、patch 补丁（打了两块不同色的补丁，一圈针脚）。
 * 镶边（trim）在 torso 里画：领口、门襟、下摆、袖口一道对比色。
 */
function pattern(g, p, x, y, w, h, top) {
  const pat = p.pattern;
  if (!pat || pat === 'trim') return;
  const light = LIGHT_TOPS.has(p.top);
  const put = (i, j, c) => { if (i >= 0 && j >= 0 && i < w && j < h && g.get(x + i, y + j)) g.px(x + i, y + j, c); };
  if (pat === 'floral') {
    const a = light ? R.red : R.white, leaf = light ? R.green : R.gold;
    for (let j = 1; j < h - 1; j += 3) for (let i = (Math.floor(j / 3) % 2) * 2; i < w; i += 4) { put(i, j, a[3]); put(i + 1, j + 1, leaf[3]); }
  } else if (pat === 'plaid') {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i % 4 === 1 || j % 4 === 2) put(i, j, i % 4 === 1 && j % 4 === 2 ? top[0] : top[1]);
  } else if (pat === 'stripe') {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i += 3) put(i, j, light ? R.indigo[2] : top[Math.min(top.length - 1, 4)]);
  } else if (pat === 'patch' && w >= 4 && h >= 5) {
    const pa = light ? R.indigo : R.khaki, pb = light ? R.brown : R.grey;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { put(1 + i, h - 4 + j, pa[2]); put(w - 3 + i, 2 + j, pb[2]); }
    put(0, h - 4, R.white[2]); put(3, h - 3, R.white[2]); // 针脚
  }
}

export function dress(p) {
  if (p.dressed) return p;
  const S = season(), kid = p.body === 'child', man = p.sex === '男';
  const q = { ...p, dressed: true };
  if (q.style === 'cotton') { q.style = undefined; q.padded = S !== 'summer'; } // 棉袄：除了夏天都穿着
  if (S === 'winter') {
    if (q.style === 'vest') q.style = undefined;
    q.padded = basicStyle(q);
    if (kid) { q.top = man ? 'red' : 'pink'; q.hat = man ? 'furcap' : 'scarf'; q.scarfRamp = 'red'; }
    else if (man) { if (!q.hat || q.hat === 'straw') q.hat = 'furcap'; }
    else { q.hat = 'scarf'; if (p.age < 50 && basicStyle(q)) { q.scarfRamp = 'red'; q.top = 'red'; } }
  } else if (S === 'summer') {
    q.short = basicStyle(q) || q.style === 'vest' || q.style === 'zhongshan';
    q.legwrap = false;
    if (man && !kid && !isGown(q)) {
      if (basicStyle(q)) { q.top = 'grey'; q.style = undefined; q.pattern = undefined; }
      if ((!q.hat || q.hat === 'felt') && p.age < 65) q.hat = 'straw';
    }
  }
  return q;
}

// ---------------------------------------------------------------- 部件

function layout(b, bob) {
  const shoeTop = FEET - 1;
  const legTop = shoeTop - b.legH;
  const torsoTop = legTop - b.torsoH + bob;
  const headTop = torsoTop - b.neck - b.headH;
  return { shoeTop, legTop, torsoTop, headTop };
}

/** 正面 / 背面的头。view = 'front' | 'back'。 */
function head(g, p, b, L, view) {
  const S = R[p.skin];
  const x0 = CX - Math.floor(b.headW / 2);
  const y0 = L.headTop;
  const w = b.headW, h = b.headH;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const corner = (j === 0 && (i < 2 || i > w - 3)) || (j === 1 && (i === 0 || i === w - 1)) || (j === h - 1 && (i < 2 || i > w - 3));
    if (corner) continue;
    let k = 3;
    if (i === 0 || (i === 1 && j < h - 2)) k = 4;
    if (i >= w - 2 || j >= h - 2) k = 2;
    g.px(x0 + i, y0 + j, S[k]);
  }
  g.px(x0 - 1, y0 + Math.floor(h / 2), S[2]); // 耳朵
  g.px(x0 + w, y0 + Math.floor(h / 2), S[1]);
  if (b.neck) g.rect(CX - 1, y0 + h, 3, 1, S[1]);

  const ey = y0 + Math.floor(h * 0.55);
  if (view === 'front') {
    const H = R[p.hairRamp ?? 'hair'];
    const brow = p.elder ? R.grey[2] : H[1];
    g.hline(CX - 4, CX - 2, ey - 2, brow); g.hline(CX + 2, CX + 4, ey - 2, brow);
    for (const ex of [CX - 3, CX + 3]) { // 眼睛：2 像素高，上面一点高光
      g.vline(ex, ey - 1, ey, INK);
      g.px(ex, ey, '#4a3a5a');
    }
    g.px(CX, ey + 1, S[2]); // 鼻影
    if (p.blush) { g.hline(CX - 5, CX - 4, ey + 1, R.pink[3]); g.hline(CX + 4, CX + 5, ey + 1, R.pink[3]); }
    if (p.smile) { g.hline(CX - 1, CX + 1, ey + 3, R.pink[1]); g.px(CX - 2, ey + 2, S[1]); g.px(CX + 2, ey + 2, S[1]); }
    else g.hline(CX - 1, CX, ey + 3, S[1]);
    if (p.beard) { g.rect(CX - 3, ey + 3, 7, 2, R.grey[3]); g.hline(CX - 2, CX + 2, ey + 5, R.grey[2]); g.px(CX, ey + 6, R.grey[2]); g.hline(CX - 3, CX + 3, ey + 2, R.grey[3]); g.px(CX - 3, ey + 3, R.grey[4]); }
    if (p.mustache) { g.hline(CX - 3, CX + 3, ey + 2, R.hair[1]); g.px(CX - 3, ey + 3, R.hair[1]); g.px(CX + 3, ey + 3, R.hair[1]); }
  }
  return { x0, y0, w, h, ey };
}

/** 发型。back=true 时整个后脑都是头发。 */
function hair(g, p, H, view) {
  const r = R[p.hairRamp ?? 'hair'];
  const { x0, y0, w, h, ey } = H;
  const back = view === 'back';
  const style = p.hair;
  const cap = (rows) => {
    for (let j = 0; j < rows; j++) for (let i = 0; i < w; i++) {
      if (j === 0 && (i < 2 || i > w - 3)) continue;
      g.px(x0 + i, y0 + j, j === 0 || i < 2 ? r[2] : r[1]);
    }
    g.hline(x0 + 2, x0 + 4, y0 + 1, r[3]); g.px(x0 + 5, y0, r[3]); // 高光
  };
  if (style === 'shaved') {
    for (let i = 1; i < w - 1; i++) g.px(x0 + i, y0, r[3]);
    for (let i = 0; i < w; i += 2) g.px(x0 + i, y0 + 1, r[3]);
    if (back) for (let j = 2; j < h - 2; j += 2) for (let i = 1; i < w - 1; i += 2) g.px(x0 + i, y0 + j, r[3]);
    return;
  }
  if (style === 'tuft') { // 小孩：剃头留一撮
    g.rect(CX - 1, y0 - 2, 3, 3, r[1]); g.px(CX - 1, y0 - 2, r[2]);
    for (let i = 1; i < w - 1; i += 2) g.px(x0 + i, y0, r[3]);
    return;
  }
  if (style === 'crew') { // 寸头：贴着头皮短短一层
    for (let j = 0; j < 2; j++) for (let i = 0; i < w; i++) if (!(j === 0 && (i < 1 || i > w - 2))) g.px(x0 + i, y0 + j, (i + j) % 2 ? r[2] : r[1]);
    if (back) for (let j = 2; j < h - 3; j++) for (let i = 1; i < w - 1; i++) g.px(x0 + i, y0 + j, (i + j) % 2 ? r[2] : r[3]);
    return;
  }
  cap(3);
  // 鬓角 / 侧发：短的到耳朵上面，长的盖过耳朵
  const shortish = ['short', 'part', 'queue', 'topknot'].includes(style); // （老住户的发型照旧：只有 short 是短鬓角）
  const side = shortish ? ey - 1 : ey + 2;
  g.vline(x0, y0 + 1, side, r[2]); g.vline(x0 + w - 1, y0 + 1, side, r[1]);
  if (!shortish) { g.vline(x0 - 1, y0 + 2, side, r[1]); g.vline(x0 + w, y0 + 2, side, r[1]); }
  if (style === 'part' && !back) { g.px(x0 + 3, y0, R[p.skin][3]); g.hline(x0 + 4, x0 + w - 1, y0 + 3, r[1]); g.px(x0 + w - 1, y0 + 4, r[1]); } // 分头：左边一道发缝，刘海往右梳
  if (style === 'fringe' && !back) g.hline(x0, x0 + w - 1, y0 + 3, r[1]); // 齐刘海：齐眉一刀切
  if (style === 'topknot') { g.rect(CX - 1, y0 - 2, 3, 2, r[1]); g.px(CX, y0 - 2, r[2]); } // 抓髻：头顶挽个小疙瘩
  if (style === 'twinbuns') for (const bx of [x0, x0 + w - 3]) { g.rect(bx, y0 - 2, 3, 3, r[1]); g.px(bx + 1, y0 - 2, r[2]); } // 双丫髻
  if (style === 'long') { g.vline(x0 - 1, side, side + 4, r[1]); g.vline(x0 + w, side, side + 4, r[1]); } // 披发：垂到肩上
  if (style === 'bun') { g.rect(CX - 2, y0 - 2, 5, 3, r[1]); g.hline(CX - 1, CX + 1, y0 - 2, r[2]); g.px(CX + 2, y0 - 1, R.gold[3]); } // 发髻 + 簪
  if (style === 'braids') { // 两条辫子 + 红头绳
    for (const sx of [x0 - 1, x0 + w]) { g.vline(sx, side, side + 9, r[1]); g.px(sx, side + 10, R.red[3]); g.px(sx, side + 11, R.red[2]); }
  }
  if (back) {
    for (let j = 0; j < h - 1; j++) for (let i = 0; i < w; i++) {
      if (j === 0 && (i < 2 || i > w - 3)) continue;
      g.px(x0 + i, y0 + j, i < 2 ? r[2] : r[1]);
    }
    if (style === 'short' || style === 'white') g.hline(x0 + 1, x0 + w - 2, y0 + h - 1, R[p.skin][2]);
    if (style === 'bun') { g.rect(CX - 2, y0 + 1, 5, 3, r[0]); g.hline(CX - 1, CX + 1, y0 + 1, r[2]); }
    if (style === 'queue') { g.vline(CX, y0 + h - 1, y0 + h + 9, r[1]); g.vline(CX + 1, y0 + h - 1, y0 + h + 7, r[2]); g.px(CX, y0 + h + 10, R.red[2]); } // 长辫：从后脑垂到腰
    if (style === 'ponytail') { g.rect(CX - 1, y0 + h - 2, 3, 6, r[1]); g.px(CX, y0 + h - 3, R.red[3]); } // 马尾：后脑扎一把
    if (style === 'long' || style === 'fringe') g.rect(x0, y0 + h - 1, w, style === 'long' ? 4 : 2, r[1]); // 披发、齐刘海：后面垂过脖子
  }
}

/** 头饰：白羊肚手巾、毡帽、瓜皮帽、草帽、头巾。 */
function hat(g, p, H, view) {
  const { x0, y0, w } = H;
  switch (p.hat) {
    case 'towel': { // 白羊肚手巾：额前打结、两角翘起
      g.rect(x0 - 1, y0 - 1, w + 2, 3, R.grey[3]);
      g.hline(x0 - 1, x0 + w, y0 + 1, R.grey[2]);
      g.hline(x0, x0 + 2, y0 - 1, R.grey[4]);
      if (view === 'front') { g.px(CX - 1, y0 - 2, R.grey[3]); g.px(CX + 1, y0 - 2, R.grey[3]); g.px(CX - 2, y0 - 3, R.grey[4]); g.px(CX + 2, y0 - 3, R.grey[2]); }
      else { g.px(CX, y0 + 2, R.grey[2]); g.px(CX, y0 + 3, R.grey[2]); }
      break;
    }
    case 'felt': { // 毡帽
      g.rect(x0, y0 - 2, w, 4, R.black[2]);
      g.hline(x0 - 1, x0 + w, y0 + 1, R.black[1]);
      g.hline(x0 + 1, x0 + 3, y0 - 2, R.black[3]);
      break;
    }
    case 'skullcap': { // 瓜皮帽 + 红顶珠
      g.rect(x0, y0 - 1, w, 3, R.black[1]);
      g.hline(x0 + 1, x0 + w - 2, y0 - 2, R.black[1]);
      for (let i = x0 + 2; i < x0 + w; i += 3) g.vline(i, y0 - 1, y0 + 1, R.black[2]);
      g.px(CX, y0 - 3, R.red[3]);
      break;
    }
    case 'straw': { // 草帽：宽檐
      g.rect(x0 + 1, y0 - 3, w - 2, 3, R.wheat[3]);
      g.hline(x0 + 2, x0 + 4, y0 - 3, R.wheat[4]);
      g.hline(x0 + 1, x0 + w - 2, y0 - 1, R.red[2]);
      g.rect(x0 - 3, y0, w + 6, 1, R.wheat[3]);
      g.hline(x0 - 3, x0 + w + 2, y0 + 1, R.wheat[1]);
      break;
    }
    case 'furcap': { // 棉帽（狗皮帽子）：毛茸茸的帽檐，两边护耳放下来
      g.rect(x0, y0 - 2, w, 4, R.brown[2]);
      g.hline(x0 + 1, x0 + 3, y0 - 2, R.brown[3]);
      g.hline(x0 - 1, x0 + w, y0 + 1, R.khaki[3]);
      g.hline(x0, x0 + w - 1, y0 + 2, R.khaki[2]);
      if (view === 'side') g.rect(x0 + 2, y0 + 2, 3, 4, R.khaki[3]);
      else { g.vline(x0 - 1, y0 + 2, y0 + 5, R.khaki[3]); g.vline(x0 + w, y0 + 2, y0 + 5, R.khaki[2]); }
      break;
    }
    case 'veil': { // 养蜂的纱帽：草帽檐上垂一圈白纱，罩到肩膀
      g.rect(x0 + 1, y0 - 3, w - 2, 3, R.wheat[3]);
      g.rect(x0 - 2, y0, w + 4, 1, R.wheat[2]);
      for (let j = 1; j < H.h + 1; j++) for (let i = -2; i < w + 2; i++) if ((i + j) % 2 === 0 && (view !== 'front' || j < 2 || i < 0 || i > w - 1)) g.px(x0 + i, y0 + j, R.white[3]);
      break;
    }
    case 'douli': { // 斗笠：竹篾编的尖顶大檐，压得低低的
      g.rect(CX - 1, y0 - 4, 3, 1, R.wheat[3]);
      g.rect(x0 + 1, y0 - 3, w - 2, 2, R.wheat[3]);
      g.hline(x0 + 2, CX, y0 - 3, R.wheat[4]);
      g.rect(x0 - 3, y0 - 1, w + 6, 2, R.wheat[2]);
      g.hline(x0 - 3, x0 + w + 2, y0 - 1, R.wheat[3]);
      g.hline(x0 - 4, x0 + w + 3, y0 + 1, R.wheat[1]);
      break;
    }
    case 'scarf': { // 头巾（妇女），带小碎花
      const r = R[p.scarfRamp ?? 'indigo'];
      for (let j = -1; j < H.h - 2; j++) for (let i = -1; i <= w; i++) {
        const inside = j > 2 && i > 0 && i < w - 1 && view === 'front';
        if (inside) continue;
        if (j === -1 && (i < 1 || i > w - 2)) continue;
        g.px(x0 + i, y0 + j, i < 1 ? r[3] : (i + j) % 4 === 0 ? r[4] : r[2]);
      }
      if (view === 'back') g.rect(CX - 1, y0 + H.h - 2, 3, 3, r[1]); // 后面打结
      break;
    }
    default:
  }
}

/** 上衣（正面 / 背面）。返回袖子位置供手持物使用。 */
function torso(g, p, b, L, view, pose) {
  const top = upperRamp(p); // 马褂：上身是外罩的短褂；军大衣、羊皮袄、白背心、肚兜各有各的颜色
  const x0 = CX - Math.floor(b.torsoW / 2);
  const y0 = L.torsoTop;
  const w = b.torsoW, h = b.torsoH;
  shadedRect(g, x0, y0, w, h, top, 2, { round: true, collar: true });
  if (!['magua', 'army', 'sheepskin', 'singlet', 'doudou'].includes(p.style)) pattern(g, p, x0, y0, w, h, top);
  const S0 = R[p.skin];
  // 立领
  g.rect(CX - 2, y0, 5, 1, top[1]);
  if (p.padded) { // 棉袄：一道道绗线，毛领子
    for (let y = y0 + 3; y < y0 + h - 1; y += 3) for (let i = 1; i < w - 1; i += 2) g.px(x0 + i, y, top[1]);
    g.rect(CX - 3, y0, 7, 1, R.khaki[3]);
  }
  if (view === 'front') {
    if (p.style === 'side') { // 大襟：斜襟到右腋下
      for (let i = 0; i < 4; i++) g.px(CX - 1 + i, y0 + 1 + i, top[1]);
      g.vline(CX + 3, y0 + 4, y0 + h - 2, top[1]);
      g.px(CX + 1, y0 + 2, top[4]); g.px(CX + 3, y0 + 5, top[4]);
    } else if (p.style !== 'vest') { // 对襟 + 盘扣
      g.vline(CX, y0 + 1, y0 + h - 1, top[1]);
      for (let y = y0 + 2; y < y0 + h - 1; y += 2) g.px(CX, y, top[4]);
    }
    g.px(x0 + 2, y0 + 3, top[3]); g.px(x0 + 3, y0 + 6, top[1]); // 衣褶
  } else {
    g.vline(CX, y0 + 3, y0 + h - 2, top[1]); // 后背中缝
  }
  if (p.style === 'singlet' && view === 'front') g.rect(CX - 2, y0, 5, 2, S0[3]); // 白背心：领口开得低
  if (p.style === 'doudou') { // 红肚兜：光膀子，胸前一块菱形红布，镶金边；背后两根带子
    if (view === 'front') {
      for (let j = 0; j < h - 1; j++) { const hw = Math.min(j + 1, h - 1 - j) + 1; for (let i = -hw; i <= hw; i++) g.px(CX + i, y0 + j + 1, Math.abs(i) === hw ? R.gold[3] : R.red[2 + (j === 2 && i === 0 ? 1 : 0)]); }
      g.px(CX - 3, y0, R.red[1]); g.px(CX + 3, y0, R.red[1]);
    } else { g.line(x0 + 1, y0 + 1, x0 + w - 2, y0 + 4, R.red[2]); g.line(x0 + w - 2, y0 + 1, x0 + 1, y0 + 4, R.red[2]); }
  }
  if (p.style === 'zhongshan' && view === 'front') { // 中山装：翻领、四个兜、一排扣子
    for (const sx of [-1, 1]) { g.px(CX + sx, y0 + 1, top[4] ?? top[3]); g.px(CX + sx * 2, y0 + 1, top[4] ?? top[3]); g.px(CX + sx * 2, y0 + 2, top[3]); }
    for (const [px, py] of [[x0 + 1, y0 + 3], [x0 + w - 4, y0 + 3], [x0 + 1, y0 + h - 4], [x0 + w - 4, y0 + h - 4]]) { g.hline(px, px + 2, py, top[1]); g.px(px + 1, py + 1, top[1]); }
    for (let y = y0 + 2; y < y0 + h - 1; y += 2) g.px(CX, y, R.grey[3]);
  }
  if (p.style === 'overalls') { // 背带工装裤：护胸 + 两根背带
    const P = R[p.pants];
    if (view === 'front') { g.rect(CX - 3, y0 + 4, 7, h - 4, P[2]); g.hline(CX - 3, CX + 3, y0 + 4, P[3]); g.rect(CX - 1, y0 + 5, 3, 2, P[1]); }
    for (const sx of [-3, 3]) g.vline(CX + sx, y0, y0 + 4, P[2]);
    g.px(CX - 3, y0 + 4, R.gold[3]); g.px(CX + 3, y0 + 4, R.gold[3]);
  }
  if (p.style === 'army' && view === 'front') { // 军大衣：双排扣、腰带
    for (let y = y0 + 3; y < y0 + h; y += 2) { g.px(CX - 2, y, R.gold[3]); g.px(CX + 2, y, R.gold[3]); }
    g.hline(x0 + 1, x0 + w - 2, y0 + h - 3, top[1]);
  }
  if (p.style === 'sheepskin') for (let j = 1; j < h; j++) for (let i = (j % 2); i < w; i += 3) if (g.get(x0 + i, y0 + j)) g.px(x0 + i, y0 + j, FLEECE[j % 3 ? 3 : 1]); // 卷毛
  if (p.style === 'opera') for (let j = 1; j < h - 1; j += 2) for (let i = 1 + (j % 4 === 1 ? 0 : 2); i < w - 1; i += 4) g.px(x0 + i, y0 + j, R.gold[3]); // 戏袍上绣的金花
  if (p.pattern === 'trim' && p.style !== 'vest') { // 镶边：领口、门襟、下摆一道对比色
    const t = LIGHT_TOPS.has(p.top) ? R.black : R.red;
    g.rect(CX - 2, y0, 5, 1, t[2]);
    g.hline(x0 + 1, x0 + w - 2, y0 + h - 1, t[2]);
    if (view === 'front') { if (p.style === 'side') for (let i = 0; i < 4; i++) g.px(CX - 1 + i, y0 + 1 + i, t[2]); else g.vline(CX, y0 + 1, y0 + h - 2, t[2]); }
  }
  if (p.style === 'vest') { // 坎肩：衬衣袖子露出来
    const v = R[p.vest ?? 'black'];
    g.rect(x0, y0 + 1, 3, h - 1, v[2]); g.rect(x0 + w - 3, y0 + 1, 3, h - 1, v[1]);
    if (view === 'back') g.rect(x0, y0 + 1, w, h - 1, v[2]);
    g.px(x0 + 2, y0 + 3, v[3]); g.px(x0 + w - 3, y0 + 3, v[3]);
  }
  // 袖子 + 手
  const sleeve = p.style === 'vest' ? R[p.top] : top, bare = p.style === 'singlet' || p.style === 'doudou'; // 白背心、肚兜：光着胳膊
  const trimC = p.pattern === 'trim' ? (LIGHT_TOPS.has(p.top) ? R.black : R.red)[2] : null; // 镶边的袖口
  const S = R[p.skin];
  const armH = h - 2;
  const arms = [];
  for (const [side, ax] of [[-1, x0 - 2], [1, x0 + w]]) {
    const dy = side < 0 ? pose.armL : pose.armR;
    if (bare) shadedRect(g, ax, y0 + 1 + dy, 2, armH, S, 3, { light: side < 0 });
    else if (p.short) { // 短袖：袖子到胳膊肘，底下露着胳膊
      shadedRect(g, ax, y0 + 1 + dy, 2, 2, sleeve, 2, { light: side < 0 });
      shadedRect(g, ax, y0 + 3 + dy, 2, armH - 2, S, 3, { light: side < 0 });
    } else { shadedRect(g, ax, y0 + 1 + dy, 2, armH, sleeve, 2, { light: side < 0 }); if (p.style !== 'magua') pattern(g, p, ax, y0 + 1 + dy, 2, armH, sleeve); if (trimC) g.rect(ax, y0 + armH + dy, 2, 1, trimC); }
    g.rect(ax, y0 + 1 + armH + dy, 2, 2, side < 0 ? S[3] : S[2]);
    if (p.style === 'opera') { g.rect(ax, y0 + armH + dy, 2, 6, R.white[3]); g.px(ax + (side < 0 ? 0 : 1), y0 + armH + 5 + dy, R.white[2]); } // 水袖：长长的白袖子垂过手
    if (p.style === 'sheepskin') g.rect(ax, y0 + armH + dy, 2, 1, FLEECE[4]); // 羊毛袖口
    arms.push({ x: ax, y: y0 + 1 + armH + dy });
  }
  // 腰带 / 系绳
  if (p.sash) { const s = R[p.sash]; g.rect(x0, y0 + h - 2, w, 1, s[2]); if (view === 'front') { g.px(CX + 2, y0 + h - 1, s[2]); g.px(CX + 2, y0 + h, s[1]); } }
  return { left: arms[0], right: arms[1], x0, w };
}

/**
 * 外面罩着的（画在上身、胳膊上面）：羊皮袄的长下摆和毛领、蓑衣、斗篷、军大衣的毛领。
 * 蓑衣、斗篷从肩膀往下张开，盖住胳膊，到膝盖；下摆一刀刀参差（蓑衣）或者齐的（斗篷）。
 */
function outer(g, p, b, L, view) {
  const st = p.style, x0 = CX - Math.floor(b.torsoW / 2), w = b.torsoW, y0 = L.torsoTop, knee = L.legTop + Math.ceil(b.legH * 0.55);
  if (st === 'sheepskin') {
    for (let y = y0 + b.torsoH; y <= knee; y++) for (let i = -1; i <= w; i++) g.px(x0 + i, y, y === knee ? FLEECE[4] : (i + y) % 3 ? FLEECE[2] : FLEECE[3]);
    for (let i = -1; i <= w; i += 2) g.px(x0 + i, knee + 1, FLEECE[4]); // 下摆一圈毛
    g.rect(CX - 4, y0 - 1, 9, 2, FLEECE[4]); g.px(CX - 5, y0, FLEECE[3]); g.px(CX + 5, y0, FLEECE[3]); // 毛领
    if (view === 'front') g.vline(CX, y0 + 1, knee, R.brown[2]); // 皮面的门襟
  }
  if (st === 'army') { g.rect(CX - 4, y0, 9, 2, R.brown[3]); g.px(CX - 3, y0 + 1, R.brown[2]); g.px(CX + 2, y0, R.brown[2]); } // 毛领子
  if (st === 'raincoat' || st === 'cape') {
    const C = st === 'cape' ? R[p.top] : STRAW;
    for (let y = y0; y <= knee; y++) {
      const half = Math.floor(w / 2) + 1 + Math.floor((y - y0) / 2);
      for (let i = -half; i <= half; i++) {
        if (st === 'raincoat' && y >= knee - 1 && (i + y) % 3 === 0) continue; // 蓑衣下摆参差不齐
        const c = st === 'raincoat' ? STRAW[(i + 40) % 3 === 0 ? 1 : (i + 40) % 3 === 1 ? 2 : 3] : C[Math.abs(i) === half ? 1 : i < -half + 2 ? 3 : 2];
        g.px(CX + i, y, c);
      }
    }
    if (st === 'raincoat') { g.rect(CX - 4, y0 - 1, 9, 2, STRAW[3]); for (let i = -4; i <= 4; i += 2) g.px(CX + i, y0 + 1, STRAW[1]); } // 蓑衣领口一圈草
    else if (view === 'front') { g.px(CX, y0 + 1, R.gold[3]); g.vline(CX, y0 + 2, knee, C[1]); } // 斗篷：领口一颗扣，前襟合着
    else g.rect(CX - 3, y0 - 2, 7, 3, C[2]); // 背后耷拉着的风帽
  }
}

/** 腿、长衫下摆、绑腿、白底布鞋（正 / 背面）。 */
function legs(g, p, b, L, pose) {
  const pants = R[p.pants];
  const top = L.legTop + Math.min(0, pose.bob);
  if (isGown(p)) { // 长衫一直盖到脚面（马褂底下也是长衫；戏袍、军大衣也到脚面）
    const t = skirtRamp(p);
    const sway = pose.liftL ? -1 : pose.liftR ? 1 : 0;
    for (let y = top; y < L.shoeTop; y++) {
      const flare = Math.floor((y - top) / 4);
      const x0 = CX - Math.floor(b.torsoW / 2) - flare + (y > L.shoeTop - 3 ? sway : 0);
      const w = b.torsoW + flare * 2;
      for (let i = 0; i < w; i++) g.px(x0 + i, y, i === 0 ? t[3] : i === w - 1 ? t[1] : t[2]);
      g.px(CX + 1, y, t[1]); // 开衩
    }
    if (p.style === 'gown') pattern(g, p, CX - 10, top, 21, L.shoeTop - top, t);
    if (p.style === 'opera') for (let y = top + 1; y < L.shoeTop; y += 3) for (let x = CX - 6 + (y % 2) * 2; x <= CX + 6; x += 4) if (g.get(x, y)) g.px(x, y, R.gold[3]);
    if (p.style === 'army') { g.vline(CX, top, L.shoeTop - 1, t[1]); }
  } else {
    for (const [side, lx] of [[-1, CX - 4], [1, CX + 1]]) {
      const lift = side < 0 ? pose.liftL : pose.liftR;
      const bottom = L.shoeTop - 1 - lift;
      shadedRect(g, lx, top, 4, bottom - top + 1, pants, 2, { light: side < 0 });
      if (p.legwrap) { g.rect(lx, bottom - 2, 4, 3, R.grey[2]); g.hline(lx, lx + 3, bottom - 1, R.grey[1]); }
    }
    g.rect(CX - 4, top, 9, 2, pants[2]);
    g.px(CX, top + 2, pants[1]);
  }
  // 白底黑布鞋
  for (const [side, sx] of [[-1, CX - 4], [1, CX + 1]]) {
    const lift = side < 0 ? pose.liftL : pose.liftR;
    const y = L.shoeTop - lift;
    g.rect(sx, y, 4, 1, R.black[2]); g.px(sx, y, R.black[3]);
    g.rect(sx, y + 1, 4, 1, R.grey[3]);
  }
}

/** 围裙（铁匠皮围裙、豆腐坊白围裙）。 */
function apron(g, p, b, L, view) {
  if (!p.apron || view === 'back') return;
  const a = R[p.apron];
  const x0 = CX - 3, y0 = L.torsoTop + 3;
  const y1 = L.shoeTop - 2;
  for (let y = y0; y <= y1; y++) for (let x = x0; x < x0 + 7; x++) g.px(x, y, x === x0 ? a[3] : x === x0 + 6 ? a[1] : a[2]);
  g.line(x0, y0, CX - 2, L.torsoTop, a[1]); g.line(x0 + 6, y0, CX + 2, L.torsoTop, a[1]);
}

// ---------------------------------------------------------------- 手持物

const ITEMS = {
  hammer(g, hand, work) { // 铁锤：干活时举过头 / 砸下
    const up = work === 1;
    const hx = hand.x + 1, hy = hand.y;
    if (up) { g.vline(hx, hy - 9, hy, R.wood[3]); g.rect(hx - 2, hy - 11, 5, 3, R.stone[2]); g.hline(hx - 2, hx + 2, hy - 11, R.stone[4]); }
    else { g.line(hx, hy, hx + 5, hy - 2, R.wood[3]); g.rect(hx + 5, hy - 4, 3, 4, R.stone[2]); g.px(hx + 5, hy - 4, R.stone[4]); }
  },
  saw(g, hand, work) {
    const dx = work === 1 ? 2 : 0;
    g.rect(hand.x + 1 + dx, hand.y - 1, 2, 2, R.wood[3]);
    g.rect(hand.x + 3 + dx, hand.y - 1, 7, 2, R.stone[3]);
    for (let i = 0; i < 7; i += 2) g.px(hand.x + 3 + dx + i, hand.y + 1, R.stone[2]);
  },
  hoe(g, hand, work) { // 锄头扛在肩上 / 锄地
    if (work === 1) { g.line(hand.x + 1, hand.y, hand.x + 6, hand.y - 12, R.wood[3]); g.rect(hand.x + 5, hand.y - 14, 4, 2, R.stone[3]); }
    else { g.line(hand.x + 1, hand.y, hand.x + 7, hand.y + 3, R.wood[3]); g.rect(hand.x + 7, hand.y + 3, 2, 4, R.stone[3]); }
  },
  pole(g, hand, work, view) { // 扁担挑两只筐
    const y = hand.y - 12;
    if (view === 'side') { g.rect(hand.x - 9, y + 4, 4, 4, R.wheat[2]); g.rect(hand.x + 7, y + 4, 4, 4, R.wheat[2]); g.hline(hand.x - 8, hand.x + 9, y, R.wood[3]); return; }
    g.hline(0, FRAME_W - 1, y, R.wood[3]);
    for (const bx of [0, FRAME_W - 4]) {
      g.vline(bx + 1, y + 1, y + 6, R.wood[1]); g.vline(bx + 2, y + 1, y + 6, R.wood[1]);
      g.rect(bx, y + 7, 4, 4, R.wheat[2]); g.hline(bx, bx + 3, y + 7, R.wheat[3]); g.rect(bx, y + 6, 4, 1, R.cabbage[3]);
    }
  },
  peddler(g, hand, work, view) { // 货郎担：扁担两头各挑一只带腿的木货柜，顶上货盘摆着彩色小货
    const y = hand.y - 12;
    const cabinet = (bx) => {
      g.vline(bx + 2, y + 1, y + 3, R.wood[2]); // 门字架立柱
      g.rect(bx, y + 4, 6, 1, R.wood[1]); for (let i = 1; i < 5; i += 2) g.px(bx + i, y + 3, [R.red[3], R.gold[3]][i >> 1]); // 货盘 + 小货
      g.rect(bx, y + 5, 6, 7, R.wood[2]); g.hline(bx, bx + 5, y + 8, R.wood[1]); g.px(bx + 2, y + 6, R.gold[4]); g.px(bx + 2, y + 10, R.gold[4]); // 柜身、两排抽屉
      g.vline(bx, y + 12, y + 13, R.wood[1]); g.vline(bx + 5, y + 12, y + 13, R.wood[1]); // 腿
    };
    if (view === 'side') { g.hline(hand.x - 11, hand.x + 11, y, R.wood[3]); cabinet(hand.x - 12); cabinet(hand.x + 7); return; }
    g.hline(0, FRAME_W - 1, y, R.wood[3]);
    cabinet(0); cabinet(FRAME_W - 6);
  },
  rod(g, hand) { // 钓鱼竿：竹竿往前上方斜挑，竿梢垂线和浮子
    g.line(hand.x + 1, hand.y, hand.x + 5, hand.y - 12, R.wheat[3]);
    g.vline(hand.x + 5, hand.y - 11, hand.y - 5, R.white[3]); g.px(hand.x + 5, hand.y - 4, R.red[3]);
  },
  book(g, hand, work) {
    const y = hand.y - (work === 1 ? 5 : 2);
    g.rect(hand.x - 1, y, 4, 3, R.indigo[3]); g.hline(hand.x - 1, hand.x + 2, y, R.paper[2]);
  },
  pipe(g, hand) { // 旱烟袋
    g.line(hand.x + 1, hand.y, hand.x + 4, hand.y - 7, R.wood[2]);
    g.rect(hand.x + 4, hand.y - 9, 2, 2, R.gold[2]); g.px(hand.x + 1, hand.y + 1, R.green[3]);
  },
  cane(g, hand) { g.vline(hand.x + 2, hand.y - 1, FEET, R.wood[3]); g.hline(hand.x, hand.x + 2, hand.y - 1, R.wood[3]); },
  whip(g, hand, work) { // 羊鞭
    g.line(hand.x + 1, hand.y, hand.x + 3, hand.y - 10, R.wood[3]);
    if (work === 1) g.line(hand.x + 3, hand.y - 10, hand.x + 8, hand.y - 6, R.grey[2]); else g.line(hand.x + 3, hand.y - 10, hand.x + 4, hand.y - 3, R.grey[2]);
  },
  basket(g, hand) {
    g.rect(hand.x - 1, hand.y, 5, 4, R.wheat[2]); g.hline(hand.x - 1, hand.x + 3, hand.y, R.wheat[3]);
    g.hline(hand.x, hand.x + 2, hand.y - 1, R.red[3]); g.px(hand.x + 2, hand.y - 1, R.autumn[3]);
  },
  broom(g, hand, work) {
    const dx = work === 1 ? 2 : 0;
    g.vline(hand.x + 1, hand.y - 6, hand.y + 6, R.wood[3]);
    g.rect(hand.x - 1 + dx, hand.y + 7, 5, 3, R.wheat[2]); g.hline(hand.x - 1 + dx, hand.x + 3 + dx, hand.y + 9, R.wheat[1]);
  },
  box(g, hand) { // 郎中的药箱
    g.rect(hand.x - 1, hand.y, 5, 4, R.wood[2]); g.hline(hand.x - 1, hand.x + 3, hand.y, R.wood[3]); g.px(hand.x + 1, hand.y + 2, R.gold[3]);
  },
  ladle(g, hand, work) { // 豆腐坊的大勺
    const y = hand.y - (work === 1 ? 3 : 0);
    g.line(hand.x + 1, y, hand.x + 6, y - 3, R.wood[3]); g.rect(hand.x + 6, y - 4, 3, 2, R.grey[2]);
  },
  bowl(g, hand) { g.rect(hand.x - 1, hand.y - 1, 4, 2, R.grey[3]); g.px(hand.x, hand.y - 2, R.grey[4]); },
  buckets(g, hand, work, view) { // 扁担挑两只水桶
    const y = hand.y - 12;
    if (view === 'side') { g.hline(hand.x - 8, hand.x + 9, y, R.wood[3]); g.rect(hand.x - 9, y + 5, 3, 4, R.wood[2]); g.rect(hand.x + 7, y + 5, 3, 4, R.wood[2]); return; }
    g.hline(0, FRAME_W - 1, y, R.wood[3]);
    for (const bx of [0, FRAME_W - 4]) {
      g.vline(bx + 1, y + 1, y + 5, R.wood[1]); g.vline(bx + 2, y + 1, y + 5, R.wood[1]);
      g.rect(bx, y + 6, 4, 5, R.wood[2]); g.hline(bx, bx + 3, y + 6, R.water[3]); g.hline(bx, bx + 3, y + 8, R.slate[2]);
    }
  },
  pickaxe(g, hand, work) { // 镐：挖煤、刨旧物，举起 / 刨下
    if (work === 1) { g.line(hand.x + 1, hand.y, hand.x + 3, hand.y - 11, R.wood[3]); g.hline(hand.x - 1, hand.x + 7, hand.y - 12, R.stone[2]); g.px(hand.x + 7, hand.y - 11, R.stone[3]); g.px(hand.x - 1, hand.y - 11, R.stone[3]); }
    else { g.line(hand.x + 1, hand.y, hand.x + 8, hand.y - 3, R.wood[3]); g.vline(hand.x + 8, hand.y - 6, hand.y + 1, R.stone[2]); g.px(hand.x + 8, hand.y - 6, R.stone[4]); }
  },
  axe(g, hand, work) { // 斧子
    const up = work === 1;
    g.line(hand.x + 1, hand.y, hand.x + (up ? 2 : 7), hand.y - (up ? 10 : 2), R.wood[3]);
    if (up) { g.rect(hand.x + 2, hand.y - 12, 3, 3, R.stone[2]); g.px(hand.x + 4, hand.y - 12, R.stone[4]); } else { g.rect(hand.x + 7, hand.y - 4, 2, 4, R.stone[2]); g.px(hand.x + 8, hand.y - 4, R.stone[4]); }
  },
  knife(g, hand, work) { // 杀猪刀：长刃、木把
    const y = hand.y - (work === 1 ? 3 : 0);
    g.hline(hand.x, hand.x + 1, y, R.wood[2]); g.hline(hand.x + 2, hand.x + 7, y, R.grey[3]); g.hline(hand.x + 2, hand.x + 6, y + 1, R.grey[2]); g.px(hand.x + 7, y - 1, R.white[3]);
  },
  trowel(g, hand, work) { // 泥抹子 + 一小桶泥
    const y = hand.y - (work === 1 ? 2 : 0);
    g.vline(hand.x + 1, y - 2, y, R.wood[3]); g.rect(hand.x, y - 4, 4, 2, R.grey[3]); g.hline(hand.x, hand.x + 3, y - 4, R.grey[4]);
    g.rect(hand.x - 3, hand.y + 3, 3, 3, R.wood[2]); g.hline(hand.x - 3, hand.x - 1, hand.y + 3, R.mud[2]);
  },
  teapot(g, hand, work) { // 大铜茶壶：倒茶时壶嘴往下
    const y = hand.y - 1, dy = work === 1 ? 1 : 0;
    g.rect(hand.x, y, 5, 4, R.gold[2]); g.hline(hand.x + 1, hand.x + 3, y - 1, R.gold[3]); g.px(hand.x + 2, y - 2, R.gold[4]);
    g.line(hand.x + 5, y + 1, hand.x + 7, y - 1 + dy * 3, R.gold[2]); g.vline(hand.x - 1, y, y + 2, R.gold[1]);
  },
  trap(g, hand) { // 套子：一盘细绳、一根木橛子
    g.rect(hand.x - 1, hand.y, 4, 3, R.wheat[1]); g.hline(hand.x - 1, hand.x + 2, hand.y + 1, R.wheat[3]); g.vline(hand.x + 3, hand.y - 4, hand.y + 3, R.wood[3]);
  },
  shovel(g, hand, work) { // 铁锹：烧炭、刨土
    if (work === 1) { g.vline(hand.x + 2, hand.y - 8, hand.y + 2, R.wood[3]); g.rect(hand.x + 1, hand.y + 3, 3, 4, R.stone[2]); }
    else { g.line(hand.x + 1, hand.y, hand.x + 7, hand.y + 4, R.wood[3]); g.rect(hand.x + 7, hand.y + 4, 3, 3, R.stone[2]); g.px(hand.x + 9, hand.y + 6, R.stone[1]); }
  },
  seedling(g, hand) { // 一盘秧苗（育良种）
    g.rect(hand.x - 2, hand.y + 1, 6, 2, R.wood[2]); for (let i = 0; i < 6; i += 2) { g.px(hand.x - 2 + i, hand.y, R.cabbage[3]); g.px(hand.x - 1 + i, hand.y - 1, R.cabbage[4]); }
  },
  smoker(g, hand, work) { // 养蜂的熏烟罐：一只小铁罐，罐嘴冒烟
    g.rect(hand.x, hand.y - 1, 3, 4, R.slate[2]); g.px(hand.x + 1, hand.y - 2, R.slate[3]);
    g.px(hand.x + 2, hand.y - 3 - work, R.smoke[2]); g.px(hand.x + 3, hand.y - 5 - work, R.smoke[3]);
  },
  can(g, hand, work) { // 浇菜的水瓢 / 水壶
    g.rect(hand.x, hand.y, 4, 3, R.wood[2]); g.hline(hand.x, hand.x + 3, hand.y, R.water[3]); g.line(hand.x + 4, hand.y + 1, hand.x + 6, hand.y - 1 + work * 3, R.wood[2]);
  },
  shears(g, hand) { // 剪子 + 一卷布（裁缝）
    g.rect(hand.x - 2, hand.y + 1, 4, 3, R.indigo[3]); g.hline(hand.x - 2, hand.x + 1, hand.y + 1, R.indigo[4]);
    g.line(hand.x + 2, hand.y, hand.x + 5, hand.y - 3, R.grey[3]); g.line(hand.x + 2, hand.y - 2, hand.x + 5, hand.y + 1, R.grey[3]);
  },
  bucket(g, hand) { // 一只泔水桶（喂猪）
    g.rect(hand.x - 1, hand.y, 4, 4, R.wood[2]); g.hline(hand.x - 1, hand.x + 2, hand.y + 1, R.slate[2]); g.hline(hand.x - 1, hand.x + 2, hand.y, R.mud[2]);
  },
  tray(g, hand) { // 一盆豆腐
    g.rect(hand.x - 3, hand.y - 2, 7, 2, R.wood[2]); g.rect(hand.x - 2, hand.y - 3, 5, 1, R.white[3]);
  },
  huqin(g, hand) { // 板胡：竖着的琴杆 + 底下的椰壳琴筒（搁在腿上）
    g.vline(hand.x + 1, hand.y - 12, hand.y + 1, R.wood[1]);
    g.px(hand.x, hand.y - 11, R.wood[3]); g.px(hand.x + 2, hand.y - 10, R.wood[3]);
    g.rect(hand.x, hand.y + 1, 3, 3, R.brown[2]); g.hline(hand.x, hand.x + 2, hand.y + 1, R.paper[3]);
  },
  umbrella(g, hand) { // 油纸伞：竹柄 + 一顶黄油纸伞面
    g.vline(hand.x + 1, hand.y - 13, hand.y + 1, R.wood[3]);
    g.rect(hand.x - 5, hand.y - 15, 13, 2, R.gold[2]); g.rect(hand.x - 3, hand.y - 16, 9, 1, R.gold[3]); g.px(hand.x + 1, hand.y - 17, R.wood[3]);
    for (const x of [hand.x - 5, hand.x + 7]) g.px(x, hand.y - 13, R.gold[1]);
  },
  axe(g, hand, work) { // 斧子
    const up = work === 1;
    g.line(hand.x + 1, hand.y, hand.x + (up ? 3 : 6), hand.y - (up ? 8 : 2), R.wood[3]);
    if (up) g.rect(hand.x + 2, hand.y - 11, 4, 3, R.grey[3]); else g.rect(hand.x + 6, hand.y - 4, 3, 4, R.grey[3]);
  },
  sickle(g, hand, work) { // 镰刀：短木把 + 弯弯的月牙刃（割麦、割谷子）
    const dy = work === 1 ? 2 : 0;
    g.line(hand.x + 1, hand.y, hand.x + 4, hand.y - 1 + dy, R.wood[3]);
    for (const [x, y, c] of [[5, -2, 3], [6, -3, 4], [7, -3, 3], [8, -2, 3], [9, -1, 3], [9, 0, 2]]) g.px(hand.x + x, hand.y + y + dy, R.grey[c]);
  },
  shovel(g, hand, work) { // 木锨：长把 + 宽木板头（铲雪、扬场）
    const up = work === 1 ? -4 : 0;
    g.line(hand.x + 1, hand.y, hand.x + 8, hand.y + 4 + up, R.wood[3]);
    g.rect(hand.x + 8, hand.y + 3 + up, 3, 5, R.wood[2]); g.vline(hand.x + 10, hand.y + 3 + up, hand.y + 7 + up, R.wood[1]);
  },
  fork(g, hand, work) { // 粪杈：长把，头上三根铁齿（拾粪、翻场）
    const up = work === 1 ? -3 : 0;
    g.line(hand.x + 1, hand.y, hand.x + 8, hand.y + 4 + up, R.wood[3]);
    g.vline(hand.x + 8, hand.y + 3 + up, hand.y + 6 + up, R.slate[3]);
    for (const dx of [9, 10]) g.line(hand.x + dx, hand.y + 3 + up, hand.x + dx + 1, hand.y + 6 + up, R.slate[3]);
  },
  firewood(g, hand) { // 一捆柴，扛在肩上
    const y = hand.y - 12;
    for (let i = 0; i < 3; i++) g.hline(2, FRAME_W - 3, y + i, i === 1 ? R.wood[1] : R.wood[2]);
    g.vline(6, y - 1, y + 3, R.wheat[1]); g.vline(FRAME_W - 7, y - 1, y + 3, R.wheat[1]);
  },
  razor(g, hand) { // 剃刀：木柄 + 一片亮刃
    g.px(hand.x + 1, hand.y, R.wood[3]); g.px(hand.x + 2, hand.y - 1, R.wood[3]);
    g.hline(hand.x + 3, hand.x + 5, hand.y - 2, R.white[3]); g.px(hand.x + 3, hand.y - 1, R.grey[3]);
  },
  earpick(g, hand) { g.line(hand.x + 1, hand.y, hand.x + 4, hand.y - 2, R.gold[3]); }, // 耳挖勺
  lantern(g, hand) { // 打更的灯笼：短竿挑着一盏红灯笼
    g.line(hand.x + 1, hand.y, hand.x + 4, hand.y - 4, R.wood[2]);
    g.vline(hand.x + 4, hand.y - 3, hand.y - 2, R.black[2]);
    g.rect(hand.x + 3, hand.y - 1, 3, 4, R.red[3]); g.hline(hand.x + 3, hand.x + 5, hand.y - 1, R.gold[3]); g.hline(hand.x + 3, hand.x + 5, hand.y + 2, R.gold[3]); g.px(hand.x + 4, hand.y, R.gold[4]);
  },
  fan(g, hand) { // 唱戏的折扇
    g.vline(hand.x + 1, hand.y - 1, hand.y, R.wood[3]);
    g.rect(hand.x - 1, hand.y - 5, 5, 4, R.red[3]); g.hline(hand.x - 2, hand.x + 4, hand.y - 6, R.gold[3]); g.px(hand.x + 1, hand.y - 3, R.gold[4]);
  },
  kite(g, hand, work) { // 小孩放风筝
    const k = work === 1 ? 1 : 0;
    g.line(hand.x + 1, hand.y, hand.x + 6, 3 + k, R.grey[3]);
    g.rect(hand.x + 6, 1 + k, 3, 3, R.red[3]); g.px(hand.x + 7, 4 + k, R.gold[3]); g.px(hand.x + 7, 5 + k, R.red[2]);
  },
};

// ---------------------------------------------------------------- 侧面

function sideView(g, p, b, pose, { item = true, nose = true } = {}) {
  const L = layout(b, pose.bob);
  const S = R[p.skin];
  const gownC = skirtRamp(p), top = upperRamp(p); // 马褂：上身外罩的颜色，下摆是长衫
  const pants = R[p.pants];
  // 腿：远侧那条暗一档，先画
  const legRows = L.shoeTop - L.legTop;
  const drawLeg = (dx, lift, ramp, far) => {
    for (let j = 0; j < legRows - lift; j++) {
      const t = j / Math.max(1, legRows - 1);
      const x = CX - 1 + Math.round(dx * t);
      for (let i = 0; i < 3; i++) g.px(x + i, L.legTop + j, ramp[far ? 1 : i === 0 ? 3 : 2]);
    }
    const x = CX - 1 + dx;
    const y = L.shoeTop - lift;
    g.rect(x, y, 4, 1, R.black[far ? 1 : 2]);
    g.rect(x, y + 1, 4, 1, R.grey[far ? 2 : 3]);
    if (p.legwrap) g.rect(x, y - 3, 3, 3, R.grey[far ? 1 : 2]);
  };
  if (isGown(p)) {
    drawLeg(pose.farDx, pose.liftFar, pants, true);
    drawLeg(pose.nearDx, pose.liftNear, pants, false);
    for (let y = L.legTop + Math.min(0, pose.bob); y < L.shoeTop - 1; y++) {
      const flare = Math.floor((y - L.legTop) / 4);
      for (let x = CX - 3 - flare; x <= CX + 3 + flare; x++) g.px(x, y, x === CX - 3 - flare ? gownC[3] : gownC[2]);
    }
  } else {
    drawLeg(pose.farDx, pose.liftFar, pants, true);
    drawLeg(pose.nearDx, pose.liftNear, pants, false);
    g.rect(CX - 2, L.legTop + Math.min(0, pose.bob), 6, 2, pants[2]);
  }
  // 躯干（侧面更窄）
  const tx0 = CX - 3, tw = 7;
  shadedRect(g, tx0, L.torsoTop, tw, b.torsoH, top, 2, { round: true });
  if (!['magua', 'army', 'sheepskin', 'singlet', 'doudou'].includes(p.style)) pattern(g, p, tx0, L.torsoTop, tw, b.torsoH, top);
  { // 侧面看得见的特别款式
    const st = p.style, ty = L.torsoTop, knee = L.legTop + Math.ceil(b.legH * 0.55);
    if (st === 'doudou') g.vline(tx0 + tw - 1, ty + 1, ty + b.torsoH - 1, R.red[2]);
    if (st === 'overalls') g.rect(tx0 + tw - 2, ty + 4, 2, b.torsoH - 4, R[p.pants][2]);
    if (st === 'sheepskin') { g.rect(tx0 - 1, ty + b.torsoH, tw + 2, knee - ty - b.torsoH + 1, FLEECE[2]); g.hline(tx0 - 1, tx0 + tw, knee, FLEECE[4]); g.rect(tx0, ty - 1, tw, 2, FLEECE[4]); }
    if (st === 'army') g.rect(tx0, ty, tw, 2, R.brown[3]);
    if (st === 'raincoat' || st === 'cape') {
      const C = st === 'cape' ? R[p.top] : STRAW;
      for (let y = ty; y <= knee; y++) { const back = 1 + Math.floor((y - ty) / 2); for (let x = tx0 - back; x < tx0 + tw + 1; x++) { if (st === 'raincoat' && y >= knee - 1 && (x + y) % 3 === 0) continue; g.px(x, y, st === 'raincoat' ? STRAW[(x + 40) % 3 + 1] : C[x === tx0 - back ? 1 : 2]); } }
      if (st === 'cape') g.rect(tx0 - 2, ty - 2, 3, 3, C[2]);
    }
  }
  g.vline(tx0 + tw - 1, L.torsoTop + 1, L.torsoTop + b.torsoH - 1, top[1]);
  if (p.pattern === 'trim') g.hline(tx0, tx0 + tw - 1, L.torsoTop + b.torsoH - 1, (LIGHT_TOPS.has(p.top) ? R.black : R.red)[2]);
  if (p.style === 'vest') { const v = R[p.vest ?? 'black']; g.rect(tx0, L.torsoTop + 1, tw, b.torsoH - 1, v[2]); g.px(tx0 + 1, L.torsoTop + 2, v[3]); }
  if (p.sash) g.rect(tx0, L.torsoTop + b.torsoH - 2, tw, 1, R[p.sash][2]);
  if (p.apron) { const a = R[p.apron]; g.rect(tx0 + tw - 1, L.torsoTop + 3, 2, L.shoeTop - 2 - L.torsoTop - 3, a[2]); }
  // 头（侧脸朝右）
  const hw = b.headW - 1, hh = b.headH;
  const hx0 = CX - 5, hy0 = L.headTop;
  for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
    if ((j === 0 && (i < 2 || i > hw - 3)) || (j === hh - 1 && (i < 2 || i > hw - 2))) continue;
    g.px(hx0 + i, hy0 + j, i >= hw - 2 ? S[3] : i < 2 ? S[2] : S[3]);
  }
  if (b.neck) g.rect(CX - 1, hy0 + hh, 3, 1, S[1]);
  const ey = hy0 + Math.floor(hh * 0.55);
  if (nose) g.px(hx0 + hw, ey + 1, S[3]); // 鼻尖（侧面不画眼睛、眉毛：体素小人侧面贴的就是这张图，眼睛长在脸侧很怪）
  g.px(hx0 + hw - 2, ey + 3, p.smile ? R.pink[1] : S[1]);
  if (p.blush) g.px(hx0 + hw - 3, ey + 1, R.pink[3]);
  if (p.beard) { g.rect(hx0 + hw - 4, ey + 2, 4, 3, R.grey[3]); }
  g.px(hx0 + 3, ey, S[1]); g.px(hx0 + 3, ey + 1, S[2]); // 耳
  // 头发（侧面：后脑勺和头顶）
  const r = R[p.hairRamp ?? 'hair'];
  if (p.hair === 'shaved' || p.hair === 'tuft' || p.hair === 'crew') {
    for (let i = 1; i < hw - 1; i++) g.px(hx0 + i, hy0, p.hair === 'crew' ? r[1] : r[3]);
    if (p.hair === 'crew') for (let i = 0; i < hw - 4; i++) g.px(hx0 + i, hy0 + 1, r[2]);
    if (p.hair === 'tuft') g.rect(hx0 + 3, hy0 - 2, 3, 2, r[1]);
  } else {
    for (let i = 0; i < hw - 2; i++) g.px(hx0 + i, hy0, r[2]);
    for (let j = 1; j < 3; j++) for (let i = 0; i < hw - 3; i++) g.px(hx0 + i, hy0 + j, r[1]);
    for (let j = 3; j < ey - hy0; j++) for (let i = 0; i < hw - 4; i++) g.px(hx0 + i, hy0 + j, j === 3 && i > hw - 6 ? r[2] : r[1]); // 两鬓：盖到耳朵上面
    const long = p.hair !== 'short';
    for (let j = ey - hy0; j < ey - hy0 + (long ? 4 : 2); j++) for (let i = 0; i < (long ? 4 : 3); i++) g.px(hx0 + i, hy0 + j, r[1]); // 后脑勺；长头发再往下盖过耳朵
    if (p.hair === 'bun') g.rect(hx0 - 2, hy0 + 1, 3, 3, r[1]);
    if (p.hair === 'braids') { g.vline(hx0, hy0 + 6, hy0 + 15, r[1]); g.px(hx0, hy0 + 16, R.red[3]); }
    if (p.hair === 'queue') { g.vline(hx0 - 1, ey, ey + 12, r[1]); g.px(hx0 - 1, ey + 13, R.red[2]); }
    if (p.hair === 'ponytail') { g.rect(hx0 - 2, ey - 2, 2, 5, r[1]); }
    if (p.hair === 'topknot') g.rect(hx0 + 3, hy0 - 2, 3, 2, r[1]);
    if (p.hair === 'twinbuns') g.rect(hx0 + 1, hy0 - 2, 3, 3, r[1]);
    if (p.hair === 'long') g.rect(hx0, ey + 2, 3, 4, r[1]);
  }
  const H = { x0: hx0, y0: hy0, w: hw, h: hh, ey };
  hat(g, p, H, 'side');
  // 近侧手臂：随步伐前后摆
  const ax = CX - 1 + pose.armDx;
  const armTop = L.torsoTop + 1;
  for (let j = 0; j < b.torsoH - 2; j++) {
    const x = CX - 1 + Math.round(pose.armDx * (j / (b.torsoH - 3)));
    g.px(x, armTop + j, top[3]); g.px(x + 1, armTop + j, top[2]);
  }
  const hand = { x: ax, y: armTop + b.torsoH - 2 };
  g.rect(hand.x, hand.y, 2, 2, S[3]);
  if (item && p.item && ITEMS[p.item] && !['cane', 'kite'].includes(p.item)) ITEMS[p.item](g, hand, 0, 'side');
  if (item && p.item === 'cane') ITEMS.cane(g, { x: hand.x + 1, y: hand.y }, 0);
}

// ---------------------------------------------------------------- 组装

function frontOrBack(p, b, view, pose, work, { item = true } = {}) {
  const g = new Grid(FRAME_W, FRAME_H);
  const L = layout(b, pose.bob);
  if (item && view === 'back' && (p.item === 'pole' || p.item === 'peddler')) ITEMS[p.item](g, { x: CX, y: L.torsoTop + 12 }, 0, 'front');
  legs(g, p, b, L, pose);
  const arms = torso(g, p, b, L, view, pose);
  apron(g, p, b, L, view);
  outer(g, p, b, L, view);
  const H = head(g, p, b, L, view);
  hair(g, p, H, view);
  hat(g, p, H, view);
  if (item && view === 'front' && p.item && ITEMS[p.item]) ITEMS[p.item](g, arms.right, work, 'front');
  g.arms = arms;
  return g;
}

const WALK_FRONT = [
  { bob: 0, liftL: 0, liftR: 0, armL: 0, armR: 0 },
  { bob: -1, liftL: 1, liftR: 0, armL: 0, armR: 1 },
  { bob: 0, liftL: 0, liftR: 0, armL: 0, armR: 0 },
  { bob: -1, liftL: 0, liftR: 1, armL: 1, armR: 0 },
];
const WALK_SIDE = [
  { bob: 0, nearDx: 3, farDx: -3, liftNear: 0, liftFar: 0, armDx: -2 },
  { bob: -1, nearDx: 0, farDx: 1, liftNear: 0, liftFar: 1, armDx: 0 },
  { bob: 0, nearDx: -3, farDx: 3, liftNear: 0, liftFar: 0, armDx: 2 },
  { bob: -1, nearDx: 1, farDx: 0, liftNear: 1, liftFar: 0, armDx: 0 },
];
const IDLE = [
  { bob: 0, liftL: 0, liftR: 0, armL: 0, armR: 0 },
  { bob: 1, liftL: 0, liftR: 0, armL: 0, armR: 0 },
];

/** 生成一个人的全部帧（每帧一个 Grid，已描边）。 */
export function characterFrames(p) {
  p = dress(p);
  const b = bodyOf(p);
  const frames = [];
  frames.push(frontOrBack(p, b, 'front', IDLE[0], 0), frontOrBack(p, b, 'front', IDLE[1], 0));
  frames.push(frontOrBack(p, b, 'front', IDLE[0], 0), frontOrBack(p, b, 'front', { ...IDLE[0], armR: -1 }, 1));
  for (const pose of WALK_FRONT) frames.push(frontOrBack(p, b, 'front', pose, 0));
  for (const pose of WALK_SIDE) { const g = new Grid(FRAME_W, FRAME_H); sideView(g, p, b, pose); frames.push(g); }
  for (const pose of WALK_FRONT) frames.push(frontOrBack(p, b, 'back', pose, 0));
  for (const g of frames) g.outline();
  return frames;
}

/** 捏人预览：站着的一张（front 正面 / side 侧面 / back 背面），描好边画到画布上；scale 倍放大（最近邻）。 */
export function previewCanvas(p, view = 'front', scale = 1, withItem = false) { // withItem：手里拿着家伙（选营生的卡片）
  p = dress({ ...p, item: withItem ? p.item : null });
  const b = bodyOf(p);
  let g;
  if (view === 'side') { g = new Grid(FRAME_W, FRAME_H); sideView(g, p, b, WALK_SIDE[1]); } else g = frontOrBack(p, b, view, IDLE[0], 0);
  g.outline();
  const c = document.createElement('canvas');
  c.width = FRAME_W * scale; c.height = FRAME_H * scale;
  const ctx = c.getContext('2d');
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const col = g.c[y * g.w + x]; if (col) { ctx.fillStyle = col; ctx.fillRect(x * scale, y * scale, scale, scale); } }
  return c;
}

/** 把一个人的 16 帧排成一行图集（每格四周 2 像素透明）。 */
export function characterAtlas(p) {
  const frames = characterFrames(p);
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * frames.length;
  canvas.height = CELL_H;
  const ctx = canvas.getContext('2d');
  frames.forEach((g, f) => {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const c = g.c[y * g.w + x];
      if (c) { ctx.fillStyle = c; ctx.fillRect(f * CELL_W + 2 + x, 2 + y, 1, 1); }
    }
  });
  return canvas;
}

// ---------------------------------------------------------------- 给体素用的静止三视图

/**
 * 不描边、不带手持物的正面 / 背面 / 侧面（站直），加上分部件需要的尺寸。
 * voxel.js 用它们做"视觉外壳雕刻"：正面轮廓 ∩ 侧面轮廓 = 人的体积，表面取对应视角的像素颜色。
 */
export function restViews(p) {
  p = dress(p);
  const b = bodyOf(p);
  const front = frontOrBack(p, b, 'front', IDLE[0], 0, { item: false });
  const back = frontOrBack(p, b, 'back', IDLE[0], 0, { item: false });
  const side = new Grid(FRAME_W, FRAME_H);
  sideView(side, p, b, { bob: 0, nearDx: 0, farDx: 0, liftNear: 0, liftFar: 0, armDx: 0 }, { item: false, nose: false });
  return { front, back, side, b, L: layout(b, 0), hand: front.arms.right, CX, FEET };
}

/**
 * 营生卡片上的家伙图标：16 × 16 的像素画，一行一个字符串，字符对颜色（ICON_INK）；外面一圈黑边自动描。
 * 和手里拿的（ITEMS，几个像素）分开画：卡片上放大了看，要一眼认得出是什么。
 */
const ICON_INK = {
  w: R.wood[3], W: R.wood[4], v: R.wood[2],
  g: R.grey[1], G: R.grey[2], H: R.grey[3], k: R.black[2],
  p: R.paper[2], P: R.paper[3], q: R.paper[1],
  r: R.red[2], R: R.red[3],
  y: R.gold[3], Y: R.gold[4], o: R.gold[2],
  l: R.leaf[3], L: R.leaf[4], e: R.leaf[2],
  b: R.brown[3], B: R.brown[4], n: R.brown[2],
  c: R.water[3], C: R.water[4],
  x: R.black[1], s: R.smoke[3], S: R.smoke[2],
  i: R.indigo[3], I: R.indigo[4],
  h: R.wheat[3], J: R.wheat[4], j: R.wheat[2],
  a: R.loess[3], A: R.loess[4], z: R.loess[2],
  m: R.autumn[2], M: R.autumn[3],
};
const ICON_ART = {
  hoe: [ // 锄头
    '................',
    '...........kGG..',
    '..........wGHHG.',
    '.........wW.GHHG',
    '........wW...GHG',
    '.......wW.....Gk',
    '......wW........',
    '.....wW.........',
    '....wW..........',
    '...wW...........',
    '..wW............',
    '.wW.............',
    '.v..............',
    '................',
  ],
  pickaxe: [ // 镐
    '................',
    '....kGGGGGGk....',
    '..kGHHHHHHHHGk..',
    '.kGG...vw...GGk.',
    'kG.....wW.....Gk',
    'k......wW......k',
    '.......wW.......',
    '.......wW.......',
    '.......wW.......',
    '.......wW.......',
    '.......wW.......',
    '.......wW.......',
    '.......wW.......',
    '.......vw.......',
  ],
  charcoal: [ // 铁锹 + 一堆木炭（还有一点火星）
    '...vwWWv........',
    '...v....v.......',
    '....vwWv........',
    '.....wW.........',
    '.....wW.........',
    '.....wW.........',
    '.....wW.........',
    '...kGGGGk.......',
    '...GHHHHG.......',
    '...GHHHHG.......',
    '...GHHHHG..xx...',
    '...kGHHGk.xxRxx.',
    '....kGGk.xxxxxRx',
    '.....kk.xxRxxxxx',
  ],
  rod: [ // 钓竿 + 钓上来的鱼
    '...............w',
    '..............wv',
    '.............w.P',
    '............w..P',
    '...........w...P',
    '..........w....P',
    '.........w.....P',
    '........w......k',
    '.......w......cC',
    '......w......cCCc',
    '.....w.......cCCc',
    '....n........cCCc',
    '...nn.........cc.',
    '..nn.........c..c',
    '..n.............',
  ],
  can: [ // 浇水的铁皮壶
    '................',
    '.....kGGGk......',
    '....G.....G.....',
    '....G.....G.....',
    '..kGGGGGGGGk...C',
    '..GHHHHHHHGk..kC',
    '..GHHHHHHHGk.kG.',
    '..GHHHHHHHGkkGk.',
    '..GHHHHHHHGGGk..',
    '..GHHHHHHHGk....',
    '..GHHHHHHHGk....',
    '..kGGGGGGGGk....',
  ],
  whip: [ // 放牛的鞭子：鞭杆 + 甩出去的鞭梢
    '................',
    '............bb..',
    '..........bb..b.',
    '.........b.....b',
    '........b......b',
    '.......b.....bb.',
    '......nb...bb...',
    '.....wWnbbb.....',
    '....wW..........',
    '...wW...........',
    '..wW............',
    '.wW.............',
    '.v..............',
  ],
  trowel: [ // 泥抹子 + 一块砖
    '.......G........',
    '......GHG.......',
    '.....GHHHG......',
    '....GHHHHHG.....',
    '...GHHHHHHHG....',
    '..GHHHHHHHHHG...',
    '.kGGGGGGGGGGGk..',
    '.......k........',
    '.......k........',
    '......wWW.......',
    '......wWW.......',
    '......wWW...rrrr',
    '......wWW..rRRRr',
    '......vwv..rRRRr',
    '...........rrrrr',
  ],
  shears: [ // 剪子
    '.H............H.',
    '.GH..........HG.',
    '..GH........HG..',
    '...GH......HG...',
    '....GH....HG....',
    '.....GH..HG.....',
    '......GHHG......',
    '.......kk.......',
    '......rk.kr.....',
    '....rrr...rrr...',
    '...r...r.r...r..',
    '...r...r.r...r..',
    '....rrr...rrr...',
  ],
  bread: [ // 烧饼，冒着热气
    '.....s...s......',
    '....s...s.......',
    '.....s...s......',
    '................',
    '.....jjjjjj.....',
    '...jjhhhhhhjj...',
    '..jhJJPJJJPJhj..',
    '.jhJJJJJPJJJJhj.',
    '.jhJPJJJJJJPJhj.',
    '.jhJJJJPJJJJJhj.',
    '..jhJJJJJJPJhj..',
    '...jjhhhhhhjj...',
    '.....jjjjjj.....',
  ],
  cleaver: [ // 杀猪刀
    '................',
    '.kGGGGGGGGk.....',
    '.GHHHHHHHHG.....',
    '.GHHHHHHkHG.....',
    '.GHHHHHHHHGkwwww',
    '.GHHHHHHHHGkWWWW',
    '.GHHHHHHHHGkvvvv',
    '.GHHHHHHHHG.....',
    '.GHHHHHHHHG.....',
    '.kGGGGGGGGk.....',
  ],
  teapot: [ // 大茶壶
    '.......nn.......',
    '......nBBn......',
    '....nnnnnnnn....',
    'nn.nBBbbbbbbn.nn',
    '.nnBbbbbbbbbbnBn',
    '..nBbbbbbbbbbn.n',
    '..nbbbbbbbbbbn.n',
    '...nbbbbbbbbbnn.',
    '...nbbbbbbbbbn..',
    '....nnbbbbbnn...',
    '.....nnnnnnn....',
  ],
  mushrooms: [ // 背篓里的蘑菇、核桃、野菜
    '..........l.....',
    '...mm....lLl....',
    '..mMMm..mmLl....',
    '..mMPMmmMMMml...',
    '...pp..mMPMm.l..',
    '...pp...pp..lLl.',
    '.jjjjjjjjjjjjjj.',
    '.jhJhJhJhJhJhJj.',
    '..jhhjhhjhhjhj..',
    '..jJhJhJhJhJhj..',
    '..jhhjhhjhhjhj..',
    '...jJhJhJhJhj...',
    '...jjjjjjjjjj...',
  ],
  trap: [ // 夹子（套野物的）
    '....HGHGHGHG....',
    '...Gk.k.k.k.kG..',
    '..G..........G..',
    '.G............G.',
    '.G....oooo....G.',
    '.GkkkkoyyokkkkG.',
    '.G....oooo....G.',
    '.G............G.',
    '..G..........G..',
    '...Gk.k.k.k.kG..',
    '....HGHGHGHG....',
    '.........kk.....',
    '..........kk.k..',
    '...........kkk..',
  ],
  smoker: [ // 熏烟罐 + 一只蜜蜂
    '..ss.......Y.Y..',
    '.sSSs.....yxyx..',
    '..sSSs.....yy...',
    '....sG..........',
    '...kGHk.........',
    '..kGHHHk........',
    '..GHHHHG.bbbb...',
    '..GHHHHGbBBBBb..',
    '..GHHHHGbBBBBb..',
    '..GHHHHG.bbbb...',
    '..GHHHHG..b.....',
    '..GHHHHG........',
    '..kGGGGk........',
  ],
  bowl: [ // 一碗热粥，青花碗
    '.....s..s.......',
    '....s..s..s.....',
    '.....s..s.......',
    '..........w.....',
    '...........w....',
    '.iIIIIIIIIIIwIi.',
    '.iPPPPPPPPPPPPi.',
    '..PPiPPPiPPPiP..',
    '...PPPPPPPPPP...',
    '....PPPPPPPP....',
    '.....iiiiii.....',
  ],
  buckets: [ // 扁担挑两桶水
    '.......v........',
    'wwwwwwwWwwwwwwww',
    '.k............k.',
    '.k............k.',
    '.k............k.',
    'nnnn........nnnn',
    'nCCn........nCCn',
    'wWWw........wWWw',
    'nnnn........nnnn',
    'wWWw........wWWw',
    'wWWw........wWWw',
    '.nn..........nn.',
  ],
  seedling: [ // 一穗良种 + 一盆秧苗
    '.......J........',
    '......JhJ.......',
    '......hJh.......',
    '.....JhJhJ......',
    '.....hJhJh......',
    '......JhJ.......',
    '......hJh.......',
    '...l...h...l....',
    '..lLl..h..lLl...',
    '...lLl.h.lLl....',
    '....lllhlll.....',
    '...zzzzzzzzz....',
    '...zaaaaaaaz....',
    '....zaAaaaz.....',
    '....zzzzzzz.....',
  ],
  book: [ // 线装的账本 + 一支毛笔
    '..iiiiiiiiik...k',
    '..iIIIIIIIIk..w.',
    '..ix.IpppI.k.w..',
    '..iIIIpqpIIkw...',
    '..ix.IpqpI.w....',
    '..iIIIpqpIwk....',
    '..ix.IpppwIk....',
    '..iIIIIIIx.k....',
    '..ix.IIIIIIk....',
    '..iIIIIIIIIk....',
    '..iiiiiiiiik....',
    '...PPPPPPPPPk...',
  ],
};

/** 只在营生卡片上用的几样图标（手里不拿的东西）：16 × 16。 */
const ICONS = {
  flourSack(g) { // 面袋：鼓鼓的白布袋，口上扎着麻绳，袋上印一道红记号
    g.rect(3, 6, 10, 9, R.paper[2]); g.rect(4, 5, 8, 1, R.paper[2]); g.rect(4, 15, 8, 1, R.paper[1]);
    g.rect(5, 2, 6, 3, R.paper[2]); g.hline(5, 10, 4, R.brown[3]); g.px(11, 3, R.brown[3]); g.px(12, 2, R.brown[3]); // 扎口的麻绳
    g.vline(3, 7, 13, R.paper[3]); g.rect(10, 7, 3, 8, R.paper[1]); // 左亮右暗
    g.rect(6, 9, 4, 3, R.red[2]); g.hline(6, 9, 9, R.red[3]); // 记号
  },
  pot(g) { // 刨出来的老陶罐：缺了一个口，罐身一道黑花纹
    g.rect(4, 5, 8, 9, R.loess[3]); g.rect(3, 7, 10, 5, R.loess[3]); g.rect(5, 14, 6, 1, R.loess[2]); g.rect(5, 3, 6, 2, R.loess[3]); g.hline(4, 11, 3, R.loess[4]);
    g.vline(4, 6, 12, R.loess[4]); g.rect(10, 6, 2, 8, R.loess[2]);
    g.hline(3, 12, 9, R.brown[1]); g.px(5, 10, R.brown[1]); g.px(8, 10, R.brown[1]); g.px(11, 10, R.brown[1]); // 花纹
    for (const [x, y] of [[9, 3], [10, 3], [9, 4], [10, 4], [9, 5]]) g.c[y * g.w + x] = null; // 缺口
  },
};
const ICON_PERSON = { body: 'man', hair: 'short', top: 'indigo', pants: 'black', skin: 'skin' };

/** 一样家伙的图标（营生卡片）：画出来、描黑边、裁到有颜色的那一块，按整数倍放大到大约 px 像素见方。 */
export function itemCanvas(name, px = 48) {
  let g;
  if (ICON_ART[name]) { g = new Grid(22, 22); ICON_ART[name].forEach((row, y) => [...row].forEach((ch, x) => g.px(x + 2, y + 2, ICON_INK[ch]))); } // 四周留出描边的地方
  else if (ICONS[name]) { g = new Grid(18, 18); ICONS[name](g); } // 图标画在 2…15 之间
  else g = itemGrid(ICON_PERSON, 0, name);
  if (!g) return null;
  g.outline();
  let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.c[y * g.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, k = Math.max(1, Math.floor(px / Math.max(w, h)));
  const c = document.createElement('canvas');
  c.width = w * k; c.height = h * k;
  const ctx = c.getContext('2d');
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const col = g.c[y * g.w + x]; if (col) { ctx.fillStyle = col; ctx.fillRect((x - x0) * k, (y - y0) * k, k, k); } }
  return c;
}

/** 只画手持物（干活帧 work = 0 / 1），手在静止姿势的右手位置。 */
export function itemGrid(p, work = 0, name = p.item) {
  const g = new Grid(FRAME_W, FRAME_H);
  if (!name || !ITEMS[name]) return null;
  const { hand } = restViews(p);
  ITEMS[name](g, hand, work, 'front');
  return g;
}
