import * as THREE from 'three';
import { R, INK } from './palette.js';
import { outline, paint, makeRng, toTexture, flat, decal, TPU } from './pixel.js';

// ---------------------------------------------------------------- 程序化树（受光在左）
// 树冠 = 若干个圆叠起来，按法线方向分四档明暗，再叠一层低频噪声让叶子成团。

function shade(ramp, light) {
  return light > 0.5 ? ramp[4] : light > 0.1 ? ramp[3] : light > -0.35 ? ramp[2] : ramp[1];
}

function crown(g, r, blobs, ramp, { fruit = null, fruitRate = 0 } = {}) {
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    let best = null;
    for (const b of blobs) {
      const d = Math.hypot((x + 0.5 - b.x) / b.rx, (y + 0.5 - b.y) / b.ry);
      if (d <= 1 && (!best || b.y > best.b.y)) best = { b, d };
    }
    if (!best) continue;
    const nx = (x + 0.5 - best.b.x) / best.b.rx, ny = (y + 0.5 - best.b.y) / best.b.ry;
    const clump = Math.sin(x * 0.8 + best.b.x) * Math.sin(y * 0.9 + best.b.y) * 0.35;
    if (best.d > 0.92 && (x + y) % 2) continue; // 边缘留点缺口，像一簇簇叶子
    g.px(x, y, shade(ramp, -nx * 0.6 - ny * 0.7 + clump));
    if (fruit && r() < fruitRate && best.d < 0.9) g.px(x, y, fruit);
  }
}

function trunk(g, x, y0, y1, w, branches = []) {
  for (let y = y0; y < y1; y++) { g.rect(x, y, w, 1, R.wood[1]); g.px(x, y, R.wood[2]); }
  for (const [bx, by, len, dir] of branches) for (let i = 0; i < len; i++) g.px(bx + i * dir, by - Math.floor(i / 2), R.wood[1]);
}

const TREES = {
  // 老槐树：村口的大树，宽冠、粗干
  locust: (r) => paint(150, 160, (g) => {
    trunk(g, 70, 70, 160, 10, [[70, 95, 20, -1], [80, 90, 22, 1], [74, 80, 14, -1]]);
    g.rect(68, 150, 14, 10, R.wood[1]);
    crown(g, r, Array.from({ length: 9 }, () => ({ x: 25 + r() * 100, y: 25 + r() * 50, rx: 22 + r() * 16, ry: 18 + r() * 10 })), R.leaf);
  }),
  // 白杨：高而窄
  poplar: (r) => paint(36, 170, (g) => {
    trunk(g, 16, 40, 170, 4);
    for (let y = 60; y < 170; y += 7) g.px(17, y, R.grey[2]); // 白杨树皮上的"眼睛"
    // 整个树冠按一个细高的火焰形统一算光照（逐个圆球算会变成糖葫芦）
    const top = 4, bottom = 118, cx = 18;
    for (let y = top; y < bottom; y++) {
      const t = (y - top) / (bottom - top);
      const half = 15 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 + Math.sin(y * 0.5) * 1.5;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const nx = (x - cx) / Math.max(half, 1);
        if (Math.abs(nx) > 1 || (Math.abs(nx) > 0.85 && (x + y) % 2)) continue;
        const clump = Math.sin(x * 0.9 + y * 0.35) * Math.sin(y * 0.7) * 0.45;
        g.px(x, y, shade(R.leaf, -nx * 0.8 - (t - 0.5) * 0.5 + clump));
      }
    }
  }),
  // 枣树：小冠、黄绿叶、红枣
  jujube: (r) => paint(80, 90, (g) => {
    trunk(g, 37, 40, 90, 5, [[37, 55, 12, -1], [42, 52, 12, 1]]);
    crown(g, r, Array.from({ length: 5 }, () => ({ x: 15 + r() * 50, y: 15 + r() * 25, rx: 15 + r() * 8, ry: 12 + r() * 6 })), R.grass, { fruit: R.red[2], fruitRate: 0.025 });
  }),
  // 柿子树：叶子落了一半，挂满橘红的柿子——北方秋天的标志
  persimmon: (r) => paint(90, 100, (g) => {
    trunk(g, 42, 45, 100, 6, [[42, 60, 18, -1], [48, 58, 18, 1], [45, 48, 10, 1]]);
    crown(g, r, Array.from({ length: 6 }, () => ({ x: 15 + r() * 60, y: 15 + r() * 30, rx: 15 + r() * 10, ry: 12 + r() * 8 })), R.autumn);
    for (let i = 0; i < 26; i++) { const x = Math.floor(10 + r() * 70), y = Math.floor(10 + r() * 45); g.rect(x, y, 2, 2, R.red[3]); g.px(x, y, R.gold[4]); }
  }),
  // 垂柳：涝池边
  willow: (r) => paint(90, 120, (g) => {
    trunk(g, 42, 35, 120, 6, [[42, 45, 14, -1], [48, 42, 14, 1]]);
    crown(g, r, Array.from({ length: 4 }, () => ({ x: 20 + r() * 50, y: 15 + r() * 15, rx: 22, ry: 12 })), R.leaf);
    for (let x = 6; x < 84; x += 2) {
      const top = 22 + Math.floor(r() * 10), len = 20 + Math.floor(r() * 45);
      for (let k = 0; k < len; k++) g.px(x + (k > len * 0.6 ? 1 : 0), top + k, k % 4 === 0 ? R.leaf[4] : x < 45 ? R.leaf[3] : R.leaf[2]);
    }
  }),
  // 院里的小石榴 / 海棠
  bush: (r) => paint(40, 40, (g) => {
    trunk(g, 19, 22, 40, 3);
    crown(g, r, Array.from({ length: 4 }, () => ({ x: 10 + r() * 20, y: 10 + r() * 10, rx: 9, ry: 8 })), R.leaf, { fruit: R.red[3], fruitRate: 0.04 });
  }),
};

// 精灵不受光，用一层暖色乘一下压到和场景一样的亮度
const TINT = new THREE.Color('#e6cfc0');

/**
 * 精灵板集合：始终绕 Y 轴转向观察者（2.5D 的"2D"那一半）。
 * 全部挂在同一父节点下，每帧按观察者位置统一转一次——左右眼朝向一致。
 */
export class Sprites {
  constructor(parent, M) {
    this.parent = parent;
    this.M = M;
    this.items = [];
    this.viewerLocal = new THREE.Vector3();
  }

  _blob(x, y, z, w) {
    const blob = decal(this.M.tex.blob, this.M.blob);
    blob.rotation.x = -Math.PI / 2;
    blob.scale.set(w / (16 / TPU), w / (16 / TPU), 1);
    blob.position.set(x, y + 0.03, z);
    this.parent.add(blob);
    return blob;
  }

  /** 静态的树。 */
  tree(kind, x, z, { seed = 1, scale = 1, y = 0 } = {}) {
    const tex = toTexture(outline(TREES[kind](makeRng(seed)), INK));
    const mesh = decal(tex, flat(tex, { alphaTest: 0.5, side: THREE.DoubleSide, color: TINT }), 'bottom');
    mesh.scale.setScalar(scale);
    mesh.position.set(x, y, z);
    this.parent.add(mesh);
    this._blob(x, y, z, mesh.userData.size.w * scale * 0.6);
    this.items.push(mesh);
    return mesh;
  }

  /**
   * 带帧动画的角色（人、动物）。canvas 是横排图集，frames 帧，每格 cellW x cellH 像素。
   * 返回的 mesh 上有 setFrame(i) 和 flip(bool)。
   */
  actor(canvas, frames, cellW, cellH, { shadow = 0.7 } = {}) {
    const tex = toTexture(canvas);
    tex.repeat.set(1 / frames, 1);
    const w = cellW / TPU, h = cellH / TPU;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2 - 1 / TPU, 0); // 脚底对齐地面（扣掉留边）
    const mesh = new THREE.Mesh(geo, flat(tex, { alphaTest: 0.5, side: THREE.DoubleSide, color: TINT }));
    mesh.userData.flip = false;
    mesh.setFrame = (i) => { tex.offset.x = i / frames; };
    mesh.flip = (f) => { mesh.userData.flip = f; };
    this.parent.add(mesh);
    if (shadow) mesh.userData.blob = this._blob(0, 0, 0, shadow);
    this.items.push(mesh);
    return mesh;
  }

  /** 每帧：所有精灵转向观察者；需要镜像的把 x 缩放翻过来。 */
  face(viewerWorld) {
    const v = this.parent.worldToLocal(this.viewerLocal.copy(viewerWorld));
    for (const m of this.items) {
      m.rotation.y = Math.atan2(v.x - m.position.x, v.z - m.position.z);
      m.scale.x = Math.abs(m.scale.x) * (m.userData.flip ? -1 : 1);
      const b = m.userData.blob;
      if (b) b.position.set(m.position.x, (m.userData.ground ?? 0) + 0.03, m.position.z);
    }
  }
}
