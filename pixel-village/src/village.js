import * as THREE from 'three';
import { UNIT, block, decal, bakeStatic, makeRng } from './pixel.js';
import { GLOW } from './palette.js';
import { buildMaterials } from './textures.js';
import { buildTerrain, rawHeight, padLevel } from './terrain.js';
import { buildCompounds } from './compounds.js';
import { PLACEMENTS, NODES, EDGES, WELL, BOUNDS, streamZ } from './layout.js';
import * as P from './props.js';
import { Sprites } from './sprites.js';
import { RESIDENTS } from './residents.js';
import { populate } from './life.js';
import { voxelTree } from './voxel.js';
import { NavGrid } from './nav.js';
import { buildFarmland } from './farmland.js';
import { buildRoadside } from './roadside.js';
import { fixCoplanar } from './coplanar.js';
import { daylight } from './daylight.js';
import { Smoke, Embers, Fireflies } from './fx.js';

/** 石拱桥：桥面 + 两侧带拱洞的立面 + 栏板。b 来自地形（桥中心、走向、桥面高、长度）。 */
function stoneBridge(M, b) {
  const g = new THREE.Group();
  const half = b.len / 2;
  const deck = block(-1.25, b.deck - 0.35, -half, 1.25, b.deck, half, M.stone);
  deck.userData.walkable = true; // 桥面能走，不算障碍
  g.add(deck);
  for (const sx of [-1, 1]) {
    const f = decal(M.tex.bridgeSide, M.bridgeSide, 'bottom');
    f.rotation.y = (sx * Math.PI) / 2;
    f.position.set(sx * 1.27, b.deck - f.userData.size.h, 0);
    f.scale.x = b.len / f.userData.size.w;
    g.add(f);
    g.add(block(sx * 1.25 - 0.22, b.deck, -half, sx * 1.25 + 0.22, b.deck + 0.5, half, M.rubble));
  }
  g.position.set(b.x, 0, b.z);
  g.rotation.y = b.rot;
  g.userData.onBridge = true; // 栏杆架在桥面上，悬空检测跳过
  return g;
}

/** 路口、桥头、井台、戏台边的火把位置（离路网节点偏一点，不挡路）。 */
const TORCHES = [['bridgeN', 1.6, 0], ['bridgeS', -1.6, 0], ['sqW', -1.4, 0.8], ['mid', 1.4, -0.6], ['well', 1.2, 1.4], ['e1', 1.3, 0.8], ['w1', -1.2, 1.0], ['cw', 1.3, 0.2], ['L1', -1.3, 0.4], ['east', 1.2, -1.2], ['nw', 1.4, 0.4]];

/**
 * 整个山村。object 以米建模，整体缩放到沙盘尺寸（UNIT）。
 * update(t, dt, viewerWorld) 每帧调用，返回 { hour, light }（主程序据此调太阳、天光、天空）。
 */
export function buildVillage({ startHour = 15.5, event = null } = {}) {
  const M = buildMaterials();
  const root = new THREE.Group();
  root.scale.setScalar(UNIT);

  // 1. 院落（本地坐标）→ 世界变换 + 门口节点 + 给生活系统用的接口
  const C = buildCompounds(M);
  const nodes = {};
  for (const [name, n] of Object.entries(NODES)) nodes[name] = { ...n, h: Math.round(rawHeight(n.x, n.z) / 0.3) * 0.3 };
  const pads = [];
  for (const p of PLACEMENTS) {
    const c = C[p.id];
    const rot = (p.rot * Math.PI) / 180, cs = Math.cos(rot), sn = Math.sin(rot);
    const level = padLevel(p.x, p.z);
    Object.assign(c, { id: p.id, rot, level });
    c.at = (lx, lz) => [p.x + cs * lx + sn * lz, p.z - sn * lx + cs * lz];
    c.xf = { toWorld: c.at, rot, level };
    const [gx, gz] = c.at(...c.gate);
    nodes[`gate:${p.id}`] = { x: gx, z: gz, h: level };
    pads.push({ x: p.x, z: p.z, rot, w: c.w, d: c.d, level });
    c.object.position.set(p.x, level, p.z);
    c.object.rotation.y = rot;
  }

  // 井台单独压一块平地（和旁边路口一样高），井不会半边悬在台阶上
  pads.push({ x: WELL.x, z: WELL.z, rot: 0, w: 3.2, d: 3.2, level: nodes.well.h });

  // 门前平台：从墙线铺到门外节点再往外半米，宽 2.6 米，和院里一样高
  const aprons = [];
  for (const p of PLACEMENTS) {
    const c = C[p.id];
    if (!c.gates.length) continue; // 空场、场院没有院墙，不用铺
    const [gx, gz] = c.gate;
    const [x0, z0] = c.at(gx, Math.min(gz - 1.2, c.d / 2)), [x1, z1] = c.at(gx, gz + 0.05);
    aprons.push({ x0, z0, x1, z1, h0: c.level, h1: c.level, w: 2.6 });
    // 落在门前平台上的路口节点，高度跟平台走（不然路从节点出发时高度对不上）
    for (const n of Object.values(nodes)) {
      const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const along = (n.x - x0) * ux + (n.z - z0) * uz, across = Math.abs(-(n.x - x0) * uz + (n.z - z0) * ux);
      if (along > 0 && along < len + 0.3 && across < 1.6) n.h = c.level;
    }
  }

  // 2. 地形 + 院子 + 井 + 桥
  const terrain = buildTerrain(M, { pads, nodes, edges: EDGES, aprons });
  root.add(terrain.object);
  for (const c of Object.values(C)) root.add(c.object);
  root.add(P.well(M, WELL.x, WELL.z).translateY(terrain.heightAt(WELL.x, WELL.z)));
  if (terrain.bridge) root.add(stoneBridge(M, terrain.bridge));

  // 3. 树（体素）。记下树干位置，导航里当障碍
  const trunks = [];
  const plant = (kind, x, z, { seed = 1, scale = 1, y = null } = {}) => {
    const m = new THREE.Mesh(voxelTree(kind, seed, scale), M.voxel);
    m.castShadow = m.receiveShadow = true;
    m.position.set(x, y ?? terrain.heightAt(x, z), z);
    m.userData.tree = true;
    root.add(m);
    trunks.push([x, z, kind === 'locust' ? 0.6 : 0.35]);
  };
  for (const c of Object.values(C)) for (const [kind, lx, lz, opts = {}] of c.trees) {
    const [x, z] = c.at(lx, lz);
    plant(kind, x, z, { ...opts, y: c.level + (opts.y ?? 0) });
  }
  const rand = makeRng(77);
  let seed = 200;
  const nearPath = (x, z) => EDGES.some(([a, b]) => { // 树别种在路边 2.2 米以内
    const A = nodes[a], B = nodes[b], dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / L2));
    return Math.hypot(x - A.x - t * dx, z - A.z - t * dz) < 2.2;
  });
  for (let x = BOUNDS.x0 + 3; x < BOUNDS.x1 - 2; x += 6 + rand() * 5) { // 溪边
    const z = streamZ(x) + (rand() > 0.5 ? 2.6 : -2.6);
    if (['grass', 'field'].includes(terrain.typeAt(x, z)) && !nearPath(x, z)) plant(rand() > 0.6 ? 'willow' : 'poplar', x, z, { seed: seed++, scale: 0.8 + rand() * 0.3 });
  }
  for (let i = 0; i < 90; i++) { // 坡上
    const x = BOUNDS.x0 + 2 + rand() * (BOUNDS.x1 - BOUNDS.x0 - 4), z = BOUNDS.z0 + 2 + rand() * 50;
    const type = terrain.typeAt(x, z);
    if (type !== 'grass' && !(type === 'field' && rand() > 0.7)) continue;
    if (Object.values(nodes).some((n) => Math.hypot(n.x - x, n.z - z) < 3)) continue;
    if (nearPath(x, z)) continue;
    const kinds = ['persimmon', 'jujube', 'poplar', 'locust', 'cypress', 'bush'];
    const kind = kinds[Math.floor(rand() * kinds.length)];
    plant(kind, x, z, { seed: seed++, scale: kind === 'locust' ? 0.55 : 0.75 + rand() * 0.3 });
  }

  // 4. 火把、庄稼地里的稻草人和看青棚
  const torches = TORCHES.map(([n, dx, dz]) => {
    const x = nodes[n].x + dx, z = nodes[n].z + dz;
    const tr = P.torch(M);
    tr.object.position.set(x, terrain.walkAt(x, z), z);
    root.add(tr.object);
    return { pos: [x, z], fire: tr.fire, lit: false };
  });
  const farm = buildFarmland(M, terrain, nodes);
  root.add(farm.extras);
  const road = buildRoadside(M, terrain, nodes, C); // 路边的野花野草、土地庙、石敢当、花盆
  root.add(road.props);

  // 4.5 共面的面（z-fighting 闪烁）：门柱和墙、墙的拐角、压顶……把小的那个微微撑出来
  root.userData.coplanar = fixCoplanar(root, (o) => o === terrain.object || o.userData.tree || o.isSprite);

  // 4.6 猫、喜鹊蹲的高处：从点位上方往下打射线，贴到真实的表面上（屋面、墙头、缸沿、树冠）。
  //     点位是手填的，院子和物件挪过以后会对不上——蹲在半空或者陷进屋顶里
  {
    root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const solid = [];
    root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o !== terrain.object && o.material && o.material.side !== THREE.BackSide && !o.material.transparent && !(o.geometry instanceof THREE.PlaneGeometry)) solid.push(o); });
    solid.push(terrain.object);
    const perchFix = [];
    for (const c of Object.values(C)) for (const a of c.animals) for (const pt of a.perches ?? []) {
      const [x, z] = c.at(pt[0], pt[2]);
      const from = root.localToWorld(new THREE.Vector3(x, c.level + pt[1] + 1.2, z));
      ray.set(from, new THREE.Vector3(0, -1, 0));
      ray.far = 6 * UNIT;
      const hit = ray.intersectObjects(solid, false)[0];
      if (!hit) continue;
      const y = root.worldToLocal(hit.point.clone()).y - c.level;
      if (Math.abs(y - pt[1]) > 0.05) perchFix.push(`${c.id}/${a.kind}: ${pt[1].toFixed(2)}→${y.toFixed(2)}`);
      pt[1] = y;
    }
    root.userData.perchFix = perchFix;
  }

  // 5. 导航网格：把房子、墙、栅栏、道具、树干都投影成障碍（门扇、灯笼这些会动的不算）
  const nav = new NavGrid(terrain);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const visit = (o) => {
    if (o === terrain.object || o.userData.dynamic || o.userData.tree || o.userData.walkable) return;
    if (o.isMesh && !(o.geometry instanceof THREE.PlaneGeometry) && !o.geometry.type.includes('Circle')) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      nav.blockMesh(o, rel, terrain.walkAt);
    }
    for (const k of o.children) visit(k);
  };
  for (const k of root.children) visit(k);
  for (const [x, z, r] of trunks) nav.blockDisc(x, z, r);
  for (const c of Object.values(C)) for (const [lx, lz, r] of c.discs) nav.blockDisc(...c.at(lx, lz), r); // 火塘

  // 门：院门、栅栏门登记成门格子（关着时动物过不去，人走到跟前会推开）
  const gates = Object.values(C).flatMap((c) => c.gates.map((gt) => {
    const [x, z] = c.at(...gt.center);
    return { c, leaves: gt.leaves, at: [x, z], open: 0, state: nav.addDoor(x, z, gt.w, c.rot) };
  }));

  // 自检 1：悬空——贴着地面摆的东西（底面 ≈ 中心处地面），四角下面的地面却低了一截
  const floating = [];
  const tmpBox = new THREE.Box3();
  const checkFloat = (o) => {
    if (o === terrain.object || o.userData.dynamic || o.userData.tree || o.userData.onBridge) return;
    if (o.isMesh && !(o.geometry instanceof THREE.PlaneGeometry) && !o.geometry.type.includes('Circle')) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      tmpBox.copy(b).applyMatrix4(rel);
      // 用物体自己朝向的底面四角（转过角度的院子里，轴对齐包围盒会大出一圈造成误报）
      const inset = 0.15;
      const pts = [[b.min.x + inset, b.min.z + inset], [b.max.x - inset, b.min.z + inset], [b.min.x + inset, b.max.z - inset], [b.max.x - inset, b.max.z - inset], [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2]]
        .map(([x, z]) => new THREE.Vector3(x, b.min.y, z).applyMatrix4(rel));
      const center = pts[4], base = tmpBox.min.y, hc = terrain.walkAt(center.x, center.z);
      if (Math.abs(base - hc) < 0.1 && tmpBox.max.y - base > 0.2) {
        const drop = Math.max(...pts.slice(0, 4).map((q) => base - terrain.walkAt(q.x, q.z)));
        if (drop > 0.3) floating.push({ at: [+center.x.toFixed(1), +center.z.toFixed(1)], size: [+(b.max.x - b.min.x).toFixed(1), +(b.max.y - b.min.y).toFixed(1)], drop: +drop.toFixed(2) });
      }
    }
    for (const k of o.children) checkFloat(k);
  };
  for (const k of root.children) checkFloat(k);
  root.userData.floating = floating;

  // 6. 每户自己的窗户材质（家里有人、在做饭时更亮）+ 窗前的光晕
  const windowSprites = [];
  for (const c of Object.values(C)) {
    c.windowMat = M.windowLit.clone();
    c.windowMat.onBeforeCompile = M.windowLit.onBeforeCompile;
    c.windowMat.customProgramCacheKey = M.windowLit.customProgramCacheKey;
    c.object.traverse((o) => { if (o.material === M.windowLit) o.material = c.windowMat; });
    for (const wv of c.windows) {
      const [x, z] = c.at(wv.x, wv.z);
      const s = new THREE.Sprite(M.windowHalo);
      s.scale.set(2.2, 2.2, 1);
      s.position.set(x, c.level + wv.y, z);
      root.add(s);
      windowSprites.push(s);
    }
  }

  // 7. 静态几何合批
  root.userData.bake = bakeStatic(root);
  root.add(farm.object, road.flora); // 实例化的庄稼、野花野草不参与合批
  root.userData.flora = road.flora.userData.count;

  // 8. 给生活系统的接口：院落上的去处、房门、门外
  for (const c of Object.values(C)) {
    const area = [-c.w / 2 + 1, -c.d / 2 + 1, c.w / 2 - 1, c.d / 2 - 1];
    c.spot = (name) => (c.spots[name] ? nav.nearestFree(...c.at(...c.spots[name])) : undefined);
    c.door = (which) => { const d = c.doors[which] ?? c.doors.house; return d ? c.at(...d) : c.at(...c.gate); };
    c.gateOut = () => nav.nearestFree(...c.at(...c.gate));
    c.randomPoint = (a = area) => nav.randomIn(a, c.at, rand) ?? c.at(0, 0);
  }
  // 门口坐着、蹲着吃饭的地方：院门两边的墙根底下（不是路面、不在门前平台上、和院子一样高、走得到），一人一个
  for (const c of Object.values(C)) {
    const [gx, gz] = c.gate;
    const cand = [];
    if (c.gates.length) {
      for (const dx of [1.8, 2.5, 3.2, 3.9, 4.6]) for (const sd of [-1, 1]) cand.push([gx + sd * dx, c.d / 2 + 0.5, gx + sd * dx, c.d / 2 + 4]);
    } else {
      for (let a = 0; a < 12; a++) cand.push([gx + Math.cos(a * 0.52) * 2.6, gz + Math.sin(a * 0.52) * 2.6, gx, gz]); // 没院墙的（村口、场院）：门口一圈，脸朝门口
    }
    c.wallSpots = [];
    for (const [lx, lz, fx, fz] of cand) {
      const [x, z] = c.at(lx, lz);
      const ok = nav.freeAt(x, z) && nav.reachable(x, z) && !nav.door[nav.index(x, z)]
        && [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].every(([ex, ez]) => terrain.typeAt(x + ex, z + ez) !== 'path')
        && (!c.gates.length || Math.abs(terrain.walkAt(x, z) - c.level) < 0.05);
      if (ok) c.wallSpots.push({ at: [x, z], face: c.at(fx, fz) });
    }
  }

  // 自检 2：每个院子从门外能不能走到每扇房门、每个去处
  const unreachable = [];
  for (const c of Object.values(C)) {
    const [gx, gz] = c.gateOut();
    for (const [name, d] of [...Object.entries(c.doors).map(([k, v]) => [`door:${k}`, c.at(...v)]), ...Object.keys(c.spots).map((k) => [k, c.spot(k)])]) {
      if (!nav.find(gx, gz, d[0], d[1], { person: true })) unreachable.push(`${c.id}/${name}`);
    }
    if (!nav.find(gx, gz, nodes.well.x, nodes.well.z, { person: true })) unreachable.push(`${c.id}/→井`);
  }
  root.userData.unreachable = unreachable;
  // 诊断：从井出发的连通区域，列出不在里面的路网节点（附近格子的高度）
  {
    const seen = new Uint8Array(nav.nx * nav.nz);
    const start = nav.index(...nav.nearestFree(nodes.well.x, nodes.well.z, false, 4, true));
    const q = [start]; seen[start] = 1;
    while (q.length) {
      const k = q.pop(), i = k % nav.nx, j = Math.floor(k / nav.nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nav.nx || nj >= nav.nz) continue;
        const n = nj * nav.nx + ni;
        if (!seen[n] && nav.step(k, n, false, true)) { seen[n] = 1; q.push(n); }
      }
    }
    nav.reach = seen; // 从村里能走到的格子：动物溜达、吃草只挑这些地方（坡上被石堰围死的小块平地不去）
    root.userData.brokenEdges = EDGES.filter(([a, b]) => !nav.find(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z, { person: true, maxNodes: 20000 })).map(([a, b]) => {
      const A = nodes[a], B = nodes[b], L = Math.hypot(B.x - A.x, B.z - A.z);
      const prof = [];
      for (let d = 0; d <= L; d += 0.5) { const x = A.x + (B.x - A.x) * d / L, z = A.z + (B.z - A.z) * d / L; prof.push(`${terrain.walkAt(x, z).toFixed(1)}${nav.freeAt(x, z, false, true) ? '' : '#'}`); }
      return `${a}→${b}: ${prof.join(' ')}`;
    });
    root.userData.islands = Object.entries(nodes).filter(([, n]) => !seen[nav.index(...nav.nearestFree(n.x, n.z, false, 4, true))]).map(([name, n]) => `${name}(${n.x.toFixed(1)},${n.z.toFixed(1)}) h=${n.h.toFixed(1)} 地面=${terrain.walkAt(n.x, n.z).toFixed(1)}`);
  }

  const ducks = [-20, 27.2, -6, 33];
  const V = {
    M, root, nav, C, nodes, torches,
    fields: farm.fields,
    pasture: farm.pasture.filter((p) => nav.freeAt(p[0], p[1]) && nav.reachable(p[0], p[1])),
    well: { center: [WELL.x, WELL.z], spot: () => nav.nearestFree(WELL.x + 1.4, WELL.z + 0.6) },
    duckWater: nav.nearestFree(-12, 28.5),
    // 小孩玩耍的去处：溪北岸能站的地方（脸朝水），村口附近的庄稼地
    streamBank: (() => {
      const out = [];
      for (let x = -22; x <= 30; x += 1.5) {
        const z = streamZ(x) - 2.3;
        if (nav.freeAt(x, z) && nav.reachable(x, z) && !terrain.isWater(x, z) && terrain.isWater(x, z + 1.2)) out.push([x, z]);
      }
      return out;
    })(),
    playFields: [...farm.fields.fieldS, ...terrain.fieldCells.filter((c, i) => i % 5 === 0 && Math.hypot(c.x - 2, c.z - 10) < 28 && nav.freeAt(c.x, c.z) && nav.reachable(c.x, c.z)).map((c) => [c.x, c.z])],
  };
  const extraAnimals = [
    ...Array.from({ length: 4 }, () => ({ kind: 'goose', role: 'goose', worldArea: ducks })),
    ...Array.from({ length: 5 }, () => ({ kind: 'duck', role: 'duck', worldArea: ducks })),
    ...Array.from({ length: 8 }, (_, i) => ({ kind: 'pigeon', role: 'pigeon', cx: 0, cz: -8, r: 12, y: 22, offset: i * 0.35 })),
  ];
  V.bonfire = { lit: false };
  const life = populate(V, RESIDENTS, extraAnimals, startHour, event);
  const pitFire = C.square.evening.fire;

  // 9. 烟火：炊烟、蒸汽、炉火星、萤火虫、几盏真实的点光源
  const sprites = new Sprites(root, M);
  const smokes = [], embers = [];
  let s = 1;
  for (const c of Object.values(C)) for (const e of c.emitters) {
    const [x, z] = c.at(e.pos.x, e.pos.z);
    const pos = new THREE.Vector3(x, e.pos.y + c.level, z);
    if (e.kind === 'smoke') smokes.push(Object.assign(new Smoke(root, sprites, pos, s++, { size: 0.8, rise: 3.2, drift: 2.4 }), { home: c.id, forge: e.forge }));
    if (e.kind === 'steam') smokes.push(Object.assign(new Smoke(root, sprites, pos, s++, { size: 0.7, rise: 2.5, drift: 0.8, life: 0.3 }), { home: c.id, steam: true }));
    if (e.kind === 'ember') embers.push(new Embers(root, M.emberSprite, pos));
  }
  const fireflies = new Fireflies(root, M.fireflySprite, [[-40, 40, 26, 34, -0.5], [-44, -30, -10, 20, 3], [32, 44, -20, 6, 4]], 50);
  const lights = [];
  const pointLight = (x, y, z, base, color = GLOW.lantern) => {
    const l = new THREE.PointLight(color, 0, 0.12, 1.4);
    l.position.set(x, y, z);
    root.add(l);
    lights.push({ l, base });
  };
  if (embers[0]) pointLight(embers[0].origin.x, embers[0].origin.y + 0.6, embers[0].origin.z, 0.05, GLOW.fire);
  pointLight(...[C.square.at(3.5, 0.5)].map(([x, z]) => [x, C.square.level + 3, z])[0], 0.07);
  pointLight(...[C.store.at(0, 6)].map(([x, z]) => [x, C.store.level + 3, z])[0], 0.05);
  pointLight(torches[0].pos[0], terrain.walkAt(...torches[0].pos) + 2.4, torches[0].pos[1], 0.05, GLOW.fire);
  const [px, pz] = C.square.at(...C.square.evening.pit);
  pointLight(px, C.square.level + 1.2, pz, 0, GLOW.fire);
  const bonfireLight = lights[lights.length - 1];


  const lanternBase = M.lantern.color.clone();
  const spinners = Object.values(C).flatMap((c) => c.spinners);
  let waterStep = 0;
  let last = 0;

  return {
    object: root,
    life,
    nav,
    gates,
    update(t, viewerWorld) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      life.update(t, dt);
      const hour = life.clock.hour;
      const L = daylight(hour);
      const n = L.night;

      const step = Math.floor(t * 2); // 溪水按整像素往西流
      if (step !== waterStep) { waterStep = step; terrain.water.offset.x = (step % 36) / 36; }

      // 灯火：天一擦黑，窗户、灯笼、火把一盏盏亮起来
      for (const c of Object.values(C)) {
        const home = life.insideCount(c.id) > 0;
        const cooking = life.people.some((v) => v.inside && v.doing === 'cook' && v.p.home === c.id);
        const k = Math.min(1, n * (home ? 1 : 0.45) + (cooking ? 0.35 : 0));
        c.windowMat.color.setRGB(0.42 + 0.58 * k, 0.36 + 0.64 * k, 0.34 + 0.66 * k);
      }
      M.windowHalo.opacity = 0.75 * n;
      M.haloSprite.opacity = 0.2 + 0.8 * n;
      M.lantern.color.copy(lanternBase).multiplyScalar(0.55 + 0.45 * n);
      for (const ws of windowSprites) ws.visible = n > 0.05;
      for (const tr of torches) {
        tr.fire.visible = tr.lit && n > 0.1;
        const f = tr.fire.userData.flame;
        f.scale.y = Math.floor(t * 8 + tr.pos[0]) % 3 === 0 ? 0.68 : 0.6;
        f.position.x = Math.floor(t * 6 + tr.pos[1]) % 2 ? 0.03 : -0.03;
      }
      pitFire.visible = V.bonfire.lit; // 篝火：点着了才有火
      if (V.bonfire.lit) root.userData.fireSeen = true;
      bonfireLight.base = V.bonfire.lit ? 0.09 : 0;
      pitFire.userData.flames.forEach((f, i) => { f.scale.y = (Math.floor(t * 7 + i * 1.7) % 3 === 0 ? 0.95 : 0.8) * (1 - i * 0.12); f.position.x = (i ? (i === 1 ? 0.18 : -0.16) : 0) + (Math.floor(t * 5 + i) % 2 ? 0.03 : -0.03); });
      for (const { l, base } of lights) l.intensity = base * n * (0.92 + (Math.floor(t * 9 + l.position.x) % 3) * 0.04);
      for (const sm of smokes) { // 屋里有人（烧炕、做饭）才冒烟；豆腐坊的蒸汽只在煮浆时冒
        const boiling = sm.steam && life.people.some((v) => !v.inside && v.doing === 'boil' && v.p.home === sm.home);
        const home = life.people.some((v) => v.inside && (v.p.home === sm.home || (v.p.sleepAt ?? v.p.home) === sm.home));
        const forging = sm.forge && life.people.some((v) => !v.inside && v.doing === 'work' && v.p.home === sm.home); // 炉子：有人打铁才冒
        sm.update(dt * (boiling ? 1.8 : 1), sm.steam ? boiling : sm.forge ? forging : home);
        for (const fm of sm.frames) fm.color.setScalar(1 - 0.6 * n);
      }
      for (const e of embers) e.update(dt);
      fireflies.update(t);
      for (const ff of fireflies.flies) ff.visible &&= n > 0.4;

      for (const g of gates) {
        // 门：有人要过（走到门前推门）、人就在门口、被赶着的牲口还没过完，就开着；人走了顺手带上。
        // 牲口也会把门拱开（ajar），但它们不会关——门就一直敞着，直到有人从门口过、顺手关上
        g.state.want = Math.max(0, (g.state.want ?? 0) - dt);
        const person = life.people.some((v) => !v.inside && Math.hypot(v.pos.x - g.at[0], v.pos.z - g.at[1]) < 1.6);
        if (person && g.state.ajar && !life.beasts.some((b) => Math.hypot(b.pos.x - g.at[0], b.pos.z - g.at[1]) < 1.2)) g.state.ajar = false;
        const near = g.state.want > 0 || person || g.state.ajar
          || life.beasts.some((b) => b.follow && Math.hypot(b.pos.x - g.at[0], b.pos.z - g.at[1]) < 3.2);
        g.open = Math.max(0, Math.min(1, g.open + (near ? dt * 2.2 : -dt * 1.2)));
        g.state.open = g.open;
        const a = Math.round((g.open * 1.65) / (Math.PI / 12)) * (Math.PI / 12); // 按 15° 一格转
        for (const lf of g.leaves) lf.pivot.rotation.y = lf.sign * a;
      }
      for (const lt of Object.values(C).flatMap((c) => c.lanterns)) lt.rotation.z = Math.round(Math.sin(t * 1.3 + lt.id) * 2) * 0.04;
      for (const sp of spinners) if (life.beasts && (sp.id === 'mill' ? [...life.beasts].some((b) => b.s.role === 'donkey' && b.circling) : life.beasts.some((b) => b.s.role === 'ox' && b.circling))) (sp.object.userData.spin ?? sp.object).rotation.y = -t * (sp.id === 'mill' ? 0.35 : 0.2);
      sprites.face(viewerWorld);
      return { hour, light: L, clock: life.clock };
    },
  };
}
