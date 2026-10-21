import * as THREE from 'three';
import { UNIT } from './pixel.js';

/*
 * 建村时的自检（结果挂在 root.userData 上，check.mjs 打出来；四项都为空才算没问题）。
 *   snapPerches   猫、喜鹊蹲的高处贴到真实表面上，算出哪两处之间跳得过去（顺手修，返回改了哪些）
 *   findFloating  悬空：贴地摆的东西，底下四角的地面低了一截
 *   markReachable 从井出发能走到的格子（nav.reach），动物、小孩、门口座位只挑这些地方
 *   auditPaths    走不到的房门 / 去处、不连通的路网节点（islands）、走不通的路（brokenEdges）
 */

const isSolidMesh = (o) => o.isMesh && !(o.geometry instanceof THREE.PlaneGeometry) && !o.geometry.type.includes('Circle');

/**
 * 猫、喜鹊蹲的高处：从点位上方往下打射线，贴到真实的表面上（屋面、墙头、缸沿、树冠）。
 * 点位是手填的，院子和物件挪过以后会对不上——蹲在半空或者陷进屋顶里。
 */
export function snapPerches(root, terrain, C) {
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const solid = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o !== terrain.object && o.material && o.material.side !== THREE.BackSide && !o.material.transparent && !(o.geometry instanceof THREE.PlaneGeometry)) solid.push(o); });
  solid.push(terrain.object);
  const fixed = [];
  for (const c of Object.values(C)) for (const a of c.animals) for (const pt of a.perches ?? []) {
    const [x, z] = c.at(pt[0], pt[2]);
    ray.set(root.localToWorld(new THREE.Vector3(x, c.level + pt[1] + 1.2, z)), new THREE.Vector3(0, -1, 0));
    ray.far = 6 * UNIT;
    const hit = ray.intersectObjects(solid, false)[0];
    if (!hit) continue;
    const y = root.worldToLocal(hit.point.clone()).y - c.level;
    if (Math.abs(y - pt[1]) > 0.05) fixed.push(`${c.id}/${a.kind}: ${pt[1].toFixed(2)}→${y.toFixed(2)}`);
    pt[1] = y;
  }
  // 两个高处之间跳不跳得过去：沿途往下探最高的面（屋顶、墙头、树冠），弧线要从它上面过；
  // 要抬得太高才过得去的（中间隔着一整座房子）就不跳。结果挂在 a.hops[i] = [{ j, lift }]
  const down = new THREE.Vector3(0, -1, 0);
  const topAt = (c, x, z, from) => { // 从弧线能到的最高处往下探（头顶上的树冠不算）
    ray.set(root.localToWorld(new THREE.Vector3(x, c.level + from, z)), down);
    ray.far = 20 * UNIT;
    const hit = ray.intersectObjects(solid, false)[0];
    return hit ? root.worldToLocal(hit.point.clone()).y - c.level : -Infinity;
  };
  for (const c of Object.values(C)) for (const a of c.animals) {
    const P = a.perches;
    if (!P || P.length < 2) continue;
    const base = a.role === 'bird' ? 3 : 1.2, most = a.role === 'bird' ? 5 : 2.2;
    a.hops = P.map(() => []);
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      let need = 0;
      for (let k = 1; k < 20; k++) {
        const t = k / 20, [x, z] = c.at(P[i][0] + (P[j][0] - P[i][0]) * t, P[i][2] + (P[j][2] - P[i][2]) * t);
        need = Math.max(need, (topAt(c, x, z, Math.max(P[i][1], P[j][1]) + most + 0.3) + 0.15 - (P[i][1] + (P[j][1] - P[i][1]) * t)) / Math.sin(Math.PI * t));
      }
      if (need > most) continue;
      const lift = Math.max(base, need);
      a.hops[i].push({ j, lift });
      a.hops[j].push({ j: i, lift });
    }
    a.hops.forEach((h, i) => { if (!h.length) fixed.push(`${c.id}/${a.kind}: 第 ${i} 个高处跳不过去`); });
  }
  return fixed;
}

/** 悬空：贴着地面摆的东西（底面 ≈ 中心处地面），四角下面的地面却低了一截。 */
export function findFloating(root, terrain) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4(), box = new THREE.Box3();
  const floating = [];
  const visit = (o) => {
    if (o === terrain.object || o.userData.dynamic || o.userData.tree || o.userData.onBridge || o.userData.inCliff || o.userData.tilted) return; // inCliff：嵌在崖壁里的（挂壁古道），本来就一半悬在崖外；tilted：顺着坡斜躺的原木
    if (isSolidMesh(o)) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      box.copy(b).applyMatrix4(rel);
      // 用物体自己朝向的底面四角（转过角度的院子里，轴对齐包围盒会大出一圈造成误报）
      const inset = 0.15;
      const pts = [[b.min.x + inset, b.min.z + inset], [b.max.x - inset, b.min.z + inset], [b.min.x + inset, b.max.z - inset], [b.max.x - inset, b.max.z - inset], [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2]]
        .map(([x, z]) => new THREE.Vector3(x, b.min.y, z).applyMatrix4(rel));
      const center = pts[4], base = box.min.y;
      if (Math.abs(base - terrain.walkAt(center.x, center.z)) < 0.1 && box.max.y - base > 0.2) {
        const drop = Math.max(...pts.slice(0, 4).map((q) => base - terrain.walkAt(q.x, q.z)));
        if (drop > 0.3) floating.push({ at: [+center.x.toFixed(1), +center.z.toFixed(1)], size: [+(b.max.x - b.min.x).toFixed(1), +(b.max.y - b.min.y).toFixed(1)], drop: +drop.toFixed(2) });
      }
    }
    for (const k of o.children) visit(k);
  };
  for (const k of root.children) visit(k);
  return floating;
}

/** 从 from（井）出发、人能走到的格子，记在 nav.reach。 */
export function markReachable(nav, from) {
  const seen = new Uint8Array(nav.nx * nav.nz);
  const start = nav.index(...nav.nearestFree(from.x, from.z, false, 4, true));
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const k = q.pop(), i = k % nav.nx, j = Math.floor(k / nav.nx);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nav.nx || nj >= nav.nz) continue;
      const n = nj * nav.nx + ni;
      if (!seen[n] && nav.step(k, n, false, true)) { seen[n] = 1; q.push(n); }
    }
  }
  nav.reach = seen;
  return seen;
}

/**
 * 每个院子从门外能不能走到每扇房门、每个去处、井（unreachable）；
 * 和井不连通的路网节点（islands，列出附近地面高度）；走不通的路（brokenEdges，沿线每 0.5 米的地面高度，# = 挡着）。
 */
export function auditPaths(nav, C, nodes, terrain, edges) {
  const unreachable = [];
  for (const c of Object.values(C)) {
    const [gx, gz] = c.gateOut();
    for (const [name, d] of [...Object.entries(c.doors).map(([k, v]) => [`door:${k}`, c.at(...v)]), ...Object.keys(c.spots).map((k) => [k, c.spot(k)])]) {
      if (!nav.find(gx, gz, d[0], d[1], { person: true })) unreachable.push(`${c.id}/${name}`);
    }
    if (!nav.find(gx, gz, nodes.well.x, nodes.well.z, { person: true })) unreachable.push(`${c.id}/→井`);
  }
  const seen = nav.reach ?? markReachable(nav, nodes.well);
  const brokenEdges = edges.filter(([a, b]) => !nav.find(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z, { person: true, maxNodes: 20000 })).map(([a, b]) => {
    const A = nodes[a], B = nodes[b], L = Math.hypot(B.x - A.x, B.z - A.z);
    const prof = [];
    for (let d = 0; d <= L; d += 0.5) { const x = A.x + ((B.x - A.x) * d) / L, z = A.z + ((B.z - A.z) * d) / L; prof.push(`${terrain.walkAt(x, z).toFixed(1)}${nav.freeAt(x, z, false, true) ? '' : '#'}`); }
    return `${a}→${b}: ${prof.join(' ')}`;
  });
  const islands = Object.entries(nodes).filter(([, n]) => !seen[nav.index(...nav.nearestFree(n.x, n.z, false, 4, true))]).map(([name, n]) => `${name}(${n.x.toFixed(1)},${n.z.toFixed(1)}) h=${n.h.toFixed(1)} 地面=${terrain.walkAt(n.x, n.z).toFixed(1)}`);
  return { unreachable, brokenEdges, islands };
}
