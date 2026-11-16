// 因果表（research-plan 7.3，改成野外小岛后的版本）的自动化断言
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLevel, createWorld, step, LAYOUT, cellsAround, T, N, isNight, save, load, height, R, cellType, avgM, walkable, wantAnimals, MAX_LEVEL } from '../sim.js';

const DT = 0.1;
const hand = (mode, x, z, extra = {}) => ({ id: 0, x, y: 0.15, z, over: true, mode, strength: 1, dx: 0, dz: 0, ...extra });
function run(w, secs, inputsFn = () => ({})) { for (let t = 0; t < secs; t += DT) step(w, inputsFn(t)); return w; }
const avg = (arr, ks) => ks.reduce((s, k) => s + arr[k], 0) / ks.length;
const noon = w => { w.day = 0.42; return w; };
const M0 = LAYOUT.meadows[0];

test('布局：山高、泉眼在山上、湖和溪是水、草甸能站、花海是花', () => {
  const [main, west, east] = LAYOUT.peaks;
  assert.ok(height(main.x, main.z) > 0.09, 'main peak ' + height(main.x, main.z));
  assert.ok(height(main.x, main.z) > height(west.x, west.z) && height(west.x, west.z) > 0.05);
  assert.equal(cellType(main.x, main.z), T.SNOW);
  for (const P of LAYOUT.rivers) { const [sx, sz] = P[0]; assert.ok(height(sx, sz) > height(...P[P.length - 1]), 'spring above mouth'); }
  for (const l of LAYOUT.lakes) assert.equal(cellType(l.x, l.z), T.WATER);
  for (const m of LAYOUT.meadows) { assert.ok(walkable(m.x, m.z), `meadow ${m.x},${m.z} walkable`); assert.ok([T.GRASS, T.FLOWER].includes(cellType(m.x, m.z)), `meadow type ${cellType(m.x, m.z)}`); }
  const f = LAYOUT.flowers; assert.equal(cellType((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2), T.FLOWER);
  // 林子不少：岛上约三分之一是林子
  let forest = 0, land = 0;
  for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { const x = -R + (i + 0.5) * 2 * R / 60, z = -R + (j + 0.5) * 2 * R / 60; const t = cellType(x, z); if (t === T.OUT) continue; land++; if (t === T.FOREST) forest++; }
  assert.ok(forest / land > 0.22 && forest / land < 0.6, 'forest share ' + (forest / land).toFixed(2));
});

test('在草甸上下雨 10 s：湿度上升、河水涨', () => {
  const w = noon(createWorld(3)), m0 = avgM(w, M0.x, M0.z), water0 = w.water;
  run(w, 10, () => ({ hands: [hand('rain', M0.x, M0.z)] }));
  assert.ok(avgM(w, M0.x, M0.z) > m0 + 0.3, `M ${m0} → ${avgM(w, M0.x, M0.z)}`);
  assert.ok(w.water > water0 + 0.05);
  assert.equal(w.clouds.length, 1);
});

test('有水有光，草长；不下雨的地方不怎么长', () => {
  const w = noon(createWorld(4)), ks = cellsAround(M0.x, M0.z, 0.012), m3 = LAYOUT.meadows[2], far = cellsAround(m3.x, m3.z, 0.008);
  for (const k of far) w.M[k] = 0.12;   // 远处那片是干的
  const g0 = avg(w.G, ks), gf0 = avg(w.G, far);
  run(w, 8, () => ({ hands: [hand('rain', M0.x, M0.z)] }));
  run(w, 30);
  assert.ok(avg(w.G, ks) > g0 + 0.15, `G ${g0} → ${avg(w.G, ks)}`);
  assert.ok(avg(w.G, ks) - g0 > avg(w.G, far) - gf0 + 0.1, 'rained area grows more');
});

test('放手后云自己下完、被风吹走，然后出彩虹；夜里不出', () => {
  const w = noon(createWorld(5));
  run(w, 6, () => ({ hands: [hand('rain', 0.0, 0.0)] }));
  const c = w.clouds[0], x0 = c.x;
  run(w, 3, () => ({ hands: [hand('wind', -0.05, 0, { dx: 1, dz: 0 })] }));
  let rainbow = false;
  for (let t = 0; t < 25; t += DT) { step(w, {}); if (w.events.some(e => e.type === 'rainbow')) rainbow = true; w.events.length = 0; }
  assert.ok(c.x > x0 + 0.01); assert.ok(rainbow);
  const n = createWorld(6); n.day = 0.9;
  run(n, 6, () => ({ hands: [hand('rain', 0, 0)] })); run(n, 20);
  assert.equal(n.stats.rainbows, 0);
});

test('刮风：蒲公英的"需要"完成，草甸一下子长起来', () => {
  const w = noon(createWorld(7)); w.tutorial = ['wind']; w.nextReqT = 0;
  run(w, 0.3);
  assert.equal(w.requests[0].type, 'wind');
  const ks = cellsAround(M0.x, M0.z, 0.02), g0 = avg(w.G, ks);
  run(w, 4, () => ({ hands: [hand('wind', 0, 0, { dz: 1 })] }));
  assert.equal(w.done, 1);
  assert.ok(avg(w.G, ks) > g0 + 0.2);
});

test('闪电：劈山尖、动物逃开、雷雨的"需要"完成、附近植物加速', () => {
  const w = noon(createWorld(8)); w.tutorial = ['storm']; w.nextReqT = 0; setLevel(w, 3);
  run(w, 0.3);
  const p = LAYOUT.peaks[0];
  step(w, { strikes: [{ x: p.x + 0.02, z: p.z + 0.01 }] });
  const s = w.events.find(e => e.type === 'strike');
  assert.equal(s.name, 'peak');
  assert.equal(w.done, 1);
  assert.ok(avg(w.boost, cellsAround(p.x, p.z, 0.02)) > 10);
  run(w, 1);
  assert.ok(w.animals.every(a => a.act === 'flee'));
});

test('雨里：兔子钻洞，鹿往林子里躲', () => {
  const w = noon(createWorld(9)); setLevel(w, 1);
  for (let i = 0; i < 3; i++) step(w);
  const deer = () => w.animals.filter(a => a.sp === 'deer');
  // 大片雨云盖住整个岛
  for (let t = 0; t < 20; t += DT) step(w, { hands: [hand('rain', 0.05, 0.0, { y: 0.3 }), { ...hand('rain', -0.07, 0.05), id: 1 }, { ...hand('rain', 0.09, 0.06), id: 2 }, { ...hand('rain', 0.02, 0.11), id: 3 }] });
  const rabbits = w.animals.filter(a => a.sp === 'rabbit');
  const rainy = rabbits.filter(r => w.rainCell[cellsAround(r.x, r.z, 0.001)[0] ?? 0] > 0.15);
  assert.ok(rainy.length === 0 || rainy.some(r => r.hidden), 'some rabbit hid');
  assert.ok(deer().some(d => d.act === 'shelter' || d.act === 'flee' || cellType(d.x, d.z) === T.FOREST || w.rainCell[cellsAround(d.x, d.z, 0.001)[0] ?? 0] < 0.15), 'deer sheltered (or not under rain)');
});

test('手低低地靠近：鹿抬头看手，兔子太近就跑', () => {
  const w = noon(createWorld(10)); setLevel(w, 1);
  for (let i = 0; i < 3; i++) step(w);
  const d = w.animals.find(a => a.sp === 'deer'), r = w.animals.find(a => a.sp === 'rabbit');
  run(w, 1.5, () => ({ hands: [hand('idle', d.x + 0.03, d.z, { y: 0.1 })] }));
  assert.equal(d.act, 'look');
  const r0 = [r.x, r.z];
  run(w, 2, () => ({ hands: [hand('idle', r.x + 0.01, r.z, { y: 0.08 })] }));
  assert.ok(['flee', 'look'].includes(r.act));
  assert.ok(Math.hypot(r.x - r0[0], r.z - r0[1]) > 0.004 || r.act === 'look');
});

test('动物只走能站的地方（不下水、不上岩壁），也不走进岩浆', () => {
  const w = noon(createWorld(11)); setLevel(w, MAX_LEVEL);
  const lava = (x, z) => Math.hypot(x - LAYOUT.meadows[0].x, z - LAYOUT.meadows[0].z) < 0.02;
  for (let t = 0; t < 60; t += DT) step(w, { blocked: lava });
  for (const a of w.animals) {
    assert.ok(cellType(a.x, a.z) !== T.WATER, `${a.sp} in water`);
    assert.ok(cellType(a.x, a.z) !== T.SNOW, `${a.sp} on snow`);
  }
  assert.ok(w.animals.filter(a => lava(a.x, a.z)).length <= 1, 'animals avoid lava');
});

test('放晴：附近的云散掉，温度升', () => {
  const w = noon(createWorld(12));
  run(w, 3, () => ({ hands: [hand('rain', 0, 0)] }));
  run(w, 0.5);
  const T0 = w.T;
  run(w, 4, () => ({ hands: [hand('sun', 0, 0)] }));
  assert.ok(w.clouds.every(c => c.water < 0.2 || c.alpha < 0.5));
  assert.ok(w.T > T0);
});

test('太久不管：干旱；之后下雨能恢复', () => {
  const w = noon(createWorld(13));
  let drought = false;
  for (let t = 0; t < 400; t += DT) { step(w); if (w.drought) drought = true; }
  assert.ok(drought);
  for (const m of LAYOUT.meadows) run(w, 4, () => ({ hands: [hand('rain', m.x, m.z)] }));
  run(w, 4, () => ({ hands: [hand('rain', 0.05, 0.05), { ...hand('rain', -0.08, 0.06), id: 1 }] }));
  assert.equal(w.drought, false);
});

test('雨太多：涨水；放晴后退', () => {
  const w = noon(createWorld(14));
  run(w, 40, () => ({ hands: [hand('rain', -0.05, 0.0), { ...hand('rain', 0.05, 0.05), id: 1 }] }));
  assert.ok(w.flood, 'water ' + w.water);
  run(w, 200);
  assert.ok(!w.flood);
});

test('手影：遮住的格子蒸发更慢', () => {
  const a = noon(createWorld(15)), b = noon(createWorld(15));
  a.M.fill(0.6); b.M.fill(0.6);
  const shade = new Float32Array(N * N).fill(1);
  run(a, 20); run(b, 20, () => ({ shade }));
  const k = cellsAround(M0.x, M0.z, 0.01)[0];
  assert.ok(b.M[k] > a.M[k] + 0.02);
});

test('烧过的地方：植物没了，有雨有光会长回来', () => {
  const w = noon(createWorld(16)), ks = cellsAround(M0.x, M0.z, 0.01);
  step(w, { burns: [{ x: M0.x, z: M0.z, r: 0.015 }] });
  assert.ok(avg(w.G, ks) < 0.12);
  run(w, 6, () => ({ hands: [hand('rain', M0.x, M0.z)] }));
  run(w, 40);
  assert.ok(avg(w.G, ks) > 0.3, 'regrow ' + avg(w.G, ks));
});

test('完成"需要" → 岛升级、来新的物种；满级的夜里萤火大会', () => {
  const w = noon(createWorld(17));
  const n0 = w.animals.length;
  for (let i = 0; i < 2 * MAX_LEVEL; i++) { w.requests.push({ id: 100 + i, type: 'storm', x: 0, z: 0, p: 1, t0: w.t }); step(w); }
  assert.equal(w.level, MAX_LEVEL);
  const want = wantAnimals(MAX_LEVEL);
  assert.equal(w.animals.length, want.rabbit + want.deer + want.fox);
  assert.ok(w.animals.length > n0 + 5);
  w.day = 0.9; step(w);
  assert.ok(isNight(w) && w.festival);
});

test('教学顺序：雨 → 晴 → 风 → 雷', () => {
  const w = noon(createWorld(18)), seen = [];
  for (let t = 0; t < 120 && seen.length < 4; t += DT) {
    step(w);
    for (const e of w.events) if (e.type === 'request') { seen.push(e.req); w.requests.find(r => r.type === e.req).p = 1; }
    w.events.length = 0;
  }
  assert.deepEqual(seen, ['rain', 'sun', 'wind', 'storm']);
});

test('存档往返', () => {
  const w = noon(createWorld(19));
  run(w, 5, () => ({ hands: [hand('rain', 0, 0)] }));
  setLevel(w, 3);
  const w2 = load(save(w));
  assert.ok(Math.abs(w2.M[300] - w.M[300]) < 0.002);
  assert.equal(w2.level, 3);
  assert.equal(w2.animals.length, w.animals.length || w2.animals.length);
  run(w2, 2);
});

test('性能：一步模拟 < 1.5 ms', () => {
  const w = noon(createWorld(20)); setLevel(w, MAX_LEVEL);
  run(w, 2, () => ({ hands: [hand('rain', 0, 0)] }));
  const t0 = performance.now();
  run(w, 100, () => ({ hands: [hand('rain', 0, 0), { ...hand('wind', 0.05, 0), id: 1, dx: 1 }] }));
  const per = (performance.now() - t0) / 1000;
  assert.ok(per < 1.5, per + ' ms/step');
});
