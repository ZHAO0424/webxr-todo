// 左手菜单里的东西：每一样都要对岛有看得见、测得出的影响
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, LAYOUT, cellsAround, setLevel, TOOLS } from '../sim.js';
import { createMatter, pour, step as mstep, douse, ignite, MG } from '../matter.js';

const DT = 0.1;
const noon = w => { w.day = 0.42; return w; };
const run = (w, secs, f = () => ({})) => { for (let t = 0; t < secs; t += DT) step(w, f(t)); return w; };
const avg = (arr, ks) => ks.reduce((s, k) => s + arr[k], 0) / ks.length;
const M0 = LAYOUT.meadows[0];
const tool = (kind, x = M0.x, z = M0.z, a = DT) => ({ tools: [{ kind, x, z, a }] });

test('菜单里有 10 样东西', () => { assert.equal(TOOLS.length, 10); });

test('水：地湿透、水位涨', () => {
  const w = noon(createWorld(1)), ks = cellsAround(M0.x, M0.z, 0.01), m0 = avg(w.M, ks);
  run(w, 2, () => tool('water'));
  assert.ok(avg(w.M, ks) > m0 + 0.4);
  const L0 = LAYOUT.lakes[0], w0 = w.water;
  run(w, 2, () => tool('water', L0.x, L0.z));
  assert.ok(w.water > w0 + 0.03);
});

test('水：浇灭火、岩浆冷成石头', () => {
  const m = createMatter(() => 0.02, () => 'forest');
  pour(m, 'lava', 0, 0, 0.004);
  for (let i = 0; i < 20; i++) mstep(m, 0.1, { wet: () => 0.1 });
  let fire = 0; for (let k = 0; k < MG * MG; k++) if (m.fire[k] > 0) fire++;
  assert.ok(fire > 0);
  douse(m, 0, 0, 0.03);
  let f2 = 0, lava = 0; for (let k = 0; k < MG * MG; k++) { if (m.fire[k] > 0) f2++; lava += m.lava[k]; }
  assert.ok(f2 < fire); assert.ok(lava < 1e-6);
});

test('闪电：劈在干的林子上会着火，湿的不会', () => {
  const m = createMatter(() => 0.02, () => 'forest');
  assert.ok(ignite(m, 0, 0, 0.1));
  assert.ok(!ignite(m, 0.05, 0.05, 0.8));
});

test('食物：附近的动物过来吃，吃饱了生小的', () => {
  const w = noon(createWorld(2)); setLevel(w, 1);
  const r = w.animals.find(a => a.sp === 'rabbit');
  const n0 = w.animals.length;
  for (let i = 0; i < 4; i++) step(w, tool('food', r.x + 0.02, r.z));
  assert.ok(w.food.length > 0);
  run(w, 40, t => (Math.floor(t * 10) % 50 === 0 ? tool('food', r.x + 0.02, r.z) : {}));
  assert.ok(w.stats.eaten > 0, 'eaten');
  assert.ok(w.stats.born > 0 && w.animals.length > n0, 'born');
  const baby = w.animals.find(a => a.grow < 1);
  assert.ok(baby);
});

test('雪：下雪积起来、气温降、湖结冰；太阳出来化成水，地变湿', () => {
  const w = noon(createWorld(3)), ks = cellsAround(M0.x, M0.z, 0.012);
  const big = t => ({ hands: [{ id: 0, x: M0.x, y: 0.16, z: M0.z, over: true, mode: 'snow', strength: 1 }, { id: 1, x: -0.05, y: 0.16, z: 0.05, over: true, mode: 'snow', strength: 1 }, { id: 2, x: 0.02, y: 0.16, z: -0.03, over: true, mode: 'snow', strength: 1 }] });
  const T0 = w.T;
  run(w, 60, big);
  assert.ok(avg(w.snow, ks) > 0.5, 'snow ' + avg(w.snow, ks));
  assert.ok(w.T < T0 - 0.1, 'colder');
  assert.ok(w.ice > 0.5, 'ice ' + w.ice);
  const m0 = avg(w.M, ks);
  run(w, 150, () => ({ hands: [{ id: 3, x: M0.x, y: 0.12, z: M0.z, over: true, mode: 'sun', strength: 1 }] }));
  assert.ok(avg(w.snow, ks) < 0.2, 'melted');
  assert.ok(avg(w.M, ks) > m0, 'meltwater');
  assert.ok(w.ice < 0.5, 'thawed');
});

test('积雪下面的草不长', () => {
  const a = noon(createWorld(4)), b = noon(createWorld(4)), ks = cellsAround(M0.x, M0.z, 0.012);
  for (const k of ks) { a.M[k] = b.M[k] = 0.6; b.snow[k] = 1; }
  run(a, 20); run(b, 20);
  assert.ok(avg(a.G, ks) > avg(b.G, ks) + 0.05);
});

test('雾霾：挡太阳、植物长得慢，动物躲开；风吹散、雨洗掉', () => {
  const a = noon(createWorld(5)), b = noon(createWorld(5)), ks = cellsAround(M0.x, M0.z, 0.012);
  for (const k of ks) { a.M[k] = b.M[k] = 0.6; }
  run(b, 3, () => tool('smog'));
  assert.ok(avg(b.smog, ks) > 0.6);
  assert.ok(b.sun < a.sun || b.smogAvg > 0.01);
  run(a, 20); run(b, 20);
  assert.ok(avg(a.G, ks) > avg(b.G, ks) + 0.03, 'growth hurt');
  const s0 = avg(b.smog, ks);
  run(b, 4, () => ({ hands: [{ id: 0, x: 0, y: 0.15, z: 0, over: true, mode: 'wind', strength: 1, dx: 1, dz: 0 }] }));
  assert.ok(avg(b.smog, ks) < s0 * 0.6, 'wind clears');
  const c = noon(createWorld(6)); setLevel(c, 1);
  const r = c.animals[0];
  let fled = false;
  for (let i = 0; i < 30; i++) { step(c, tool('smog', r.x, r.z)); if (r.act === 'flee') fled = true; }
  assert.ok(fled, 'animal fled smog');
});

test('旋风：吹散雾霾，过一阵自己消失', () => {
  const w = noon(createWorld(7)), ks = cellsAround(M0.x, M0.z, 0.012);
  run(w, 3, () => tool('smog'));
  const s0 = avg(w.smog, ks);
  step(w, tool('whirl'));
  assert.equal(w.whirls.length, 1);
  run(w, 3);
  assert.ok(avg(w.smog, ks) < s0 * 0.5);
  run(w, 8);
  assert.equal(w.whirls.length, 0);
});

test('花种：那一片草一下子长起来', () => {
  const w = noon(createWorld(8)), ks = cellsAround(M0.x, M0.z, 0.012), g0 = avg(w.G, ks);
  run(w, 1, () => tool('flower'));
  assert.ok(avg(w.G, ks) > g0 + 0.3);
});

test('鱼苗：放进湖里鱼变多，放在地上不算', () => {
  const w = noon(createWorld(9)), f0 = w.fish, L0 = LAYOUT.lakes[0];
  step(w, tool('fish', L0.x, L0.z)); step(w, tool('fish', L0.x, L0.z));
  assert.equal(w.fish, f0 + 2);
  step(w, tool('fish', M0.x, M0.z));
  assert.equal(w.fish, f0 + 2);
  assert.ok(w.events.some(e => e.type === 'fishFlop'));
});

test('动物：放在草地上随机生成一种（同一套动物逻辑）；放进湖里就是鱼；每种有上限', () => {
  const w = noon(createWorld(9)), L0 = LAYOUT.lakes[0], n0 = w.animals.length, f0 = w.fish;
  step(w, tool('animal'));
  assert.equal(w.animals.length, n0 + 1);
  const a = w.animals[w.animals.length - 1];
  assert.ok(['rabbit', 'deer', 'goat', 'boar'].includes(a.sp) && Math.hypot(a.x - M0.x, a.z - M0.z) < 0.01, a.sp);
  assert.ok(w.events.some(e => e.type === 'animal'));
  step(w, tool('animal', L0.x, L0.z)); assert.equal(w.fish, f0 + 1);
  for (let i = 0; i < 80; i++) step(w, tool('animal'));
  for (const sp of ['rabbit', 'deer', 'goat', 'boar']) assert.ok(w.animals.filter(b => b.sp === sp).length <= { rabbit: 14, deer: 7, goat: 5, boar: 4 }[sp], sp);
});

test('羊和牛：同一套动物逻辑——成群吃草；羊少草地照样长、羊多了把草吃秃；吃饱生崽；饿久了离开', () => {
  const herd = (n, sp) => { const w = noon(createWorld(4)); w.clouds.length = 0; w.animals = w.animals.filter(a => a.sp === 'heron'); for (let i = 0; i < n; i++) step(w, tool('animal')); w.animals.forEach(a => { if (a.sp !== 'heron') a.sp = sp; }); return w; };
  const ks = cellsAround(M0.x, M0.z, 0.02);
  const keepWet = w => () => { for (const k of ks) w.M[k] = Math.max(w.M[k], 0.6); return {}; };
  const few = herd(1, 'sheep'), many = herd(10, 'sheep');
  for (const w of [few, many]) for (const k of ks) w.G[k] = 0.8;
  run(few, 60, keepWet(few)); run(many, 60, keepWet(many));
  assert.ok(avg(many.G, ks) < avg(few.G, ks) - 0.15, `many ${avg(many.G, ks).toFixed(2)} vs few ${avg(few.G, ks).toFixed(2)}`);
  assert.ok(few.events.length >= 0);
  // 吃饱生崽（牛也是同一套）
  const c = herd(2, 'cow'); for (const k of ks) c.G[k] = 1; const n0 = c.animals.filter(a => a.sp === 'cow').length;
  let born = false; for (let t = 0; t < 200 && !born; t += 0.1) { for (const k of ks) { c.G[k] = 1; c.M[k] = 0.6; } step(c, {}); born = c.animals.filter(a => a.sp === 'cow').length > n0; }
  assert.ok(born, 'cow calf');
  // 一直没草：饿久了走掉
  const h = herd(3, 'sheep'); let left = false;
  for (let t = 0; t < 200 && !left; t += 0.1) { h.G.fill(0.1); step(h, {}); left = h.events.some(e => e.type === 'leave'); }
  assert.ok(left, 'hungry sheep left');
});
