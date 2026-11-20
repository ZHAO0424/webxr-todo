// 掌心气象台 · 倒进岛里的东西：岩浆、沙子、种子，以及岩浆点起来的火（纯数据 + 纯函数，Node 里能测）
//
// 一张 96×96 的格子（每格约 3.5 mm）叠在地形上：
//   岩浆：往低处流（越烫越稀），慢慢冷成黑石头；碰到水"嗤"一声立刻变石头，能把湖填出新陆地；碰到干的草木就点着。
//   火：在林子、草地里蔓延，顺风更快；下雨灭火；烧过的地方变焦土，过一阵再长回来（生长在 sim.js）。
//   沙子：一倒一堆，坡太陡就往下滑；掉进水里能填出浅滩。
//   种子：落在草地上变成小苗，有水有光就长成树。
//   地表水：倒下来 / 雨下大了地吸不动就积在地面上，顺坡往低处流、在洼地里积成水洼，满了漫出去；
//     流进湖 / 河就并进去（湖水涨），流到岛边就从边上淌下去没了；平时慢慢渗进土里（沙地快、石头慢、
//     地已经湿透就渗不动）、太阳下慢慢蒸发。水流得急会把沙子冲着走；漫到岩浆上冷成石头冒白汽；漫到火上灭火。
//   东西会互相变（地形跟着变）：
//     沙子泡透了水 → 慢慢变成土；土湿着、晒得到太阳 → 长草（给 sim：这片地变肥）；
//     冷掉的岩浆石常被水泡 / 淋 → 风化成土（火山灰土最肥）；
//     烫的岩浆漫过沙子 → 烧成玻璃；漫过土 → 烤成石头、草烧光；
//     倒水砸在沙子 / 土上 → 落点冲出个坑（往四周溅开）；急流慢慢冲走土。
// 用法：const m = createMatter(heightFn, kindFn)；pour(m, 'lava'|'sand'|'seed', x, z, 量)；每 0.1 s step(m, dt, env)。
//   heightFn(x,z) 地面高度；kindFn(x,z) 返回 'water' | 'forest' | 'grass' | 'rock' | 'out' 等。
//   env = { rain(x,z) 0–1, wet(x,z) 0–1 土壤湿度, wind:[x,z] }
// 每步产生的事件放在 m.events：steam / ignite / burn（给 sim 用：烧掉植物）/ fill（湖填出了陆地）/ sapling / grown。

export const MG = 96;
export const R = 0.17;
export const MC = (2 * R) / MG;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const YIELD = 0.00035;        // 最烫的岩浆薄到这个厚度就流不动了（黏）
// 岩浆越冷越稠（宾汉流体：有个"屈服"高差，低于它就不动）：刚喷出来稀、流得快；一边流一边凉、越来越稠，
// 前锋停住、后面的堆上去 → 堆成陡的锥 / 塔，不摊成一片（黏稠的安山岩型，不是夏威夷那种稀的）。
const lavaYield = h => YIELD * (1 + 9 * (1 - h) * (1 - h));        // 烫 0.35 mm → 凉 3.5 mm（≈一格高）
const lavaRate = (h, dt) => Math.min(0.24, (0.25 + 2.35 * h * h) * dt);
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
    ember: new Float32Array(n), fire: new Float32Array(n), fuel: new Float32Array(n), burnt: new Uint8Array(n), filled: new Uint8Array(n),
    soil: new Float32Array(n), glass: new Float32Array(n), grass: new Float32Array(n), soak: new Float32Array(n),   // 土、玻璃的厚度；土上的草 0–1；沙子 / 石头泡水泡了多久 0–1
    water: new Float32Array(n), flow: new Float32Array(n), soaked: new Float32Array(n), absorbed: new Float32Array(n),   // absorbed：这格（湖 / 溪）吞掉了多少地表水（dam.js 读完清零：漫回河道的水）   // 地表水厚度、这一步流过多少（画水流用）、渗进土里多少（给 sim 加湿度，外面读完清零）
    saplings: [], events: [], t: 0, seed: 12345, stats: { steam: 0, burnt: 0, filled: 0, toLake: 0, spilled: 0, soaked: 0 },
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
export const top = (m, k) => m.base[k] + m.rock[k] + m.glass[k] + m.soil[k] + m.sand[k] + m.lava[k];
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
  // 水砸下来：落点的沙子 / 土被冲开，溅到外面一圈（冲出个坑）
  if (what === 'water') {
    const kc = index(x, z);
    if (kc >= 0) for (const [fld, f] of [['sand', 0.5], ['soil', 0.12]]) {
      const c = Math.min(m[fld][kc], amount * f); if (c <= 0) continue;
      m[fld][kc] -= c;
      const ring = []; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const d = Math.max(Math.abs(di), Math.abs(dj)); if (d !== 2) continue; const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < MG && j < MG && m.kind[j * MG + i]) ring.push(j * MG + i); }
      for (const rk of ring) m[fld][rk] += c / ring.length;
    }
  }
  for (const [k, wgt] of cells) {
    const a = amount * wgt / tot;
    if (what === 'lava') { m.heat[k] = (m.lava[k] * m.heat[k] + a) / (m.lava[k] + a); m.lava[k] += a; }   // 新倒的（烫）和原有的按体积混合
    else if (what === 'water') m.water[k] += a;
    else if (what === 'sand') m.sand[k] += a;
    else if (what === 'soil') m.soil[k] += a;   // 土：比沙子站得住，用来围堰
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
  const dLava = new Float32Array(n), dSand = new Float32Array(n), dHeat = new Float32Array(n), dIn = new Float32Array(n);
  // 1. 岩浆往低处流、沙子往下滑（先按快照算出变化量，再一起加上）
  for (let k = 0; k < n; k++) {
    const L = m.lava[k], Sd = m.sand[k];
    if (L <= 1e-6 && Sd <= 1e-6) continue;
    const i = k % MG, j = (k / MG) | 0, h = top(m, k);
    if (L > 1e-6) {
      const hk = m.heat[k], rate = lavaRate(hk, dt), Y = lavaYield(hk);
      let out = 0; const flows = [];
      for (const [di, dj] of N4) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= MG || nj >= MG || !m.kind[nj * MG + ni]) { if (L > Y) { flows.push([-1, (L - Y) * rate * 0.5]); } continue; }   // 从岛边流下去
        const nk = nj * MG + ni, diff = h - top(m, nk);
        if (diff > Y) flows.push([nk, (diff - Y) * rate * 0.5]);
      }
      for (const f of flows) out += f[1];
      const lim = Math.min(1, (L * 0.9) / Math.max(out, 1e-12));
      for (const [nk, a] of flows) { const v = a * lim; dLava[k] -= v; if (nk >= 0) { dLava[nk] += v; dIn[nk] += v; dHeat[nk] += v * hk * 0.97; } }   // 带着热流过去，到了按体积和那边的岩浆混合
    }
    if (Sd > 1e-6) {   // 往所有比休止角还低的邻格分
      const flows = []; let out = 0; const [x0, z0] = center(i, j);
      for (const [di, dj] of N4) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= MG || nj >= MG) continue;
        const nk = nj * MG + ni; if (!m.kind[nk]) continue;
        const rep2 = REPOSE * (1 - 0.6 * Math.min(1, rain(x0, z0) * 2));   // 下雨：湿沙塌下来
        const diff = h - top(m, nk); if (diff > rep2) { const v = (diff - rep2) * 0.25; flows.push([nk, v]); out += v; }
        // 风：顺风的那一格分一点（吹沙），风越大越多
        const wmg = Math.hypot(wind[0], wind[1]);
        if (wmg > 0.15) { const along = (di * wind[0] + dj * wind[1]) / wmg; if (along > 0.5 && diff > -MC) { const v = Sd * 0.04 * (wmg - 0.15) * along; flows.push([nk, v]); out += v; } }
      }
      const lim = Math.min(1, Sd / Math.max(out, 1e-12)) * Math.min(1, dt * 8);
      for (const [nk, v] of flows) { dSand[k] -= v * lim; dSand[nk] += v * lim; }
    }
  }
  for (let k = 0; k < n; k++) {
    if (dLava[k]) {
      if (dIn[k] > 0) { const own = Math.max(0, m.lava[k] + dLava[k] - dIn[k]); m.heat[k] = (own * m.heat[k] + dHeat[k]) / (own + dIn[k]); }   // 流进来的热岩浆和这里原有的（可能已经凉了）按体积混合
      m.lava[k] = Math.max(0, m.lava[k] + dLava[k]);
    }
    if (dSand[k]) m.sand[k] = Math.max(0, m.sand[k] + dSand[k]);
  }
  for (let k = 0; k < n; k++) if (m.dry[k] > 0) m.dry[k] = Math.max(0, m.dry[k] - dt * (0.02 + 0.4 * rain(...center(k % MG, (k / MG) | 0))));
  if (!env.frozen) stepWater(m, dt, rain, wet0, wind, env.sun ?? 1);   // 结冰：地表水冻住，不流、不渗、不蒸发
  transmute(m, dt, rain, wet0, env.sun ?? 1, env.lit || (() => 0));
  // 2. 冷却、遇水、点火
  for (let k = 0; k < n; k++) {
    const i = k % MG, j = (k / MG) | 0, [x, z] = center(i, j);
    const L = m.lava[k];
    if (L > 1e-6) {
      const water = m.kind[k] === 2 && !m.filled[k];
      if (water) {   // 岩浆进水：立刻变石头，冒白汽
        m.rock[k] += L; m.lava[k] = 0; m.heat[k] = 0; m.ember[k] = Math.max(m.ember[k], 0.5);
        m.events.push({ type: 'steam', x, z, a: L }); m.stats.steam++;
      } else {
        const r = rain(x, z);
        m.heat[k] = Math.max(0, m.heat[k] - dt * (0.012 + 0.00004 / Math.max(L, 0.0001) + r * 0.3));   // 越薄凉得越快（表面散热 / 厚度）：前锋薄、先凉先停；一大摊能烫上半分钟
        if (r > 0.2 && rnd(m) < dt * 2 * r) { m.events.push({ type: 'steam', x, z, a: 0.0005 }); m.stats.steam++; }
        if (m.heat[k] < 0.35) { const c = Math.min(L, (0.0016 + 0.25 * L) * dt * (1 + r * 4)); m.lava[k] -= c; m.rock[k] += c; m.ember[k] = 1; }   // 刚凝的石头：余热
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
    if (m.kind[k] === 2 && !m.filled[k] && m.rock[k] + m.sand[k] + m.soil[k] + m.glass[k] > FILL) { m.filled[k] = 1; m.stats.filled++; m.events.push({ type: 'fill', x, z }); }
  }
  // 余热：石头里的红慢慢退（约半分钟），淋雨 / 泡水退得快
  for (let k = 0; k < n; k++) if (m.ember[k] > 0) { const r = rain(...center(k % MG, (k / MG) | 0)); m.ember[k] = Math.max(0, m.ember[k] - dt * (0.035 + r * 0.5 + (m.water[k] > 1e-5 ? 0.4 : 0))); }
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
    if (m.fire[k] > 0 && wm > 0.25 && r < 0.2 && rnd(m) < dt * 0.15 * wm) {
      const d = 2 + Math.floor(rnd(m) * 3), ni = Math.round(i + wind[0] / wm * d), nj = Math.round(j + wind[1] / wm * d);
      if (ni >= 0 && nj >= 0 && ni < MG && nj < MG) {
        const nk = nj * MG + ni;
        m.events.push({ type: 'ember', x, z, tx: center(ni, nj)[0], tz: center(ni, nj)[1] });
        if (m.fuel[nk] > 0.2 && m.fire[nk] <= 0 && !m.burnt[nk] && wet(...center(ni, nj)) < 0.4) { m.fire[nk] = 5 + 4 * m.fuel[nk]; m.events.push({ type: 'ignite', x: center(ni, nj)[0], z: center(ni, nj)[1] }); }
      }
    }
    if (m.fire[k] <= 0) { m.fire[k] = 0; m.burnt[k] = 1; m.fuel[k] = 0; m.events.push({ type: 'burn', x, z, r: MC * 1.2 }); m.stats.burnt++; }
  }
  // 4. 小苗：有水有光就长；被岩浆盖住、被火烧到就没了
  for (const s of m.saplings) {
    const k = index(s.x, s.z);
    if (k < 0 || m.lava[k] > 0.0003 || m.fire[k] > 0) { s.dead = true; continue; }
    if (m.rock[k] + m.glass[k] > 0.0002 && m.soil[k] < 0.0002) { s.dead = true; m.events.push({ type: 'seedFail', x: s.x, z: s.z }); continue; }   // 光秃秃的石头上种不活：先铺土（或等石头风化）
    s.t += dt;
    const wv = wet(s.x, s.z);
    if (wv > 0.25) s.g = Math.min(1, s.g + dt * 0.03 * (env.sun ?? 1) * (1 + 10 * (env.lit ? env.lit(s.x, s.z) : 0)));   // 手掌晒着：小苗几秒就长成树
    if (s.g >= 1 && !s.grown) { s.grown = true; m.events.push({ type: 'grown', x: s.x, z: s.z }); }
  }
  m.saplings = m.saplings.filter(s => !s.dead);
  // 烧过的地方慢慢长回草（焦土 → 可燃）
  if (rnd(m) < dt * 0.2) for (let k = 0; k < n; k += 7) if (m.burnt[k] && rnd(m) < 0.02 && m.lava[k] < 1e-6) { m.burnt[k] = 0; m.fuel[k] = m.kind[k] === 3 ? 0.6 : 0.4; }
  return m;
}

// 地表水一步：湖河吞掉 → 下雨地吸不动的部分积起来 → 往低处流（按水面高差）→ 带沙 → 渗、蒸发 → 碰岩浆、碰火
const WSOAK = { 0: 0, 1: 0.0000004, 2: 0, 3: 0.00000026, 4: 0.0000002, 5: 0.00000002 };   // 每秒渗多少（米；超级慢：1 mm 深的水洼在草地上要一个多小时才渗完，水主要是流走 / 积着），按地类：岛外 陆地(沙滩) 水 林子 草 石头
const WMIN = 0.00003;   // 30 µm：这么薄就挂住不流了
function stepWater(m, dt, rain, wet0, wind, sun) {
  const n = MG * MG, W = m.water, dW = new Float32Array(n), dS = new Float32Array(n);
  m.flow.fill(0);
  // 湖、河吞掉流进来的水；岛外清零；下雨时地湿透了（或是石头）吸不动，多出来的在地面上汇成水
  for (let k = 0; k < n; k++) {
    if (m.kind[k] === 2 && !m.filled[k]) { if (W[k] > 0) { m.stats.toLake += W[k]; m.absorbed[k] += W[k]; W[k] = 0; } continue; }
    if (!m.kind[k]) { W[k] = 0; continue; }
    const [x, z] = center(k % MG, (k / MG) | 0), r = rain(x, z);
    if (r > 0.05) { const sat = m.kind[k] === 5 ? 1 : Math.max(0, (wet0(x, z) - 0.6) / 0.4); W[k] += dt * r * 0.00012 * (0.15 + 0.85 * sat); }
  }
  // 往低处流：水很稀，一步里分几小步走（每小步每格最多交出水面高差的一半，显式格式才稳）
  const SUB = 8, rate = 0.24;
  for (let sub = 0; sub < SUB; sub++) {
    dW.fill(0); dS.fill(0);
    for (let k = 0; k < n; k++) {
      const L = W[k]; if (L <= WMIN) continue;   // 薄薄一层挂在地上不流（不然会摊成一张看不见的膜铺满全岛）
      const i = k % MG, j = (k / MG) | 0, h = top(m, k) + L, flows = []; let out = 0;
      for (const [di, dj] of N4) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= MG || nj >= MG || !m.kind[nj * MG + ni]) { flows.push([-1, (L - WMIN) * 0.15]); continue; }   // 从岛边淌下去
        const nk = nj * MG + ni, lake = m.kind[nk] === 2 && !m.filled[nk];
        const diff = h - (top(m, nk) + (lake ? 0 : W[nk]));
        if (diff > 0) flows.push([nk, diff * rate * 0.5]);
      }
      for (const f of flows) out += f[1];
      if (out <= 0) continue;
      const lim = Math.min(1, ((L - WMIN) * 0.95) / out);
      for (const [nk, a] of flows) {
        const v = a * lim; dW[k] -= v;
        if (nk >= 0) {
          dW[nk] += v;
          // 冲沙：流得越急带走的沙越多，到平地就放下
          if (m.sand[k] > 1e-6 && v > 1e-5) { const c = Math.min(m.sand[k] * 0.05, v * 0.15); dS[k] -= c; dS[nk] += c; }
        } else { m.stats.spilled += v; if (v > 2e-5 && rnd(m) < 0.05) m.events.push({ type: 'spill', ...(([x, z]) => ({ x, z }))(center(i, j)), a: v }); }
      }
      m.flow[k] += out * lim;
    }
    for (let k = 0; k < n; k++) {
      if (dW[k]) W[k] = Math.max(0, W[k] + dW[k]);
      if (dS[k]) m.sand[k] = Math.max(0, m.sand[k] + dS[k]);
    }
    // 流进湖河的这一小步就并进去
    for (let k = 0; k < n; k++) if (W[k] > 0 && m.kind[k] === 2 && !m.filled[k]) { m.stats.toLake += W[k]; m.absorbed[k] += W[k]; W[k] = 0; }
  }
  for (let k = 0; k < n; k++) {
    if (W[k] <= 0) continue;
    const i = k % MG, j = (k / MG) | 0, [x, z] = center(i, j);
    // 渗：地越干渗得越快；渗进去的记下来给 sim 加湿度
    const s0 = Math.min(W[k], dt * (WSOAK[m.kind[k]] ?? 0.0002) * (m.sand[k] > 0.0005 ? 1.6 : 1) * Math.max(0.01, (1 - wet0(x, z)) ** 2));   // 湿透的地几乎吸不动
    W[k] -= s0; m.soaked[k] += s0; m.stats.soaked += s0;
    W[k] = Math.max(0, W[k] - dt * 0.0000005 * sun);   // 蒸发（比渗慢得多；挂住的那层薄水大约一分钟晒干）
    if (W[k] < 2e-7) { W[k] = 0; continue; }
    // 漫到岩浆上：冷成石头，冒白汽，水也蒸掉一些
    if (m.lava[k] > 1e-6 && W[k] > 1e-5) {
      const c = Math.min(m.lava[k], W[k] * 2); m.lava[k] -= c; m.rock[k] += c; m.heat[k] *= 0.5; m.ember[k] = Math.max(m.ember[k], 0.5); W[k] = Math.max(0, W[k] - c * 0.5);
      if (rnd(m) < 0.5) { m.events.push({ type: 'steam', x, z, a: 0.0006 }); m.stats.steam++; }
    }
    // 漫到火上：灭
    if (m.fire[k] > 0 && W[k] > 3e-5) { m.fire[k] = 0; m.events.push({ type: 'steam', x, z, a: 0.0003 }); }
    if (W[k] > 3e-5 && m.dry) m.dry[k] = 0;
  }
}
// 东西互相变：泡水、晒太阳、被岩浆烤
const SOIL_REPOSE = MC * 1.1;   // 土比沙子站得住（坡更陡才塌）
function transmute(m, dt, rain, wet0, sun, lit) {
  const n = MG * MG, dSoil = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (!m.kind[k]) continue;
    const sd = m.sand[k], rk = m.rock[k], sl = m.soil[k], L = m.lava[k];
    if (sd < 1e-6 && rk < 1e-6 && sl < 1e-6 && L < 1e-6) continue;
    const i = k % MG, j = (k / MG) | 0, [x, z] = center(i, j), r = rain(x, z);
    const wetNow = m.water[k] > 0.00003 ? 1 : Math.min(1, r * 1.5);
    // 泡着水的时间：泡着就往上涨，干了慢慢退
    m.soak[k] = wetNow > 0.2 ? Math.min(1, m.soak[k] + dt * 0.25 * wetNow) : Math.max(0, m.soak[k] - dt * 0.01);
    // 沙子泡透 → 土
    if (sd > 1e-6 && m.soak[k] > 0.6 && L < 1e-6) { const c = Math.min(sd, dt * 0.00025); m.sand[k] -= c; m.soil[k] += c; }
    // 冷石头常被水泡 → 风化成土（下雨、倒水泡着，几十秒一层看得见）
    if (rk > 1e-6 && m.soak[k] > 0.5 && L < 1e-6 && m.heat[k] < 0.05) { const c = Math.min(rk, dt * 0.00012); m.rock[k] -= c; m.soil[k] += c; }
    // 烫的岩浆：沙子烧成玻璃，土烤成石头、草烧光
    if (L > 0.00008 && m.heat[k] > 0.3) {
      if (sd > 1e-6) { const c = Math.min(sd, dt * 0.002 * m.heat[k]); m.sand[k] -= c; m.glass[k] += c; if (rnd(m) < dt * 2) m.events.push({ type: 'glass', x, z }); }
      if (sl > 1e-6) { const c = Math.min(sl, dt * 0.001 * m.heat[k]); m.soil[k] -= c; m.rock[k] += c; }
      m.grass[k] = 0;
    }
    // 土：湿着又见光就长草；太干草慢慢黄掉；着火烧光
    if (m.soil[k] > 0.0002) {
      const wv = Math.max(wet0(x, z), m.soak[k]);
      if (m.fire[k] > 0) m.grass[k] = 0;
      else if (wv > 0.25 && L < 1e-6) m.grass[k] = Math.min(1, m.grass[k] + dt * 0.03 * sun * (1 + 10 * lit(x, z)));   // 手掌晒着长得飞快
      else if (wv < 0.1) m.grass[k] = Math.max(0, m.grass[k] - dt * 0.004);
      if (m.grass[k] > 0.3 && m.fuel[k] < 0.5 && !m.burnt[k]) m.fuel[k] = 0.5;   // 长了草就能烧
    } else m.grass[k] = 0;
    // 土太陡就往下塌（比沙子站得住），草多了更稳
    if (m.soil[k] > 1e-6) {
      const h = top(m, k), rep = SOIL_REPOSE * (1 + m.grass[k]);
      for (const [di, dj] of N4) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= MG || nj >= MG) continue;
        const nk = nj * MG + ni; if (!m.kind[nk]) continue;
        const diff = h - top(m, nk); if (diff > rep) { const v = Math.min(m.soil[k] * 0.2, (diff - rep) * 0.2) * Math.min(1, dt * 8); dSoil[k] -= v; dSoil[nk] += v; }
      }
      // 急流冲土（草根抓着的冲得少）
      if (m.flow[k] > 0.0003) { const c = Math.min(m.soil[k] * 0.02, (m.flow[k] - 0.0003) * 0.05 * (1 - 0.7 * m.grass[k])); if (c > 0) { let best = -1, bh = h; for (const [di, dj] of N4) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= MG || nj >= MG) continue; const nk = nj * MG + ni; if (m.kind[nk] && top(m, nk) < bh) { bh = top(m, nk); best = nk; } } if (best >= 0) { dSoil[k] -= c; dSoil[best] += c; } } }
    }
  }
  for (let k = 0; k < n; k++) if (dSoil[k]) m.soil[k] = Math.max(0, m.soil[k] + dSoil[k]);
}
export const waterAt = (m, x, z) => { const k = index(x, z); return k < 0 ? 0 : m.water[k]; };

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
export function totals(m) { let lava = 0, rock = 0, sand = 0, water = 0, soil = 0, glass = 0; for (let k = 0; k < MG * MG; k++) { lava += m.lava[k]; rock += m.rock[k]; sand += m.sand[k]; water += m.water[k]; soil += m.soil[k]; glass += m.glass[k]; } return { lava, rock, sand, water, soil, glass }; }
