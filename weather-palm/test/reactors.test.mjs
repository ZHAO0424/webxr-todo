// 会对道具起反应的小东西：风车、水车、向日葵、蘑菇、雪人、鸟群
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReactors, stepReactors } from '../reactors.js';

const P = { x: 0, z: 0 };
const run = (R, env, secs) => { const evs = []; for (let t = 0; t < secs; t += 0.1) evs.push(...stepReactors(R, env, 0.1, () => 0.3)); return evs; };
const has = (evs, type) => evs.some(e => e.type === type);

test('风车：风越大转越快，旋风扫过转疯了，闪电劈到停一阵，岩浆烧坏', () => {
  const a = createReactors({ mills: [P] }), b = createReactors({ mills: [P] }), c = createReactors({ mills: [P] });
  run(a, { wind: [0.1, 0] }, 5); run(b, { wind: [0.8, 0] }, 5); run(c, { wind: [0.1, 0], whirls: [{ x: 0.01, z: 0 }] }, 5);
  assert.ok(b.mills[0].spd > a.mills[0].spd * 2 && c.mills[0].spd > b.mills[0].spd, `${a.mills[0].spd} ${b.mills[0].spd} ${c.mills[0].spd}`);
  const ev = stepReactors(b, { wind: [0.8, 0], strikes: [{ x: 0.005, z: 0 }] }, 0.1);
  assert.ok(has(ev, 'spark') && b.mills[0].spd === 0);
  run(b, { wind: [0.8, 0] }, 1); assert.ok(b.mills[0].spd < 0.5, '还没缓过来');
  assert.ok(has(run(b, { lava: () => 1 }, 0.2), 'millBurn')); run(b, { wind: [1, 0] }, 5); assert.ok(b.mills[0].spd < 0.1, '烧坏了不转');
});

test('水车：溪水满了转得快，结冰不转', () => {
  const a = createReactors({ wheels: [P] }), b = createReactors({ wheels: [P] }), c = createReactors({ wheels: [P] });
  run(a, { river: 0.1 }, 5); run(b, { river: 0.9, rain: () => 0.8 }, 5); run(c, { river: 0.9, ice: 0.9 }, 5);
  assert.ok(b.wheels[0].spd > a.wheels[0].spd * 2); assert.ok(c.wheels[0].frozen && c.wheels[0].spd < 0.05);
});

test('向日葵：跟着太阳转；放晴开大长高；下雨合上低头；积雪压弯；岩浆烧焦', () => {
  const R = createReactors({ suns: [P] }), s = R.suns[0];
  run(R, { sun: 1, sunYaw: 1.2, sunBoost: 1, wet: () => 0.5 }, 20);
  assert.ok(Math.abs(s.yaw - 1.2) < 0.05 && s.open > 0.9 && s.size > 1.2, JSON.stringify(s));
  run(R, { sun: 0.3, rain: () => 0.8, wet: () => 0.9 }, 10);
  assert.ok(s.open < 0.3 && s.droop > 0.25);
  run(R, { snow: () => 0.8, wet: () => 0.5 }, 10); assert.ok(s.droop > 0.9);
  assert.ok(has(run(R, { lava: () => 1 }, 0.2), 'burnPlant') && s.burnt);
});

test('蘑菇：湿又不晒冒出来、夜里发光；暴晒缩回去；岩浆烧掉', () => {
  const R = createReactors({ shrooms: [P] }), m = R.shrooms[0];
  run(R, { sun: 0.2, rain: () => 0.9, night: 1 }, 20);
  assert.ok(m.g > 0.9 && m.glow > 0.8);
  run(R, { sun: 1, wet: () => 0.1 }, 30); assert.ok(m.g < 0.3, 'g ' + m.g);
  run(R, { sun: 0.2, rain: () => 0.9 }, 20);
  assert.ok(has(run(R, { fire: () => 1 }, 0.2), 'burnPlant') && m.g === 0);
});

test('雪人：雪积厚了堆起来；闪电劈掉脑袋；晒太阳化掉，岩浆化得最快', () => {
  const a = createReactors({ snowmen: [P] }), s = a.snowmen[0];
  assert.ok(has(run(a, { snow: () => 0.9, sun: 0.2 }, 8), 'snowmanUp') && s.s > 0.9);
  assert.ok(has(run(a, { snow: () => 0.9, strikes: [P] }, 0.1), 'headPop') && !s.head);
  const sunny = run(a, { snow: () => 0, sun: 1 }, 13); assert.ok(s.s < 0.6 && s.s > 0, 's ' + s.s); void sunny;
  const b = createReactors({ snowmen: [P] }); run(b, { snow: () => 0.9, sun: 0.2 }, 8);
  const ev = run(b, { snow: () => 0.9, lava: () => 0.5 }, 2);
  assert.ok(has(ev, 'steam') && has(ev, 'snowmanGone') && b.snowmen[0].s === 0);
});

test('鸟群：打雷一哄而散、过一阵回树上；撒食物飞过去啄', () => {
  const R = createReactors({ birds: [{ x: 0, z: 0, y: 0.03 }, { x: 0.01, z: 0, y: 0.03 }] });
  const ev = run(R, { strikes: [{ x: 0.02, z: 0 }] }, 0.1);
  assert.ok(has(ev, 'scatter') && R.birds.every(b => b.st === 'fly'));
  run(R, {}, 3); assert.ok(R.birds[0].y > 0.05, '飞高了 ' + R.birds[0].y);
  run(R, {}, 15); assert.ok(R.birds.every(b => b.st === 'perch'), R.birds.map(b => b.st).join());
  run(R, { food: [{ x: 0.03, z: 0.01 }], groundY: () => 0 }, 3);
  assert.ok(R.birds.every(b => b.st === 'peck') && Math.hypot(R.birds[0].x - 0.03, R.birds[0].z - 0.01) < 0.008);
});
