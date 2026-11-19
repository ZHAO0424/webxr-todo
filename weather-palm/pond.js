// 掌心气象台 · 池塘生态：积水里长水草，水草喂鱼（纯数据，Node 里能测）
//
//   水草   地表水够深（DEEP）、积得够久，水底就冒出水草；旁边已经有水草的长得快（一丛丛蔓开），有太阳长得更快；
//          水干了慢慢枯掉；岩浆流进来一下烧光。
//   鱼     只能在够深的水里游（游到浅水边会掉头）；饿了往有水草的格子游、吃水草（水草被吃少）；
//          吃饱了、长大了会生小鱼（池塘越大能养越多）；水干了搁浅、扑腾一阵就死；岩浆烫死；一直没吃的会饿死。
//
// 用法：const p = createPond()；addFish(p, m, x, z) 放一条（水不够深就放不进去）；每 0.1 s stepPond(p, m, dt, { sun })。
// m 是 matter.js 的物质格（读 water / lava，不改它们）。事件放在 p.events：
//   weedBurn（岩浆烧水草）/ fishIn（放进去）/ fishBorn / fishEat / fishFlop（搁浅扑腾）/ fishDie（why: dry | hot | hungry）

import { MG, MC, index } from './matter.js';

export const DEEP = 0.0008;     // 水深够这么多才算池塘：水草能长、鱼能游
export const FISH_MAX = 60;
const SPEED = 0.006;            // 鱼游多快（米 / 秒）
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const rnd = p => { let t = (p.seed = (p.seed + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const centerOf = k => [-0.17 + ((k % MG) + 0.5) * MC, -0.17 + (((k / MG) | 0) + 0.5) * MC];
const deepAt = (m, x, z) => { const k = index(x, z); return k >= 0 && m.kind[k] !== 0 && m.water[k] >= DEEP && m.lava[k] < 1e-5; };

export function createPond(seed = 777) {
  return { weed: new Float32Array(MG * MG), standT: new Float32Array(MG * MG), fish: [], events: [], seed, stats: { born: 0, died: 0, eaten: 0 } };
}

export function addFish(p, m, x, z, size = 0.8) {
  if (p.fish.length >= FISH_MAX || !deepAt(m, x, z)) return false;
  p.fish.push({ x, z, a: rnd(p) * Math.PI * 2, full: 0.6, age: 0, dry: 0, size, eatT: 0 });
  p.events.push({ type: 'fishIn', x, z });
  return true;
}

export function stepPond(p, m, dt, env = {}) {
  const sun = env.sun ?? 1, n = MG * MG, W = m.water, weed = p.weed, lit = env.lit || (() => 0);
  // 水草
  let pondCells = 0;
  for (let k = 0; k < n; k++) {
    if (!m.kind[k]) continue;
    const deep = W[k] >= DEEP, hot = m.lava[k] > 1e-5;
    if (hot) { if (weed[k] > 0.05) p.events.push({ type: 'weedBurn', k }); weed[k] = 0; p.standT[k] = 0; continue; }
    p.standT[k] = deep ? p.standT[k] + dt : Math.max(0, p.standT[k] - dt * 2);
    if (deep) pondCells++;
    if (deep && p.standT[k] > 6) {
      const i = k % MG, j = (k / MG) | 0; let nb = 0;
      for (const [di, dj] of N4) { const ni = i + di, nj = j + dj; if (ni >= 0 && nj >= 0 && ni < MG && nj < MG) nb = Math.max(nb, weed[nj * MG + ni]); }
      weed[k] = Math.min(1, weed[k] + dt * (0.02 + 0.08 * nb) * (0.4 + 0.6 * sun) * (1 + 10 * lit(...centerOf(k))));   // 手掌晒着长得飞快   // 自己冒出来慢，旁边有水草蔓过来快
    } else if (W[k] < DEEP * 0.3) weed[k] = Math.max(0, weed[k] - dt * 0.04);   // 水干了枯掉
  }
  // 鱼
  const cap = Math.min(FISH_MAX, Math.floor(pondCells / 10));   // 池塘越大养得越多
  const born = [];
  p.fish = p.fish.filter(f => {
    f.age += dt; f.size = Math.min(1, f.size + dt * 0.01);
    const k = index(f.x, f.z), w0 = k >= 0 ? W[k] : 0;
    if (k >= 0 && m.lava[k] > 1e-5) { p.events.push({ type: 'fishDie', why: 'hot', x: f.x, z: f.z }); p.stats.died++; return false; }
    if (w0 < DEEP * 0.4) {   // 搁浅：扑腾一阵就死
      f.dry += dt; if (rnd(p) < dt * 3) p.events.push({ type: 'fishFlop', x: f.x, z: f.z });
      if (f.dry > 4) { p.events.push({ type: 'fishDie', why: 'dry', x: f.x, z: f.z }); p.stats.died++; return false; }
      return true;
    }
    f.dry = 0;
    // 游：随便晃；饿了朝附近水草最多的方向拐；前面水浅就掉头
    f.a += (rnd(p) - 0.5) * dt * 4;
    if (f.full < 0.7) {
      let best = 0, ba = f.a;
      for (let s = 0; s < 6; s++) { const a = f.a + (s - 2.5) * 0.6, x = f.x + Math.cos(a) * MC * 3, z = f.z + Math.sin(a) * MC * 3, kk = index(x, z); if (kk >= 0 && deepAt(m, x, z) && weed[kk] > best) { best = weed[kk]; ba = a; } }
      if (best > 0.05) f.a += (ba - f.a) * Math.min(1, dt * 3);
    }
    const v = SPEED * (0.6 + 0.4 * f.size) * (f.full < 0.3 ? 1.3 : 1), nx = f.x + Math.cos(f.a) * v * dt, nz = f.z + Math.sin(f.a) * v * dt;
    if (deepAt(m, nx + Math.cos(f.a) * MC * 0.6, nz + Math.sin(f.a) * MC * 0.6)) { f.x = nx; f.z = nz; } else f.a += Math.PI * (0.6 + 0.4 * rnd(p));
    // 吃水草
    f.full -= dt * 0.012;
    if (weed[k] > 0.08 && f.full < 1.2) { const e = Math.min(weed[k] - 0.05, dt * 0.03); weed[k] -= e; f.full += e * 6; p.stats.eaten += e; f.eatT += dt; if (f.eatT > 1.5) { f.eatT = 0; p.events.push({ type: 'fishEat', x: f.x, z: f.z }); } }
    if (f.full < -0.4) { p.events.push({ type: 'fishDie', why: 'hungry', x: f.x, z: f.z }); p.stats.died++; return false; }
    // 生小鱼
    if (f.full > 1 && f.age > 12 && f.size > 0.95 && p.fish.length + born.length < cap) {
      f.full -= 0.6; born.push({ x: f.x, z: f.z, a: f.a + Math.PI, full: 0.5, age: 0, dry: 0, size: 0.4, eatT: 0 });
      p.events.push({ type: 'fishBorn', x: f.x, z: f.z }); p.stats.born++;
    }
    return true;
  });
  p.fish.push(...born);
}
