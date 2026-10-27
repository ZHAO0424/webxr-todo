import * as THREE from 'three';

/*
 * 贴图重叠检查（?overlap=1，结果挂在 root.userData.overlap，check.mjs 打出来）。
 *
 * coplanar.js 只看方块、棱柱、贴花平面，修的时候也只会撑方块；这里按三角面查，什么网格都算进去：
 * 地形（地面、水面、跌水、坎子）、体素网格、程序拼出来的几何……
 * 两个三角面在同一个平面上（朝向相同，相距不到 TOL）、投影下来又真的叠在一起（交出来的面积 > MIN_AREA），
 * GPU 分不清谁在前，画出来一闪一闪。
 *
 * 同一个材质、没有贴图、顶点色也一样的两片叠在一起看不出来，单独记作 same（不算问题）。
 * 结果按「哪两样东西」归类：{ pairs, area, at（一处的坐标，本地米） }，面积大的在前。
 */

const TOL = 0.004;
const MIN_AREA = 0.0004; // 2 厘米见方
let ON = false;
export const auditOverlaps = (on) => { ON = !!on; };
export const overlapAuditOn = () => ON;

const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

/** 两个凸多边形（二维点数组）交出来的面积：Sutherland–Hodgman 裁剪。 */
function clipArea(P, Q) {
  let out = P;
  for (let i = 0; i < Q.length && out.length; i++) {
    const [ax, ay] = Q[i], [bx, by] = Q[(i + 1) % Q.length];
    const side = (p) => (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
    const inp = out; out = [];
    for (let k = 0; k < inp.length; k++) {
      const p = inp[k], q = inp[(k + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  let a = 0;
  for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}

const ccw = (t) => ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) < 0 ? [t[0], t[2], t[1]] : t);

/**
 * root 下所有网格（skip(o) 为真的子树不查；描边外壳、精灵、实例化的花草树木不查）两两找共面重叠。
 * names：材质 → 名字（M 里的键），报告里好认。
 */
export function findOverlaps(root, { skip = () => false, names = new Map() } = {}) {
  const t0 = performance.now();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  const buckets = new Map();
  let owners = 0, tris = 0;
  const label = (o, mat) => {
    for (let p = o; p && p !== root; p = p.parent) { if (p.userData.thing) return p.userData.thing; if (p.userData.label) return p.userData.label; if (p.userData.plot) return 'plot:' + p.userData.plot; }
    return names.get(mat) ?? `${o.geometry.type}`;
  };
  const visit = (o) => {
    if (skip(o) || o.isSprite || !o.visible) return; // 藏起来的（收着的门板、白天的火光）不查
    if (o.isMesh && !o.isInstancedMesh) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      const geo = o.geometry, pos = geo.attributes.position, idx = geo.index, col = geo.attributes.color;
      const n = idx ? idx.count : pos.count, owner = owners++;
      const mats = Array.isArray(o.material) ? o.material : null;
      const groups = mats ? geo.groups : [{ start: 0, count: n, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = mats ? mats[gr.materialIndex] : o.material;
        if (!mat || mat.side === THREE.BackSide || mat.visible === false || (mat.transparent && !mat.depthWrite)) continue; // 描边外壳只画背面；不写深度的光晕不会闪
        for (let i = gr.start; i < gr.start + gr.count; i += 3) {
          const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
          va.fromBufferAttribute(pos, ia).applyMatrix4(rel); vb.fromBufferAttribute(pos, ib).applyMatrix4(rel); vc.fromBufferAttribute(pos, ic).applyMatrix4(rel);
          const nrm = e1.subVectors(vb, va).cross(e2.subVectors(vc, va));
          const len = nrm.length();
          if (len < 1e-7) continue;
          nrm.divideScalar(len);
          if (nrm.y < -0.9) continue; // 朝下的面（底面）看不见
          tris++;
          const key = `${Math.round(nrm.x * 500)},${Math.round(nrm.y * 500)},${Math.round(nrm.z * 500)}`;
          if (!buckets.has(key)) buckets.set(key, { n: nrm.clone(), list: [] });
          const color = col ? `${col.getX(ia).toFixed(2)},${col.getY(ia).toFixed(2)},${col.getZ(ia).toFixed(2)}` : '';
          buckets.get(key).list.push({ d: nrm.dot(va), p: [va.clone(), vb.clone(), vc.clone()], owner, o, mat, color });
        }
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);

  const found = new Map();
  for (const { n, list } of buckets.values()) {
    if (list.length < 2) continue;
    list.sort((p, q) => p.d - q.d);
    const u = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(n).normalize() : new THREE.Vector3(1, 0, 0).cross(n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    for (let s = 0; s < list.length;) { // 一串相距不到 TOL 的面算同一个平面
      let e = s + 1;
      while (e < list.length && list[e].d - list[e - 1].d < TOL) e++;
      if (e - s > 1) {
        const grid = new Map(), C = 1;
        for (let i = s; i < e; i++) {
          const f = list[i];
          f.t = ccw(f.p.map((q) => [q.dot(u), q.dot(v)]));
          f.b = [Math.min(...f.t.map((q) => q[0])), Math.min(...f.t.map((q) => q[1])), Math.max(...f.t.map((q) => q[0])), Math.max(...f.t.map((q) => q[1]))];
          const seen = new Set();
          for (let gx = Math.floor(f.b[0] / C); gx <= Math.floor(f.b[2] / C); gx++) for (let gy = Math.floor(f.b[1] / C); gy <= Math.floor(f.b[3] / C); gy++) {
            const k = gx * 100003 + gy, cell = grid.get(k);
            if (cell) for (const g of cell) {
              if (g.owner === f.owner || seen.has(g) || Math.abs(g.d - f.d) >= TOL) continue;
              seen.add(g);
              if (g.b[0] >= f.b[2] || f.b[0] >= g.b[2] || g.b[1] >= f.b[3] || f.b[1] >= g.b[3]) continue;
              const area = clipArea(f.t, g.t);
              if (area < MIN_AREA * 0.25) continue;
              const same = f.mat === g.mat && !f.mat.map && f.color === g.color;
              const [la, lb] = [label(f.o, f.mat), label(g.o, g.mat)].sort();
              const key = `${same ? 'same' : 'diff'}|${la}~${lb}`;
              const r = found.get(key) ?? { same, a: la, b: lb, pairs: 0, area: 0, at: null };
              r.pairs++; r.area += area;
              if (!r.at) { const c = f.p[0].clone().add(f.p[1]).add(f.p[2]).multiplyScalar(1 / 3); r.at = [c.x, c.y, c.z].map((x) => +x.toFixed(2)); r.n = [n.x, n.y, n.z].map((x) => +x.toFixed(2)); r.what = [f, g].map((h) => `${names.get(h.mat) ?? h.mat.type}:${h.o.geometry.type.replace('Geometry', '')}${h.o.geometry.parameters ? '[' + Object.values(h.o.geometry.parameters).slice(0, 3).map((x) => +(+x).toFixed(2)).join('x') + ']' : ''}`).join(' / '); }
              found.set(key, r);
            }
            if (cell) cell.push(f); else grid.set(k, [f]);
          }
        }
      }
      s = e;
    }
  }
  const all = [...found.values()].filter((r) => r.area >= MIN_AREA).sort((p, q) => q.area - p.area);
  const bad = all.filter((r) => !r.same);
  return { ms: Math.round(performance.now() - t0), tris, owners, bad: bad.length, same: all.length - bad.length, list: bad.slice(0, 40).map((r) => `${r.a} ~ ${r.b}: ${r.pairs}对 ${r.area.toFixed(3)}平米 @${r.at} n${r.n} (${r.what})`), sameList: all.filter((r) => r.same).slice(0, 8).map((r) => `${r.a} ~ ${r.b}: ${r.pairs}对 ${r.area.toFixed(3)}平米 @${r.at}`) };
}
