// 掌心气象台 · 堵溪：在溪里堆土 / 沙 / 石头堵住，下游断流，上游的水憋在坝前、涨起来、从旁边或坝顶漫过去（纯数据，Node 里能测）
//
// 溪本身是固定画好的（sim 的布局），水不在物质格里流；堵住以后改成这样：
//   1. 顺着每条溪从泉眼往下找：第一处溪床上堆的东西（土 + 沙 + 石 + 玻璃）超过 DAM_H 的地方就是坝；
//   2. 坝前 BACK 米到下游的溪格子变成"干河床"（物质格的 kind 从 2 水 改成 1 陆地）：不再吞水，画面上那段溪也不画了；
//   3. 泉水照样来：每秒往坝前 FEED 米那一格放一些地表水（溪水越满放得越多，结冰就不放）。
//      地表水自己按高差流：在坝前积成一汪，涨过坝顶或从旁边低的地方漫出去，顺着旧河床往下淌；
//      漫过土坝的急流会慢慢把坝冲开（matter.js 的冲刷）。坝没了，河床恢复成溪。
//
// 用法：const d = createDams(m, rivers, along)；每 0.1 s stepDams(d, m, dt, { flow, frozen })。
//   rivers 是 sim 的 LAYOUT.rivers（点列，第一个点是泉眼）；along(x,z) → { ri, s, d }（sim.riverAlong）。
//   d.cut[ri]：这条溪从多远开始不画（没堵是 Infinity）。事件放在 d.events：dammed / undammed。

import { MG, MC, center, index } from './matter.js';

export const DAM_H = 0.0015;   // 溪床上堆了这么厚才算堵住
const BACK = 0.03;             // 坝前多长一段变成"水库"（地表水在这里积起来）
const FEED = 0.012;            // 泉水放在坝前多远
const RIVER_W = 0.009;         // 离中线这么近的水格子才算溪（再远是湖）

export function createDams(m, rivers, along) {
  const n = MG * MG, ri = new Int8Array(n).fill(-1), s = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (m.kind[k] !== 2) continue;
    const [x, z] = center(k % MG, (k / MG) | 0), a = along(x, z);
    if (a.ri >= 0 && a.d < RIVER_W) { ri[k] = a.ri; s[k] = a.s; }
  }
  // 每条溪沿途的取样点（半格一个）
  const paths = rivers.map(P => {
    const out = []; let acc = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az), nS = Math.max(1, Math.ceil(L / (MC * 0.5)));
      for (let q = 0; q < nS; q++) { const t = q / nS; out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s: acc + L * t }); }
      acc += L;
    }
    return out;
  });
  // 每个取样点周围（RIVER_W 内）是溪的那些格子：按每条溪自己的路径算干河床（汇流口附近的格子算到哪条溪都对）
  for (const path of paths) for (const p of path) {
    p.cells = [];
    const i0 = Math.floor((p.x + 0.17) / MC), j0 = Math.floor((p.z + 0.17) / MC), rr = Math.ceil(RIVER_W / MC);
    for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= MG || j >= MG) continue;
      const k = j * MG + i, [x, z] = center(i, j);
      if (ri[k] >= 0 && Math.hypot(x - p.x, z - p.z) < RIVER_W) p.cells.push(k);
    }
  }
  return { ri, s, paths, dam: rivers.map(() => Infinity), cut: rivers.map(() => Infinity), dry: new Uint8Array(n), want: new Uint8Array(n), events: [] };
}

const piled = (m, k) => m.soil[k] + m.sand[k] + m.rock[k] + m.glass[k];

export function stepDams(d, m, dt, env = {}) {
  const flow = env.flow ?? 0.3;
  d.paths.forEach((path, r) => {
    let dam = Infinity;
    for (const p of path) { if (p.s < 0.008) continue; const k = index(p.x, p.z); if (k >= 0 && piled(m, k) > DAM_H) { dam = p.s; break; } }
    if ((dam === Infinity) !== (d.dam[r] === Infinity)) d.events.push({ type: dam === Infinity ? 'undammed' : 'dammed', ri: r });
    d.dam[r] = dam; d.cut[r] = dam === Infinity ? Infinity : Math.max(0, dam - BACK);
    // 泉水憋在坝前：放进地表水
    if (dam !== Infinity && !env.frozen) {
      const fs = Math.max(0, dam - FEED), p = path.reduce((b, q) => Math.abs(q.s - fs) < Math.abs(b.s - fs) ? q : b, path[0]), k = index(p.x, p.z);
      if (k >= 0) m.water[k] += dt * 0.0012 * (0.3 + flow);
    }
  });
  // 坝前到下游的溪格子：干河床（陆地），不吞水；没堵了恢复成溪
  d.want.fill(0);
  d.paths.forEach((path, r) => { if (d.cut[r] < Infinity) for (const p of path) if (p.s >= d.cut[r]) for (const k of p.cells) d.want[k] = 1; });
  // 没堵的支流，汇流口落进了别的溪被截断的那段：它最后一小截也变成河床（不然它会把水库的水吞掉），水从那里流进水库
  d.paths.forEach((path, r) => {
    if (d.dam[r] !== Infinity) return;
    const end = path[path.length - 1], k = index(end.x, end.z);
    if (k >= 0 && d.want[k]) { d.cut[r] = Math.max(0, end.s - BACK); for (const p of path) if (p.s >= d.cut[r]) for (const kk of p.cells) d.want[kk] = 1; }
  });
  for (let k = 0; k < d.ri.length; k++) {
    if (d.ri[k] < 0) continue;
    if (d.want[k] && !d.dry[k]) { d.dry[k] = 1; m.kind[k] = 1; }
    else if (!d.want[k] && d.dry[k]) { d.dry[k] = 0; m.kind[k] = 2; }
  }
  // 没堵的支流：汇流口落在别的溪被截断的那段（干河床 / 水库）里 → 它的水也放进那里
  if (!env.frozen) d.paths.forEach((path, r) => {
    if (d.dam[r] !== Infinity) return;
    const end = path[path.length - 1], k = index(end.x, end.z);
    if (k >= 0 && d.dry[k]) m.water[k] += dt * 0.0012 * (0.3 + flow);
  });
}
