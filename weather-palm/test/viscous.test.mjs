// 岩浆越冷越稠：烫的流得远、摊得薄；凉下来就停住、堆高（倒得慢 → 堆成陡锥 / 塔）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatter, pour, step, index, MG, MC } from '../matter.js';

const flat = () => createMatter(() => 0.02, () => 'rock');
const shape = m => { let peak = 0, cells = 0; for (let k = 0; k < MG * MG; k++) { const h = m.lava[k] + m.rock[k]; if (h > 1e-5) cells++; peak = Math.max(peak, h); } return { peak, cells }; };

test('同样多的岩浆：慢慢倒堆成高锥，一次倒下摊成一片', () => {
  const slow = flat(), fast = flat(), total = 0.03;
  pour(fast, 'lava', 0, 0, total);
  for (let i = 0; i < 300; i++) { if (i < 200) pour(slow, 'lava', 0, 0, total / 200); step(slow, 0.1); step(fast, 0.1); }
  const a = shape(slow), b = shape(fast);
  console.log('slow', a, 'fast', b);
  assert.ok(a.peak > b.peak * 1.3, `peak slow ${a.peak} fast ${b.peak}`);
  assert.ok(a.cells < b.cells * 0.75, `cells slow ${a.cells} fast ${b.cells}`);
});

test('凉下来的岩浆在坡上停住，烫的才往下流', () => {
  const slope = (x) => 0.06 - x * 0.3;   // 往 +x 低（每格约 1 mm 的坡）
  const hot = createMatter((x) => slope(x), () => 'rock'), cold = createMatter((x) => slope(x), () => 'rock');
  pour(hot, 'lava', 0, 0, 0.02); pour(cold, 'lava', 0, 0, 0.02);
  for (let k = 0; k < MG * MG; k++) if (cold.lava[k] > 0) cold.heat[k] = 0.45;
  for (let i = 0; i < 20; i++) { step(hot, 0.1); step(cold, 0.1); }
  const reach = m => { let far = 0; for (let k = 0; k < MG * MG; k++) if (m.lava[k] > 1e-6) far = Math.max(far, (k % MG) - MG / 2); return far; };
  console.log('reach hot', reach(hot), 'cold', reach(cold));
  assert.ok(reach(hot) > reach(cold) + 1);
});

test('流过去的热岩浆和凉的混合：温度按体积平均，不会把凉的整块重新烧烫', () => {
  const m = flat(); const k = index(0.001, 0.001), k2 = k + 1;
  m.lava[k] = 0.006; m.heat[k] = 1; m.lava[k2] = 0.001; m.heat[k2] = 0.2;
  step(m, 0.1);
  assert.ok(m.heat[k2] > 0.25 && m.heat[k2] < 0.8, 'mixed heat ' + m.heat[k2]);
});
