// 破坏 → 重建：岩浆毁掉一片，用水、土、种子、太阳把它救回来
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, step, douse, index } from '../matter.js';
import { createRestore, stepRestore } from '../restore.js';

const flat = () => createMatter(() => 0.02, (x, z) => Math.hypot(x, z) > 0.17 ? 'out' : 'grass');
const burnWithLava = m => { for (let i = 0; i < 40; i++) { pour(m, 'lava', 0, 0, 0.0006); step(m, 0.1); } for (let t = 0; t < 3; t += 0.1) step(m, 0.1); douse(m, 0, 0, 0.03); for (let t = 0; t < 1; t += 0.1) step(m, 0.1); };

test('岩浆烧过 → 记下伤疤；石头露着就不算恢复', () => {
  const m = flat(), r = createRestore();
  const env = { green: () => 0.1 };   // 烧过的地方植被没了（sim 收到 burn 会把 G 压到 0.1）
  for (let i = 0; i < 40; i++) { pour(m, 'lava', 0, 0, 0.0006); step(m, 0.1); stepRestore(r, m, env); }
  douse(m, 0, 0, 0.03); step(m, 0.1); stepRestore(r, m, env);
  assert.ok(r.scars > 5, 'scars ' + r.scars);
  assert.ok(r.pct < 0.3, 'pct ' + r.pct);
});

test('光秃秃的石头上种子种不活；铺了土就能长成树', () => {
  const m = flat(); burnWithLava(m);
  assert.ok(m.rock[index(0, 0)] > 0.0002, 'rock ' + m.rock[index(0, 0)]);
  pour(m, 'seed', 0, 0, 0); for (let t = 0; t < 1; t += 0.1) step(m, 0.1, { wet: () => 0.6 });
  assert.equal(m.saplings.length, 0); assert.ok(m.events.some(e => e.type === 'seedFail'));
  for (let i = 0; i < 30; i++) pour(m, 'soil', 0, 0, 0.0004);
  for (let t = 0; t < 1; t += 0.1) step(m, 0.1, { wet: () => 0.6 });
  m.seed = 3; pour(m, 'seed', 0, 0, 0);
  for (let t = 0; t < 5; t += 0.1) step(m, 0.1, { wet: () => 0.6, lit: () => 1 });
  assert.ok(m.saplings.some(s => s.grown), 'tree grew on soil');
});

test('下雨泡着：冷石头几十秒风化成土', () => {
  const m = flat(); burnWithLava(m); const k = index(0, 0), r0 = m.rock[k];
  for (let t = 0; t < 30; t += 0.1) step(m, 0.1, { rain: () => 1, wet: () => 1 });
  assert.ok(m.rock[k] < r0 * 0.6 && m.soil[k] > 0.0005, `rock ${r0} → ${m.rock[k]} soil ${m.soil[k]}`);
});

test('整条链：岩浆毁掉 → 浇水冷成石 → 铺土 → 晒太阳长草 → 恢复到 100%，发 restored', () => {
  let g = 0.1; const m = flat(), r = createRestore(), env = { green: () => g };   // 没被石头盖住的边上：植被晒着慢慢长回来（像 sim 的 G）
  for (let i = 0; i < 40; i++) { pour(m, 'lava', 0, 0, 0.0006); step(m, 0.1); stepRestore(r, m, env); }
  douse(m, 0, 0, 0.03); for (let t = 0; t < 1; t += 0.1) { step(m, 0.1); stepRestore(r, m, env); }
  const scars = r.scars; assert.ok(scars > 5 && r.pct < 0.3);
  // 铺土：把伤疤都盖上
  for (let a = 0; a < 60; a++) for (const rr of [0, 0.006, 0.012, 0.018]) pour(m, 'soil', Math.cos(a) * rr, Math.sin(a) * rr, 0.0002);
  let restored = false, mid = null;
  for (let t = 0; t < 40 && !restored; t += 0.1) {
    g = Math.min(1, g + 0.1 * 0.05); step(m, 0.1, { wet: () => 0.6, lit: () => 1 }); stepRestore(r, m, env);
    if (t > 1 && mid == null && r.pct > 0.3) mid = r.pct;
    restored = r.events.some(e => e.type === 'restored');
  }
  assert.ok(r.events.some(e => e.type === 'healed'), 'healed events');
  assert.ok(restored, 'pct ' + r.pct);
  assert.ok(mid != null && mid < 1, 'went up gradually ' + mid);
});
