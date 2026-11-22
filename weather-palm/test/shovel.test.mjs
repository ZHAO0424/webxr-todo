// 铲子：从上往下铲掉堆的东西（沙 → 土 → 玻璃 → 石头），岩浆铲不动；没东西的格子交回去（让调用方挖地面）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, scoop, index, MC, center } from '../matter.js';
const [X, Z] = center(48, 48);   // 一格的正中心

const flat = () => createMatter(() => 0.02, (x, z) => Math.hypot(x, z) > 0.17 ? 'out' : 'grass');

test('铲沙堆：一铲一层，铲到底就把这格交回去挖地面', () => {
  const m = flat(), k = index(X, Z);
  for (let i = 0; i < 10; i++) pour(m, 'sand', X, Z, 0.002);
  const s0 = m.sand[k];
  const g = scoop(m, X, Z, MC * 0.6, 0.0016);
  assert.ok(g.sand > 0 && m.sand[k] < s0 && m.sand[k] > 0, `one layer ${s0} → ${m.sand[k]}`);
  assert.equal(g.cells.length, 0);
  for (let n = 0; n < 20; n++) scoop(m, X, Z, MC * 0.6, 0.0016);
  assert.ok(m.sand[k] < 1e-6);
  assert.deepEqual(scoop(m, X, Z, MC * 0.6, 0.0016).cells, [k]);
});

test('先铲上面的沙，再铲下面的土；岩浆铲不动', () => {
  const m = flat(), k = index(X, Z);
  m.soil[k] = 0.002; m.sand[k] = 0.001;
  scoop(m, X, Z, MC * 0.4, 0.0012);
  assert.equal(m.sand[k], 0); assert.ok(Math.abs(m.soil[k] - 0.0018) < 1e-6, 'soil ' + m.soil[k]);
  m.lava[k] = 0.002; const g = scoop(m, X, Z, MC * 0.4, 0.0012);
  assert.equal(g.soil, 0); assert.equal(g.cells.length, 0);
});
