import * as THREE from 'three';

/*
 * 一天的光：深夜（月光）→ 拂晓 → 日出 → 上午 → 正午 → 午后 → 黄昏 → 掌灯 → 深夜。
 * 返回太阳、天光、天空色带和"夜色程度" night（0 白天 … 1 深夜；窗户、灯笼、火把、萤火虫都看它）。
 * 太阳早上在东边（+x），傍晚落到西边（-x）。午后到掌灯这几档是整个画面的主色调（参考戴夫的黄昏）。
 */

const NIGHT = { sun: '#8090d0', si: 0.45, pos: [0.4, 0.7, -0.3], sky: '#2e3468', gnd: '#1a1426', hi: 0.6, night: 1,
  bands: ['#080a1c', '#0c0e24', '#10142c', '#141a34', '#18203c', '#1c2442', '#202848', '#242c4c', '#283050'] };

const KEYS = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT },
  { h: 5.5, sun: '#c890b0', si: 0.9, pos: [0.9, 0.12, 0.2], sky: '#6a6aa8', gnd: '#3a3048', hi: 0.9, night: 0.6, // 拂晓：东边泛粉紫
    bands: ['#1a1e48', '#2a2c5c', '#40386c', '#5c4678', '#7a5480', '#9a6684', '#ba7c86', '#d49488', '#e8ac8c'] },
  { h: 6.4, sun: '#ffb890', si: 2.2, pos: [0.85, 0.3, 0.2], sky: '#9aa4d8', gnd: '#6a5058', hi: 1.3, night: 0.08, // 日出
    bands: ['#5a78b8', '#7088c0', '#8a98c4', '#a6a8c4', '#c2b6c0', '#dac2b8', '#ecccae', '#f6d4a8', '#fcdca4'] },
  { h: 8.5, sun: '#fff0d8', si: 2.8, pos: [0.6, 0.7, 0.3], sky: '#a8c0ec', gnd: '#7a6a5a', hi: 1.6, night: 0, // 上午
    bands: ['#5a86d0', '#6a94d6', '#7ea4da', '#94b4de', '#aac2e0', '#bccde0', '#ccd6dc', '#d8dcd6', '#e2e0d0'] },
  { h: 12, sun: '#fff6e8', si: 3.1, pos: [0.05, 1, 0.35], sky: '#b4c8f0', gnd: '#8a7462', hi: 1.7, night: 0, // 正午
    bands: ['#5a8ad6', '#6898da', '#7aa6de', '#8eb4e2', '#a2c0e4', '#b4cae4', '#c4d2e2', '#d0d8de', '#dadcd8'] },
  { h: 15, sun: '#ffe6c0', si: 3.0, pos: [-0.6, 0.8, 0.25], sky: '#b8c0e8', gnd: '#8a6a5a', hi: 1.6, night: 0,
    bands: ['#6a8ac8', '#7e9ad0', '#94acd6', '#aabcd8', '#c0cad6', '#d4d4d0', '#e4dac8', '#eedcc0', '#f4e0bc'] },
  { h: 17.5, sun: '#ffb27a', si: 3.4, pos: [-0.8, 0.42, 0.12], sky: '#8a84c8', gnd: '#6a4250', hi: 1.5, night: 0,
    bands: ['#1e1d44', '#2e2a5c', '#4a3a74', '#6e4a84', '#9a5a88', '#c86a7e', '#ea8a6e', '#f8ac6c', '#ffcc84'] },
  { h: 19, sun: '#ff7040', si: 1.3, pos: [-0.9, 0.16, 0.1], sky: '#5a5098', gnd: '#3a2a40', hi: 1.0, night: 0.65,
    bands: ['#12122e', '#1a183c', '#26204a', '#382656', '#50305e', '#6e3a5e', '#8a4a5a', '#a05a52', '#b06a4e'] },
  { h: 20.3, ...NIGHT },
  { h: 24, ...NIGHT },
];

const ca = new THREE.Color(), cb = new THREE.Color();
const lerpHex = (a, b, k) => `#${ca.set(a).lerp(cb.set(b), k).getHexString()}`;

export function daylight(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
  return {
    sun: lerpHex(a.sun, b.sun, k),
    sunIntensity: a.si + (b.si - a.si) * k,
    sunPos: a.pos.map((v, j) => v + (b.pos[j] - v) * k),
    sky: lerpHex(a.sky, b.sky, k),
    ground: lerpHex(a.gnd, b.gnd, k),
    hemiIntensity: a.hi + (b.hi - a.hi) * k,
    night: a.night + (b.night - a.night) * k,
    bands: a.bands.map((c, j) => lerpHex(c, b.bands[j], k)),
  };
}
