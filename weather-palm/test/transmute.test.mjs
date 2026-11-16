// 东西互相变：沙 + 水 → 土；土长草；石头风化；岩浆烧沙成玻璃、烤土成石；水砸坑
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, step, totals, index, MC } from '../matter.js';

const run = (m, secs, env = {}) => { for (let t = 0; t < secs; t += 0.1) step(m, 0.1, env); return m; };
const flat = () => createMatter(() => 0.02, () => 'grass');

test('沙子堆上浇水，泡透了变成土', () => {
  const m = flat();
  pour(m, 'sand', 0, 0, 0.004);
  const s0 = totals(m).sand;
  for (let i = 0; i < 300; i++) { if (i % 5 === 0) pour(m, 'water', 0.004, 0, 0.002); step(m, 0.1, { wet: () => 0.9 }); }
  const t = totals(m);
  assert.ok(t.soil > s0 * 0.3, `soil ${t.soil} from sand ${s0}`);
  assert.ok(t.sand < s0 * 0.7);
});

test('干沙子不会变土', () => {
  const m = flat(); pour(m, 'sand', 0, 0, 0.004); run(m, 30, { wet: () => 0.1 });
  assert.equal(totals(m).soil, 0);
});

test('湿土见光长草，长了草能烧', () => {
  const m = flat(); const k = index(0, 0);
  m.soil[k] = 0.001; m.fuel[k] = 0;
  run(m, 40, { wet: () => 0.6, sun: 1 });
  assert.ok(m.grass[k] > 0.8, 'grass ' + m.grass[k]);
  assert.ok(m.fuel[k] >= 0.5);
});

test('冷岩浆石常淋雨，慢慢风化成土', () => {
  const m = flat(); const k = index(0, 0);
  m.rock[k] = 0.002;
  run(m, 60, { rain: () => 1, wet: () => 0.9 });
  assert.ok(m.soil[k] > 0.0005 && m.rock[k] < 0.002, `soil ${m.soil[k]} rock ${m.rock[k]}`);
});

test('烫岩浆漫过沙子烧成玻璃，漫过土烤成石头', () => {
  const m = flat(); const a = index(-0.02, 0), b = index(0.02, 0);
  m.sand[a] = 0.002; m.soil[b] = 0.002; m.grass[b] = 1;
  for (let i = 0; i < 20; i++) { pour(m, 'lava', -0.02, 0, 0.001); pour(m, 'lava', 0.02, 0, 0.001); step(m, 0.1); }
  const t = totals(m);
  assert.ok(t.glass > 0.0004, 'glass ' + t.glass);
  assert.ok(m.soil[b] < 0.002 && m.grass[b] === 0, 'soil baked, grass gone');
});

test('水砸在沙堆上冲出个坑', () => {
  const m = flat(); pour(m, 'sand', 0, 0, 0.006);
  const k = index(0, 0), ring = index(MC * 2, 0), s0 = m.sand[k], r0 = m.sand[ring];
  pour(m, 'water', 0, 0, 0.002);
  assert.ok(m.sand[k] < s0 && m.sand[ring] > r0);
});

test('土比沙子站得住：同样一堆，沙子摊得更开', () => {
  const a = flat(), b = flat(), k = index(0, 0);
  a.sand[k] = 0.006; b.soil[k] = 0.006;
  run(a, 5, { wet: () => 0.1 }); run(b, 5, { wet: () => 0.1 });
  assert.ok(b.soil[k] > a.sand[k] * 1.3, `soil peak ${b.soil[k]} vs sand peak ${a.sand[k]}`);
});
