// 岩浆 / 沙子 / 种子 / 火
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, step, totals, index, top, blocked, ignite, MG, MC } from '../matter.js';

// 一块斜坡地：x 越大越低；x > 0.08 是水；z < -0.05 是林子
const slopeH = (x, z) => 0.03 - x * 0.1;
const kindOf = (x, z) => Math.hypot(x, z) > 0.17 ? 'out' : x > 0.08 ? 'water' : z < -0.05 ? 'forest' : 'grass';
const run = (m, secs, env = {}) => { for (let t = 0; t < secs; t += 0.1) step(m, 0.1, env); return m; };

test('岩浆往低处流', () => {
  const m = createMatter(slopeH, kindOf);
  pour(m, 'lava', -0.05, 0, 0.012);
  const k0 = index(-0.05, 0), kDown = index(-0.05 + MC * 4, 0), kUp = index(-0.05 - MC * 4, 0);
  run(m, 3);
  assert.ok(m.lava[kDown] + m.rock[kDown] > 0, 'flowed downhill');
  assert.equal(m.lava[kUp] + m.rock[kUp], 0, 'not uphill');
});

test('岩浆慢慢冷成石头，总量守恒（没流出岛的部分）', () => {
  const m = createMatter(() => 0.02, () => 'grass');   // 平地，四周没边（kind 都有）
  pour(m, 'lava', 0, 0, 0.006);
  const t0 = totals(m);
  run(m, 120);
  const t1 = totals(m);
  assert.ok(t1.lava < t0.lava * 0.1, 'mostly cooled ' + t1.lava);
  assert.ok(Math.abs(t1.lava + t1.rock - t0.lava) < t0.lava * 0.02, 'conserved');
});

test('下雨让岩浆冷得快，还冒汽', () => {
  const a = createMatter(() => 0.02, () => 'grass'), b = createMatter(() => 0.02, () => 'grass');
  pour(a, 'lava', 0, 0, 0.03); pour(b, 'lava', 0, 0, 0.03);
  run(a, 8); run(b, 8, { rain: () => 1 });
  assert.ok(totals(b).lava < totals(a).lava * 0.7);
  assert.ok(b.stats.steam > 0);
});

test('岩浆流进水里：立刻变石头、冒白汽，堆够了填出陆地', () => {
  const m = createMatter(slopeH, kindOf);
  for (let i = 0; i < 60; i++) { pour(m, 'lava', 0.074, 0, 0.004); step(m, 0.1); }
  run(m, 20);
  assert.ok(m.stats.steam > 0);
  assert.ok(m.stats.filled > 0, 'filled ' + m.stats.filled);
  const k = index(0.085, 0); assert.ok(m.rock[k] > 0);
});

test('岩浆点着林子，火会蔓延；下雨灭火', () => {
  const m = createMatter(() => 0.02, kindOf);
  pour(m, 'lava', 0, -0.07, 0.004);
  run(m, 3, { wet: () => 0.1 });
  let fires = 0; for (let k = 0; k < MG * MG; k++) if (m.fire[k] > 0) fires++;
  assert.ok(fires > 0, 'ignited');
  run(m, 6, { wet: () => 0.1 });
  assert.ok(m.stats.burnt > 3, 'spread/burnt ' + m.stats.burnt);
  run(m, 4, { rain: () => 1, wet: () => 0.9 });
  let left = 0; for (let k = 0; k < MG * MG; k++) if (m.fire[k] > 0) left++;
  assert.equal(left, 0, 'rain put out fire');
});

test('湿的林子不会马上着：岩浆先把它烤干，过一阵才烧起来；干的林子一下就着', () => {
  const count = m => { let f = 0; for (let k = 0; k < MG * MG; k++) if (m.fire[k] > 0 || m.burnt[k]) f++; return f; };
  const wetM = createMatter(() => 0.02, kindOf), dryM = createMatter(() => 0.02, kindOf);
  pour(wetM, 'lava', 0, -0.07, 0.004); pour(dryM, 'lava', 0, -0.07, 0.004);
  run(wetM, 0.5, { wet: () => 0.9 }); run(dryM, 0.5, { wet: () => 0.1 });
  const lavaCells = m => { let c = 0; for (let k = 0; k < MG * MG; k++) if (m.lava[k] > 1e-6) c++; return c; };
  assert.ok(count(dryM) > count(wetM), `dry ${count(dryM)} wet ${count(wetM)}`);
  const w0 = count(wetM);
  run(wetM, 10, { wet: () => 0.9 });
  assert.ok(count(wetM) > w0 + 5, `wet forest dried out and caught fire: ${w0} → ${count(wetM)}`);
});

test('植被能烧多少按实际长了多少：荒地上的岩浆点不着东西', () => {
  const m = createMatter(() => 0.02, kindOf);
  pour(m, 'lava', 0, -0.07, 0.004);
  run(m, 6, { wet: () => 0.1, fuel: () => 0 });
  let f = 0; for (let k = 0; k < MG * MG; k++) if (m.fire[k] > 0) f++;
  assert.equal(f, 0);
});

test('沙子堆起来，陡了就往下滑（堆尖不超过休止角）', () => {
  const m = createMatter(() => 0.02, () => 'grass');
  for (let i = 0; i < 30; i++) { pour(m, 'sand', 0, 0, 0.002); step(m, 0.1); }
  run(m, 5);
  const k = index(0, 0), kn = index(MC, 0);
  assert.ok(m.sand[k] > 0.004, 'piled');
  assert.ok(top(m, k) - top(m, kn) <= MC * 0.75 + 1e-4, 'repose');
  assert.ok(m.sand[index(MC * 3, 0)] > 0, 'spread out');
});

test('种子在湿草地上长成树；岩浆盖上去就没了', () => {
  const m = createMatter(() => 0.02, kindOf);
  for (let i = 0; i < 5; i++) pour(m, 'seed', 0.02, 0.02, 0);
  assert.ok(m.saplings.length >= 3);
  run(m, 40, { wet: () => 0.6 });
  assert.ok(m.saplings.some(s => s.grown));
  pour(m, 'lava', 0.02, 0.02, 0.006); run(m, 0.5);
  assert.ok(m.saplings.length < 3);
});

test('岩浆、着火的格子挡路', () => {
  const m = createMatter(() => 0.02, () => 'grass');
  pour(m, 'lava', 0, 0, 0.004);
  assert.ok(blocked(m, 0, 0));
  assert.ok(!blocked(m, 0.1, 0.1));
});

test('性能：一步 < 4 ms（有一大摊岩浆、沙子和火时）', () => {
  const m = createMatter(slopeH, kindOf);
  for (let i = 0; i < 30; i++) { pour(m, 'lava', -0.02, -0.06, 0.003); pour(m, 'sand', 0.02, 0.03, 0.002); step(m, 0.1, { wet: () => 0.1 }); }
  const t0 = performance.now(); run(m, 5, { wet: () => 0.1 });
  const per = (performance.now() - t0) / 50;
  assert.ok(per < 4, per + ' ms');
});

test('风把沙子往下风吹（沙堆整体挪过去）', () => {
  const cx = m => { let s = 0, w = 0; for (let k = 0; k < MG * MG; k++) if (m.sand[k] > 1e-6) { s += m.sand[k] * (k % MG); w += m.sand[k]; } return s / w; };
  const a = createMatter(() => 0.02, () => 'grass'), b = createMatter(() => 0.02, () => 'grass');
  for (let i = 0; i < 20; i++) { pour(a, 'sand', 0, 0, 0.002); pour(b, 'sand', 0, 0, 0.002); step(a, 0.1); step(b, 0.1); }
  run(a, 8); run(b, 8, { wind: [1, 0] });
  assert.ok(cx(b) > cx(a) + 0.5, `wind ${cx(b).toFixed(2)} vs calm ${cx(a).toFixed(2)}`);
});

test('下雨：湿沙塌下来，沙堆变矮变宽', () => {
  const peak = m => { let h = 0; for (let k = 0; k < MG * MG; k++) h = Math.max(h, m.sand[k]); return h; };
  const a = createMatter(() => 0.02, () => 'grass'), b = createMatter(() => 0.02, () => 'grass');
  for (let i = 0; i < 30; i++) { pour(a, 'sand', 0, 0, 0.002); pour(b, 'sand', 0, 0, 0.002); step(a, 0.1); step(b, 0.1); }
  run(a, 6); run(b, 6, { rain: () => 1 });
  assert.ok(peak(b) < peak(a) * 0.9, `rain ${peak(b).toFixed(4)} vs dry ${peak(a).toFixed(4)}`);
});

test('大风天林火飞火星：下风好几格外冒出新的火头', () => {
  const m = createMatter(() => 0.02, () => 'forest');
  ignite(m, 0, 0, 0.1);
  let embers = 0;
  for (let t = 0; t < 6; t += 0.1) { step(m, 0.1, { wind: [1, 0], wet: () => 0.1 }); embers += m.events.filter(e => e.type === 'ember').length; m.events.length = 0; }
  assert.ok(embers > 0, 'embers flew');
});
