// 树烧掉以后：焦树干 → 木炭渣 → 散掉 → 重新长
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE, burnTree, stepRemains, snagHeight } from '../decay.js';

// 跑到某个阶段为止，返回用了多少秒 + 一路的事件
let seed = 7; const lcg = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const until = (t, env, stage, max = 600, rnd = lcg) => {
  const evs = []; let s = 0;
  for (; s < max && t.stage !== stage; s += 0.1) evs.push(...stepRemains(t, env, 0.1, rnd));
  return { s, evs, types: new Set(evs.map(e => e.type)) };
};

test('烧了变成焦树干，刚烧完透着红', () => {
  const t = {}; assert.ok(burnTree(t));
  assert.equal(t.stage, STAGE.SNAG); assert.equal(t.glow, 1); assert.equal(snagHeight(t), 1);
  assert.ok(!burnTree(t), '已经是焦树干，不会再"烧成焦树干"');
});

test('什么都不做：焦树干约两分钟塌成炭堆，炭堆再一分半散完', () => {
  const t = {}; burnTree(t);
  const a = until(t, {}, STAGE.CHAR);
  assert.ok(a.s > 100 && a.s < 140, 'snag ' + a.s); assert.ok(a.types.has('collapse'));
  const b = until(t, {}, STAGE.GONE);
  assert.ok(b.s > 75 && b.s < 105, 'char ' + b.s); assert.ok(b.types.has('gone'));
});

test('下雨：余火一浇就灭（冒汽），焦树干泡软塌得快，炭渣被冲走', () => {
  const t = {}; burnTree(t);
  const env = { rain: 0.8 };
  const a = until(t, env, STAGE.CHAR);
  assert.ok(a.types.has('quench'));
  assert.equal(t.glow, 0);
  assert.ok(a.s < 70, 'rain snag ' + a.s);
  const b = until(t, env, STAGE.GONE);
  assert.ok(b.s < 60, 'rain char ' + b.s); assert.ok(b.types.has('wash'));
});

test('刮风：炭堆被吹成一股股灰，比放着散得快', () => {
  const calm = {}; burnTree(calm); until(calm, {}, STAGE.CHAR); const c0 = until(calm, {}, STAGE.GONE).s;
  const windy = {}; burnTree(windy); until(windy, { wind: 0.8 }, STAGE.CHAR);
  const w = until(windy, { wind: 0.8 }, STAGE.GONE);
  assert.ok(w.s < c0 * 0.6, `windy ${w.s} vs calm ${c0}`); assert.ok(w.types.has('ash'));
});

test('大风一阵能把焦树干直接吹倒', () => {
  const t = {}; burnTree(t);
  const a = until(t, { wind: 0.9 }, STAGE.CHAR, 600, () => 0.001);   // 每步都"碰上"一阵大风
  assert.ok(a.s < 5, 'gust ' + a.s);
});

test('岩浆：舔到焦树干很快塌，漫过炭堆直接埋掉', () => {
  const t = {}; burnTree(t);
  const a = until(t, { lava: 0.0002 }, STAGE.CHAR);
  assert.ok(a.s < 4, 'lava snag ' + a.s);
  const ev = stepRemains(t, { lava: 0.001 }, 0.1);
  assert.equal(t.stage, STAGE.GONE); assert.equal(ev[0].type, 'bury');
});

test('水流冲根：地表水流得急，焦树干塌得快', () => {
  const t = {}; burnTree(t);
  assert.ok(until(t, { flow: 0.003 }, STAGE.CHAR).s < 70);
});

test('散完以后：地上重新绿了、歇够了才长回来；岩浆上不长', () => {
  const t = {}; burnTree(t); until(t, { lava: 0.0002 }, STAGE.CHAR); until(t, { lava: 0.001 }, STAGE.GONE);
  const bare = until(t, { green: 0.2, th: 0.4 }, STAGE.ALIVE, 120, () => 0);
  assert.equal(t.stage, STAGE.GONE, '地是秃的不长');
  t.rest = 0;
  const lava = until(t, { green: 0.9, th: 0.4, lava: 0.001 }, STAGE.ALIVE, 120, () => 0);
  assert.equal(t.stage, STAGE.GONE, '岩浆上不长');
  t.rest = 0;
  const g = until(t, { green: 0.9, th: 0.4 }, STAGE.ALIVE, 200, () => 0);
  assert.equal(t.stage, STAGE.ALIVE); assert.ok(g.s >= 45, 'rest ' + g.s); assert.ok(g.types.has('regrow'));
  void bare; void lava;
});
