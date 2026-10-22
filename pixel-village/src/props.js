import * as THREE from 'three';
import { block, box, prism, decal } from './pixel.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { doorLeaves } from './buildings.js';

// 院里院外的物件。单位米，原点在物件底部中心。每个函数返回一个 Group。

const at = (g, x, z, rotY = 0) => { g.position.set(x, 0, z); g.rotation.y = rotY; return g; };

/** 麦秸垛：圆柱身 + 尖顶。 */
export function haystack(M, x, z, r = 1.4, h = 2.8) {
  const g = new THREE.Group();
  const body = prism(r, r * 0.9, h * 0.6, M.straw, 10);
  body.position.y = h * 0.3;
  const cap = prism(0.15, r * 1.05, h * 0.4, M.strawTop, 10);
  cap.position.y = h * 0.6 + h * 0.2;
  g.add(body, cap, block(-0.06, h, -0.06, 0.06, h + 0.4, 0.06, M.wood));
  return at(g, x, z);
}

/** 玉米囤：一圈玉米棒子 + 草帽顶。 */
export function cornCrib(M, x, z) {
  const g = new THREE.Group();
  const body = prism(0.8, 0.8, 1.6, M.corn, 10);
  body.position.y = 0.8;
  const cap = prism(0.1, 0.95, 0.6, M.strawTop, 10);
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
  g.add(block(-0.7, 0, -0.7, 0.7, 0.5, 0.7, M.stone));
  const low = prism(0.55, 0.58, 0.25, M.stone, 10);
  low.position.y = 0.62;
  const up = prism(0.5, 0.5, 0.3, M.stone, 10);
  up.position.y = 0.9;
  const spin = new THREE.Group(); // 只有上扇磨盘和推杆转，底座、下扇不动；推杆朝 +x，驴套在杆头上
  spin.add(up, block(0.45, 0.85, -0.05, 1.5, 0.95, 0.05, M.wood));
  g.add(low, spin);
  g.userData.dynamic = true; // 驴拉着转
  g.userData.spin = spin;
  return at(g, x, z);
}

/** 碾子（场院）：大碾盘 + 横着的碾滚 + 木框。 */
export function roller(M, x, z) {
  const g = new THREE.Group();
  const plate = prism(1.6, 1.7, 0.4, M.stone, 12);
  plate.position.y = 0.2;
  const roll = prism(0.32, 0.32, 1.0, M.stone, 8);
  roll.rotation.x = Math.PI / 2;
  roll.position.set(0.85, 0.72, 0);
  const spin = new THREE.Group(); // 碾盘不动，碾滚、中轴和拉杆跟着牛转；拉杆朝 +x
  spin.add(roll, block(-0.08, 0.4, -0.08, 0.08, 1.2, 0.08, M.wood), block(0, 1.0, -0.05, 2.1, 1.1, 0.05, M.wood));
  g.add(plate, spin);
  g.userData.dynamic = true;
  g.userData.spin = spin;
  return at(g, x, z);
}

/**
 * 铁匠炉：砖砌炉台 + 炉火 + 风箱 + 铁砧 + 水槽。返回 { object, fire（炉口世界局部坐标）}。
 * anvil / trough：铁砧、淬火水槽相对炉子的位置（铁匠铺把它们摆到棚外露天里）。
 */
export function forge(M, x, z, { anvil = [1.8, 0.6], trough = [-0.3, 1.35] } = {}) {
  const g = new THREE.Group();
  g.add(block(-1.0, 0, -0.8, 1.0, 1.0, 0.8, M.brick));
  g.add(block(-0.45, 0.85, -0.35, 0.45, 1.05, 0.35, M.fire, { outline: false }));
  g.add(block(-0.3, 1.0, -0.5, 0.3, 3.2, 0.1, M.brick)); // 烟道
  g.add(block(-1.9, 0, -0.5, -1.1, 0.9, 0.5, M.wood)); // 风箱
  g.add(block(-1.9, 0.9, -0.05, -1.4, 1.2, 0.05, M.wood));
  const stump = prism(0.35, 0.4, 0.6, M.wood, 8);
  stump.position.set(anvil[0], 0.3, anvil[1]);
  g.add(stump, block(anvil[0] - 0.3, 0.6, anvil[1] - 0.15, anvil[0] + 0.3, 0.85, anvil[1] + 0.15, M.iron)); // 铁砧
  g.add(block(trough[0] - 0.7, 0, trough[1] - 0.25, trough[0] + 0.7, 0.5, trough[1] + 0.25, M.wood)); // 淬火水槽
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
 * 木栅栏围成的圈（羊圈、菜园）。gap = [起点比例, 终点比例] 留口，口上装一扇能开的栅栏门；gapSide = 'south'（默认）| 'west'。
 * 返回 Group，userData.gate = { leaves, center: [x, z], w, rot }（rot：门在院子里转了多少，西边的门是 π/2）。
 */
export function fence(M, x0, z0, x1, z1, { h = 1.1, gap = null, gapSide = 'south' } = {}) {
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
  side(x1, z0, x1, z1);
  if (gap && gapSide === 'west') { // 西边留门：门扇转 90°，沿 z 方向
    side(x0, z1, x1, z1);
    const gz0 = z0 + (z1 - z0) * gap[0], gz1 = z0 + (z1 - z0) * gap[1];
    side(x0, z0, x0, gz0);
    side(x0, gz1, x0, z1);
    const W = gz1 - gz0 - 0.1;
    const leaf = doorLeaves(M, 'fenceGate', W, h * 1.05, 0.05, { single: true });
    leaf.group.position.set(x0, 0, (gz0 + gz1) / 2);
    leaf.group.rotation.y = Math.PI / 2;
    g.add(leaf.group);
    g.userData.gate = { leaves: leaf.leaves, center: [x0, (gz0 + gz1) / 2], w: W, rot: Math.PI / 2 };
    return g;
  }
  side(x0, z0, x0, z1);
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

/** 猪圈：矮砖墙 + 半边棚顶；朝院子那面墙（z1）开一个猪圈门（gate：[门洞两边的 x]），装一扇木栅门。 */
export function pigsty(M, x0, z0, x1, z1, { gate = null } = {}) {
  const g = new THREE.Group();
  const t = 0.3, h = 1.0;
  g.add(block(x0, 0, z0, x1, h, z0 + t, M.brickDark));
  if (gate) {
    const [gx0, gx1] = gate, W = gx1 - gx0 - 0.06;
    g.add(block(x0, 0, z1 - t, gx0, h, z1, M.brickDark), block(gx1, 0, z1 - t, x1, h, z1, M.brickDark));
    const leaf = doorLeaves(M, 'fenceGate', W, h * 0.9, 0.04, { single: true });
    leaf.group.position.set((gx0 + gx1) / 2, 0, z1 - t / 2);
    g.add(leaf.group);
    g.userData.gate = { leaves: leaf.leaves, center: [(gx0 + gx1) / 2, z1 - t / 2], w: W };
  } else g.add(block(x0, 0, z1 - t, x1, h, z1, M.brickDark));
  g.add(block(x0, 0, z0 + t, x0 + t, h, z1 - t, M.brickDark), block(x1 - t, 0, z0 + t, x1, h, z1 - t, M.brickDark));
  g.add(block(x0, 0, z0, x1, 0.05, z1, M.flatRoof, { outline: false }));
  const roofD = (z1 - z0) * 0.45;
  const slab = box(x1 - x0 + 0.2, 0.15, roofD + 0.3, M.strawTop);
  slab.position.set((x0 + x1) / 2, 1.7, z0 + roofD / 2);
  slab.rotation.x = 0.25;
  g.add(slab, block(x0 + 0.2, h, z0 + roofD - 0.1, x0 + 0.4, 1.6, z0 + roofD + 0.1, M.wood), block(x1 - 0.4, h, z0 + roofD - 0.1, x1 - 0.2, 1.6, z0 + roofD + 0.1, M.wood));
  return g;
}

/** 鸡窝。 */
export function coop(M, x, z) {
  const g = new THREE.Group();
  g.add(block(-0.8, 0, -0.6, 0.8, 1.0, 0.6, M.adobe));
  g.add(block(-0.95, 1.0, -0.75, 0.95, 1.2, 0.75, M.strawTop));
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
  const slab = box(w + 0.4, 0.15, d + 0.5, M.strawTop);
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
  g.add(block(-1.05, 0.8, -0.75, 1.05, 0.95, 0.75, M.strawTop));
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
  // 剃头挑子"一头热"：这头是小炭炉坐着一盆热水（柱子上搭条毛巾、挂着荡刀的皮条），那头是给客人坐的凳子
  const g = new THREE.Group();
  g.add(block(-0.25, 0, -0.25, 0.25, 0.55, 0.25, M.brick)); // 小炉子
  g.add(block(-0.12, 0.3, 0.25, 0.12, 0.45, 0.27, M.fire, { outline: false })); // 炉口的火
  const basin = prism(0.3, 0.22, 0.15, M.iron, 8);
  basin.position.y = 0.63;
  g.add(basin);
  g.add(block(-0.38, 0, -0.06, -0.3, 1.5, 0.06, M.wood)); // 立柱
  g.add(block(-0.42, 1.05, -0.03, -0.38, 1.45, 0.12, M.cloth, { outline: false })); // 毛巾
  g.add(block(-0.3, 0.75, -0.02, -0.26, 1.35, 0.02, M.wood, { outline: false })); // 皮条
  g.add(block(0.7, 0, -0.2, 1.2, 0.45, 0.2, M.wood)); // 客人坐的凳子
  return at(g, x, z, rotY);
}

/**
 * 集市的摊子：一张木桌 + 后头两根竿子撑的布篷 + 桌上的货（kind：tofu 豆腐 / goods 杂货 / veg 菜和药材）。
 * 平时收起来（dynamic，赶集那天才显示）。
 */
export function stall(M, kind) {
  const g = new THREE.Group();
  g.add(block(-0.8, 0.65, -0.4, 0.8, 0.75, 0.4, M.wood));
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.3, 0.3]) g.add(block(sx - 0.05, 0, sz - 0.05, sx + 0.05, 0.65, sz + 0.05, M.wood));
  for (const sx of [-0.9, 0.9]) g.add(block(sx - 0.04, 0, 0.5, sx + 0.04, 1.9, 0.58, M.wood));
  const roof = block(-1.0, 1.85, 0.0, 1.0, 1.92, 0.8, M.cloth); // 布篷只搭后半边（给摊主遮阳），桌上的货从上面看得见
  roof.rotation.x = -0.15;
  g.add(roof);
  const goods = { // [x, 高, 材质]：一板板豆腐 / 布匹、针线、糖块 / 白菜、辣椒、玉米、药材
    tofu: [[-0.5, 0.18, M.plaster], [-0.1, 0.18, M.plaster], [0.35, 0.15, M.plaster]],
    goods: [[-0.5, 0.25, M.redCloth], [-0.1, 0.18, M.cloth], [0.3, 0.2, M.gold], [0.6, 0.12, M.wood]],
    veg: [[-0.5, 0.22, M.veg], [-0.1, 0.18, M.redCloth], [0.3, 0.24, M.corn], [0.6, 0.15, M.millet]],
  }[kind];
  for (const [gx, h, mat] of goods) g.add(block(gx - 0.15, 0.75, -0.23, gx + 0.15, 0.75 + h, 0.13, mat));
  g.userData.dynamic = true;
  g.visible = false;
  return g;
}

/**
 * 货郎车：赶集那天货郎推来的小车，当杂货摊。两只大木轮在一头，另一头两条腿撑着、伸出两根车把；
 * 车厢上摆着筐、布匹、糖块，前面（-z，买东西的人站这边）一溜窄台面；四根柱子撑一块带花边的布篷，
 * 篷檐下挂着草帽、小筐、红头绳。平日收起（和别的摊子一样，userData.dynamic、默认不显示）。
 */
export function peddlerCart(M) {
  const g = new THREE.Group();
  const piece = (w, h, d, mat, x, y, z, rz = 0, opts) => { const m = block(-w / 2, -h / 2, -d / 2, w / 2, h / 2, d / 2, mat, opts); m.position.set(x, y, z); m.rotation.z = rz; g.add(m); return m; };
  piece(1.5, 0.42, 0.8, M.wood, 0, 0.6, 0); // 车厢
  piece(1.52, 0.05, 0.82, M.trayWood, 0, 0.58, 0, 0, { outline: false }); // 一道压条
  piece(1.5, 0.04, 0.22, M.wood, 0, 0.8, -0.51); // 前面的台面
  for (const z of [-0.36, 0.36]) piece(0.08, 0.4, 0.08, M.wood, 0.65, 0.2, z); // 腿
  for (const z of [-0.3, 0.3]) piece(0.4, 0.05, 0.05, M.wood, 0.95, 0.62, z); // 车把
  for (const sz of [-1, 1]) { // 大木轮：一圈轮辋 + 六根辐条 + 轮毂
    const R0 = 0.38, cx = -0.38, cz = sz * 0.47;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; piece(0.22, 0.06, 0.05, M.wood, cx + Math.cos(a) * R0, R0 + Math.sin(a) * R0, cz, a + Math.PI / 2); }
    for (let i = 0; i < 3; i++) piece(R0 * 2 - 0.06, 0.035, 0.03, M.wood, cx, R0, cz, (i / 3) * Math.PI, { outline: false });
    piece(0.12, 0.12, 0.1, M.iron, cx, R0, cz);
  }
  for (const x of [-0.72, 0.72]) for (const z of [-0.36, 0.36]) piece(0.05, 1.15, 0.05, M.wood, x, 1.38, z); // 篷柱
  const roof = piece(1.75, 0.05, 1.05, M.cloth, 0, 1.98, -0.05); // 布篷，前低后高一点
  roof.rotation.x = 0.12;
  for (let i = 0; i < 9; i++) piece(0.17, 0.08, 0.03, i % 2 ? M.cloth : M.redCloth, -0.8 + i * 0.2, 1.88, -0.6, 0, { outline: false }); // 篷檐的花边
  const hat = prism(0.06, 0.17, 0.05, M.straw, 8); hat.position.set(-0.45, 1.6, -0.48); g.add(hat); // 挂着的草帽
  const hatTop = prism(0.07, 0.08, 0.08, M.straw, 8); hatTop.position.set(-0.45, 1.66, -0.48); g.add(hatTop);
  for (const [x, mat] of [[0.05, M.straw], [0.45, M.straw]]) { const b = prism(0.1, 0.08, 0.12, mat, 8); b.position.set(x, 1.58, -0.46); g.add(b); } // 小筐
  for (const x of [-0.15, 0.25, 0.6]) piece(0.03, 0.22, 0.03, M.redCloth, x, 1.66, -0.5, 0, { outline: false }); // 红头绳
  for (const [x, z, r] of [[-0.45, -0.1, 0.2], [0.05, 0.12, 0.17]]) { const b = prism(r, r * 0.85, 0.16, M.straw, 10); b.position.set(x, 0.89, z); g.add(b); } // 车厢上的大筐
  for (const [x, h, mat] of [[0.45, 0.12, M.redCloth], [0.62, 0.08, M.cloth], [-0.05, 0.06, M.gold]]) piece(0.22, h, 0.26, mat, x, 0.81 + h / 2, -0.1);
  for (const [x, mat] of [[-0.5, M.gold], [-0.2, M.redCloth], [0.15, M.cloth], [0.5, M.gold]]) piece(0.18, 0.05, 0.14, mat, x, 0.845, -0.51, 0, { outline: false }); // 台面上一小份一小份的货
  g.userData.dynamic = true;
  g.visible = false;
  return g;
}

/**
 * 露天电影的幕布：两根竿子撑一块白布，片子是几帧像素画轮着放（天地山水、骑马、两个人在台上、一张大脸）。
 * frames：幕布上要换的贴图；平时收起来。
 */
export function movieScreen(M, w = 5.4, h = 2.4) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(block(sx * (w / 2 + 0.08) - 0.06, -h / 2 - 1.2, -0.06, sx * (w / 2 + 0.08) + 0.06, h / 2 + 0.2, 0.06, M.wood));
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.16, h + 0.16), M.plaster);
  frame.position.z = -0.02;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.movie[0]);
  g.add(frame, pic);
  g.userData.dynamic = true;
  g.userData.pic = pic;
  g.visible = false;
  return g;
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

/** 雪人（冬天）：三个雪球摞起来，煤球眼睛、胡萝卜鼻子、红围巾、树枝胳膊，头上扣一只破簸箕。 */
export function snowman(M, x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const [r0, r1, h, y] of [[0.36, 0.42, 0.5, 0.25], [0.26, 0.32, 0.38, 0.69], [0.19, 0.22, 0.3, 1.03]]) {
    const ball = prism(r0, r1, h, M.snowPlain, 8);
    ball.position.y = y;
    g.add(ball);
  }
  g.add(block(-0.3, 0.86, -0.3, 0.3, 0.94, 0.3, M.redCloth)); // 围巾
  for (const sx of [-1, 1]) g.add(block(sx * 0.09 - 0.03, 1.07, 0.18, sx * 0.09 + 0.03, 1.13, 0.22, M.ink, { outline: false })); // 眼睛
  g.add(block(-0.03, 0.98, 0.2, 0.03, 1.04, 0.36, M.gold)); // 胡萝卜鼻子
  for (const sx of [-1, 1]) g.add(block(sx > 0 ? 0.25 : -0.62, 0.72, -0.02, sx > 0 ? 0.62 : -0.25, 0.76, 0.02, M.wood)); // 树枝胳膊
  g.add(block(-0.2, 1.18, -0.2, 0.2, 1.32, 0.2, M.straw)); // 簸箕当帽子
  g.userData.thing = 'snowman';
  return at(g, x, z, rotY);
}

/** 木条凳：一块长木板、四条腿，轻，办事的时候搬得动（合成一个网格，不参与合批，位置随时能改）。 */
export function woodBench(M) {
  const parts = [[-0.85, 0.38, -0.16, 0.85, 0.46, 0.16], ...[-0.7, 0.7].flatMap((x) => [-0.1, 0.1].map((z) => [x - 0.05, 0, z - 0.04, x + 0.05, 0.38, z + 0.04])), [-0.7, 0.14, -0.03, 0.7, 0.2, 0.03]]
    .map((b) => { const m = block(...b, M.wood, { outline: false }); m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
  const mesh = new THREE.Mesh(mergeGeometries(parts), M.wood);
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.dynamic = true;
  g.userData.thing = 'woodBench';
  return g;
}

/** 晒席：苇席铺在地上，四边压着木条，上面摊着晒的东西（fill：材质）。 */
export function dryingMat(M, fill, w = 2.4, d = 1.6) {
  const g = new THREE.Group();
  g.add(block(-w / 2, 0, -d / 2, w / 2, 0.04, d / 2, M.straw, { outline: false }));
  if (fill) g.add(block(-w / 2 + 0.15, 0.04, -d / 2 + 0.15, w / 2 - 0.15, 0.09, d / 2 - 0.15, fill, { outline: false }));
  for (const sz of [-1, 1]) g.add(block(-w / 2, 0.04, sz * d / 2 - 0.04, w / 2, 0.1, sz * d / 2 + 0.04, M.wood, { outline: false }));
  return g;
}

/** 粮堆：碾净扬净的粮食在场院上堆成一个大圆锥（坡度和粮食自然堆起来的差不多，三十度上下），
 *  堆尖撒一圈白石灰的"灰印"（谁动过一眼就看得出），插着一把木锨（fill：粮食的材质）。 */
export function grainHeap(M, fill, r = 1.4, h = 0.85) {
  const g = new THREE.Group();
  const heap = prism(0.22, r, h, fill, 12);
  heap.position.y = h / 2;
  const stamp = prism(0.2, 0.24, 0.03, M.plaster, 12); // 灰印
  stamp.position.y = h + 0.005;
  g.add(heap, stamp);
  const shovel = new THREE.Group(); // 木锨斜插在堆上：长把 + 宽板头
  shovel.add(block(-0.025, 0, -0.025, 0.025, 1.3, 0.025, M.wood, { outline: false }), block(-0.16, -0.05, -0.02, 0.16, 0.28, 0.02, M.wood));
  shovel.position.set(r * 0.35, h * 0.55, r * 0.15);
  shovel.rotation.set(0.15, 0.6, -0.55);
  g.add(shovel);
  return g;
}

/** 粮袋：几口扎了口的布袋子靠在一起立着（n 个）。 */
export function sacks(M, n = 3) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.42, z = (i % 2) * 0.08, h = 0.5 + (i % 3) * 0.04;
    g.add(block(x - 0.18, 0, z - 0.14, x + 0.18, h, z + 0.14, M.plaster), block(x - 0.07, h, z - 0.06, x + 0.07, h + 0.1, z + 0.06, M.straw)); // 袋身 + 扎口
  }
  return g;
}

/** 簸箕：柳条编的，后高前低的浅斗。 */
export function winnower(M) {
  const g = new THREE.Group();
  g.add(block(-0.32, 0, -0.26, 0.32, 0.04, 0.26, M.straw, { outline: false }), block(-0.32, 0.04, -0.26, 0.32, 0.16, -0.2, M.straw), ...[-1, 1].map((sx) => block(sx * 0.32 - 0.03, 0.04, -0.2, sx * 0.32 + 0.03, 0.1, 0.18, M.straw)));
  return g;
}

/** 祖坟：坡上一排三个坟头，前面各立一块小石碑；清明时坟头压着白纸条、插着柳枝。原点在中间坟头前。 */
export function graves(M, spring = false) {
  const g = new THREE.Group();
  for (const x of [-1.5, 0, 1.5]) {
    const mound = prism(0.25, 0.65, 0.55, M.flatRoof, 8);
    mound.position.set(x, 0.27, -0.6);
    g.add(mound, block(x - 0.18, 0, -0.05, x + 0.18, 0.5, 0.05, M.stone));
    if (spring) { // 挂纸、插柳
      g.add(block(x - 0.12, 0.54, -0.68, x + 0.12, 0.56, -0.52, M.plaster, { outline: false }));
      g.add(block(x + 0.18, 0.3, -0.45, x + 0.22, 0.85, -0.41, M.wood, { outline: false }), block(x + 0.08, 0.7, -0.48, x + 0.32, 0.88, -0.38, M.veg, { outline: false }));
    }
  }
  g.userData.thing = 'graves';
  return g;
}

/** 中秋拜月的供桌：石桌上摆一摞月饼、一盘苹果石榴、一个西瓜（切成莲花瓣）、一个小香炉。 */
export function moonOffering(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const c = prism(0.13, 0.13, 0.05, M.gold, 8); c.position.set(-0.22, 0.87 + i * 0.05, 0.05); g.add(c); } // 月饼
  const plate = prism(0.2, 0.15, 0.04, M.plaster, 8); plate.position.set(0.18, 0.86, 0.12); g.add(plate);
  for (const [x, z] of [[0.12, 0.08], [0.24, 0.1], [0.18, 0.2], [0.16, 0.14]]) g.add(block(x - 0.05, 0.88, z - 0.05, x + 0.05, 0.97, z + 0.05, M.redCloth, { outline: false }));
  const melon = prism(0.14, 0.16, 0.16, M.veg, 8); melon.position.set(0.05, 0.92, -0.25); g.add(melon);
  g.add(block(-0.32, 0.84, -0.3, -0.2, 0.94, -0.18, M.iron)); // 香炉
  return g;
}

/** 端午：石桌上一盆包好的粽子、一摞泡好的苇叶。 */
export function zongziPlate(M) {
  const g = new THREE.Group();
  const basin = prism(0.28, 0.2, 0.1, M.wood, 8); basin.position.set(-0.1, 0.89, 0); g.add(basin);
  for (const [x, z] of [[-0.18, -0.06], [-0.02, 0.06], [-0.12, 0.1], [-0.02, -0.08], [-0.2, 0.06]]) { const z1 = prism(0.0, 0.07, 0.1, M.veg, 3); z1.position.set(x, 0.99, z); g.add(z1); } // 三角粽子
  g.add(block(0.15, 0.84, -0.2, 0.42, 0.9, 0.15, M.veg, { outline: false })); // 苇叶
  return g;
}

/** 粪堆 / 堆肥。 */
export function compost(M, x, z) {
  const g = new THREE.Group();
  const m = prism(0.3, 0.9, 0.6, M.flatRoof, 8);
  m.position.y = 0.3;
  g.add(m);
  return at(g, x, z);
}
