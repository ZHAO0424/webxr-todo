// 上帝模拟：开局是荒岛，只有玩家下雨、晒太阳、撒种子，岛才一点点活过来
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, save, load, soilAt, SOIL, SOIL_GROW, LAYOUT, cellsAround } from '../sim.js';

const DT = 0.1;
const run = (w, secs, f = () => ({})) => { for (let t = 0; t < secs; t += DT) step(w, f(t)); return w; };
const rain = (x, z) => ({ id: x * 100 + z, x, z, y: 0.16, over: true, mode: 'rain', strength: 1 });

test('荒岛开局：几乎不绿、没有动物', () => {
  const w = createWorld(3, { start: 'barren' });
  assert.ok(w.green < 0.12, 'green ' + w.green);
  assert.equal(w.animals.length, 0);
});

test('什么都不做，岛不会自己活过来', () => {
  const w = run(createWorld(3, { start: 'barren' }), 200);
  assert.ok(w.green < 0.15, 'green ' + w.green);
  assert.equal(w.animals.length, 0);
});

test('下雨之后变绿，绿到一定程度动物自己来', () => {
  const w = createWorld(3, { start: 'barren' });
  run(w, 120, () => ({ hands: [rain(0.05, 0.04), rain(-0.06, 0.06), rain(0.0, -0.02)] }));
  run(w, 180);
  assert.ok(w.green > 0.3, 'green ' + w.green);
  assert.ok(w.animals.some(a => a.sp === 'rabbit'), 'rabbits came');
});

test('土质不一样：沙丘、碎石难长，泥滩好长；岛上几种土都有', () => {
  assert.ok(SOIL_GROW[SOIL.SAND] < SOIL_GROW[SOIL.DIRT] && SOIL_GROW[SOIL.MUD] > SOIL_GROW[SOIL.DIRT]);
  const seen = new Set();
  for (let i = 0; i < 50; i++) for (let j = 0; j < 50; j++) { const x = -0.16 + i * 0.0064, z = -0.16 + j * 0.0064; if (Math.hypot(x, z) < 0.155) seen.add(soilAt(x, z)); }
  assert.equal(seen.size, 5);
  const L0 = LAYOUT.lakes[0];
  assert.equal(soilAt(L0.x + L0.r + 0.008, L0.z), SOIL.MUD);
});

test('存档：荒岛读回来还是荒岛模式', () => {
  const w = createWorld(5, { start: 'barren' });
  run(w, 5);
  const w2 = load(save(w));
  assert.equal(w2.barren, true);
  assert.ok(Math.abs(w2.green - w.green) < 0.01);
});
