import * as THREE from 'three';
import { GOODS } from '../life/economy.js';

/*
 * 成交气泡：买卖一成，买家头顶冒一个像素小气泡（"豆腐×2 4文" / "换 鸡蛋×2" / "赊 6文"），卖家头顶冒一个"+4文"，
 * 往上飘一点，三秒后淡掉。点阵字按原尺寸画在小画布上，最近邻放大（和游戏 UI 一样硬边）；不做深度测试，房檐挡不住。
 */

const LIFE = 3.2; // 秒
const PX = 0.055; // 画布一个像素 = 村里多少米

/** 一笔买卖在买家头顶怎么写：[[字, 颜色], …]。 */
export function dealText(t) {
  const G = (g) => GOODS[g]?.name ?? g;
  const what = t.good ? `${G(t.good)}×${t.qty}` : t.service;
  if (t.kind === 'barter') return [[what, '#ffcc66'], [` 换${G(t.swap.good)}×${t.swap.qty}`, '#e0d4bf']];
  if (t.kind === 'gift') return [[what, '#ffcc66'], [' 接济', '#8fd16a']];
  if (t.kind === 'credit') return [[what, '#ffcc66'], [` 赊${t.price}文`, '#d0564a']];
  return [[what, '#ffcc66'], [` ${t.price}文`, '#e0d4bf']];
}

function paint(parts) {
  const font = '12px PixelZh12, sans-serif', c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(parts.reduce((s, [txt]) => s + g.measureText(txt).width, 0)) + 8, h = 18;
  c.width = w + 2; c.height = h + 4;
  g.fillStyle = '#120e0a'; g.fillRect(0, 0, w + 2, h + 1); // 外框
  g.fillStyle = '#2b231b'; g.fillRect(1, 1, w, h - 1); // 胡桃木面板
  g.fillStyle = '#7a6448'; g.fillRect(1, 1, w, 1); // 亮边
  g.fillStyle = '#120e0a'; g.fillRect(Math.floor(w / 2) - 1, h + 1, 4, 2); g.fillRect(Math.floor(w / 2), h + 3, 2, 1); // 小尖角
  g.fillStyle = '#2b231b'; g.fillRect(Math.floor(w / 2), h, 2, 2);
  g.font = font; g.textBaseline = 'top';
  let x = 5;
  for (const [txt, col] of parts) { g.fillStyle = col; g.fillText(txt, x, 3); x += g.measureText(txt).width; }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(c.width * PX, c.height * PX, 1);
  s.renderOrder = 12;
  return s;
}

export function createTradeBubbles() {
  const live = [];
  const show = (obj, parts, h) => {
    if (!obj || !obj.visible) return;
    const s = paint(parts);
    s.position.set(0, h, 0);
    obj.add(s);
    live.push({ s, h, t0: performance.now() });
  };
  return {
    /** 头顶冒一句（新人开张……）：parts = [[字, 颜色], …]。 */
    say(obj, parts) { show(obj, parts, 3.2); },
    /** 成交了：买家头顶写买了什么、怎么付的，卖家头顶写收了多少。 */
    show(t, byId) {
      if (t.place === '货郎代买') return; // 代买：气泡冒在货郎头上（main.js 的 onRun），买的人不一定在跟前
      const b = byId[t.buyer], s = byId[t.seller];
      if (b && !b.inside) show(b.object, dealText(t), 2.9);
      if (s && !s.inside && t.kind === 'cash' && t.price > 0) show(s.object, [[`+${t.price}文`, '#8fd16a']], 3.8); // 卖家的高一截：两人挨着站，气泡别叠在一起
    },
    update() {
      const now = performance.now();
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i], k = (now - b.t0) / 1000 / LIFE;
        if (k >= 1 || !b.s.parent) { b.s.removeFromParent(); b.s.material.map.dispose(); b.s.material.dispose(); live.splice(i, 1); continue; }
        b.s.position.y = b.h + k * 0.5;
        b.s.material.opacity = k > 0.75 ? (1 - k) / 0.25 : 1;
      }
    },
  };
}
