import * as THREE from 'three';
import { UNIT, block, decal, paint, toTexture, toon } from './pixel.js';
import { R, INK } from './palette.js';

/*
 * 换场景：村子 ⇄ 西沟。几块沙盘在同一个世界里（西沟接在村子西边）。换的时候当前这块直接藏起来，
 * 空一小会儿（GAP 秒），世界平移过去，新的一块再出来——不做缩放之类的特效。平时只画当前这一块（XR 里每个网格要画两遍）。
 * 不显示的那块照样在模拟（村民该干嘛干嘛）。
 *   桌面：屏幕左右两边的像素按钮（index.html 的 #goLeft / #goRight），键盘 ← →
 *   XR：沙盘两侧各插一块木路牌，手柄扳机 / 捏合指着它就换（不会重新摆沙盘，见 xr.js 的 onSelect）
 * scenes 从东往西排：往左（西）走 = 下标 +1。
 */

const GAP = 0.25; // 藏起来以后空多久再出新的一块（秒）

/** 路牌上的画：木板 + 金色箭头 + 那边是什么（西沟：红石崖和松树；村子：灰瓦房）。 */
function signArt(left) {
  return paint(32, 14, (g) => {
    g.rect(0, 0, 32, 14, INK);
    g.rect(1, 1, 30, 12, R.wood[3]);
    g.rect(1, 1, 30, 1, R.wood[4]);
    g.rect(1, 12, 30, 1, R.wood[2]);
    const ax = left ? 3 : 29, s = left ? 1 : -1; // 箭头
    for (let i = 0; i < 5; i++) g.rect(ax + s * i, 7 - i, 1, 1 + 2 * i, INK);
    for (let i = 1; i < 5; i++) g.rect(ax + s * i, 8 - i, 1, 2 * i - 1, R.gold[4]);
    g.rect(left ? ax + 5 : ax - 12, 5, 8, 4, INK);
    g.rect(left ? ax + 5 : ax - 12, 6, 8, 2, R.gold[3]);
    const px = left ? 19 : 4; // 小画
    if (left) {
      g.rect(px, 4, 9, 7, R.rock[3]); g.rect(px, 4, 9, 1, R.rock[5]); g.rect(px, 7, 9, 1, R.rock[2]);
      g.rect(px + 6, 2, 1, 3, R.wood[1]); g.rect(px + 4, 2, 5, 1, R.green[2]); g.rect(px + 5, 1, 3, 1, R.green[3]);
      g.rect(px + 2, 8, 1, 3, R.water[4]);
    } else {
      g.rect(px, 7, 9, 4, R.brick[3]); g.rect(px - 1, 5, 11, 2, R.roof[2]); g.rect(px, 4, 9, 1, R.roof[3]);
      g.rect(px + 3, 8, 2, 3, R.redwood[2]); g.rect(px + 6, 8, 2, 2, '#ffb35a');
    }
  });
}

/** 一块路牌：木杆 + 画着箭头的木板。以村里的米为单位建，摆的时候整体缩到沙盘大小。 */
function signpost(M, left) {
  const g = new THREE.Group();
  const tex = toTexture(signArt(left));
  const board = decal(tex, toon(tex, { alphaTest: 0.5, side: THREE.DoubleSide }));
  board.position.y = 2.2;
  g.add(block(-0.08, 0, -0.08, 0.08, 2.6, 0.08, M.wood), board);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 1.6), new THREE.MeshBasicMaterial({ visible: false })); // 指得准不准都算
  hit.position.y = 1.9;
  g.add(hit);
  g.scale.setScalar(UNIT * 2.5);
  return { group: g, hit };
}

/**
 * world：装着所有沙盘的组（挂在 stage 下）；scenes: [{ id, name, object, shift（这块中心在世界 x 的哪儿，米）}]；
 * start：开始在哪块；onChange(scene)：换过去的那一刻（关卡片之类）；showAll：几块都画（检查接缝用）。
 * 返回 { current, busy, go(step), update(dt, inXR), onSelect(controller) }。
 */
export function createSceneSwitch({ world, stage, scenes, M, start = 0, onChange, showAll = false }) {
  let cur = start, slide = null;
  const showOnly = () => scenes.forEach((s, i) => { s.object.visible = showAll || i === cur; });
  world.position.x = scenes[cur].shift * UNIT;
  showOnly();

  // 桌面按钮：左边去西边那块，右边回东边那块；上面写着那块叫什么
  const buttons = [['goLeft', 1], ['goRight', -1]].map(([id, step]) => {
    const el = document.getElementById(id);
    el?.addEventListener('click', (e) => { e.stopPropagation(); go(step); });
    return { el, step };
  });
  const sync = () => {
    for (const { el, step } of buttons) {
      if (!el) continue;
      const to = scenes[cur + step];
      el.hidden = !to;
      if (to) el.querySelector('.label').textContent = to.name;
    }
    document.documentElement.dataset.scene = scenes[cur].id;
  };
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(1);
    if (e.key === 'ArrowRight') go(-1);
  });

  // XR 路牌：沙盘左右两侧外面，靠前一点（那里地势低，不被山挡住）
  const signs = [[true, 1], [false, -1]].map(([left, step]) => {
    const s = signpost(M, left);
    s.group.position.set((left ? -48 : 48) * UNIT, -3.8 * UNIT, 28 * UNIT);
    s.group.visible = false;
    stage.add(s.group);
    return { ...s, step };
  });
  const ray = new THREE.Raycaster(), rot = new THREE.Matrix4();

  /** quiet：跟着人走过去的（镜头在跟随），不算"换场景"，不关卡片。 */
  function go(step, quiet = false) {
    const next = cur + step;
    if (slide || !scenes[next]) return false;
    slide = { from: scenes[cur], to: scenes[next], t: 0 };
    cur = next;
    sync();
    if (!quiet) onChange?.(scenes[cur]);
    return true;
  }
  sync();

  return {
    get current() { return scenes[cur]; },
    get busy() { return !!slide; },
    get signs() { return signs.filter((s) => s.group.visible).map((s) => s.hit); }, // XR 里看得见的路牌（射线落点用）
    go,
    update(dt, inXR) {
      if (slide) {
        slide.from.object.visible = showAll; // 当前这块先藏起来
        slide.t += dt;
        if (slide.t >= GAP) { world.position.x = slide.to.shift * UNIT; showOnly(); slide = null; } // 空一下，新的一块出来
      }
      for (const s of signs) s.group.visible = inXR && !!scenes[cur + s.step];
    },
    /** XR 里扳机 / 捏合：指着路牌就换场景，返回 true（不再重新摆沙盘）。 */
    onSelect(controller) {
      controller.updateWorldMatrix(true, false);
      rot.identity().extractRotation(controller.matrixWorld);
      ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      ray.ray.direction.set(0, 0, -1).applyMatrix4(rot);
      const hit = ray.intersectObjects(signs.filter((s) => s.group.visible).map((s) => s.hit), false)[0];
      const sign = hit && signs.find((s) => s.hit === hit.object);
      return sign ? go(sign.step) : false;
    },
  };
}
