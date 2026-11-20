// 活的溪：流量一节节往下走；堵住挡住水的路——下游慢慢干、坝前积水漫出去自己找路、绕回河道下游又流起来
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, step, index } from '../matter.js';
import { createRivers, stepRivers, SP } from '../dam.js';

// 一条从西往东往下流的溪：V 形河谷，中线 z = 0
const RIV = [[[-0.1, 0], [0.1, 0]]];
const along = (x, z) => ({ ri: 0, s: x + 0.1, d: Math.abs(z) });
const valley = (x, z) => 0.03 - x * 0.05 + Math.abs(z) * 0.25;
const world = () => createMatter(valley, (x, z) => Math.hypot(x, z) > 0.17 ? 'out' : Math.abs(z) < 0.005 ? 'water' : 'rock');
const damAt = (m, x0) => { for (let x = x0 - 0.004; x <= x0 + 0.004; x += 0.002) for (let z = -0.012; z <= 0.012; z += 0.002) pour(m, 'soil', x, z, 0.0008); };
const run = (d, m, secs, env = {}) => { for (let t = 0; t < secs; t += 0.1) { stepRivers(d, m, 0.1, env); step(m, 0.1, { wet: () => 1, ...env }); } };
const qx = (d, x) => d.q[0][Math.round((x + 0.1) / SP)];

test('平时：整条溪都有水，不往外放地表水', () => {
  const m = world(), d = createRivers(m, RIV, along); run(d, m, 3);
  assert.equal(d.dam[0], -1); assert.ok(qx(d, 0.08) > 0.3, 'q ' + qx(d, 0.08));
});

test('堵住：下游一段段慢慢干（不是一刀截断）；坝前的水变成真的地表水积起来', () => {
  const m = world(), d = createRivers(m, RIV, along); run(d, m, 15); damAt(m, 0); for (let t = 0; t < 1; t += 0.1) step(m, 0.1);
  run(d, m, 0.6);
  assert.ok(d.dam[0] > 0 && d.events.some(e => e.type === 'dammed'));
  const near = d.q[0][d.dam[0] + 3];
  assert.ok(near < qx(d, 0.08) * 0.5, `near dam dries first: ${near} vs far ${qx(d, 0.08)}`);
  assert.ok(qx(d, 0.08) > 0.2, 'far downstream still flowing for a moment ' + qx(d, 0.08));
  let low = 9; for (let t = 0; t < 25; t += 0.1) { stepRivers(d, m, 0.1); step(m, 0.1, { wet: () => 1 }); low = Math.min(low, qx(d, 0.08)); }
  assert.ok(low < 0.1, 'downstream ran dry for a while ' + low);
  assert.ok(m.water[index(-0.008, 0)] > 0.0005, 'pooled behind dam ' + m.water[index(-0.008, 0)]);
});

test('一直憋：水从旁边 / 坝顶漫出去，流回下游河道，下游又流起来', () => {
  const m = world(), d = createRivers(m, RIV, along); damAt(m, 0); for (let t = 0; t < 1; t += 0.1) step(m, 0.1);
  let back = false;
  for (let t = 0; t < 120 && !back; t += 0.1) { stepRivers(d, m, 0.1, { flow: 1 }); step(m, 0.1, { wet: () => 1 }); back = qx(d, 0.06) > 0.05; }
  assert.ok(back, 'rejoined downstream ' + qx(d, 0.06));
});

test('把坝挖掉：水一节节流回下游；结冰：流量不动、不放水', () => {
  const m = world(), d = createRivers(m, RIV, along); damAt(m, 0); for (let t = 0; t < 1; t += 0.1) step(m, 0.1);
  run(d, m, 10);
  for (let k = 0; k < m.soil.length; k++) m.soil[k] = 0;
  run(d, m, 1.5); assert.ok(d.events.some(e => e.type === 'undammed'));
  run(d, m, 20); assert.ok(qx(d, 0.08) > 0.3, 'flowing again ' + qx(d, 0.08));
  const q0 = qx(d, 0.05), w0 = m.water.reduce((a, b) => a + b, 0); damAt(m, 0);
  stepRivers(d, m, 0.1, { frozen: true }); assert.equal(qx(d, 0.05), q0); assert.equal(m.water.reduce((a, b) => a + b, 0), w0);
});
