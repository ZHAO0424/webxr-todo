import * as THREE from 'three';
import { rawHeight } from '../terrain.js';

// 镜头运动：机位、看向点各一条 Catmull-Rom，按缓动后的进度取点。
// 跟随目标先过一个阻尼（时间常数 tau 秒），人走路的小晃动、一顿一顿不会传到镜头上。

const ease = {
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  // 拉远：距离按指数长（越远走得越快，看起来匀速后退），两头再缓一下
  pull: (u) => { const k = 30, e = ease.inOut(u); return (k ** e - 1) / (k - 1); },
};

export class Rig {
  constructor(shot, village, { tau = 0.35, fovScale = 1 } = {}) {
    this.shot = shot;
    this.village = village;
    this.tau = tau;
    this.fovScale = fovScale; // 竖版：画面窄，竖向视角放大
    this.target = null; // 跟随目标的世界坐标（阻尼后）
    this.raw = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.ease = ease[shot.ease ?? 'inOut'];
  }

  /** 跟随目标（村民 id 或动物种类）此刻的世界坐标。 */
  targetNow(out, key = this.shot.target) {
    const lf = this.village.life;
    const o = lf.people.find((v) => v.p.id === key)?.object ?? lf.beasts.find((b) => b.s.role === key && b.circling)?.object ?? lf.beasts.find((b) => b.s.role === key)?.object;
    return o.getWorldPosition(out);
  }

  /** 村里的米 → 世界坐标。 */
  world(x, y, z, out) { return this.village.object.localToWorld(out.set(x, y, z)); }

  point(p, out) {
    const U = this.village.object.scale.x;
    if (p.stage) return out.set(...p.stage);
    if (p.at) { const [x, dy, z] = p.at; return this.world(x, rawHeight(x, z) + dy, z, out); }
    if (p.follow) { // 跟随目标用阻尼后的位置
      if (p.follow === this.shot.target && this.target) out.copy(this.target);
      else this.targetNow(out, p.follow);
      out.y += (p.dy ?? 0) * U;
      return out;
    }
    if (p.rel) return out.copy(this.target).add(this.tmp.set(...p.rel).multiplyScalar(U));
    if (p.orbit) {
      const [r, h, deg] = p.orbit, a = (deg * Math.PI) / 180;
      return out.copy(this.target).add(this.tmp.set(Math.sin(a) * r, h, Math.cos(a) * r).multiplyScalar(U));
    }
    throw new Error(`不认识的机位点 ${JSON.stringify(p)}`);
  }

  /** 一串点在进度 u 处的位置。orbit 按角度插值（不走弦），其余走曲线。 */
  along(list, u, out) {
    if (list.length === 1) return this.point(list[0], out);
    if (list.every((p) => p.orbit)) {
      const n = list.length - 1, i = Math.min(n - 1, Math.floor(u * n)), k = u * n - i;
      const a = list[i].orbit, b = list[i + 1].orbit;
      return this.point({ orbit: a.map((v, j) => v + (b[j] - v) * k) }, out);
    }
    const pts = list.map((p) => this.point(p, new THREE.Vector3()));
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPointAt(u, out);
  }

  /** 第 i 帧（共 n 帧，步长 dt 秒）：摆好相机。返回 { u, look }。 */
  apply(camera, i, n, dt) {
    const s = this.shot;
    if (s.target) {
      this.targetNow(this.raw);
      if (!this.target) this.target = this.raw.clone();
      else this.target.lerp(this.raw, 1 - Math.exp(-dt / this.tau));
    }
    const u = this.ease(n > 1 ? i / (n - 1) : 0);
    this.along(s.cam, u, camera.position);
    const look = this.along(s.look, u, new THREE.Vector3());
    camera.fov = (s.fovEnd ? s.fov + (s.fovEnd - s.fov) * u : s.fov) * this.fovScale;
    if (s.up === 'north') { // 正俯拍：画面上方朝北，跟着机位绕目标转
      const a = ((s.cam[0].orbit[2] + (s.cam.at(-1).orbit[2] - s.cam[0].orbit[2]) * u) * Math.PI) / 180;
      camera.up.set(-Math.sin(a), 0, -Math.cos(a));
    } else camera.up.set(0, 1, 0);
    camera.lookAt(look);
    const d = camera.position.distanceTo(look);
    camera.near = Math.min(0.01, Math.max(0.0004, d * 0.15)); // 近景离人只有几厘米：近平面跟着距离收
    camera.far = Math.max(6, d * 20);
    camera.updateProjectionMatrix();
    return { u, look, dist: d };
  }
}
