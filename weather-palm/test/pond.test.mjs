// 池塘生态：积水里长水草、水草喂鱼
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, index, MG, MC } from '../matter.js';
import { createPond, addFish, stepPond, DEEP } from '../pond.js';

// 一块平地，中间一个"池塘"：直接把水写进去（不跑流动，只看生态）
function pondWorld(r = 0.02, depth = 0.002) {
  const m = createMatter(() => 0.02, () => 'grass');
  for (let k = 0; k < MG * MG; k++) { const i = k % MG, j = (k / MG) | 0, x = -0.17 + (i + 0.5) * MC, z = -0.17 + (j + 0.5) * MC; if (Math.hypot(x, z) < r) m.water[k] = depth; }
  return m;
}
const run = (p, m, secs, env = {}) => { for (let t = 0; t < secs; t += 0.1) stepPond(p, m, 0.1, env); };
const weedSum = p => p.weed.reduce((a, b) => a + b, 0);

test('水草：水够深、积得够久才长；浅水、干地不长', () => {
  const m = pondWorld(), p = createPond();
  m.water[index(0.05, 0)] = DEEP * 0.5;   // 一格浅水
  run(p, m, 4); assert.equal(weedSum(p), 0, '刚积水还不长');
  run(p, m, 60);
  assert.ok(p.weed[index(0, 0)] > 0.3, 'pond weed ' + p.weed[index(0, 0)]);
  assert.equal(p.weed[index(0.05, 0)], 0, '浅水不长');
  assert.equal(p.weed[index(0.1, 0.1)], 0, '干地不长');
});

test('水草：水干了枯掉；岩浆流进来烧光', () => {
  const m = pondWorld(), p = createPond(); run(p, m, 60);
  const k = index(0, 0); assert.ok(p.weed[k] > 0.3);
  m.lava[index(0.01, 0)] = 0.001; const kl = index(0.01, 0), before = p.weed[kl];
  run(p, m, 0.1); assert.ok(before > 0 && p.weed[kl] === 0 && p.events.some(e => e.type === 'weedBurn'));
  for (let i = 0; i < MG * MG; i++) m.water[i] = 0;
  run(p, m, 30); assert.ok(p.weed[k] < 0.05, 'withered ' + p.weed[k]);
});

test('鱼：只能放进够深的水里；在水里游但不游上岸', () => {
  const m = pondWorld(), p = createPond();
  assert.equal(addFish(p, m, 0.1, 0.1), false, '干地放不进');
  assert.ok(addFish(p, m, 0, 0));
  run(p, m, 30);
  const f = p.fish[0];
  assert.ok(f && Math.hypot(f.x, f.z) < 0.02 + MC, 'stayed in pond ' + (f && Math.hypot(f.x, f.z)));
  assert.ok(Math.hypot(f.x, f.z) > 0.0005, 'it moved');
});

test('鱼吃水草：水草变少；吃饱长大会生小鱼；池塘越大养得越多', () => {
  const m = pondWorld(0.03), p = createPond(); run(p, m, 80);   // 先长满水草
  const w0 = weedSum(p);
  for (let i = 0; i < 3; i++) addFish(p, m, (i - 1) * 0.01, 0);
  run(p, m, 120);
  assert.ok(p.stats.eaten > 0.1, 'ate ' + p.stats.eaten);
  assert.ok(p.fish.length > 3 && p.stats.born > 0, 'born ' + p.stats.born + ' n ' + p.fish.length);
  const small = pondWorld(0.012), q = createPond(); run(q, small, 80); for (let i = 0; i < 3; i++) addFish(q, small, 0, 0); run(q, small, 120);
  assert.ok(q.fish.length < p.fish.length, `small pond ${q.fish.length} vs big ${p.fish.length}`);
  void w0;
});

test('鱼：没水草会饿死；水干了搁浅扑腾、然后死；岩浆烫死', () => {
  const a = pondWorld(), pa = createPond(); addFish(pa, a, 0, 0); pa.weed.fill(0);
  for (let t = 0; t < 200; t += 0.1) { stepPond(pa, a, 0.1); pa.weed.fill(0); }
  assert.equal(pa.fish.length, 0); assert.ok(pa.events.some(e => e.why === 'hungry'));
  const b = pondWorld(), pb = createPond(); addFish(pb, b, 0, 0); for (let i = 0; i < MG * MG; i++) b.water[i] = 0;
  run(pb, b, 1); assert.equal(pb.fish.length, 1, '还在扑腾'); assert.ok(pb.events.some(e => e.type === 'fishFlop'));
  run(pb, b, 5); assert.equal(pb.fish.length, 0); assert.ok(pb.events.some(e => e.why === 'dry'));
  const c = pondWorld(), pc = createPond(); addFish(pc, c, 0, 0); const f = pc.fish[0]; c.lava[index(f.x, f.z)] = 0.001;
  run(pc, c, 0.1); assert.equal(pc.fish.length, 0); assert.ok(pc.events.some(e => e.why === 'hot'));
});

test('真的倒水：倒进洼地积起来，过一阵长出水草', async () => {
  const { step } = await import('../matter.js');
  const bowl = (x, z) => 0.02 - Math.max(0, 0.03 - Math.hypot(x, z)) * 0.1;
  const m = createMatter(bowl, (x, z) => Math.hypot(x, z) > 0.17 ? 'out' : 'rock'), p = createPond();
  for (let i = 0; i < 60; i++) { pour(m, 'water', 0, 0, 0.0015); step(m, 0.1, { wet: () => 1 }); stepPond(p, m, 0.1); }
  for (let t = 0; t < 40; t += 0.1) { step(m, 0.1, { wet: () => 1 }); stepPond(p, m, 0.1); }
  assert.ok(p.weed[index(0, 0)] > 0.1, 'weed in bowl ' + p.weed[index(0, 0)] + ' water ' + m.water[index(0, 0)]);
});

test('手掌晒着：水草长得飞快；小苗几秒长成树', async () => {
  const m = pondWorld(), a = createPond(), b = createPond(), k = index(0, 0);
  run(a, m, 12, { lit: () => 1 }); run(b, m, 12);
  assert.ok(a.weed[k] > b.weed[k] * 4 && a.weed[k] > 0.3, `lit ${a.weed[k]} vs ${b.weed[k]}`);
  const { step } = await import('../matter.js');
  const s1 = createMatter(() => 0.02, () => 'grass'), s2 = createMatter(() => 0.02, () => 'grass');
  pour(s1, 'seed', 0, 0, 0); pour(s2, 'seed', 0, 0, 0);
  for (let t = 0; t < 4; t += 0.1) { step(s1, 0.1, { wet: () => 0.6, lit: () => 1 }); step(s2, 0.1, { wet: () => 0.6 }); }
  assert.ok(s1.saplings[0].grown && !s2.saplings[0].grown, `${s1.saplings[0].g} vs ${s2.saplings[0].g}`);
});

test('结冰：地表水冻住不流；池塘里鱼不动、水草不长（冬眠）', async () => {
  const { step } = await import('../matter.js');
  const slope = createMatter((x, z) => 0.03 - x * 0.1, () => 'rock'); pour(slope, 'water', -0.05, 0, 0.004);
  for (let t = 0; t < 2; t += 0.1) step(slope, 0.1, { frozen: true });
  assert.ok(slope.water[index(-0.05 + MC * 6, 0)] < 1e-7, 'frozen water stays put');
  const m = pondWorld(), p = createPond(); addFish(p, m, 0, 0); const f = p.fish[0], x0 = f.x, full0 = f.full;
  run(p, m, 20, { frozen: true });
  assert.ok(f.x === x0 && f.full === full0 && weedSum(p) === 0, 'fish still, no weed');
});
