/*
 * 水里的鱼（只是画面，不进模拟）：村前小溪、西沟的溪和水潭、老村址的溪和大湖里游着的鱼。
 *   - 鱼影：水面是不透明的，鱼画成贴着水面的一层半透明深色剪影（像隔着水看见的背脊），摆着尾巴游，游一阵停一阵；
 *     溪里的鱼停下来就慢慢掉头顶着水（溪水往西流，鱼头朝东）。湖里的鱼多往湖心去。
 *   - 跳鱼：湖心时不时有一条鲤鱼（红尾巴）或鲫鱼（银白）跃出水面，划一道弧落回去；起跳溅起水花，落水荡开一圈圈波纹。
 *     清早、傍晚跳得勤，夜里少。
 *   - 啜水：鱼游上来啜一口水，水面点出一圈小涟漪（溪里、湖里都有）。
 * 冬天水面结冰，不建。随机数自己一套（不碰模拟的种子）。都按一米 18 像素画，和地上的贴图一样大的像素。
 */
import * as THREE from 'three';
import { voxelGeometry } from './voxel.js';
import { makeRng } from './pixel.js';
import { R } from './palette.js';

const PX = 18; // 一米 18 像素
const CELL = 0.5; // 水面按半米一格记哪里能游
const SHAPE = [ // 鱼影（从上往下看）：头朝 +x，尾鳍分叉
  '#.....###...',
  '.#..#######.',
  '..##########',
  '.#..#######.',
  '#.....###...',
];
const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).get('fish') === 'jump'; // ?fish=jump：跳鱼一条接一条（截图看效果用）
const RF = 8, RS = 64; // 波纹：8 帧，每帧 64 像素见方（3.6 米）

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function pixTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = canvas(12, 5), g = c.getContext('2d');
  g.fillStyle = '#fff';
  SHAPE.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') g.fillRect(x, y, 1, 1); }));
  return pixTex(c);
}

/** 波纹的 8 帧（一条横排）：外圈越荡越大，第 4 帧起里面跟着一圈，最后两帧断断续续；头两帧带几点溅起的水花。 */
function rippleTexture() {
  const c = canvas(RS * RF, RS), g = c.getContext('2d');
  g.fillStyle = '#fff';
  const dot = (f, a, r) => g.fillRect(f * RS + Math.round(RS / 2 + Math.cos(a) * r), Math.round(RS / 2 + Math.sin(a) * r), 1, 1);
  const ring = (f, r, gap) => { const n = Math.max(10, Math.round(r * 7)); for (let i = 0; i < n; i++) if (!gap || i % gap) dot(f, (i / n) * Math.PI * 2, r); };
  const RAD = [2, 4, 7, 10.5, 14, 18, 22.5, 27];
  for (let f = 0; f < RF; f++) {
    ring(f, RAD[f], f >= 6 ? 2 : 0);
    if (f >= 3) ring(f, RAD[f] - 8, f >= 5 ? 2 : 0);
    if (f < 2) for (let i = 0; i < 6; i++) dot(f, i * 1.05 + 0.4, 3 + f * 3); // 溅起的水花
  }
  const t = pixTex(c);
  t.repeat.set(1 / RF, 1);
  return t;
}

/** 跃出水面的那条鱼（体素，边长 5 厘米，头朝 +x）：carp 鲤鱼（金黄身子、红尾巴）、crucian 鲫鱼（银白）。 */
function fishGeo(kind) {
  const HH = [2, 1, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0]; // 每一列上下各几格：0、1 尾鳍，2 尾柄，… 11 嘴
  const C = kind === 'carp'
    ? { back: R.wheat[1], side: R.gold[3], belly: R.paper[2], fin: R.red[3] }
    : { back: R.slate[3], side: R.grey[2], belly: R.white[2], fin: R.grey[1] };
  const vox = new Map(), put = (x, y, z, c) => vox.set(`${x},${y},${z}`, c);
  for (let x = 0; x < 12; x++) {
    const h = HH[x];
    for (let y = -h; y <= h; y++) for (let z = -1; z <= 1; z++) {
      if (z && (x < 3 || (h > 0 && Math.abs(y) === h))) continue; // 尾巴扁；身子边上收圆
      put(x - 6, y, z, x < 2 ? C.fin : y > 0 ? C.back : y < 0 ? C.belly : C.side);
    }
  }
  for (let x = 5; x <= 7; x++) put(x - 6, 3, 0, C.fin); // 背鳍
  put(4, 1, 1, R.black[0]); put(4, 1, -1, R.black[0]); // 眼睛
  return voxelGeometry([-6, -3, -1], [6, 4, 2], (x, y, z) => vox.has(`${x},${y},${z}`), (x, y, z) => vox.get(`${x},${y},${z}`), 0.05);
}

const around = (r) => Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r]);
const NEAR = around(0.6), DEEP = around(3);

/**
 * boards：每块沙盘一项 { host（鱼挂在哪块沙盘下）, terrain（isWater / heightAt）, bounds, per（多少格水放一条鱼）, max, size: [小, 大], jumps（湖心跳鱼）, kinds }。
 * M：村子的材质（跳出来的鱼用 M.voxel）。返回 { update(dt, hour, night), count }。
 */
export function buildFish(M, boards) {
  const rand = makeRng(5150);
  const shadowTex = shadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(12 / PX, 5 / PX).rotateX(-Math.PI / 2);
  const ripTex = rippleTexture(), ripBase = new THREE.Color('#d2e6ea');
  const ripGeo = new THREE.PlaneGeometry(RS / PX, RS / PX).rotateX(-Math.PI / 2);
  const jumpGeo = { carp: fishGeo('carp'), crucian: fishGeo('crucian') };
  const m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const all = [];

  for (const b of boards) {
    const T = b.terrain, { x0, x1, z0, z1 } = b.bounds;
    const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    const ys = new Map(), cells = [], deepSet = new Set();
    for (let z = z0 + CELL / 2; z < z1; z += CELL) for (let x = x0 + CELL / 2; x < x1; x += CELL) {
      if (!T.isWater(x, z) || !NEAR.every(([dx, dz]) => T.isWater(x + dx, z + dz))) continue; // 离岸至少 0.6 米
      const k = key(x, z);
      ys.set(k, T.heightAt(x, z));
      cells.push([x, z]);
      if (b.jumps && DEEP.every(([dx, dz]) => T.isWater(x + dx, z + dz))) deepSet.add(k); // 离岸 3 米以上：湖心
    }
    const n = Math.min(b.max, Math.round(cells.length / b.per));
    if (!n) continue;
    const ok = (x, z) => ys.has(key(x, z));
    const pass = (ax, az, bx, bz) => { for (let k = 1; k <= 5; k++) if (!ok(ax + ((bx - ax) * k) / 5, az + ((bz - az) * k) / 5)) return false; return true; };
    const fish = [];
    for (let i = 0; i < n; i++) {
      let c = cells[Math.floor(rand() * cells.length)];
      if (deepSet.size && rand() < 0.7) { const d = [...deepSet]; const [i0, j0] = d[Math.floor(rand() * d.length)].split(',').map(Number); c = [(i0 + 0.5) * CELL, (j0 + 0.5) * CELL]; }
      const s = b.size[0] + rand() * (b.size[1] - b.size[0]);
      fish.push({ x: c[0], z: c[1], y: ys.get(key(c[0], c[1])), a: rand() * Math.PI * 2, v: 0, tx: c[0], tz: c[1], pause: rand() * 3, s, cruise: 0.25 + rand() * 0.3, wig: rand() * 10, kind: b.kinds[Math.floor(rand() * b.kinds.length)] });
    }
    /** 往前找个能游过去的地方：大致顺着现在的方向，1~4 米；湖里的多往湖心去。都不行就掉头。 */
    const retarget = (f) => {
      let any = null;
      for (let i = 0; i < 10; i++) {
        const a = f.a + (rand() - 0.5) * (i < 5 ? 2.4 : 6.3), d = 1 + rand() * 3, tx = f.x + Math.cos(a) * d, tz = f.z + Math.sin(a) * d;
        if (!ok(tx, tz) || !pass(f.x, f.z, tx, tz)) continue;
        any ??= [tx, tz];
        if (!deepSet.size || deepSet.has(key(tx, tz)) || rand() < 0.25) { f.tx = tx; f.tz = tz; return; }
      }
      if (any) [f.tx, f.tz] = any;
      else { f.tx = f.x; f.tz = f.z; f.a += Math.PI * (0.6 + rand() * 0.8); }
    };
    // 鱼影的颜色：湖水浅，鱼是深色的背脊；溪水深，看得见的是鱼背上一层银灰
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: b.tint ?? '#0a1822', transparent: true, opacity: b.alpha ?? 0.5, depthWrite: false });
    shadowMat.userData.alpha = shadowMat.opacity;
    const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, n);
    shadows.frustumCulled = false;
    shadows.renderOrder = 1;
    shadows.userData.dynamic = true;
    b.host.add(shadows);
    const jumper = Object.fromEntries(Object.entries(jumpGeo).map(([k, g]) => { const m = new THREE.Mesh(g, M.voxel); m.visible = false; m.rotation.order = 'YZX'; m.userData.dynamic = true; b.host.add(m); return [k, m]; }));
    const ripples = Array.from({ length: 6 }, () => {
      const map = ripTex.clone();
      const m = new THREE.Mesh(ripGeo, new THREE.MeshBasicMaterial({ map, color: ripBase.clone(), transparent: true, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 2;
      m.userData.dynamic = true;
      b.host.add(m);
      return m;
    });
    all.push({ cells: cells.length, b, fish, ok, ys, key, deepSet, retarget, shadows, jumper, ripples, jump: null, nextJump: 3 + rand() * 6, nextRise: 1 + rand() * 4 });
  }

  const ripple = (W, x, y, z, frames) => {
    const r = W.ripples.find((m) => !m.visible);
    if (!r) return;
    r.visible = true;
    r.position.set(x, y + 0.035, z);
    r.userData.t = 0;
    r.userData.frames = frames;
    r.material.map.offset.x = 0;
  };

  return {
    count: all.reduce((s, W) => s + W.fish.length, 0),
    /** 湖心（stream：村前小溪）的一条鱼在哪（截图对准用）：{ host, x, y, z }，host 本地坐标。 */
    spot(stream = false) { const W = all.find((w) => !!w.deepSet.size !== stream); if (!W) return null; const f = W.fish.find((g) => stream || W.deepSet.has(W.key(g.x, g.z))) ?? W.fish[0];
      if (DEMO && !stream) { // 截图用：定格在跳到半空的那一刻，起跳的水花荡开一半，旁边一条鱼正啜水
        f.jumping = true;
        W.jump = { f, t: 0.4, T: 0.85, x0: f.x, z0: f.z, y0: f.y, dist: 1.3, h: 0.6, land: false, mesh: W.jumper.carp };
        W.jump.mesh.visible = true;
        ripple(W, f.x, f.y, f.z, RF); W.ripples[0].userData.t = 0.6;
        const g = W.fish.find((o) => o !== f && Math.hypot(o.x - f.x, o.z - f.z) < 6);
        if (g) { ripple(W, g.x + Math.cos(g.a) * 0.3, g.y, g.z + Math.sin(g.a) * 0.3, 5); W.ripples[1].userData.t = 0.45; }
      }
      return { host: W.b.host, x: f.x, y: f.y, z: f.z }; },
    stats: () => all.map((W) => ({ cells: W.cells, fish: W.fish.length, deep: W.deepSet.size })), // 调试：每块沙盘几格水、几条鱼、湖心几格
    /** 每帧（网页里，画面那一半）：dt 现实秒；hour 村里几点；night 0 白天 … 1 深夜。 */
    update(dt, hour, night) {
      if (!dt) return;
      const dj = DEMO ? 0 : dt; // ?fish=jump：跳鱼和波纹定格（截图用）
      const busy = DEMO ? 1e9 : (hour > 5 && hour < 8) || (hour > 17 && hour < 19.5) ? 0.5 : night > 0.5 ? 3 : 1; // 清早傍晚跳得勤，夜里少
      for (const W of all) {
        const { b, fish } = W;
        W.shadows.material.opacity = W.shadows.material.userData.alpha * (1 - 0.6 * night);
        for (let i = 0; i < fish.length; i++) {
          const f = fish[i];
          if (f.jumping) { W.shadows.setMatrixAt(i, hide); continue; }
          if (f.pause > 0) {
            f.pause -= dt;
            f.v = Math.max(0, f.v - dt * 0.5);
            if (!b.jumps) f.a += Math.atan2(Math.sin(-f.a), Math.cos(-f.a)) * Math.min(1, dt * 0.6); // 溪里的鱼停下来：慢慢掉头顶着水（鱼头朝东）
          } else {
            const dx = f.tx - f.x, dz = f.tz - f.z;
            if (Math.hypot(dx, dz) < 0.25) { f.pause = rand() < 0.5 ? 0.5 + rand() * 4 : 0; W.retarget(f); }
            else {
              const da = Math.atan2(Math.sin(Math.atan2(dz, dx) - f.a), Math.cos(Math.atan2(dz, dx) - f.a));
              f.a += Math.sign(da) * Math.min(Math.abs(da), dt * 2.5);
              f.v += ((Math.abs(da) > 1 ? f.cruise * 0.4 : f.cruise) - f.v) * Math.min(1, dt * 1.5);
            }
          }
          const nx = f.x + Math.cos(f.a) * f.v * dt, nz = f.z + Math.sin(f.a) * f.v * dt;
          if (W.ok(nx, nz)) { f.x = nx; f.z = nz; f.y = W.ys.get(W.key(nx, nz)) ?? f.y; }
          else { f.v = 0; W.retarget(f); }
          f.wig += dt * (3 + f.v * 14);
          const yaw = f.a + Math.sin(f.wig) * (0.08 + f.v * 0.4); // 摆尾巴：游得越快摆得越凶
          W.shadows.setMatrixAt(i, m4.compose(p3.set(f.x, f.y + 0.03, f.z), q.setFromAxisAngle(up, -yaw), s3.set(f.s, 1, f.s)));
        }
        W.shadows.instanceMatrix.needsUpdate = true;

        // 啜水：随便一条鱼游上来点一圈小涟漪（只放前 5 帧，不荡那么开）
        if (!DEMO && (W.nextRise -= dt) <= 0) {
          W.nextRise = (2 + rand() * 6) * (night > 0.5 ? 2 : 1);
          const f = fish[Math.floor(rand() * fish.length)];
          if (!f.jumping) ripple(W, f.x + Math.cos(f.a) * 0.3 * f.s, f.y, f.z + Math.sin(f.a) * 0.3 * f.s, 5);
        }
        // 跳鱼：湖心的一条鱼顺着游的方向跃出水面
        if (b.jumps && !W.jump && (W.nextJump -= dt) <= 0) {
          W.nextJump = (4 + rand() * 10) * busy;
          const cand = fish.filter((f) => W.deepSet.has(W.key(f.x, f.z)));
          const f = cand[Math.floor(rand() * cand.length)];
          if (f) {
            const dist = 0.9 + rand() * 0.7, ex = f.x + Math.cos(f.a) * dist, ez = f.z + Math.sin(f.a) * dist;
            f.jumping = true;
            W.jump = { f, t: 0, T: 0.75 + rand() * 0.25, x0: f.x, z0: f.z, y0: f.y, dist, h: 0.4 + rand() * 0.35, land: W.ok(ex, ez), mesh: W.jumper[f.kind] };
            W.jump.mesh.visible = true;
            ripple(W, f.x, f.y, f.z, RF);
          }
        }
        if (W.jump) {
          const J = W.jump, f = J.f;
          J.t += dj;
          const u = Math.min(1, J.t / J.T);
          J.mesh.position.set(J.x0 + Math.cos(f.a) * J.dist * u, J.y0 - 0.1 + 4 * J.h * u * (1 - u) + 0.1 * Math.sin(Math.PI * u), J.z0 + Math.sin(f.a) * J.dist * u);
          J.mesh.rotation.set(0, -f.a, Math.atan2(4 * J.h * (1 - 2 * u), J.dist), 'YZX');
          J.mesh.scale.setScalar(f.s * 1.1);
          if (u >= 1) { // 落水：荡开一圈，鱼影从落水的地方接着往前窜一段
            J.mesh.visible = false;
            if (J.land) { f.x = J.x0 + Math.cos(f.a) * J.dist; f.z = J.z0 + Math.sin(f.a) * J.dist; }
            ripple(W, f.x, f.y, f.z, RF);
            f.jumping = false;
            f.v = f.cruise * 3;
            f.pause = 0;
            W.retarget(f);
            W.jump = null;
          }
        }
        for (const r of W.ripples) {
          if (!r.visible) continue;
          const D = r.userData.frames === RF ? 1.8 : 0.9; // 跳鱼的大圈荡 1.8 秒，啜水的小圈 0.9 秒
          r.userData.t += dj;
          const k = r.userData.t / D, fr = Math.floor(k * r.userData.frames);
          if (fr >= r.userData.frames) { r.visible = false; continue; }
          r.material.map.offset.x = fr / RF;
          r.material.opacity = 0.85 * (1 - 0.6 * k);
          r.material.color.copy(ripBase).multiplyScalar(1 - 0.65 * night);
        }
      }
    },
  };
}
