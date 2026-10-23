import * as THREE from 'three';
import { UNIT, block, decal, bakeStatic, makeRng } from './pixel.js';
import { GLOW } from './palette.js';
import { buildMaterials } from './textures.js';
import { buildTerrain, rawHeight, padLevel } from './terrain.js';
import { buildCompounds } from './compounds.js';
import { PLACEMENTS, NODES, EDGES, WELL, BOUNDS, BAND, streamZ, STREAM_HALF, inSoy } from './layout.js';
import * as PROPS from './props.js';
import { tagged, tag, collectThings } from './things.js';

const P = tagged(PROPS); // 建出来的物件都带上 userData.thing，点它能看卡片
import { Sprites } from './sprites.js';
import { RESIDENTS } from './residents.js';
import { populate, EVENTS as EVENT_DEFS } from './life/index.js';
import { PLACES } from './labels.js';
import { voxelTree } from './voxel.js';
import { NavGrid } from './nav.js';
import { buildFarmland } from './farmland.js';
import { buildRoadside } from './roadside.js';
import { fixCoplanar } from './coplanar.js';
import { snapPerches, findFloating, markReachable, auditPaths } from './audit.js';
import { daylight } from './daylight.js';
import { Smoke, Embers, Fireflies, Rain } from './fx.js';
import { is } from './season.js';
import { buildWest, WEST_BOUNDS } from './west.js';

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
const grey = new THREE.Color(), tmpC = new THREE.Color();
/** 阴天 / 雨天的光：太阳减弱、天空色带往灰里拉；雨天"夜色"加一点（白天屋里也点灯，窗户微微亮）。 */
function overcast(L, weather) {
  if (weather === 'sunny') return L;
  const k = (weather === 'rain' ? 0.6 : 0.35) * (1 - L.night * 0.7);
  grey.set(L.night > 0.5 ? '#2a2e3a' : '#8a909c');
  const mix = (hex) => `#${tmpC.set(hex).lerp(grey, k).getHexString()}`;
  return {
    ...L,
    sun: mix(L.sun),
    sunIntensity: L.sunIntensity * (weather === 'rain' ? 0.3 : 0.55),
    sky: mix(L.sky),
    hemiIntensity: L.hemiIntensity * (weather === 'rain' ? 0.85 : 0.95),
    night: Math.min(1, L.night + (weather === 'rain' ? 0.22 : 0.06)),
    bands: L.bands.map(mix),
  };
}

export function buildVillage({ startHour = 15.5, event = null, weather = null } = {}) {
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

  // 村口的场子往南接一块（插进来的那条地上，见 layout.js 的 BAND）：和场子一样高、一样宽
  { const sq = C.square, [x, z] = sq.at(0, sq.d / 2 + BAND.d / 2); pads.push({ x, z, rot: sq.rot, w: sq.w, d: BAND.d, level: sq.level }); }

  // 村口场子东沿外一步的路口：杨家那条路下到 sqE，再上几级台阶直接进场子（和场子一样高）
  { const [x, z] = C.square.at(C.square.w / 2 + 1.0, 1.5); nodes.sqEast = { x, z, h: C.square.level }; }

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
  // 庄稼地：溪南的河滩留成草滩；村子当中留几片荒坡，沙盘两边的山坡种满；豆腐坊的大豆地用松土地皮
  const farmAt = (x, z, h, wild) => (h < 1 || z > streamZ(x) - STREAM_HALF || (wild && Math.abs(x) < 30) ? false : inSoy(x, z) ? 1 : true);
  const terrain = buildTerrain(M, { pads, nodes, edges: EDGES, aprons, farm: farmAt });
  root.add(terrain.object);
  for (const c of Object.values(C)) root.add(c.object);
  root.add(P.well(M, WELL.x, WELL.z).translateY(terrain.heightAt(WELL.x, WELL.z)));
  if (terrain.bridge) root.add(tag(stoneBridge(M, terrain.bridge), 'bridge'));

  // 3. 树（体素）。记下树干位置，导航里当障碍
  const trunks = [];
  const plant = (kind, x, z, { seed = 1, scale = 1, y = null } = {}) => {
    const m = new THREE.Mesh(voxelTree(kind, seed, scale), M.voxel);
    m.castShadow = m.receiveShadow = true;
    m.position.set(x, y ?? terrain.heightAt(x, z), z);
    m.userData.tree = true;
    root.add(m);
    trunks.push([x, z, kind === 'oldLocust' ? 1.3 : kind === 'locust' ? 0.6 : 0.35]);
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
  for (let x = BOUNDS.x0 + 3; x < BOUNDS.x1 - 3; x += 3.2) for (let z = BOUNDS.z0 + 3; z < streamZ(x) - 3; z += 3.2) { // 院子之间空着的草地：补几丛灌木、小树
    const px = x + (rand() - 0.5) * 1.6, pz = z + (rand() - 0.5) * 1.6;
    if (terrain.typeAt(px, pz) !== 'grass' || rand() > 0.55) continue;
    if (trunks.some(([tx, tz]) => Math.hypot(tx - px, tz - pz) < 3.2) || nearPath(px, pz)) continue;
    if ([[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].some(([dx, dz]) => terrain.typeAt(px + dx, pz + dz) === 'pad')) continue; // 别贴着院墙
    if ([[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].some(([dx, dz]) => terrain.typeAt(px + dx, pz + dz) === 'pad')) continue; // 别贴着院墙
    if (Object.values(nodes).some((n) => Math.hypot(n.x - px, n.z - pz) < 3)) continue;
    const kind = rand() < 0.6 ? 'bush' : ['jujube', 'persimmon', 'locust'][Math.floor(rand() * 3)];
    plant(kind, px, pz, { seed: seed++, scale: kind === 'bush' ? 0.7 + rand() * 0.4 : kind === 'locust' ? 0.5 : 0.7 + rand() * 0.2 });
  }

  // 3.5 冬天：孩子们在几家门外的空地上堆的雪人（草地上、不挨路和院墙）
  if (is('winter')) {
    const rs = makeRng(91);
    let n = 0;
    for (const id of ['headman', 'school', 'farmA', 'farmB', 'farmC', 'store', 'tofu', 'shepherd']) {
      const g0 = nodes[`gate:${id}`];
      if (!g0 || n >= 6) continue;
      for (let k = 0; k < 40; k++) {
        const a = rs() * Math.PI * 2, d = 2.6 + rs() * 3, x = g0.x + Math.cos(a) * d, z = g0.z + Math.sin(a) * d;
        if (terrain.typeAt(x, z) !== 'grass' || trunks.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.6)) continue;
        if ([[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].some(([dx, dz]) => ['path', 'pad'].includes(terrain.typeAt(x + dx, z + dz)) || terrain.heightAt(x + dx, z + dz) !== terrain.heightAt(x, z))) continue;
        root.add(P.snowman(M, x, z, Math.atan2(g0.x - x, g0.z - z)).translateY(terrain.heightAt(x, z))); // 脸朝着院门
        n++;
        break;
      }
    }
  }

  // 3.6 祖坟：村西荒坡上找一块 4.5 x 3 米的平草地（四季都在；清明上坟用）
  let graveAt = null;
  for (let r = 0; r < 26 && !graveAt; r += 0.5) for (let a = 0; a < 36 && !graveAt; a++) {
    const x = -34 + Math.cos(a * 0.1745) * r, z = -3 + Math.sin(a * 0.1745) * r, h = terrain.heightAt(x, z);
    if (x > -20) continue; // 只在村西
    const ok = [-2.3, -1.2, 0, 1.2, 2.3].every((dx) => [-1.4, -0.5, 0.5, 1.6].every((dz) => terrain.typeAt(x + dx, z + dz) === 'grass' && terrain.heightAt(x + dx, z + dz) === h));
    if (ok && !nearPath(x, z) && !trunks.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.4) && Object.values(nodes).every((n) => Math.hypot(n.x - x, n.z - z) > 3.5)) graveAt = [x, z, h];
  }
  if (graveAt) root.add(P.graves(M, is('spring')).translateX(graveAt[0]).translateY(graveAt[2]).translateZ(graveAt[1]));

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

  // 4.6 猫、喜鹊蹲的高处贴到真实表面上（见 audit.js）
  root.userData.perchFix = snapPerches(root, terrain, C);

  // 4.7 西沟：接在村子西边的另一块沙盘（west.js）。和村子同一个世界、同一张导航网格，村民走得过去
  const west = buildWest(M);
  const pickT = (x) => (x < BOUNDS.x0 ? west.terrain : terrain);
  const ground = {
    walkAt: (x, z) => pickT(x).walkAt(x, z),
    isWater: (x, z) => pickT(x).isWater(x, z),
    typeAt: (x, z) => pickT(x).typeAt(x, z),
  };

  // 5. 导航网格（覆盖村子 + 西沟）：把房子、墙、栅栏、道具、树干都投影成障碍（门扇、灯笼这些会动的不算）
  const nav = new NavGrid(ground, { ...BOUNDS, x0: WEST_BOUNDS.x0 });
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
  west.blockNav(nav);

  // 门：院门、栅栏门登记成门格子（关着时动物过不去，人走到跟前会推开）
  const gates = Object.values(C).flatMap((c) => c.gates.map((gt) => {
    const [x, z] = c.at(...gt.center);
    return { c, leaves: gt.leaves, at: [x, z], open: 0, state: nav.addDoor(x, z, gt.w, c.rot + (gt.rot ?? 0)) };
  }));

  // 自检 1：悬空（见 audit.js）
  root.userData.floating = findFloating(root, terrain);

  // 6. 每户自己的窗户材质（家里有人、在做饭时更亮）+ 窗前的光晕
  const windowSprites = [];
  const LATE = { school: 23.5, doctor: 23.2 }; // 晚睡的人家
  for (const c of Object.values(C)) {
    c.lightsOut = LATE[c.id] ?? 21.3 + ((c.id.split('').reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % 100) / 100) * 1.3; // 21:18–22:36 之间各家吹灯
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
      s.userData.c = c;
      windowSprites.push(s);
    }
  }

  // 7. 静态几何合批（合批会拆掉网格，所以点物件用的包围盒要先收集）
  const things = collectThings(root, C);
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
  // 从井出发能走到的格子（nav.reach）：动物溜达、吃草、小孩玩耍、门口座位都只挑这些地方
  markReachable(nav, nodes.well);

  // 门口坐着吃饭的地方：门槛上两个，再是院门两边的墙根底下（不是路面、不在门前平台上、和院子一样高、走得到），一人一个
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
    c.sillSpots = (c.sills ?? []).map(([lx, lz, seat]) => ({ at: c.at(lx, lz), face: c.at(lx, lz + 4), seat })); // 门槛上：脸朝外
  }

  // 自检 2：走不到的房门 / 去处、和村子不连通的路网节点、走不通的路（见 audit.js）
  Object.assign(root.userData, auditPaths(nav, C, nodes, terrain, EDGES));
  const wa = auditPaths(nav, {}, west.nodes, west.terrain, west.edges); // 西沟的路：和井连不连通、走不走得通
  west.object.userData.audit = { islands: wa.islands, brokenEdges: wa.brokenEdges };

  // 祭土地：庙前磕头的位置、排队 / 磕完说话的地方（庙前一圈能站、走得到、不在水里）
  const shrine = road.shrine && (() => {
    const S = road.shrine, dx = S.face[0] - S.at[0], dz = S.face[1] - S.at[1], L = Math.hypot(dx, dz);
    const front = nav.nearestFree(S.at[0] + (dx / L) * 1.3, S.at[1] + (dz / L) * 1.3);
    const wait = [];
    for (let r = 1.6; r <= 3.2 && wait.length < 10; r += 0.8) for (let a = 0; a < 12; a++) {
      const x = front[0] + Math.cos(a * 0.52) * r, z = front[1] + Math.sin(a * 0.52) * r;
      if (nav.freeAt(x, z) && nav.reachable(x, z) && Math.hypot(x - S.at[0], z - S.at[1]) > 1.4) wait.push([x, z]);
    }
    return { ...S, front, wait, spots: {} };
  })();

  const ducks = [-26, 22, -6, 33 + BAND.d]; // 溪里、溪北岸，往西到铁匠铺门口那片草滩
  const duckReach = nav.flood(-12, 28.5, { swim: true, hop: true }); // 鸭鹅从溪里能到的地方：游、走，碰上石堰土坎扑腾着跳上跳下（铁匠铺门口那片草滩不用修路）
  const V = {
    M, root, nav, C, nodes, torches, shrine,
    // 祖坟：每个坟头前一个磕头的位置（清明上坟）
    graves: graveAt && { at: [graveAt[0], graveAt[1]], spots: [-1.5, 0, 1.5].map((dx) => ({ at: nav.nearestFree(graveAt[0] + dx, graveAt[1] + 1.0), face: [graveAt[0] + dx, graveAt[1] - 0.6] })) },
    fields: { ...farm.fields, ...Object.fromEntries(['wheatW', 'wheatE', 'milletW', 'milletE', 'cornW', 'cornE'].map((k) => [k, farm.fields[k].filter((p) => nav.freeAt(...p, false, true) && nav.reachable(...p))])), fieldWest: west.work.fieldWest.filter((p) => nav.freeAt(...p, false, true) && nav.reachable(...p)) }, // fieldWest：西沟主路边的梯田；wheat / millet / corn：按庄稼分的（各季节的农活用）
    mill: { at: nav.nearestFree(...west.work.mill.at), face: west.work.mill.face }, // 西沟水磨坊：磨台北边磨面的位置
    temple: { at: nav.nearestFree(...west.work.temple.at), face: west.work.temple.face, light: west.work.temple.light }, // 西沟山神庙：栈台上、庙门前上香
    // 羊吃草的坡：西沟崖顶的草坡（走得到的话），不然村西的荒草坡
    pasture: (() => { const ok = (p) => nav.freeAt(p[0], p[1]) && nav.reachable(p[0], p[1]), up = west.work.pasture.filter(ok); return up.length > 20 ? up : farm.pasture.filter(ok); })(),
    // 骡帮进村的路（一段段找路的落脚点）：山外 → 西沟崖脚 → 挂壁古道 → 羊圈西边 → 井 → 村口；在村口西边歇脚做买卖
    caravan: {
      route: [...west.work.caravan, [nodes.westCliff.x, nodes.westCliff.z], [nodes.shepS.x, nodes.shepS.z], [nodes.nw.x, nodes.nw.z], [nodes.well.x, nodes.well.z], [nodes.sqNW.x, nodes.sqNW.z]],
      stand: [nav.nearestFree(nodes.sqW.x - 1.6, nodes.sqW.z - 2.5), nav.nearestFree(nodes.sqW.x - 1.0, nodes.sqW.z - 4.2)],
      face: [nodes.sqW.x + 4, nodes.sqW.z],
    },
    well: { center: [WELL.x, WELL.z], spot: () => nav.nearestFree(WELL.x + 1.4, WELL.z + 0.6) },
    duckWater: nav.nearestFree(-12, 28.5),
    // 小孩玩耍的去处：溪北岸能站的地方（脸朝水），村口附近的庄稼地
    bankClaims: {}, // 溪边洗衣裳的位置有人占了就换一个
    pool: west.work.pool.map((p) => ({ ...p, at: nav.nearestFree(...p.at) })).filter((p) => nav.reachable(...p.at) && Math.hypot(p.at[0] - p.face[0], p.at[1] - p.face[1]) < 6), // 西沟瀑布下水潭边钓鱼的位置
    poolClaims: {},
    // 进山砍柴：村外坡上（离村中心 18 米以外、草坡上）、西沟林子里路边的树，走得到的
    woods: [...trunks.filter(([x, z]) => Math.hypot(x, z - 5) > 18 && terrain.typeAt(x, z) === 'grass').map(([x, z]) => ({ at: nav.nearestFree(x + 0.9, z + 0.6, false, 2), tree: [x, z] })), ...west.work.woods]
      .filter((w) => nav.freeAt(...w.at) && nav.reachable(...w.at)),
    streamBank: (() => {
      const out = [];
      for (let x = -22; x <= 30; x += 1.5) {
        const z = streamZ(x) - 2.3;
        if (nav.freeAt(x, z) && nav.reachable(x, z) && !terrain.isWater(x, z) && terrain.isWater(x, z + 1.2)) out.push([x, z]);
      }
      return out;
    })(),
    playFields: [...farm.fields.fieldSoy, ...terrain.fieldCells.filter((c, i) => i % 5 === 0 && Math.hypot(c.x - 2, c.z - 10) < 28 && nav.freeAt(c.x, c.z) && nav.reachable(c.x, c.z)).map((c) => [c.x, c.z])],
  };
  const extraAnimals = [
    ...Array.from({ length: 4 }, () => ({ kind: 'goose', role: 'goose', worldArea: ducks, reach: duckReach })),
    ...Array.from({ length: 5 }, () => ({ kind: 'duck', role: 'duck', worldArea: ducks, reach: duckReach })),
    ...Array.from({ length: 8 }, (_, i) => ({ kind: 'pigeon', role: 'pigeon', cx: 0, cz: -8, r: 12, y: 22, offset: i * 0.35 })),
    // 骡帮的三头骡子：平常不在村里，逢集跟着牛老大来，到了村口在西边空地上站着
    ...Array.from({ length: 3 }, (_, i) => ({ kind: 'donkey', role: 'mule', caravan: 'niu_wanshan', name: ['大青', '二黑', '花脸'][i], worldArea: [nodes.sqW.x - 6, nodes.sqW.z - 6, nodes.sqW.x - 2.5, nodes.sqW.z - 1] })),
  ];
  V.bonfire = { lit: false };
  const life = populate(V, RESIDENTS, extraAnimals, startHour, { event, weather });
  for (const b of life.beasts) if (b.s.caravan) { // 驮骡：背上一边一个驮篓，中间捆着一卷布
    b.object.add(block(-0.42, 0.42, 0.26, 0.2, 0.82, 0.46, M.straw), block(-0.42, 0.42, -0.46, 0.2, 0.82, -0.26, M.straw), block(-0.3, 0.68, -0.26, 0.1, 0.9, 0.26, M.cloth));
  }
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
  const graveSmoke = graveAt && new Smoke(root, sprites, new THREE.Vector3(graveAt[0], graveAt[2] + 0.2, graveAt[1] + 0.5), 97, { size: 0.45, rise: 2.0, drift: 0.8, life: 0.3 }); // 清明：坟前烧纸
  const incense = shrine && new Smoke(root, sprites, shrine.burner.clone().setY(shrine.burner.y + shrine.h), 99, { size: 0.35, rise: 1.6, drift: 0.6, life: 0.25 });
  const rain = new Rain(root, BOUNDS, terrain.walkAt);
  const fireflies = new Fireflies(root, M.fireflySprite, [[-40, 40, 26 + BAND.d, 34 + BAND.d, -0.5], [-44, -30, -10, 20, 3], [32, 44, -20, 6, 4]], 50);
  const lights = [];
  const pointLight = (x, y, z, base, color = GLOW.lantern) => {
    const l = new THREE.PointLight(color, 0, 0.12, 1.4);
    l.position.set(x, y, z);
    root.add(l);
    lights.push({ l, base });
  };
  if (embers[0]) pointLight(embers[0].origin.x, embers[0].origin.y + 0.6, embers[0].origin.z, 0.05, GLOW.fire);
  pointLight(...[C.square.at(3.5, 0.5)].map(([x, z]) => [x, C.square.level + 3, z])[0], 0.055, GLOW.lamp); // 戏台灯笼打下来的光：暖黄，不是灯笼本身那么红
  pointLight(...[C.store.at(0, 6)].map(([x, z]) => [x, C.store.level + 3, z])[0], 0.04, GLOW.lamp);
  pointLight(torches[0].pos[0], terrain.walkAt(...torches[0].pos) + 2.4, torches[0].pos[1], 0.05, GLOW.fire);
  const [px, pz] = C.square.at(...C.square.evening.pit);
  pointLight(px, C.square.level + 1.2, pz, 0, GLOW.fire);
  const bonfireLight = lights[lights.length - 1];


  // 摊子摆出来时算障碍（收起来还原）
  let stallsUp = false;
  const stallCells = C.square.market.stalls.flatMap((st) => {
    const out = [];
    for (let dx = -0.95; dx <= 0.95; dx += 0.2) for (let dz = -0.55; dz <= 0.55; dz += 0.2) out.push(...nav.discCells(...C.square.at(st.x + Math.cos(st.rot) * dx + Math.sin(st.rot) * dz, st.z - Math.sin(st.rot) * dx + Math.cos(st.rot) * dz), 0.1));
    return [...new Set(out)];
  });
  const stallWas = stallCells.map((k) => nav.blocked[k]);
  const setStallBlock = (on) => stallCells.forEach((k, i) => { nav.blocked[k] = on ? 1 : stallWas[i]; });
  for (const st of C.square.market.stalls) st.obj.visible = false;

  // 戏台前的木条凳：平时摆成排；赶集那天摞到场子东边腾地方。导航里挡路的格子跟着摆法换
  const sqB = C.square, benchFoot = (x, z, r) => {
    const out = [];
    for (let d = -0.85; d <= 0.86; d += 0.2) for (let e = -0.15; e <= 0.16; e += 0.15) out.push(...nav.discCells(...sqB.at(x + Math.cos(r) * d + Math.sin(r) * e, z - Math.sin(r) * d + Math.cos(r) * e), 0.1));
    return out;
  };
  // 每条凳子在哪：row 摆在戏台前 / stack 摞在东边 / carried 有人扛着（不挡路、看不见，扛的人肩上有一条）
  const cellsOf = sqB.benches.map((b) => ({ row: benchFoot(...b.row), stack: benchFoot(...b.stack) }));
  const benchWas = new Map(cellsOf.flatMap((c) => [...c.row, ...c.stack]).map((k) => [k, nav.blocked[k]]));
  const where = sqB.benches.map(() => 'row');
  const refreshBenches = () => {
    for (const [k, v] of benchWas) nav.blocked[k] = v;
    sqB.benches.forEach((b, i) => {
      b.obj.visible = where[i] !== 'carried';
      if (where[i] === 'carried') return;
      for (const k of cellsOf[i][where[i]]) nav.blocked[k] = 1;
      const [x, z, r, y] = b[where[i]];
      b.obj.position.set(x, y, z); b.obj.rotation.y = r;
    });
  };
  refreshBenches();
  const benchSide = (i, w) => { const [x, z, r] = sqB.benches[i][w]; return r ? [x - 0.75, z] : [x, z + 0.65]; }; // 搬的人站在凳子哪边（摆着的站南边，摞着的站西边）
  const benches = { // 给 activities.js 的 moveBenches 用
    todo: (to) => where.map((w, i) => (w !== to && w !== 'carried' ? i : -1)).filter((i) => i >= 0),
    allAt: (to) => where.every((w) => w === to),
    pickAt: (i) => nav.nearestFree(...sqB.at(...benchSide(i, where[i] === 'carried' ? 'row' : where[i]))),
    dropAt: (i, to) => nav.nearestFree(...sqB.at(...benchSide(i, to))),
    face: (i, w) => sqB.at(sqB.benches[i][w][0], sqB.benches[i][w][1]),
    where: (i) => where[i],
    take: (i) => { where[i] = 'carried'; refreshBenches(); },
    put: (i, to) => { where[i] = to; refreshBenches(); },
    mover: null, // 散了集，正在往回搬的人
  };
  V.benches = benches;

  const lanternBase = M.lantern.color.clone();
  const spinners = Object.values(C).flatMap((c) => c.spinners.map((sp) => ({ ...sp, c })));
  const spinLocal = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let waterStep = 0;
  let last = 0;

  /** 这个位置叫什么：谁家院里 / 村口 / 场院，否则看地面——地里、溪边、路上、山坡上。 */
  const compoundAt = (x, z, pad = 0.3) => Object.values(C).find((c) => {
    const dx = x - c.object.position.x, dz = z - c.object.position.z, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    return Math.abs(cs * dx - sn * dz) <= c.w / 2 + pad && Math.abs(sn * dx + cs * dz) <= c.d / 2 + pad;
  }) ?? null;
  const whereAt = (x, z) => {
    if (x < BOUNDS.x0) return Math.hypot(x - V.mill.at[0], z - V.mill.at[1]) < 6 ? '水磨坊' : Math.hypot(x - V.temple.at[0], z - V.temple.at[1]) < 4 ? '山神庙' : west.placeAt(x, z).name; // 西沟
    const c = compoundAt(x, z);
    if (c) return PLACES[c.id];
    if (shrine && Math.hypot(x - shrine.at[0], z - shrine.at[1]) < 4) return '桥头土地庙';
    if (terrain.bridge && Math.hypot(x - terrain.bridge.x, z - terrain.bridge.z) < terrain.bridge.len / 2) return '石拱桥上';
    const t = terrain.typeAt(x, z);
    if (t === 'stream' || terrain.isWater(x, z + 1.5) || terrain.isWater(x, z - 1.5)) return '溪边';
    return { field: '地里', path: '路上', pad: '村里', grass: '山坡上' }[t] ?? '村里';
  };

  return {
    object: root,
    life,
    nav,
    gates,
    whereAt,
    compoundAt,
    things,
    C,
    terrain: ground, // 地面类型（村子 + 西沟，档案里的小地图用）
    M, // 西沟和村子共用一套材质
    west,
    update(t, viewerWorld) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      life.update(t, dt);
      // 走到西沟的人和动物挂到西沟那块沙盘下（两块坐标一样）：换场景时跟着那块一起显示 / 藏起来
      for (const a of life.people.concat(life.beasts)) {
        const host = a.pos.x < BOUNDS.x0 ? west.object : root;
        if (a.object.parent !== host) host.add(a.object);
      }
      const hour = life.clock.hour;
      const weather = V.weather();
      const L = overcast(daylight(hour), weather); // 阴天、雨天：太阳弱、天发灰，雨天白天屋里也点灯
      const n = L.night;
      rain.update(dt, weather === 'rain');

      const step = Math.floor(t * 2); // 溪水按整像素往西流
      if (step !== waterStep && !is('winter')) { waterStep = step; terrain.water.offset.x = (step % 36) / 36; } // 冬天溪面结冰，不流

      // 灯火：天一擦黑，窗户、灯笼、火把一盏盏亮起来；夜深了各家按自己的钟点一盏盏吹灯，
      // 只剩晚睡的两家（学堂李先生看书、药铺周郎中配药）和打更的灯笼；天不亮做早饭时又点上
      const asleep = (c) => (hour >= c.lightsOut && hour < 24) || hour < 4.6;
      for (const c of Object.values(C)) {
        const home = life.insideCount(c.id) > 0;
        const cooking = life.people.some((v) => v.inside && v.doing === 'cook' && v.p.home === c.id);
        c.lit = !asleep(c) || cooking;
        const k = c.lit ? Math.min(1, n * (home ? 1 : 0.45) + (cooking ? 0.35 : 0)) : 0;
        c.windowMat.color.setRGB(0.42 + 0.58 * k, 0.36 + 0.64 * k, 0.34 + 0.66 * k);
      }
      M.windowHalo.opacity = 0.75 * n;
      M.haloSprite.opacity = 0.2 + 0.8 * n;
      M.lantern.color.copy(lanternBase).multiplyScalar(0.55 + 0.45 * n);
      for (const ws of windowSprites) ws.visible = n > 0.05 && ws.userData.c.lit;
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
      // 今天的活动：场面道具（集市的摊子、电影幕布和放映机、土地庙的香火）
      const sqC = C.square;
      const marketOn = V.eventOn('market');
      if (marketOn !== stallsUp) { stallsUp = marketOn; for (const st of sqC.market.stalls) st.obj.visible = marketOn; setStallBlock(marketOn); }
      // 散了集，条凳还没摆回去：叫周六子（不在就叫小顺）来一条条搬回去（赶集前搬过去是他们俩在集市活动里的差事，见 life/events.js）
      if (!benches.allAt('row') && !(V.today() === 'market' && hour < EVENT_DEFS.market.to + 0.2) && !benches.mover && hour > 5 && hour < 21) {
        const v = ['xiao_liuzi', 'xiao_shun'].map((id) => V.byId[id]).find((p) => p && !p.inside && !p.errand && !String(p.doing).startsWith('market'));
        if (v) { benches.mover = v; v.interrupt('moveBenches', 'row'); }
      }
      const movieOn = V.eventOn('movie');
      sqC.screen.visible = sqC.projector.visible = movieOn;
      if (movieOn) sqC.screen.userData.pic.material = hour >= EVENT_DEFS.movie.from ? M.movie[Math.floor(t / 2.2) % M.movie.length] : M.plaster; // 开演前是一块白布
      incense?.update(dt, V.eventOn('shrine'));
      graveSmoke?.update(dt, V.eventOn('qingming'));
      fireflies.update(t);
      for (const ff of fireflies.flies) ff.visible &&= n > 0.4 && weather !== 'rain' && is('summer'); // 萤火虫：夏夜

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
      // 石磨、碾子：杆子跟着套在上面的牲口转（牲口还没走到圈上就不动，不会自己先转）
      for (const sp of spinners) {
        const b = life.beasts?.find((x) => x.circling && x.s.role === (sp.id === 'mill' ? 'donkey' : 'ox'));
        if (!b) continue;
        const m = sp.id === 'mill' ? b.s.mill : sp.c.roller;
        spinLocal.set(b.pos.x, 0, b.pos.z).sub(sp.c.object.position).applyAxisAngle(UP, -sp.c.object.rotation.y); // 牲口在院子本地坐标里的位置
        const dx = spinLocal.x - m.cx, dz = spinLocal.z - m.cz;
        if (Math.abs(Math.hypot(dx, dz) - m.r) > 0.6) continue;
        (sp.object.userData.spin ?? sp.object).rotation.y = -Math.atan2(dz, dx);
      }
      sprites.face(viewerWorld);
      return { hour, light: L, clock: life.clock };
    },
  };
}
