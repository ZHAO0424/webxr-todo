// 龙舟鼓手 · 纯逻辑：敲击检测、桨手、船、对手鼓手、赛程。
// 不碰 three.js / DOM / 声音：index.html 负责画面和输入，node 单测（core.test.mjs）直接驱动这里。
// 时间一律用秒（玩家输入和渲染都用 performance.now() / 1000）。

export const RACE_LEN = 200;          // 赛程（米，按比例压缩的"游戏米"）
export const ROWERS = 10;             // 每船桨手
export const PULL = 0.35;
export const TOOFAST = 1.1;   // 鼓速超过全船最高划频的这个倍数 = 太快             // 一个划桨周期里桨在水中的比例（相位 0 = 入水）

// 赛段：起航 / 巡航 / 冲刺。band = 最佳节奏带（BPM），boost = 桨手最高划频的倍率
export const SEGS = {
  start: { band: [90, 110], boost: 1.15 },
  cruise: { band: [70, 86], boost: 1.0 },
  sprint: { band: [95, 115], boost: 1.2 },
};
export const segAt = pos => pos < 25 ? 'start' : pos > RACE_LEN - 50 ? 'sprint' : 'cruise';

export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const gauss = R => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const wrapHalf = x => x - Math.round(x);   // 相位差折到 [-0.5, 0.5)
const frac = x => x - Math.floor(x);

// ---------- 敲击检测：手掌中心的竖直速度"下行 → 急刹" ----------
// feed(t, p, head) 每帧喂一次；p = {x,y,z}（世界坐标，米），手丢了传 null；head 可选，用来排除扶眼镜 / 抬手。
// 返回 null 或 { t, strength }（strength = 峰值下行速度 m/s）。
export const STRIKE = {
  // 2026-11-13 按真机探针（tasks/strike-probe-*.json）调过：真人敲击幅度 4–13 cm、峰值 0.4–1.1 m/s
  vDown: 0.25,      // 竖直速度低于 −0.25 m/s 进入"下行"
  vPeak: 0.35,      // 峰值至少 −0.35 m/s 才算一敲
  brake: 0.35,      // 速度回升到峰值的 35%（或高于 −0.15）= 急刹
  brakeAbs: 0.15,
  minDrop: 0.025,   // 下行至少 2.5 cm
  rearm: 0.025,     // 敲完抬起 2.5 cm 才能再敲
  cool: 0.14,       // 冷却 140 ms
  settle: 0.2,      // 手重新出现后 200 ms 内不判
  lostV: 0.5,       // 下行速度超过 0.5 m/s 时手丢了 → 按敲击算
  maxV: 6,          // 超过 6 m/s 视为追踪跳变
  sweep: 1.5,       // 进入下行时竖直速度要大于水平速度的 1.5 倍
  sweepHit: 1.0,    // 整段下行里竖直落差要大于水平位移（挥手带一点上下晃不算）
};
export class StrikeDetector {
  constructor(cfg = {}) { this.c = { ...STRIKE, ...cfg }; this.reset(); }
  reset() { this.h = []; this.since = null; this.st = 'idle'; this.lastHit = -9; this.yLow = 0; this.yTop = 0; this.vpeak = 0; this.vy = 0; this.lastSeen = -9; }
  feed(t, p, head) {
    const c = this.c;
    if (!p) {
      let hit = null;
      if (this.st === 'down' && this.vpeak < -c.lostV && t - this.lastSeen < 0.12) hit = this._hit(t, this.h.length ? this.h[this.h.length - 1].y : 0);
      this.h.length = 0; this.since = null; if (this.st !== 'cool') this.st = 'idle';
      return hit;
    }
    const h = this.h, last = h[h.length - 1];
    if (last) {
      const dt = Math.max(1e-3, t - last.t), d = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
      if (d / dt > c.maxV && d > 0.02) { h.length = 0; this.since = null; this.st = 'idle'; }
    }
    if (this.since === null) this.since = t;
    h.push({ t, x: p.x, y: p.y, z: p.z }); if (h.length > 8) h.shift();
    this.lastSeen = t;
    if (h.length < 3) return null;
    // 速度按时间窗算，和采样率无关：进入下行用约 50 ms 窗（抗抖），判急刹用约 30 ms 窗（快）。
    // 真机（VITURE PC，2026-11-13 探针）手部约 65 Hz，逐帧差分噪声大，中途误判"急刹"会把一敲丢掉
    const b = h[h.length - 1], back = w => { for (let k = h.length - 2; k >= 0; k--) if (b.t - h[k].t >= w) return h[k]; return h[0]; };
    const a = back(0.05), m = back(0.03), dt = Math.max(1e-3, b.t - a.t);
    const vy3 = (b.y - a.y) / dt, vh = Math.hypot(b.x - a.x, b.z - a.z) / dt;
    const vy = (b.y - m.y) / Math.max(1e-3, b.t - m.t);
    this.vy = vy;
    if (t - this.since < c.settle) { this.yTop = p.y; return null; }
    if (head && (p.y > head.y + 0.02 || Math.hypot(p.x - head.x, p.z - head.z) < 0.15)) { if (this.st === 'down') this.st = 'idle'; return null; }
    switch (this.st) {
      case 'cool':
        this.yLow = Math.min(this.yLow, p.y);
        if (t - this.lastHit > c.cool && p.y > this.yLow + c.rearm) { this.st = 'idle'; this.yTop = p.y; }
        return null;
      case 'idle':
        // 下行从哪开始量：进入下行时取最近 3 帧里最高的那点
        if (vy3 < -c.vDown && -vy3 > c.sweep * vh) { this.st = 'down'; this.vpeak = Math.min(vy, vy3); this.yTop = Math.max(...h.filter(q => b.t - q.t <= 0.12).map(q => q.y)); this.x0 = a.x; this.z0 = a.z; }
        return null;
      case 'down':
        this.vpeak = Math.min(this.vpeak, vy);
        if (vy > this.vpeak * c.brake || vy > -c.brakeAbs) {
          // 急停发生在上一帧和这一帧之间：时间取两帧中点
          if (this.vpeak < -c.vPeak && this.yTop - p.y >= c.minDrop && this.yTop - p.y >= c.sweepHit * Math.hypot(p.x - this.x0, p.z - this.z0)) return this._hit((h[h.length - 2].t + t) / 2, p.y);
          this.st = 'idle'; this.yTop = p.y;
        }
        return null;
    }
    return null;
  }
  _hit(t, y) { this.st = 'cool'; this.lastHit = t; this.yLow = y; const s = -this.vpeak; this.vpeak = 0; return { t, strength: s }; }
}
// 双手合并：120 ms 内两只手各敲一下 = 一记重鼓
export function mergeHits(prev, hit, win = 0.12) { return prev && hit.t - prev.t < win && prev.hand !== hit.hand; }

// ---------- 节奏：最近 4 个间隔的中位数 ----------
export class Tempo {
  constructor() { this.iv = []; this.last = null; this.n = 0; }
  reset() { this.iv.length = 0; this.last = null; this.n = 0; }
  // 返回 { e, judge, skip }：skip = 这一下前面漏了一拍；e = 相对预测拍的偏差（间隔的比例），judge = 'set'（建立节奏）| 'steady' | 'ok' | 'off'
  add(t) {
    let e = 0, judge = 'set', skip = false;
    if (this.last !== null) {
      const d = t - this.last;
      if (d > 1.6) this.iv.length = 0;      // 停过：重新建立节奏
      else {
        let push = d;
        if (this.iv.length >= 2) {
          const p = this.interval(); e = (d - p) / p;
          // 漏了一拍（多半是手势没被识别到）：间隔≈两拍时按"跳过一拍"算，误差对两拍量，不打乱桨手、不进节奏统计
          const e2 = (d - 2 * p) / (2 * p);
          if (Math.abs(e) > 0.35 && Math.abs(e2) <= 0.2) { e = e2; skip = true; push = null; }
          const a = Math.abs(e); judge = a <= 0.12 ? 'steady' : a <= 0.25 ? 'ok' : 'off';
        }
        if (push !== null) { this.iv.push(Math.min(1.5, Math.max(0.3, push))); if (this.iv.length > 4) this.iv.shift(); }
      }
    }
    this.last = t; this.n++;
    return { e, judge, skip };
  }
  interval() { if (!this.iv.length) return 0.667; const s = this.iv.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  bpm() { return 60 / this.interval(); }
  waiting(t) { return this.last === null || t - this.last > 1.6 * this.interval(); }
}

// ---------- 桨手：一群耦合振子 ----------
// 每人：相位 θ（0 = 入水）、自己估的划频 w、最高划频 wmax、响应鼓点的力度 k、跟节奏的学习率 al。
// 每敲一下：大家把相位拉向"此刻入水"，并按自己的学习率更新划频；偏离预测越远，乱得越厉害。
export class Crew {
  constructor(R, n = ROWERS) {
    this.r = Array.from({ length: n }, () => ({
      th: 0.85, w: 1.4, wmax: (96 + R() * 12) / 60, k: 0.3 + R() * 0.4, al: 0.25 + R() * 0.45, eps: (R() * 2 - 1) * 0.04, hold: true, wEff: 0,
    }));
    this.R = R; this.sync = 0; this.wmax = this.r.reduce((a, r) => a + r.wmax, 0) / n;
  }
  hit(interval, e, heavy) {
    const R = this.R;
    // 太快：只有全船平均相位处在回桨末段（≥0.7，快要入水）时，这一下才算"接上了"——统一拽到入水、不加噪声；
    // 其余鼓点桨手接不住，只记节奏。效果：全船按共同的最高划频一起划，不会散，但也快不过封顶
    const fast = 1 / interval > this.wmax * TOOFAST;
    let catchUp = false;
    if (fast) { let sx = 0, sy = 0; for (const r of this.r) { sx += Math.cos(r.th * 2 * Math.PI); sy += Math.sin(r.th * 2 * Math.PI); } const m = frac(Math.atan2(sy, sx) / (2 * Math.PI) + 1); catchUp = m >= 0.7; }
    for (const r of this.r) {
      if (fast && !r.hold) { r.w += r.al * (1 / interval - r.w); if (catchUp) r.th = frac(r.th + wrapHalf(-r.th) * 0.6); continue; }
      if (r.hold) { r.hold = false; r.th = frac(r.th + wrapHalf(1 - r.th) * 0.9); r.w = 1 / interval; continue; }
      r.th = frac(r.th + wrapHalf(-r.th) * Math.min(1, r.k * (heavy ? 1.5 : 1)) + gauss(R) * 0.6 * Math.min(0.5, Math.max(0, Math.abs(e) - 0.06)));   // 6% 以内的误差不打乱桨手（人手本身的抖动）
      r.w += r.al * (1 / interval - r.w);
    }
  }
  // waiting：鼓停了 → 把这一桨划完、举桨停在 0.85 等鼓
  step(dt, boost, waiting) {
    let sx = 0, sy = 0, act = 0, f = 0;
    for (const r of this.r) {
      if (waiting && !r.hold && r.th >= 0.85 - 1e-3 - 0.05 && r.th < 0.9) { r.hold = true; r.th = 0.85; }
      if (r.hold) { r.wEff = 0; continue; }
      r.wEff = Math.min(r.w, this.wmax * boost) * (1 + r.eps);   // 封顶用全船共同的最高划频：鼓太快时大家一起封在同一个桨频上，不会各划各的散掉
      r.th = frac(r.th + dt * r.wEff);
      act++; sx += Math.cos(r.th * 2 * Math.PI); sy += Math.sin(r.th * 2 * Math.PI);
      if (r.th < PULL) f += Math.sin(Math.PI * r.th / PULL) * r.wEff;
    }
    const s = act ? Math.hypot(sx, sy) / act : 0;
    this.sync += (s - this.sync) * Math.min(1, dt * 4);
    return { force: f, R: s, active: act };
  }
}

// ---------- 船 ----------
const K = 3.0, M = 3.0, C = 1.0, C0 = 0.05;
export class Boat {
  constructor(R, lane, name) { this.lane = lane; this.name = name; this.crew = new Crew(R); this.tempo = new Tempo(); this.reset(); }
  reset() { this.pos = 0; this.v = 0; this.stamina = 1; this.finishT = null; this.lastHit = -9; this.hits = 0; this.steady = 0; this.judged = 0; this.syncSum = 0; this.syncN = 0; this.streak = 0; this.bestStreak = 0; this.force = 0; this.Rnow = 0; this.alt = 0.5; this.lastHand = -1; this.altHits = 0; }
  // 鼓手敲一下。hand：0 左、1 右、2 双手同落（重鼓）、-1 分不出（算和上一下同一只手）
  // 左右交替：交替度 alt 平滑跟踪"这一下是不是换了手"，推力 × (0.55 + 0.45·alt)；一直用同一只手 ≈ 只出一半多的力
  drum(t, hand = -1, heavy = false) {
    if (this.finishT !== null) return { judge: 'set', e: 0, alt: false };
    const j = this.tempo.add(t);
    j.alt = hand >= 0 && (j.skip ? true : hand !== this.lastHand);   // 漏了一拍时同一只手连着出现是正常的，不算没换手
    this.alt += 0.4 * ((j.alt ? 1 : 0) - this.alt); if (j.alt) this.altHits++;
    if (hand >= 0) this.lastHand = hand;
    this.crew.hit(this.tempo.interval(), j.judge === 'set' ? 0 : j.e, heavy);
    this.lastHit = t; this.hits++;
    if (j.judge !== 'set') { this.judged++; if (j.judge === 'steady') { this.steady++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); } else if (j.judge === 'off') this.streak = 0; }
    return j;
  }
  step(dt, t) {
    const seg = SEGS[segAt(this.pos)], done = this.finishT !== null;
    const waiting = done || this.tempo.waiting(t);
    const c = this.crew.step(dt, seg.boost, waiting);
    const bpm = this.tempo.bpm();
    if (!waiting && bpm > seg.band[1]) this.stamina = Math.max(0, this.stamina - (bpm - seg.band[1]) * 0.004 * dt);
    else this.stamina = Math.min(1, this.stamina + 0.03 * dt);
    const power = (0.65 + 0.35 * this.stamina) * (0.55 + 0.45 * this.alt);
    this.Rnow = c.R; this.force = done ? 0 : K * c.force * (0.3 + 0.7 * c.R * c.R) * power;
    this.v += (this.force - C * this.v * this.v - C0 * this.v - (done ? 0.8 * this.v : 0)) / M * dt;
    this.v = Math.max(0, this.v);
    const p0 = this.pos; this.pos += this.v * dt;
    if (!done && c.active) { this.syncSum += c.R; this.syncN++; }
    return p0;
  }
}

// ---------- 对手鼓手（脚本） ----------
// 每段一个节奏 + 间隔抖动 sigma；轻度橡皮筋：和玩家差超过 8 m 时微调抖动和节奏
export const AI_PROFILES = [
  // 2026-11-16 放宽：对手比完美玩家慢约 3–4 s；抖动 10% + 漏检 3% 的人大多能赢，抖动 15% 落在 2–3 名
  { name: 'steady', start: 94, cruise: 76, sprint: 100, sigma: 0.10 },
  { name: 'burst', start: 102, cruise: 78, sprint: 98, sigma: 0.12 },
  { name: 'closer', start: 90, cruise: 72, sprint: 104, sigma: 0.11 },
];
export class AIDrummer {
  constructor(R, prof) { this.R = R; this.p = prof; this.next = null; this.adj = 0; }
  update(t, boat, lead) {
    if (boat.finishT !== null) return null;
    const seg = segAt(boat.pos), p = this.p;
    if (lead !== undefined) { const target = lead > 8 ? 1 : lead < -8 ? -1 : 0; this.adj += (target - this.adj) * 0.002; }
    const bpm = p[seg] + this.adj * 3, sigma = p.sigma * (1 - this.adj * 0.25);
    if (this.next === null) this.next = t + 0.15 + this.R() * 0.25;
    if (t < this.next) return null;
    const at = this.next;
    this.next = at + 60 / bpm * (1 + sigma * gauss(this.R));
    return at;
  }
}

// ---------- 赛程 ----------
// state: 'title' → 'ready'（倒数）→ 'race' → 'finish'（你过线后再跑一会）→ 'result'
export const READY_T = 3.6, AFTER_T = 7;
export class Race {
  constructor(seed = 20261113) {
    this.seed = seed; const R = mulberry32(seed);
    this.boats = [new Boat(R, 0, 'you'), ...AI_PROFILES.map((p, i) => new Boat(R, i + 1, p.name))];
    this.ai = AI_PROFILES.map((p, i) => new AIDrummer(mulberry32(seed + 17 * (i + 1)), p));
    this.state = 'title'; this.t = 0; this.t0 = 0; this.stateT = 0; this.events = [];
  }
  get you() { return this.boats[0]; }
  start(t) {
    const R = mulberry32(this.seed + 7);
    this.boats.forEach(b => { b.crew = new Crew(R); b.tempo.reset(); b.reset(); });
    this.ai = AI_PROFILES.map((p, i) => new AIDrummer(mulberry32(this.seed + 17 * (i + 1) + Math.floor(t * 1000)), p));
    this.state = 'ready'; this.stateT = t; this.t0 = t + READY_T; this.events.length = 0;
    this.countdown = 0;
  }
  // 玩家敲鼓；返回判定（标题 / 结算时返回 null）
  hit(t, hand = -1, heavy = false) {
    if (this.state !== 'race' && this.state !== 'finish') return null;
    return this.you.drum(t, hand, heavy);
  }
  // 推进到时间 t；产生的事件（AI 敲鼓、过线、倒数）放进 this.events 由外面取走
  step(t, dt) {
    this.t = t;
    if (this.state === 'ready') {
      const k = Math.floor((t - this.stateT) / (READY_T / 3));
      while (this.countdown < Math.min(3, k + 1)) this.events.push({ type: 'count', n: 3 - this.countdown++ });
      if (t >= this.t0) { this.state = 'race'; this.events.push({ type: 'go' }); }
      return;
    }
    if (this.state !== 'race' && this.state !== 'finish') return;
    const you = this.you;
    this.ai.forEach((a, i) => {
      const b = this.boats[i + 1], at = a.update(t, b, you.pos - b.pos);
      if (at !== null) { b.drum(at, b.hits % 2); this.events.push({ type: 'aidrum', lane: b.lane }); }
    });
    for (const b of this.boats) {
      const p0 = b.step(dt, t);
      if (b.finishT === null && b.pos >= RACE_LEN) {
        b.finishT = t - (b.pos - RACE_LEN) / Math.max(1e-3, b.v) - this.t0;
        this.events.push({ type: 'cross', lane: b.lane, rank: this.boats.filter(o => o.finishT !== null).length });
        if (b === you) { this.state = 'finish'; this.stateT = t; }
      }
    }
    if (this.state === 'finish' && (t - this.stateT > AFTER_T || this.boats.every(b => b.finishT !== null) && t - this.stateT > 2.5)) { this.state = 'result'; this.stateT = t; this.events.push({ type: 'result' }); }
  }
  // 名次：先按过线时间，没过线的按位置
  ranks() { return this.boats.slice().sort((a, b) => (a.finishT ?? 1e9) - (b.finishT ?? 1e9) || b.pos - a.pos); }
  rankOf(b) { return this.ranks().indexOf(b) + 1; }
  stats() {
    const y = this.you;
    return { rank: this.rankOf(y), time: y.finishT, sync: y.syncN ? y.syncSum / y.syncN : 0, steady: y.judged ? y.steady / y.judged : 0, streak: y.bestStreak, hits: y.hits, alt: y.hits ? y.altHits / y.hits : 0 };
  }
}
