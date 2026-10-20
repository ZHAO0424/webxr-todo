import * as THREE from 'three';

/*
 * 一天的光：午后 → 黄昏 → 掌灯 → 夜里（月光）。返回太阳、天光、天空色带和"夜色程度" night（0 白天 … 1 深夜）。
 * 村里的钟走到 21 点以后是夜里快进，快到第二天 15 点前一刻钟迅速转亮。
 */

const KEYS = [
  { h: 15, sun: '#ffe6c0', si: 3.0, pos: [-0.6, 0.8, 0.25], sky: '#b8c0e8', gnd: '#8a6a5a', hi: 1.6, night: 0,
    bands: ['#6a8ac8', '#7e9ad0', '#94acd6', '#aabcd8', '#c0cad6', '#d4d4d0', '#e4dac8', '#eedcc0', '#f4e0bc'] },
  { h: 17.5, sun: '#ffb27a', si: 3.4, pos: [-0.8, 0.42, 0.12], sky: '#8a84c8', gnd: '#6a4250', hi: 1.5, night: 0,
    bands: ['#1e1d44', '#2e2a5c', '#4a3a74', '#6e4a84', '#9a5a88', '#c86a7e', '#ea8a6e', '#f8ac6c', '#ffcc84'] },
  { h: 19, sun: '#ff7040', si: 1.3, pos: [-0.9, 0.16, 0.1], sky: '#5a5098', gnd: '#3a2a40', hi: 1.0, night: 0.65,
    bands: ['#12122e', '#1a183c', '#26204a', '#382656', '#50305e', '#6e3a5e', '#8a4a5a', '#a05a52', '#b06a4e'] },
  { h: 20.3, sun: '#8090d0', si: 0.45, pos: [0.4, 0.7, -0.3], sky: '#2e3468', gnd: '#1a1426', hi: 0.6, night: 1,
    bands: ['#080a1c', '#0c0e24', '#10142c', '#141a34', '#18203c', '#1c2442', '#202848', '#242c4c', '#283050'] },
];

const ca = new THREE.Color(), cb = new THREE.Color();
const lerpHex = (a, b, k) => `#${ca.set(a).lerp(cb.set(b), k).getHexString()}`;

export function daylight(hour) {
  let h = hour;
  if (h >= 21) h = h < 38.75 ? 20.3 + (h - 21) * 0.0001 : 20.3 + (h - 38.75) * -21.2; // 夜里停在夜色，天亮前一刻钟迅速回到午后
  let a = KEYS[0], b = KEYS[0], k = 0;
  if (h <= KEYS[0].h) { a = b = KEYS[0]; }
  else if (h >= KEYS.at(-1).h && hour < 38.75) { a = b = KEYS.at(-1); }
  else if (hour >= 38.75) { a = KEYS.at(-1); b = KEYS[0]; k = Math.min(1, (hour - 38.75) / 0.25); }
  else for (let i = 0; i < KEYS.length - 1; i++) if (h >= KEYS[i].h && h < KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; k = (h - a.h) / (b.h - a.h); }
  return {
    sun: lerpHex(a.sun, b.sun, k),
    sunIntensity: a.si + (b.si - a.si) * k,
    sunPos: a.pos.map((v, i) => v + (b.pos[i] - v) * k),
    sky: lerpHex(a.sky, b.sky, k),
    ground: lerpHex(a.gnd, b.gnd, k),
    hemiIntensity: a.hi + (b.hi - a.hi) * k,
    night: a.night + (b.night - a.night) * k,
    bands: a.bands.map((c, i) => lerpHex(c, b.bands[i], k)),
  };
}
