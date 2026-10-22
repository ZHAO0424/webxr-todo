import * as THREE from 'three';
import { block, box, decal, pixelize } from './pixel.js';
import { is } from './season.js';

/*
 * 北方民居建筑套件。单位：米。每栋房子原点在地面中心，正面朝 +z（坐北朝南）。
 *
 * 硬山顶：山墙和屋面齐平，山尖用逐级收窄的砖块堆出来（像素台阶），墙头有墀头。
 * 平顶：黄土 / 华北常见的泥屋面，带女儿墙，房顶能晒玉米。
 * 单坡（半边盖）：厢房、灶棚。
 */

/** 在立面上贴一张贴花。y 是底边高度。 */
export function facade(g, M, key, x, y, z, { rotY = 0, scale = 1 } = {}) {
  const m = decal(M.tex[key], M[key], 'bottom');
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.scale.setScalar(scale);
  m.castShadow = false;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** 两片坡屋顶（屋脊沿 x）+ 山尖台阶 + 屋脊和两端翘起的吻。返回屋面在 |z| 处的高度。 */
function gable(g, M, { w, d, h, rise, oh, wallMat, ridge = true, roofMat = M.roof }) {
  const run = d / 2 + oh;
  const L = Math.hypot(run, rise);
  const a = Math.atan2(rise, run);
  for (const s of [1, -1]) {
    const slab = box(w + 0.1, 0.18, L, roofMat);
    slab.position.set(0, h + rise / 2 + 0.09, (s * run) / 2);
    slab.rotation.x = s * a;
    g.add(slab);
  }
  const steps = 5;
  for (let k = 0; k < steps; k++) { // 山尖：逐级收窄
    const zk = (d / 2) * (1 - (k + 1) / (steps + 1));
    g.add(block(-w / 2, h + (k * rise) / steps, -zk, w / 2, h + ((k + 1) * rise) / steps, zk, wallMat));
  }
  if (ridge) {
    g.add(block(-w / 2 - 0.05, h + rise, -0.22, w / 2 + 0.05, h + rise + 0.32, 0.22, M.ridge));
    for (const sx of [-1, 1]) {
      const [a0, a1] = sx < 0 ? [-w / 2 - 0.05, -w / 2 + 0.25] : [w / 2 - 0.25, w / 2 + 0.05];
      g.add(block(a0, h + rise + 0.32, -0.18, a1, h + rise + 0.62, 0.18, M.ridge)); // 吻
    }
  }
  return (z) => h + 0.18 + rise * (1 - Math.abs(z) / run);
}

/**
 * 一栋房子。
 * wall: brick | loess | adobe；roof: gable | flat | shed；porch: 前廊进深（0 = 无廊）。
 * front: 立面贴花 [{ k, x, y }]，不给就按"一门两窗"布置；lit: 窗户亮灯。
 * 返回 { object, door（门前一点的局部坐标）, chimney（烟囱口，可能为 null）, roofTop }。
 */
export function house(M, { w, d, h, wall = 'brick', roof = 'gable', rise = 1.5, porch = 0, front, lit = true, chimney = false, oh = 0.45, cornOnRoof = false, roofMat = 'roof' }) {
  const g = new THREE.Group();
  const W = M[wall];
  g.add(block(-w / 2 - 0.2, 0, -d / 2 - 0.2, w / 2 + 0.2, 0.3, d / 2 + 0.2, M.stone)); // 台基
  const fz = d / 2 - porch; // 前墙面
  g.add(block(-w / 2, 0.3, -d / 2, w / 2, h, fz, W));
  if (wall === 'brick') g.add(block(-w / 2 - 0.03, 0.3, -d / 2 - 0.03, w / 2 + 0.03, 1.0, fz + 0.03, M.brickDark)); // 下碱
  if (wall === 'adobe' || wall === 'loess') g.add(block(-w / 2 - 0.03, 0.3, -d / 2 - 0.03, w / 2 + 0.03, 0.9, fz + 0.03, M.rubble)); // 石头墙基

  if (porch > 0) { // 前廊：两侧山墙伸到前沿，中间立红柱
    for (const sx of [-1, 1]) g.add(block(sx > 0 ? w / 2 - 0.45 : -w / 2, 0.3, fz, sx > 0 ? w / 2 : -w / 2 + 0.45, h, d / 2, W));
    const bays = Math.max(3, Math.round(w / 3.2));
    for (let i = 1; i < bays; i++) {
      const x = -w / 2 + (w * i) / bays;
      g.add(block(x - 0.12, 0.3, d / 2 - 0.36, x + 0.12, h, d / 2 - 0.12, M.redwood));
    }
    g.add(block(-w / 2 + 0.45, h - 0.35, d / 2 - 0.4, w / 2 - 0.45, h, d / 2 - 0.08, M.redwood)); // 檐枋
  }

  // 立面
  const zf = fz + 0.02;
  const win = lit ? 'windowLit' : 'window';
  const items = front ?? (w >= 7
    ? [{ k: 'door', x: 0 }, { k: win, x: -w / 3, y: 1.1 }, { k: win, x: w / 3, y: 1.1 }]
    : [{ k: 'door', x: -w / 5 }, { k: win, x: w / 5, y: 1.1 }]);
  for (const it of items) facade(g, M, it.k, it.x, it.y ?? 0.3, zf + (it.dz ?? 0), { scale: it.s ?? 1 });
  const doorX = items.find((it) => it.k === 'door' || it.k === 'shutter')?.x ?? 0;

  let chimneyAt = null;
  let roofTop = h;
  if (roof === 'gable') {
    const roofAt = gable(g, M, { w, d, h, rise, oh, wallMat: W, roofMat: M[roofMat] });
    for (const sx of [-1, 1]) { // 墀头：山墙前端出挑的砖垛
      const [a0, a1] = sx < 0 ? [-w / 2 - 0.05, -w / 2 + 0.5] : [w / 2 - 0.5, w / 2 + 0.05];
      g.add(block(a0, h - 0.45, d / 2 - 0.1, a1, h + 0.12, d / 2 + 0.3, M.brick));
    }
    roofTop = h + rise + 0.6;
    if (chimney) {
      const cz = -(d / 2 + oh) * 0.45, cx = w * 0.3;
      g.add(block(cx - 0.3, roofAt(cz) - 0.4, cz - 0.3, cx + 0.3, roofAt(cz) + 0.9, cz + 0.3, M.brick));
      chimneyAt = new THREE.Vector3(cx, roofAt(cz) + 1.0, cz);
    }
  } else if (roof === 'flat') {
    g.add(block(-w / 2 - 0.2, h, -d / 2 - 0.2, w / 2 + 0.2, h + 0.25, d / 2 + 0.2, M.flatRoof));
    g.add(block(-w / 2 - 0.2, h + 0.25, -d / 2 - 0.2, w / 2 + 0.2, h + 0.55, -d / 2 + 0.05, W)); // 女儿墙
    for (const sx of [-1, 1]) g.add(block(sx > 0 ? w / 2 - 0.05 : -w / 2 - 0.2, h + 0.25, -d / 2 + 0.05, sx > 0 ? w / 2 + 0.2 : -w / 2 + 0.05, h + 0.45, d / 2 + 0.2, W));
    if (cornOnRoof && is('autumn')) { // 房顶晒玉米（秋天）
      g.add(block(-w / 2 + 0.6, h + 0.25, -d / 2 + 0.6, w / 2 - 1.2, h + 0.5, d / 2 - 0.4, M.corn));
      g.add(block(-w / 4, h + 0.5, -d / 4, w / 4, h + 0.7, d / 6, M.corn));
    }
    roofTop = h + 0.6;
    if (chimney) {
      g.add(block(w / 2 - 1.2, h + 0.25, -d / 2 + 0.4, w / 2 - 0.6, h + 1.3, -d / 2 + 1.0, W));
      chimneyAt = new THREE.Vector3(w / 2 - 0.9, h + 1.4, -d / 2 + 0.7);
    }
  } else if (roof === 'shed') { // 单坡：后高前低
    const back = h + rise, L = Math.hypot(d + oh, rise);
    const slab = box(w + 0.3, 0.18, L, M[roofMat]);
    slab.position.set(0, (h + back) / 2 + 0.09, oh / 2);
    slab.rotation.x = Math.atan2(rise, d + oh);
    g.add(slab);
    g.add(block(-w / 2, h, -d / 2, w / 2, back, -d / 2 + 0.4, W));
    for (let k = 0; k < 4; k++) { // 两侧山墙的斜坡也用台阶
      const zk = -d / 2 + ((k + 1) * d) / 5;
      for (const sx of [-1, 1]) g.add(block(sx > 0 ? w / 2 - 0.4 : -w / 2, h, -d / 2, sx > 0 ? w / 2 : -w / 2 + 0.4, back - ((k + 1) * rise) / 5, zk, W));
    }
    roofTop = back + 0.3;
    if (chimney) {
      g.add(block(w / 2 - 0.9, back - 0.3, -d / 2, w / 2 - 0.3, back + 0.9, -d / 2 + 0.6, W));
      chimneyAt = new THREE.Vector3(w / 2 - 0.6, back + 1.0, -d / 2 + 0.3);
    }
  }
  // door：门外一步（人站这儿再进屋）；windows：亮灯窗户的位置（夜里在窗前放光晕）
  const windows = items.filter((it) => it.k === 'windowLit').map((it) => new THREE.Vector3(it.x, (it.y ?? 0.3) + 0.6, zf + 0.1));
  g.userData.thing = 'house'; // 点房子看卡片用（things.js）
  g.userData.thingSpec = { wall, roof, porch, chimney };
  return { object: g, door: new THREE.Vector3(doorX, 0, d / 2 + 0.9), windows, chimney: chimneyAt, roofTop };
}

/** 一段院墙（沿 x 或沿 z），墙头压一道瓦顶。 */
export function wallSeg(M, x0, z0, x1, z1, { h = 2.4, mat = 'brick', t = 0.4, cap = true } = {}) {
  const g = new THREE.Group();
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const [a0, a1] = alongX ? [Math.min(x0, x1), Math.max(x0, x1)] : [Math.min(z0, z1), Math.max(z0, z1)];
  if (a1 - a0 < 0.05) return g;
  const W = M[mat];
  if (alongX) g.add(block(a0, 0, z0 - t / 2, a1, h, z0 + t / 2, W));
  else g.add(block(x0 - t / 2, 0, a0, x0 + t / 2, h, a1, W));
  if (cap) {
    const capMat = mat === 'brick' ? M.ridge : M.flatRoof;
    if (alongX) g.add(block(a0 - 0.05, h, z0 - t / 2 - 0.12, a1 + 0.05, h + 0.22, z0 + t / 2 + 0.12, capMat));
    else g.add(block(x0 - t / 2 - 0.12, h, a0 - 0.05, x0 + t / 2 + 0.12, h + 0.22, a1 + 0.05, capMat));
  }
  return g;
}

/**
 * 围一个院子：北、东、西三面整墙，南墙在 gateX 处留出 gateW 宽的门洞。
 * plot = { x0, x1, z0, z1 }（z1 是临街的南边）。
 */
export function enclose(M, plot, { gateX, gateW = 3, h = 2.4, mat = 'brick', skipSouth = false } = {}) {
  const g = new THREE.Group();
  const { x0, x1, z0, z1 } = plot;
  g.add(wallSeg(M, x0, z0, x1, z0, { h, mat }));
  g.add(wallSeg(M, x0, z0, x0, z1, { h, mat }));
  g.add(wallSeg(M, x1, z0, x1, z1, { h, mat }));
  if (!skipSouth) {
    g.add(wallSeg(M, x0, z1, gateX - gateW / 2, z1, { h, mat }));
    g.add(wallSeg(M, gateX + gateW / 2, z1, x1, z1, { h, mat }));
  }
  return g;
}

/** 灯笼：挂点在顶端（会摆动，所以标成 dynamic，不参与合批）。灯身自发光 + 一圈像素光晕。 */
export function lantern(M, s = 1) {
  const pivot = new THREE.Group();
  pivot.userData.dynamic = true;
  pivot.add(block(-0.02, -0.25, -0.02, 0.02, 0, 0.02, M.ink, { outline: false }));
  pivot.add(block(-0.12, -0.32, -0.12, 0.12, -0.25, 0.12, M.gold));
  pivot.add(block(-0.2, -0.72, -0.2, 0.2, -0.32, 0.2, M.lantern));
  pivot.add(block(-0.12, -0.79, -0.12, 0.12, -0.72, 0.12, M.gold));
  pivot.add(block(-0.03, -1.0, -0.03, 0.03, -0.79, 0.03, M.lantern, { outline: false }));
  const halo = new THREE.Sprite(M.haloSprite);
  halo.scale.set(1.8, 1.8, 1);
  halo.position.y = -0.52;
  pivot.add(halo);
  pivot.scale.setScalar(s);
  return pivot;
}

/**
 * 能开合的门扇：两扇（single = 一扇），各自绕门洞边上的轴转；贴图左右各用一半。
 * 门扇标成 dynamic，不参与合批；返回 { group, leaves: [{ pivot, sign }] }，sign 是开门时的转向。
 */
export function doorLeaves(M, key, W, H, y, { single = false } = {}) {
  const group = new THREE.Group();
  const leaves = [];
  if (!M[`${key}Leaf`]) { M[`${key}Leaf`] = pixelize(M[key].clone()); M[`${key}Leaf`].side = THREE.DoubleSide; }
  const parts = single ? [[-1, 0, 1]] : [[-1, 0, 0.5], [1, 0.5, 1]];
  for (const [side, u0, u1] of parts) {
    const lw = single ? W : W / 2;
    const geo = new THREE.PlaneGeometry(lw, H);
    geo.translate(-side * lw / 2, H / 2, 0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    const leaf = new THREE.Mesh(geo, M[`${key}Leaf`]);
    leaf.castShadow = true;
    const pivot = new THREE.Group();
    pivot.userData.dynamic = true;
    pivot.position.set(side * W / 2, y, 0);
    pivot.add(leaf);
    group.add(pivot);
    leaves.push({ pivot, sign: -side }); // 都往院里（-z）推开
  }
  return { group, leaves };
}

/**
 * 大门。type：
 * - grand：广亮大门，独立门楼 + 红漆大门 + 门墩 + 台阶 + 对联 + 灯笼（村长家、学堂）
 * - wall：随墙门，两根砖垛 + 小瓦檐 + 黑漆门 + 对联 + 福字
 * - brush：柴门，两根木桩
 * - plank：作坊的木板大门（width 宽），两根粗木柱 + 一道横梁
 * 原点在门扇转轴连线的中点；返回 { object, lanterns, leaves（会开合的门扇）, width（门洞净宽）}。
 * 广亮大门的门楼进深 3 米，门扇在门楼正中——院落里把它整个放在墙线以内（不伸出平台）。
 */
export function gate(M, type, width = 3.4) {
  const g = new THREE.Group();
  const lanterns = [];
  let doors;
  if (type === 'grand') {
    const w = 3.6, d = 3.0, h = 3.3;
    for (const sx of [-1, 1]) g.add(block(sx > 0 ? w / 2 - 0.6 : -w / 2, 0.3, -d / 2, sx > 0 ? w / 2 : -w / 2 + 0.6, h, d / 2, M.brick));
    g.add(block(-w / 2 - 0.1, 0, -d / 2 - 0.1, w / 2 + 0.1, 0.3, d / 2 + 0.1, M.stone));
    g.add(block(-w / 2 + 0.6, h - 0.4, -d / 2, w / 2 - 0.6, h, d / 2, M.redwood));
    gable(g, M, { w, d, h, rise: 1.1, oh: 0.4, wallMat: M.brick });
    doors = doorLeaves(M, 'gateRed', 2.4, 2.5, 0.3);
    facade(g, M, 'couplet', -1.5, 0.75, d / 2 + 0.02);
    facade(g, M, 'couplet', 1.5, 0.75, d / 2 + 0.02);
    facade(g, M, 'signBoard', 0, h - 0.95, d / 2 + 0.02, { scale: 0.8 });
    for (const sx of [-1, 1]) { // 门墩
      g.add(block(sx * 1.0 - 0.2, 0.3, 0.05, sx * 1.0 + 0.2, 0.75, 0.6, M.stone));
      g.add(block(sx * 1.0 - 0.15, 0.75, 0.15, sx * 1.0 + 0.15, 1.0, 0.45, M.stone));
    }
    for (const sx of [-1, 1]) {
      const l = lantern(M, 0.9);
      l.position.set(sx * 1.1, h - 0.5, d / 2 + 0.25);
      g.add(l);
      lanterns.push(l);
    }
  } else if (type === 'wall') {
    for (const sx of [-1, 1]) g.add(block(sx * 1.5 - 0.3, 0, -0.3, sx * 1.5 + 0.3, 3.0, 0.3, M.brick));
    g.add(block(-1.9, 2.95, -0.45, 1.9, 3.15, 0.65, M.roof));
    g.add(block(-2.0, 3.15, -0.2, 2.0, 3.4, 0.2, M.ridge));
    g.add(block(-1.2, 2.6, -0.2, 1.2, 2.95, 0.2, M.brick));
    doors = doorLeaves(M, 'gatePlain', 2.4, 2.4, 0);
    facade(g, M, 'couplet', -1.5, 0.9, 0.32);
    facade(g, M, 'couplet', 1.5, 0.9, 0.32);
    facade(g, M, 'fu', 0, 2.25, 0.02, { scale: 0.7 });
    if (is('winter')) for (const sx of [-1, 1]) { const l = lantern(M, 0.7); l.userData.dynamic = false; l.position.set(sx * 1.5, 2.95, 0.55); g.add(l); } // 腊月：门口挂上一对红灯笼（不晃，跟房子合批省 draw call）
  } else if (type === 'plank') {
    for (const sx of [-1, 1]) g.add(block(sx * (width / 2 + 0.15) - 0.15, 0, -0.15, sx * (width / 2 + 0.15) + 0.15, 2.9, 0.15, M.wood));
    g.add(block(-width / 2 - 0.4, 2.6, -0.12, width / 2 + 0.4, 2.85, 0.12, M.wood));
    doors = doorLeaves(M, 'plankGate', width, 2.2, 0.02);
    if (is('winter')) { // 腊月：铺子门口也贴对联、挂灯笼
      for (const sx of [-1, 1]) facade(g, M, 'couplet', sx * (width / 2 + 0.15), 0.8, 0.17);
      for (const sx of [-1, 1]) { const l = lantern(M, 0.7); l.userData.dynamic = false; l.position.set(sx * (width / 2 - 0.3), 2.6, 0.35); g.add(l); }
    }
  } else {
    for (const sx of [-1, 1]) g.add(block(sx * 1.35 - 0.12, 0, -0.12, sx * 1.35 + 0.12, 2.0, 0.12, M.wood));
    doors = doorLeaves(M, 'brushGate', 2.46, 1.67, 0, { single: true });
    if (is('winter')) for (const sx of [-1, 1]) facade(g, M, 'fu', sx * 1.35, 1.5, 0.13, { scale: 0.45 }); // 柴门的木桩上也贴个福字
  }
  g.add(doors.group);
  const widthOf = { grand: 2.4, wall: 2.4, brush: 2.46, plank: width };
  g.userData.thing = 'gate';
  g.userData.thingSpec = { type };
  return { object: g, lanterns, leaves: doors.leaves, width: widthOf[type] };
}

/** 影壁：门内正对大门的一面砖墙，中间白灰墙心 + 斗方福字。 */
export function screenWall(M) {
  const g = new THREE.Group();
  g.add(block(-1.6, 0, -0.25, 1.6, 0.6, 0.25, M.stone));
  g.add(block(-1.5, 0.6, -0.2, 1.5, 2.6, 0.2, M.brick));
  g.add(block(-1.75, 2.6, -0.4, 1.75, 2.85, 0.4, M.roof));
  g.add(block(-1.8, 2.85, -0.15, 1.8, 3.05, 0.15, M.ridge));
  facade(g, M, 'fu', 0, 1.2, 0.22, { scale: 1.2 });
  g.userData.thing = 'screenWall';
  return g;
}
