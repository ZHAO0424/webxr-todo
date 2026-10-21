/*
 * 背景音乐：五首北方民乐风的慢曲（本地 Stable Audio 生成，统一压过高频，见 bgm/README.md），按村里的时辰轮换。
 *
 * - 每首放完安静一阵（GAP 秒）再换下一首，像游戏里那样不一直响；下一首从"这个时辰合适的"里挑，不连着放同一首。
 * - 唱戏的时候（台上有人拉板胡）音乐淡出让路，唱完再回来。
 * - 两个 <audio> 交替用，换曲时淡入淡出。音量本身就压得很低（BASE）。
 * - 和音效一样，浏览器要先有一次点击才能放：第一次点页面时自动打开（除非点过"音乐"按钮关掉）。
 */

const TRACKS = [
  { file: 'chenwu', title: '晨雾炊起', from: 5, to: 10 }, // 笙 + 低音箫：清晨
  { file: 'jinyun', title: '晋韵小院', from: 8, to: 17 }, // 坠胡 + 扬琴低音：白天
  { file: 'shiyuan', title: '石院暮色', from: 9, to: 18 }, // 二胡 + 古筝：白天到傍晚
  { file: 'chuiyan', title: '傍晚炊烟', from: 16.5, to: 21 }, // 二胡 + 古筝：傍晚
  { file: 'qiuye', title: '秋夜檐下', from: 19, to: 29 }, // 中胡 + 古筝 + 大提琴：夜里（29 = 次日 5 点）
];
const BASE = 0.32; // 音乐音量（0–1）
const GAP = [25, 50]; // 两首之间安静多少秒
const FADE = 3; // 淡入淡出秒数

export function createMusic({ hour, busy }) {
  let on = false, muted = false, last = null, cur = null, gapLeft = 0, duck = 1;
  const els = [new Audio(), new Audio()];
  for (const a of els) { a.preload = 'auto'; a.volume = 0; }
  let which = 0;

  const fits = (t, h) => (h >= t.from && h < t.to) || (h + 24 >= t.from && h + 24 < t.to);
  function pick() {
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
  }

  return {
    get on() { return on; },
    get title() { return cur?.t.title ?? ''; },
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
      duck += ((busy() ? 0 : 1) - duck) * Math.min(1, dt / FADE); // 唱戏时让路
      for (const a of els) if (a !== cur?.a && a.volume > 0) { a.volume = Math.max(0, a.volume - dt / FADE); if (!a.volume) a.pause(); } // 上一首淡出
      if (cur) {
        const a = cur.a;
        if (a.ended) { cur = null; gapLeft = GAP[0] + Math.random() * (GAP[1] - GAP[0]); return; }
        cur.fadeIn = Math.min(1, cur.fadeIn + dt / FADE);
        const tail = a.duration ? Math.min(1, (a.duration - a.currentTime) / FADE) : 1; // 结尾淡出
        a.volume = Math.max(0, Math.min(1, BASE * duck * cur.fadeIn * tail));
      } else if ((gapLeft -= dt) <= 0) start();
    },
  };
}
