import * as THREE from 'three';
import { WATER_Y } from '../layout.js';
import { voxelAnimalFrames, VOX } from '../voxel.js';
import { present } from './motion.js';
import { animalInfo } from '../animalInfo.js';

// ---------------------------------------------------------------- 动物

// 会拱门的牲口，以及每次挑新去处时溜出院子转一圈的概率
const PUSHERS = { dog: 0.12, pig: 0.05, sheep: 0.04, donkey: 0.03, ox: 0.02 };
const SPEED = { boar: 0.55, dog: 1.5, dogBlack: 1.4, cat: 0.8, hen: 0.5, henBrown: 0.5, rooster: 0.5, duck: 0.5, goose: 0.45, pig: 0.35, sheep: 0.55, donkey: 0.7, ox: 0.6, magpie: 3, pigeon: 0 };

export class Beast {
  constructor(s, V, c, rand) {
    this.s = s;
    this.V = V;
    this.c = c; // 所属院子（院外的动物为 null）
    this.rand = rand;
    if (!V.frameCache.has(s.kind)) V.frameCache.set(s.kind, voxelAnimalFrames(s.kind, V.M));
    this.object = new THREE.Group();
    this.frames = V.frameCache.get(s.kind).map((m) => { const k = m.clone(); this.object.add(k); return k; });
    V.root.add(this.object);
    this.info = animalInfo(s, c); // 名字、品种、谁家的、来历（卡片用）
    this.object.userData.beast = this;
    this.speed = SPEED[s.kind] ?? 0.5;
    this.swim = s.role === 'duck' || s.role === 'goose';
    this.hop = this.swim; // 鸭鹅能扑腾着跳上 / 跳下一人来高的坎
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
    if (s.caravan) { this.home = true; this.object.visible = false; return; } // 骡帮的骡子：平常在山外，逢集才跟着来（activities.js 的 caravan）
    this.jump = null;
    if (s.perches) { const rest = s.perches.map((p, i) => i).filter((i) => s.perches[i][3] !== 'pass'); this.perch = rest[Math.floor(this.rand() * rest.length)]; this.flight = null; return; }
    if (s.role === 'pigeon') return;
    const p = this.areaPoint() ?? (this.c ? this.c.at(0, 0) : [0, 0]);
    this.pos.set(p[0], 0, p[1]);
  }

  areaPoint() {
    if (this.s.worldArea) return this.V.nav.randomIn(this.s.worldArea, (x, z) => [x, z], this.rand, this.swim, this.s.reach);
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
    const opts = { swim: this.swim, person: this.push || inDoor, hop: this.hop };
    const tk = `${Math.round(tx * 2)},${Math.round(tz * 2)}`;
    if (this.lostFor > 0 && this.lostKey === tk) return []; // 刚找过、这个目标走不到：10 秒内别再找（不然每帧都搜一遍全图，很卡）
    let path = nav.find(this.pos.x, this.pos.z, tx, tz, { ...opts, maxNodes: 8000 });
    if (!path && Math.hypot(tx - this.pos.x, tz - this.pos.z) > 6 && !(this.lostFor > 0)) {
      path = nav.find(this.pos.x, this.pos.z, tx, tz, { ...opts, maxNodes: Infinity });
      if (!path) {
        this.lostFor = 10; // 10 秒内别再搜全图
        for (let r = 0.25; r <= 2; r += 0.25) for (let a = 0; a < 16; a++) {
          const x = this.pos.x + Math.cos(a * 0.3927) * r, z = this.pos.z + Math.sin(a * 0.3927) * r;
          if (nav.freeAt(x, z, this.swim) && nav.reachable(x, z)) {
            this.pos.x = x; this.pos.z = z; this.lostFor = 0;
            const p2 = nav.find(x, z, tx, tz, { ...opts, maxNodes: Infinity });
            if (!p2) { this.lostFor = 10; this.lostKey = tk; }
            return p2 ?? [];
          }
        }
      }
    }
    if (!path) { this.lostFor = Math.max(this.lostFor ?? 0, 10); this.lostKey = tk; }
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
      this.path = nav.line(this.pos.x, this.pos.z, tx, tz, this.swim, this.push || nav.door[nav.index(this.pos.x, this.pos.z)] > 0) ? [[tx, tz]] : this.plan(tx, tz); // 直线只认不跳坎的；要跳就走 A*（跳的次数最少）
      this.stuck = 0;
    } else if (this.path.length === 1) this.path[0] = [tx, tz];
    if (!this.path.length) { this.pathFor = null; return true; }
    if (this.steered) { // 刚才绕人偏出了路线，直着回不去就重新找路
      this.steered = false;
      if (!nav.line(this.pos.x, this.pos.z, ...this.path[0], this.swim, this.push) && !(this.hop && nav.line(this.pos.x, this.pos.z, ...this.path[0], this.swim, false, true) && nav.hops(this.pos.x, this.pos.z, ...this.path[0]) <= 1)) { this.path = this.plan(...this.path[this.path.length - 1]); if (!this.path.length) return true; }
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
        const sx = this.pos.x + (mx / m) * 0.35, sz = this.pos.z + (mz / m) * 0.35;
        if (nav.freeAt(sx, sz, this.swim) && Math.abs(nav.heightAt(sx, sz) - nav.heightAt(this.pos.x, this.pos.z)) <= 0.36) { ux = mx / m; uz = mz / m; steer = true; this.steered = true; } // 绕人也不能一步跨下坎（猪、狗以前会被挤到下一级梯田上回不来）
        else if (o.tasks[0]?.type === 'go' && Math.sin(o.heading) * ux + Math.cos(o.heading) * uz > 0.3) budget = Math.min(budget, o.speed * dt * 0.95);
        else break;
      }
      const step = steer ? budget : Math.min(e, budget);
      const px = this.pos.x + ux * step, pz = this.pos.z + uz * step;
      this.heading = Math.atan2(-uz, ux);
      if (this.hop && !steer && nav.freeAt(px, pz, this.swim) && nav.isHop(this.pos.x, this.pos.z, px, pz)) { this.startJump(ux, uz); moved = true; break; } // 到坎边了：扑腾着跳过去
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


  /** 鸭鹅跳坎：从坎边起跳，落到坎那边 0.45 米处，抛物线（往上跳弧线高一些）。 */
  startJump(ux, uz) {
    const nav = this.V.nav, h0 = nav.heightAt(this.pos.x, this.pos.z);
    let d = 0.1;
    while (d < 1 && !nav.isHop(this.pos.x, this.pos.z, this.pos.x + ux * d, this.pos.z + uz * d)) d += 0.05; // 坎在前面多远
    let tx = this.pos.x + ux * (d + 0.45), tz = this.pos.z + uz * (d + 0.45);
    if (!nav.freeAt(tx, tz, this.swim) || Math.abs(nav.heightAt(tx, tz) - nav.heightAt(this.pos.x + ux * d, this.pos.z + uz * d)) > 0.36) { tx = this.pos.x + ux * d; tz = this.pos.z + uz * d; } // 落脚处不平：就落在坎沿上
    const y0 = this.y ?? h0, y1 = this.yAt(tx, tz), up = Math.max(0, y1 - y0);
    this.V.stats.duckHops++;
    this.jump = { from: [this.pos.x, y0, this.pos.z], to: [tx, y1, tz], k: 0, lift: 0.25 + up * 0.6, dur: 0.45 + Math.abs(y1 - y0) * 0.25 };
  }

  yAt(x, z) { const nav = this.V.nav; return this.swim && nav.water[nav.index(x, z)] ? (this.V.waterY?.(x, z) ?? WATER_Y) - 3 * VOX : nav.heightAt(x, z) + 0.03; }

  update(t, dt, hour) {
    const s = this.s, V = this.V;
    this.moving = false;
    if (this.jump) { // 跳坎中：只管把这一跳跳完
      const j = this.jump;
      j.k = Math.min(1, j.k + dt / j.dur);
      this.pos.x = j.from[0] + (j.to[0] - j.from[0]) * j.k;
      this.pos.z = j.from[2] + (j.to[2] - j.from[2]) * j.k;
      const y = j.from[1] + (j.to[1] - j.from[1]) * j.k + Math.sin(j.k * Math.PI) * j.lift;
      if (j.k >= 1) this.jump = null;
      this.y = y;
      present(this, dt, y);
      this.object.rotation.z = 0;
      this.frames.forEach((m, i) => { m.visible = i === 1 % this.frames.length; }); // 张着翅膀那一帧
      return;
    }
    this.lostFor = (this.lostFor ?? 0) - dt;
    this.squeeze = (this.squeeze ?? 0) - dt;
    let y = null;
    if (s.perches) { y = this.perchUpdate(t, dt); }
    else if (s.role === 'pigeon') {
      const roost = ((hour > 16.5 && hour < 18) || hour >= 19.5 || hour < 6) && V.C.school; // 傍晚、夜里落在学堂屋脊上
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

    if (y === null) y = this.swim && V.nav.water[V.nav.index(this.pos.x, this.pos.z)] ? (V.waterY?.(this.pos.x, this.pos.z) ?? WATER_Y) - 3 * VOX + (Math.floor(t * 1.5 + this.phase) % 2) * VOX : V.nav.heightAt(this.pos.x, this.pos.z) + 0.03;
    this.y = y;
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
      if (!this.lureAt) this.lureAt = s.trough ? this.c.at(s.trough[0] + (this.rand() - 0.5) * 1.4, s.trough[1] - 0.45) : [tx[0] + (this.rand() - 0.5) * 2.2, tx[1] + (this.rand() - 0.5) * 2.2]; // 有食槽的（猪）：凑到槽里边这一侧，不会跑到圈外
      if (this.moveTo(...V.nav.nearestFree(...this.lureAt), dt, this.speed * 1.8)) this.pecking = true;
      return;
    }
    this.lureAt = null;
    // 4. 天黑了回窝
    if (s.role === 'chicken' && (hour > 19.5 || hour < 5.5 || V.weather() === 'rain') && s.coop) { if (this.moveTo(...this.c.at(...s.coop), dt)) this.home = true; return; } // 天黑、下雨回窝
    // 5. 狗跟主人出门
    if (s.role === 'dog' && s.owner) {
      const o = V.byId[s.owner];
      if (o && !o.inside) {
        const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
        const [hx, hz] = this.c.at(0, 0);
        const away = Math.hypot(o.pos.x - hx, o.pos.z - hz) > 8; // 主人出了自家院子（看戏、赶集、下地……）
        if (d > 3 || (away && d > 1.4)) { this.moveTo(o.pos.x - Math.sin(o.heading) * 1.2, o.pos.z - Math.cos(o.heading) * 1.2, dt, this.speed); return; }
        if (away) { this.pecking = false; return; } // 到了就在主人脚边待着
      }
    }
    // 6. 平时：在自己的地盘里溜达、停下、低头吃。会拱门的偶尔拱开院门溜出去，在门外转两圈再自己回来
    if (!this.target) {
      this.wait -= dt;
      this.pecking = s.role === 'chicken' || s.role === 'sheep' || s.role === 'pig';
      if (this.wait > 0) return;
      if (this.push && !this.stroll && !this.returning && !this.graze && hour > 6.5 && hour < 19.6 && V.weather() !== 'rain' && this.c.gates.length && this.rand() < PUSHERS[s.role]) this.stroll = { left: 2 + Math.floor(this.rand() * 3) };
      if (this.stroll && (this.stroll.left-- <= 0 || hour >= 19.6 || hour < 6.5)) { this.stroll = null; this.returning = true; }
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
    const P = (i) => { const [x, y, z] = s.perches[i]; const [wx, wz] = c ? c.at(x, z) : [x, z]; return [wx, (c ? c.level : 0) + y, wz]; }; // 院外的（老村址树上的喜鹊）：落脚点就是沙盘坐标
    if (!this.flight) {
      const [x, y, z] = P(this.perch);
      this.pos.set(x, 0, z);
      this.wait -= dt;
      const hops = s.hops?.[this.perch] ?? []; // 只往跳得过去的高处跳（见 audit.js 的 snapPerches），弧线高到越过中间的屋顶
      if (this.wait <= 0 && hops.length) {
        const { j, lift } = hops[Math.floor(this.rand() * hops.length)];
        this.flight = { from: P(this.perch), to: P(j), k: 0, next: j, lift };
        this.wait = s.perches[j][3] === 'pass' ? 0.6 + this.rand() * 1.2 : 15 + this.rand() * 25; // 'pass'：路过的落脚点，站一下就走
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
    const yy = f.from[1] + (f.to[1] - f.from[1]) * k + Math.sin(k * Math.PI) * f.lift;
    if (k >= 1) { this.perch = f.next; this.flight = null; }
    return yy;
  }
}
