import * as THREE from 'three';
import { block } from './pixel.js';
import { BOUNDS, streamZ, STREAM_HALF, WATER_Y } from './layout.js';

/*
 * 山地地形：高度场 → 梯田 → 挖院子平台 → 修台阶路 → 一次性生成网格。
 *
 * 高度场按 0.5 米一格采样。自然地面按 1.2 米一级取整，坡地自然变成一层层梯田，
 * 落差处的侧面就是毛石堰；院子平台取中心高度压平，背后切出护坡；
 * 路沿线性插值的高度按 0.3 米取整，于是爬坡的地方自动变成一级级台阶。
 */

const CELL = 0.5;
const TERRACE = 1.2;
const STAIR = 0.3;
const PATH_HALF = 1.0;
const BASE = -3;

const GRASS = 0, FIELD = 1, PATH = 2, PAD = 3, STREAM = 4;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 原始地形高度（米）：北高南低 + 东西山梁 + 起伏；小溪以南是一条矮河滩。 */
export function rawHeight(x, z) {
  const zs = streamZ(x);
  if (z > zs + STREAM_HALF) return 0.5 + Math.min(1.0, (z - zs - STREAM_HALF) * 0.18) + 0.25 * Math.sin(x * 0.3);
  const north = Math.max(0, zs - STREAM_HALF - z);
  let h = north * 0.17 + (north / 66) ** 2 * 4;
  h += 6.5 * smooth(18, 44, Math.abs(x)) * (0.55 + 0.45 * Math.sin(z * 0.07 + x * 0.02));
  h += 0.9 * Math.sin(x * 0.17 + z * 0.11) + 0.6 * Math.sin(x * 0.05 - z * 0.19 + 1.3);
  return Math.max(0.3, h);
}

export const padLevel = (x, z) => Math.max(0.6, Math.round(rawHeight(x, z) / 0.6) * 0.6);

/** 点到线段的距离和投影参数。 */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return { d: Math.hypot(px - ax - t * dx, pz - az - t * dz), t };
}

/** 点是否在转过角度的矩形里（rect: x, z, rot 弧度, w, d, pad 额外外扩）。 */
function inRect(px, pz, r, grow = 0) {
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  const dx = px - r.x, dz = pz - r.z;
  const lx = c * dx - s * dz, lz = s * dx + c * dz;
  return Math.abs(lx) <= r.w / 2 + grow && Math.abs(lz) <= r.d / 2 + grow;
}

/**
 * pads: [{ x, z, rot(弧度), w, d, level }]；nodes: { 名字: { x, z, h } }；edges: [[a, b]]。
 * 返回 { object, heightAt, walkAt, isWater, fieldSpots, bridge }。
 */
export function buildTerrain(M, { pads, nodes, edges, aprons = [] }) {
  const { x0, z0, x1, z1 } = BOUNDS;
  const NX = Math.round((x1 - x0) / CELL), NZ = Math.round((z1 - z0) / CELL);
  const H = new Float32Array(NX * NZ);
  const T = new Uint8Array(NX * NZ);
  const walk = new Float32Array(NX * NZ).fill(NaN);
  const crop = new Uint8Array(NX * NZ);
  const best = new Float32Array(NX * NZ).fill(Infinity);
  const cx = (i) => x0 + (i + 0.5) * CELL;
  const cz = (j) => z0 + (j + 0.5) * CELL;
  const id = (i, j) => j * NX + i;

  // 1. 自然地面 → 梯田；小溪
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = cx(i), z = cz(j);
    const k = id(i, j);
    if (Math.abs(z - streamZ(x)) < STREAM_HALF) { T[k] = STREAM; H[k] = WATER_Y; continue; }
    H[k] = Math.max(0, Math.floor(rawHeight(x, z) / TERRACE) * TERRACE);
    T[k] = GRASS;
  }
  // 2. 院子平台
  for (const p of pads) for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = id(i, j);
    if (T[k] !== STREAM && inRect(cx(i), cz(j), p, 0.55)) { H[k] = p.level; T[k] = PAD; } // 外扩一格，墙脚所在的格子也算平台
  }
  // 3. 路：高度沿线插值，按台阶取整；过小溪的地方变成桥（行走高度单独记）
  let bridge = null;
  for (const [a, b] of edges) {
    const A = nodes[a], B = nodes[b];
    const crossing = { minT: 1, maxT: 0 };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = cx(i), z = cz(j);
      if (x < Math.min(A.x, B.x) - 2 || x > Math.max(A.x, B.x) + 2 || z < Math.min(A.z, B.z) - 2 || z > Math.max(A.z, B.z) + 2) continue;
      const { d, t } = segDist(x, z, A.x, A.z, B.x, B.z);
      if (d > PATH_HALF) continue;
      const k = id(i, j);
      if (T[k] === PAD && pads.some((p) => inRect(x, z, p, 0.45))) continue; // 平台（含墙脚所在的格子）不动，再往外让给路
      const h = Math.round((A.h + (B.h - A.h) * t) / STAIR) * STAIR;
      if (T[k] === STREAM) { crossing.minT = Math.min(crossing.minT, t); crossing.maxT = Math.max(crossing.maxT, t); continue; }
      if (d < best[k]) { best[k] = d; H[k] = h; T[k] = PATH; }
    }
    if (crossing.maxT > crossing.minT) { // 石拱桥
      const deck = Math.max(A.h, B.h) + 0.3; // 比岸高一级台阶
      const tm = (crossing.minT + crossing.maxT) / 2;
      bridge = { x: A.x + (B.x - A.x) * tm, z: A.z + (B.z - A.z) * tm, rot: Math.atan2(B.x - A.x, B.z - A.z), deck, len: (crossing.maxT - crossing.minT) * Math.hypot(B.x - A.x, B.z - A.z) + 1.4 };
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const k = id(i, j);
        if (T[k] !== STREAM) continue;
        const { d } = segDist(cx(i), cz(j), A.x, A.z, B.x, B.z);
        if (d <= PATH_HALF + 0.2) walk[k] = deck;
      }
    }
  }
  // 3b. 门前平台：从院门往外铺到门外的路网节点，和院里一样高（压过相邻平台的边）——
  //     门口、门外节点、从节点出发的路三者高度一致，门口不会是一道坎
  for (const a of aprons) {
    const len = Math.hypot(a.x1 - a.x0, a.z1 - a.z0);
    const ux = (a.x1 - a.x0) / len, uz = (a.z1 - a.z0) / len;
    const h1 = a.h1 ?? a.h0;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = cx(i), z = cz(j);
      const along = (x - a.x0) * ux + (z - a.z0) * uz, across = Math.abs(-(x - a.x0) * uz + (z - a.z0) * ux);
      if (along < 0.05 || along > len || across > a.w / 2) continue;
      const k = id(i, j);
      if (T[k] === STREAM) continue;
      H[k] = Math.round((a.h0 + (h1 - a.h0) * (along / len)) / STAIR) * STAIR;
      T[k] = PATH;
    }
  }

  // 4. 离院子远的坡地种庄稼：每一级梯田一种（麦茬 / 谷子 / 玉米地 / 菜地）
  const fieldSpots = [], fieldCells = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = id(i, j);
    if (T[k] !== GRASS) continue;
    const x = cx(i), z = cz(j);
    if (pads.some((p) => inRect(x, z, p, 4))) continue;
    const wild = Math.sin(x * 0.13 + 2) * Math.sin(z * 0.11) > 0.35; // 留几片荒坡
    if (wild || H[k] < 1) continue;
    T[k] = FIELD;
    crop[k] = (((Math.round(H[k] / TERRACE) + Math.floor(x / 22)) % 4) + 4) % 4; // x 为负时取模会得负数
    fieldCells.push({ x, z, h: H[k], crop: crop[k] });
    if ((i + j * 7) % 97 === 0) fieldSpots.push({ x, z });
  }

  // 5. 生成网格：每格一个顶面；邻格更低就补侧面（落差大 = 毛石堰，小 = 台阶 / 土坎）
  const buckets = new Map();
  const bucket = (mat) => {
    if (!buckets.has(mat)) buckets.set(mat, { mat, pos: [], nor: [], uv: [], idx: [] });
    return buckets.get(mat);
  };
  const quad = (mat, v, n, uv) => {
    const b = bucket(mat);
    const base = b.pos.length / 3;
    for (let q = 0; q < 4; q++) { b.pos.push(...v[q]); b.nor.push(...n); b.uv.push(...uv[q]); }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const CROPS = [M.stubble, M.millet, M.cornfield, M.veg];
  const topMat = (k) => [M.grass, CROPS[crop[k]], M.street, M.street, M.water][T[k]];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = id(i, j);
    const h = H[k];
    const ax = x0 + i * CELL, bx = ax + CELL, az = z0 + j * CELL, bz = az + CELL;
    quad(topMat(k), [[ax, h, az], [ax, h, bz], [bx, h, bz], [bx, h, az]], [0, 1, 0], [[ax, az], [ax, bz], [bx, bz], [bx, az]]);
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj;
      const edge = ni < 0 || nj < 0 || ni >= NX || nj >= NZ;
      const hn = edge ? BASE : H[id(ni, nj)];
      if (hn >= h - 1e-4) continue;
      const drop = h - hn;
      const mat = edge ? (T[k] === STREAM ? M.water : M.soil) : T[k] === PATH && drop < 0.61 ? M.stone : drop >= 0.6 ? M.rubble : M.soil;
      let e0, e1;
      if (di === 1) { e0 = [bx, bz]; e1 = [bx, az]; }
      else if (di === -1) { e0 = [ax, az]; e1 = [ax, bz]; }
      else if (dj === 1) { e0 = [ax, bz]; e1 = [bx, bz]; }
      else { e0 = [bx, az]; e1 = [ax, az]; }
      const u0 = di ? e0[1] : e0[0], u1 = di ? e1[1] : e1[0];
      quad(mat, [[e0[0], hn, e0[1]], [e1[0], hn, e1[1]], [e1[0], h, e1[1]], [e0[0], h, e0[1]]], [di, 0, dj], [[u0, hn], [u1, hn], [u1, h], [u0, h]]);
    }
  }
  const g = new THREE.Group();
  for (const b of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setIndex(b.idx);
    const m = new THREE.Mesh(geo, b.mat);
    m.receiveShadow = true;
    m.castShadow = b.mat !== M.water;
    g.add(m);
  }
  g.add(block(x0 - 0.8, BASE - 0.8, z0 - 0.8, x1 + 0.8, BASE, z1 + 0.8, M.trayWood));

  const cellOf = (x, z) => id(Math.min(NX - 1, Math.max(0, Math.floor((x - x0) / CELL))), Math.min(NZ - 1, Math.max(0, Math.floor((z - z0) / CELL))));
  return {
    object: g,
    bridge,
    fieldSpots,
    fieldCells,
    heightAt: (x, z) => H[cellOf(x, z)],
    /** 走路的高度：桥面上用桥面高度。 */
    walkAt: (x, z) => { const k = cellOf(x, z); return Number.isNaN(walk[k]) ? H[k] : walk[k]; },
    isWater: (x, z) => { const k = cellOf(x, z); return T[k] === STREAM && Number.isNaN(walk[k]); },
    /** 'grass' | 'field' | 'path' | 'pad' | 'stream' */
    typeAt: (x, z) => ['grass', 'field', 'path', 'pad', 'stream'][T[cellOf(x, z)]],
    water: M.tex.water,
  };
}
