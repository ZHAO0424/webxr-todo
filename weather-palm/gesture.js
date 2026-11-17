// 掌心气象台 · 手势识别（纯函数，不依赖 three.js，Node 里能直接测）
//
// 输入：一只手 25 个关节的位置（WebXR 顺序，岛的局部坐标，单位米，y 朝上，岛底 y = 0）。
// 输出：这只手现在在做什么天气手势（下雨 / 放晴 / 刮风 / 蓄雷 / 捏合），以及打雷这类一次性事件。
//
// 管线：features(关节) → HandTracker.update(特征) → { mode, cand, candT, strength, events }
// 桌面鼠标、XR 里的真手、测试里的合成手，走的都是同一条管线（鼠标也是先合成一只手再识别）。

// WebXR 关节顺序
export const JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
const W = 0, THUMB_TIP = 4, KNUCKLE = [6, 11, 16, 21], TIP = [9, 14, 19, 24], META = [5, 10, 15, 20];

// 阈值（合成手标定；真机录制后再调，见 README「手势阈值」）
export const CFG = {
  OPEN_ON: 1.55, OPEN_OFF: 1.42,     // 张开度（四指尖到腕的平均距离 ÷ 手长）
  FIST_ON: 1.22, FIST_OFF: 1.42,     // 握拳
  DOWN_ON: 0.65, DOWN_OFF: 0.45,     // 掌心朝下
  UP_ON: 0.65, UP_OFF: 0.45,         // 掌心朝上
  EDGE_ON: 0.65, EDGE_OFF: 0.5,      // 手立起来
  STILL: 0.3,                        // 停稳：水平 + 竖直速度 < 0.3 m/s
  RAIN_MOVE: 0.75,                   // 已经在下雨时允许带着云走的速度
  WIND_ON: 0.35, WIND_OFF: 0.18,     // 刮风的水平速度
  DWELL: { rain: 0.35, sun: 0.5, wind: 0.08, charge: 0.15, pour: 0.25 },
  POUR_DOWN: 0.5,                    // 倒：手立起来、指尖朝下（手指方向的 y 分量 < -0.5），停住
  EXIT: 0.15,                        // 条件失效多久才退出
  CHARGE_FULL: 0.6,                  // 握满多久，张开时才劈下闪电
  PINCH_ON: 0.022, PINCH_OFF: 0.036, PINCH_OTHERS: 1.3,
  OVER_R: 0.2, OVER_Y0: 0.025, OVER_Y1: 0.42,   // 手在岛上方的有效区
  VEL_TAU: 0.06,
};

const sub = (J, a, b) => [J[a * 3] - J[b * 3], J[a * 3 + 1] - J[b * 3 + 1], J[a * 3 + 2] - J[b * 3 + 2]];
const dist = (J, a, b) => Math.hypot(J[a * 3] - J[b * 3], J[a * 3 + 1] - J[b * 3 + 1], J[a * 3 + 2] - J[b * 3 + 2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// 一只手的瞬时特征（不含速度，速度要跨帧，由 tracker 算）
export function features(J, handedness = 'right') {
  const palm = [0, 0, 0];
  for (const k of [W, KNUCKLE[0], KNUCKLE[1], KNUCKLE[3]]) { palm[0] += J[k * 3] / 4; palm[1] += J[k * 3 + 1] / 4; palm[2] += J[k * 3 + 2] / 4; }
  // 掌心法线：腕→食指根 × 腕→小指根。右手这样算出来指向掌心，左手指向手背，要取反
  let n = norm(cross(sub(J, KNUCKLE[0], W), sub(J, KNUCKLE[3], W)));
  if (handedness === 'left') n = [-n[0], -n[1], -n[2]];
  const size = dist(J, KNUCKLE[1], W) || 0.09;
  let open = 0, others = 0;
  for (let i = 0; i < 4; i++) { const r = dist(J, TIP[i], W) / size; open += r / 4; if (i > 0) others += r / 3; }
  const pinchD = dist(J, THUMB_TIP, TIP[0]);
  const fd = norm(sub(J, KNUCKLE[1], W));   // 手指指向
  return { palm, n, size, open, others, pinchD, down: -n[1], up: n[1], edge: 1 - Math.abs(n[1]), fdir: fd };
}

// 每只手一个识别状态机：idle → 候选（姿态满足，计时）→ 激活 → 退出（条件失效超过 EXIT 秒）
// 优先级：捏合 > 蓄雷（握拳）> 刮风 > 下雨 / 放晴
export class HandTracker {
  constructor(id = 0) { this.id = id; this.reset(); }
  reset() {
    this.mode = 'idle'; this.cand = null; this.candT = 0; this.activeT = 0; this.failT = 0;
    this.pinch = false; this.fist = false; this.allowRain = true; this.prev = null; this.vel = [0, 0, 0]; this.chargeT = 0;
    this.f = null; this.over = false; this.events = []; this.windDir = [0, 0];
  }
  // J：Float32Array(75) 或 null（手丢了）
  update(J, handedness, dt) {
    this.events.length = 0;
    if (!J) { const was = this.mode; this.reset(); if (was === 'charge') this.events.push({ type: 'fizzle' }); return this; }
    const f = this.f = features(J, handedness), C = CFG;
    // 速度（指数平滑）
    if (this.prev && dt > 0) {
      const k = 1 - Math.exp(-dt / C.VEL_TAU);
      for (let i = 0; i < 3; i++) this.vel[i] += ((f.palm[i] - this.prev[i]) / dt - this.vel[i]) * k;
    }
    this.prev = f.palm.slice();
    const hs = Math.hypot(this.vel[0], this.vel[2]), sp = Math.hypot(hs, this.vel[1]);
    const r = Math.hypot(f.palm[0], f.palm[2]);
    this.over = r < C.OVER_R && f.palm[1] > C.OVER_Y0 && f.palm[1] < C.OVER_Y1;
    // 捏合与握拳带滞回
    // 捏合要求中指到小指没攥紧，免得握拳时拇指贴着食指被当成捏合
    this.pinch = f.others > C.PINCH_OTHERS && (this.pinch ? f.pinchD < C.PINCH_OFF : f.pinchD < C.PINCH_ON);
    this.fist = this.fist ? f.open < C.FIST_OFF : f.open < C.FIST_ON;
    const m = this.mode;
    // 当前姿态满足哪一种（激活中的模式用宽松阈值，便于保持）
    const want = (() => {
      if (this.pinch) return 'pinch';
      if (!this.over) return null;
      if (this.fist && !this.pinch) return 'charge';
      const openOK = f.open > (m === 'rain' || m === 'sun' || m === 'wind' ? C.OPEN_OFF : C.OPEN_ON);
      if (f.edge > (m === 'wind' ? C.EDGE_OFF : C.EDGE_ON) && hs > (m === 'wind' ? C.WIND_OFF : C.WIND_ON) && f.open > C.OPEN_OFF) return 'wind';
      if (f.edge > (m === 'pour' ? C.EDGE_OFF : C.EDGE_ON) && f.fdir[1] < -(m === 'pour' ? C.POUR_DOWN - 0.15 : C.POUR_DOWN) && sp < (m === 'pour' ? C.RAIN_MOVE : C.STILL)) return 'pour';
      if (this.allowRain && openOK && f.down > (m === 'rain' ? C.DOWN_OFF : C.DOWN_ON) && sp < (m === 'rain' ? C.RAIN_MOVE : C.STILL)) return 'rain';
      if (openOK && f.up > (m === 'sun' ? C.UP_OFF : C.UP_ON) && sp < (m === 'sun' ? C.RAIN_MOVE : C.STILL)) return 'sun';
      return null;
    })();

    // 打雷：蓄满后张开（握拳状态解除）就劈下来
    if (m === 'charge' && want !== 'charge') {
      if (!this.fist && this.chargeT >= C.CHARGE_FULL && this.over) this.events.push({ type: 'strike', x: f.palm[0], z: f.palm[2] });
      else this.events.push({ type: 'fizzle' });
      this.mode = 'idle'; this.chargeT = 0; this.cand = null; this.candT = 0;
    }

    if (this.mode !== 'idle' && want === this.mode) {
      this.failT = 0; this.activeT += dt;
    } else if (this.mode !== 'idle') {
      this.failT += dt;
      // 刮风结束得快；捏合立刻跟随
      if (this.failT > C.EXIT || this.mode === 'pinch' || want === 'pinch') { this.mode = 'idle'; this.activeT = 0; this.failT = 0; }
    }
    if (this.mode === 'idle') {
      if (want === 'pinch') { this.mode = 'pinch'; this.cand = null; this.candT = 0; }
      else if (want) {
        if (this.cand !== want) { this.cand = want; this.candT = 0; }
        this.candT += dt;
        if (this.candT >= C.DWELL[want]) { this.mode = want; this.activeT = 0; this.cand = null; this.candT = 0; }
      } else { this.cand = null; this.candT = 0; }
    }
    if (this.mode === 'charge') this.chargeT += dt;
    if (this.mode === 'wind' && hs > 1e-4) this.windDir = [this.vel[0] / hs, this.vel[2] / hs];
    this.speed = hs;
    return this;
  }
  // 给模拟用的：位置、模式、强度
  get state() {
    const f = this.f;
    if (!f) return null;
    const C = CFG;
    let strength = 0;
    if (this.mode === 'rain') strength = Math.min(1, 0.25 + this.activeT / 2);
    else if (this.mode === 'sun') strength = Math.min(1, 0.3 + this.activeT / 1.5);
    else if (this.mode === 'wind') strength = Math.min(1, this.speed / 1.2);
    else if (this.mode === 'charge') strength = Math.min(1, this.chargeT / C.CHARGE_FULL);
    else if (this.mode === 'pour') strength = Math.min(1, 0.4 + this.activeT);
    return {
      id: this.id, x: f.palm[0], y: f.palm[1], z: f.palm[2], over: this.over, mode: this.mode,
      // 倒的落点：指尖下方
      px: f.palm[0] + f.fdir[0] * 0.06, pz: f.palm[2] + f.fdir[2] * 0.06,
      cand: this.cand, candP: this.cand ? Math.min(1, this.candT / C.DWELL[this.cand]) : 0,
      strength, dx: this.windDir[0], dz: this.windDir[1], vx: this.vel[0], vz: this.vel[2],
    };
  }
}

// ---------- 合成手：测试、桌面鼠标、教学示范手共用 ----------
// opts: { pos:[x,y,z] 手掌中心, n:[..] 掌心朝向, f:[..] 手指指向（会被正交化）, curl 0..1, pinch bool, handedness }
const FINGERS = [
  // [根部横向偏移(沿拇指方向), 指根前伸, 三节长度]
  [0.021, 0.086, [0.040, 0.024, 0.020]],
  [0.004, 0.090, [0.044, 0.027, 0.021]],
  [-0.013, 0.085, [0.041, 0.026, 0.020]],
  [-0.027, 0.077, [0.032, 0.019, 0.018]],
];
export function synthHand(o = {}) {
  const hand = o.handedness || 'right';
  let n = norm(o.n || [0, -1, 0]);
  let fd = o.f || [0, 0, -1];
  // 手指方向与掌心正交
  const d = fd[0] * n[0] + fd[1] * n[1] + fd[2] * n[2];
  fd = norm([fd[0] - n[0] * d, fd[1] - n[1] * d, fd[2] - n[2] * d]);
  // 拇指一侧：右手 S = -(n × f)，左手 S = n × f
  let s = cross(n, fd); if (hand === 'right') s = [-s[0], -s[1], -s[2]];
  const curl = o.curl ?? 0;
  const P = o.pos || [0, 0.15, 0];
  const J = new Float32Array(75);
  // 腕在手掌中心往后约 4.5 cm
  const w = [P[0] - fd[0] * 0.045, P[1] - fd[1] * 0.045, P[2] - fd[2] * 0.045];
  const set = (k, p) => { J[k * 3] = p[0]; J[k * 3 + 1] = p[1]; J[k * 3 + 2] = p[2]; };
  const at = (a, b, c) => [w[0] + s[0] * a + fd[0] * b + n[0] * c, w[1] + s[1] * a + fd[1] * b + n[1] * c, w[2] + s[2] * a + fd[2] * b + n[2] * c];
  set(0, w);
  const FLEX = [1.35, 1.6, 0.9];
  FINGERS.forEach(([lat, fwd, L], i) => {
    const base = 5 + i * 5;
    set(base, at(lat * 0.55, 0.02, 0));
    let p = at(lat, fwd, 0); set(base + 1, p);
    let th = 0;
    for (let k = 0; k < 3; k++) {
      th += curl * FLEX[k] * (o.pinch && i === 0 ? 0.55 : 1);
      const dir = [fd[0] * Math.cos(th) + n[0] * Math.sin(th), fd[1] * Math.cos(th) + n[1] * Math.sin(th), fd[2] * Math.cos(th) + n[2] * Math.sin(th)];
      p = [p[0] + dir[0] * L[k], p[1] + dir[1] * L[k], p[2] + dir[2] * L[k]];
      set(base + 2 + k, p);
    }
  });
  // 拇指：从根部伸向目标点
  const tb = at(0.018, 0.012, 0.004);
  let target;
  if (o.pinch) { const t = 9; target = [J[t * 3], J[t * 3 + 1], J[t * 3 + 2]]; }
  else {
    const c = curl;
    target = at(0.065 * (1 - c) + 0.01 * c, 0.055 * (1 - c) + 0.07 * c, 0.012 + 0.025 * c);
  }
  set(1, tb);
  for (let k = 1; k <= 3; k++) {
    const t = k / 3;
    set(1 + k, [tb[0] + (target[0] - tb[0]) * t, tb[1] + (target[1] - tb[1]) * t, tb[2] + (target[2] - tb[2]) * t]);
  }
  return J;
}

// 常用姿态。yaw：手指指向在水平面上的方位（0 = 指向 -z，即远离你）
export function pose(name, pos, yaw = 0, handedness = 'right', moveDir = null) {
  const f = [-Math.sin(yaw), 0, -Math.cos(yaw)];
  switch (name) {
    case 'down': return synthHand({ pos, n: [0, -1, 0], f, curl: 0.05, handedness });
    case 'up': return synthHand({ pos, n: [0, 1, 0], f, curl: 0.08, handedness });
    case 'edge': {   // 立掌，掌心朝着运动方向（像扇风）
      const md = moveDir || [1, 0];
      return synthHand({ pos, n: [md[0], -0.15, md[1]], f: [0, 0.35, 0].map((v, i) => v + f[i]), curl: 0.08, handedness });
    }
    case 'pour': return synthHand({ pos, n: [Math.cos(yaw), 0, -Math.sin(yaw)], f: [0, -1, 0.15], curl: 0.15, handedness });   // 立掌、指尖朝下，像在往下倒
    case 'fist': return synthHand({ pos, n: [0.3, -0.9, 0], f, curl: 1, handedness });
    case 'pinch': return synthHand({ pos, n: [0.4, -0.5, 0.5], f, curl: 0.35, pinch: true, handedness });
    // 放松：半握、手斜着，不该触发任何手势
    default: return synthHand({ pos, n: [0.75, -0.5, 0.2], f, curl: 0.5, handedness });
  }
}
