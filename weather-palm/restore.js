// 掌心气象台 · 破坏 → 重建：记下岩浆、火毁掉过哪些格子，算"恢复了多少"（纯数据，Node 里能测）
//
// 一格被岩浆盖过、或烧过，就记成"伤疤"。伤疤格什么时候算恢复：
//   露在最上面的是石头（冷岩浆、没风化、也没铺土）→ 没恢复；
//   上面铺了土（倒土、或石头泡水风化出来的）→ 土上的草长够了（grass > 0.6）才算；
//   石头都没了 → 那一格的植被长回来了（green > 0.55，由外面给：sim 的 G）。
// 全部伤疤都恢复 → 发 restored 事件，伤疤清空（下一次破坏重新算）。
//
// 用法：const r = createRestore()；每 0.1 s stepRestore(r, m, { green(x,z) })；读 r.pct（0–1）、r.scars（伤疤格数）。
// 事件放在 r.events：healed（一格刚恢复，给画面冒一圈绿光）/ restored（全部恢复）。

import { MG, center } from './matter.js';

const ROCK_BARE = 0.0002, SOIL_COVER = 0.0002;

export function createRestore() {
  return { scar: new Uint8Array(MG * MG), healed: new Uint8Array(MG * MG), scars: 0, pct: 1, events: [] };
}

export function healthy(m, k, green) {
  if (m.lava[k] > 1e-5 || m.fire[k] > 0) return false;
  if (m.soil[k] >= SOIL_COVER) return m.grass[k] > 0.6;
  if (m.rock[k] + m.glass[k] > ROCK_BARE) return false;
  return green(...center(k % MG, (k / MG) | 0)) > 0.55;
}

export function stepRestore(r, m, env = {}) {
  const green = env.green || (() => 0), n = MG * MG;
  let scars = 0, ok = 0;
  for (let k = 0; k < n; k++) {
    if (!m.kind[k]) continue;
    if (!r.scar[k] && (m.lava[k] > 1e-4 || m.fire[k] > 0)) { r.scar[k] = 1; r.healed[k] = 0; }
    if (!r.scar[k]) continue;
    scars++;
    const h = healthy(m, k, green);
    if (h) { ok++; if (!r.healed[k]) { r.healed[k] = 1; r.events.push({ type: 'healed', k, x: center(k % MG, (k / MG) | 0)[0], z: center(k % MG, (k / MG) | 0)[1] }); } }
    else r.healed[k] = 0;
  }
  r.scars = scars; r.pct = scars ? ok / scars : 1;
  if (scars && ok === scars) { r.events.push({ type: 'restored', scars }); r.scar.fill(0); r.healed.fill(0); r.scars = 0; r.pct = 1; }
}
