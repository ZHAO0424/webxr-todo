// 掌心气象台 · 倒进岛里的东西：岩浆、沙子、种子，以及岩浆点起来的火（纯数据 + 纯函数，Node 里能测）
//
// 一张 96×96 的格子（每格约 3.5 mm）叠在地形上：
//   岩浆：往低处流（越烫越稀），慢慢冷成黑石头；碰到水"嗤"一声立刻变石头，能把湖填出新陆地；碰到干的草木就点着。
//   火：在林子、草地里蔓延，顺风更快；下雨灭火；烧过的地方变焦土，过一阵再长回来（生长在 sim.js）。
//   沙子：一倒一堆，坡太陡就往下滑；掉进水里能填出浅滩。
//   种子：落在草地上变成小苗，有水有光就长成树。
// 用法：const m = createMatter(heightFn, kindFn)；pour(m, 'lava'|'sand'|'seed', x, z, 量)；每 0.1 s step(m, dt, env)。
//   heightFn(x,z) 地面高度；kindFn(x,z) 返回 'water' | 'forest' | 'grass' | 'rock' | 'out' 等。
//   env = { rain(x,z) 0–1, wet(x,z) 0–1 土壤湿度, wind:[x,z] }
// 每步产生的事件放在 m.events：steam / ignite / burn（给 sim 用：烧掉植物）/ fill（湖填出了陆地）/ sapling / grown。

export const MG = 96;
export const R = 0.17;
export const MC = (2 * R) / MG;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const YIELD = 0.00035;        // 岩浆薄到这个厚度就流不动了（黏）
const REPOSE = MC * 0.6;     // 沙子的休止角：相邻格高差超过这个就滑
const FILL = 0.0022;         // 水里堆到这么厚就算填出了陆地

// 可复现的随机数（存在 m.seed 里）
const rnd = m => { let t = (m.seed = (m.seed + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const center = (i, j) => [-R + (i + 0.5) * MC, -R + (j + 0.5) * MC];
export const index = (x, z) => { const i = Math.floor((x + R) / MC), j = Math.floor((z + R) / MC); return i < 0 || j < 0 || i >= MG || j >= MG ? -1 : j * MG + i; };

export function createMatter(heightFn, kindFn) {
  const n = MG * MG;
  const m = {
    base: new Float32Array(n), kind: new Uint8Array(n),   // 0 岛外 1 陆地 2 水 3 林子 4 草 5 石头
    lava: new Float32Array(n), heat: new Float32Array(n), rock: new Float32Array(n), sand: new Float32Array(n),
    fire: new Float32Array(n), fuel: new Float32Array(n), burnt: new Uint8Array(n), filled: new Uint8Array(n),
    saplings: [], events: [], t: 0, seed: 12345, stats: { steam: 0, burnt: 0, filled: 0 },
  };
  const K = { out: 0, water: 2, forest: 3, grass: 4, flower: 4, marsh: 4, rock: 5, snow: 5, beach: 1 };
  for (let j = 0; j < MG; j++) for (let i = 0; i < MG; i++) {
    const k = j * MG + i, [x, z] = center(i, j), kd = kindFn(x, z);
    m.kind[k] = K[kd] ?? 1;
    m.base[k] = m.kind[k] ? heightFn(x, z) : 0;
    m.fuel[k] = m.kind[k] === 3 ? 1 : m.kind[k] === 4 ? 0.6 : 0;
  }
  return m;
}
export const top = (m, k) => m.base[k] + m.rock[k] + m.sand[k] + m.lava[k];
export const surface = (m, x, z) => { const k = index(x, z); return k < 0 ? 0 : top(m, k); };
// 动物、树要躲开的格子：岩浆、着火
export const blocked = (m, x, z) => { const k = index(x, z); return k >= 0 && (m.lava[k] > 0.0004 || m.fire[k] > 0); };

// 倒：量按"米厚度 × 一格面积"算，摊在落点周围一圈格子上
export function pour(m, what, x, z, amount) {
  if (what === 'seed') {
    if (m.saplings.length < 80) {
      const a = rnd(m) * Math.PI * 2, d = rnd(m) * 0.006, sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d, k = index(sx, sz);
      if (k >= 0 && (m.kind[k] === 3 || m.kind[k] === 4 || m.kind[k] === 1) && !m.filled[k] && m.lava[k] < 0.0003) { m.saplings.push({ x: sx, z: sz, g: 0, t: 0 }); m.events.push({ type: 'sapling', x: sx, z: sz }); }
    }
    return;
  }
  const i0 = Math.floor((x + R) / MC), j0 = Math.floor((z + R) / MC);
  const cells = [];
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= MG || j >= MG) continue;
    const k = j * MG + i; if (!m.kind[k]) continue;
    cells.push([k, di === 0 && dj === 0 ? 2 : 1]);
  }
  const tot = cells.reduce((s, c) => s + c[1], 0);
  for (const [k, wgt] of cells) {
    const a = amount * wgt / tot;
    if (what === 'lava') { m.lava[k] += a; m.heat[k] = 1; }
    else if (what === 'sand') m.sand[k] += a;
  }
}

export function step(m, dt, env = {}) {
  m.t += dt;
  const rain = env.rain || (() => 0), wet0 = env.wet || (() => 0.3), wind = env.wind || [0, 0];
  // 植被能烧多少：外面给（按模拟里实际长了多少）；没给就用开局的草木
  if (env.fuel) for (let k = 0; k < MG * MG; k++) if (!m.burnt[k] && m.fire[k] <= 0) m.fuel[k] = env.fuel(...center(k % MG, (k / MG) | 0));
  // 岩浆的辐射热把周围烤干：dry 0–1，越近越干；湿度按 (1 − dry) 打折
  m.dry ??= new Float32Array(MG * MG);
  const wet = (x, z) => { const k = index(x, z); return wet0(x, z) * (k >= 0 ? 1 - m.dry[k] : 1); };
  const n = MG * MG;
  const dLava = new Float32Array(n), dSand = new Float32Array(n);
  // 1. 岩浆往低处流、沙子往下滑（先按快照算出变化量，再一起加上）
  for (let k = 0; k < n; k++) {
    const L = m.lava[k], Sd = m.sand[k];
    if (L <= 1e-6 && Sd <= 1e-6) continue;
    const i = k % MG, j = (k / MG) | 0, h = top(m, k);
    if (L > 1e-6) {
      const rate = Math.min(0.24, (0.6 + 2.0 * m.heat[k]) * dt);
      let out = 0; const flows = [];
      for (const [di, dj] of N4) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= MG || nj >= MG || !m.kind[nj * MG + ni]) { if (L > YIELD) { flows.push([-1, (L - YIELD) * rate * 0.5]); } continue; }   // 从岛边流下去
        const nk = nj * MG + ni, diff = h - top(m, nk);
        if (diff > YIELD) flows.push([nk, (diff - YIELD) * rate * 0.5]);
      }
      for (const f of flows) out += f[1];
      const lim = Math.min(1, (L * 0.9) / Math.max(out, 1e-12));
      for (const [nk, a] of flows) { const v = a * lim; dLava[k] -= v; if (nk >= 0) { dLava[nk] += v; m.heat[nk] = Math.max(m.heat[nk], m.heat[k] * 0.97); } }
    }
    if (Sd > 1e-6) {   // 往所有比休止角还低的邻格分
      const flows = []; let out = 0;
      for (const [di, dj] of N4) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= MG || nj >= MG) continue;
        const nk = nj * MG + ni; if (!m.kind[nk]) continue;
        const diff = h - top(m, nk); if (diff > REPOSE) { const v = (diff - REPOSE) * 0.25; flows.push([nk, v]); out += v; }
      }
      const lim = Math.min(1, Sd / Math.max(out, 1e-12)) * Math.min(1, dt * 8);
      for (const [nk, v] of flows) { dSand[k] -= v * lim; dSand[nk] += v * lim; }
    }
  }
  for (let k = 0; k < n; k++) {
    if (dLava[k]) m.lava[k] = Math.max(0, m.lava[k] + dLava[k]);
    if (dSand[k]) m.sand[k] = Math.max(0, m.sand[k] + dSand[k]);
  }
  for (let k = 0; k < n; k++) if (m.dry[k] > 0) m.dry[k] = Math.max(0, m.dry[k] - dt * (0.02 + 0.4 * rain(...center(k % MG, (k / MG) | 0))));
  // 2. 冷却、遇水、点火
  for (let k = 0; k < n; k++) {
    const i = k % MG, j = (k / MG) | 0, [x, z] = center(i, j);
    const L = m.lava[k];
    if (L > 1e-6) {
      const water = m.kind[k] === 2 && !m.filled[k];
      if (water) {   // 岩浆进水：立刻变石头，冒白汽
        m.rock[k] += L; m.lava[k] = 0; m.heat[k] = 0;
        m.events.push({ type: 'steam', x, z, a: L }); m.stats.steam++;
      } else {
        const r = rain(x, z);
        m.heat[k] = Math.max(0, m.heat[k] - dt * (0.018 + r * 0.3 + (L < 0.0012 ? 0.03 : 0)));   // 一摊岩浆能烫上半分钟
        if (r > 0.2 && rnd(m) < dt * 2 * r) { m.events.push({ type: 'steam', x, z, a: 0.0005 }); m.stats.steam++; }
        if (m.heat[k] < 0.35) { const c = Math.min(L, (0.0016 + 0.25 * L) * dt * (1 + r * 4)); m.lava[k] -= c; m.rock[k] += c; }
        // 烫的岩浆：三格内的草木被烤干（越近越快），烤干了就着；紧挨着的直接点着
        if (m.heat[k] > 0.3) for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
          const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= MG || nj >= MG || (di === 0 && dj === 0)) continue;
          const nk = nj * MG + ni, d = Math.hypot(di, dj); if (d > 3.2 || m.lava[nk] > 1e-6) continue;
          m.dry[nk] = Math.min(1, m.dry[nk] + dt * m.heat[k] * 0.5 / (d * d));
          if (m.fuel[nk] > 0.15 && m.fire[nk] <= 0 && !m.burnt[nk] && wet(...center(ni, nj)) < (d < 1.5 ? 0.4 : 0.25) && rnd(m) < dt * (d < 1.5 ? 3 : 0.6)) { m.fire[nk] = 6 + 4 * m.fuel[nk]; m.events.push({ type: 'ignite', x: center(ni, nj)[0], z: center(ni, nj)[1] }); }
        }
        if (m.heat[k] > 0.3 && rnd(m) < dt * 0.6) m.events.push({ type: 'scorch', x, z, a: m.heat[k] });   // 给模拟：这一片的地被烤干
        if (m.fuel[k] > 0 && !m.burnt[k]) { m.burnt[k] = 1; m.fuel[k] = 0; m.events.push({ type: 'burn', x, z, r: MC }); m.stats.burnt++; }
      }
    }
    // 水里堆满了：填出陆地
    if (m.kind[k] === 2 && !m.filled[k] && m.rock[k] + m.sand[k] > FILL) { m.filled[k] = 1; m.stats.filled++; m.events.push({ type: 'fill', x, z }); }
  }
  // 3. 火：烧完变焦土；顺风、越干蔓延越快；下雨灭火
  const wm = Math.hypot(wind[0], wind[1]);
  for (let k = 0; k < n; k++) {
    if (m.fire[k] <= 0) continue;
    const i = k % MG, j = (k / MG) | 0, [x, z] = center(i, j), r = rain(x, z);
    m.fire[k] -= dt * (1 + r * 8);
    if (r > 0.25 && rnd(m) < dt * 3) m.events.push({ type: 'steam', x, z, a: 0.0003 });
    if (m.fire[k] > 0 && r < 0.2) for (const [di, dj] of N4) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= MG || nj >= MG) continue;
      const nk = nj * MG + ni;
      if (m.fuel[nk] <= 0.2 || m.fire[nk] > 0 || m.burnt[nk]) continue;
      const along = wm > 0.05 ? (di * wind[0] + dj * wind[1]) / wm : 0;
      const dry = 1 - Math.min(1, wet(...center(ni, nj)) / 0.6);
      if (rnd(m) < dt * 0.2 * m.fuel[nk] * dry * (1 + 2.5 * Math.max(0, along) * wm)) { m.fire[nk] = 5 + 4 * m.fuel[nk]; m.events.push({ type: 'ignite', x: center(ni, nj)[0], z: center(ni, nj)[1] }); }
    }
    if (m.fire[k] <= 0) { m.fire[k] = 0; m.burnt[k] = 1; m.fuel[k] = 0; m.events.push({ type: 'burn', x, z, r: MC * 1.2 }); m.stats.burnt++; }
  }
  // 4. 小苗：有水有光就长；被岩浆盖住、被火烧到就没了
  for (const s of m.saplings) {
    const k = index(s.x, s.z);
    if (k < 0 || m.lava[k] > 0.0003 || m.fire[k] > 0) { s.dead = true; continue; }
    s.t += dt;
    const wv = wet(s.x, s.z);
    if (wv > 0.25) s.g = Math.min(1, s.g + dt * 0.03 * (env.sun ?? 1));
    if (s.g >= 1 && !s.grown) { s.grown = true; m.events.push({ type: 'grown', x: s.x, z: s.z }); }
  }
  m.saplings = m.saplings.filter(s => !s.dead);
  // 烧过的地方慢慢长回草（焦土 → 可燃）
  if (rnd(m) < dt * 0.2) for (let k = 0; k < n; k += 7) if (m.burnt[k] && rnd(m) < 0.02 && m.lava[k] < 1e-6) { m.burnt[k] = 0; m.fuel[k] = m.kind[k] === 3 ? 0.6 : 0.4; }
  return m;
}

// 浇水：灭火、岩浆一下子冷成石头（冒白汽）
export function douse(m, x, z, r = 0.014) {
  for (let j = 0; j < MG; j++) for (let i = 0; i < MG; i++) {
    const [cx, cz] = center(i, j); if (Math.hypot(cx - x, cz - z) > r) continue;
    const k = j * MG + i;
    if (m.fire[k] > 0) { m.fire[k] = 0; m.events.push({ type: 'steam', x: cx, z: cz, a: 0.0003 }); }
    if (m.lava[k] > 1e-5) { m.rock[k] += m.lava[k]; m.lava[k] = 0; m.heat[k] = 0; m.events.push({ type: 'steam', x: cx, z: cz, a: 0.001 }); m.stats.steam++; }
  }
}
// 闪电劈到干的草木上：点着
export function ignite(m, x, z, wet = 0.3) {
  const k = index(x, z);
  if (k >= 0 && m.fuel[k] > 0.2 && !m.burnt[k] && m.fire[k] <= 0 && wet < 0.35) { m.fire[k] = 6; m.events.push({ type: 'ignite', x, z }); return true; }
  return false;
}

// 总量（测试用：岩浆 + 石头守恒，除了流出岛边的）
export function totals(m) { let lava = 0, rock = 0, sand = 0; for (let k = 0; k < MG * MG; k++) { lava += m.lava[k]; rock += m.rock[k]; sand += m.sand[k]; } return { lava, rock, sand }; }
