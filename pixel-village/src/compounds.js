import * as THREE from 'three';
import { block } from './pixel.js';
import { house, enclose, wallSeg, gate, screenWall, lantern, facade } from './buildings.js';
import * as P from './props.js';

/*
 * 院落。每个函数在"本地坐标"里建：原点 = 平台中心，+z = 朝南的大门那一边。
 * village.js 再按 layout.js 的位置、转角、平台高度把它摆进山坡。返回：
 *   w, d     平台尺寸（地形据此挖平台；所有东西都放在平台以内，不悬空）
 *   object   静态几何（之后统一合批；门扇、灯笼、石磨等标了 dynamic 的除外）
 *   gate     门外一点 [x, z]（路网节点）
 *   gates    能开合的门 [{ leaves, center: [x, z], w }]：院门、栅栏门。关着的时候动物过不去
 *   spots    去处 { 名字: [x, z, 朝向x?, 朝向z?] }——站哪儿、脸朝哪儿（干活时对准物件）
 *   doors    房门外一步 { house, kitchen }：人走到这儿就"进屋"（隐藏）
 *   windows  亮灯窗户的位置（夜里放光晕）
 *   emitters / lanterns / trees / animals / spinners
 */

function ground(g, M, w, d, mat, inset = 0.25) {
  g.add(block(-w / 2 + inset, 0, -d / 2 + inset, w / 2 - inset, 0.03, d / 2 - inset, mat, { outline: false }));
}

function put(g, obj, x, z, rotY = 0) {
  obj.position.set(x, 0, z);
  obj.rotation.y = rotY;
  g.add(obj);
  return obj;
}

/** 把房子本地的点变到院子本地坐标。 */
const at = (h, v) => v.clone().applyEuler(h.object.rotation).add(h.object.position);
const xz = (v) => [v.x, v.z];
const windowsOf = (...hs) => hs.flatMap((h) => h.windows.map((w) => at(h, w)));

function result(w, d, g, extra) {
  return { w, d, object: g, gates: [], spots: {}, doors: {}, windows: [], emitters: [], lanterns: [], trees: [], animals: [], spinners: [], discs: [], ...extra };
}

const rect = (w, d) => ({ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 });

/**
 * 装院门。广亮大门的门楼整个缩在墙线以内（门扇在墙线往里 1.5 米），别的门就在墙线上。
 * 返回 { gate（门外节点）, inside（门里一步）, gates, lanterns }。
 */
function withGate(g, M, type, gx, d, width) {
  const gt = gate(M, type, width);
  const z = type === 'grand' ? d / 2 - 1.5 : d / 2;
  put(g, gt.object, gx, z);
  return {
    gate: [gx, d / 2 + 1.2],
    inside: [gx, z - (type === 'grand' ? 2.0 : 1.0)],
    gates: [{ leaves: gt.leaves, center: [gx, z], w: gt.width }],
    lanterns: gt.lanterns,
  };
}

/** 院里的石板路：从门里一步折到每扇房门口（先沿 z 再沿 x，宽 1 米）。 */
function walkways(g, M, from, doors) {
  const strip = (ax, az, bx, bz) => {
    const x0 = Math.min(ax, bx) - 0.5, x1 = Math.max(ax, bx) + 0.5, z0 = Math.min(az, bz) - 0.5, z1 = Math.max(az, bz) + 0.5;
    g.add(block(x0, 0, z0, x1, 0.05, z1, M.stone, { outline: false }));
  };
  for (const [dx, dz] of doors) {
    strip(from[0], from[1], from[0], dz);
    strip(from[0], dz, dx, dz);
  }
}

const chickens = (area, coop) => ['hen', 'henBrown', 'rooster', 'hen'].map((kind) => ({ kind, role: 'chicken', area, coop }));

// ---------------------------------------------------------------- 王家：青砖四合院

function headman(M) {
  const w = 18, d = 15, g = new THREE.Group();
  const gx = w / 2 - 3;
  ground(g, M, w, d, M.paving);
  g.add(enclose(M, rect(w, d), { gateX: gx, gateW: 3.6, h: 2.6 }));
  const gt = withGate(g, M, 'grand', gx, d);
  put(g, screenWall(M), gx - 0.3, d / 2 - 4.2);
  const main = house(M, { w: 9.5, d: 5, h: 3.6, porch: 1.2, rise: 1.8, chimney: true });
  put(g, main.object, 0, -d / 2 + 3.6);
  const west = house(M, { w: 5, d: 4, h: 3.2, rise: 1.4 });
  put(g, west.object, -w / 2 + 2.6, 1.2, Math.PI / 2);
  const east = house(M, { w: 4, d: 4, h: 3.2, rise: 1.4 });
  put(g, east.object, w / 2 - 2.6, 1.0, -Math.PI / 2);
  for (const x of [-2.5, 2.5]) put(g, P.vat(M, 0, 0), x, -0.3);
  const lanterns = [...gt.lanterns];
  for (const sx of [-1, 1]) { const l = lantern(M, 0.8); l.position.set(sx * 2.2, 3.4, main.object.position.z + 2.3); g.add(l); lanterns.push(l); }
  const doors = { house: xz(at(main, main.door)), kitchen: xz(at(west, west.door)), east: xz(at(east, east.door)) };
  walkways(g, M, [gx - 2.6, d / 2 - 4.2], Object.values(doors));
  return result(w, d, g, {
    ...gt, lanterns, doors,
    spots: { yard: [0, 3.4], porch: [0, -1.9, 0, 6] },
    windows: windowsOf(main, west, east),
    emitters: [{ kind: 'smoke', pos: at(main, main.chimney) }],
    trees: [['bush', -3, 4.4, { seed: 3 }], ['bush', 3, 4.4, { seed: 4 }], ['jujube', -w / 2 + 1.6, -d / 2 + 1.4, { seed: 8 }]],
    animals: [
      { kind: 'cat', role: 'cat', perches: [[-4, 2.85, -d / 2], [w / 2, 2.85, -4.5], [-w / 2 + 2.6, 4.9, 1.2]] },
      { kind: 'magpie', role: 'bird', perches: [[-0.6, 5.75, -3.9], [3.5, 5.75, -3.9]] },
    ],
  });
}

// ---------------------------------------------------------------- 学堂：王家祠堂

function school(M) {
  const w = 15, d = 13, g = new THREE.Group();
  ground(g, M, w, d, M.paving);
  g.add(enclose(M, rect(w, d), { gateX: 0, gateW: 3.6, h: 2.6 }));
  const gt = withGate(g, M, 'grand', 0, d);
  const hall = house(M, { w: 11, d: 5.5, h: 4.0, porch: 1.5, rise: 2.0, front: [{ k: 'door', x: 0, s: 1.15 }, { k: 'windowLit', x: -3.3, y: 1.2 }, { k: 'windowLit', x: 3.3, y: 1.2 }, { k: 'signBoard', x: 0, y: 3.0 }] });
  put(g, hall.object, 0, -d / 2 + 3.2);
  for (const [x, z] of [[-3, 0.9], [3, 0.9], [-3, 2.5], [3, 2.5]]) put(g, P.bench(M, 0, 0), x, z);
  const doors = { house: xz(at(hall, hall.door)) };
  walkways(g, M, gt.inside, Object.values(doors));
  return result(w, d, g, {
    ...gt, doors,
    spots: { teach: [0, -1.1, 0, 4], yard: [0, 3.2], seat1: [-3.4, 1.5, -3.4, -2], seat2: [-2.4, 1.5, -2.4, -2], seat3: [2.4, 1.5, 2.4, -2], seat4: [3.4, 1.5, 3.4, -2], seat5: [-3, 3.1, -3, -2] },
    windows: windowsOf(hall),
    trees: [['cypress', -w / 2 + 1.6, -d / 2 + 1.6, { seed: 21 }], ['cypress', w / 2 - 1.6, -d / 2 + 1.6, { seed: 22 }], ['jujube', -w / 2 + 1.8, 3.6, { seed: 23 }]],
  });
}

// ---------------------------------------------------------------- 马家：半山腰的石头平房 + 羊圈

function shepherd(M) {
  const w = 18, d = 14, g = new THREE.Group();
  const gx = -4.5;
  ground(g, M, w, d, M.street);
  g.add(enclose(M, rect(w, d), { gateX: gx, gateW: 2.8, h: 1.6, mat: 'rubble' }));
  const gt = withGate(g, M, 'brush', gx, d);
  const home = house(M, { w: 7.5, d: 4.5, h: 3.0, wall: 'rubble', roof: 'flat', chimney: true, cornOnRoof: true });
  put(g, home.object, -4.5, -d / 2 + 3.2);
  const pen = P.fence(M, 0.5, -d / 2 + 1.2, 8.5, d / 2 - 1.5, { gap: [0.1, 0.32] });
  g.add(pen);
  put(g, P.shed(M, 0, 0, 3.4, 2.4), 6.2, -4.2); // 羊棚
  put(g, P.trough(M, 0, 0), 4.2, 0.6);
  put(g, P.haystack(M, 0, 0, 1.1, 2.2), -7.2, 4.6);
  put(g, P.firewood(M, 0, 0, 2.4), -7.6, 0.4, Math.PI / 2);
  const doors = { house: xz(at(home, home.door)) };
  walkways(g, M, gt.inside, Object.values(doors));
  const pg = pen.userData.gate;
  return result(w, d, g, {
    ...gt, doors,
    gates: [...gt.gates, { leaves: pg.leaves, center: pg.center, w: pg.w }],
    spots: { penGate: [pg.center[0], pg.center[1] + 1.0], pen: [3.2, 3.0], yard: [-3, 3.2] },
    windows: windowsOf(home),
    emitters: [{ kind: 'smoke', pos: at(home, home.chimney) }],
    animals: [
      ...Array.from({ length: 9 }, () => ({ kind: 'sheep', role: 'sheep', area: [1.3, -4.4, 7.8, 4.8] })),
      { kind: 'dogBlack', role: 'dog', area: [-7.5, 0.5, -1, d / 2 - 1], owner: 'ma_laoliu' },
    ],
    trees: [['persimmon', -7.4, -1.8, { seed: 33, scale: 0.8 }]],
  });
}

// ---------------------------------------------------------------- 三户庄稼人

function farmA(M) { // 陈家：老两口，猪圈 + 院里的小菜园
  const w = 14, d = 12, g = new THREE.Group();
  ground(g, M, w, d, M.street);
  g.add(enclose(M, rect(w, d), { gateX: 0, gateW: 3, h: 1.9, mat: 'rubble' }));
  const gt = withGate(g, M, 'wall', 0, d);
  const main = house(M, { w: 9.5, d: 4.4, h: 3.0, wall: 'rubble', rise: 1.4, chimney: true, roofMat: 'slate' });
  put(g, main.object, 0, -d / 2 + 3.1);
  for (const [k, x] of [['cornString', -2.1], ['chiliString', -1.5], ['cornString', 2.3]]) facade(g, M, k, x, 1.5, main.object.position.z + 2.25);
  const kitchen = house(M, { w: 3.4, d: 2.8, h: 2.5, wall: 'rubble', roof: 'shed', rise: 0.7, chimney: true, roofMat: 'slate', front: [{ k: 'door', x: 0.4 }] });
  put(g, kitchen.object, -w / 2 + 2.0, 1.4, Math.PI / 2);
  g.add(P.pigsty(M, 3.0, -0.2, 6.6, 3.4));
  put(g, P.coop(M, 0, 0), -2.4, 4.8);
  g.add(block(1.2, 0, 3.9, 5.2, 0.06, 5.6, M.veg, { outline: false })); // 小菜园
  const garden = P.fence(M, 1.2, 3.9, 5.2, 5.6, { h: 0.7, gap: [0, 0.3] });
  g.add(garden);
  put(g, P.firewood(M, 0, 0, 2.2), -5.6, 4.6, Math.PI / 2);
  const doors = { house: xz(at(main, main.door)), kitchen: xz(at(kitchen, kitchen.door)) };
  walkways(g, M, gt.inside, Object.values(doors));
  const gg = garden.userData.gate;
  return result(w, d, g, {
    ...gt, doors,
    gates: [...gt.gates, { leaves: gg.leaves, center: gg.center, w: gg.w }],
    spots: { yard: [-0.8, 2.6], feedPigs: [4.8, 3.9, 4.8, 1.6], feedChickens: [-1.0, 3.4], garden: [3.2, 4.8, 3.2, 4.0] },
    windows: windowsOf(main),
    emitters: [{ kind: 'smoke', pos: at(main, main.chimney) }, { kind: 'smoke', pos: at(kitchen, kitchen.chimney) }],
    trees: [['persimmon', 6.0, 4.9, { seed: 70 }]],
    animals: [
      ...chickens([-3.5, 1.2, 0.2, 4.4], [-2.4, 4.0]),
      ...[0, 1].map(() => ({ kind: 'pig', role: 'pig', area: [3.6, 0.4, 6.0, 2.8], trough: [4.8, 2.6] })),
    ],
  });
}

function farmB(M) { // 杨家：牛棚、大车、鸡
  const w = 15, d = 12, g = new THREE.Group();
  ground(g, M, w, d, M.street);
  g.add(enclose(M, rect(w, d), { gateX: 0, gateW: 3, h: 1.9, mat: 'adobe' }));
  const gt = withGate(g, M, 'wall', 0, d);
  const main = house(M, { w: 10, d: 4.6, h: 3.1, wall: 'adobe', rise: 1.5, chimney: true });
  put(g, main.object, 0, -d / 2 + 3.1);
  for (const [k, x] of [['cornString', -2.1], ['chiliString', -1.5], ['cornString', 2.3]]) facade(g, M, k, x, 1.5, main.object.position.z + 2.35);
  const kitchen = house(M, { w: 3.4, d: 2.8, h: 2.5, wall: 'adobe', roof: 'shed', rise: 0.7, chimney: true, front: [{ k: 'door', x: 0.4 }] });
  put(g, kitchen.object, -w / 2 + 2.0, 1.4, Math.PI / 2);
  put(g, P.shed(M, 0, 0, 3.2, 2.6), 5.2, 1.6); // 牛棚
  put(g, P.cart(M, 0, 0), 2.6, 4.6);
  put(g, P.haystack(M, 0, 0, 0.9, 2.0), 6.2, 4.8);
  put(g, P.cornCrib(M, 0, 0), 2.4, 2.0);
  put(g, P.coop(M, 0, 0), -2.8, 4.9);
  const doors = { house: xz(at(main, main.door)), kitchen: xz(at(kitchen, kitchen.door)) };
  walkways(g, M, gt.inside, Object.values(doors));
  return result(w, d, g, {
    ...gt, doors,
    spots: { yard: [-0.6, 2.4], manger: [4.4, 3.4, 5.2, 1.0], feedChickens: [-1.4, 3.2] },
    windows: windowsOf(main),
    emitters: [{ kind: 'smoke', pos: at(main, main.chimney) }, { kind: 'smoke', pos: at(kitchen, kitchen.chimney) }],
    trees: [['jujube', -5.8, 4.8, { seed: 71 }]],
    animals: [
      ...chickens([-4.0, 1.4, 0.0, 4.2], [-2.8, 4.1]),
      { kind: 'ox', role: 'ox', area: [4.2, 1.0, 6.2, 2.4], stall: [5.2, 1.6] },
      { kind: 'dogBlack', role: 'dog', area: [-3, 0.5, 3, 5.4], owner: 'yang_erniu' },
    ],
  });
}

function farmC(M) { // 吴家：猪圈、兔笼、鸭棚
  const w = 14, d = 11, g = new THREE.Group();
  const gx = -3.5;
  ground(g, M, w, d, M.street);
  g.add(enclose(M, rect(w, d), { gateX: gx, gateW: 3, h: 1.9, mat: 'rubble' }));
  const gt = withGate(g, M, 'brush', gx, d);
  const main = house(M, { w: 9.5, d: 4.4, h: 3.0, wall: 'rubble', rise: 1.4, chimney: true, roofMat: 'slate' });
  put(g, main.object, 0, -d / 2 + 3.1);
  for (const [k, x] of [['cornString', -2.1], ['chiliString', -1.5], ['cornString', 2.3]]) facade(g, M, k, x, 1.5, main.object.position.z + 2.25);
  const kitchen = house(M, { w: 3.4, d: 2.8, h: 2.5, wall: 'rubble', roof: 'shed', rise: 0.7, chimney: true, roofMat: 'slate', front: [{ k: 'door', x: 0.4 }] });
  put(g, kitchen.object, w / 2 - 2.0, 1.2, -Math.PI / 2);
  g.add(P.pigsty(M, -6.6, 0.2, -3.0, 3.4));
  put(g, P.hutch(M, 0, 0), 2.8, 4.4);
  put(g, P.duckHouse(M, 0, 0), 5.4, 4.3);
  put(g, P.coop(M, 0, 0), -0.6, 4.6);
  put(g, P.cornRack(M, 0, 0, 2.0), 1.6, 1.6);
  const doors = { house: xz(at(main, main.door)), kitchen: xz(at(kitchen, kitchen.door)) };
  walkways(g, M, gt.inside, Object.values(doors));
  return result(w, d, g, {
    ...gt, doors,
    spots: { yard: [-1.2, 2.4], feedPigs: [-4.8, 4.1, -4.8, 2.0], feedChickens: [0.4, 3.4], rabbits: [2.8, 3.4, 2.8, 4.4], duckHouse: [4.2, 3.4] },
    windows: windowsOf(main),
    emitters: [{ kind: 'smoke', pos: at(main, main.chimney) }, { kind: 'smoke', pos: at(kitchen, kitchen.chimney) }],
    trees: [['persimmon', -5.8, 4.6, { seed: 72 }]],
    animals: [
      ...chickens([-2.4, 1.2, 1.8, 4.0], [-0.6, 3.8]),
      ...[0, 1].map(() => ({ kind: 'pig', role: 'pig', area: [-6.0, 0.8, -3.6, 2.6], trough: [-4.8, 2.6] })),
    ],
  });
}

// ---------------------------------------------------------------- 刘家木匠铺：石头房 + 料场 + 木板大门

function carpenter(M) {
  const w = 15, d = 12, g = new THREE.Group();
  const gx = -1;
  ground(g, M, w, d, M.street);
  g.add(enclose(M, rect(w, d), { gateX: gx, gateW: 3.8, h: 1.9, mat: 'rubble' }));
  const gt = withGate(g, M, 'plank', gx, d, 3.4);
  const home = house(M, { w: 9.5, d: 4.4, h: 3.1, wall: 'rubble', chimney: true, roofMat: 'slate' });
  put(g, home.object, -1.5, -d / 2 + 3.1);
  const [sx0, sx1, sz0, sz1] = [2.6, 6.8, -1.2, 4.2];
  for (const x of [sx0, sx1]) for (const z of [sz0, sz1]) g.add(block(x - 0.12, 0, z - 0.12, x + 0.12, 2.7, z + 0.12, M.wood));
  g.add(block(sx0 - 0.3, 2.7, sz0 - 0.3, sx1 + 0.3, 2.9, sz1 + 0.3, M.straw));
  put(g, P.workbench(M, 0, 0), 4.7, 1.0);
  put(g, P.lumber(M, 0, 0), -4.3, 2.4);
  put(g, P.wheel(M, 0, 0), -6.9, -1.5, Math.PI / 2);
  put(g, P.wheel(M, 0, 0), -6.9, -0.2, Math.PI / 2);
  const doors = { house: xz(at(home, home.door)) };
  doors.kitchen = doors.house;
  walkways(g, M, gt.inside, [doors.house]);
  return result(w, d, g, {
    ...gt, doors,
    spots: { work: [4.7, 1.8, 4.7, 1.0], yard: [-1, 3.2] },
    windows: windowsOf(home),
    emitters: [{ kind: 'smoke', pos: at(home, home.chimney) }],
    trees: [['poplar', -w / 2 + 1.2, -d / 2 + 1.2, { seed: 31 }]],
  });
}

// ---------------------------------------------------------------- 孙家杂货铺：临路铺面（铺面往里缩 2.2 米，门口的缸和凳子都在平台上）

function store(M) {
  const w = 14, d = 12, g = new THREE.Group();
  ground(g, M, w, d, M.paving);
  const front = d / 2 - 2.2; // 铺面前墙
  g.add(wallSeg(M, -w / 2, -d / 2, w / 2, -d / 2, { h: 2.4 }));
  g.add(wallSeg(M, -w / 2, -d / 2, -w / 2, front - 5, { h: 2.4 }));
  g.add(wallSeg(M, w / 2, -d / 2, w / 2, front - 5, { h: 2.4 }));
  const shop = house(M, { w: 13, d: 5, h: 3.8, rise: 1.7, front: [{ k: 'shutter', x: 0 }, { k: 'signBoard', x: 0, y: 2.75 }, { k: 'windowLit', x: -4.9, y: 1.0 }, { k: 'windowLit', x: 4.9, y: 1.0 }] });
  put(g, shop.object, 0, front - 2.5);
  const back = house(M, { w: 9, d: 3.4, h: 3.0, chimney: true });
  put(g, back.object, 0, -d / 2 + 2.3);
  const lanterns = [];
  for (const sx of [-1, 1]) {
    const l = lantern(M);
    l.position.set(sx * 3.3, 3.6, front + 0.3);
    g.add(l);
    lanterns.push(l);
    facade(g, M, 'flag', sx * 5.9, 2.1, front + 0.05);
  }
  for (const x of [-5.6, 5.6]) put(g, P.vat(M, 0, 0, 0.4), x, front + 0.7);
  put(g, P.bench(M, 0, 0), 3.6, front + 1.3);
  return result(w, d, g, {
    gate: [0, d / 2 + 1.0],
    lanterns,
    spots: { counter: [-1.2, front + 0.7, -1.2, d], customer: [1.2, front + 1.8, 0, front], customer2: [-2.8, front + 1.6, -1.2, front], sweepA: [-4.0, front + 1.6], sweepB: [1.6, d / 2 - 0.4] },
    doors: { house: xz(at(shop, shop.door)), kitchen: xz(at(shop, shop.door)) },
    windows: windowsOf(shop),
    emitters: [{ kind: 'smoke', pos: at(back, back.chimney) }],
    animals: [{ kind: 'cat', role: 'cat', perches: [[4.6, shop.roofTop - 0.95, front - 2.5], [-5.6, 1.25, front + 0.7]] }],
  });
}

// ---------------------------------------------------------------- 周家药铺：铺面 + 晒药院 + 蜂箱

function doctor(M) {
  const w = 13, d = 11, g = new THREE.Group();
  const gx = 4;
  ground(g, M, w, d, M.paving);
  // 院墙：后墙、东墙整段；西边只到铺面后头；铺面和晒药院之间一道隔墙（从后屋前檐到街）；南墙留门
  const W = { h: 2.2, mat: 'rubble' };
  g.add(wallSeg(M, -w / 2, -d / 2, w / 2, -d / 2, W), wallSeg(M, w / 2, -d / 2, w / 2, d / 2, W), wallSeg(M, -w / 2, -d / 2, -w / 2, d / 2 - 5, W));
  g.add(wallSeg(M, 0.5, -0.6, 0.5, d / 2, W), wallSeg(M, 0.5, d / 2, gx - 1.4, d / 2, W), wallSeg(M, gx + 1.4, d / 2, w / 2, d / 2, W));
  const gt = withGate(g, M, 'wall', gx, d);
  const shop = house(M, { w: 6.4, d: 5, h: 3.4, rise: 1.4, wall: 'rubble', roofMat: 'slate', front: [{ k: 'shutter', x: 0, s: 0.7 }, { k: 'signBoard', x: 0, y: 2.55, s: 0.75 }] });
  put(g, shop.object, -3.1, d / 2 - 2.7);
  facade(g, M, 'gourd', -0.1, 1.9, d / 2 + 0.05);
  const back = house(M, { w: 12, d: 4, h: 3.1, wall: 'rubble', chimney: true, roofMat: 'slate', front: [{ k: 'door', x: 3.2 }, { k: 'windowLit', x: -3.4, y: 1.1 }, { k: 'windowLit', x: 0.9, y: 1.1 }] });
  put(g, back.object, 0, -d / 2 + 2.8);
  put(g, P.herbRacks(M, 0, 0, 2), 2.8, 1.3);
  put(g, P.vat(M, 0, 0), 5.8, 3.8);
  for (const z of [-0.4, 0.5, 1.4]) put(g, P.beehive(M, 0, 0), 5.9, z, -Math.PI / 2); // 蜂箱
  const doors = { house: xz(at(back, back.door)) };
  doors.kitchen = doors.house;
  walkways(g, M, gt.inside, [doors.house]);
  return result(w, d, g, {
    ...gt, doors,
    spots: { herbs: [2.8, 2.5, 2.8, 1.3], bees: [4.8, 0.5, 5.9, 0.5], front: [-3.1, d / 2 + 0.9, -3.1, 0], yard: [2.6, 3.8] },
    windows: windowsOf(back),
    emitters: [{ kind: 'smoke', pos: at(back, back.chimney) }],
    animals: [{ kind: 'magpie', role: 'bird', perches: [[0.5, back.roofTop - 0.25, -d / 2 + 2.8], [-3.1, 5.3, d / 2 - 2.7]] }],
  });
}

// ---------------------------------------------------------------- 张家铁匠铺：炉棚 + 木板大门

function smith(M) {
  const w = 14, d = 11, g = new THREE.Group();
  const gx = 3.4;
  ground(g, M, w, d, M.street);
  g.add(enclose(M, rect(w, d), { gateX: gx, gateW: 3.8, h: 1.9, mat: 'rubble' }));
  const gt = withGate(g, M, 'plank', gx, d, 3.4);
  const home = house(M, { w: 9, d: 4.2, h: 3.0, wall: 'rubble', chimney: true, roofMat: 'slate' });
  put(g, home.object, 0, -d / 2 + 2.9);
  const [sx0, sx1, sz0, sz1] = [-6.4, 1.2, 0.6, 5.0];
  for (const x of [sx0 + 0.3, sx1]) for (const z of [sz0, sz1]) g.add(block(x - 0.15, 0, z - 0.15, x + 0.15, 2.9, z + 0.15, M.wood));
  g.add(block(sx0, 2.9, sz0 - 0.3, sx1 + 0.3, 3.15, sz1 + 0.3, M.slate));
  const f = P.forge(M, -3.4, 2.4);
  g.add(f.object);
  put(g, P.wheel(M, 0, 0), 5.6, 3.6, 0.4);
  put(g, P.vat(M, 0, 0), 5.6, 0.6);
  g.add(block(3.2, 0, -1.6, 5.8, 0.4, -0.8, M.iron));
  const doors = { house: xz(at(home, home.door)) };
  doors.kitchen = doors.house;
  walkways(g, M, gt.inside, [doors.house]);
  // 铁砧在炉子右前方（forge 里树墩的位置 = 炉 + (1.8, 0.6)）：铁匠站在铁砧南边、面朝铁砧
  return result(w, d, g, {
    ...gt, doors,
    spots: { anvil: [-1.6, 3.9, -1.6, 3.0], bellows: [-5.3, 3.5, -5.3, 2.4], yard: [3.4, 2.4] },
    emitters: [{ kind: 'smoke', pos: at(home, home.chimney) }, { kind: 'smoke', pos: new THREE.Vector3(-3.4, 3.4, 2.2), forge: true }, { kind: 'ember', pos: f.fire.clone() }],
    windows: windowsOf(home),
    trees: [['poplar', w / 2 - 1.2, -d / 2 + 1.2, { seed: 51 }]],
    animals: [{ kind: 'dog', role: 'dog', area: [2, 0.8, 6, 4.4], owner: 'zhang_tiechui' }],
  });
}

// ---------------------------------------------------------------- 赵家豆腐坊

function tofu(M) {
  const w = 13, d = 11, g = new THREE.Group();
  ground(g, M, w, d, M.street);
  g.add(enclose(M, rect(w, d), { gateX: 0, gateW: 3, h: 1.9, mat: 'adobe' }));
  const gt = withGate(g, M, 'wall', 0, d);
  const home = house(M, { w: 10, d: 4.3, h: 3.0, wall: 'adobe', rise: 1.4, chimney: true });
  put(g, home.object, 0, -d / 2 + 3.0);
  const mill = P.millstone(M, -3.2, 1.6);
  g.add(mill);
  const st = P.stove(M, 3.6, 0.9);
  g.add(st.object);
  for (const [x, z] of [[5.4, -0.6], [5.4, 0.6], [1.8, -0.8]]) put(g, P.vat(M, 0, 0, 0.42), x, z);
  g.add(block(1.0, 0, 3.0, 2.6, 0.75, 4.0, M.wood)); // 豆腐板
  put(g, P.shed(M, 0, 0, 2.4, 2.0), 5.0, 4.2); // 驴棚
  const doors = { house: xz(at(home, home.door)) };
  doors.kitchen = doors.house;
  walkways(g, M, gt.inside, [doors.house]);
  return result(w, d, g, {
    ...gt, doors,
    spots: { stove: [3.6, 2.1, 3.6, 0.9], mill: [-3.2, 4.6, -3.2, 1.6], yard: [0.6, 3.0], feedChickens: [-1.4, 4.6] },
    windows: windowsOf(home),
    emitters: [{ kind: 'smoke', pos: at(home, home.chimney) }, { kind: 'steam', pos: st.steam.clone() }],
    spinners: [{ object: mill, id: 'mill' }],
    animals: [
      { kind: 'donkey', role: 'donkey', mill: { cx: -3.2, cz: 1.6, r: 2.5 }, stall: [5.0, 4.0], area: [4.4, 3.6, 5.6, 4.6] },
      ...chickens([-5.6, 3.2, -1.2, 4.8], [-4.8, 4.6]).slice(0, 2),
    ],
    trees: [['jujube', w / 2 - 1.6, -1.6, { seed: 61 }]],
  });
}

// ---------------------------------------------------------------- 村口：戏台 + 老槐树 + 剃头小屋

function square(M) {
  const w = 18, d = 12, g = new THREE.Group();
  ground(g, M, w, d, M.threshing, 0.4);
  put(g, P.stage(M, 0, 0), 3.5, -d / 2 + 3.0);
  g.add(block(-7.6, 0, -1.4, -2.8, 0.45, 3.4, M.rubble)); // 槐树下的石台
  put(g, P.stoneTable(M, 0, 0), -0.4, 3.6);
  // 戏台东边的火塘：篝火晚上围着它坐；两条石凳、几块石头当凳子
  const PIT = [6.4, 2.9];
  const pit = P.firePit(M);
  put(g, pit.object, ...PIT);
  put(g, P.bench(M, 0, 0), 6.4, 4.7);
  put(g, P.bench(M, 0, 0), 8.2, 2.9, Math.PI / 2);
  const ring = [];
  for (const deg of [135, 180, 215, 250, 290, 325, 40]) {
    const a = (deg * Math.PI) / 180, x = PIT[0] + Math.cos(a) * 1.55, z = PIT[1] + Math.sin(a) * 1.55;
    put(g, P.seatStone(M, 0, 0), x, z);
    ring.push({ x, z, seat: 0.3 });
  }
  for (const [x, z] of [[5.85, 4.7], [6.95, 4.7], [8.2, 2.35], [8.2, 3.45]]) ring.push({ x, z, seat: 0.5, perch: true }); // 坐到石凳上
  const hut = house(M, { w: 3.4, d: 3, h: 2.6, wall: 'rubble', roof: 'flat', front: [{ k: 'door', x: -0.6 }, { k: 'windowLit', x: 0.9, y: 0.9, s: 0.6 }] });
  put(g, hut.object, -7.2, -3.4, Math.PI / 2);
  put(g, P.barberStand(M, 0, 0), -2.6, -4.4);
  // 剃头：客人坐挑子那头的凳子（脸朝场子），剃头匠站凳子后头；等着的在一边蹲着
  const barber = { stand: [-2.6, -4.4], chair: [-1.65, -4.4], look: [-1.65, 0], wait: [[-0.8, -2.3], [-1.7, -2.0], [-0.9, -3.2]] };
  // 集市：赶集那天摆出来的三个摊子（卖的站摊后，买的站摊前，每个摊前能站两个）
  const rot2 = (x, z, r) => [Math.cos(r) * x + Math.sin(r) * z, -Math.sin(r) * x + Math.cos(r) * z];
  const market = { stalls: [], buyers: [] };
  const marketSpots = {};
  [{ kind: 'tofu', x: 1.2, z: 4.8, rot: 0 }, { kind: 'goods', x: 3.9, z: 4.8, rot: 0 }, { kind: 'veg', x: -1.6, z: 0.9, rot: -Math.PI / 2 }].forEach((st, i) => {
    const obj = put(g, P.stall(M, st.kind), st.x, st.z, st.rot);
    market.stalls.push({ ...st, i, obj });
    const at = (dx, dz) => { const [ox, oz] = rot2(dx, dz, st.rot); return [st.x + ox, st.z + oz]; };
    marketSpots[`stall${i}_seller`] = [...at(0, 0.8), st.x, st.z];
    for (const [k, dx] of [['A', -0.45], ['B', 0.45]]) { marketSpots[`stall${i}_buy${k}`] = [...at(dx, -0.9), st.x, st.z]; market.buyers.push(`stall${i}_buy${k}`); }
  });
  // 吃过晚饭在大槐树下围一圈闲聊的位置
  const chatCenter = [-5.0, 4.9], chat = [], chatSpots = {};
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; chatSpots[`chat${i}`] = [chatCenter[0] + Math.cos(a) * 1.0, chatCenter[1] + Math.sin(a) * 0.95, ...chatCenter]; chat.push(`chat${i}`); }
  // 露天电影：幕布挂在戏台前沿，放映机摆在石桌上
  const screen = put(g, P.movieScreen(M), 3.5, -0.35);
  screen.position.y = 2.4;
  const projector = new THREE.Group();
  projector.add(block(-0.16, 0.84, -0.12, 0.16, 1.06, 0.12, M.iron), block(0.16, 0.9, -0.05, 0.26, 1.0, 0.05, M.ink));
  const lamp = new THREE.Sprite(M.haloSprite);
  lamp.scale.set(1.2, 1.2, 1);
  lamp.position.set(0.3, 0.95, 0);
  projector.add(lamp);
  projector.userData.dynamic = true;
  projector.visible = false;
  put(g, projector, -0.4, 3.6, Math.atan2(3.5 + 0.4, -0.35 - 3.6) - Math.PI / 2);
  const lanterns = [];
  for (const sx of [-1, 1]) { const l = lantern(M); l.position.set(3.5 + sx * 3.2, 4.0, -d / 2 + 5.4); g.add(l); lanterns.push(l); }
  // 傍晚的活动（戏、篝火、村会）用到的位置。台上的点 lift = 台面高
  // 台下围成弧：以台口为圆心一圈一圈往外排（小孩蹲最里圈），躲开火塘、石桌、场子边；相邻两人、两圈之间都隔 1 米
  const clear = (x, z) => Math.hypot(x - PIT[0], z - PIT[1]) > 2.0 && Math.hypot(x + 0.4, z - 3.6) > 1.5 && Math.abs(x) < w / 2 - 0.8 && z < d / 2 - 0.6 && z > 0.9;
  const arc = (r) => {
    const out = [], n = Math.floor(Math.PI * r);
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI, x = 3.5 + Math.cos(a) * r, z = -0.5 + Math.sin(a) * r; if (clear(x, z)) out.push([x, z]); }
    return out;
  };
  const front = arc(2.2);
  const rows = [...arc(3.2), ...arc(4.2), ...arc(5.2), ...arc(6.2)];
  // 篝火外圈站着的位置（石头、石凳坐满了以后）
  const outer = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, x = PIT[0] + Math.cos(a) * 2.5, z = PIT[1] + Math.sin(a) * 2.5; if (Math.abs(x) < w / 2 - 0.6 && z < d / 2 - 0.6 && z > 0.8) outer.push([x, z]); }
  const evening = {
    foot: [3.5, 1.1], top: [3.5, -0.9], lift: 1.3, // 台阶下、台口
    singer: [3.5, -1.15], speaker: [3.5, -1.2], chairL: [1.2, -1.75], chairR: [5.8, -1.75],
    face: [3.5, -2.4], pit: PIT, fire: pit.fire, ring: ring.map((_, i) => `ring${i}`), outer: outer.map((_, i) => `outer${i}`),
    front: front.map((_, i) => `front${i}`), rows: rows.map((_, i) => `row${i}`), elders: ['tableW', 'tableE', 'table'],
  };
  const evSpots = Object.fromEntries([...front.map((p, i) => [`front${i}`, p]), ...rows.map((p, i) => [`row${i}`, p]), ...ring.map((r, i) => [`ring${i}`, [r.x, r.z, ...PIT]]), ...outer.map((p, i) => [`outer${i}`, [...p, ...PIT]])]);
  return result(w, d, g, {
    gate: [0, d / 2 + 1.2], lanterns, evening, ringSeats: ring, barber, market, chat, chatCenter, screen, projector,
    discs: [[...PIT, 0.75]],
    spots: {
      ...evSpots, ...marketSpots, ...chatSpots, stageFoot: [3.5, 1.1, 3.5, -1],
      barberChair: [...barber.chair], barberWork: [-1.65, -5.15, ...barber.chair], ...Object.fromEntries(barber.wait.map((p, i) => [`barberWait${i}`, [...p, ...barber.chair]])),
      projector: [0.45, 4.5, 3.5, -0.6],
      tree: [-4.4, 4.2, -5.2, 1.0], tableW: [-1.6, 3.6, -0.4, 3.6], tableE: [0.8, 3.6, -0.4, 3.6], table: [-0.4, 4.9, -0.4, 3.6],
      stage: [3.5, 1.2, 3.5, 6], barber: [-2.6, -3.5, -2.6, -4.4], tofu: [-0.2, 5.5], // 卖豆腐的地方躲开集市的豆腐摊
    },
    playArea: [-2, 0.6, 7.6, 5.4],
    doors: { house: xz(at(hut, hut.door)) },
    windows: windowsOf(hut),
    trees: [['locust', -5.2, 1.0, { seed: 71, y: 0.45 }]],
    animals: [
      { kind: 'cat', role: 'cat', perches: [[-3.1, 0.45, 3.0], [-6.5, 0.45, 2.6]] },
      { kind: 'magpie', role: 'bird', perches: [[-6.5, 8.6, 1.0], [-3.8, 8.0, 0.2]] },
    ],
  });
}

// ---------------------------------------------------------------- 场院：碾子 + 麦秸垛

function threshing(M) {
  const w = 13, d = 6.5, g = new THREE.Group();
  ground(g, M, w, d, M.threshing, 0.2);
  const roller = P.roller(M, 0, 0);
  g.add(roller);
  for (const [x, z, r, h] of [[-5, -1.6, 1.3, 2.8], [5, -1.4, 1.2, 2.5], [4.6, 1.8, 0.9, 1.9]]) g.add(P.haystack(M, x, z, r, h));
  // 打场那天大伙儿围着碾子站的一圈（在牛走的圈外、躲开麦秸垛、不出场院）
  const stacks = [[-5, -1.6, 1.3], [5, -1.4, 1.2], [4.6, 1.8, 0.9]];
  const harvest = {};
  for (let x = -w / 2 + 0.6; x <= w / 2 - 0.6; x += 1.1) for (let z = -d / 2 + 0.5; z <= d / 2 - 0.5; z += 1.1) { // 1.1 米一格撒点（人是大头娃娃，挨太近看着挤）
    if (Math.hypot(x, z) > 3.8 && stacks.every(([sx, sz, r]) => Math.hypot(x - sx, z - sz) > r + 0.5)) harvest[`h${Object.keys(harvest).length}`] = [x, z, 0, 0];
  }
  return result(w, d, g, {
    gate: [-w / 2 - 1.2, 0.5],
    harvestSpots: Object.keys(harvest),
    spots: { work: [-4.6, 1.7, 0, 0], work2: [5.8, 0.4, 0, 0], center: [-3.6, 0.2, 0, 0], ...harvest },
    spinners: [{ object: roller, id: 'roller' }],
    roller: { cx: 0, cz: 0, r: 3.0 },
  });
}

/** 全部院落（本地坐标）。 */
export function buildCompounds(M) {
  return {
    headman: headman(M), school: school(M), shepherd: shepherd(M),
    farmA: farmA(M), farmB: farmB(M), farmC: farmC(M),
    carpenter: carpenter(M), store: store(M), doctor: doctor(M),
    smith: smith(M), tofu: tofu(M), square: square(M), threshing: threshing(M),
  };
}
