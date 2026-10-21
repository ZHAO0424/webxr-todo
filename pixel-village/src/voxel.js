import * as THREE from 'three';
import { TPU, makeRng, block, prism } from './pixel.js';
import { R } from './palette.js';
import { restViews, itemGrid } from './characters.js';
import { animalGrids } from './animals.js';

/*
 * 体素：把像素画变成立体的。
 *
 * - 人物：拿正面、侧面、背面三张像素图做视觉外壳雕刻——某个体素存在，当且仅当它在正面图和侧面图
 *   里都落在轮廓内；它朝前的面取正面图的颜色，朝后取背面图，朝两侧取侧面图。
 *   身体拆成躯干+头、两条腿、两条胳膊、手持物，腿和胳膊绕胯 / 肩转，就能走路、干活。
 * - 动物：只有侧视图，按"离轮廓边多远"决定厚度（充气），腿自然是薄的。
 * - 树：直接用隐函数（几个椭球叠起来 + 噪声）生成。
 *
 * 一个体素 = 1 个贴图像素那么大（1/18 米），树用粗一点的体素省面数。
 * 颜色写在顶点上，材质是 M.voxel（三档卡通光照），所以人和场景受同一套光、能投真实影子。
 */

export const VOX = 1 / TPU;

// 六个面：法线 + 四个角（从外面看逆时针）
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
export const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };

const colorCache = new Map();
function rgb(hex) {
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex)); // 自动转到线性空间
  return colorCache.get(hex);
}

/**
 * 通用体素网格：在整数包围盒 [min, max) 里，solid(x,y,z) 为真的格子是实心；
 * 只为"朝向空格"的面生成四边形，颜色 = color(x,y,z,face)。size 是体素边长，origin 是 (0,0,0) 格的角落位置。
 */
export function voxelGeometry(min, max, solid, color, size = VOX, origin = [0, 0, 0]) {
  const pos = [], nor = [], col = [], idx = [];
  for (let z = min[2]; z < max[2]; z++) for (let y = min[1]; y < max[1]; y++) for (let x = min[0]; x < max[0]; x++) {
    if (!solid(x, y, z)) continue;
    for (let f = 0; f < 6; f++) {
      const [nx, ny, nz] = FACES[f].n;
      if (solid(x + nx, y + ny, z + nz)) continue;
      const hex = color(x, y, z, f);
      if (!hex) continue;
      const c = rgb(hex);
      const base = pos.length / 3;
      for (const [cx, cy, cz] of FACES[f].c) {
        pos.push(origin[0] + (x + cx) * size, origin[1] + (y + cy) * size, origin[2] + (z + cz) * size);
        nor.push(nx, ny, nz);
        col.push(c.r, c.g, c.b);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

function shadowMesh(geo, M) {
  const m = new THREE.Mesh(geo, M.voxel);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- 人物

/*
 * 干活的动作按手里的家伙分：胳膊绕肩转（rotation.x 往前抬为负，rotation.z 往外摆）。
 * 每个函数返回 true 表示处理过了。
 */
const saw = (t) => Math.sin(t * 4);
const WORK_MOTION = {
  hammer(t, L, Rt) { // 慢慢举起，猛地砸下
    const k = (t * 1.2) % 1;
    const up = k < 0.75 ? k / 0.75 : 1 - (k - 0.75) / 0.25;
    Rt.rotation.x = -0.4 - up * 2.0;
    L.rotation.x = -0.5;
    return true;
  },
  saw(t, L, Rt) { Rt.rotation.x = -1.25 + saw(t) * 0.3; L.rotation.x = -1.0 - saw(t) * 0.2; return true; }, // 两手在身前来回拉
  hoe(t, L, Rt) { // 双手举过头，锄到地上
    const k = (t * 0.9) % 1;
    const a = k < 0.6 ? -2.5 * (k / 0.6) : -2.5 + 2.2 * ((k - 0.6) / 0.4);
    Rt.rotation.x = L.rotation.x = Math.min(-0.3, a);
    return true;
  },
  ladle(t, L, Rt) { Rt.rotation.x = -1.0 + Math.sin(t * 3) * 0.15; Rt.rotation.z = Math.cos(t * 3) * 0.35; L.rotation.x = -0.4; return true; }, // 搅
  broom(t, L, Rt) { Rt.rotation.x = -0.6; Rt.rotation.z = Math.sin(t * 3) * 0.4; L.rotation.x = -0.5; L.rotation.z = Math.sin(t * 3) * 0.3; return true; }, // 左右扫
  book(t, L, Rt) { Rt.rotation.x = L.rotation.x = -1.1 - Math.max(0, Math.sin(t * 0.7)) * 0.1; return true; }, // 捧着念
  basket(t, L, Rt) { Rt.rotation.x = -0.8; L.rotation.x = -0.3 - Math.max(0, Math.sin(t * 2.5)) * 0.8; return true; }, // 端着，另一只手往外拿
  bowl(t, L, Rt) { Rt.rotation.x = -0.9; L.rotation.x = -0.8; return true; },
  tray(t, L, Rt) { Rt.rotation.x = L.rotation.x = -1.0; return true; },
  box(t, L, Rt) { Rt.rotation.x = -0.7; L.rotation.x = -0.9 + Math.sin(t * 2) * 0.3; return true; },
  bucket(t, L, Rt) { const k = Math.max(0, Math.sin(t * 1.5)); Rt.rotation.x = -0.6 - k * 0.8; L.rotation.x = -0.5; return true; }, // 往槽里倒
  whip(t, L, Rt) { Rt.rotation.x = -1.6 + Math.sin(t * 5) * 0.6; return true; },
  none(t, L, Rt) { const k = Math.sin(t * 3) * 0.4; Rt.rotation.x = L.rotation.x = -0.9 + k; return true; }, // 空手：拉风箱、推磨
  pole(t, L, Rt) { Rt.rotation.x = L.rotation.x = -2.8; return true; }, // 两手扶着肩上的扁担
  buckets(t, L, Rt) { Rt.rotation.x = L.rotation.x = -2.8; return true; },
  pipe(t, L, Rt) { Rt.rotation.x = Math.sin(t * 0.8) > 0.5 ? -1.9 : -1.2; return true; }, // 嘬一口旱烟
  cane(t, L, Rt) { Rt.rotation.x = -0.3; return true; },
  axe(t, L, Rt) { return WORK_MOTION.hammer(t * 0.9, L, Rt); }, // 劈柴：举起来、劈下去
  razor(t, L, Rt) { Rt.rotation.x = -1.7 + Math.sin(t * 5) * 0.25; L.rotation.x = -1.3; return true; }, // 剃头：贴着头皮一下一下推
  earpick(t, L, Rt) { Rt.rotation.x = -1.95 + Math.sin(t * 9) * 0.05; L.rotation.x = -1.5; return true; }, // 掏耳朵：手举到耳边轻轻转
  lantern(t, L, Rt) { Rt.rotation.x = -1.5 + Math.sin(t * 2) * 0.1; return true; }, // 举灯照一照
  kite(t, L, Rt) { Rt.rotation.x = -1.3 + Math.sin(t * 2) * 0.3; return true; }, // 拽风筝线
};

/**
 * 体素小人。返回 { object, pose(state, t) }：
 * state = 'idle' | 'walk' | 'run' | 'work'。朝向由调用方设 object.rotation.y（正面 = +z）。
 */
export function voxelCharacter(p, M) {
  const { front: F, back: K, side: S, b, L, CX, FEET, hand } = restViews(p);
  const at = (g, x, y) => g.get(x, y);
  // 图片坐标 (ix, iy) → 体素 (x = ix - CX, y = FEET - iy, z = 侧面列 - CX)
  const tx0 = CX - Math.floor(b.torsoW / 2), tx1 = tx0 + b.torsoW - 1;
  const gown = p.style === 'gown';
  const legStart = gown ? L.shoeTop : L.legTop + 2;
  const armTop = L.torsoTop + 1, armBottom = L.torsoTop + b.torsoH + 1;
  const isArm = (ix, iy) => iy >= armTop && iy <= armBottom && (ix < tx0 || ix > tx1) && ix >= tx0 - 2 && ix <= tx1 + 2;
  const part = (ix, iy) => {
    if (!at(F, ix, iy)) return null;
    if (iy < L.torsoTop - b.neck) return 'body'; // 头（含帽子、头发）
    if (isArm(ix, iy)) return ix < CX ? 'armL' : 'armR';
    if (iy >= legStart) return ix < CX ? 'legL' : 'legR';
    return 'body';
  };
  const solidFor = (name) => (x, y, z) => {
    const ix = x + CX, iy = FEET - y;
    if (part(ix, iy) !== name) return false;
    if (name.startsWith('arm')) return z === -1 || z === 0; // 胳膊 2 像素厚
    return !!at(S, z + CX, iy);
  };
  const colorFor = (x, y, z, f) => {
    const ix = x + CX, iy = FEET - y;
    if (f === FACE.nz) return at(K, ix, iy) ?? at(F, ix, iy);
    if ((f === FACE.px || f === FACE.nx) && !isArm(ix, iy)) return at(S, z + CX, iy) ?? at(F, ix, iy);
    return at(F, ix, iy);
  };
  const box = [[-CX, 0, -CX], [CX, FEET + 1, CX]];
  const build = (name, pivotY = 0) => {
    const geo = voxelGeometry(box[0], box[1], solidFor(name), colorFor, VOX, [0, -pivotY * VOX, 0]);
    const g = new THREE.Group();
    g.position.y = pivotY * VOX;
    g.add(shadowMesh(geo, M));
    return g;
  };

  const root = new THREE.Group();
  const rig = new THREE.Group(); // 坐、蹲时整体下沉
  root.add(rig);
  const body = build('body');
  const hipY = FEET - legStart + 1;
  const shoulderY = FEET - armTop + 1;
  const legL = build('legL', hipY), legR = build('legR', hipY);
  const armL = build('armL', shoulderY), armR = build('armR', shoulderY);
  // 胳膊往外挪一点点：贴着身子的那一面和身子侧面不在同一平面上，不然算影子时深度相同会闪
  armL.position.x = -0.12 * VOX; armR.position.x = 0.12 * VOX;
  body.add(armL, armR);
  rig.add(body, legL, legR);

  // 手持物：同样的像素画挤出 2 层，挂在右胳膊上跟着摆（扁担、水桶挑在肩上）。按活动随时换。
  const items = new Map();
  let current = null;
  const ON_SHOULDER = new Set(['pole', 'buckets', 'firewood']);
  // 手的位置（体素坐标）：手持物以手为原点，转 90° 让工具朝前伸出去（像素图里工具是往右画的）
  const hx = hand.x - CX + 1, hy = FEET - hand.y;
  const makeItem = (name) => {
    if (name === 'umbrella') { // 油纸伞做成立体的（像素片从上面看只是一根线）：竹柄 + 八角伞面，举手时保持竖直
      const holder = new THREE.Group();
      holder.position.set(hx * VOX, (hy - shoulderY) * VOX, 0);
      holder.rotation.x = 0.9;
      holder.add(block(-0.03, 0, -0.03, 0.03, 0.95, 0.03, M.wood, { outline: false }));
      const top = prism(0.05, 0.5, 0.2, M.gold, 8);
      top.position.set(-hx * VOX * 0.9, 0.95, 0); // 伞面罩在头顶正上方
      holder.add(block(-hx * VOX * 0.9, 0.9, -0.025, 0, 0.95, 0.025, M.wood, { outline: false }));
      holder.add(top);
      armR.add(holder);
      return holder;
    }
    const grid = itemGrid(p, 0, name);
    if (!grid) return null;
    const solid = (x, y, z) => (z === -1 || z === 0) && !!grid.get(x + CX, FEET - y);
    const color = (x, y) => grid.get(x + CX, FEET - y);
    if (ON_SHOULDER.has(name)) {
      const m = shadowMesh(voxelGeometry(box[0], box[1], solid, color, VOX), M);
      body.add(m);
      return m;
    }
    const m = shadowMesh(voxelGeometry(box[0], box[1], solid, color, VOX, [-hx * VOX, -hy * VOX, 0]), M);
    const holder = new THREE.Group();
    holder.position.set(hx * VOX, (hy - shoulderY) * VOX, 0);
    holder.rotation.y = -Math.PI / 2;
    holder.add(m);
    armR.add(holder);
    return holder;
  };
  const setItem = (name) => {
    if (name === current) return;
    if (current && items.get(current)) items.get(current).visible = false;
    current = name;
    if (!name) return;
    if (!items.has(name)) items.set(name, makeItem(name));
    if (items.get(name)) items.get(name).visible = true;
  };
  setItem(p.item ?? null);
  const legLen = hipY * VOX;

  const swing = p.body === 'child' ? 0.7 : 0.5;
  const rest = () => { legL.rotation.x = legR.rotation.x = armL.rotation.x = armR.rotation.x = 0; armR.rotation.z = armL.rotation.z = body.rotation.z = 0; rig.position.y = 0; body.position.y = 0; };
  return {
    object: root,
    setItem,
    get item() { return current; },
    /** state：idle / walk / run / work / sit（坐凳子，seat = 凳面高）/ squat（蹲着端碗吃饭）/ talk / eat / scatter（撒食） */
    pose(state, t, phase = 0, { seat = 0.45, cadence = 1 } = {}) {
      const w = (state === 'run' ? 13 : 8 * cadence) * t + phase;
      rest();
      if (state === 'sit' || state === 'squat' || state === 'fiddle') {
        legL.rotation.x = legR.rotation.x = -1.45;
        rig.position.y = state === 'squat' ? -legLen * 0.55 : seat - legLen + 0.05;
        if (state === 'fiddle') { // 拉板胡：右手扶琴，左手来回拉弓，身子跟着晃
          armR.rotation.x = -0.7;
          armL.rotation.x = -1.0;
          armL.rotation.z = -0.25 - Math.sin(t * 5 + phase) * 0.4;
          body.rotation.z = Math.round(Math.sin(t * 1.2 + phase) * 2) * 0.03;
          return;
        }
        if (state === 'squat') { armR.rotation.x = -0.9 - (Math.sin(t * 2.2 + phase) > 0.6 ? 0.6 : 0); armL.rotation.x = -0.7; }
        else armR.rotation.x = Math.sin(t * 0.8 + phase) > 0.7 ? -0.5 : -0.2;
        return;
      }
      if (state === 'sing') { // 唱戏：甩扇子、亮相，身子左右晃
        const k = Math.sin(t * 1.6 + phase);
        armR.rotation.x = -1.4 + k * 0.5;
        armR.rotation.z = 0.3 + Math.max(0, k) * 0.4;
        armL.rotation.x = -0.5 - Math.max(0, -k) * 1.0;
        armL.rotation.z = -0.3;
        body.rotation.z = Math.round(k * 2) * 0.04;
        body.position.y = Math.floor(t * 2 + phase) % 2 ? 0 : -VOX * 0.5;
        return;
      }
      if (state === 'wash') { // 蹲在溪边搓衣裳：两手在水里一前一后地搓
        legL.rotation.x = legR.rotation.x = -1.45;
        rig.position.y = -legLen * 0.55;
        armL.rotation.x = -1.0 + Math.sin(t * 5 + phase) * 0.3;
        armR.rotation.x = -1.0 - Math.sin(t * 5 + phase) * 0.3;
        return;
      }
      if (state === 'shave') { // 刮脸：一手托着客人下巴，一手慢慢刮
        armL.rotation.x = -1.4;
        armR.rotation.x = -1.5 + Math.sin(t * 2.5 + phase) * 0.3;
        armR.rotation.z = 0.15;
        return;
      }
      if (state === 'strop') { // 荡刀子：剃刀在挑子的皮条上来回蹭
        armL.rotation.x = -0.8;
        armR.rotation.x = -0.9;
        armR.rotation.z = Math.sin(t * 4 + phase) * 0.5;
        return;
      }
      if (state === 'bow') { // 磕头上香：跪着，双手合十举过头，一下一下点头
        legL.rotation.x = legR.rotation.x = -1.45;
        rig.position.y = -legLen * 0.55;
        armL.rotation.x = armR.rotation.x = -2.3;
        armL.rotation.z = -0.15; armR.rotation.z = 0.15;
        body.position.y = Math.floor(t * 1.5 + phase) % 2 ? -VOX * 2 : 0;
        return;
      }
      if (state === 'speech') { // 台上讲话：时不时抬手比划
        const k = Math.sin(t * 1.3 + phase);
        armR.rotation.x = k > 0.4 ? -2.2 : -0.5 - Math.max(0, Math.sin(t * 4 + phase)) * 0.4;
        armL.rotation.x = -0.3;
        body.position.y = Math.floor(t * 3 + phase) % 2 ? 0 : -VOX * 0.5;
        return;
      }
      if (state === 'cheer') { // 叫好：两手举起来拍
        armR.rotation.x = armL.rotation.x = -2.4 + (Math.floor(t * 6 + phase) % 2) * 0.3;
        armR.rotation.z = 0.2; armL.rotation.z = -0.2;
        return;
      }
      if (state === 'talk') {
        armR.rotation.x = -0.4 - Math.max(0, Math.sin(t * 4 + phase)) * 0.5;
        body.position.y = Math.floor(t * 3 + phase) % 2 ? 0 : -VOX * 0.5;
        return;
      }
      if (state === 'eat') {
        armL.rotation.x = -0.8;
        armR.rotation.x = Math.sin(t * 2.5 + phase) > 0.3 ? -1.7 : -0.8;
        return;
      }
      if (state === 'scatter') {
        armL.rotation.x = -0.6;
        const k = (Math.sin(t * 3 + phase) + 1) / 2;
        armR.rotation.x = -0.5 - k * 0.8;
        armR.rotation.z = k * 0.5;
        return;
      }
      if (state === 'walk' || state === 'run') {
        const s = Math.sin(w) * (state === 'run' ? swing * 1.3 : swing);
        legL.rotation.x = s; legR.rotation.x = -s;
        armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8;
        if (current === 'umbrella') armR.rotation.x = -0.9; // 打伞的那只手举着不摆
        body.position.y = Math.abs(Math.cos(w)) > 0.7 ? VOX : 0; // 每步起伏一个像素
      } else if (state === 'work') {
        WORK_MOTION[current ?? 'none']?.(t + phase, armL, armR, body) ?? WORK_MOTION.hammer(t + phase, armL, armR, body);
      } else {
        body.position.y = Math.floor(t * 1.2 + phase) % 2 ? 0 : -VOX * 0.5; // 呼吸
        if (current === 'umbrella') armR.rotation.x = -0.9;
      }
    },
  };
}

// ---------------------------------------------------------------- 动物

const PLUMP = { dog: 3, dogBlack: 3, cat: 2, hen: 2, henBrown: 2, rooster: 2, duck: 2, goose: 3, pig: 4, sheep: 4, donkey: 4, ox: 6, magpie: 2, pigeon: 1 };
// 人是 Q 版大头，动物也按同样的夸张程度放大，不然站在人旁边像玩具
const ANIMAL_SCALE = { dog: 1.6, dogBlack: 1.6, cat: 1.6, hen: 1.7, henBrown: 1.7, rooster: 1.7, duck: 1.7, goose: 1.5, pig: 1.4, sheep: 1.4, donkey: 1.2, ox: 1.35, magpie: 1.7, pigeon: 1.6 };

/*
 * 猪和牛照"我的世界"的样子用方块拼：身子一块、头一块、鼻子一块、四条方腿，配色沿用原来的黄牛 / 黑猪。
 * 盒子 [x0, y0, z0, x1, y1, z1, 颜色]（体素，头朝 +x，y 向上，z 居中）；颜色可以是函数 (x, y, z) → 色，用来画眼睛、斑纹。
 * 走路两帧：对角的两条腿一前一后。表面按体素位置撒一点深浅（像我的世界的贴图颗粒）。
 */
const grain = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };
const legs = (xs, zs, h, w, col, hoof, step) => xs.flatMap((x, i) => zs.map((z, j) => {
  const d = step * ((i + j) % 2 ? 1 : -1); // 对角两条腿同向
  return [x + d, 0, z, x + d + w, h, z + w, (xx, yy) => (yy === 0 ? hoof : col)];
}));

const BOXY = {
  ox: (step) => {
    const y = R.mud[3], Y = R.mud[2], l = R.mud[4], h = R.white[2], k = R.slate[0], n = R.pink[2];
    return [
      ...legs([-11, 6], [-5, 2], 9, 3, Y, k, step),
      [-12, 8, -6, 11, 19, 6, (x, yy) => (yy === 8 ? l : y)], // 身子（肚皮浅）
      [3, 19, -4, 10, 21, 4, Y], // 肩上的隆起
      [-13, 11, -1, -12, 18, 1, Y], [-13, 8, -1, -12, 11, 1, k], // 尾巴 + 尾梢
      [11, 11, -4, 17, 20, 4, (x, yy, z) => (x === 16 && yy === 17 && Math.abs(z + 0.5) > 1.5 ? k : y)], // 头 + 眼睛
      [17, 11, -3, 19, 15, 3, (x, yy, z) => (x === 18 && yy === 13 && Math.abs(z + 0.5) === 1.5 ? k : n)], // 鼻子 + 鼻孔
      [12, 20, -7, 14, 22, -4, h], [12, 20, 4, 14, 22, 7, h], [12, 22, -7, 14, 24, -6, h], [12, 22, 6, 14, 24, 7, h], // 弯角
      [12, 17, -6, 14, 19, -4, Y], [12, 17, 4, 14, 19, 6, Y], // 耳朵
    ];
  },
  pig: (step) => {
    const p = R.slate[2], P = R.slate[3], s = R.pink[3], k = R.slate[0];
    return [
      ...legs([-7, 3], [-4, 1], 4, 3, p, k, step),
      [-8, 4, -5, 8, 12, 5, (x, yy) => (yy === 11 ? P : p)], // 身子（背上一道亮）
      [8, 5, -4, 14, 12, 4, (x, yy, z) => (x === 13 && yy === 10 && Math.abs(z + 0.5) === 2.5 ? k : p)], // 头 + 眼睛
      [14, 6, -2, 16, 9, 2, (x, yy, z) => (x === 15 && yy === 7 && Math.abs(z + 0.5) === 0.5 ? k : s)], // 猪鼻子 + 鼻孔
      [9, 12, -4, 11, 13, -2, P], [9, 12, 2, 11, 13, 4, P], // 耳朵
      [-9, 9, 0, -8, 11, 1, s], // 小尾巴
    ];
  },
};
const BOXY_SCALE = { ox: 1.15, pig: 1.0 };

function boxyFrames(kind, M) {
  return [0, 1].map((step) => {
    const boxes = BOXY[kind](step);
    const lo = [0, 1, 2].map((a) => Math.min(...boxes.map((b) => b[a])));
    const hi = [3, 4, 5].map((a) => Math.max(...boxes.map((b) => b[a])));
    const at = (x, y, z) => boxes.findLast?.((b) => x >= b[0] && x < b[3] && y >= b[1] && y < b[4] && z >= b[2] && z < b[5]);
    const geo = voxelGeometry(lo, hi, (x, y, z) => !!at(x, y, z), (x, y, z) => {
      const b = at(x, y, z), c = typeof b[6] === 'function' ? b[6](x, y, z) : b[6];
      const g = grain(x, y, z);
      if (c === R.mud[3]) return g < 0.05 ? R.mud[2] : g > 0.96 ? R.mud[4] : c; // 牛毛的深浅颗粒
      if (c === R.slate[2]) return g < 0.08 ? R.slate[1] : c;
      return c;
    });
    const m = shadowMesh(geo, M);
    m.scale.setScalar(BOXY_SCALE[kind]);
    return m;
  });
}

/** 侧视图按到轮廓边的距离充气成体素。返回每帧一个 Mesh（侧视图面朝 +x）。猪和牛例外，用方块拼（见 BOXY）。 */
export function voxelAnimalFrames(kind, M) {
  if (BOXY[kind]) return boxyFrames(kind, M);
  return animalGrids(kind).map((g) => {
    const dist = Array.from({ length: g.h }, () => new Array(g.w).fill(0));
    const queue = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!g.c[y][x]) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !g.c[y + dy]?.[x + dx]);
      if (edge) { dist[y][x] = 1; queue.push([x, y]); }
    }
    while (queue.length) { // 4 邻域距离变换
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (g.c[ny]?.[nx] && !dist[ny][nx]) { dist[ny][nx] = dist[y][x] + 1; queue.push([nx, ny]); }
      }
    }
    const max = PLUMP[kind] ?? 2;
    const half = (x, y) => Math.min(max, Math.round(dist[y][x] * 0.9)); // 边缘也有 3 层厚，中间鼓起来
    const cx = Math.floor(g.w / 2);
    const solid = (x, y, z) => {
      const ix = x + cx, iy = g.h - 1 - y;
      if (!g.c[iy]?.[ix]) return false;
      return Math.abs(z) <= half(ix, iy);
    };
    const geo = voxelGeometry([-cx - 1, 0, -max - 1], [g.w - cx + 1, g.h, max + 2], solid, (x, y) => g.c[g.h - 1 - y][x + cx]);
    const m = shadowMesh(geo, M);
    m.scale.setScalar(ANIMAL_SCALE[kind] ?? 1.4);
    return m;
  });
}

// ---------------------------------------------------------------- 树（隐函数）

const TREE_VOX = 2.5 / TPU;

function shadeRamp(ramp, l) { return l > 0.55 ? ramp[4] : l > 0.15 ? ramp[3] : l > -0.3 ? ramp[2] : ramp[1]; }
const LIGHT = new THREE.Vector3(-0.65, 0.65, 0.4).normalize();

/**
 * 一棵树：树干（体素柱 + 几根斜枝）+ 树冠（若干椭球 + 噪声起伏），按法线朝夕阳的程度分四档颜色。
 * 单位：体素（TREE_VOX 米）。返回 BufferGeometry（原点在树根）。
 */
const TREE_SPECS = {
  locust: (r) => ({ trunk: [2, 30], branches: 4, ramp: R.leaf, blobs: Array.from({ length: 7 }, () => [(r() - 0.5) * 40, 34 + r() * 14, (r() - 0.5) * 34, 14 + r() * 7, 9 + r() * 4, 14 + r() * 7]) }),
  poplar: () => ({ trunk: [1, 16], branches: 0, ramp: R.leaf, blobs: [[0, 30, 0, 6, 26, 6], [0, 20, 0, 5, 10, 5]] }),
  cypress: () => ({ trunk: [1, 6], branches: 0, ramp: R.green, blobs: [[0, 16, 0, 5, 14, 5], [0, 26, 0, 3, 8, 3]] }),
  jujube: (r) => ({ trunk: [1, 13], branches: 2, ramp: R.grass, fruit: R.red[2], blobs: Array.from({ length: 4 }, () => [(r() - 0.5) * 14, 17 + r() * 5, (r() - 0.5) * 12, 7 + r() * 3, 5 + r() * 2, 7 + r() * 3]) }),
  persimmon: (r) => ({ trunk: [1, 13], branches: 3, ramp: R.autumn, fruit: R.red[3], fruitRate: 0.08, sparse: 0.35, blobs: Array.from({ length: 5 }, () => [(r() - 0.5) * 18, 18 + r() * 6, (r() - 0.5) * 14, 8 + r() * 3, 6 + r() * 2, 8 + r() * 3]) }),
  willow: (r) => ({ trunk: [2, 14], branches: 2, ramp: R.leaf, willow: true, blobs: Array.from({ length: 3 }, () => [(r() - 0.5) * 16, 20 + r() * 3, (r() - 0.5) * 12, 10, 4, 10]) }),
  bush: (r) => ({ trunk: [1, 5], branches: 0, ramp: R.leaf, fruit: R.red[3], fruitRate: 0.05, blobs: Array.from({ length: 3 }, () => [(r() - 0.5) * 5, 8 + r() * 2, (r() - 0.5) * 5, 4, 3.5, 4]) }),
};

export function voxelTree(kind, seed = 1, scale = 1) {
  const r = makeRng(seed);
  const s = TREE_SPECS[kind](r);
  const blobs = s.blobs.map(([x, y, z, rx, ry, rz]) => [x * scale, y * scale, z * scale, rx * scale, ry * scale, rz * scale]);
  const [tw, th] = [s.trunk[0], s.trunk[1] * scale];
  const branches = Array.from({ length: s.branches }, (_, i) => {
    const a = (i / Math.max(1, s.branches)) * Math.PI * 2 + r();
    return { a, y0: th * (0.55 + r() * 0.3), len: 6 + r() * 6 };
  });
  const noise = (x, y, z) => Math.sin(x * 0.9 + y * 0.3) * Math.sin(y * 0.7 + z * 1.1) * Math.sin(z * 0.8 + x * 0.5);
  const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  const crown = (x, y, z) => {
    let best = null;
    for (const b of blobs) {
      const d = Math.hypot((x - b[0]) / b[3], (y - b[1]) / b[4], (z - b[2]) / b[5]);
      if (d < 1 + noise(x, y, z) * 0.18 && (!best || d < best.d)) best = { b, d };
    }
    if (best && s.sparse && hash(x, y, z) < s.sparse && best.d > 0.75) return null; // 柿子树叶子稀
    return best;
  };
  const trunk = (x, y, z) => {
    if (y < th && Math.abs(x) <= tw - 1 && Math.abs(z) <= tw - 1) return true;
    for (const br of branches) {
      if (y < br.y0 || y > br.y0 + br.len) continue;
      const t = y - br.y0;
      if (Math.round(Math.cos(br.a) * t * 0.8) === x && Math.round(Math.sin(br.a) * t * 0.8) === z) return true;
    }
    return false;
  };
  const strand = (x, y, z) => s.willow && (x + z * 3) % 3 === 0 && hash(x, 0, z) > 0.3 && y > 6 + hash(z, 1, x) * 8 && y < 20 && blobs.some((b) => Math.hypot((x - b[0]) / b[3], (z - b[2]) / b[5]) > 0.75 && Math.hypot((x - b[0]) / b[3], (z - b[2]) / b[5]) < 1.05);
  const solid = (x, y, z) => trunk(x, y, z) || !!crown(x, y, z) || strand(x, y, z);
  const color = (x, y, z) => {
    if (trunk(x, y, z) && !crown(x, y, z)) return (x + y) % 5 === 0 ? R.wood[2] : R.wood[1];
    const c = crown(x, y, z);
    if (!c) return (y % 3) ? s.ramp[3] : s.ramp[2]; // 柳条
    if (s.fruit && hash(x, y, z) < (s.fruitRate ?? 0.04)) return s.fruit;
    const [bx, by, bz, rx, ry, rz] = c.b;
    const n = new THREE.Vector3((x - bx) / rx, (y - by) / ry, (z - bz) / rz).normalize();
    return shadeRamp(s.ramp, n.dot(LIGHT) + noise(x * 1.7, y * 1.7, z * 1.7) * 0.35);
  };
  let ext = 0, top = th;
  for (const b of blobs) { ext = Math.max(ext, Math.abs(b[0]) + b[3] + 2, Math.abs(b[2]) + b[5] + 2); top = Math.max(top, b[1] + b[4] + 2); }
  ext = Math.ceil(ext); top = Math.ceil(top);
  return voxelGeometry([-ext, 0, -ext], [ext + 1, top, ext + 1], solid, color, TREE_VOX, [-TREE_VOX / 2, 0, -TREE_VOX / 2]);
}
