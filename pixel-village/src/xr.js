import * as THREE from 'three';

/** 沙盘中心离眼睛多远（米）、比眼睛低多少——一臂之内、略低于视线，落在正前方视锥里。 */
const DISTANCE = 1.05;
const DROP = 0.38;

// 双手握持
const NEAR = 0.35, FAR = 3;       // 拉近拉远：沙盘中心离眼睛最近 / 最远（米）
const MIN_SPAN = 0.05;            // 两手间距小于 5 厘米不认（比值会爆）
const DOMINANCE = 1.5;            // 胜出的分量要比另外两个大这么多倍才算分清
const EPS = 0.004;                // 一帧动不到 4 毫米不分类：静握不触发
const WHEEL = 120 * Math.PI / 180; // 上下反向错动：每米转多少弧度
const TURN = 0.9;                 // 两手连线水平转角 → 沙盘转角

/**
 * 进入 XR 后把场景摆到"当前头的正前方"。
 *
 * 用 'local' 参考空间而不是 'local-floor'：VITURE runtime 的 LOCAL_FLOOR 高度取决于
 * SLAM 启动时眼镜在哪，可能在天上也可能在桌面（见 webxr-场景高度-排查）。
 * 以头为准就不依赖地板。进 XR 时马上摆好；之后快速捏两下（0.4 秒内两次扳机 / 捏合）或系统重新定位（reference space reset），
 * 沙盘用半秒滑到眼前（不瞬移）。onSelect(手柄) 返回 true 时（指着沙盘边上的路牌）拿去换场景；否则单手捏一下 = onTap(手柄)，
 * 和鼠标点场景一样（指着谁弹谁的卡片），不动沙盘。双手握住开始拖 / 转 / 推拉、沙盘开始滑回眼前时调 onMove()（收起卡片）。
 *
 * 双手同时捏合 = 握住沙盘（手感照 HexCity 的 CityGrip / Skyvine 的 SceneRotator）：
 * 每帧把两手的运动分成三个正交分量，第一次分清后锁定到松手——一次拖拽不会中途变成旋转：
 *   together = (dL + dR) / 2              两手一起动          → 平移（上下左右前后都跟手）
 *   opposite = dL - dR 沿两手连线的分量    拉开 / 收拢         → 拉近 / 推远（沿"眼睛 → 沙盘"那条线，不改缩放）
 *   opposite 垂直连线的分量                反向错动            → 绕竖轴转（两手连线转多少沙盘转多少，再加上下错动的方向盘）
 * 握过的这一下，松手时不算捏合（不会算进双击）。
 */
export function createAnchor(renderer, root, { onSession, onSelect, onTap, onMove } = {}) {
  const xr = renderer.xr;
  xr.setReferenceSpaceType('local');
  let pending = false; // true：马上摆好（刚进 XR）；'glide'：半秒滑过去（双击捏合、系统重新定位）
  let glide = null; // 正在滑过去：{ from, to, yaw0, yaw1, t0 }
  let lastTap = -Infinity; // 上一次单手捏合松开的时间（两下挨得近 = 双击）

  xr.addEventListener('sessionstart', () => {
    pending = true;
    // 刷新率：不申请的话不少眼镜默认只跑 60 / 72Hz。设备支持的话要最高的那档（90 / 120）
    const session = xr.getSession(), rates = session?.supportedFrameRates;
    if (rates?.length && session.updateTargetFrameRate) {
      const best = Math.max(...rates);
      if (best > (session.frameRate ?? 0)) session.updateTargetFrameRate(best).catch(() => {});
    }
    xr.getReferenceSpace()?.addEventListener('reset', () => { pending = 'glide'; });
    onSession?.(true);
  });
  xr.addEventListener('sessionend', () => {
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    onSession?.(false);
  });
  // 每只手：捏着没有、是左手还是右手；有手部追踪就用拇指尖和食指尖的中点当捏合点，没有就用手柄 / 指向射线的位置
  const hands = [0, 1].map((i) => {
    const h = { ctrl: xr.getController(i), grip: xr.getControllerGrip(i), hand: xr.getHand(i), pinch: false, side: i ? 'right' : 'left', pos: new THREE.Vector3() };
    h.ctrl.addEventListener('connected', (e) => { h.side = e.data?.handedness === 'left' ? 'left' : e.data?.handedness === 'right' ? 'right' : h.side; });
    h.ctrl.addEventListener('disconnected', () => { h.pinch = false; });
    h.ctrl.addEventListener('selectstart', () => { h.pinch = true; });
    h.ctrl.addEventListener('selectend', () => { h.pinch = false; });
    h.ctrl.addEventListener('select', (e) => { // 单手捏一下 = 点一下（不动沙盘）；快速捏两下才重新摆到眼前，而且是滑过去
      if (gripUsed || onSelect?.(e.target)) return; // 双手握过 / 指着路牌换场景
      const now = performance.now();
      if (now - lastTap < 400) { pending = 'glide'; lastTap = -Infinity; } else { lastTap = now; onTap?.(e.target); }
    });
    return h;
  });
  const pinchPos = (h) => {
    const a = h.hand.joints?.['thumb-tip'], b = h.hand.joints?.['index-finger-tip'];
    if (a?.visible && b?.visible) return h.pos.addVectors(a.position, b.position).multiplyScalar(0.5);
    if (h.grip.visible) return h.pos.copy(h.grip.position);
    return h.pos.copy(h.ctrl.position);
  };

  // 握持状态
  let gripping = false, gripUsed = false, mode = null, baseSpan = 0;
  const lastL = new THREE.Vector3(), lastR = new THREE.Vector3(), dL = new THREE.Vector3(), dR = new THREE.Vector3();
  const together = new THREE.Vector3(), opposite = new THREE.Vector3(), axis = new THREE.Vector3(), perp = new THREE.Vector3();
  const baseEye = new THREE.Vector3(), baseRoot = new THREE.Vector3(), dolly = new THREE.Vector3(), eye = new THREE.Vector3();
  let dollying = false;

  function grip(viewer) {
    const [l, r] = hands[0].side === 'left' ? hands : [hands[1], hands[0]];
    const both = l.pinch && r.pinch;
    if (!both) {
      gripping = false; mode = null; // 推拉的平滑收尾照常做完
      if (!l.pinch && !r.pinch) gripUsed = false; // 两只手都松开了，下一次单手捏合照常
      return;
    }
    gripUsed = true;
    const pl = pinchPos(l).clone(), pr = pinchPos(r).clone();
    if (!gripping) { // 握住的第一帧：只建参照，不动（不跳）
      gripping = true; mode = null; dollying = false;
      lastL.copy(pl); lastR.copy(pr);
      baseSpan = pl.distanceTo(pr);
      baseEye.copy(viewer); baseRoot.copy(root.position);
      return;
    }
    dL.subVectors(pl, lastL); dR.subVectors(pr, lastR);
    together.addVectors(dL, dR).multiplyScalar(0.5);
    opposite.subVectors(dL, dR);
    axis.subVectors(pr, pl);
    if (axis.lengthSq() > 1e-8) {
      axis.normalize();
      const along = opposite.dot(axis);
      perp.copy(opposite).addScaledVector(axis, -along);
      const pan = together.length(), zoom = Math.abs(along), rot = perp.length();
      if (!mode) {
        if (pan > EPS && pan > zoom * DOMINANCE && pan > rot * DOMINANCE) mode = 'pan';
        else if (zoom > EPS && zoom > pan * DOMINANCE && zoom > rot * DOMINANCE) mode = 'zoom';
        else if (rot > EPS && rot > pan * DOMINANCE && rot > zoom * DOMINANCE) mode = 'rotate';
        if (mode) onMove?.(); // 分出是拖、推拉还是转了：收起卡片（静握不算）
      }
      if (mode === 'pan') root.position.add(together);
      else if (mode === 'zoom') { // 拉开 = 拉近：沿握住那一刻"眼睛 → 沙盘"的固定轴，按起始间距 / 当前间距的比值定远近（不累积漂移）
        const span = pl.distanceTo(pr);
        const ax = eye.subVectors(baseRoot, baseEye), d0 = ax.length();
        if (span > MIN_SPAN && baseSpan > MIN_SPAN && d0 > 1e-4) {
          const want = THREE.MathUtils.clamp(d0 * (baseSpan / span), NEAR, FAR);
          dolly.copy(baseRoot).addScaledVector(ax, (want - d0) / d0);
          dollying = true;
        }
      } else if (mode === 'rotate') {
        let a = -(dL.y - dR.y) * WHEEL; // 方向盘：左手往上、右手往下 → 从上往下看顺时针
        const a0 = Math.atan2(lastR.z - lastL.z, lastR.x - lastL.x), a1 = Math.atan2(pr.z - pl.z, pr.x - pl.x);
        a += -Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) * TURN; // 转盘：两手连线水平转了多少
        root.rotation.y += a;
      }
    }
    lastL.copy(pl); lastR.copy(pr);
  }

  const q = new THREE.Quaternion();
  const viewer = new THREE.Vector3();
  const f = new THREE.Vector3();

  return {
    recenter() { pending = 'glide'; },
    get gripping() { return gripping; },

    /** 读取头部位姿写入 outViewer；有待摆放时顺带摆好。没有位姿时返回 false。 */
    update(frame, outViewer) {
      const pose = frame.getViewerPose(xr.getReferenceSpace());
      if (!pose) return false;
      const { position: p, orientation: o } = pose.transform;
      outViewer.set(p.x, p.y, p.z);
      if (pending) {
        f.set(0, 0, -1).applyQuaternion(q.set(o.x, o.y, o.z, o.w));
        f.y = 0;
        if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
        f.normalize();
        const to = new THREE.Vector3(p.x + f.x * DISTANCE, p.y - DROP, p.z + f.z * DISTANCE), yaw = Math.atan2(-f.x, -f.z); // 让沙盘正面（+z）朝向观察者
        if (pending === 'glide') onMove?.();
        if (pending === 'glide') glide = { from: root.position.clone(), to, yaw0: root.rotation.y, yaw1: root.rotation.y + Math.atan2(Math.sin(yaw - root.rotation.y), Math.cos(yaw - root.rotation.y)), t0: performance.now() };
        else { glide = null; root.position.copy(to); root.rotation.set(0, yaw, 0); }
        root.updateMatrixWorld(true);
        pending = false;
      }
      if (glide) { // 半秒滑到眼前，先快后慢
        const k = Math.min(1, (performance.now() - glide.t0) / 500), e = 1 - (1 - k) ** 3;
        root.position.lerpVectors(glide.from, glide.to, e);
        root.rotation.set(0, glide.yaw0 + (glide.yaw1 - glide.yaw0) * e, 0);
        if (k >= 1 || gripping) glide = null; // 滑的时候双手握住：听手的
      }
      grip(viewer.set(p.x, p.y, p.z));
      if (dollying) root.position.lerp(dolly, 0.35); // 推拉稍微平滑一下
      return true;
    },
  };
}
