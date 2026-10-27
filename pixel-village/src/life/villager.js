import * as THREE from 'three';
import { voxelCharacter } from '../voxel.js';
import { present } from './motion.js';
import { ACTIVITIES } from './activities.js';
import { EVENTS, eventNow, joinEvent } from './events.js';
import { variant } from './variety.js';

/*
 * 村民：按日程到点切换活动；每个活动是一串任务（走过去、干活 / 坐 / 蹲 / 说话、进屋、触发事件、爬上台子）。
 * 走路：导航网格 A*；路上有人就超车 / 擦肩 / 请他让一让 / 绕路；站着的人之间互相让开一点。
 */

// ---------------------------------------------------------------- 村民


/** 地里的活（下雨天干这些的披蓑衣、戴斗笠）。 */
const FIELD_WORK = new Set(['field', 'sow', 'plowHoe', 'weed', 'reapWheat', 'reap', 'pickCorn', 'haulManure', 'garden']);

export class Villager {
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
    this.entry = null; // 还没派过活（不能是 -1：-1 表示"还没到第一项日程"，第一次派活会被当成没变而跳过）
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
  back(name) { this.tasks.push({ type: 'call', fn: () => this.char.setBack(name) }); } // 背上背的东西（背篓、柴捆、麦个子、粮袋）
  /** 走直线爬上 / 下到导航网格管不到的地方（戏台台阶、石凳）。pts：[[x, z, 离地高], …]，down：下来时怎么走。 */
  climb(pts, down) {
    this.tasks.push({ type: 'climb', pts: pts.map((q) => [...q]) });
    this.call(() => { this.perched = true; this.down = down; });
  }

  /** 到点了：按日程换活动。 */
  /**
   * 到点了：按日程换活动。今天村里的活动（时间窗里、自己要去的）优先；临时差事（剃头……）办完之前不换，
   * 除非到了睡觉的点。
   */
  schedule(hour) {
    const day = this.p.day;
    let idx = -1;
    for (let i = 0; i < day.length; i++) if (hour >= day[i][0] + (this.phase - 3) * 0.02) idx = i;
    const ev = idx < 0 ? null : eventNow(this, hour);
    const key = ev ? `event:${ev}` : idx;
    if (this.errand && idx >= 0) return;
    if (key === this.entry) return;
    // 活动前后赶路：去参加活动的（开场后半小时内）、刚散场往回走的（散场后 25 分钟内）都快步走
    const wasEvent = typeof this.entry === 'string' && this.entry.startsWith('event:');
    if (ev) this.rushUntil = Math.max(hour, EVENTS[ev].from) + 0.5;
    else if (wasEvent) this.rushUntil = hour + 0.4;
    this.entry = key;
    this.reset();
    this.errand = null;
    if (this.inside) { this.inside = false; this.object.visible = true; }
    if (idx < 0) { this.inside = true; this.object.visible = false; return; }
    if (ev) { joinEvent(this, ev); return; }
    const [name, arg] = variant(this, day[idx][1], day[idx][2], this.V.clockDay(), idx); // 天气、放假、隔三差五的事
    this.doing = name;
    (ACTIVITIES[name] ?? ACTIVITIES.idle)(this, arg);
  }

  /** 收拾手头的事：清掉任务；在台上 / 凳上的先下来。 */
  reset() {
    this.end?.();
    this.end = null;
    this.char.setBack(null); // 换活了：背上的东西放下
    this.tasks = [];
    this.loop = null;
    this.seat = null;
    if (this.down) {
      this.tasks.push({ type: 'climb', pts: this.down });
      this.call(() => { this.perched = false; this.lift = 0; });
      this.down = null;
    }
  }

  /** 临时差事：放下手头不要紧的事去办（剃头……），办完调 finish() 回到日程。 */
  interrupt(name, arg) {
    if (this.inside) { this.inside = false; this.object.visible = true; }
    this.reset();
    this.errand = name;
    this.errandText = null; // 卡片上写的具体差事（"去赵家豆腐坊买豆腐"），差事自己填
    this.doing = name;
    ACTIVITIES[name](this, arg);
  }

  /** 差事办完 / 活动提前散了：下一帧按日程重新派活。 */
  finish() { this.errand = null; this.errandText = null; this.entry = undefined; this.tasks = []; this.loop = null; }

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
    this.schedule(hour); // 日程排满一整天：第一项之前、最后一项（回屋）之后都在屋里睡觉
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
    // 下雨天在外头：手上空着就撑一把油纸伞（干活、坐着时收起来）
    const gear = this.V.weather() === 'rain' && !this.inside && FIELD_WORK.has(this.doing); // 冒雨下地：披蓑衣、戴斗笠，不打伞
    this.char.setRain(gear);
    const wet = !gear && this.V.weather() === 'rain' && !this.inside && !['work', 'sit', 'squat', 'fiddle', 'shave', 'strop', 'bow', 'scatter', 'wash'].includes(this.state);
    if (wet && !this.char.item) { this.char.setItem('umbrella'); this.umbrella = true; }
    else if (this.umbrella && !wet) { if (this.char.item === 'umbrella') this.char.setItem(null); this.umbrella = false; }
    this.char.pose(this.state, t, this.phase, { seat: this.seat ?? 0.45, cadence: this.state === 'walk' && this.hurry ? 1.4 : 1 });
    if (this.state !== 'walk') this.hurry = false;
  }

  /** 手里提的灯笼亮不亮（打更）：挂一个跟着人走的光晕。 */
  glow(on) {
    if (on && !this.halo) {
      this.halo = new THREE.Sprite(this.V.M.haloSprite);
      this.halo.scale.set(2.4, 2.4, 1);
      this.halo.position.set(0.25, 1.0, 0.3);
      this.object.add(this.halo);
    }
    if (this.halo) this.halo.visible = on;
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
    // 远途（剩下的路超过 12 米）快步走：速度 1.4 倍，步子也迈得快（不会像在地上滑）
    let left = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    for (let i = 1; i < task.path.length && left < 12; i++) left += Math.hypot(task.path[i][0] - task.path[i - 1][0], task.path[i][1] - task.path[i - 1][1]);
    this.hurry = !run && (left >= 12 || (this.rushUntil > this.V.hour() && left > 3)); // 远途，或者赶着去 / 散了往回走
    let step = this.speed * (run ? 1.8 : this.hurry ? 1.4 : 1) * dt;
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
        const oWalking = o.tasks[0]?.type === 'go'; // 在路上的（哪怕这会儿停下来让人）都算在走，不当成站着挡路的
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
        } else if (oWalking) { // 迎面、窄路上错不开：id 大的往旁边横跨一步让路（跨不开就站一下）
          if (this.p.id > o.p.id) {
            const lat = -(o.pos.x - this.pos.x) * nz + (o.pos.z - this.pos.z) * nx, sd = lat > 0 ? -1 : 1;
            const sx = this.pos.x - nz * sd * step, sz = this.pos.z + nx * sd * step;
            const k0 = nav.index(this.pos.x, this.pos.z), k1 = nav.index(sx, sz);
            if (nav.free(k1, false, true) && (k0 === k1 || nav.step(k0, k1, false, true))) { this.pos.x = sx; this.pos.z = sz; task.steered = true; this.wait += dt; return; }
            this.pause = 0.3; this.wait += dt; this.state = 'idle'; if (this.wait > 1.5) this.passing = 1.0; return;
          }
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
