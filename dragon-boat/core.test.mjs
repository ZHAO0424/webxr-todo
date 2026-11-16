// 龙舟鼓手 · 逻辑单测：node --test dragon-boat/core.test.mjs
// 检测器用合成的手掌轨迹喂（走真实 feed 路径）；玩法用 Race 整局模拟。
import test from 'node:test';
import assert from 'node:assert/strict';
import { StrikeDetector, Race, RACE_LEN, mulberry32 } from './core.js';

// ---------- 合成手掌轨迹 ----------
// 每一敲：0.18 s 加速下落 drop 米（y = top − drop·s²），在"击中"时刻急停，底部停 0.04 s，再 0.25 s 平滑抬回
function strokeY(t, hits, top = 0, drop = 0.1) {
  let y = top;
  for (const h of hits) {
    const d = t - h;
    if (d < -0.18 || d > 0.29 + 0.01) continue;
    if (d <= 0) { const s = (d + 0.18) / 0.18; y = top - drop * s * s; }
    else if (d <= 0.04) y = top - drop;
    else { const s = Math.min(1, (d - 0.04) / 0.25); y = top - drop * (1 - s * s * (3 - 2 * s)); }
  }
  return y;
}
function run(det, { fps = 60, dur, pos, noise = 0.002, seed = 1, drop = () => false, head }) {
  const R = mulberry32(seed), out = [];
  const n = () => (R() * 2 - 1) * noise * 1.7;
  for (let i = 0; i * (1 / fps) <= dur; i++) {
    const t = i / fps;
    const p = drop(t) ? null : (() => { const q = pos(t); return { x: q.x + n(), y: q.y + n(), z: q.z + n() }; })();
    const h = det.feed(t, p, head);
    if (h) out.push(h);
  }
  return out;
}
const beats = (bpm, n, t0 = 0.5) => Array.from({ length: n }, (_, i) => t0 + i * 60 / bpm);
const HEAD = { x: 0, y: 0.3, z: 0.4 };

for (const fps of [60, 30]) {
  test(`检测器：稳定 80 BPM × 40 下，${fps} Hz 采样全部检出，延迟 < 50 ms`, () => {
    const hits = beats(80, 40), det = new StrikeDetector();
    const got = run(det, { fps, dur: hits.at(-1) + 0.6, pos: t => ({ x: 0.05, y: strokeY(t, hits), z: 0 }), head: HEAD });
    assert.equal(got.length, 40);
    const lat = got.map((g, i) => g.t - hits[i]);
    assert.ok(Math.max(...lat.map(Math.abs)) < 0.05, `latency ${lat.map(v => (v * 1000).toFixed(0)).join(',')}`);
  });
}
test('检测器：120 BPM 快敲也全部检出', () => {
  const hits = beats(120, 30), det = new StrikeDetector();
  const got = run(det, { dur: hits.at(-1) + 0.6, pos: t => ({ x: 0, y: strokeY(t, hits, 0, 0.07), z: 0 }), head: HEAD });
  assert.equal(got.length, 30);
});

const negatives = {
  // 挥手带 3 cm 上下起伏（峰峰值）；起伏到 6 cm 时转向点上的下落和真敲分不开（2026-11-13 降阈值后）
  '左右挥手': t => ({ x: 0.15 * Math.sin(t * 2 * Math.PI * 1.2), y: 0.015 * Math.sin(t * 4 * Math.PI), z: 0 }),
  '慢慢放下又抬起': t => ({ x: 0, y: -0.15 * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI / 3)), z: 0 }),
  '手停着抖': t => ({ x: 0.003 * Math.sin(t * 50), y: 0.004 * Math.sin(t * 37), z: 0 }),
  '抬手扶眼镜（高于头）': t => { const s = Math.min(1, (t % 3) / 0.6); return { x: 0, y: -0.1 + 0.45 * (s < 0.5 ? s * 2 : 2 - s * 2), z: 0.35 }; },
};
for (const [name, pos] of Object.entries(negatives)) {
  test(`检测器：${name} 10 s 不误触发`, () => {
    const got = run(new StrikeDetector(), { dur: 10, pos, noise: 0.003, head: HEAD });
    assert.equal(got.length, 0, `误触发 ${got.length} 次`);
  });
}
test('检测器：追踪丢失后位置跳 10 cm 不误触发', () => {
  const got = run(new StrikeDetector(), { dur: 10, pos: t => ({ x: 0, y: (Math.floor(t / 1.5) % 2) * -0.1, z: 0 }), drop: t => (t % 1.5) < 0.1, head: HEAD });
  assert.equal(got.length, 0);
});
test('检测器：下敲最后 3 帧丢手仍算一敲（时间偏差 < 60 ms）', () => {
  const hits = beats(70, 10), det = new StrikeDetector();
  const got = run(det, { dur: hits.at(-1) + 0.6, pos: t => ({ x: 0, y: strokeY(t, hits), z: 0 }), drop: t => hits.some(h => t > h - 0.05 && t <= h + 0.05), head: HEAD });
  assert.equal(got.length, 10);
  got.forEach((g, i) => assert.ok(Math.abs(g.t - hits[i]) < 0.06, `${g.t - hits[i]}`));
});

// ---------- 整局模拟 ----------
// player(t, race) 返回这一帧要不要敲；默认按赛段节奏 + 抖动 sigma 排程
function sim(seed, plan) {
  const race = new Race(seed), dt = 1 / 60;
  race.start(0);
  let t = 0, next = race.t0 + 0.05, speeds = [];
  while (race.state !== 'result' && t < 200) {
    t += dt;
    race.step(t, dt);
    race.events.length = 0;
    if ((race.state === 'race' || race.state === 'finish') && t >= next) {
      const r = plan(t, race);
      if (r) { if (!r.skip) race.hit(next, r.hand ?? race.you.hits % 2); next += r.dt; } else next += 0.1;
    }
    speeds.push({ t, v: race.you.v, waiting: race.you.tempo.waiting(t) });
  }
  return { race, stats: race.stats(), speeds };
}
const R = mulberry32(99);
const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const steady = (bpm, sigma) => (t, race) => ({ dt: 60 / bpm(race.you.pos) * (1 + sigma * gauss()) });
const bandBpm = pos => pos < 25 ? 100 : pos > RACE_LEN - 50 ? 105 : 82;
const SEEDS = [1, 2, 3, 4, 5, 6];

test('玩法：按节奏带稳定敲（抖动 5%）大多拿第一，整齐度 > 0.85', () => {
  const res = SEEDS.map(s => sim(s, steady(bandBpm, 0.05)).stats);
  const wins = res.filter(r => r.rank === 1).length;
  console.log('steady5%', res.map(r => `#${r.rank} ${r.time?.toFixed(1)}s sync ${r.sync.toFixed(2)}`).join(' | '));
  assert.ok(wins >= 5, `wins ${wins}/6`);
  res.forEach(r => assert.ok(r.sync > 0.85, `sync ${r.sync}`));
});
test('玩法：乱敲（间隔 ±35%）落到后两名，整齐度 < 0.75', () => {   // 11-16 体力惩罚变软（下限 0.65），整齐度略回升
  const res = SEEDS.map(s => sim(s, steady(() => 80, 0.35)).stats);
  console.log('random35%', res.map(r => `#${r.rank} ${r.time?.toFixed(1)}s sync ${r.sync.toFixed(2)}`).join(' | '));
  res.forEach(r => { assert.ok(r.rank >= 3, `rank ${r.rank}`); assert.ok(r.sync < 0.75, `sync ${r.sync}`); });
});
test('玩法：狂敲 160 BPM 比按节奏带稳定敲慢', () => {
  const a = sim(3, steady(() => 160, 0.05)).stats, b = sim(3, steady(bandBpm, 0.05)).stats;
  console.log('spam160', a.time?.toFixed(1), 'band', b.time?.toFixed(1));
  assert.ok((a.time ?? 999) > b.time + 3);
});
test('玩法：敲太快（130 / 200 BPM）不会把船敲停——桨手按最高划频一起划、整齐度不散，但比跟节奏慢', () => {
  const band = sim(3, steady(bandBpm, 0.05)).stats;
  for (const b of [130, 200]) {
    const a = sim(3, steady(() => b, 0.05)).stats;
    console.log('mash', b, a.time?.toFixed(1), 'sync', a.sync.toFixed(2));
    assert.ok(a.time < 85, `${b} BPM ${a.time}`);          // 用户实测：之前 200 BPM 154 s 还没到终点
    assert.ok(a.sync > 0.8, `${b} BPM sync ${a.sync}`);
    assert.ok(a.time > band.time + 5);
  }
});
test('玩法：不敲 → 最后一名，船不动', () => {
  const { race } = sim(2, () => ({ dt: 0.5, skip: true }));
  assert.equal(race.rankOf(race.you), 4);
  assert.ok(race.you.pos < 1);
});
test('玩法：中途停敲 3 s → 桨手停桨等鼓、船速单调下降；再敲能恢复', () => {
  let stopAt = null;
  const { speeds } = sim(4, (t, race) => {
    if (race.you.pos > 80 && stopAt === null) stopAt = t;
    if (stopAt !== null && t - stopAt < 3) return { dt: 3, skip: true };
    return { dt: 60 / 82 };
  });
  const seg = speeds.filter(s => s.t > stopAt + 1.4 && s.t < stopAt + 3);
  assert.ok(seg.every(s => s.waiting));
  for (let i = 1; i < seg.length; i++) assert.ok(seg[i].v <= seg[i - 1].v + 1e-9);
  const after = speeds.filter(s => s.t > stopAt + 8 && s.t < stopAt + 9);
  assert.ok(after[0].v > seg.at(-1).v + 0.5, `恢复 ${after[0].v} vs ${seg.at(-1).v}`);
});
// ---------- 难度曲线（2026-11-16 放宽后的目标，20 局统计） ----------
// 真人自己敲的节奏抖动 + 传感器时间误差大约 8–12%，手势偶尔漏检；这些不该让人输
function human(seed, sg, miss = 0) {
  const P = mulberry32(seed * 31 + 5), g = () => { let u = 0, v = 0; while (!u) u = P(); while (!v) v = P(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let h = 1;
  return sim(seed, (t, race) => { h = 1 - h; return P() < miss ? { dt: 60 / bandBpm(race.you.pos) * (1 + sg * g()), skip: true } : { dt: 60 / bandBpm(race.you.pos) * (1 + sg * g()), hand: h }; }).stats;
}
const SEEDS20 = Array.from({ length: 20 }, (_, i) => i + 1);
const ranks = (sg, miss) => SEEDS20.map(s => human(s, sg, miss).rank);
test('难度：节奏抖动 10% + 漏检 3% → 20 局里至少赢 15 局', () => {
  const r = ranks(0.10, 0.03); console.log('jitter10+miss3', r.join(''));
  assert.ok(r.filter(k => k === 1).length >= 15, r.join(''));
});
test('难度：漏检 10%（节奏本身稳）→ 至少赢 16 局；漏一拍不会打乱桨手', () => {
  const r = ranks(0.05, 0.10); console.log('miss10', r.join(''));
  assert.ok(r.filter(k => k === 1).length >= 16, r.join(''));
});
test('难度：节奏抖动 15% → 有输有赢，平均名次在 2–3 之间', () => {
  const r = ranks(0.15, 0); const avg = r.reduce((a, b) => a + b, 0) / r.length; console.log('jitter15', r.join(''), avg);
  assert.ok(avg >= 1.8 && avg <= 3.2, `${avg}`);
  assert.ok(r.filter(k => k === 1).length <= 10);
});
test('难度：节奏抖动 20% → 赢不了，平均名次 ≥ 3.5', () => {
  const r = ranks(0.20, 0); console.log('jitter20', r.join(''));
  assert.ok(r.every(k => k >= 2) && r.reduce((a, b) => a + b, 0) / r.length >= 3.5, r.join(''));
});
test('节奏判定：间隔≈两拍算漏了一拍（skip），不判"乱"', async () => {
  const { Tempo } = await import('./core.js');
  const tp = new Tempo(); [0, 0.7, 1.4, 2.1].forEach(t => tp.add(t));
  const j = tp.add(3.5);
  assert.equal(j.skip, true); assert.equal(j.judge, 'steady');
  assert.ok(Math.abs(tp.interval() - 0.7) < 1e-9);
});

test('谱面花点：拍间的八分音符不改节奏、不打乱桨手，只算交替并给一点推力', async () => {
  const { Race } = await import('./core.js');
  const r = new Race(5); r.start(0); for (let t = 0; t < 4; t += 1 / 60) r.step(t, 1 / 60);
  [4, 4.73, 5.46, 6.19].forEach((t, i) => r.hit(t, i % 2));
  const iv = r.you.tempo.interval(), sync = r.you.crew.sync, v = r.you.v;
  const f = r.flourish(6.55, 0);
  assert.equal(f.alt, true);
  assert.equal(r.you.tempo.interval(), iv);
  assert.equal(r.you.crew.sync, sync);
  assert.ok(r.you.v > v);
});

test('玩法：一局时长 60–90 s', () => {
  const { stats } = sim(1, steady(bandBpm, 0.05));
  assert.ok(stats.time > 60 && stats.time < 90, `${stats.time}`);
});

// ---------- 真机回放：dragon-boat/tasks/strike-probe-*.json（probe.html 录的） ----------
// tasks/warmup-probe-*.json 是第一次试录（基本没在敲，动作意图不明），留作参考，不进断言
// 真值不用节拍器拍点（人会晚起手、会跟丢拍），而是离线找两手手掌的"一敲"：局部最低点、之前 0.4 s 内落差 ≥ 3 cm、
// 下落时竖直速度（50 ms 窗）超过 0.3 m/s、落差大于水平位移（斜着挪手不算敲）；两手 150 ms 内算同一下。检测器的结果也按 120 ms 合并两手（游戏里是重鼓）。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const TASKS = new URL('./tasks/', import.meta.url);
const recs = existsSync(TASKS) ? readdirSync(TASKS).filter(f => /^strike-probe-.*\.json$/.test(f)) : [];
const palmOf = (fr, i) => { const j = fr.h[i]; return j && j[0] && j[1] ? { x: (j[0][0] + j[1][0]) / 2, y: (j[0][1] + j[1][1]) / 2, z: (j[0][2] + j[1][2]) / 2 } : null; };
const mergeT = (ts, w) => ts.sort((a, b) => a - b).reduce((o, t) => (o.length && t - o.at(-1) <= w ? o : o.push(t) && o), []);
export function offlineStrikes(F) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const s = F.map(fr => { const p = palmOf(fr, i); return { t: fr.t, y: p?.y, x: p?.x, z: p?.z }; });
    for (let k = 5; k < s.length - 5; k++) {
      if (s[k].y === undefined || !s.slice(k - 5, k + 6).every(q => q.y !== undefined && q.y >= s[k].y)) continue;
      let top = -9, ti = k, vmin = 0;
      for (let m = k - 1; m >= 0 && s[k].t - s[m].t < 0.4; m--) { if (s[m].y === undefined) break; if (s[m].y > top) { top = s[m].y; ti = m; } let n = m; while (n > 0 && s[m].t - s[n].t < 0.05) n--; if (s[n].y !== undefined) vmin = Math.min(vmin, (s[m].y - s[n].y) / Math.max(1e-3, s[m].t - s[n].t)); }
      if (top - s[k].y >= 0.03 && vmin < -0.3 && top - s[k].y >= Math.hypot(s[k].x - s[ti].x, s[k].z - s[ti].z)) out.push(s[k].t);
    }
  }
  return mergeT(out, 0.15);
}
for (const f of recs) {
  test(`真机回放 ${f}：检出率 ≥ 95%，多余敲击 ≤ 2 次/分钟`, () => {
    const rec = JSON.parse(readFileSync(new URL(f, TASKS), 'utf8')), F = rec.frames, det = [new StrikeDetector(), new StrikeDetector()], got = [];
    for (const fr of F) for (let i = 0; i < 2; i++) { const h = det[i].feed(fr.t, palmOf(fr, i), fr.head && { x: fr.head[0], y: fr.head[1], z: fr.head[2] }); if (h) got.push(h.t); }
    // 只算节拍器响起之后（之前是捏合开始、把手放到位）
    const G = mergeT(got, 0.12).filter(t => t > rec.clicks[0] - 0.5), T = offlineStrikes(F).filter(t => t > rec.clicks[0] - 0.5), used = new Set(); let hit = 0;
    // 慢而长的一敲：急刹可能早于最低点 0.3 s
    for (const t of T) { const k = G.findIndex((g, i) => !used.has(i) && g - t > -0.35 && g - t < 0.15); if (k >= 0) { used.add(k); hit++; } }
    const extra = G.length - used.size, mins = (F.at(-1).t - F[0].t) / 60;
    console.log(f, `真值 ${T.length} 检出 ${hit} 多余 ${extra}`);
    if (T.length) assert.ok(hit / T.length >= 0.95, `检出率 ${(hit / T.length * 100).toFixed(1)}%`);
    assert.ok(extra / mins <= 2, `多余 ${extra}`);
  });
}

test('玩法：左右交替最快——同样节奏只用一只手，慢 8 s 以上；双手每下都一起落也不如交替', () => {
  const alt = sim(3, steady(bandBpm, 0.05)).stats;
  const one = sim(3, (t, race) => ({ ...steady(bandBpm, 0.05)(t, race), hand: 1 })).stats;
  const both = sim(3, (t, race) => ({ ...steady(bandBpm, 0.05)(t, race), hand: 2 })).stats;
  console.log('alternate', alt.time?.toFixed(1), 'one hand', one.time?.toFixed(1), 'both', both.time?.toFixed(1));
  assert.ok(one.time > alt.time + 8, `${one.time} vs ${alt.time}`);
  assert.ok(both.time > alt.time + 8);
  assert.ok(alt.alt > 0.9);
});
