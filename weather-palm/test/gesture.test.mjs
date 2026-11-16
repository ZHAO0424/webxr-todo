// node --test test/   （在 weather-palm 目录下）
import test from 'node:test';
import assert from 'node:assert/strict';
import { HandTracker, pose, features, synthHand } from '../gesture.js';

const DT = 1 / 60;
// 跑一段：fn(t) 返回该时刻的关节（或 null）；收集模式序列和事件
function run(fn, secs, hand = 'right', tr = new HandTracker()) {
  const modes = [], events = [];
  for (let t = 0; t < secs; t += DT) {
    tr.update(fn(t), hand, DT);
    modes.push(tr.mode); events.push(...tr.events.map(e => ({ ...e, t })));
  }
  return { tr, modes, events, last: modes[modes.length - 1] };
}
const P = [0.02, 0.15, 0.01];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = (J, a = 0.003) => J.map(v => v + (rnd() - 0.5) * 2 * a);

for (const hand of ['right', 'left']) {
  test(`静态姿态 → 对应天气（${hand}）`, () => {
    assert.equal(run(() => pose('down', P, 0.2, hand), 1, hand).last, 'rain');
    assert.equal(run(() => pose('up', P, 0.2, hand), 1, hand).last, 'sun');
    assert.equal(run(() => pose('fist', P, 0.2, hand), 1, hand).last, 'charge');
    assert.equal(run(() => pose('pinch', P, 0.2, hand), 1, hand).last, 'pinch');
    assert.equal(run(() => pose('relaxed', P, 0.2, hand), 2, hand).last, 'idle');
  });
}

test('掌心法线：左右手朝下都算朝下', () => {
  for (const h of ['left', 'right']) assert.ok(features(pose('down', P, 0, h), h).down > 0.95);
});

test('下雨要停稳 0.35 s 才生效，候选阶段有进度', () => {
  const r = run(() => pose('down', P), 0.3);
  assert.equal(r.last, 'idle');
  assert.equal(r.tr.cand, 'rain');
  assert.ok(r.tr.state.candP > 0.7);
  assert.equal(run(() => pose('down', P), 0.42).last, 'rain');
});

test('在岛外不触发天气，捏合照常', () => {
  const far = [0.3, 0.15, 0];
  assert.equal(run(() => pose('down', far), 1).last, 'idle');
  assert.equal(run(() => pose('pinch', far), 1).last, 'pinch');
  assert.equal(run(() => pose('down', [0, 0.6, 0]), 1).last, 'idle');   // 太高
});

test('立掌横扫 → 刮风，方向跟着手', () => {
  const r = run(t => pose('edge', [-0.1 + t * 0.6, 0.15, 0], 0, 'right', [1, 0]), 0.3);
  assert.equal(r.last, 'wind');
  assert.ok(r.tr.state.dx > 0.95, 'wind dir ' + r.tr.state.dx);
  const firstWind = r.modes.indexOf('wind') * DT;
  assert.ok(firstWind < 0.2, 'wind latency ' + firstWind);
});

test('掌心朝下快速平移不会刮风，也不会开始下雨', () => {
  const r = run(t => pose('down', [-0.15 + t * 0.8, 0.15, 0]), 0.35);
  assert.ok(!r.modes.includes('wind'));
  assert.ok(!r.modes.includes('rain'));
});

test('已经在下雨时，慢慢移动手，雨跟着不断', () => {
  const tr = new HandTracker();
  run(() => pose('down', [-0.08, 0.15, 0]), 0.6, 'right', tr);
  const r = run(t => pose('down', [-0.08 + t * 0.25, 0.15, 0]), 0.6, 'right', tr);
  assert.ok(r.modes.every(m => m === 'rain'));
});

test('握拳蓄满再张开 → 劈一次闪电；蓄不满 → 哑火', () => {
  const full = run(t => pose(t < 0.9 ? 'fist' : 'down', P), 1.2);
  const strikes = full.events.filter(e => e.type === 'strike');
  assert.equal(strikes.length, 1);
  assert.ok(Math.abs(strikes[0].x - P[0]) < 0.03);
  const short = run(t => pose(t < 0.35 ? 'fist' : 'down', P), 0.8);
  assert.equal(short.events.filter(e => e.type === 'strike').length, 0);
  assert.equal(short.events.filter(e => e.type === 'fizzle').length, 1);
});

test('握拳不会被当成捏合', () => {
  assert.ok(!run(() => pose('fist', P), 1).modes.includes('pinch'));
});

test('3 mm 抖动下，激活后的模式不闪', () => {
  for (const name of ['down', 'up', 'fist']) {
    const r = run(() => jitter(pose(name, P)), 3);
    const after = r.modes.slice(60);
    const flips = after.filter((m, i) => i && m !== after[i - 1]).length;
    assert.equal(flips, 0, name + ' flips ' + flips);
  }
});

test('放松的手随便晃 4 秒，不误触发天气', () => {
  const r = run(t => jitter(synthHand({ pos: [0.05 * Math.sin(t * 2), 0.14 + 0.03 * Math.sin(t * 3), 0.04 * Math.cos(t * 1.3)], n: [0.7, -0.55, 0.2], f: [0, 0, -1], curl: 0.5 + 0.08 * Math.sin(t * 5) })), 4);
  assert.ok(r.modes.every(m => m === 'idle'), [...new Set(r.modes)].join());
});

test('手丢了：状态复位，蓄雷中丢手算哑火', () => {
  const tr = new HandTracker();
  run(() => pose('fist', P), 0.5, 'right', tr);
  tr.update(null, 'right', DT);
  assert.equal(tr.mode, 'idle');
  assert.equal(tr.events[0].type, 'fizzle');
});

test('倒：立掌指尖朝下停住 → pour，落点在指尖下方；横扫的立掌仍是风', () => {
  for (const h of ['right', 'left']) {
    const r = run(() => pose('pour', P, 0, h), 0.6, h);
    assert.equal(r.last, 'pour', h);
    assert.ok(Math.hypot(r.tr.state.px - P[0], r.tr.state.pz - P[2]) < 0.04);
  }
  assert.ok(!run(() => pose('down', P), 1).modes.includes('pour'));
  const sweep = run(t => pose('edge', [-0.1 + t * 0.6, 0.15, 0], 0, 'right', [1, 0]), 0.3);
  assert.ok(!sweep.modes.includes('pour'));
});
