// 掌心气象台 · 会对道具起反应的小东西（纯数据，Node 里能测）
//
//   风车     风越大转越快；旋风扫过来转疯了；闪电劈到冒火花、停一阵；岩浆烧到就烧坏不转了
//   水车     溪水越满（下雨、倒水涨水）转越快；结冰 / 积雪冻住不转
//   向日葵   花盘跟着太阳转；放晴开得最大、长高一点；下雨、夜里合上低头；干旱、积雪压弯；火 / 岩浆烧焦
//   蘑菇     湿（下雨、倒水）又不晒就冒出来，夜里发光；暴晒、干了缩回去；火 / 岩浆烧掉
//   雪人     雪积够厚就堆起一个；晒太阳、下雨、岩浆靠近会化（岩浆化得最快、冒汽）；闪电劈到脑袋飞了
//   鸟群     平时停在树上；打雷、旋风、雾霾、火 / 岩浆靠近就一哄而散，绕几圈再回来；撒食物飞过去啄
//
// createReactors(spots) 用摆放点建状态；stepReactors(R, env, dt, rnd) 推进，返回事件（给画面出特效 / 声音）。
// env 都是函数或数组，缺的项按"没有"算：
//   wind:[x,z]  whirls:[{x,z}]  strikes:[{x,z}]（这一步新劈的）  sunYaw 太阳方位角  sun 0–1  sunBoost 0–1（手掌放晴）
//   night 0–1  ice 0–1  river 0–1（溪水满不满）  rain(x,z) wet(x,z) snow(x,z) smog(x,z) lava(x,z) fire(x,z) 0–1  food:[{x,z}]

const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;
const ease = (v, target, k, dt) => v + (target - v) * Math.min(1, k * dt);

export function createReactors(spots = {}) {
  return {
    mills: (spots.mills || []).map(p => ({ ...p, ang: 0, spd: 0, stun: 0, burnt: false })),
    wheels: (spots.wheels || []).map(p => ({ ...p, ang: 0, spd: 0, frozen: false })),
    suns: (spots.suns || []).map(p => ({ ...p, yaw: 0, open: 0.6, droop: 0, size: 1, burnt: false })),
    shrooms: (spots.shrooms || []).map(p => ({ ...p, g: 0, glow: 0, burnt: false })),
    snowmen: (spots.snowmen || []).map(p => ({ ...p, s: 0, head: true, deep: 0 })),
    birds: (spots.birds || []).map((p, i) => ({ ...p, hx: p.x, hz: p.z, hy: p.y, y: p.y, st: 'perch', t: 0, a: i * 0.7, tx: p.x, tz: p.z })),
  };
}

export function stepReactors(R, env, dt, rnd = Math.random) {
  const ev = [], f0 = () => 0;
  const wind = env.wind || [0, 0], wm = Math.hypot(wind[0], wind[1]);
  const whirls = env.whirls || [], strikes = env.strikes || [], food = env.food || [];
  const rain = env.rain || f0, wet = env.wet || f0, snow = env.snow || f0, smog = env.smog || f0, lava = env.lava || f0, fire = env.fire || f0;
  const sun = env.sun ?? 1, night = env.night ?? 0, hot = p => lava(p.x, p.z) > 0.3 || fire(p.x, p.z) > 0.3;

  // 风车
  for (const m of R.mills) {
    if (m.burnt) { m.spd = ease(m.spd, 0, 2, dt); m.ang += m.spd * dt; continue; }
    if (hot(m)) { m.burnt = true; ev.push({ type: 'millBurn', x: m.x, z: m.z }); continue; }
    if (strikes.some(s => near(s, m, 0.025))) { m.stun = 3; m.spd = 0; ev.push({ type: 'spark', x: m.x, z: m.z }); }
    const whirl = whirls.some(w => near(w, m, 0.04));
    const target = m.stun > 0 ? 0 : 0.6 + wm * 7 + (whirl ? 22 : 0);
    m.stun = Math.max(0, m.stun - dt);
    m.spd = ease(m.spd, target, whirl ? 3 : 1.2, dt); m.ang += m.spd * dt;
  }
  // 水车
  for (const h of R.wheels) {
    h.frozen = (env.ice ?? 0) > 0.5 || snow(h.x, h.z) > 0.7;
    const target = h.frozen ? 0 : 0.8 + 4 * (env.river ?? 0.3) + 3 * rain(h.x, h.z);
    h.spd = ease(h.spd, target, h.frozen ? 4 : 1, dt); h.ang += h.spd * dt;
  }
  // 向日葵
  for (const s of R.suns) {
    if (s.burnt) continue;
    if (hot(s)) { s.burnt = true; ev.push({ type: 'burnPlant', x: s.x, z: s.z }); continue; }
    const r = rain(s.x, s.z), sn = snow(s.x, s.z), dry = wet(s.x, s.z) < 0.15;
    const openT = night > 0.5 || r > 0.3 ? 0.15 : Math.min(1, 0.35 + 0.65 * sun + 0.5 * (env.sunBoost ?? 0));
    s.open = ease(s.open, openT, 0.8, dt);
    s.droop = ease(s.droop, Math.max(sn > 0.4 ? 1 : 0, dry ? 0.7 : 0, r > 0.3 ? 0.35 : 0, night > 0.5 ? 0.3 : 0), 0.6, dt);
    if ((env.sunBoost ?? 0) > 0.3 && !dry) s.size = Math.min(1.35, s.size + dt * 0.02);   // 放晴久了长高一点
    if (night < 0.5 && sun > 0.1) { let d = (env.sunYaw ?? 0) - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); s.yaw += d * Math.min(1, dt * 0.8); }
  }
  // 蘑菇
  for (const m of R.shrooms) {
    if (hot(m)) { if (m.g > 0.05 && !m.burnt) ev.push({ type: 'burnPlant', x: m.x, z: m.z }); m.g = 0; m.burnt = true; continue; }
    m.burnt = false;
    const w0 = Math.max(wet(m.x, m.z), rain(m.x, m.z));
    if (w0 > 0.5 && sun < 0.75) m.g = Math.min(1, m.g + dt * 0.08 * w0);
    else if (w0 < 0.3 || sun > 0.85) m.g = Math.max(0, m.g - dt * 0.03 * (0.5 + sun));
    m.glow = ease(m.glow, m.g > 0.3 ? night : 0, 1, dt);
  }
  // 雪人
  for (const s of R.snowmen) {
    const sn = snow(s.x, s.z);
    s.deep = sn > 0.6 ? s.deep + dt : Math.max(0, s.deep - dt);
    if (s.s <= 0 && s.deep > 3 && lava(s.x, s.z) < 0.01 && fire(s.x, s.z) < 0.1) { s.head = true; s.build = true; ev.push({ type: 'snowmanUp', x: s.x, z: s.z }); }
    if (s.build) { s.s = Math.min(1, s.s + dt * 0.4); if (s.s >= 1) s.build = false; }   // 一会儿堆起来
    else if (s.s > 0) {
      const l = lava(s.x, s.z) > 0.05 || fire(s.x, s.z) > 0.2;
      const melt = 0.01 + 0.05 * sun * (sn < 0.3 ? 1 : 0.2) + 0.08 * rain(s.x, s.z) + 0.05 * (env.sunBoost ?? 0) + (l ? 0.8 : 0);
      if (l && rnd() < dt * 4) ev.push({ type: 'steam', x: s.x, z: s.z });
      if (s.head && strikes.some(st => near(st, s, 0.03))) { s.head = false; ev.push({ type: 'headPop', x: s.x, z: s.z }); }
      s.s = Math.max(0, s.s - dt * melt);
      if (s.s <= 0) ev.push({ type: 'snowmanGone', x: s.x, z: s.z });
    }
  }
  // 鸟群
  const scare = b => strikes.some(s => near(s, b, 0.08)) || whirls.some(w => near(w, b, 0.05)) || smog(b.x, b.z) > 0.4 || lava(b.hx, b.hz) > 0.1 || fire(b.hx, b.hz) > 0.1;
  let scattered = false;
  for (const b of R.birds) {
    b.t += dt;
    if (b.st !== 'fly' && scare(b)) { b.st = 'fly'; b.t = 0; scattered = true; }
    if (b.st === 'perch') {
      const f = food.find(fd => near(fd, b, 0.07));
      if (f) { b.st = 'peck'; b.tx = f.x + (rnd() - 0.5) * 0.006; b.tz = f.z + (rnd() - 0.5) * 0.006; b.t = 0; }
    } else if (b.st === 'peck') {
      b.x = ease(b.x, b.tx, 2, dt); b.z = ease(b.z, b.tz, 2, dt); b.y = ease(b.y, env.groundY ? env.groundY(b.x, b.z) : 0, 2, dt);
      if (!food.some(fd => near(fd, b, 0.012)) && b.t > 2) { b.st = 'home'; b.t = 0; }
    } else if (b.st === 'fly') {   // 绕着家盘旋上去，过一阵还在闹就继续飞
      b.a += dt * 2.2; const r = 0.03 + 0.01 * Math.sin(b.a * 0.7);
      b.x = ease(b.x, b.hx + Math.cos(b.a) * r, 2, dt); b.z = ease(b.z, b.hz + Math.sin(b.a) * r, 2, dt); b.y = ease(b.y, b.hy + 0.05, 1.5, dt);
      if (b.t > 6 && !scare({ x: b.hx, z: b.hz, hx: b.hx, hz: b.hz })) { b.st = 'home'; b.t = 0; }
    } else if (b.st === 'home') {
      b.x = ease(b.x, b.hx, 1.5, dt); b.z = ease(b.z, b.hz, 1.5, dt); b.y = ease(b.y, b.hy, 1.5, dt);
      if (Math.hypot(b.x - b.hx, b.z - b.hz) < 0.002 && Math.abs(b.y - b.hy) < 0.002) { b.st = 'perch'; b.t = 0; }
    }
  }
  if (scattered) ev.push({ type: 'scatter' });
  return ev;
}
