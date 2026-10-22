import * as THREE from 'three';
import { R } from './palette.js';
import { is } from './season.js';
import { TPU, snap, makeRng, paint, toTexture, flat } from './pixel.js';

// 氛围层：炊烟、萤火虫、斜光束。都在沙盘的格坐标里，位置吸附像素网格。

/**
 * 炊烟：像素团从烟囱口飘起，被晚风往右带、慢慢变大再缩小消失。
 * 用不同大小的帧而不是半透明渐隐——像素画里"淡出"就是变小、变稀。
 */
/**
 * 一缕烟（炊烟、蒸汽、香火、水雾）：9 团烟一团接一团往上飘，越飘越大、越淡，最后散掉。
 * 画法：同一个父节点下、同一组颜色的烟共用一个 SmokePool——5 种形态各一个实例化网格，
 * 所有烟囱的烟团按当时的形态分到这 5 个网格里一起画（原来每团一个网格，一村子烟就是一百多个 draw call）。
 */
const POOLS = new Map();
class SmokePool {
  constructor(parent, colors) {
    const puff = (s, dense) => toTexture(paint(8, 8, (g) => {
      const o = (8 - s) / 2;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const corner = (x === 0 || x === s - 1) && (y === 0 || y === s - 1);
        if (corner || (!dense && (x + y) % 2)) continue;
        g.px(o + x, o + y, y < s / 2 ? colors[0] : colors[1]); // 上半被夕阳照亮一点
      }
    }));
    this.frames = [[4, true], [6, true], [6, false], [4, false], [2, false]].map(([s, d]) => flat(puff(s, d), { alphaTest: 0.5, side: THREE.DoubleSide }));
    this.parent = parent;
    this.puffs = [];
    this.meshes = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.e = new THREE.Euler(); this.p = new THREE.Vector3();
  }
  add(puff) { this.puffs.push(puff); this.meshes.forEach((m) => m.removeFromParent()); this.meshes = []; } // 加了烟团：网格按新的容量重建
  /** 每帧：按形态把烟团分到 5 个网格里，面朝观察者（只绕竖轴转，和原来的面片一样）。v：观察者在父节点里的位置。 */
  flush(v) {
    if (!this.meshes.length) this.meshes = this.frames.map((mat) => {
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, this.puffs.length);
      im.frustumCulled = false;
      im.userData.dynamic = true;
      this.parent.add(im);
      return im;
    });
    const n = this.meshes.map(() => 0);
    for (const pf of this.puffs) {
      if (!pf.visible) continue;
      const k = pf.frame, im = this.meshes[k];
      this.q.setFromEuler(this.e.set(0, Math.atan2(v.x - pf.x, v.z - pf.z), 0));
      im.setMatrixAt(n[k]++, this.m.compose(this.p.set(pf.x, pf.y, pf.z), this.q, this.s.setScalar(pf.size)));
    }
    this.meshes.forEach((im, k) => { im.count = n[k]; im.instanceMatrix.needsUpdate = true; });
  }
}

export class Smoke {
  constructor(parent, sprites, origin, seed, { size = 1.2, rise = 4.5, drift = 3.5, life = 0.12, colors = [R.smoke[1], R.smoke[0]] } = {}) {
    this.origin = origin;
    this.rise = rise;
    this.drift = drift;
    this.life = life;
    this.rand = makeRng(seed);
    const key = colors.join();
    if (!POOLS.has(parent)) POOLS.set(parent, new Map());
    const pools = POOLS.get(parent);
    if (!pools.has(key)) { const pool = new SmokePool(parent, colors); pools.set(key, pool); (sprites.pools ??= []).push(pool); }
    this.pool = pools.get(key);
    this.frames = this.pool.frames; // 夜里调暗（village.js）：同一组颜色的烟共用材质
    this.puffs = Array.from({ length: 9 }, (_, i) => {
      const pf = { age: i / 9, drift: 0, x: origin.x, y: origin.y, z: origin.z, size, frame: 0, visible: true };
      this.pool.add(pf);
      return pf;
    });
  }

  /** active = false：不再冒新的，已经飘出去的那几团照样飘完、散掉。 */
  update(dt, active = true) {
    for (const pf of this.puffs) {
      let a = pf.age + dt * this.life;
      if (a > 1) { a -= 1; pf.drift = (this.rand() - 0.5) * 0.5; pf.visible = active; }
      pf.age = a;
      pf.x = snap(this.origin.x + a * a * this.drift + Math.sin(a * 6) * 0.2 + pf.drift);
      pf.y = snap(this.origin.y + a * this.rise);
      pf.z = snap(this.origin.z + a * 0.6);
      pf.frame = Math.min(this.frames.length - 1, Math.floor(a * this.frames.length));
    }
  }
}

/** 炉子的火星：几颗叠加混合的小亮点往上蹿，蹿到顶就重来。 */
export class Embers {
  constructor(parent, material, origin, count = 8, seed = 3) {
    const r = makeRng(seed);
    this.origin = origin;
    this.sparks = Array.from({ length: count }, () => {
      const s = new THREE.Sprite(material);
      s.scale.set(0.18, 0.18, 1);
      s.userData = { age: r(), dx: (r() - 0.5) * 0.8, speed: 0.6 + r() * 0.8 };
      parent.add(s);
      return s;
    });
  }

  update(dt) {
    for (const s of this.sparks) {
      const u = s.userData;
      u.age += dt * u.speed;
      if (u.age > 1) u.age -= 1;
      s.position.set(snap(this.origin.x + u.dx * u.age), snap(this.origin.y + u.age * 2.2), snap(this.origin.z));
      s.visible = u.age < 0.85;
    }
  }
}

/** 萤火虫：在稻田和溪边慢慢游荡，一闪一灭。 */
export class Fireflies {
  constructor(parent, material, areas, count = 28, seed = 5) {
    const r = makeRng(seed);
    this.flies = Array.from({ length: count }, (_, i) => {
      const [x0, x1, z0, z1, y0] = areas[i % areas.length];
      const s = new THREE.Sprite(material);
      s.scale.set(0.35, 0.35, 1);
      s.userData = { home: new THREE.Vector3(x0 + r() * (x1 - x0), y0 + 0.4 + r() * 1.6, z0 + r() * (z1 - z0)), phase: r() * 10, speed: 0.3 + r() * 0.5 };
      parent.add(s);
      return s;
    });
  }

  update(t) {
    for (const s of this.flies) {
      const { home, phase, speed } = s.userData;
      s.position.set(
        snap(home.x + Math.sin(t * speed + phase) * 1.6),
        snap(home.y + Math.sin(t * speed * 1.7 + phase * 2) * 0.3),
        snap(home.z + Math.cos(t * speed * 0.8 + phase) * 1.6),
      );
      s.visible = Math.sin(t * 2.2 + phase * 3) > -0.2; // 一闪一灭
    }
  }
}

/**
 * 夕阳斜光束：几片叠加混合的长条，从左上斜插进场景。
 * 替代体积光；叠加混合在光学透视眼镜上也只是"变亮"，不会挡住真实世界。
 */
export function lightShafts(parent, material, shafts) {
  const g = new THREE.Group();
  for (const [x, z, w, len] of shafts) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), material);
    m.position.set(x, len * 0.38, z);
    m.rotation.set(0, 0.35, 0.75); // 沿夕阳方向倾斜
    m.renderOrder = 10;
    g.add(m);
  }
  parent.add(g);
  return g;
}

/**
 * 小雨：三千根雨丝在村子上空落下，落到地面高度就回到顶上；斜着一点（风），淡蓝灰。
 * 每根是一个细长小方块（宽一个场景像素）——WebGL 的线只有一个屏幕像素宽，缩成沙盘后看不见。
 */
export class Rain {
  constructor(parent, bounds, groundAt, count = 3000, seed = 11) {
    const r = makeRng(seed);
    this.groundAt = groundAt;
    this.snow = is('winter'); // 冬天下的是雪：一片片慢慢飘，左右晃
    if (this.snow) count = Math.round(count * 0.6);
    this.drops = Array.from({ length: count }, () => { const x = bounds.x0 + r() * (bounds.x1 - bounds.x0), z = bounds.z0 + r() * (bounds.z1 - bounds.z0); return { x, z, y: groundAt(x, z) + r() * 9, v: this.snow ? 0.7 + r() * 0.6 : 7 + r() * 3, top: 7 + r() * 3, ph: r() * 6 }; });
    const w = 1 / TPU;
    const geo = this.snow ? new THREE.BoxGeometry(w * 2, w * 2, w * 2) : new THREE.BoxGeometry(w, 0.5, w);
    this.object = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: this.snow ? '#f4f0f4' : '#c4d0e4', transparent: true, opacity: this.snow ? 0.9 : 0.65, depthWrite: false }), count);
    this.object.frustumCulled = false;
    this.object.userData.dynamic = true;
    this.object.visible = false;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.1));
    this.s = new THREE.Vector3(1, 1, 1);
    this.p = new THREE.Vector3();
    parent.add(this.object);
  }

  update(dt, on) {
    this.object.visible = on;
    if (!on) return;
    this.drops.forEach((d, i) => {
      d.y -= d.v * dt;
      d.x += (this.snow ? 0.3 + Math.sin(d.y * 1.7 + d.ph) * 0.5 : 1.2) * dt; // 风往东吹一点；雪花左右飘
      const g = this.groundAt(d.x, d.z);
      if (d.y < g) { d.y = g + d.top; d.x -= (this.snow ? 0.3 : 1.2) * (d.top / d.v); } // 落地了回到上面（只在地面以上几米落，雨丝才密）
      this.object.setMatrixAt(i, this.m.compose(this.p.set(d.x, d.y, d.z), this.q, this.s));
    });
    this.object.instanceMatrix.needsUpdate = true;
  }
}
