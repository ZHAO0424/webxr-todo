import * as THREE from 'three';
import { block, prism, makeRng } from './pixel.js';
import { R } from './palette.js';
import { voxelGeometry } from './voxel.js';
import { BOUNDS } from './layout.js';

/*
 * 路边景观。
 *   - 野花野草（实例化体素，几千棵只占几个 draw call，不参与合批）：沿着石阶路两边的草坡长——
 *     狗尾巴草、野菊、紫菀、蒲公英、一丛丛草、散落的碎石。离路越近越密，路面、院子平台、水里不长。
 *   - 几样村里常见的小物件（静态，参与合批和导航）：村口桥头的土地庙、路口的石敢当、院门两边的花盆。
 */

const PV = 0.06;

function plant(fn, size) {
  const vox = new Map();
  fn((x, y, z, c) => vox.set(`${x},${y},${z}`, c));
  const [sx, sy, sz] = size;
  return voxelGeometry([-sx, 0, -sz], [sx + 1, sy, sz + 1], (x, y, z) => vox.has(`${x},${y},${z}`), (x, y, z) => vox.get(`${x},${y},${z}`), PV, [-PV / 2, 0, -PV / 2]);
}

const SHAPES = {
  foxtail: () => plant((v) => { // 狗尾巴草：三根斜着的秆，顶上毛茸茸的穗子往下垂
    for (const [dx, dz, h] of [[1, 0, 9], [-1, 1, 8], [0, -1, 10]]) {
      for (let y = 0; y < h; y++) v(Math.round((dx * y) / 5), y, Math.round((dz * y) / 5), R.grass[2]);
      const tx = Math.round((dx * h) / 5) + dx, tz = Math.round((dz * h) / 5) + dz;
      for (let k = 0; k < 3; k++) v(tx, h - k, tz, k === 1 ? R.wheat[3] : R.wheat[2]);
    }
  }, [4, 11, 4]),
  daisy: () => plant((v) => { // 野菊：一小丛绿叶，上面点点黄花
    for (let y = 0; y < 3; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.abs(x) + Math.abs(z) + y < 4) v(x, y, z, (x + z + y) % 2 ? R.grass[2] : R.grass[3]);
    for (const [x, z] of [[-1, 0], [1, 1], [0, -1], [2, -1], [-2, 1]]) { v(x, 3, z, R.gold[3]); v(x, 4, z, R.gold[4]); }
  }, [3, 6, 3]),
  aster: () => plant((v) => { // 紫菀 / 野豌豆花：高一点的秆，顶上一簇粉紫
    for (const [x, z, h] of [[0, 0, 6], [1, 1, 5], [-1, 1, 4]]) {
      for (let y = 0; y < h; y++) v(x, y, z, R.grass[1]);
      v(x, h, z, R.pink[3]); v(x + 1, h - 1, z, R.pink[2]); v(x, h - 1, z + 1, R.pink[2]);
    }
  }, [3, 8, 3]),
  dandelion: () => plant((v) => { // 蒲公英：贴地的叶子 + 一个白绒球
    for (const [x, z] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, 1], [1, -1]]) v(x, 0, z, R.grass[2]);
    for (let y = 0; y < 4; y++) v(0, y, 0, R.grass[1]);
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 4; y <= 6; y++) if (Math.abs(x) + Math.abs(z) + Math.abs(y - 5) < 3) v(x, y, z, R.white[3]);
  }, [3, 7, 3]),
  tuft: () => plant((v) => { // 一丛草
    for (const [x, z, h] of [[0, 0, 5], [1, 0, 4], [-1, 1, 4], [0, -1, 3], [1, 1, 3], [-1, -1, 2]]) for (let y = 0; y < h; y++) v(x, y, z, y > h - 2 ? R.grass[3] : R.grass[2]);
  }, [2, 6, 2]),
  pebbles: () => plant((v) => { // 碎石
    for (const [x, z, h] of [[0, 0, 2], [2, 1, 1], [-2, -1, 1], [1, -2, 1]]) for (let y = 0; y < h; y++) { v(x, y, z, R.stone[2]); v(x + 1, y, z, R.stone[3]); }
  }, [3, 3, 3]),
};
const WEIGHTS = [['tuft', 0.3], ['foxtail', 0.2], ['daisy', 0.18], ['aster', 0.12], ['dandelion', 0.1], ['pebbles', 0.1]];

/** 土地庙：一人高的小砖龛，坡顶，里面红底，门前一个香炉。 */
function shrine(M) {
  const g = new THREE.Group();
  g.add(block(-0.75, 0, -0.55, 0.75, 0.35, 0.55, M.stone)); // 台基
  g.add(block(-0.6, 0.35, -0.45, 0.6, 1.35, -0.3, M.brick), block(-0.6, 0.35, -0.45, -0.45, 1.35, 0.4, M.brick), block(0.45, 0.35, -0.45, 0.6, 1.35, 0.4, M.brick));
  g.add(block(-0.45, 0.4, -0.3, 0.45, 1.3, -0.28, M.redwood, { outline: false })); // 红底
  g.add(block(-0.15, 0.4, -0.25, 0.15, 0.8, -0.05, M.gold)); // 神像
  for (const s of [1, -1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.75), M.roof);
    slab.position.set(0, 1.55, s * 0.2);
    slab.rotation.x = s * 0.55;
    g.add(slab);
  }
  g.add(block(-0.8, 1.68, -0.06, 0.8, 1.8, 0.06, M.ridge));
  const burner = prism(0.14, 0.11, 0.18, M.iron, 6);
  burner.position.set(0, 0.44, 0.38);
  g.add(burner);
  return g;
}

/** 石敢当：路口立的一块石碑，顶上一抹红。 */
function stoneTablet(M) {
  const g = new THREE.Group();
  g.add(block(-0.3, 0, -0.18, 0.3, 0.15, 0.18, M.stone), block(-0.2, 0.15, -0.08, 0.2, 1.05, 0.08, M.stone), block(-0.2, 0.95, -0.09, 0.2, 1.05, 0.09, M.redCloth, { outline: false }));
  return g;
}

/** 花盆：陶盆 + 一丛花。 */
function flowerPot(M, flowerGeo) {
  const g = new THREE.Group();
  const pot = prism(0.2, 0.15, 0.3, M.brick, 8);
  pot.position.y = 0.15;
  const f = new THREE.Mesh(flowerGeo, M.voxel);
  f.position.y = 0.3;
  f.scale.setScalar(1.3);
  g.add(pot, f);
  return g;
}

/**
 * terrain：地形接口；nodes：路网节点；C：院落（已经摆好位置）。
 * 返回 { flora（InstancedMesh 组，不合批）, props（静态，参与合批和导航）}。
 */
export function buildRoadside(M, terrain, nodes, C) {
  const rand = makeRng(909);
  const geos = Object.fromEntries(Object.entries(SHAPES).map(([k, f]) => [k, f()]));
  const props = new THREE.Group();

  // 平地：w × d 范围内高度一样、不是路 / 水 / 庄稼地
  const flatAt = (x, z, w, d) => {
    const h = terrain.heightAt(x, z);
    for (const dx of [-w / 2, 0, w / 2]) for (const dz of [-d / 2, 0, d / 2]) {
      const t = terrain.typeAt(x + dx, z + dz);
      if (terrain.heightAt(x + dx, z + dz) !== h || t === 'path' || t === 'stream' || t === 'field' || terrain.isWater(x + dx, z + dz)) return null;
    }
    return h;
  };
  const near = (x0, z0, w, d, r = 4) => { // 在 (x0, z0) 附近找一块平地
    for (let rr = 0.5; rr <= r; rr += 0.5) for (let a = 0; a < 16; a++) {
      const x = x0 + Math.cos((a / 16) * Math.PI * 2) * rr, z = z0 + Math.sin((a / 16) * Math.PI * 2) * rr;
      const h = flatAt(x, z, w, d);
      if (h !== null) return [x, z, h];
    }
    return null;
  };
  const place = (obj, spot, faceX, faceZ) => {
    if (!spot) return;
    const [x, z, h] = spot;
    obj.position.set(x, h, z);
    obj.rotation.y = Math.atan2(faceX - x, faceZ - z);
    props.add(obj);
  };
  const taken = [];
  // 土地庙：桥头路边，脸朝路
  const bn = nodes.bridgeN;
  const sh = near(bn.x + 3.2, bn.z - 0.5, 2.0, 1.6);
  place(shrine(M), sh, bn.x, bn.z);
  if (sh) taken.push([sh[0], sh[1], 1.6]);
  // 石敢当：几个丁字路口，脸朝来路
  for (const [n, dx, dz] of [['mid', -1.5, -1.3], ['well', -1.6, -1.2], ['e1', 1.4, -1.4], ['w1', 1.5, -1.3]]) {
    const nd = nodes[n];
    const s = near(nd.x + dx, nd.z + dz, 0.8, 0.6, 2.5);
    place(stoneTablet(M), s, nd.x, nd.z);
    if (s) taken.push([s[0], s[1], 0.8]);
  }
  // 院门两边的花盆（墙外脚下，门前平台的两侧）
  for (const id of ['headman', 'school', 'store', 'doctor', 'tofu', 'farmB']) {
    const c = C[id];
    if (!c?.gates.length) continue;
    const [gx] = c.gate;
    for (const s of [-1, 1]) {
      const [x, z] = c.at(gx + s * 1.75, c.d / 2 + 0.4);
      const h = terrain.walkAt(x, z);
      if ([[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, 0]].some(([dx, dz]) => Math.abs(terrain.walkAt(x + dx, z + dz) - c.level) > 0.05 || terrain.typeAt(x + dx, z + dz) === 'path')) continue; // 四角都在院子平台高度上
      const pot = flowerPot(M, geos[s < 0 ? 'daisy' : 'aster']);
      pot.position.set(x, h, z);
      props.add(pot);
    }
  }

  // 野花野草：草坡上离路 0.4–2 米的地方，越近越密
  const lists = Object.fromEntries(Object.keys(SHAPES).map((k) => [k, []]));
  const pick = () => { let r = rand(); for (const [k, w] of WEIGHTS) { if ((r -= w) < 0) return k; } return 'tuft'; };
  const pathDist = (x, z) => {
    for (const r of [0.5, 1.0, 1.5, 2.0]) for (let a = 0; a < 8; a++) if (terrain.typeAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r) === 'path') return r;
    return Infinity;
  };
  const { x0, x1, z0, z1 } = BOUNDS;
  for (let x = x0 + 1; x < x1 - 1; x += 0.45) for (let z = z0 + 1; z < z1 - 1; z += 0.45) {
    const px = x + (rand() - 0.5) * 0.4, pz = z + (rand() - 0.5) * 0.4;
    if (terrain.typeAt(px, pz) !== 'grass' || terrain.isWater(px, pz)) continue;
    const d = pathDist(px, pz);
    if (d === Infinity || rand() > 0.75 - d * 0.25) continue;
    if (taken.some(([tx, tz, r]) => Math.hypot(px - tx, pz - tz) < r)) continue;
    lists[pick()].push([px, pz, terrain.heightAt(px, pz)]);
  }
  const flora = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geos[k], M.voxel, list.length);
    list.forEach(([x, z, h], i) => {
      const s = 0.8 + rand() * 0.5;
      m4.compose(p.set(x, h, z), q.setFromEuler(e.set(0, Math.floor(rand() * 8) * (Math.PI / 4), 0)), sc.set(s, s, s));
      mesh.setMatrixAt(i, m4);
    });
    mesh.receiveShadow = true;
    flora.add(mesh);
  }
  flora.userData.count = Object.fromEntries(Object.entries(lists).map(([k, l]) => [k, l.length]));
  return { flora, props };
}
