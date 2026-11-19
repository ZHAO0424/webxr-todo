// 地表水：往低处流、积在洼地、漫出去、流进湖、渗进土里、冲沙、灭火、冷岩浆
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, step, totals, index, MC } from '../matter.js';

const run = (m, secs, env = {}) => { for (let t = 0; t < secs; t += 0.1) step(m, 0.1, env); return m; };
const soaked = m => m.soaked.reduce((a, b) => a + b, 0);
const ROCK = () => 'rock';   // 石头地：几乎不渗，方便看流动
// 一个碗：中间低（半径 0.04 内，深 2 mm），碗沿外平一圈，0.07 以外往岛边下坡
const bowl = (x, z) => { const r = Math.hypot(x, z); return 0.02 - Math.max(0, 0.04 - r) * 0.05 - Math.max(0, r - 0.07) * 0.1; };
const inIsland = k => (x, z) => Math.hypot(x, z) > 0.17 ? 'out' : k(x, z);

test('倒在坡上的水往低处流，不往高处流', () => {
  const m = createMatter((x, z) => 0.03 - x * 0.1, inIsland(ROCK));
  pour(m, 'water', -0.05, 0, 0.004);
  run(m, 2);
  assert.ok(m.water[index(-0.05 + MC * 6, 0)] > 0, 'downhill wet');
  assert.ok(m.water[index(-0.05 - MC * 6, 0)] < 1e-6, 'uphill dry');
});

test('洼地积水：水停在碗底，不会消失', () => {
  const m = createMatter(bowl, inIsland(ROCK));
  pour(m, 'water', 0.03, 0, 0.03);
  run(m, 6, { wet: () => 1 });
  assert.ok(m.water[index(0, 0)] > m.water[index(0.03, 0)], 'pooled at bottom');
  assert.ok(totals(m).water > 0.03 * 0.9, 'mostly still there ' + totals(m).water);
});

test('一直倒：洼地满了漫出去，流到岛边淌下去', () => {
  const m = createMatter(bowl, inIsland(ROCK));
  for (let i = 0; i < 400; i++) { pour(m, 'water', 0, 0, 0.004); step(m, 0.1, { wet: () => 1 }); }
  assert.ok(m.water[index(0.08, 0)] > 0, 'overflowed the rim');
  assert.ok(m.stats.spilled > 0, 'spilled off the edge ' + m.stats.spilled);
});

test('流进湖里就并进湖', () => {
  const m = createMatter((x, z) => 0.03 - x * 0.1, inIsland((x, z) => x > 0.05 ? 'water' : 'rock'));
  pour(m, 'water', 0.0, 0, 0.03);
  run(m, 6, { wet: () => 1 });
  assert.ok(m.stats.toLake > 0.015, 'to lake ' + m.stats.toLake);
});

test('干地慢慢吸水（很慢），湿透的地吸不动', () => {
  const a = createMatter(() => 0.02, () => 'grass'), b = createMatter(() => 0.02, () => 'grass');
  pour(a, 'water', 0, 0, 0.01); pour(b, 'water', 0, 0, 0.01);
  run(a, 60, { wet: () => 0.1 }); run(b, 60, { wet: () => 0.98 });
  assert.ok(soaked(a) > soaked(b) * 20, `dry ${soaked(a)} vs wet ${soaked(b)}`);
  assert.ok(soaked(a) < 0.01 * 0.3, '吸得很慢：一分钟只吸进去一小部分（其余流走 / 还在地面） ' + soaked(a));
});

test('大雨下在湿透的地上：多出来的水汇成地表水', () => {
  const m = createMatter(bowl, inIsland(() => 'grass'));
  run(m, 20, { rain: () => 1, wet: () => 1 });
  assert.ok(m.water[index(0, 0)] > m.water[index(0.1, 0.05)], 'collects in the low spot');
  assert.ok(totals(m).water > 0);
});

test('急流冲走沙子', () => {
  const m = createMatter((x, z) => 0.03 - x * 0.1, inIsland(ROCK));
  pour(m, 'sand', -0.03, 0, 0.0015);
  const s0 = m.sand[index(-0.03, 0)];
  for (let i = 0; i < 60; i++) { pour(m, 'water', -0.04, 0, 0.004); step(m, 0.1, { wet: () => 1 }); }
  assert.ok(m.sand[index(-0.03, 0)] < s0 * 0.7, 'sand carried away');
});

test('水漫到岩浆上冷成石头，漫到火上灭火', () => {
  const m = createMatter(() => 0.02, () => 'forest');
  pour(m, 'lava', 0.02, 0, 0.002);
  m.fire[index(-0.02, 0)] = 8;
  for (let i = 0; i < 20; i++) { pour(m, 'water', 0.02, 0, 0.003); pour(m, 'water', -0.02, 0, 0.003); step(m, 0.1, { wet: () => 1 }); }
  assert.ok(m.rock[index(0.02, 0)] > 0 && m.stats.steam > 0, 'lava quenched');
  assert.equal(m.fire[index(-0.02, 0)], 0, 'fire out');
});

test('土围一圈，中间倒水：水被圈住成池塘，水面高过圈外的地，土墙不塌、不被冲走', () => {
  const m = createMatter(() => 0.02, inIsland(() => 'grass'));
  // 半径 0.02 一圈土墙，约 3 mm 高（一格一格倒，像玩家沿着画一圈）
  for (let a = 0; a < 64; a++) for (let r = 0.019; r <= 0.024; r += MC * 0.5) pour(m, 'soil', Math.cos(a / 64 * 2 * Math.PI) * r, Math.sin(a / 64 * 2 * Math.PI) * r, 0.0024);
  run(m, 2);
  const soil0 = totals(m).soil;
  for (let i = 0; i < 120; i++) { pour(m, 'water', 0, 0, 0.0015); run(m, 0.1, { wet: () => 1 }); }
  run(m, 3, { wet: () => 1 });
  const inside = m.water[index(0, 0)], outside = m.water[index(0.05, 0)];
  assert.ok(inside > 0.0012, 'pond depth ' + inside);
  assert.ok(outside < inside * 0.1, `leaked: in ${inside} out ${outside}`);
  assert.ok(totals(m).soil > soil0 * 0.95, 'wall held ' + totals(m).soil / soil0);
});
