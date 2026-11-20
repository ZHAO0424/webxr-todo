// 掌心气象台 · 活的溪：每条溪是一串"流量"，从泉眼一节节往下传；堵住就挡住水的路（纯数据，Node 里能测）
//
// 溪画面上还是那几条固定的溪（sim 的布局），但水多少是活的：
//   - 每条溪沿途每 SP 米一个取样点，存流量 q（0 = 干，1 ≈ 平时）。泉眼一直出水；每一步每个点的 q 朝"上一个点上一步的 q"
//     靠近——所以水是一节节往下走的：堵住以后下游一段段慢慢干下去，坝没了一段段重新流起来，不是一刀截断。
//   - 堵住：溪床上堆的东西（土 + 沙 + 石 + 玻璃）超过 DAM_H 的那个点挡住了水。流到坝前的水不再往下传，
//     而是变成坝前的地表水（物质格 matter.js 里真的水）：积起来、涨、从坝顶或旁边低处漫出去、顺着地形自己找路。
//   - 汇回：地表水流进下游的溪床（物质格里溪的格子会吞水），吞进去的水就加进那一段的流量——漫出去的水绕一圈回到河道，下游又流起来。
//   - 坝上游的溪格子（连同流进它的支流）不吞水：坝前积的水就是水库，会一直往上游涨，不会被河道吞回去又放出来。
//   - 支流的流量在汇流口加进主流。结冰：流量冻住不动、也不往外放水。
//
// 用法：const d = createRivers(m, rivers, along)；每 0.1 s stepRivers(d, m, dt, { flow, frozen })。
//   rivers：sim 的 LAYOUT.rivers（点列，第一个点是泉眼）；along(x,z) → { ri, s, d }（sim.riverAlong）。
//   读 d.q[ri][i]（第 i 个取样点的流量）、d.dam[ri]（坝在哪个取样点，没堵是 -1）；qAt(d, ri, s)。
//   需要 matter 把溪格子吞掉的水记在 m.absorbed[k]（本模块读完清零）。事件：dammed / undammed。

import { MG, MC, center, index } from './matter.js';

export const SP = MC * 0.5;      // 取样间距
export const DAM_H = 0.0015;     // 溪床上堆了这么厚就挡住水
export const V0 = 0.004;         // 流量 1 每秒相当于多少地表水（物质格的"厚度×格"单位；溪水比倒的水多得多，坝前一两分钟能涨起来）
const RIVER_W = 0.009;           // 离中线这么近的水格子算溪（再远是湖）
const FRONT = 6;                 // 每秒往前传多少个取样点（水头的速度 ≈ FRONT × SP）

export function createRivers(m, rivers, along) {
  const n = MG * MG, cellRi = new Int8Array(n).fill(-1), cellI = new Int32Array(n);
  const paths = rivers.map(P => {
    const pts = []; let seg = 0, segStart = 0;
    const lens = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1])), total = lens.reduce((a, b) => a + b, 0);
    for (let s = 0; s <= total; s += SP) {
      while (seg < lens.length - 1 && s > segStart + lens[seg]) { segStart += lens[seg]; seg++; }
      const t = Math.min(1, (s - segStart) / lens[seg]), [ax, az] = P[seg], [bx, bz] = P[seg + 1];
      pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s });
    }
    return pts;
  });
  // 溪格子归哪条溪的哪个取样点（按最近的溪）
  for (let k = 0; k < n; k++) {
    if (m.kind[k] !== 2) continue;
    const [x, z] = center(k % MG, (k / MG) | 0), a = along(x, z);
    if (a.ri >= 0 && a.d < RIVER_W) { cellRi[k] = a.ri; cellI[k] = Math.min(paths[a.ri].length - 1, Math.round(a.s / SP)); }
  }
  // 支流汇进哪条溪的哪个点
  const joins = paths.map((pts, r) => {
    const e = pts[pts.length - 1]; let best = null;
    paths.forEach((o, r2) => { if (r2 === r) return; o.forEach((p, i) => { const dd = Math.hypot(p.x - e.x, p.z - e.z); if (dd < 0.006 && (!best || dd < best.d)) best = { r: r2, i, d: dd }; }); });
    return best;
  });
  return { paths, cellRi, cellI, joins, q: paths.map(p => new Float32Array(p.length).fill(1)), dam: paths.map(() => -1), held: paths.map(() => false), blockedCell: new Uint8Array(n), events: [] };
}

const piled = (m, k) => m.soil[k] + m.sand[k] + m.rock[k] + m.glass[k];
export const qAt = (d, ri, s) => { const q = d.q[ri]; if (!q) return 1; return q[Math.max(0, Math.min(q.length - 1, Math.round(s / SP)))]; };

export function stepRivers(d, m, dt, env = {}) {
  const spring = 0.4 + 0.8 * (env.flow ?? 0.3), absorbed = m.absorbed;
  // 1. 找坝
  d.paths.forEach((pts, r) => {
    let dam = -1;
    for (let i = 3; i < pts.length; i++) { const k = index(pts[i].x, pts[i].z); if (k >= 0 && piled(m, k) > DAM_H) { dam = i; break; } }
    if ((dam < 0) !== (d.dam[r] < 0)) d.events.push({ type: dam < 0 ? 'undammed' : 'dammed', ri: r });
    d.dam[r] = dam;
  });
  // 哪些溪的水被挡着（自己有坝，或汇进的那条溪在汇流口下游有坝）：它们坝前的格子不吞水（坝前的水库往上游涨）
  d.paths.forEach((_, r) => { const j = d.joins[r]; d.held[r] = d.dam[r] >= 0 || (!!j && d.dam[j.r] > j.i); });
  // 2. 溪格子吞掉的地表水 → 加到那个取样点的流量里（漫出去的水回到下游河道）
  const add = d.paths.map(p => new Float32Array(p.length));
  if (absorbed) for (let k = 0; k < absorbed.length; k++) {
    const v = absorbed[k]; if (!v) continue; absorbed[k] = 0;
    const r = d.cellRi[k]; if (r >= 0) add[r][d.cellI[k]] += v / (V0 * dt);
  }
  // 3. 被挡着的溪：坝前的格子不吞水（kind 2 → 1，记下来，恢复时改回）；坝下游照常吞水（汇回）
  for (let k = 0; k < d.cellRi.length; k++) {
    const r = d.cellRi[k]; if (r < 0) continue;
    const hold = d.held[r] && (d.dam[r] < 0 || d.cellI[k] <= d.dam[r] + 1);
    if (hold && !d.blockedCell[k]) { d.blockedCell[k] = 1; m.kind[k] = 1; }
    else if (!hold && d.blockedCell[k]) { d.blockedCell[k] = 0; m.kind[k] = 2; }
  }
  if (env.frozen) return;
  // 4. 往下传：每个点朝上一个点"上一步"的流量靠（一节节走）；支流先算，汇进主流
  const order = d.paths.map((_, r) => r).sort((a, b) => (d.joins[a] ? 0 : 1) - (d.joins[b] ? 0 : 1));
  const joinIn = d.paths.map(p => new Float32Array(p.length));
  const k0 = Math.min(1, dt * FRONT);
  for (const r of order) {
    const q = d.q[r], old = q.slice(), dam = d.dam[r];
    for (let i = 0; i < q.length; i++) {
      let inflow = (i === 0 ? spring : old[i - 1]) + add[r][i] + joinIn[r][i];
      if (dam >= 0 && i === dam) {   // 坝：水不往下走，放进坝前的地表水
        const p = d.paths[r][Math.max(0, dam - 3)], kk = index(p.x, p.z);
        if (kk >= 0) m.water[kk] += (old[Math.max(0, i - 1)] + joinIn[r][i]) * V0 * dt;
        inflow = add[r][i];
      }
      q[i] += (Math.min(3, inflow) - q[i]) * k0;
      if (q[i] < 0.002) q[i] = 0;
    }
    const j = d.joins[r]; if (j) joinIn[j.r][j.i] += q[q.length - 1];
  }
}
