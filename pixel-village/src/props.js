import * as THREE from 'three';
import { block, box, prism, decal } from './pixel.js';
import { doorLeaves } from './buildings.js';

// 院里院外的物件。单位米，原点在物件底部中心。每个函数返回一个 Group。

const at = (g, x, z, rotY = 0) => { g.position.set(x, 0, z); g.rotation.y = rotY; return g; };

/** 麦秸垛：圆柱身 + 尖顶。 */
export function haystack(M, x, z, r = 1.4, h = 2.8) {
  const g = new THREE.Group();
  const body = prism(r, r * 0.9, h * 0.6, M.straw, 10);
  body.position.y = h * 0.3;
  const cap = prism(0.15, r * 1.05, h * 0.4, M.straw, 10);
  cap.position.y = h * 0.6 + h * 0.2;
  g.add(body, cap, block(-0.06, h, -0.06, 0.06, h + 0.4, 0.06, M.wood));
  return at(g, x, z);
}

/** 玉米囤：一圈玉米棒子 + 草帽顶。 */
export function cornCrib(M, x, z) {
  const g = new THREE.Group();
  const body = prism(0.8, 0.8, 1.6, M.corn, 10);
  body.position.y = 0.8;
  const cap = prism(0.1, 0.95, 0.6, M.straw, 10);
  cap.position.y = 1.9;
  g.add(body, cap);
  return at(g, x, z);
}

/** 柴火垛。 */
export function firewood(M, x, z, w = 2.2, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-w / 2, 0, -0.4, w / 2, 0.9, 0.4, M.wood));
  g.add(block(-w / 2 + 0.2, 0.9, -0.3, w / 2 - 0.2, 1.3, 0.3, M.wood));
  return at(g, x, z, rotY);
}

/** 水缸。 */
export function vat(M, x, z, r = 0.45) {
  const g = new THREE.Group();
  const v = prism(r, r * 0.75, 0.8, M.brickDark, 8);
  v.position.y = 0.4;
  const water = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 8), M.deepWater);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.78;
  g.add(v, water);
  return at(g, x, z);
}

/** 水井：井台 + 辘轳。 */
export function well(M, x, z) {
  const g = new THREE.Group();
  g.add(block(-1.2, 0, -1.2, 1.2, 0.25, 1.2, M.stone));
  const ring = prism(0.6, 0.65, 0.6, M.stone, 8);
  ring.position.y = 0.55;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.45, 8), M.deepWater);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.86;
  g.add(ring, hole);
  g.add(block(-0.85, 0.25, -0.1, -0.7, 1.7, 0.1, M.wood), block(0.7, 0.25, -0.1, 0.85, 1.7, 0.1, M.wood));
  const drum = prism(0.15, 0.15, 1.4, M.wood, 6);
  drum.rotation.z = Math.PI / 2;
  drum.position.y = 1.5;
  g.add(drum);
  g.add(block(0.85, 1.4, -0.05, 1.15, 1.5, 0.05, M.wood));
  return at(g, x, z);
}

/** 石磨（豆腐坊）：底座 + 两扇磨盘 + 推杆。 */
export function millstone(M, x, z) {
  const g = new THREE.Group();
  g.add(block(-1.0, 0, -1.0, 1.0, 0.6, 1.0, M.stone));
  const low = prism(0.75, 0.8, 0.3, M.stone, 10);
  low.position.y = 0.75;
  const up = prism(0.7, 0.7, 0.35, M.stone, 10);
  up.position.y = 1.07;
  const spin = new THREE.Group(); // 只有上扇磨盘和推杆转，底座、下扇不动
  spin.add(up, block(0.6, 1.0, -0.06, 2.4, 1.1, 0.06, M.wood));
  g.add(low, spin);
  g.userData.dynamic = true; // 驴拉着转
  g.userData.spin = spin;
  return at(g, x, z);
}

/** 碾子（场院）：大碾盘 + 横着的碾滚 + 木框。 */
export function roller(M, x, z) {
  const g = new THREE.Group();
  const plate = prism(2.2, 2.3, 0.45, M.stone, 12);
  plate.position.y = 0.22;
  const roll = prism(0.4, 0.4, 1.2, M.stone, 8);
  roll.rotation.x = Math.PI / 2;
  roll.position.set(1.1, 0.85, 0);
  const spin = new THREE.Group(); // 碾盘不动，碾滚、中轴和拉杆跟着牛转
  spin.add(roll, block(-0.1, 0.45, -0.1, 0.1, 1.4, 0.1, M.wood), block(0, 1.2, -0.06, 3.0, 1.3, 0.06, M.wood));
  g.add(plate, spin);
  g.userData.dynamic = true;
  g.userData.spin = spin;
  return at(g, x, z);
}

/** 铁匠炉：砖砌炉台 + 炉火 + 风箱 + 铁砧 + 水槽。返回 { object, fire（炉口世界局部坐标）}。 */
export function forge(M, x, z) {
  const g = new THREE.Group();
  g.add(block(-1.0, 0, -0.8, 1.0, 1.0, 0.8, M.brick));
  g.add(block(-0.45, 0.85, -0.35, 0.45, 1.05, 0.35, M.fire, { outline: false }));
  g.add(block(-0.3, 1.0, -0.5, 0.3, 3.2, 0.1, M.brick)); // 烟道
  g.add(block(-1.9, 0, -0.5, -1.1, 0.9, 0.5, M.wood)); // 风箱
  g.add(block(-1.9, 0.9, -0.05, -1.4, 1.2, 0.05, M.wood));
  const stump = prism(0.35, 0.4, 0.6, M.wood, 8);
  stump.position.set(1.8, 0.3, 0.6);
  g.add(stump, block(1.5, 0.6, 0.45, 2.1, 0.85, 0.75, M.iron)); // 铁砧
  g.add(block(-1.0, 0, 1.1, 0.4, 0.5, 1.6, M.wood)); // 淬火水槽
  const halo = new THREE.Sprite(M.haloSprite);
  halo.scale.set(3, 3, 1);
  halo.position.y = 1.3;
  halo.userData.dynamic = true;
  g.add(halo);
  return { object: at(g, x, z), fire: new THREE.Vector3(x, 1.1, z) };
}

/** 木料堆：横放的原木 + 板材。 */
export function lumber(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = prism(0.22, 0.22, 3.4, M.wood, 6);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.22 + (i >= 3 ? 0.38 : 0), -0.5 + (i % 3) * 0.45 + (i >= 3 ? 0.22 : 0));
    g.add(log);
  }
  g.add(block(-1.6, 0, 0.8, 1.6, 0.4, 1.4, M.wood));
  return at(g, x, z, rotY);
}

/** 木工台 + 架马。 */
export function workbench(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-1.2, 0.75, -0.35, 1.2, 0.9, 0.35, M.wood));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(sx * 1.05 - 0.06, 0, sz * 0.25 - 0.06, sx * 1.05 + 0.06, 0.75, sz * 0.25 + 0.06, M.wood));
  g.add(block(-0.4, 0.9, -0.1, 0.5, 1.0, 0.1, M.wood));
  return at(g, x, z, rotY);
}

/** 车轮（靠墙立着）。 */
export function wheel(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  const rim = prism(0.7, 0.7, 0.12, M.wood, 10);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.7;
  g.add(rim);
  return at(g, x, z, rotY);
}

/** 大车：车厢 + 两个轮子 + 车辕。 */
export function cart(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-1.4, 0.7, -0.7, 1.4, 0.9, 0.7, M.wood));
  g.add(block(-1.4, 0.9, -0.7, 1.4, 1.2, -0.6, M.wood), block(-1.4, 0.9, 0.6, 1.4, 1.2, 0.7, M.wood));
  for (const sz of [-1, 1]) {
    const w = prism(0.6, 0.6, 0.12, M.wood, 10);
    w.rotation.x = Math.PI / 2;
    w.position.set(0, 0.6, sz * 0.82);
    g.add(w);
  }
  g.add(block(1.4, 0.75, -0.5, 3.2, 0.85, -0.4, M.wood), block(1.4, 0.75, 0.4, 3.2, 0.85, 0.5, M.wood));
  return at(g, x, z, rotY);
}

/**
 * 木栅栏围成的圈（羊圈、菜园）。gap = [起点比例, 终点比例] 在南边留口，口上装一扇能开的栅栏门。
 * 返回 Group，userData.gate = { leaves, center: [x, z], w }（门扇转轴在口子西边，往圈里推开）。
 */
export function fence(M, x0, z0, x1, z1, { h = 1.1, gap = null } = {}) {
  const g = new THREE.Group();
  const post = (x, z) => g.add(block(x - 0.08, 0, z - 0.08, x + 0.08, h + 0.15, z + 0.08, M.wood));
  const rail = (ax, az, bx, bz) => {
    for (const y of [h * 0.45, h * 0.9]) {
      if (Math.abs(bx - ax) > 0.01) g.add(block(Math.min(ax, bx), y - 0.05, az - 0.04, Math.max(ax, bx), y + 0.05, az + 0.04, M.wood, { outline: false }));
      else g.add(block(ax - 0.04, y - 0.05, Math.min(az, bz), ax + 0.04, y + 0.05, Math.max(az, bz), M.wood, { outline: false }));
    }
  };
  const side = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) post(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
    rail(ax, az, bx, bz);
  };
  side(x0, z0, x1, z0);
  side(x0, z0, x0, z1);
  side(x1, z0, x1, z1);
  if (gap) {
    const gx0 = x0 + (x1 - x0) * gap[0], gx1 = x0 + (x1 - x0) * gap[1];
    if (gx0 - x0 > 0.05) side(x0, z1, gx0, z1);
    side(gx1, z1, x1, z1);
    const W = gx1 - gx0 - 0.1;
    const leaf = doorLeaves(M, 'fenceGate', W, h * 1.05, 0.05, { single: true });
    leaf.group.position.set((gx0 + gx1) / 2, 0, z1);
    g.add(leaf.group);
    g.userData.gate = { leaves: leaf.leaves, center: [(gx0 + gx1) / 2, z1], w: W };
  } else side(x0, z1, x1, z1);
  return g;
}

/** 猪圈：矮砖墙 + 半边棚顶。 */
export function pigsty(M, x0, z0, x1, z1) {
  const g = new THREE.Group();
  const t = 0.3, h = 1.0;
  g.add(block(x0, 0, z0, x1, h, z0 + t, M.brickDark), block(x0, 0, z1 - t, x1, h, z1, M.brickDark));
  g.add(block(x0, 0, z0 + t, x0 + t, h, z1 - t, M.brickDark), block(x1 - t, 0, z0 + t, x1, h, z1 - t, M.brickDark));
  g.add(block(x0, 0, z0, x1, 0.05, z1, M.flatRoof, { outline: false }));
  const roofD = (z1 - z0) * 0.45;
  const slab = box(x1 - x0 + 0.2, 0.15, roofD + 0.3, M.straw);
  slab.position.set((x0 + x1) / 2, 1.7, z0 + roofD / 2);
  slab.rotation.x = 0.25;
  g.add(slab, block(x0 + 0.2, h, z0 + roofD - 0.1, x0 + 0.4, 1.6, z0 + roofD + 0.1, M.wood), block(x1 - 0.4, h, z0 + roofD - 0.1, x1 - 0.2, 1.6, z0 + roofD + 0.1, M.wood));
  return g;
}

/** 鸡窝。 */
export function coop(M, x, z) {
  const g = new THREE.Group();
  g.add(block(-0.8, 0, -0.6, 0.8, 1.0, 0.6, M.adobe));
  g.add(block(-0.95, 1.0, -0.75, 0.95, 1.2, 0.75, M.straw));
  g.add(block(-0.25, 0.1, 0.6, 0.25, 0.6, 0.62, M.ink, { outline: false }));
  return at(g, x, z);
}

/** 石桌石凳（村口下棋）。 */
export function stoneTable(M, x, z) {
  const g = new THREE.Group();
  const top = prism(0.6, 0.6, 0.12, M.stone, 8);
  top.position.y = 0.78;
  const leg = prism(0.2, 0.3, 0.72, M.stone, 6);
  leg.position.y = 0.36;
  g.add(top, leg);
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const s = prism(0.22, 0.25, 0.45, M.stone, 6);
    s.position.set(sx * 1.05, 0.22, sz * 1.05);
    g.add(s);
  }
  return at(g, x, z);
}

/** 晒药架：一排木架，上面放圆竹匾。 */
export function herbRacks(M, x, z, n = 3) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * 1.9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(cx + sx * 0.7 - 0.05, 0, sz * 0.6 - 0.05, cx + sx * 0.7 + 0.05, 0.9, sz * 0.6 + 0.05, M.wood));
    const tray = decal(M.tex.herbRack, M.herbRack);
    tray.rotation.x = -Math.PI / 2;
    tray.scale.setScalar(1.6 / (M.tex.herbRack.image.width / 18));
    tray.position.set(cx, 0.92, 0);
    g.add(tray);
  }
  return at(g, x, z);
}

/** 戏台：高台 + 四根红柱 + 歇山式小屋顶（简化为硬山 + 翘角）+ 匾。 */
export function stage(M, x, z) {
  const g = new THREE.Group();
  const w = 7, d = 5, base = 1.3, h = 4.2;
  g.add(block(-w / 2, 0, -d / 2, w / 2, base, d / 2, M.brick));
  g.add(block(-w / 2 - 0.05, base - 0.15, -d / 2 - 0.05, w / 2 + 0.05, base, d / 2 + 0.05, M.stone));
  g.add(block(-w / 2, base, -d / 2, w / 2, h, -d / 2 + 0.4, M.brick)); // 后墙
  g.add(block(-w / 2 + 0.6, base + 0.3, -d / 2 + 0.42, w / 2 - 0.6, h - 0.6, -d / 2 + 0.44, M.redwood, { outline: false })); // 后台幕布
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(sx * (w / 2 - 0.3) - 0.15, base, sz * (d / 2 - 0.3) - 0.15, sx * (w / 2 - 0.3) + 0.15, h, sz * (d / 2 - 0.3) + 0.15, M.redwood));
  g.add(block(-w / 2, h - 0.4, d / 2 - 0.5, w / 2, h, d / 2 - 0.1, M.redwood));
  const run = d / 2 + 0.8, rise = 1.6;
  for (const s of [1, -1]) {
    const slab = box(w + 1.4, 0.2, Math.hypot(run, rise), M.roof);
    slab.position.set(0, h + rise / 2, (s * run) / 2);
    slab.rotation.x = s * Math.atan2(rise, run);
    g.add(slab);
  }
  g.add(block(-w / 2 - 0.5, h + rise - 0.1, -0.25, w / 2 + 0.5, h + rise + 0.3, 0.25, M.ridge));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(sx * (w / 2 + 0.55) - 0.2, h - 0.05, sz * (run - 0.05) - 0.2, sx * (w / 2 + 0.55) + 0.2, h + 0.45, sz * (run - 0.05) + 0.2, M.ridge)); // 翘角
  const sign = decal(M.tex.signBoard, M.signBoard, 'bottom');
  sign.position.set(0, h - 1.05, d / 2 - 0.08);
  g.add(sign);
  for (let i = 0; i < 3; i++) g.add(block(-1.2, 0, d / 2 + i * 0.35, 1.2, base - (i + 1) * 0.4, d / 2 + (i + 1) * 0.35, M.stone)); // 台阶
  // 台上"一桌二椅"：唱戏时拉板胡的坐左边，开会时记账的坐右边
  // （都摆在台口这半边，屋檐挡不住，从上往下看得见）
  g.add(block(-0.7, base, 0.1, 0.7, base + 0.8, 0.7, M.redwood), block(-0.8, base + 0.8, 0.0, 0.8, base + 0.9, 0.8, M.redCloth));
  for (const sx of [-2.3, 2.3]) {
    g.add(block(sx - 0.25, base, 1.0, sx + 0.25, base + 0.45, 1.5, M.redwood));
    g.add(block(sx - 0.25, base + 0.45, 0.9, sx + 0.25, base + 1.1, 1.0, M.redwood));
  }
  return at(g, x, z);
}

/** 火塘：一圈石头 + 架起来的柴。返回 { object, fire（火苗、光晕、地上的火光，点着了才显示）}。 */
export function firePit(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, cx = Math.cos(a) * 0.62, cz = Math.sin(a) * 0.62;
    g.add(block(cx - 0.16, 0, cz - 0.16, cx + 0.16, 0.22, cz + 0.16, M.stone));
  }
  for (const r of [0, 1.05, 2.1]) {
    const log = prism(0.07, 0.07, 0.9, M.wood, 6);
    log.rotation.set(0, r, Math.PI / 2, 'YXZ');
    log.position.y = 0.12;
    g.add(log);
  }
  const fire = new THREE.Group();
  fire.userData.dynamic = true;
  const flames = [[0, 0, 0.8], [0.18, 0.1, 0.6], [-0.16, -0.08, 0.65]].map(([fx, fz, s]) => {
    const f = new THREE.Sprite(M.flameSprite);
    f.scale.set(s * 0.75, s, 1);
    f.position.set(fx, 0.2 + s / 2, fz);
    fire.add(f);
    return f;
  });
  const halo = new THREE.Sprite(M.haloSprite);
  halo.scale.set(4.5, 4.5, 1);
  halo.position.y = 0.7;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), M.groundGlow);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.renderOrder = 5;
  fire.add(halo, glow);
  fire.userData.flames = flames;
  g.add(fire);
  return { object: g, fire };
}

/** 火塘边当凳子坐的石头。 */
export function seatStone(M, x, z) {
  const g = new THREE.Group();
  g.add(block(-0.2, 0, -0.18, 0.2, 0.28, 0.18, M.rubble));
  return at(g, x, z);
}

/** 石凳（长条）。 */
export function bench(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-0.9, 0.35, -0.2, 0.9, 0.5, 0.2, M.stone));
  g.add(block(-0.75, 0, -0.15, -0.55, 0.35, 0.15, M.stone), block(0.55, 0, -0.15, 0.75, 0.35, 0.15, M.stone));
  return at(g, x, z, rotY);
}

/** 食槽（羊圈、猪圈）。 */
export function trough(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-1.0, 0, -0.25, 1.0, 0.4, 0.25, M.wood));
  g.add(block(-0.9, 0.3, -0.15, 0.9, 0.38, 0.15, M.straw, { outline: false }));
  return at(g, x, z, rotY);
}

/** 灶台 + 大锅（豆腐坊冒热气的地方）。返回 { object, steam }。 */
export function stove(M, x, z) {
  const g = new THREE.Group();
  g.add(block(-1.0, 0, -0.7, 1.0, 0.9, 0.7, M.brick));
  const pot = prism(0.6, 0.45, 0.25, M.iron, 10);
  pot.position.y = 1.0;
  g.add(pot);
  g.add(block(-0.3, 0.15, 0.7, 0.3, 0.55, 0.72, M.fire, { outline: false }));
  return { object: at(g, x, z), steam: new THREE.Vector3(x, 1.3, z) };
}

// ---------------------------------------------------------------- 灯火

/**
 * 火把：木杆 + 铁火盆 + 火苗 + 光晕 + 地面光斑。天黑后由人来点（lit）；火苗、光晕、光斑都是叠加混合，
 * 不用实时光源也能把一小片路照亮（像素风的打光方式）。返回 { object, fire（火苗等发光部分）, base }。
 */
export function torch(M) {
  const g = new THREE.Group();
  g.add(block(-0.07, 0, -0.07, 0.07, 1.9, 0.07, M.wood));
  g.add(block(-0.17, 1.9, -0.17, 0.17, 2.12, 0.17, M.iron));
  const fire = new THREE.Group();
  fire.userData.dynamic = true;
  const flame = new THREE.Sprite(M.flameSprite);
  flame.scale.set(0.45, 0.6, 1);
  flame.position.y = 2.38;
  const halo = new THREE.Sprite(M.haloSprite);
  halo.scale.set(2.6, 2.6, 1);
  halo.position.y = 2.3;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), M.groundGlow);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.renderOrder = 5;
  fire.add(flame, halo, glow);
  fire.userData.flame = flame;
  g.add(fire);
  return { object: g, fire };
}

// ---------------------------------------------------------------- 种植 / 养殖设施

/** 稻草人：十字木架 + 草扎的身子 + 破草帽 + 一块蓝布。 */
export function scarecrow(M, x = 0, z = 0, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-0.06, 0, -0.06, 0.06, 1.9, 0.06, M.wood));
  g.add(block(-0.75, 1.35, -0.05, 0.75, 1.45, 0.05, M.wood));
  g.add(block(-0.25, 0.8, -0.18, 0.25, 1.5, 0.18, M.straw));
  g.add(block(-0.2, 1.5, -0.18, 0.2, 1.85, 0.18, M.straw));
  const hat = prism(0.05, 0.42, 0.25, M.straw, 8);
  hat.position.y = 1.95;
  g.add(hat, block(-0.27, 1.0, 0.18, 0.27, 1.45, 0.2, M.cloth, { outline: false }));
  return at(g, x, z, rotY);
}

/** 蜂箱：一摞木箱 + 黑色巢门。 */
export function beehive(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-0.3, 0, -0.25, 0.3, 0.25, 0.25, M.stone));
  g.add(block(-0.28, 0.25, -0.22, 0.28, 0.75, 0.22, M.wood));
  g.add(block(-0.32, 0.75, -0.26, 0.32, 0.85, 0.26, M.slate));
  g.add(block(-0.15, 0.3, 0.22, 0.15, 0.35, 0.23, M.ink, { outline: false }));
  return at(g, x, z, rotY);
}

/** 敞棚（牛棚 / 驴棚）：四根柱子 + 单坡草顶 + 料槽。w 沿 x，d 沿 z。 */
export function shed(M, x, z, w = 3.2, d = 2.6, rotY = 0) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(sx * (w / 2 - 0.15) - 0.1, 0, sz * (d / 2 - 0.15) - 0.1, sx * (w / 2 - 0.15) + 0.1, sz < 0 ? 2.4 : 2.0, sz * (d / 2 - 0.15) + 0.1, M.wood));
  const slab = box(w + 0.4, 0.15, d + 0.5, M.straw);
  slab.position.set(0, 2.25, 0);
  slab.rotation.x = 0.16;
  g.add(slab);
  g.add(block(-w / 2 + 0.2, 0, -d / 2 + 0.2, w / 2 - 0.2, 0.5, -d / 2 + 0.6, M.wood)); // 料槽
  g.add(block(-w / 2 + 0.3, 0.4, -d / 2 + 0.25, w / 2 - 0.3, 0.48, -d / 2 + 0.55, M.straw, { outline: false }));
  return at(g, x, z, rotY);
}

/** 兔笼：木架上的笼子，前面一道黑色的铁丝网。 */
export function hutch(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(block(sx * 0.6 - 0.05, 0, -0.3, sx * 0.6 + 0.05, 0.45, 0.3, M.wood));
  g.add(block(-0.7, 0.45, -0.35, 0.7, 1.05, 0.35, M.wood));
  g.add(block(-0.6, 0.52, 0.35, 0.6, 0.98, 0.37, M.ink, { outline: false }));
  g.add(block(-0.8, 1.05, -0.45, 0.8, 1.15, 0.45, M.slate));
  return at(g, x, z, rotY);
}

/** 鸭棚：矮土坯小屋 + 草顶。 */
export function duckHouse(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-0.9, 0, -0.6, 0.9, 0.8, 0.6, M.adobe));
  g.add(block(-1.05, 0.8, -0.75, 1.05, 0.95, 0.75, M.straw));
  g.add(block(-0.3, 0, 0.6, 0.3, 0.5, 0.62, M.ink, { outline: false }));
  return at(g, x, z, rotY);
}

/** 看青棚：地头上的人字形草棚。 */
export function fieldHut(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const s of [1, -1]) {
    const slab = box(2.6, 0.12, 2.0, M.straw);
    slab.position.set(0, 0.9, s * 0.62);
    slab.rotation.x = s * 0.95;
    g.add(slab);
  }
  g.add(block(-1.3, 0, -0.06, -1.2, 1.7, 0.06, M.wood), block(1.2, 0, -0.06, 1.3, 1.7, 0.06, M.wood));
  return at(g, x, z, rotY);
}

/** 玉米架：几根立柱 + 横杆，挂满玉米。 */
export function cornRack(M, x, z, w = 3, rotY = 0) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(block(sx * w / 2 - 0.08, 0, -0.08, sx * w / 2 + 0.08, 2.4, 0.08, M.wood));
  g.add(block(-w / 2, 2.2, -0.06, w / 2, 2.3, 0.06, M.wood));
  g.add(block(-w / 2 + 0.2, 0.6, -0.22, w / 2 - 0.2, 2.2, 0.22, M.corn));
  return at(g, x, z, rotY);
}

/** 剃头挑子：一头是脸盆架，一头是凳子。 */
export function barberStand(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.add(block(-0.2, 0, -0.2, 0.2, 0.9, 0.2, M.wood));
  const basin = prism(0.3, 0.22, 0.15, M.iron, 8);
  basin.position.y = 0.98;
  g.add(basin, block(0.7, 0, -0.2, 1.2, 0.45, 0.2, M.wood));
  return at(g, x, z, rotY);
}

/** 麦个子 / 豆捆：一小捆立着的秸秆。 */
export function sheaf(M, x, z) {
  const g = new THREE.Group();
  const s = prism(0.18, 0.25, 0.7, M.straw, 6);
  s.position.y = 0.35;
  const top = prism(0.05, 0.2, 0.2, M.straw, 6);
  top.position.y = 0.8;
  g.add(s, top);
  return at(g, x, z);
}

/** 粪堆 / 堆肥。 */
export function compost(M, x, z) {
  const g = new THREE.Group();
  const m = prism(0.3, 0.9, 0.6, M.flatRoof, 8);
  m.position.y = 0.3;
  g.add(m);
  return at(g, x, z);
}
