// 三条轨道、同轨道上的星球等距排开（同周期 → 夹角永远不变 → 同轨道永不相碰，每条轨道自身就是平衡的）。
// 求：相邻轨道「在屏幕投影里、任意相位」都不碰的最小半长轴；再逐帧模拟一个较长时间窗，复核两两间距和平衡度。
const RATIO = 0.46, DEPTH = 0.12, MARGIN = 10, SUN_R = 86, SUN_CLEAR = 1.15;
const lanes = [
  { e: 0.04, w: 0.3, bodies: [{ id: 'neon-strike', r: 29 }, { id: 'pixel-village', r: 33 }] },
  { e: 0.04, w: 2.2, bodies: [{ id: 'masterpieces', r: 37 }, { id: 'jelly-harbor', r: 33, reff: 33 * 1.45 }, { id: 'particle-fields', r: 14, reff: 14 * 2.3 }] },
  { e: 0.035, w: 4.6, bodies: [{ id: 'swarm', r: 37 }, { id: 'beat-gates', r: 35, reff: 35 * 1.35 }] },
];
const R = b => b.reff || b.r;
const laneR = l => Math.max(...l.bodies.map(R));
function pts(l, n = 360) {
  const b = l.a * Math.sqrt(1 - l.e * l.e), out = [];
  for (let i = 0; i < n; i++) {
    const E = i / n * Math.PI * 2, xo = l.a * (Math.cos(E) - l.e), yo = b * Math.sin(E), c = Math.cos(l.w), s = Math.sin(l.w);
    const px = c * xo - s * yo, py = s * xo + c * yo;
    out.push({ x: px, y: py * RATIO, s: 1 - DEPTH * Math.max(-1, Math.min(1, py / l.a)) });
  }
  return out;
}
function clearance(l1, l2) { const A = pts(l1), B = pts(l2); let m = 1e9; for (const p of A) for (const q of B) m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y) - laneR(l1) * p.s - laneR(l2) * q.s); return m; }
{ const l = lanes[0]; let lo = 50, hi = 900;
  const ok = a => { l.a = a; return pts(l).every(p => p.y > 0 || Math.hypot(p.x, p.y) - laneR(l) * p.s >= SUN_R * SUN_CLEAR + MARGIN); };
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; } l.a = Math.ceil(hi); }
for (let i = 1; i < lanes.length; i++) { const l = lanes[i]; let lo = lanes[i - 1].a, hi = lo + 700;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; l.a = m; if (clearance(lanes[i - 1], l) >= MARGIN) hi = m; else lo = m; } l.a = Math.ceil(hi); }
// 周期：开普勒第三定律
const T0 = 110; for (const l of lanes) l.T = T0 * Math.pow(l.a / lanes[0].a, 1.5);
// 各轨道起始相位：轨道之间错开，尽量不让三条轨道的星球同时堆在同一方向
const phase0 = [0.4, 1.5, 2.9];
const bodies = [];
lanes.forEach((l, li) => l.bodies.forEach((b, j) => bodies.push({ ...b, lane: li, M: phase0[li] + j * Math.PI * 2 / l.bodies.length })));
function pos(b, t) {
  const l = lanes[b.lane], M = b.M + Math.PI * 2 * t / l.T; let E = M;
  for (let i = 0; i < 8; i++) E -= (E - l.e * Math.sin(E) - M) / (1 - l.e * Math.cos(E));
  const bb = l.a * Math.sqrt(1 - l.e * l.e), xo = l.a * (Math.cos(E) - l.e), yo = bb * Math.sin(E), c = Math.cos(l.w), s = Math.sin(l.w);
  const px = c * xo - s * yo, py = s * xo + c * yo;
  return { x: px, y: py * RATIO, s: 1 - DEPTH * Math.max(-1, Math.min(1, py / l.a)), ang: Math.atan2(py, px) };
}
const SPAN = 6 * 3600, N = 60000;   // 模拟 6 小时
let minClr = 1e9, worstBal = 0, sumBal = 0, worstPair = '';
for (let k = 0; k < N; k++) {
  const t = k / N * SPAN, P = bodies.map(b => pos(b, t));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const c = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y) - R(bodies[i]) * P[i].s - R(bodies[j]) * P[j].s;
    if (c < minClr) { minClr = c; worstPair = bodies[i].id + ' / ' + bodies[j].id; }
  }
  let cx = 0, cy = 0; for (const p of P) { cx += Math.cos(p.ang); cy += Math.sin(p.ang); }
  const bal = Math.hypot(cx, cy) / P.length; worstBal = Math.max(worstBal, bal); sumBal += bal;
}
console.log(JSON.stringify({ RATIO, DEPTH, minClearance: +minClr.toFixed(1), worstPair, worstBalance: +worstBal.toFixed(3), meanBalance: +(sumBal / N).toFixed(3),
  lanes: lanes.map(l => ({ a: l.a, e: l.e, w: l.w, T: +l.T.toFixed(1), bodies: l.bodies.map(b => b.id) })),
  bodies: bodies.map(b => ({ id: b.id, lane: b.lane, M: +b.M.toFixed(3) })) }, null, 1));
