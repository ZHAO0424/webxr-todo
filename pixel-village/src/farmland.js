import * as THREE from 'three';
import { makeRng } from './pixel.js';
import { R } from './palette.js';
import { voxelGeometry } from './voxel.js';
import * as P from './props.js';

/*
 * 庄稼地。地形里每一级梯田已经定了种什么（crop：0 麦茬 / 1 谷子 / 2 玉米 / 3 白菜），
 * 这里把它们种成立体的体素庄稼（实例化渲染，几千棵也只占几个 draw call）：
 *   - 玉米：枯黄的秸秆 + 斜出的叶子 + 一个棒子（秋收，有的已经掰了）
 *   - 谷子：弯着腰的金黄谷穗；隔一级种红高粱
 *   - 白菜：一棵棵绿疙瘩
 *   - 麦茬地：一捆捆立着的麦个子
 *   - 南滩：赵家的大豆（豆腐坊的豆子就从这儿来）
 * 外加稻草人、看青棚。返回各家下地干活的点（fields）和羊吃草的坡（pasture）。
 */

const PV = 0.07; // 庄稼体素边长

function plant(fn, size) {
  const vox = new Map();
  fn((x, y, z, c) => vox.set(`${x},${y},${z}`, c));
  const [sx, sy, sz] = size;
  return voxelGeometry([-sx, 0, -sz], [sx + 1, sy, sz + 1], (x, y, z) => vox.has(`${x},${y},${z}`), (x, y, z) => vox.get(`${x},${y},${z}`), PV, [-PV / 2, 0, -PV / 2]);
}

const SHAPES = {
  corn: () => plant((v) => {
    for (let y = 0; y < 26; y++) v(0, y, 0, y % 6 === 0 ? R.wheat[2] : R.wheat[3]);
    for (const [y, dx, dz] of [[8, 1, 0], [12, -1, 0], [16, 0, 1], [20, 0, -1]]) for (let k = 1; k < 5; k++) v(dx * k, y - Math.floor(k / 2), dz * k, k > 2 ? R.wheat[2] : R.harvest[3]);
    for (let y = 10; y < 14; y++) v(1, y, 1, R.gold[3]);
    v(1, 14, 1, R.wheat[4]);
  }, [5, 27, 5]),
  sorghum: () => plant((v) => {
    for (let y = 0; y < 28; y++) v(0, y, 0, R.harvest[2]);
    for (const [y, dx] of [[9, 1], [15, -1]]) for (let k = 1; k < 4; k++) v(dx * k, y - Math.floor(k / 2), 0, R.harvest[3]);
    for (let y = 26; y < 32; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (Math.abs(x) + Math.abs(z) < 2 || y < 30) v(x, y, z, (x + y + z) % 3 ? R.red[2] : R.red[1]);
  }, [4, 33, 4]),
  millet: () => plant((v) => {
    for (let y = 0; y < 13; y++) v(0, y, 0, R.harvest[2]);
    for (let k = 0; k < 6; k++) { v(1 + Math.floor(k / 2), 13 - k, 0, R.gold[3]); v(1 + Math.floor(k / 2), 13 - k, 1, k % 2 ? R.gold[4] : R.gold[2]); }
    v(-1, 6, 0, R.grass[3]); v(-2, 5, 0, R.grass[3]);
  }, [4, 15, 3]),
  cabbage: () => plant((v) => {
    for (let y = 0; y < 5; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const r = Math.hypot(x, (y - 2) * 1.2, z);
      if (r < 3.3) v(x, y, z, y > 3 ? R.cabbage[4] : r > 2.6 ? R.cabbage[2] : R.cabbage[3]);
    }
  }, [4, 6, 4]),
  soy: () => plant((v) => {
    for (let y = 0; y < 7; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (Math.hypot(x, y - 3.5, z) < 3 && (x + y * 3 + z) % 4) v(x, y, z, (x + z + y) % 3 ? R.harvest[2] : R.brown[3]);
    }
  }, [3, 8, 3]),
  sheaf: () => plant((v) => {
    for (let y = 0; y < 11; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (y < 9 || (x === 0 && z === 0)) v(x, y, z, y === 4 ? R.wheat[1] : (x + z + y) % 3 ? R.wheat[3] : R.wheat[2]);
    for (const [x, z] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) for (let y = 7; y < 11; y++) v(x, y, z, R.wheat[4]);
  }, [3, 12, 3]),
};

/**
 * terrain.fieldCells: [{ x, z, h, crop }]（0.5 米一格）。nav：放好之后给庄稼地以外的东西让路。
 * 返回 { object（含 InstancedMesh，不参与合批）, fields: { fieldW, fieldE, fieldS }, pasture, extras（要算进障碍的道具）}。
 */
export function buildFarmland(M, terrain, nodes) {
  const rand = makeRng(404);
  const geos = Object.fromEntries(Object.entries(SHAPES).map(([k, f]) => [k, f()]));
  const lists = Object.fromEntries(Object.keys(SHAPES).map((k) => [k, []]));
  for (const c of terrain.fieldCells) {
    const terraceIdx = Math.round(c.h / 1.2);
    if (c.crop === 0) { if (rand() < 0.07) lists.sheaf.push(c); continue; }
    if (c.crop === 3) { lists.cabbage.push(c); continue; }
    const row = Math.floor((c.z + 100) / 0.5) % 2; // 隔一行留一道垄沟
    if (row === 1 && rand() < 0.8) continue;
    if (c.crop === 2) { if (rand() < 0.85) lists.corn.push(c); continue; }
    lists[terraceIdx % 2 ? 'sorghum' : 'millet'].push(c);
  }
  // 南滩：赵家的大豆地
  for (let x = -26; x < -6; x += 0.5) for (let z = 33.8; z < 35.6; z += 0.5) if (terrain.typeAt(x, z) === 'grass' && rand() < 0.75) lists.soy.push({ x, z, h: terrain.heightAt(x, z) });

  const g = new THREE.Group();
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
    g.add(mesh);
  }

  // 稻草人、看青棚
  const extras = new THREE.Group();
  const far = (c) => Object.values(nodes).every((n) => Math.hypot(n.x - c.x, n.z - c.z) > 4);
  const picks = terrain.fieldCells.filter((c, i) => i % 23 === 0 && far(c));
  for (let i = 0; i < 5 && picks.length; i++) {
    const c = picks.splice(Math.floor(rand() * picks.length), 1)[0];
    extras.add(P.scarecrow(M, c.x, c.z, rand() * 6).translateY(c.h));
  }
  // 看青棚要一块平地：在地头附近找一处 3x3 米都一样高的地方
  for (const [x0, z0] of [[-40, 4], [39, -9]]) {
    let spot = null;
    for (let r = 0; r < 8 && !spot; r += 0.5) for (let a = 0; a < 12 && !spot; a++) {
      const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r, h = terrain.heightAt(x, z);
      const flat = [-1.5, 0, 1.5].every((dx) => [-1.2, 0, 1.2].every((dz) => terrain.heightAt(x + dx, z + dz) === h && terrain.typeAt(x + dx, z + dz) !== 'path'));
      if (flat) spot = [x, z, h];
    }
    if (spot) extras.add(P.fieldHut(M, spot[0], spot[1], 0).translateY(spot[2]));
  }

  // 下地干活的点：离路网节点 14 米以内的庄稼格
  const near = (n, r = 14) => terrain.fieldCells.filter((c) => Math.hypot(c.x - n.x, c.z - n.z) < r && c.crop !== 0).map((c) => [c.x, c.z]);
  const fields = {
    fieldW: near(nodes.fieldW),
    fieldE: near(nodes.fieldE),
    fieldS: lists.soy.filter((_, i) => i % 3 === 0).map((c) => [c.x, c.z]),
  };
  // 羊吃草的坡：村西的荒草坡
  const pasture = [];
  for (let x = -44; x < -30; x += 1) for (let z = -14; z < 6; z += 1) if (terrain.typeAt(x, z) === 'grass') pasture.push([x, z]);

  return { object: g, extras, fields, pasture };
}
