// 龙卷风搬东西：脚下的沙 / 土被卷走、一路甩、散的时候落在别处；总量守恒；小苗被带走换个地方扎根
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, index, totals } from '../matter.js';
import { stepWhirl, dropAll } from '../whirl.js';

const flat = () => createMatter(() => 0.02, (x, z) => Math.hypot(x, z) > 0.17 ? 'out' : 'grass');
const seq = () => { let s = 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const near = (m, f, x, z, r) => { let s = 0; for (let k = 0; k < m[f].length; k++) { const i = k % 96, j = (k / 96) | 0, cx = -0.17 + (i + 0.5) * 0.34 / 96, cz = -0.17 + (j + 0.5) * 0.34 / 96; if (Math.hypot(cx - x, cz - z) < r) s += m[f][k]; } return s; };

test('卷走脚下的沙和土，走一路甩一路，散了落在别处；总量不变', () => {
  const m = flat(), rnd = seq();
  for (let i = 0; i < 30; i++) { pour(m, 'sand', 0, 0, 0.001); pour(m, 'soil', 0.003, 0, 0.0006); }
  const t0 = totals(m), sand0 = near(m, 'sand', 0, 0, 0.01), soil0 = near(m, 'soil', 0, 0, 0.01);
  const wh = { x: 0, z: 0 };
  for (let t = 0; t < 2; t += 0.1) stepWhirl(wh, m, 0.1, rnd);
  assert.ok(wh.load.sand > 0 && wh.load.soil > 0, 'carrying ' + JSON.stringify(wh.load));
  for (let t = 0; t < 6; t += 0.1) { wh.x += 0.012 * 0.1; stepWhirl(wh, m, 0.1, rnd); }   // 往东走 7 cm
  dropAll(wh, m, rnd);
  assert.ok(near(m, 'sand', 0, 0, 0.01) < sand0 * 0.7, `pile shrank ${sand0} → ${near(m, 'sand', 0, 0, 0.01)}`);
  assert.ok(near(m, 'soil', 0, 0, 0.01) < soil0 * 0.85, 'soil moved too');
  assert.ok(near(m, 'sand', wh.x, 0, 0.045) > 0.001, 'landed around where it ended');
  const t1 = totals(m);
  assert.ok(Math.abs(t1.sand + t1.soil - t0.sand - t0.soil) < (t0.sand + t0.soil) * 1e-4, `conserved ${t0.sand + t0.soil} → ${t1.sand + t1.soil}`);   // Float32 舍入
  assert.equal(wh.load.sand + wh.load.soil < 1e-12, true);
});

test('水里卷不起来；小苗被连根带走，换个地方重新扎根', () => {
  const m = flat(), rnd = seq(), k = index(0, 0);
  pour(m, 'sand', 0, 0, 0.003); for (let kk = 0; kk < m.water.length; kk++) m.water[kk] = 0.002;
  const wh = { x: 0, z: 0 }; stepWhirl(wh, m, 0.1, rnd); assert.equal(wh.load.sand, 0);
  for (let kk = 0; kk < m.water.length; kk++) m.water[kk] = 0;
  m.saplings.push({ x: 0.08, z: 0, g: 0.2, t: 1 });
  const w2 = { x: 0.08, z: 0 }; stepWhirl(w2, m, 0.1, rnd);
  assert.equal(m.saplings.length, 0); assert.equal(w2.sprouts, 1);
  w2.x = 0.12; dropAll(w2, m, rnd);
  assert.equal(m.saplings.length, 1); assert.ok(Math.hypot(m.saplings[0].x - 0.08, m.saplings[0].z) > 0.02, 'replanted elsewhere');
  assert.ok(m.sand[k] > 0);
});
