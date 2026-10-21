import * as THREE from 'three';
import { makeRng } from './pixel.js';
import { WATER_Y } from './layout.js';
import { voxelCharacter, voxelAnimalFrames, VOX } from './voxel.js';

/*
 * 村里的"生活"。
 *
 * 时钟：下午 3 点到晚上 9 点，1 秒 = 村里 1 分钟；9 点以后夜里快进，第二天 3 点接着过。
 * 人：按名册里的日程（residents.js 的 day）到点切换活动；每个活动拆成一串任务——
 *     走过去（导航网格 A*，不穿墙不爬石堰）、干活 / 坐 / 蹲 / 说话、进屋（隐藏）、触发事件。
 *     走路时前面有人会停下让一让；去公共地方会挑没人占的位置。
 * 动物：按角色过日子，并且响应人——喂鸡时鸡围过来，羊倌出门羊群跟着走，赶牛去场院牛跟着、
 *     到了绕着碾子转；磨豆腐时驴才推磨；狗跟着主人；鸭鹅被赶回家；喜鹊、猫在高处跳来跳去。
 *     狗、猪、羊、驴、牛会把院门拱开溜出去转一圈，但不会关门——门就敞着，等有人路过带上。
 * 傍晚：村口每天轮一样活动——唱戏 / 篝火讲古 / 开村会。不是人人都去：按年纪、身份、喜好掷骰子，
 *     不去的在自家门口坐着，或者早早歇了。
 */

/**
 * 把逻辑位置画到模型上（人、动物共用）。之前直接按像素网格取整位置、按 22.5° 取整朝向，
 * 走起来一顿一顿的、拐弯时左右抖。现在：
 *   - 位置不取整（像素感已经由材质里的纹素对齐保证），高度平滑跟上（上下台阶不跳）；
 *   - 朝向先平滑转过去，再按 22.5° 分档，并且带回差——要多转过半档才换下一档，不会在两档之间来回跳。
 */
const STEP_Q = Math.PI / 8;
function present(a, dt, y) {
  const o = a.object;
  let diff = a.heading - (a.shownHeading ?? a.heading);
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  a.shownHeading = (a.shownHeading ?? a.heading) + diff * Math.min(1, dt * 10);
  const cur = o.rotation.y, d2 = Math.atan2(Math.sin(a.shownHeading - cur), Math.cos(a.shownHeading - cur));
  if (Math.abs(d2) > STEP_Q * 0.75) o.rotation.y = Math.round(a.shownHeading / STEP_Q) * STEP_Q;
  const jump = Math.abs(y - o.position.y) > 2 || !a.placed; // 头一帧、进出屋：直接放到位
  o.position.set(a.pos.x, jump ? y : o.position.y + (y - o.position.y) * Math.min(1, dt * 12), a.pos.z);
  a.placed = true;
}
export const DAY_START = 15, DAY_END = 21;
const NIGHT_SECONDS = 8;

/** 村里的钟。 */
export class Clock {
  constructor(start = 15.5) { this.hour = start; this.day = 1; }
  update(dt) {
    if (this.hour < DAY_END) this.hour += dt / 60;
    else this.hour += (dt * (24 - DAY_END + DAY_START)) / NIGHT_SECONDS;
    if (this.hour >= 24 + DAY_START) { this.hour = DAY_START; this.day++; }
  }
  get night() { return this.hour >= DAY_END; }
  get label() {
    const h = this.hour % 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}

// ---------------------------------------------------------------- 村民

const WORK = { // 各家默认的干活位置、手里的家伙、朝哪儿
  smith: { spot: 'anvil', item: 'hammer', face: [-3.4, 2.6] },
  carpenter: { spot: 'work', item: 'saw', face: [4.7, 1.6] },
  tofu: { spot: 'stove', item: 'ladle', face: [3.6, 0.9] },
  store: { spot: 'counter', item: null, state: 'idle', face: [-1.2, 10] },
  doctor: { spot: 'herbs', item: 'box', face: [3.6, 0.8] },
  square: { spot: 'barber', item: 'box', face: [-1.6, -3.7] },
  school: { spot: 'teach', item: 'book', state: 'talk', face: [0, 4] },
};

class Villager {
  constructor(p, V, rand) {
    this.p = p;
    this.V = V;
    this.rand = rand;
    this.char = voxelCharacter(p, V.M);
    this.object = this.char.object;
    this.object.userData.resident = p;
    V.root.add(this.object);
    this.speed = p.body === 'child' ? 1.3 : p.elder || p.item === 'cane' ? 0.5 : 0.95;
    this.home = V.C[p.home];
    this.bed = V.C[p.sleepAt ?? p.home];
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.phase = rand() * 6;
    this.tasks = [];
    this.state = 'idle';
    this.inside = false;
    this.entry = -1;
    this.doing = '';
    this.wait = 0;
    this.lift = 0; // 站在戏台上、坐在石凳上时离地的高度
    this.perched = false;
    this.down = null; // 下来的路
    const [dx, dz] = V.nav.nearestFree(...this.bed.door('house'));
    this.pos.set(dx, 0, dz);
  }

  // ---- 工具
  w(c, name) { return c.spot(name); }
  go(to, opts = {}) { this.tasks.push({ type: 'go', to, ...opts }); }
  do(state, dur, opts = {}) { this.tasks.push({ type: 'do', state, dur, ...opts }); }
  enter(c, which = 'house') { this.go(c.door(which)); this.tasks.push({ type: 'inside' }); }
  call(fn) { this.tasks.push({ type: 'call', fn }); }
  item(name) { this.tasks.push({ type: 'call', fn: () => this.char.setItem(name) }); }
  /** 走直线爬上 / 下到导航网格管不到的地方（戏台台阶、石凳）。pts：[[x, z, 离地高], …]，down：下来时怎么走。 */
  climb(pts, down) {
    this.tasks.push({ type: 'climb', pts: pts.map((q) => [...q]) });
    this.call(() => { this.perched = true; this.down = down; });
  }

  /** 到点了：按日程换活动。 */
  schedule(hour) {
    const day = this.p.day;
    let idx = -1;
    for (let i = 0; i < day.length; i++) if (hour >= day[i][0] + (this.phase - 3) * 0.02) idx = i;
    if (idx === this.entry) return;
    this.entry = idx;
    this.end?.();
    this.end = null;
    this.tasks = [];
    this.loop = null;
    if (this.down) { // 先从台上 / 凳上下来
      this.tasks.push({ type: 'climb', pts: this.down });
      this.call(() => { this.perched = false; this.lift = 0; });
      this.down = null;
    }
    if (this.inside) { this.inside = false; this.object.visible = true; }
    if (idx < 0) { this.inside = true; this.object.visible = false; return; }
    const [, name, arg] = day[idx];
    this.doing = name;
    (ACTIVITIES[name] ?? ACTIVITIES.idle)(this, arg);
  }

  /**
   * 正前方的人：前方 0.75 米以内、左右偏不到 0.45 米（再偏就擦肩过去了，不算挡）。没有返回 null。
   */
  ahead(nx, nz) {
    let best = null, bestD = 0.75;
    for (const o of this.V.people) {
      if (o === this || o.inside || o.perched) continue;
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
      const fwd = dx * nx + dz * nz, side = Math.abs(-dx * nz + dz * nx);
      if (fwd > 0.05 && fwd < bestD && side < 0.45) { best = o; bestD = fwd; }
    }
    return best;
  }

  /**
   * 从挡路的人旁边绕过去：往离他远的那一侧斜着走（两人迎面时各往各的外侧，自然擦肩）。
   * 返回这一帧的走向 [mx, mz]，旁边没地方返回 null。
   */
  sidestep(nx, nz, o) {
    const nav = this.V.nav;
    const lat = -(o.pos.x - this.pos.x) * nz + (o.pos.z - this.pos.z) * nx; // 他在我左边 > 0
    for (const sd of lat > 0 ? [-1, 1] : [1, -1]) {
      const mx = nx + -nz * sd * 1.1, mz = nz + nx * sd * 1.1, m = Math.hypot(mx, mz);
      const x = this.pos.x + (mx / m) * 0.4, z = this.pos.z + (mz / m) * 0.4;
      const k0 = nav.index(this.pos.x, this.pos.z), k1 = nav.index(x, z);
      if (nav.free(k1, false, true) && (k0 === k1 || nav.step(k0, k1, false, true)) && !this.V.people.some((p) => p !== this && p !== o && !p.inside && Math.hypot(p.pos.x - x, p.pos.z - z) < 0.4)) return [mx / m, mz / m];
    }
    return null;
  }

  /**
   * 有人要过，自己站着挡了路：往旁边让一步（朝自己本来就偏的那一侧，0.8 米），站一会儿再回原位接着干。
   * 坐着的、在台上 / 凳上的不让（后面的人会绕）。
   */
  makeWay(walker, nx, nz) {
    if (this.inside || this.perched || (this.madeWay ?? 0) > 0 || this.tasks[0]?.type === 'go' || ['sit', 'fiddle'].includes(this.state)) return;
    const nav = this.V.nav;
    const side = Math.sign(-nz * (this.pos.x - walker.pos.x) + nx * (this.pos.z - walker.pos.z)) || 1;
    for (const sd of [side, -side]) {
      const x = this.pos.x - nz * sd * 0.8, z = this.pos.z + nx * sd * 0.8;
      if (!nav.freeAt(x, z, false, true) || !nav.line(this.pos.x, this.pos.z, x, z, false, true)) continue;
      const home = [this.pos.x, this.pos.z];
      this.madeWay = 4;
      this.V.stats.madeWay++;
      this.tasks.unshift({ type: 'go', to: [x, z] }, { type: 'do', state: 'idle', dur: 1.6, face: [walker.pos.x, walker.pos.z] }, { type: 'go', to: home });
      return;
    }
  }

  /** 绕路：把附近站着的人当成临时障碍，重新找一条路。 */
  detour(task, target) {
    const nav = this.V.nav, avoid = [];
    for (const o of this.V.people) {
      if (o === this || o.inside || o.tasks[0]?.type === 'go') continue;
      const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
      if (d < 4 && Math.hypot(o.pos.x - target[0], o.pos.z - target[1]) > 0.8) avoid.push(...nav.discCells(o.pos.x, o.pos.z, 0.45));
    }
    const mine = nav.index(this.pos.x, this.pos.z);
    const path = nav.find(this.pos.x, this.pos.z, target[0], target[1], { person: true, maxNodes: 20000, avoid: avoid.filter((k) => k !== mine) });
    if (path?.length) { task.path = path; this.V.stats.detours++; return true; }
    return false;
  }

  update(t, dt, hour) {
    this.dt = dt;
    this.madeWay = Math.max(0, (this.madeWay ?? 0) - dt);
    if (hour < DAY_END) this.schedule(hour);
    else if (!this.inside) { this.inside = true; this.object.visible = false; } // 夜里都睡了
    if (!this.tasks.length && this.loop) this.loop();
    const task = this.tasks[0];
    this.state = 'idle';
    if (this.inside) return;
    if (task) {
      if (task.type === 'call') { this.tasks.shift(); task.fn(); }
      else if (task.type === 'inside') { this.inside = true; this.object.visible = false; this.tasks.shift(); }
      else if (task.type === 'go') this.walk(task, dt);
      else if (task.type === 'climb') this.climbStep(task, dt);
      else if (task.type === 'do') {
        this.state = task.state;
        if (task.face) this.heading = Math.atan2(task.face[0] - this.pos.x, task.face[1] - this.pos.z);
        task.dur -= dt;
        if (task.dur <= 0) this.tasks.shift();
      }
    }
    if (!this.perched && !['walk', 'run', 'sit', 'fiddle'].includes(this.state)) this.separate(dt); // 坐着的不挪（在凳子 / 石头上）
    present(this, dt, this.V.nav.heightAt(this.pos.x, this.pos.z) + 0.03 + this.lift);
    this.char.pose(this.state, t, this.phase, { seat: this.seat ?? 0.45 });
  }

  /** 站着、坐着的时候别和旁边的人叠在一起：离得太近就各自往外让一点，至少隔 0.7 米（只挪到能站的格子上）。 */
  separate(dt) {
    for (const o of this.V.people) {
      if (o === this || o.inside || o.perched) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d >= 0.7) continue;
      const k = Math.min(0.02, (0.7 - d) * dt * 2), nx = d > 1e-3 ? dx / d : Math.cos(this.phase), nz = d > 1e-3 ? dz / d : Math.sin(this.phase);
      const x = this.pos.x + nx * k, z = this.pos.z + nz * k;
      if (this.V.nav.freeAt(x, z, false, true) && Math.abs(this.V.nav.heightAt(x, z) - this.V.nav.heightAt(this.pos.x, this.pos.z)) < 0.1) { this.pos.x = x; this.pos.z = z; }
    }
  }

  climbStep(task, dt) {
    const [tx, tz, ty] = task.pts[0];
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (!task.from) task.from = { d: Math.max(d, 1e-3), lift: this.lift };
    const step = this.speed * 0.7 * this.dt;
    this.state = 'walk';
    if (d > 0.01) this.heading = Math.atan2(dx, dz);
    if (d <= step) { this.pos.x = tx; this.pos.z = tz; this.lift = ty; task.pts.shift(); task.from = null; if (!task.pts.length) this.tasks.shift(); return; }
    this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
    this.lift = ty + (task.from.lift - ty) * ((d - step) / task.from.d);
  }

  walk(task, dt) {
    const nav = this.V.nav;
    const target = typeof task.to === 'function' ? task.to() : task.to;
    if (!target) { this.tasks.shift(); return; }
    if (!task.path || (typeof task.to === 'function' && task.retarget-- <= 0)) {
      task.path = nav.find(this.pos.x, this.pos.z, target[0], target[1], { person: true }) ?? [];
      task.retarget = 60;
      if (!task.path.length) { this.tasks.shift(); return; }
    }
    if (task.steered && !nav.line(this.pos.x, this.pos.z, ...task.path[0], false, true)) { // 刚才绕人偏出了路线，直着回不去了：重新找路
      task.path = nav.find(this.pos.x, this.pos.z, target[0], target[1], { person: true }) ?? [];
      if (!task.path.length) { this.tasks.shift(); return; }
    }
    task.steered = false;
    const [tx, tz] = task.path[0];
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    const run = task.run;
    this.state = run ? 'run' : 'walk';
    let step = this.speed * (run ? 1.8 : 1) * dt;
    if (d > 0.01) {
      const nx = dx / d, nz = dz / d;
      this.heading = Math.atan2(nx, nz);
      // 前面是关着的门：站住，伸手推门，等门开了再走
      const door = nav.closedDoorAt(this.pos.x + nx * 0.35, this.pos.z + nz * 0.35);
      if (door) { door.want = 0.6; this.state = 'idle'; return; }
      this.passing = Math.max(0, (this.passing ?? 0) - dt);
      if (this.pause > 0) { this.pause -= dt; this.wait += dt; this.state = 'idle'; return; }
      const o = this.passing > 0 ? null : this.ahead(nx, nz);
      if (o) {
        const oWalking = o.tasks[0]?.type === 'go' && (o.state === 'walk' || o.state === 'run');
        const side = this.sidestep(nx, nz, o);
        const sx = this.pos.x + (side?.[0] ?? 0) * step, sz = this.pos.z + (side?.[1] ?? 0) * step;
        const k0 = nav.index(this.pos.x, this.pos.z), k1 = nav.index(sx, sz);
        if (side && nav.free(k1, false, true) && (k0 === k1 || nav.step(k0, k1, false, true))) { // 旁边有地方：斜着绕过去（同向就是超车，迎面就是擦肩），不停
          this.pos.x = sx; this.pos.z = sz;
          this.heading = Math.atan2(side[0], side[1]);
          task.steered = true;
          this.wait = 0;
          return;
        }
        if (oWalking && Math.sin(o.heading) * nx + Math.cos(o.heading) * nz > 0.3) {
          step = Math.min(step, o.speed * (o.tasks[0]?.run ? 1.8 : 1) * dt * 0.95); // 同向、旁边没地方超：放慢跟着走，不停
        } else if (oWalking) { // 迎面、窄路上错不开：id 大的让一下
          if (this.p.id > o.p.id) { this.pause = 0.3; this.wait += dt; this.state = 'idle'; if (this.wait > 1.5) this.passing = 1.0; return; }
        } else { // 前面的人站着：先请他让一让；等一会儿还挡着就绕路；绕不开才侧身挤过去
          if (this.wait === 0) o.makeWay(this, nx, nz);
          if (this.wait > 0.8 && !task.detoured) { task.detoured = true; if (this.detour(task, target)) { this.wait = 0; return; } }
          if (this.wait < 2.5) { this.pause = 0.35; this.wait += dt; this.state = 'idle'; return; }
          this.passing = 1.2;
        }
      }
      this.wait = 0;
      task.detoured = false;
    }
    if (d <= step) { this.pos.x = tx; this.pos.z = tz; task.path.shift(); if (!task.path.length) this.tasks.shift(); }
    else { this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step; }
  }

}

// ---------------------------------------------------------------- 傍晚村口的活动

export const EVENTS = ['opera', 'bonfire', 'meeting'];
export const EVENT_NAMES = { opera: '唱戏', bonfire: '篝火讲古', meeting: '开村会' };
/** 每样活动里有固定角色的人（一定到场）。 */
const EVENT_ROLES = {
  opera: { ma_laoliu: 'singer', zheng_laotou: 'fiddler' }, // 羊倌老马嗓子亮，剃头匠老郑拉板胡
  bonfire: { zheng_laotou: 'storyteller' },
  meeting: { wang_deshan: 'speaker', li_wenqing: 'clerk' }, // 村长主持，李先生记账
};

/** 字符串 → [0, 1) 的固定随机数（同一天、同一个人结果不变）。 */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** 去不去：看戏老少都爱去；篝火男人、老人爱凑；村会户主必到，小孩不去。 */
function attends(p, ev, day) {
  const kid = p.body === 'child', elder = p.age >= 60, head = p.relation === '户主', outsider = p.relation.includes('外村');
  const likes = (p.likes ?? '').includes('戏') ? 0.1 : 0;
  const prob = {
    opera: kid ? 0.9 : elder ? 0.85 + likes : 0.7 + likes,
    bonfire: kid ? 0.55 : elder ? 0.6 : p.sex === '男' ? 0.75 : 0.4,
    meeting: kid ? 0 : head ? 1 : outsider ? 0.15 : 0.45,
  }[ev];
  return hash(`${day}/${p.id}/${ev}`) < prob;
}

// ---------------------------------------------------------------- 活动
// 每个活动往村民的任务队列里塞一串任务；loop 是任务做完后（活动还没到点结束时）接着做什么。

const R = (a) => a[Math.floor(Math.random() * a.length)];

/** 自家门口墙根底下一个没人占的位置（没有就 null）。 */
function wallSpot(v) {
  const c = v.home, spots = c.wallSpots ?? [];
  const name = spots.length ? v.V.claim(v, c, spots.map((_, i) => `wall${i}`), { strict: true }) : null;
  return name ? spots[Number(name.slice(4))] : null;
}

const ACTIVITIES = {
  idle(v) { v.loop = () => v.do('idle', 5); },

  home(v) { v.char.setItem(null); v.enter(v.bed, 'house'); },

  cook(v) {
    v.char.setItem(null);
    v.enter(v.home, 'kitchen');
    v.V.cooking.add(v.home.id);
    v.end = () => v.V.cooking.delete(v.home.id);
  },

  work(v, arg) {
    const W = WORK[v.p.home] ?? {};
    if (arg === 'sweep') {
      v.char.setItem('broom');
      v.loop = () => { v.go(v.home.spot(R(['sweepA', 'sweepB']))); v.do('work', 6); };
      return;
    }
    if (arg === 'bellows') { v.char.setItem(null); v.go(v.home.spot('bellows')); v.loop = () => v.do('work', 8, { face: v.home.at(-3.4, 2.6) }); return; }
    if (arg === 'stove') { v.char.setItem('ladle'); v.go(v.home.spot('stove')); v.loop = () => v.do('work', 8, { face: v.home.at(3.6, 0.9) }); return; }
    if (arg === 'work' && v.p.home === 'tofu') { v.go(v.home.spot('mill')); v.loop = () => v.do('idle', 8, { face: v.home.at(-3.2, 1.6) }); return; } // 小孩看驴推磨
    v.char.setItem(W.item === undefined ? v.p.item : W.item);
    v.go(v.home.spot(W.spot ?? 'yard'));
    const face = W.face ? v.home.at(...W.face) : null;
    if (v.p.home === 'square') { // 剃头匠：有客人就剃，没有就闲坐着
      v.loop = () => v.do(v.rand() > 0.5 ? 'work' : 'idle', 6, { face }); // 刮脸、磨刀，闲了就坐着
      return;
    }
    v.loop = () => v.do(W.state ?? 'work', 8, { face });
  },

  fetchWater(v) {
    v.char.setItem('buckets');
    v.go(v.V.well.spot());
    v.do('work', 5, { face: v.V.well.center });
    v.go(v.home.door('kitchen'));
    v.do('idle', 2);
    v.item(v.p.item ?? null);
    v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); };
  },

  feedChickens(v) {
    v.char.setItem('basket');
    v.go(v.home.spot('feedChickens'));
    v.call(() => v.V.attract.set(`${v.home.id}:chicken`, v));
    v.do('scatter', 18);
    v.call(() => v.V.attract.delete(`${v.home.id}:chicken`));
    v.end = () => v.V.attract.delete(`${v.home.id}:chicken`);
    v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); };
  },

  feedPigs(v) {
    v.char.setItem('bucket');
    v.go(v.home.spot('feedPigs'));
    v.call(() => v.V.attract.set(`${v.home.id}:pig`, v));
    v.do('work', 12);
    v.call(() => v.V.attract.delete(`${v.home.id}:pig`));
    v.end = () => v.V.attract.delete(`${v.home.id}:pig`);
    v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); };
  },

  feedRabbits(v) { v.char.setItem('basket'); v.go(v.home.spot('rabbits')); v.do('work', 14); v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); }; },

  yardWork(v) {
    v.char.setItem('broom');
    v.loop = () => { v.go(v.home.randomPoint()); v.do('work', 5); };
  },

  shopping(v) {
    v.char.setItem('basket');
    const store = v.V.C.store;
    v.go(() => store.spot(v.V.claim(v, store, ['customer', 'customer2'])));
    v.do('talk', 8, { face: store.spot('counter') });
    v.call(() => v.V.release(v));
    v.go(v.home.spot('yard'));
    v.loop = () => v.do('idle', 6);
  },

  visit(v, who) {
    const c = v.V.C[who];
    v.char.setItem(v.p.item ?? null);
    v.go(c.spot('yard') ?? c.gateOut());
    v.do('talk', 22);
    v.go(v.home.spot('yard') ?? v.home.gateOut());
    v.loop = () => v.do('idle', 6);
  },

  patrol(v) { // 村长在村里转一圈，见人说两句
    const stops = ['well', 'mid', 'gate:square', 'east', 'e1', 'L1', 'w1', 'gate:store'];
    v.loop = () => { const n = v.V.nodes[R(stops)]; v.go([n.x, n.z]); v.do('talk', 5); };
  },

  chess(v) {
    v.char.setItem(v.p.item ?? null);
    const sq = v.V.C.square;
    const seat = v.p.id === 'wang_deshan' ? 'tableW' : 'tableE';
    v.go(sq.spot(seat));
    v.loop = () => { v.seat = 0.45; v.do('sit', 10, { face: sq.at(-0.4, 3.6) }); };
    v.end = () => { v.seat = null; };
  },

  dinner(v) { // 北方的"饭场"：端着碗到门口墙根底下蹲着吃，邻居凑一块儿（不蹲在路上、门前）
    v.char.setItem('bowl');
    const spot = wallSpot(v);
    if (spot) { v.go(spot.at); v.loop = () => v.do(v.rand() > 0.3 ? 'squat' : 'talk', 8, { face: spot.face }); }
    else { const [gx, gz] = v.home.gateOut(); v.go(v.V.nav.nearestFree(gx, gz + 1)); v.loop = () => v.do('squat', 8, { face: [gx, gz - 3] }); }
    v.end = () => { v.char.setItem(v.p.item ?? null); v.V.release(v); };
  },

  evening(v) { // 傍晚去村口：今晚是什么活动、自己去不去、去了干什么
    const ev = v.V.event();
    const role = EVENT_ROLES[ev][v.p.id];
    const kid = v.p.body === 'child';
    if (!role && !attends(v.p, ev, v.V.clockDay())) {
      v.doing = kid ? 'play' : hash(`${v.V.clockDay()}/${v.p.id}/alt`) < 0.5 ? 'sitGate' : 'home';
      ACTIVITIES[v.doing](v);
      return;
    }
    v.doing = role ? `${ev}:${role}` : ev;
    const sq = v.V.C.square, E = sq.evening;
    const W = (p) => sq.at(p[0], p[1]);
    const onStage = (to) => { // 从台阶爬上台，走到位置；下来原路返回
      const [fx, fz] = W(E.foot), [tx, tz] = W(E.top), [x, z] = W(to);
      v.go(sq.spot('stageFoot'));
      v.climb([[fx, fz, 0], [tx, tz, E.lift], [x, z, E.lift]], [[tx, tz, E.lift], [fx, fz, 0]]);
    };
    const face = W(E.face), pit = W(E.pit);
    v.end = () => { v.seat = null; v.V.release(v); };
    if (role === 'singer') { v.char.setItem('fan'); onStage(E.singer); v.loop = () => v.do('sing', 12, { face: W([3.5, 6]) }); return; }
    if (role === 'fiddler') { v.char.setItem('huqin'); onStage(E.chairL); v.loop = () => { v.seat = 0.45; v.do('fiddle', 10, { face: W([2.6, 4]) }); }; return; }
    if (role === 'speaker') { v.char.setItem(null); onStage(E.speaker); v.loop = () => v.do('speech', 10, { face: W([3.5, 6]) }); return; }
    if (role === 'clerk') { v.char.setItem('book'); onStage(E.chairR); v.loop = () => { v.seat = 0.45; v.do('sit', 10, { face: W([4.6, 4]) }); }; return; }
    // 走到自己的位置；火塘边的石凳要爬上去坐。返回那个座（不是火塘边的座返回 null）
    const take = (name) => {
      const seat = name.startsWith('ring') ? sq.ringSeats[Number(name.slice(4))] : null;
      v.go(sq.spot(name));
      if (seat?.perch) { const [x, z] = W([seat.x, seat.z]); v.climb([[x, z, 0]], [[...sq.spot(name), 0]]); }
      return seat;
    };
    if (ev === 'bonfire') { // 围着火堆：石头、石凳上坐一圈，坐满了外圈站着；讲古的先把火点上
      v.char.setItem(v.p.item === 'pipe' ? 'pipe' : null);
      const name = role === 'storyteller' ? 'ring1' : v.V.claim(v, sq, [...E.ring.filter((n) => n !== 'ring1'), ...E.outer], { ordered: true, strict: true });
      if (!name) { v.doing = 'sitGate'; ACTIVITIES.sitGate(v); return; } // 围满了，回家门口坐着
      if (role === 'storyteller') v.V.claim(v, sq, ['ring1']);
      const seat = take(name);
      if (role === 'storyteller') {
        v.call(() => { v.V.bonfire.lit = true; });
        v.loop = () => { v.seat = seat.seat; v.do(v.rand() < 0.6 ? 'talk' : 'sit', 6, { face: pit }); }; // 站起来比划着讲，讲累了坐下
        v.end = () => { v.seat = null; v.V.release(v); v.V.bonfire.lit = false; };
        return;
      }
      v.loop = () => { if (!seat) { v.do(v.rand() < 0.3 ? 'talk' : kid ? 'squat' : 'idle', 8, { face: pit }); return; } v.seat = seat.seat; v.do(kid && !seat.perch ? 'squat' : 'sit', 8, { face: pit }); };
      return;
    }
    // 看戏 / 开会：台下一圈圈站着、蹲着（小孩挤最里圈），老人坐石桌边，火塘边的石头、石凳也坐人
    v.char.setItem(ev === 'opera' && v.p.item === 'pipe' ? 'pipe' : null);
    const pool = kid && ev === 'opera' ? [...E.front, ...E.rows, ...E.ring] : v.p.age >= 60 ? [...E.elders, ...E.ring, ...E.rows] : [...E.rows, ...E.ring];
    const spot = v.V.claim(v, sq, pool, { ordered: true, strict: true }); // 每人一个位置，不重叠；占满了就不去了
    if (!spot) { v.doing = 'sitGate'; ACTIVITIES.sitGate(v); return; }
    const seat = take(spot);
    const elder = E.elders.includes(spot);
    v.loop = () => {
      if (elder || seat) { v.seat = seat?.seat ?? 0.45; v.do(ev === 'opera' && v.rand() < 0.1 ? 'cheer' : 'sit', 10, { face }); return; }
      const r = v.rand();
      if (ev === 'opera') v.do(kid ? (r < 0.15 ? 'cheer' : 'squat') : r < 0.12 ? 'cheer' : r < 0.4 ? 'talk' : r < 0.6 ? 'squat' : 'idle', 6, { face });
      else v.do(r < 0.08 ? 'talk' : r < 0.6 ? 'squat' : 'idle', 8, { face });
    };
  },

  school(v) {
    const s = v.V.C.school;
    v.char.setItem(v.p.item === 'book' ? 'book' : null);
    v.go(() => s.spot(v.V.claim(v, s, ['seat1', 'seat2', 'seat3', 'seat4', 'seat5'])));
    v.loop = () => { v.seat = 0.5; v.do('sit', 10, { face: s.spot('teach') }); };
    v.end = () => { v.seat = null; v.V.release(v); };
  },

  teach(v) { const s = v.V.C.school; v.char.setItem('book'); v.go(s.spot('teach')); v.loop = () => v.do('talk', 10, { face: s.at(0, 4) }); },

  read(v) { v.char.setItem('book'); v.go((v.p.home === 'school' ? v.home : v.home).spot('yard')); v.loop = () => v.do('idle', 10); },

  play(v) { // 孩子们：围着货郎、追着别的孩子，在村口空场疯跑，去溪边玩水、去地里逮蚂蚱
    v.char.setItem(v.p.item === 'kite' ? 'kite' : null);
    const sq = v.V.C.square;
    v.loop = () => {
      const peddler = v.V.byId.qian_xiaoer;
      if (peddler && !peddler.inside && peddler.state !== 'walk' && peddler.doing === 'peddle' && v.rand() < 0.3) {
        v.go(() => [peddler.pos.x + (v.rand() - 0.5) * 2, peddler.pos.z + 1 + v.rand()], { run: true });
        v.do('idle', 6, { face: [peddler.pos.x, peddler.pos.z] });
        return;
      }
      const mates = v.V.people.filter((o) => o !== v && o.doing === 'play' && !o.inside);
      const r = v.rand();
      if (mates.length && r < 0.3) { // 跟着别的孩子跑
        const m = R(mates);
        v.go(() => [m.pos.x + 0.8, m.pos.z + 0.6], { run: true });
        v.do('idle', 1 + v.rand() * 2);
      } else if (r < 0.55 && v.V.streamBank.length) { // 溪边：蹲着玩水、扔石子
        const [x, z] = R(v.V.streamBank);
        v.go([x, z], { run: true });
        v.do('squat', 5 + v.rand() * 5, { face: [x, z + 3] });
        if (v.rand() < 0.5) v.do('scatter', 2, { face: [x, z + 3] }); // 打水漂
      } else if (r < 0.75 && v.V.playFields.length) { // 地里：在庄稼垄里钻来钻去、蹲下逮蚂蚱
        v.go(R(v.V.playFields), { run: true });
        v.do(v.rand() < 0.5 ? 'squat' : 'idle', 2 + v.rand() * 3);
        v.go(R(v.V.playFields), { run: true });
      } else {
        v.go(sq.randomPoint(sq.playArea), { run: true });
        v.do('idle', 1 + v.rand() * 3);
      }
    };
  },

  chore(v, what) { (ACTIVITIES[what] ?? ACTIVITIES.idle)(v); },

  field(v, node) {
    v.char.setItem(v.p.item === 'pole' ? 'basket' : v.p.item === 'hoe' ? 'hoe' : 'basket');
    const cells = v.V.fields[node] ?? [];
    v.loop = () => { if (cells.length) { v.go(R(cells)); v.do('work', 10); } else v.do('idle', 5); };
  },

  haul(v) { // 挑着谷子往家送
    v.char.setItem('pole');
    v.loop = () => { v.go(R(v.V.fields.fieldE)); v.do('work', 4); v.go(v.home.spot('yard')); v.do('work', 3); };
  },

  thresh(v, arg) {
    const th = v.V.C.threshing;
    if (arg === 'help') {
      v.char.setItem('broom');
      v.go(th.spot('work2'));
      v.loop = () => v.do('work', 8, { face: th.at(0, 0) });
      return;
    }
    const ox = v.V.beasts.find((b) => b.s.role === 'ox');
    v.char.setItem('whip');
    v.go(v.home.spot('manger'));
    v.call(() => { if (ox) ox.follow = v; });
    v.go(th.spot('center'));
    v.call(() => { if (ox) { ox.follow = null; ox.circling = th; } v.V.spin.add('roller'); });
    v.loop = () => v.do('work', 8, { face: th.at(0, 0) });
    v.end = () => { if (ox) { ox.circling = null; if (ox.follow === v) ox.follow = null; } v.V.spin.delete('roller'); };
  },

  oxHome(v) {
    const ox = v.V.beasts.find((b) => b.s.role === 'ox');
    const th = v.V.C.threshing;
    v.char.setItem('whip');
    v.call(() => { if (ox) { ox.circling = null; } });
    v.go(th.spot('center'));
    v.call(() => { if (ox) ox.follow = v; });
    v.go(v.home.spot('manger'));
    v.call(() => { if (ox) ox.follow = null; });
    v.end = () => { if (ox?.follow === v) { ox.follow = null; ox.returning = true; } };
    v.item(v.p.item);
    v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); };
  },

  herd(v) { // 羊倌：开圈，领着羊上山坡吃草
    const sheep = v.V.beasts.filter((b) => b.s.role === 'sheep');
    v.char.setItem('whip');
    v.go(v.home.spot('penGate'));
    v.call(() => sheep.forEach((s, i) => { s.follow = v; s.slot = i; }));
    v.go(R(v.V.pasture));
    v.call(() => sheep.forEach((s) => { s.follow = null; s.graze = [v.pos.x, v.pos.z]; }));
    v.end = () => sheep.forEach((s) => { if (s.follow === v) { s.follow = null; s.graze = [v.pos.x, v.pos.z]; } });
    v.loop = () => { v.do(v.rand() > 0.5 ? 'talk' : 'idle', 12); };
  },

  herdHome(v) {
    const sheep = v.V.beasts.filter((b) => b.s.role === 'sheep');
    v.char.setItem('whip');
    v.call(() => sheep.forEach((s, i) => { s.graze = null; s.follow = v; s.slot = i; }));
    v.go(v.home.spot('penGate'));
    v.call(() => sheep.forEach((s) => { s.follow = null; s.returning = true; s.target = null; })); // 掉队的自己回圈
    v.end = () => sheep.forEach((s) => { if (s.follow === v) { s.follow = null; s.returning = true; s.target = null; } }); // 没赶到家就到点了：羊自己回圈
    v.go(v.home.spot('yard'));
    v.loop = () => v.do('idle', 6);
  },

  grind(v) {
    v.char.setItem('ladle');
    v.go(v.home.spot('mill'));
    v.call(() => { v.V.spin.add('mill'); const d = v.V.beasts.find((b) => b.s.role === 'donkey'); if (d) d.circling = v.home; });
    v.loop = () => v.do('idle', 8, { face: v.home.at(-3.2, 1.6) });
    v.end = () => { v.V.spin.delete('mill'); const d = v.V.beasts.find((b) => b.s.role === 'donkey'); if (d) d.circling = null; };
  },

  boil(v) {
    v.char.setItem('ladle');
    v.go(v.home.spot('stove'));
    v.call(() => v.V.steaming.add(v.home.id));
    v.loop = () => v.do('work', 8, { face: v.home.at(3.6, 0.9) });
    v.end = () => v.V.steaming.delete(v.home.id);
  },

  sellTofu(v) { const sq = v.V.C.square; v.char.setItem('tray'); v.go(sq.spot('tofu')); v.loop = () => v.do(v.rand() > 0.5 ? 'talk' : 'idle', 8); },

  tendBees(v) { v.char.setItem(null); v.go(v.home.spot('bees')); v.loop = () => v.do('work', 8); },

  peddle(v) { // 货郎：挨家挨户在门口停一停
    const stops = ['store', 'headman', 'farmB', 'tofu', 'smith', 'carpenter', 'farmA', 'doctor', 'school', 'farmC'];
    v.char.setItem('pole');
    v.loop = () => { v.go(v.V.C[R(stops)].gateOut()); v.do('talk', 14); };
  },

  peddlerChat(v) {
    const pd = v.V.byId.qian_xiaoer;
    v.go(() => (pd && !pd.inside ? [pd.pos.x + 0.9, pd.pos.z + 0.4] : v.home.spot('yard')));
    v.do('talk', 20, { face: pd ? [pd.pos.x, pd.pos.z] : null });
    v.go(v.home.spot('yard'));
    v.loop = () => v.do('idle', 6);
  },

  deliver(v, who) {
    v.char.setItem('box');
    v.go(v.V.C[who].gateOut());
    v.do('talk', 6);
    v.go(v.home.spot('sweepA'));
    v.item('broom');
    v.loop = () => v.do('idle', 6);
  },

  gatherDucks(v) { // 去溪边把鸭鹅赶回家
    const flock = v.V.beasts.filter((b) => (b.s.role === 'duck' || b.s.role === 'goose') && !b.home);
    const farm = v.V.C.farmC;
    v.char.setItem(v.p.item === 'broom' ? 'broom' : null);
    v.go(v.V.duckWater);
    v.call(() => flock.forEach((b, i) => { b.follow = v; b.slot = i; }));
    v.go(farm.spot('duckHouse'));
    v.call(() => flock.forEach((b) => { b.follow = null; b.home = true; b.object.visible = false; }));
    v.end = () => flock.forEach((b) => { if (b.follow === v) b.follow = null; });
    v.loop = () => { v.go(farm.spot('yard')); v.do('idle', 6); };
  },

  sitGate(v) { // 坐在自家门口的墙根底下，不挡道
    v.char.setItem(v.p.item ?? null);
    const spot = wallSpot(v);
    const [gx, gz] = v.home.gateOut();
    v.go(spot ? spot.at : v.V.nav.nearestFree(gx + 1.2, gz + 0.3));
    v.loop = () => { v.seat = 0.3; v.do('sit', 10, { face: spot ? spot.face : [gx + 1.2, gz + 4] }); };
    v.end = () => { v.seat = null; v.V.release(v); };
  },

  garden(v) { v.char.setItem('hoe'); v.go(v.home.spot('garden')); v.loop = () => v.do('work', 8); },

  lightTorches(v) { // 小六子挨个把路口的火把点着
    v.char.setItem(null);
    const order = [...v.V.torches].sort((a, b) => Math.hypot(a.pos[0] - v.pos.x, a.pos[1] - v.pos.z) - Math.hypot(b.pos[0] - v.pos.x, b.pos[1] - v.pos.z));
    for (const tr of order) {
      v.go(v.V.nav.nearestFree(tr.pos[0] + 0.5, tr.pos[1] + 0.5));
      v.do('work', 1.5, { face: tr.pos });
      v.call(() => { tr.lit = true; });
    }
    v.loop = () => { v.go(v.V.C.store.spot('sweepA')); v.do('idle', 6); };
  },
};

// ---------------------------------------------------------------- 动物

// 会拱门的牲口，以及每次挑新去处时溜出院子转一圈的概率
const PUSHERS = { dog: 0.12, pig: 0.05, sheep: 0.04, donkey: 0.03, ox: 0.02 };
const SPEED = { dog: 1.5, dogBlack: 1.4, cat: 0.8, hen: 0.5, henBrown: 0.5, rooster: 0.5, duck: 0.5, goose: 0.45, pig: 0.35, sheep: 0.55, donkey: 0.7, ox: 0.6, magpie: 3, pigeon: 0 };

class Beast {
  constructor(s, V, c, rand) {
    this.s = s;
    this.V = V;
    this.c = c; // 所属院子（院外的动物为 null）
    this.rand = rand;
    if (!V.frameCache.has(s.kind)) V.frameCache.set(s.kind, voxelAnimalFrames(s.kind, V.M));
    this.object = new THREE.Group();
    this.frames = V.frameCache.get(s.kind).map((m) => { const k = m.clone(); this.object.add(k); return k; });
    V.root.add(this.object);
    this.speed = SPEED[s.kind] ?? 0.5;
    this.swim = s.role === 'duck' || s.role === 'goose';
    this.push = s.role in PUSHERS && !!c; // 能把关着的门拱开（但不会关）
    this.pos = new THREE.Vector3();
    this.heading = rand() * Math.PI * 2;
    this.phase = rand() * 10;
    this.path = null;
    this.wait = rand() * 3;
    this.perch = 0;
    this.reset();
  }

  /** 新的一天：回到白天的位置。 */
  reset() {
    const s = this.s;
    this.follow = null; this.circling = null; this.graze = null; this.home = false; this.target = null; this.path = null; this.stroll = null; this.returning = false;
    this.object.visible = true;
    if (s.perches) { this.perch = Math.floor(this.rand() * s.perches.length); this.flight = null; return; }
    if (s.role === 'pigeon') return;
    const p = this.areaPoint() ?? (this.c ? this.c.at(0, 0) : [0, 0]);
    this.pos.set(p[0], 0, p[1]);
  }

  areaPoint() {
    if (this.s.worldArea) return this.V.nav.randomIn(this.s.worldArea, (x, z) => [x, z], this.rand, this.swim);
    if (!this.s.area || !this.c) return null;
    return this.V.nav.randomIn(this.s.area, (x, z) => this.c.at(x, z), this.rand, this.swim);
  }

  /** 正前方 0.6 米、左右 0.35 米以内的人。 */
  personAhead(ux, uz) {
    for (const o of this.V.people) {
      if (o.inside || o.perched || o === this.follow || o === this.lure || o.p.id === this.s.owner) continue; // 跟着的、喂食的、主人不用绕
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z, fwd = dx * ux + dz * uz;
      if (fwd > 0.05 && fwd < 0.6 && Math.abs(-dx * uz + dz * ux) < 0.35) return o;
    }
    return null;
  }

  /** 找一条路（会拱门的把门当路）。离家远时搜全图；困在和村子不连通的小角落里就近跳出来。 */
  plan(tx, tz) {
    const nav = this.V.nav, inDoor = nav.door[nav.index(this.pos.x, this.pos.z)] > 0; // 门关上时正站在门洞里：允许挤回去
    const opts = { swim: this.swim, person: this.push || inDoor };
    let path = nav.find(this.pos.x, this.pos.z, tx, tz, { ...opts, maxNodes: 8000 });
    if (!path && Math.hypot(tx - this.pos.x, tz - this.pos.z) > 6 && !(this.lostFor > 0)) {
      path = nav.find(this.pos.x, this.pos.z, tx, tz, { ...opts, maxNodes: Infinity });
      if (!path) {
        this.lostFor = 10; // 10 秒内别再搜全图
        for (let r = 0.25; r <= 2; r += 0.25) for (let a = 0; a < 16; a++) {
          const x = this.pos.x + Math.cos(a * 0.3927) * r, z = this.pos.z + Math.sin(a * 0.3927) * r;
          if (nav.freeAt(x, z, this.swim) && nav.reachable(x, z)) { this.pos.x = x; this.pos.z = z; this.lostFor = 0; return nav.find(x, z, tx, tz, { ...opts, maxNodes: Infinity }) ?? []; }
        }
      }
    }
    return path ?? [];
  }

  /**
   * 朝 (tx, tz) 走一帧，到了返回 true。
   * 换了目标才判断一次"能不能直着走"，不能就 A*，然后沿着这条路走完（以前每帧都重判，拐角处在直走 / 绕路之间来回切，一抖一抖的）；
   * 一帧的步长用完为止，路过拐点不停顿；擦着墙角就只沿 x 或 z 滑过去；真卡住 0.8 秒就重新找路。
   */
  moveTo(tx, tz, dt, speed = this.speed) {
    const nav = this.V.nav;
    if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.08) { this.path = null; this.pathFor = null; return true; }
    const key = `${Math.round(tx * 2)},${Math.round(tz * 2)}`; // 跟着人走时目标一直在动：半米以内算同一个目标
    if (this.pathFor !== key || !this.path) {
      this.pathFor = key;
      this.path = nav.line(this.pos.x, this.pos.z, tx, tz, this.swim, this.push || nav.door[nav.index(this.pos.x, this.pos.z)] > 0) ? [[tx, tz]] : this.plan(tx, tz);
      this.stuck = 0;
    } else if (this.path.length === 1) this.path[0] = [tx, tz];
    if (!this.path.length) { this.pathFor = null; return true; }
    if (this.steered) { // 刚才绕人偏出了路线，直着回不去就重新找路
      this.steered = false;
      if (!nav.line(this.pos.x, this.pos.z, ...this.path[0], this.swim, this.push)) { this.path = this.plan(...this.path[this.path.length - 1]); if (!this.path.length) return true; }
    }
    let budget = speed * dt, moved = false;
    while (budget > 1e-4 && this.path.length) {
      const [nx, nz] = this.path[0];
      const ex = nx - this.pos.x, ez = nz - this.pos.z, e = Math.hypot(ex, ez);
      if (e < 0.02) { this.path.shift(); continue; }
      if (this.push) { // 前面是关着的门：拿头拱开，门就这么敞着
        const door = nav.closedDoorAt(this.pos.x + (ex / e) * 0.3, this.pos.z + (ez / e) * 0.3);
        if (door) { door.ajar = true; this.heading = Math.atan2(-ez, ex); this.moving = false; return false; }
      }
      // 路上有人：从离他远的那一侧绕过去；绕不过去，同向就放慢跟着，否则站一下（等久了才挤过去）
      let ux = ex / e, uz = ez / e, steer = false;
      const o = this.squeeze > 0 ? null : this.personAhead(ux, uz);
      if (o) {
        const lat = -(o.pos.x - this.pos.x) * uz + (o.pos.z - this.pos.z) * ux;
        const sd = lat > 0 ? -1 : 1, mx = ux - uz * sd * 1.1, mz = uz + ux * sd * 1.1, m = Math.hypot(mx, mz);
        if (nav.freeAt(this.pos.x + (mx / m) * 0.35, this.pos.z + (mz / m) * 0.35, this.swim)) { ux = mx / m; uz = mz / m; steer = true; this.steered = true; }
        else if (o.tasks[0]?.type === 'go' && Math.sin(o.heading) * ux + Math.cos(o.heading) * uz > 0.3) budget = Math.min(budget, o.speed * dt * 0.95);
        else break;
      }
      const step = steer ? budget : Math.min(e, budget);
      const px = this.pos.x + ux * step, pz = this.pos.z + uz * step;
      this.heading = Math.atan2(-uz, ux);
      if (nav.freeAt(px, pz, this.swim) || !nav.freeAt(this.pos.x, this.pos.z, this.swim)) {
        this.pos.x = px; this.pos.z = pz; budget -= step; moved = true;
        if (steer) break;
        if (step >= e) this.path.shift();
        continue;
      }
      if (nav.freeAt(px, this.pos.z, this.swim)) { this.pos.x = px; moved = true; } // 擦着墙角：只沿一根轴滑
      else if (nav.freeAt(this.pos.x, pz, this.swim)) { this.pos.z = pz; moved = true; }
      break;
    }
    this.stuck = moved ? 0 : (this.stuck ?? 0) + dt;
    if (this.stuck > 0.8) { this.path = null; this.stuck = 0; this.squeeze = 1.2; } // 真卡住了：重新找路，这一阵子顾不上让人，挤过去
    this.moving = moved;
    if (this.path && !this.path.length) { this.path = null; this.pathFor = null; return true; } // 走完了（终点是离目标最近的能站的地方）
    return false;
  }


  update(t, dt, hour) {
    const s = this.s, V = this.V;
    this.moving = false;
    this.lostFor = (this.lostFor ?? 0) - dt;
    this.squeeze = (this.squeeze ?? 0) - dt;
    let y = null;
    if (s.perches) { y = this.perchUpdate(t, dt); }
    else if (s.role === 'pigeon') {
      const roost = hour > 16.5 && hour < 18 && V.C.school;
      const a = t * 0.35 + s.offset;
      const [rx, rz] = roost ? V.C.school.at(-3 + s.offset * 2, -2.9) : [s.cx + Math.cos(a) * s.r, s.cz + Math.sin(a) * s.r * 0.6];
      const ry = roost ? V.C.school.level + 6.35 : s.y + Math.sin(t * 1.3 + s.offset);
      this.pos.x += (rx - this.pos.x) * Math.min(1, dt * 1.5);
      this.pos.z += (rz - this.pos.z) * Math.min(1, dt * 1.5);
      y = (this.py ?? ry) + (ry - (this.py ?? ry)) * Math.min(1, dt * 1.5);
      this.py = y;
      this.heading = roost ? 0 : Math.atan2(-Math.cos(a), -Math.sin(a));
      this.moving = !roost || Math.hypot(rx - this.pos.x, rz - this.pos.z) > 0.3;
    } else if (this.home) { this.object.visible = false; return; }
    else this.behave(t, dt, hour);

    if (y === null) y = this.swim && V.nav.water[V.nav.index(this.pos.x, this.pos.z)] ? WATER_Y - 3 * VOX + (Math.floor(t * 1.5 + this.phase) % 2) * VOX : V.nav.heightAt(this.pos.x, this.pos.z) + 0.03;
    present(this, dt, y);
    this.object.rotation.z = this.pecking ? (Math.floor(t * 4 + this.phase) % 2 ? -0.35 : 0) : 0;
    const f = this.moving ? Math.floor(t * 7 + this.phase) % this.frames.length : 0;
    this.frames.forEach((m, i) => { m.visible = i === f; });
  }

  behave(t, dt, hour) {
    const s = this.s, V = this.V;
    this.pecking = false;
    // 1. 跟着人走（羊跟羊倌、牛跟主人、鸭鹅被赶回家）——排成一串，各自有位置
    if (this.follow) {
      const f = this.follow;
      const k = this.slot ?? 0;
      const back = 1.2 + (k % 4) * 0.6 + Math.floor(k / 4) * 0.7, side = ((k % 3) - 1) * 0.7;
      const hx = Math.sin(f.heading), hz = Math.cos(f.heading);
      this.moveTo(f.pos.x - hx * back + hz * side, f.pos.z - hz * back - hx * side, dt, this.speed * 1.6);
      return;
    }
    // 2. 绕着碾子 / 石磨转
    if (this.circling) {
      const c = this.circling, m = s.role === 'ox' ? c.roller : this.s.mill;
      const a = t * (s.role === 'ox' ? 0.2 : 0.35);
      const [x, z] = c.at(m.cx + Math.cos(a) * m.r, m.cz + Math.sin(a) * m.r);
      const [x2, z2] = c.at(m.cx + Math.cos(a + 0.1) * m.r, m.cz + Math.sin(a + 0.1) * m.r);
      if (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.6) { this.moveTo(x, z, dt, this.speed * 1.5); return; }
      this.pos.x = x; this.pos.z = z;
      this.heading = Math.atan2(-(z2 - z), x2 - x);
      this.moving = true;
      return;
    }
    // 3. 有人喂食：围过去
    const lure = V.attract.get(`${this.c?.id}:${s.role}`);
    this.lure = lure;
    if (lure && !lure.inside) {
      const tx = s.trough ? this.c.at(...s.trough) : [lure.pos.x, lure.pos.z];
      if (!this.lureAt) this.lureAt = [tx[0] + (this.rand() - 0.5) * 2.2, tx[1] + (this.rand() - 0.5) * 2.2];
      if (this.moveTo(...V.nav.nearestFree(...this.lureAt), dt, this.speed * 1.8)) this.pecking = true;
      return;
    }
    this.lureAt = null;
    // 4. 天黑了回窝
    if (s.role === 'chicken' && hour > 19.5 && s.coop) { if (this.moveTo(...this.c.at(...s.coop), dt)) { this.home = true; } return; }
    // 5. 狗跟主人出门
    if (s.role === 'dog' && s.owner) {
      const o = V.byId[s.owner];
      if (o && !o.inside && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) > 2.5 && o.state === 'walk') {
        this.moveTo(o.pos.x - Math.sin(o.heading) * 1.2, o.pos.z - Math.cos(o.heading) * 1.2, dt, this.speed);
        return;
      }
    }
    // 6. 平时：在自己的地盘里溜达、停下、低头吃。会拱门的偶尔拱开院门溜出去，在门外转两圈再自己回来
    if (!this.target) {
      this.wait -= dt;
      this.pecking = s.role === 'chicken' || s.role === 'sheep' || s.role === 'pig';
      if (this.wait > 0) return;
      if (this.push && !this.stroll && !this.returning && !this.graze && hour < 19.6 && this.c.gates.length && this.rand() < PUSHERS[s.role]) this.stroll = { left: 2 + Math.floor(this.rand() * 3) };
      if (this.stroll && (this.stroll.left-- <= 0 || hour >= 19.6)) { this.stroll = null; this.returning = true; }
      if (this.stroll) {
        const [gx, gz] = this.c.gateOut();
        const t = V.nav.nearestFree(gx + (this.rand() - 0.5) * 5, gz + (this.rand() - 0.5) * 5);
        this.target = V.nav.reachable(...t) ? t : [gx, gz];
      } else if (this.graze) { // 吃草：在羊倌附近挑一块走得到的草地
        const g = V.nav.nearestFree(this.graze[0] + (this.rand() - 0.5) * 8, this.graze[1] + (this.rand() - 0.5) * 8);
        this.target = V.nav.reachable(...g) ? g : V.nav.nearestFree(...this.graze);
      } else this.target = this.areaPoint();
      this.wait = 1.5 + this.rand() * 5;
      if (!this.target) return;
    }
    if (this.moveTo(this.target[0], this.target[1], dt)) { this.target = null; if (!this.stroll) this.returning = false; }
  }

  /** 猫、喜鹊：蹲在高处，隔一阵跳 / 飞到另一个高处（抛物线）。 */
  perchUpdate(t, dt) {
    const s = this.s, c = this.c;
    const P = (i) => { const [x, y, z] = s.perches[i]; const [wx, wz] = c.at(x, z); return [wx, c.level + y, wz]; };
    if (!this.flight) {
      const [x, y, z] = P(this.perch);
      this.pos.set(x, 0, z);
      this.wait -= dt;
      if (this.wait <= 0 && s.perches.length > 1) {
        const next = (this.perch + 1 + Math.floor(this.rand() * (s.perches.length - 1))) % s.perches.length;
        this.flight = { from: P(this.perch), to: P(next), k: 0, next };
        this.wait = 15 + this.rand() * 25;
      }
      this.heading = this.phase;
      this.pecking = Math.sin(t * 0.7 + this.phase) > 0.8;
      return y;
    }
    const f = this.flight;
    const dist = Math.hypot(f.to[0] - f.from[0], f.to[2] - f.from[2]);
    f.k += dt * (s.role === 'bird' ? 3 : 1.6) / Math.max(1, dist * 0.4);
    const k = Math.min(1, f.k);
    this.pos.set(f.from[0] + (f.to[0] - f.from[0]) * k, 0, f.from[2] + (f.to[2] - f.from[2]) * k);
    this.heading = Math.atan2(-(f.to[2] - f.from[2]), f.to[0] - f.from[0]);
    this.moving = true;
    const yy = f.from[1] + (f.to[1] - f.from[1]) * k + Math.sin(k * Math.PI) * (s.role === 'bird' ? 3 : 1.2);
    if (k >= 1) { this.perch = f.next; this.flight = null; }
    return yy;
  }
}

/**
 * 放人放动物。V：村子上下文（M、root、nav、C、nodes、fields、pasture、torches、well …）。
 * 返回 { people, beasts, clock, update(t, dt), cookingAt(homeId), insideCount(homeId) }。
 */
export function populate(V, residents, extraAnimals, startHour, forcedEvent = null) {
  const rand = makeRng(2024);
  V.frameCache = new Map();
  V.attract = new Map();
  V.cooking = new Set();
  V.steaming = new Set();
  V.spin = new Set();
  V.stats = { madeWay: 0, detours: 0 };
  const claims = new Map(); // 公共位置有人占了就换一个
  V.claim = (v, c, names, { ordered = false, strict = false } = {}) => { // ordered：从前往后占（里圈先坐满）；strict：占满了返回 null，不跟人挤
    const mine = claims.get(v);
    if (mine && names.includes(mine.name) && mine.c === c) return mine.name;
    const taken = new Set([...claims.entries()].filter(([o, x]) => o !== v && x.c === c).map(([, x]) => x.name));
    const free = names.filter((n) => !taken.has(n));
    if (!free.length && strict) return null;
    const name = free.length ? (ordered ? free[0] : free[Math.floor(v.rand() * free.length)]) : names[Math.floor(v.rand() * names.length)];
    claims.set(v, { c, name });
    return name;
  };
  V.release = (v) => claims.delete(v);
  V.claimed = (v) => claims.get(v)?.name;
  V.people = residents.map((p) => new Villager(p, V, rand));
  V.byId = Object.fromEntries(V.people.map((v) => [v.p.id, v]));
  V.beasts = [
    ...Object.values(V.C).flatMap((c) => c.animals.map((s) => new Beast(s, V, c, rand))),
    ...extraAnimals.map((s) => new Beast(s, V, null, rand)),
  ];
  const clock = new Clock(startHour);
  let lastDay = clock.day;
  V.clockDay = () => clock.day;
  V.event = () => forcedEvent ?? EVENTS[(clock.day - 1) % EVENTS.length]; // 头一天唱戏，第二天篝火，第三天开会……
  return {
    people: V.people,
    beasts: V.beasts,
    clock,
    event: () => V.event(),
    update(t, dt) {
      clock.update(dt);
      if (clock.day !== lastDay) { // 新的一天：火把熄了，动物回到白天的位置，人从屋里出来
        lastDay = clock.day;
        for (const tr of V.torches) tr.lit = false;
        for (const b of V.beasts) b.reset();
        for (const g of V.nav.gates) g.ajar = false;
        for (const v of V.people) { v.entry = -1; v.inside = true; v.lift = 0; v.perched = false; v.down = null; const [dx, dz] = V.nav.nearestFree(...v.bed.door('house')); v.pos.set(dx, 0, dz); }
      }
      if (clock.hour > 19.25 && clock.hour < DAY_END + 1) for (const tr of V.torches) tr.lit = true; // 兜底：过了七点一刻还没点的，算别人顺手点了
      for (const v of V.people) v.update(t, dt, clock.hour);
      for (const b of V.beasts) b.update(t, dt, clock.hour);
    },
    insideCount: (id) => V.people.filter((v) => v.inside && (v.p.sleepAt ?? v.p.home) === id).length,
  };
}
