import * as THREE from 'three';

/*
 * 共面检查（z-fighting）。
 *
 * 两个面在同一个平面上、朝同一个方向、又有重叠，GPU 分不清谁在前，画出来就一闪一闪
 * （院墙和门柱、两段墙的拐角、墙顶和压顶、台基和台阶……）。
 *
 * 做法：把所有静态方块（BoxGeometry 的 6 个面）、棱柱的顶面 / 底面、贴花平面都算到 root 坐标里，
 * 按"法线 + 到原点的距离"分桶；桶里朝向相同的两两比较，投影到平面上有重叠就是一对。
 * 修：小的那个面所在的方块沿那根轴两边各撑出 EPS（门柱、装饰柱就微微凸出墙面）；贴花沿法线往外挪 EPS。
 */

const EPS = 0.012; // 1.2 厘米（沙盘 1:110 下眼睛看不出来，深度缓冲分得开）
const TOL = 0.004; // 两个面相距不到 4 毫米就算共面（缩到 1:110 以后只有 0.04 毫米）
const BOX_AXES = ['x', 'x', 'y', 'y', 'z', 'z']; // BoxGeometry 的 6 组面：+x -x +y -y +z -z
const tmp = new THREE.Vector3();

function facesOf(mesh, toRoot) {
  const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
  const out = [];
  const corners = (start, count) => {
    const pts = [];
    for (let i = start; i < start + count; i++) pts.push(tmp.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(toRoot).clone());
    return pts;
  };
  const push = (pts, kind, axis, sign = 1) => {
    if (pts.length < 3) return;
    const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0]));
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    out.push({ mesh, pts, n, d: n.dot(pts[0]), kind, axis, sign });
  };
  if (geo.type === 'BoxGeometry') geo.groups.forEach((g, i) => push(corners(g.start, g.count), 'box', BOX_AXES[i], i % 2 ? -1 : 1));
  else if (geo.type === 'CylinderGeometry') {
    geo.groups.slice(1).forEach((g, i) => push(corners(g.start, g.count), 'cap', 'y', i ? -1 : 1)); // 组 1 = 顶面，组 2 = 底面
    const side = geo.groups[0]; // 侧面：每一棱是 2 个三角形 = 6 个下标
    if (geo.parameters.heightSegments === 1) for (let i = side.start; i < side.start + side.count; i += 6) push(corners(i, 6).filter((p, k, arr) => arr.findIndex((q) => q.distanceToSquared(p) < 1e-10) === k), 'side', 'xz');
  }
  else if (geo.type === 'PlaneGeometry') push(corners(0, idx ? idx.count : pos.count), 'plane', 'z');
  return out;
}

function area2D(f, u, v) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of f.pts) { const a = p.dot(u), b = p.dot(v); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
  return [x0, y0, x1, y1];
}

/** 找出所有共面重叠的面对。skip(o)：不参与检查的节点（地形、树、会动的东西……）。 */
export function findCoplanar(root, skip) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map();
  const visit = (o) => {
    if (skip(o)) return;
    if (o.isMesh && !o.isInstancedMesh && o.material && o.material.side !== THREE.BackSide) { // 描边外壳（只画背面）不查
      rel.multiplyMatrices(inv, o.matrixWorld);
      for (const f of facesOf(o, rel)) {
        if (f.n.y < -0.9) continue; // 朝下的面（底面）看不见
        const key = `${Math.round(f.n.x * 200)},${Math.round(f.n.y * 200)},${Math.round(f.n.z * 200)}`; // 按朝向分桶，桶里再按距离排序比较
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(f);
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  const pairs = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    list.sort((p, q) => p.d - q.d);
    const n = list[0].n;
    const u = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(n).normalize() : new THREE.Vector3(1, 0, 0).cross(n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const rects = list.map((f) => area2D(f, u, v));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].d - list[i].d < TOL; j++) {
      const a = list[i], b = list[j];
      if (a.mesh === b.mesh || a.n.dot(b.n) < 0.999) continue;
      const [ax0, ay0, ax1, ay1] = rects[i], [bx0, by0, bx1, by1] = rects[j];
      const w = Math.min(ax1, bx1) - Math.max(ax0, bx0), h = Math.min(ay1, by1) - Math.max(ay0, by0);
      if (w > 0.01 && h > 0.01) pairs.push({ a, b, overlap: w * h });
    }
  }
  return pairs;
}

/**
 * 修：同一平面里互相重叠的一组面按面积从大到小排，最大的不动，其余的只把这一面往外推 EPS、2·EPS……依次错开
 * （方块只动这一面：沿那根轴放长、同时挪半个长度，另一面不动；贴花整体沿法线挪）。
 */
export function fixCoplanar(root, skip, rounds = 3) {
  const report = { found: 0, left: 0, samples: [], rounds: 0 };
  for (let r = 0; r < rounds; r++) {
    const n = fixRound(root, skip, report);
    if (!r) report.found = n;
    report.rounds = r + 1;
    if (!report.left) break; // 修的时候撑出来的面偶尔又顶进别的面里，再来一轮
  }
  return report;
}

function fixRound(root, skip, report) {
  const pairs = findCoplanar(root, skip);
  // 同一平面的面连成组（并查集）
  const parent = new Map();
  const find = (f) => { while (parent.get(f) !== f) f = parent.get(f); return f; };
  for (const { a, b } of pairs) {
    for (const f of [a, b]) if (!parent.has(f)) parent.set(f, f);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map();
  for (const f of parent.keys()) { const r = find(f); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); }
  const area = (f) => { const b = new THREE.Box3().setFromPoints(f.pts), s = b.getSize(new THREE.Vector3()); return s.x * s.y + s.y * s.z + s.x * s.z; };
  for (const list of groups.values()) {
    list.sort((p, q) => area(q) - area(p) || (p.kind === 'plane') - (q.kind === 'plane'));
    list.forEach((f, rank) => {
      if (!rank) return;
      const off = EPS * rank;
      if (report.samples.length < 10 && !report.rounds) {
        const c = f.pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / f.pts.length);
        report.samples.push(`${f.kind}/${f.axis}@${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}`);
      }
      if (f.kind === 'plane') { f.mesh.translateZ(off); return; }
      if (f.kind === 'side') { // 棱柱侧面：整根柱子径向撑粗
        const r = Math.max(f.mesh.geometry.parameters.radiusTop, f.mesh.geometry.parameters.radiusBottom);
        f.mesh.scale.x += off / r; f.mesh.scale.z += off / r;
        f.mesh.updateMatrixWorld(true);
        return;
      }
      const geo = f.mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const size = geo.boundingBox.max[f.axis] - geo.boundingBox.min[f.axis];
      if (size < 1e-4) return;
      const axis = new THREE.Vector3(f.axis === 'x' ? 1 : 0, f.axis === 'y' ? 1 : 0, f.axis === 'z' ? 1 : 0);
      f.mesh.scale[f.axis] += off / size;
      f.mesh.translateOnAxis(axis, (f.sign * off) / 2);
      f.mesh.updateMatrixWorld(true);
    });
  }
  const left = findCoplanar(root, skip);
  report.left = left.length;
  const desc = (f) => { const c = f.pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / f.pts.length); const g = f.mesh.geometry.parameters ?? {}; return `${f.mesh.scale.toArray().map((x) => +x.toFixed(3))}|${f.kind}/${f.axis}${f.sign > 0 ? "+" : "-"}[${Object.values(g).slice(0, 3).map((x) => +(+x).toFixed(2)).join('x')}]n${f.n.toArray().map((x) => +x.toFixed(2))}@${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}`; };
  report.leftSamples = left.slice(0, 14).map((p) => `${desc(p.a)} ~ ${desc(p.b)}`);
  return pairs.length;
}
