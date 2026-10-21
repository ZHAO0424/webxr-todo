import * as THREE from 'three';
import { BOUNDS } from './layout.js';

/*
 * 导航网格（防穿模）。0.25 米一格，覆盖整个村子。
 *
 * 一格能不能站人：
 *   - 不在障碍物里：房子、墙、栅栏、石台、树干……都按网格的真实朝向投影上来（转过角度的院子也准）；
 *   - 不是水（桥面除外）。
 * 两格之间能不能走：高差 ≤ 0.35 米（石台阶一级 0.3 米能上，1.2 米的梯田石堰上不去）。
 * 找路用 A*：8 邻域、不切墙角；路面最省力，草地稍费劲，庄稼地尽量绕开。
 *
 * 门：院门、栅栏门所在的格子是"门格子"。门关着时动物过不去（鸡、猪、羊就被关在院里、圈里）；
 * 人可以把门推开——找路时当它能走，真走到门前先停下等门开（见 life/villager.js）。
 */

const CELL = 0.25;
const STEP = 0.36;
const COST = { path: 1, pad: 1, grass: 1.4, field: 3, stream: 1 };

export class NavGrid {
  constructor(terrain) {
    const { x0, z0, x1, z1 } = BOUNDS;
    this.x0 = x0; this.z0 = z0;
    this.nx = Math.round((x1 - x0) / CELL);
    this.nz = Math.round((z1 - z0) / CELL);
    const n = this.nx * this.nz;
    this.h = new Float32Array(n);
    this.cost = new Float32Array(n);
    this.blocked = new Uint8Array(n);
    this.water = new Uint8Array(n);
    this.door = new Int16Array(n); // 0 = 不是门；i+1 = 第 i 扇门
    this.gates = [];
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const k = j * this.nx + i, x = this.cx(i), z = this.cz(j);
      this.h[k] = terrain.walkAt(x, z);
      this.water[k] = terrain.isWater(x, z) ? 1 : 0;
      this.cost[k] = COST[terrain.typeAt(x, z)] ?? 1.4;
    }
  }

  cx(i) { return this.x0 + (i + 0.5) * CELL; }
  cz(j) { return this.z0 + (j + 0.5) * CELL; }
  index(x, z) {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  /** 把一个物体（Mesh）在地面附近的部分投影成障碍。matrix = 物体到村子坐标的变换；pad = 外扩（人的半径）。 */
  blockMesh(mesh, matrix, groundAt, pad = 0.15) {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox;
    const corner = new THREE.Vector3();
    let minY = Infinity, maxY = -Infinity;
    for (let c = 0; c < 8; c++) {
      corner.set(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z).applyMatrix4(matrix);
      minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
    }
    if (maxY - minY < STEP - 0.02) return; // 地面、台基、台阶这种矮东西，人能踩上去
    const p = new THREE.Vector3();
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    const nx = Math.max(2, Math.ceil(sx / 0.1)), nz = Math.max(2, Math.ceil(sz / 0.1));
    for (let a = 0; a <= nx; a++) for (let c = 0; c <= nz; c++) {
      p.set(b.min.x + (sx * a) / nx, (b.min.y + b.max.y) / 2, b.min.z + (sz * c) / nz).applyMatrix4(matrix);
      const ground = groundAt(p.x, p.z);
      if (minY > ground + 0.6 || maxY < ground + STEP) continue; // 悬在头顶上（屋顶）或太矮（台基、台阶）
      this.blockDisc(p.x, p.z, pad);
    }
  }

  /** 圆里的格子（不改障碍，只返回下标）。 */
  discCells(x, z, r) {
    const out = [];
    for (let dz = -r; dz <= r + 1e-6; dz += CELL / 2) for (let dx = -r; dx <= r + 1e-6; dx += CELL / 2) {
      if (dx * dx + dz * dz > r * r + 1e-6) continue;
      const k = this.index(x + dx, z + dz);
      if (k >= 0) out.push(k);
    }
    return out;
  }

  blockDisc(x, z, r) {
    for (let dz = -r; dz <= r + 1e-6; dz += CELL / 2) for (let dx = -r; dx <= r + 1e-6; dx += CELL / 2) {
      if (dx * dx + dz * dz > r * r + 1e-6) continue;
      const k = this.index(x + dx, z + dz);
      if (k >= 0) this.blocked[k] = 1;
    }
    const k = this.index(x, z);
    if (k >= 0) this.blocked[k] = 1;
  }

  /**
   * 登记一扇门：中心 (x, z)，门洞宽 w，墙的走向转角 rot。门洞里的格子清掉障碍、标成门格子。
   * 返回门的状态对象 { open: 0..1 }。
   */
  addDoor(x, z, w, rot) {
    const state = { open: 0 };
    this.gates.push(state);
    const id = this.gates.length;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let a = -w / 2 + 0.15; a <= w / 2 - 0.15; a += CELL / 2) for (let b = -0.45; b <= 0.45; b += CELL / 2) {
      const k = this.index(x + c * a + s * b, z - s * a + c * b);
      if (k >= 0) { this.door[k] = id; this.blocked[k] = 0; }
    }
    return state;
  }

  /** 这格能站吗。swim = 鸭鹅，可以下水；person = 人，关着的门也算能走（会推开）。 */
  free(k, swim = false, person = false) {
    if (k < 0 || this.blocked[k] || (!swim && this.water[k])) return false;
    return person || !this.door[k] || this.gates[this.door[k] - 1].open > 0.8;
  }
  freeAt(x, z, swim = false, person = false) { return this.free(this.index(x, z), swim, person); }
  heightAt(x, z) { const k = this.index(x, z); return k >= 0 ? this.h[k] : 0; }
  /** 这儿是不是一扇还没开的门（人走到这儿要等）。 */
  closedDoorAt(x, z) { const k = this.index(x, z); return k >= 0 && this.door[k] > 0 && this.gates[this.door[k] - 1].open < 0.8 ? this.gates[this.door[k] - 1] : null; }

  step(a, b, swim, person) { return this.free(b, swim, person) && Math.abs(this.h[a] - this.h[b]) <= STEP; }

  /** 最近的能站的格（找不到就原样返回）。 */
  nearestFree(x, z, swim = false, maxR = 4, person = false) {
    if (this.freeAt(x, z, swim, person)) return [x, z];
    for (let r = CELL; r <= maxR; r += CELL) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (this.freeAt(px, pz, swim, person) && !this.door[this.index(px, pz)]) return [px, pz];
      }
    }
    return [x, z];
  }

  /** 两点间直线能不能走（每 0.1 米采样一次，检查能站 + 高差）。 */
  line(ax, az, bx, bz, swim = false, person = false) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.1));
    let prev = this.index(ax, az);
    for (let s = 1; s <= n; s++) {
      const k = this.index(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n);
      if (k !== prev) { if (!this.step(prev, k, swim, person)) return false; prev = k; }
    }
    return true;
  }

  /** A* 找路，返回拉直后的折线 [[x,z], …]（不含起点）；找不到返回 null。 */
  find(ax, az, bx, bz, { swim = false, person = false, maxNodes = 60000, avoid = null } = {}) {
    if (avoid?.length) { // 临时障碍（挡路的人）：标成堵住再找，找完还原
      const was = avoid.map((k) => this.blocked[k]);
      for (const k of avoid) this.blocked[k] = 1;
      try { return this.find(ax, az, bx, bz, { swim, person, maxNodes }); } finally { avoid.forEach((k, i) => { this.blocked[k] = was[i]; }); }
    }
    [bx, bz] = this.nearestFree(bx, bz, swim, 4, person);
    let start = this.index(ax, az);
    if (!this.free(start, swim, person)) { const [fx, fz] = this.nearestFree(ax, az, swim, 4, person); start = this.index(fx, fz); }
    const goal = this.index(bx, bz);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [[bx, bz]];
    const gi = goal % this.nx, gj = Math.floor(goal / this.nx);
    const g = new Map([[start, 0]]), came = new Map();
    const open = new Heap();
    const hfun = (k) => { const di = Math.abs((k % this.nx) - gi), dj = Math.abs(Math.floor(k / this.nx) - gj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    open.push(start, hfun(start));
    const closed = new Set();
    let found = false;
    while (open.size && closed.size < maxNodes) {
      const k = open.pop();
      if (k === goal) { found = true; break; }
      if (closed.has(k)) continue;
      closed.add(k);
      const i = k % this.nx, j = Math.floor(k / this.nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.nx || nj >= this.nz) continue;
        const n = nj * this.nx + ni;
        if (closed.has(n) || !this.step(k, n, swim, person)) continue;
        if (di && dj && (!this.step(k, j * this.nx + ni, swim, person) || !this.step(k, nj * this.nx + i, swim, person))) continue; // 不切墙角
        const c = g.get(k) + (di && dj ? 1.414 : 1) * this.cost[n] + Math.abs(this.h[n] - this.h[k]) * 2;
        if (c < (g.get(n) ?? Infinity)) { g.set(n, c); came.set(n, k); open.push(n, c + hfun(n)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== start; k = came.get(k)) cells.push(k);
    cells.reverse();
    // 拉直：从当前点能直接走到的最远一格
    const pts = cells.map((k) => [this.cx(k % this.nx), this.cz(Math.floor(k / this.nx))]);
    pts[pts.length - 1] = [bx, bz];
    const out = [];
    let cur = [this.cx(start % this.nx), this.cz(Math.floor(start / this.nx))];
    let idx = 0;
    while (idx < pts.length) {
      let far = idx;
      for (let t = pts.length - 1; t > idx; t--) if (this.line(cur[0], cur[1], pts[t][0], pts[t][1], swim, person)) { far = t; break; }
      out.push(pts[far]);
      cur = pts[far];
      idx = far + 1;
    }
    return out;
  }

  /** 在矩形区域里随机找一格能站的点（矩形可以带转角，用 toWorld 把本地坐标变到世界）。 */
  /** 从村里走得到这儿吗（没算连通区域之前一律算能）。 */
  reachable(x, z) { const k = this.index(x, z); return !this.reach || (k >= 0 && this.reach[k] === 1); }

  randomIn(area, toWorld, rand, swim = false) {
    const [x0, z0, x1, z1] = area;
    for (let tries = 0; tries < 30; tries++) {
      const [x, z] = toWorld(x0 + rand() * (x1 - x0), z0 + rand() * (z1 - z0));
      if (this.freeAt(x, z, swim) && (swim || this.reachable(x, z))) return [x, z];
    }
    return null;
  }
}

class Heap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    let i = k.length;
    k.push(key); p.push(pri);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] <= pri) break;
      k[i] = k[up]; p[i] = p[up]; i = up;
    }
    k[i] = key; p[i] = pri;
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && p[c + 1] < p[c]) c++;
        if (p[c] >= lp) break;
        k[i] = k[c]; p[i] = p[c]; i = c;
      }
      k[i] = lk; p[i] = lp;
    }
    return top;
  }
}
