/*
 * 背景音乐：五首北方民乐风的慢曲（本地 Stable Audio 生成，统一压过高频，见 bgm/README.md），按村里的时辰轮换。
 *
 * - 一直循环：每首快放完时淡入下一首（交叉淡化），中间不留空；下一首从"这个时辰合适的"里挑，不连着放同一首。
 * - 唱戏的时候（台上有人拉板胡）音乐压低让路，唱完再回来。
 * - 加载失败 / 被浏览器暂停时自动接着放，不会停在半路。
 * - 两个 <audio> 交替用，换曲时淡入淡出。音量本身就压得很低（BASE）。
 * - 和音效一样，浏览器要先有一次点击才能放：第一次点页面时自动打开（除非点过"音乐"按钮关掉）。
 * - 正在放哪一首写在右上角时钟栏里（title）；设置里「下一首」跳过当前这首（next），?bgm=文件名 只放这一首（试听用）。
 */
import { EN } from './i18n.js';

const TRACKS = [
  { file: 'chenwu', title: '晨雾炊起', en: 'Morning Mist', from: 5, to: 10 }, // 笙 + 低音箫：清晨
  { file: 'jinyun', title: '晋韵小院', en: 'Shanxi Courtyard', from: 8, to: 17 }, // 坠胡 + 扬琴低音：白天
  { file: 'shiyuan', title: '石院暮色', en: 'Stone Yard at Dusk', from: 9, to: 18 }, // 二胡 + 古筝：白天到傍晚
  { file: 'chuiyan', title: '傍晚炊烟', en: 'Evening Smoke', from: 16.5, to: 21 }, // 二胡 + 古筝：傍晚
  { file: 'qiuye', title: '秋夜檐下', en: 'Autumn Night, Under the Eaves', from: 19, to: 29 }, // 中胡 + 古筝 + 大提琴：夜里（29 = 次日 5 点）
];
const BASE = 0.32; // 音乐音量（0–1）
const FADE = 4; // 淡入淡出秒数
const DUCK = 0.3; // 唱戏时压到多少

export function createMusic({ hour, busy, onChange = () => {} }) {
  const only = typeof location !== 'undefined' && TRACKS.find((t) => t.file === new URLSearchParams(location.search).get('bgm')); // ?bgm=chenwu：只放这一首
  let on = false, muted = false, last = null, cur = null, duck = 1;
  const els = [new Audio(), new Audio()];
  for (const a of els) { a.preload = 'auto'; a.volume = 0; }
  let which = 0;

  const fits = (t, h) => (h >= t.from && h < t.to) || (h + 24 >= t.from && h + 24 < t.to);
  function pick() {
    if (only) return only;
    const h = hour();
    const ok = TRACKS.filter((t) => fits(t, h) && t !== last);
    const pool = ok.length ? ok : TRACKS.filter((t) => t !== last);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function start() {
    const t = pick();
    last = t;
    which = 1 - which;
    const a = els[which];
    a.src = `bgm/${t.file}.mp3`;
    a.currentTime = 0;
    a.volume = 0;
    a.play().catch(() => {});
    cur = { a, t, fadeIn: 0 };
    onChange(t);
  }

  return {
    get on() { return on; },
    get title() { return cur && on ? (EN ? cur.t.en : cur.t.title) : ''; },
    get file() { return cur?.t.file ?? ''; },
    /** 跳过这一首：淡出，换下一首。 */
    next() { if (!on) this.toggle(); else start(); },
    toggle() {
      on = !on;
      muted = !on;
      if (on && !cur) start();
      if (!on) for (const a of els) a.pause();
      else cur?.a.play().catch(() => {});
      return on;
    },
    /** 页面上第一次点击：自动打开（除非用户关过）。 */
    wake() { if (!on && !muted) { on = true; start(); } return on; },
    update(dt) {
      if (!on) return;
      duck += ((busy() ? DUCK : 1) - duck) * Math.min(1, dt / FADE); // 唱戏时让路
      for (const a of els) if (a !== cur?.a && !a.paused) { a.volume = Math.max(0, a.volume - BASE * dt / FADE); if (!a.volume) a.pause(); } // 上一首淡出
      if (!cur) { start(); return; }
      const a = cur.a;
      cur.age = (cur.age ?? 0) + dt;
      // 快放完、已放完、出错：直接接下一首（交叉淡化）
      if (a.ended || (a.error && cur.age > 2) || (a.duration && a.duration - a.currentTime < FADE)) { start(); return; }
      if (a.paused && cur.age > 1) a.play().catch(() => {}); // 被浏览器暂停了（切后台 / 卡顿）就接着放
      cur.fadeIn = Math.min(1, cur.fadeIn + dt / FADE);
      a.volume = Math.max(0, Math.min(1, BASE * duck * cur.fadeIn));
    },
  };
}
