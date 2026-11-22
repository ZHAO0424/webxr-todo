// 掌心气象台 · 龙卷风搬东西：把脚下表层的沙、土卷进漏斗带着走，一路往外甩、散的时候全撒下来（纯数据，Node 里能测）
//
// 每个旋风身上带一份"货"（load）：
//   - 卷：脚下一圈（半径 PICK_R）格子表层的沙、土按速度往上卷，货满了（CAP）就不再卷；还没长大的小苗连根拔起带走。
//   - 甩：一边走一边从漏斗边上往外甩一点（落在 1.5–3 cm 外）；
//   - 散：旋风没了，剩下的货在最后的位置周围 2–4 cm 撒一圈落下来，小苗落在能长的地方重新扎根。
// 所以东西是真的从一处搬到了另一处，总量守恒（甩出岛外的除外）。
//
// 用法：stepWhirl(wh, m, dt, rnd)（m = matter.js 的物质格；wh 需要 x、z）；旋风消失前调 dropAll(wh, m, rnd)。
//   读 wh.load = { sand, soil }、wh.sprouts（卷着的小苗数）画漏斗里的碎块。

import { MG, MC, index } from './matter.js';

export const PICK_R = MC * 1.6;     // 卷起的范围（漏斗脚下）
export const CAP = 0.015;           // 一阵旋风最多卷多少（物质格的"厚度×格"单位，≈一小堆沙）
const RATE = { sand: 0.003, soil: 0.0015 };   // 每秒每格最多卷起多少厚（沙轻，土沉一点）
const SHED = 0.12;                  // 每秒往外甩掉货的多少

export function stepWhirl(wh, m, dt, rnd = Math.random) {
  wh.load ??= { sand: 0, soil: 0 }; wh.sprouts ??= 0;
  const ld = wh.load, i0 = Math.floor((wh.x + 0.17) / MC), j0 = Math.floor((wh.z + 0.17) / MC), rr = Math.ceil(PICK_R / MC);
  // 卷
  for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= MG || j >= MG) continue;
    if (Math.hypot(di, dj) * MC > PICK_R) continue;
    const k = j * MG + i; if (!m.kind[k] || m.water[k] > 0.0008) continue;   // 水里卷不起土
    for (const f of ['sand', 'soil']) {
      const room = CAP - ld.sand - ld.soil; if (room <= 0) break;
      const c = Math.min(m[f][k], RATE[f] * dt, room); if (c <= 0) continue;
      m[f][k] -= c; ld[f] += c;
    }
  }
  // 小苗连根拔起
  for (let s = m.saplings.length - 1; s >= 0; s--) { const sp = m.saplings[s]; if (!sp.grown && Math.hypot(sp.x - wh.x, sp.z - wh.z) < PICK_R) { m.saplings.splice(s, 1); wh.sprouts++; } }
  // 甩
  const a = rnd() * Math.PI * 2, d = 0.015 + rnd() * 0.015;
  shed(m, ld, SHED * dt, wh.x + Math.cos(a) * d, wh.z + Math.sin(a) * d);
}

function shed(m, ld, frac, x, z) {
  const k = index(x, z);
  for (const f of ['sand', 'soil']) { const c = ld[f] * Math.min(1, frac); if (c <= 0) continue; ld[f] -= c; if (k >= 0 && m.kind[k]) m[f][k] += c; }   // 甩出岛外的就没了
}

export function dropAll(wh, m, rnd = Math.random) {
  const ld = wh.load; if (!ld) return;
  for (let n = 0; n < 12; n++) { const a = n / 12 * Math.PI * 2 + rnd() * 0.4, d = 0.02 + rnd() * 0.02; shed(m, ld, 1 / (12 - n), wh.x + Math.cos(a) * d, wh.z + Math.sin(a) * d); }
  for (let n = 0; n < (wh.sprouts || 0); n++) {
    const a = rnd() * Math.PI * 2, d = 0.015 + rnd() * 0.025, x = wh.x + Math.cos(a) * d, z = wh.z + Math.sin(a) * d, k = index(x, z);
    if (k >= 0 && (m.kind[k] === 1 || m.kind[k] === 3 || m.kind[k] === 4) && m.lava[k] < 0.0003 && m.saplings.length < 80) { m.saplings.push({ x, z, g: 0, t: 0 }); m.events.push({ type: 'sapling', x, z }); }
  }
  wh.sprouts = 0;
}
