import * as THREE from 'three';
import { makeRng } from './pixel.js';
import { R } from './palette.js';
import { voxelGeometry } from './voxel.js';
import * as PROPS from './props.js';
import { tagged } from './things.js';
import { inSoy } from './layout.js';
import { season, is } from './season.js';

const P = tagged(PROPS); // 建出来的物件都带上 userData.thing，点它能看卡片

/*
 * 庄稼地。地形里每一级梯田已经定了种什么（crop：0 割完的茬地 / 1 谷子 / 2 玉米 / 3 白菜），
 * 这里把它们种成立体的体素庄稼（实例化渲染，几千棵也只占几个 draw call）。按垄种：垄沿着梯田（东西向），
 * 一米两垄、留一道垄沟，高秆的一米一丛，地皮（terrain.js 的 furrow / stubbleW）的垄和它对得上：
 *   - 谷子：三棵一丛，弯着腰的金黄谷穗；隔一级种红高粱（两棵一丛，长叶子）
 *   - 玉米：秆子、宽叶子都干成灰黄，腰上一个包皮的棒子
 *   - 茬地：谷个子 / 麦个子一行行错开立着
 *   - 白菜：一棵棵绿疙瘩
 *   - 村西坡最高那几级：赵家的大豆（豆腐坊的豆子就从这儿来）
 * 外加稻草人、看青棚。返回各家下地干活的点（fields）和羊吃草的坡（pasture）。
 * 西沟的梯田用同一套庄稼（fieldCrops）。
 */

const PV = 0.07; // 庄稼体素边长

function plant(fn, size) {
  const vox = new Map();
  fn((x, y, z, c) => vox.set(`${x},${y},${z}`, c));
  const [sx, sy, sz] = size;
  return voxelGeometry([-sx, 0, -sz], [sx + 1, sy, sz + 1], (x, y, z) => vox.has(`${x},${y},${z}`), (x, y, z) => vox.get(`${x},${y},${z}`), PV, [-PV / 2, 0, -PV / 2]);
}
const leaf = (v, x, y, z, dx, dz, len, c) => { for (let k = 1; k <= len; k++) v(x + dx * k, y - Math.floor((k * k) / 6), z + dz * k, c); }; // 一片往外耷拉的叶子

/** 地里的庄稼：一丛一个实例。 */
const CROPS = {
  millet: (green) => plant((v) => { // 谷子：三棵一丛，金黄的谷穗沉甸甸地弯下来（夏天穗子还是青的，没弯那么低）
    for (const [ox, oz, h, dx, dz] of [[-2, 0, 13, -1, 0], [1, -2, 14, 0, -1], [1, 2, 12, 1, 1]]) {
      for (let y = 0; y < h; y++) v(ox, y, oz, y < h * 0.45 || green ? R.grass[2] : R.harvest[3]);
      leaf(v, ox, Math.floor(h * 0.4), oz, dz || 1, -dx || 1, 3, R.grass[3]);
      for (let k = 0; k < (green ? 4 : 6); k++) {
        const x = ox + Math.round(dx * k * 0.5), y = h - Math.floor(k * 0.8), z = oz + Math.round(dz * k * 0.5);
        v(x, y, z, green ? (k % 2 ? R.cabbage[3] : R.cabbage[4]) : k % 2 ? R.gold[3] : R.gold[4]); v(x, y - 1, z, green ? R.cabbage[2] : R.gold[2]);
      }
    }
  }, [5, 16, 5]),
  sorghum: (green) => plant((v) => { // 高粱：两棵一丛，秆高叶长，顶上一穗红高粱（夏天穗子青绿）
    for (const [ox, oz, h] of [[-1, 0, 27], [2, 1, 25]]) {
      for (let y = 0; y < h; y++) v(ox, y, oz, green ? R.grass[2] : R.harvest[2]);
      [[1, 0, 8], [-1, 0, 12], [0, 1, 16], [0, -1, 20]].forEach(([dx, dz, y], i) => leaf(v, ox, y, oz, dx, dz, 5, i % 2 ? (green ? R.grass[4] : R.harvest[3]) : R.grass[3]));
      for (let y = h; y < h + 6; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (Math.abs(x) + Math.abs(z) < 2 || (y > h && y < h + 4)) v(ox + x, y, oz + z, green ? ((x + y + z) % 3 ? R.cabbage[3] : R.cabbage[2]) : (x + y + z) % 3 ? R.red[2] : R.red[1]);
    }
  }, [8, 34, 8]),
  corn: (green) => plant((v) => { // 玉米：秆子和宽叶子都干成了灰黄，腰上挂着一个包着皮的棒子，顶上一撮雄穗（夏天是绿的，棒子顶上吐着红缨）
    const K = green ? [R.grass[1], R.grass[2], R.grass[3], R.grass[4], R.cabbage[4]] : R.khaki;
    for (const [ox, oz, h, d] of [[-1, -1, 28, 1], [2, 1, 26, -1]]) {
      for (let y = 0; y < h; y++) { v(ox, y, oz, y % 5 === 0 ? K[2] : K[3]); if (y < 4) v(ox + 1, y, oz, K[2]); }
      [[1, 0, 7], [-1, 0, 11], [0, 1, 15], [0, -1, 19], [1, 1, 23]].forEach(([dx, dz, y], i) => { // 宽叶子：两排体素
        leaf(v, ox, y, oz, dx, dz, 6, i % 2 ? K[4] : K[3]);
        leaf(v, ox + (dz ? 1 : 0), y - 1, oz + (dx ? 1 : 0), dx, dz, 5, K[2]);
      });
      for (let y = 11; y < 16; y++) { v(ox + d, y, oz, green ? R.cabbage[3] : R.wheat[4]); v(ox + d, y, oz + 1, green ? R.cabbage[4] : y > 13 ? R.wheat[3] : R.wheat[4]); }
      v(ox + d, 16, oz, green ? R.red[2] : R.gold[3]);
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1]]) v(ox + dx, h + (dx || dz ? 0 : 1), oz + dz, green ? R.wheat[3] : R.khaki[4]); // 雄穗
    }
  }, [9, 31, 9]),
  wheat: (green) => plant((v) => { // 麦子：一丛七八根，穗子朝上（夏天熟成金黄；春天是没抽穗的青苗，矮）
    const h = green ? 6 : 11;
    for (const [ox, oz] of [[-2, -1], [0, -2], [2, -1], [-1, 1], [1, 1], [0, 0], [-2, 2], [2, 2]]) {
      for (let y = 0; y < h; y++) v(ox, y, oz, green ? (y > h - 3 ? R.cabbage[4] : R.cabbage[3]) : y < 3 ? R.wheat[2] : R.wheat[3]);
      if (!green) { v(ox, h, oz, R.gold[4]); v(ox, h + 1, oz, R.gold[3]); v(ox, h + 2, oz, R.wheat[4]); }
    }
  }, [3, 14, 3]),
  seedling: () => plant((v) => { // 刚出土的苗：两三片小叶子
    v(0, 0, 0, R.cabbage[2]); v(0, 1, 0, R.cabbage[3]); v(-1, 2, 0, R.cabbage[4]); v(1, 2, 0, R.cabbage[3]); v(0, 2, 1, R.cabbage[4]);
  }, [2, 4, 2]),
  shock: () => plant((v) => { // 谷个子 / 麦个子：几捆割下的庄稼头朝上靠成一个尖垛，腰上一道草绳
    for (let y = 0; y < 15; y++) {
      const r = 3.6 - y * 0.2;
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        if (Math.hypot(x, z) > r) continue;
        v(x, y, z, y === 8 ? R.wheat[1] : Math.floor((Math.atan2(z, x) + Math.PI) * 2.5) % 2 ? R.wheat[3] : R.wheat[2]);
      }
    }
    for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) { v(x * 2, 15, z * 2, R.gold[3]); v(x * 2, 14, z * 2, R.gold[2]); v(x, 16, z, R.gold[4]); }
  }, [5, 17, 5]),
};

/**
 * 按垄种上庄稼：cells 是 terrain.fieldCells（crop 3 不管，由调用的人种白菜或者留麦苗地皮）。
 * 返回 InstancedMesh 组（userData.count：各样多少丛）。
 */
export function fieldCrops(M, cells, rand) {
  // 季节：秋天是熟庄稼 + 茬地里的谷个子；夏天谷子高粱玉米还青着，茬地那几级是正在收的麦子；春天只有苗；冬天地里没东西
  // 随机数：秋天和原来一样用调用方的 rand；别的季节用自己的，再把秋天会用掉的那些个数从 rand 里空转掉——
  // 调用方后面接着用 rand 摆的东西（西沟的树、石头）四季都在同一个地方
  const S = season();
  const autumnUse = S === 'autumn' ? 0 : Object.values(cropLists(cells, 'autumn')).reduce((n, l) => n + l.length * 5, 0);
  const lists = cropLists(cells, S);
  const r = S === 'autumn' ? rand : makeRng(Math.floor(rand() * 1e9) + 1);
  for (let i = 0; i < autumnUse - 1; i++) rand();
  const g = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(CROPS[k](k === 'wheat' ? S === 'spring' : S === 'summer'), M.voxel, list.length);
    list.forEach((c, i) => {
      const sc = 0.9 + r() * 0.2;
      q.setFromEuler(e.set(0, Math.floor(r() * 4) * (Math.PI / 2), 0));
      mesh.setMatrixAt(i, m4.compose(p.set(c.x + (r() - 0.5) * 0.12, c.h, c.z + (r() - 0.5) * 0.08), q, s.set(sc, sc * (0.92 + r() * 0.16), sc)));
    });
    mesh.castShadow = !['millet', 'wheat', 'seedling'].includes(k);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.userData.count = Object.fromEntries(Object.entries(lists).map(([k, l]) => [k, l.length]));
  return g;
}

/** 这个季节地里种着什么：{ 庄稼名: [格子] }。 */
function cropLists(cells, S) {
  const lists = { millet: [], sorghum: [], corn: [], shock: [], wheat: [], seedling: [] };
  const shockRow = (ix, iz) => iz % 4 === 1 && (ix + (Math.floor(iz / 4) % 2) * 3) % 6 === 0; // 一行行、错开立着
  if (S !== 'winter') for (const c of cells) {
    const ix = Math.floor((c.x + 200) / 0.5), iz = Math.floor((c.z + 100) / 0.5);
    if (c.crop === 3) continue;
    if (c.crop === 0) {
      if (S === 'autumn') { if (shockRow(ix, iz)) lists.shock.push(c); }
      else if (S === 'summer') { // 麦收：一片片割过了，立着麦个子；没割的还是一片金黄
        if (Math.sin(c.x * 0.13 + c.z * 0.31) > 0.35) { if (shockRow(ix, iz)) lists.shock.push(c); } else if (iz % 2 === 0) lists.wheat.push(c);
      } else if (iz % 2 === 0 && ix % 2 === 0) lists.wheat.push(c); // 春天：返青的冬小麦
      continue;
    }
    if (iz % 2) continue; // 垄沟
    if (S === 'spring') { if (ix % 2 === 0) lists.seedling.push(c); continue; } // 刚出苗
    const kind = c.crop === 2 ? 'corn' : Math.round(c.h / 1.2) % 2 ? 'sorghum' : 'millet';
    if (kind !== 'millet' && ix % 2) continue; // 高秆的一米一丛，垄和地皮露得出来
    lists[kind].push(c);
  }
  return lists;
}

const SHAPES = { // 村里另有的：白菜、大豆
  cabbage: () => plant((v) => {
    for (let y = 0; y < 5; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const r = Math.hypot(x, (y - 2) * 1.2, z);
      if (r < 3.3) v(x, y, z, y > 3 ? R.cabbage[4] : r > 2.6 ? R.cabbage[2] : R.cabbage[3]);
    }
  }, [4, 6, 4]),
  soy: (green) => plant((v) => { // 大豆：秋天枯黄的豆棵挂着豆荚；夏天一棵棵绿的
    for (let y = 0; y < 7; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (Math.hypot(x, y - 3.5, z) < 3 && (x + y * 3 + z) % 4) v(x, y, z, green ? ((x + z + y) % 3 ? R.cabbage[3] : R.cabbage[2]) : (x + z + y) % 3 ? R.harvest[2] : R.brown[3]);
    }
  }, [3, 8, 3]),
};

/**
 * terrain.fieldCells: [{ x, z, h, crop }]（0.5 米一格）。nav：放好之后给庄稼地以外的东西让路。
 * 返回 { object（含 InstancedMesh，不参与合批）, fields: { fieldW, fieldE, fieldSoy }, pasture, extras（要算进障碍的道具）}。
 */
export function buildFarmland(M, terrain, nodes) {
  const rand = makeRng(404);
  const geos = Object.fromEntries(Object.entries(SHAPES).map(([k, f]) => [k, f()]));
  const soyCells = terrain.fieldCells.filter((c) => inSoy(c.x, c.z));
  const g = fieldCrops(M, terrain.fieldCells.filter((c) => !inSoy(c.x, c.z)), rand);
  // 赵家（豆腐坊）的大豆地：村西坡最高的几级梯田，一垄一垄的
  // 冬天菜收了、豆子割了；春天都是苗（换成小苗的样子）
  const lists = { cabbage: terrain.fieldCells.filter((c) => c.crop === 3 && !inSoy(c.x, c.z)), soy: soyCells.filter((c) => Math.floor((c.z + 100) / 0.5) % 2 === 0 || rand() < 0.3) };
  if (is('spring')) { geos.cabbage = geos.soy = CROPS.seedling(); }
  if (is('summer')) geos.soy = SHAPES.soy(true);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geos[k], M.voxel, list.length);
    list.forEach((c, i) => {
      const sc = 0.85 + rand() * 0.3;
      p.set(c.x + (rand() - 0.5) * 0.25, c.h, c.z + (rand() - 0.5) * 0.25);
      q.setFromEuler(e.set(0, Math.floor(rand() * 8) * (Math.PI / 4), 0));
      m4.compose(p, q, s.set(sc, sc * (0.9 + rand() * 0.2), sc));
      mesh.setMatrixAt(i, m4);
    });
    mesh.castShadow = k !== 'cabbage' && k !== 'soy';
    mesh.receiveShadow = true;
    if (!is('winter')) g.add(mesh); // 冬天菜收了、豆子割了（随机数照样用掉，后面的稻草人位置四季一样）
  }

  // 稻草人、看青棚
  const extras = new THREE.Group();
  const far = (c) => Object.values(nodes).every((n) => Math.hypot(n.x - c.x, n.z - c.z) > 4);
  const picks = terrain.fieldCells.filter((c, i) => i % 23 === 0 && far(c));
  for (let i = 0; i < 5 && picks.length; i++) {
    const c = picks.splice(Math.floor(rand() * picks.length), 1)[0], rot = rand() * 6;
    if (is('summer', 'autumn')) extras.add(P.scarecrow(M, c.x, c.z, rot).translateY(c.h)); // 稻草人、看青棚：庄稼快熟的时候才有
  }
  // 看青棚要一块平地：在地头附近找一处 3x3 米都一样高的地方
  for (const [x0, z0] of [[-40, 4], [39, -9]]) {
    let spot = null;
    for (let r = 0; r < 8 && !spot; r += 0.5) for (let a = 0; a < 12 && !spot; a++) {
      const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r, h = terrain.heightAt(x, z);
      const flat = [-1.5, 0, 1.5].every((dx) => [-1.2, 0, 1.2].every((dz) => terrain.heightAt(x + dx, z + dz) === h && terrain.typeAt(x + dx, z + dz) !== 'path'));
      if (flat) spot = [x, z, h];
    }
    if (spot && is('summer', 'autumn')) extras.add(P.fieldHut(M, spot[0], spot[1], 0).translateY(spot[2]));
  }

  // 下地干活的点：离路网节点 14 米以内的庄稼格
  const near = (n, ok = (c) => c.crop !== 0, r = 14) => terrain.fieldCells.filter((c) => Math.hypot(c.x - n.x, c.z - n.z) < r && ok(c) && !inSoy(c.x, c.z)).map((c) => [c.x, c.z]);
  const fields = {
    fieldW: near(nodes.fieldW),
    fieldE: near(nodes.fieldE),
    // 按庄稼分：割麦（夏天，茬地那几级是麦子）、割谷子（秋天）、掰玉米（秋天）
    wheatW: near(nodes.fieldW, (c) => c.crop === 0, 18), wheatE: near(nodes.fieldE, (c) => c.crop === 0, 18),
    milletW: near(nodes.fieldW, (c) => c.crop === 1), milletE: near(nodes.fieldE, (c) => c.crop === 1),
    cornW: near(nodes.fieldW, (c) => c.crop === 2, 18), cornE: near(nodes.fieldE, (c) => c.crop === 2, 18),
    fieldSoy: lists.soy.filter((_, i) => i % 3 === 0).map((c) => [c.x, c.z]),
  };
  // 羊吃草的坡：村西的荒草坡
  const pasture = [];
  for (let x = -44; x < -30; x += 1) for (let z = -14; z < 6; z += 1) if (terrain.typeAt(x, z) === 'grass') pasture.push([x, z]);

  return { object: g, extras, fields, pasture };
}
