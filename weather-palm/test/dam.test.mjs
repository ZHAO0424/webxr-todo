// 堵溪：堆土堵住，下游断流，上游憋水、漫过去、顺着旧河床往下淌
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, step, index, totals } from '../matter.js';
import { createDams, stepDams } from '../dam.js';

// 一条从西往东往下流的溪：V 形河谷，中线 z = 0
const RIV = [[[-0.1, 0], [0.1, 0]]];
const along = (x, z) => ({ ri: 0, s: x + 0.1, d: Math.abs(z) });
const valley = (x, z) => 0.03 - x * 0.05 + Math.abs(z) * 0.25;
const world = () => createMatter(valley, (x, z) => Math.hypot(x, z) > 0.17 ? 'out' : Math.abs(z) < 0.005 ? 'water' : 'rock');
const damAt = (m, x0) => { for (let x = x0 - 0.004; x <= x0 + 0.004; x += 0.002) for (let z = -0.012; z <= 0.012; z += 0.002) pour(m, 'soil', x, z, 0.0008); };

test('没堵：溪照常（格子还是水），不往外放地表水', () => {
  const m = world(), d = createDams(m, RIV, along);
  for (let t = 0; t < 2; t += 0.1) { stepDams(d, m, 0.1); step(m, 0.1); }
  assert.equal(d.dam[0], Infinity); assert.equal(m.kind[index(0.05, 0)], 2); assert.ok(totals(m).water < 1e-6);
});

test('堆土堵住：坝下游的溪变干河床；泉水憋在坝前积起来', () => {
  const m = world(), d = createDams(m, RIV, along); damAt(m, 0);
  for (let t = 0; t < 1; t += 0.1) step(m, 0.1);
  for (let t = 0; t < 10; t += 0.1) { stepDams(d, m, 0.1, { flow: 0.5 }); step(m, 0.1, { wet: () => 1 }); }
  assert.ok(Math.abs(d.dam[0] - 0.1) < 0.01, 'dam at ' + d.dam[0]);
  assert.ok(d.events.some(e => e.type === 'dammed'));
  assert.equal(m.kind[index(0.05, 0)], 1, 'downstream dry');
  assert.ok(m.water[index(-0.012, 0)] > 0.0005, 'pooled behind dam ' + m.water[index(-0.012, 0)]);
});

test('一直憋：水涨过坝或从旁边漫出去，顺着旧河床往下淌', () => {
  const m = world(), d = createDams(m, RIV, along); damAt(m, 0);
  for (let t = 0; t < 1; t += 0.1) step(m, 0.1);
  let reached = false;
  for (let t = 0; t < 90 && !reached; t += 0.1) { stepDams(d, m, 0.1, { flow: 1 }); step(m, 0.1, { wet: () => 1 }); reached = m.water[index(0.03, 0)] > 0.00001; }
  assert.ok(reached, 'overflow downstream ' + m.water[index(0.03, 0)] + ' behind ' + m.water[index(-0.012, 0)]);
});

test('结冰：泉水不放；把坝挖掉：溪恢复', () => {
  const m = world(), d = createDams(m, RIV, along); damAt(m, 0);
  for (let t = 0; t < 1; t += 0.1) step(m, 0.1);
  stepDams(d, m, 0.1, { frozen: true }); assert.ok(totals(m).water < 1e-6);
  for (let k = 0; k < m.soil.length; k++) m.soil[k] = 0;
  stepDams(d, m, 0.1); assert.equal(d.dam[0], Infinity); assert.equal(m.kind[index(0.05, 0)], 2); assert.ok(d.events.some(e => e.type === 'undammed'));
});
