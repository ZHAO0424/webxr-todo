import * as THREE from 'three';

/** 沙盘中心离眼睛多远（米）、比眼睛低多少——一臂之内、略低于视线，落在正前方视锥里。 */
const DISTANCE = 1.05;
const DROP = 0.38;

// 双手握持
const NEAR = 0.35, FAR = 3;       // 拉近拉远：沙盘中心离眼睛最近 / 最远（米）
const MIN_SPAN = 0.05;            // 两手间距小于 5 厘米不认（比值会爆）
const SETTLE = 150;                // 两手刚捏上的 150 毫秒不算动作（捏合那一下手指收拢，捏合点会跳）
const LOCK = 0.015;               // 推拉：从握住算起间距变了 1.5 厘米才分类：静握、手抖不触发
const PAN_LOCK = 0.03;            // 平移：中点挪够 3 厘米、连线还没怎么转才定（绕胸前转时中点也在横移，要多等一点看连线转没转）
const DECIDE = 0.05;              // 平移攒到 5 厘米、两手连线又没转够：就算平移
const ROT_ANGLE = 8 * Math.PI / 180;  // 两手连线转过 8° 算转（一起拖时一只手慢半拍，连线也就歪两三度）
const PAN_ANGLE = 4 * Math.PI / 180;  // 连线转得不到 4° 才能早早定成平移
const DOMINANCE = 1.5;            // 推拉要比平移大这么多倍
const WHEEL = 120 * Math.PI / 180; // 上下反向错动：每米转多少弧度
const TURN = 1;                   // 两手连线水平转角 → 沙盘转角（1：跟手）

/**
 * 进入 XR 后把场景摆到"当前头的正前方"。
 *
 * 用 'local' 参考空间而不是 'local-floor'：VITURE runtime 的 LOCAL_FLOOR 高度取决于
 * SLAM 启动时眼镜在哪，可能在天上也可能在桌面（见 webxr-场景高度-排查）。
 * 以头为准就不依赖地板。进 XR 时马上摆好；之后快速捏两下（0.4 秒内两次扳机 / 捏合）或系统重新定位（reference space reset），
 * 沙盘用半秒滑到眼前（不瞬移）。onSelect(射线) 返回 true 时（指着沙盘边上的路牌）拿去换场景；否则单手捏一下 = onTap(射线)，
 * 和鼠标点场景一样（指着谁弹谁的卡片），不动沙盘。双手握住开始拖 / 转 / 推拉、沙盘开始滑回眼前时调 onMove()（收起卡片）。
 *
 * 双手同时捏合 = 握住沙盘（手感照 HexCity 的 CityGrip / Skyvine 的 SceneRotator）：
 * 从握住那一刻算起累计两手的运动，分清以后锁定到松手——一次拖拽不会中途变成旋转：
 *   平移 = 两手中点挪了多远                    两手一起动          → 平移（上下左右前后都跟手）
 *   推拉 = 两手间距变了多少                    拉开 / 收拢         → 拉近 / 推远（沿"眼睛 → 沙盘"那条线，不改缩放）
 *   转   = 两手连线转过的角度：水平面里的转角，或者竖直方向的倾角（方向盘）——哪个方向转都行
 *          → 绕竖轴转（水平转多少沙盘转多少，方向盘上下错动也转）
 * 转看的是连线的角度而不是手走了多远：绕着胸前转（转轴在身体这边）时两手中点也在大幅横移，按距离比会被当成平移；
 * 而两手一起拖时连线方向几乎不变（一只手慢半拍也只歪两三度）。连线转过 8° 算转；转得不到 4° 且中点挪够 3 厘米算平移；
 * 间距变化比中点挪动大 1.5 倍算推拉。分清之前已经做出的那段平移 / 转动在锁定时一次补上，不丢手。
 * 用累计量而不是每帧的增量：一帧只动一两毫米，两手稍不同步、手部追踪抖一下，单帧就会误判；刚捏上的 150 毫秒不算（手指收拢时捏合点会跳）。
 * 握过的这一下，松手时不算捏合（不会算进双击）。
 *
 * 指向（射线比手柄 / 手的指向朝下 20°，点选、路牌、落点都按这条线）：每只手一条细射线 + 落点一个像素小光点（捏住时变大），看得出自己指着谁。aim(起点, 方向) 返回打到东西的距离（没打到 null），
 * 每只手每 4 帧测一次、两只手错开（射线检测不便宜）；没指着东西时射线画 1.5 米、没有光点；双手握住时都藏起来。
 */
const RAY_LEN = 1.5;
const RAY_TILT = -20 * Math.PI / 180; // 射线比手的指向朝下 20°：手不用抬高，自然垂着腕子就能指到桌上的沙盘

/** 落点光点：5×5 像素菱形，深色描边、金色、白芯。 */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 5;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const d = Math.abs(x - 2) + Math.abs(y - 2); if (d <= 2) px(x, y, d === 2 ? '#120e0a' : d === 1 ? '#ffcc66' : '#fff6e6'); }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAnchor(renderer, root, { scene, aim, onSession, onSelect, onTap, onMove } = {}) {
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
    for (const h of hands) h.dot.visible = false;
    onSession?.(false);
  });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const lineMat = new THREE.LineBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.5, depthTest: false, depthWrite: false });
  const dotMap = dotTexture();
  // 每只手：捏着没有、是左手还是右手；有手部追踪就用拇指尖和食指尖的中点当捏合点，没有就用手柄 / 指向射线的位置
  const hands = [0, 1].map((i) => {
    const h = { ctrl: xr.getController(i), grip: xr.getControllerGrip(i), hand: xr.getHand(i), pinch: false, side: i ? 'right' : 'left', pos: new THREE.Vector3() };
    h.ctrl.addEventListener('connected', (e) => { h.side = e.data?.handedness === 'left' ? 'left' : e.data?.handedness === 'right' ? 'right' : h.side; });
    h.ctrl.addEventListener('disconnected', () => { h.pinch = false; });
    h.ctrl.addEventListener('selectstart', () => { h.pinch = true; });
    h.ctrl.addEventListener('selectend', () => { h.pinch = false; });
    h.ctrl.addEventListener('select', (e) => { // 单手捏一下 = 点一下（不动沙盘）；快速捏两下才重新摆到眼前，而且是滑过去
      if (gripUsed || onSelect?.(h.aim)) return; // 双手握过 / 指着路牌换场景
      const now = performance.now();
      if (now - lastTap < 400) { pending = 'glide'; lastTap = -Infinity; } else { lastTap = now; onTap?.(h.aim); }
    });
    h.aim = new THREE.Object3D(); // 真正用来指的那条线：手的指向往下压 20°
    h.aim.rotation.x = RAY_TILT;
    h.ctrl.add(h.aim);
    h.line = new THREE.Line(lineGeo, lineMat);
    h.line.renderOrder = 99; h.line.frustumCulled = false;
    h.aim.add(h.line);
    h.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotMap, depthTest: false, depthWrite: false, toneMapped: false }));
    h.dot.renderOrder = 101; h.dot.visible = false;
    h.dist = null;
    scene?.add(h.ctrl, h.dot);
    return h;
  });
  const pinchPos = (h) => {
    const a = h.hand.joints?.['thumb-tip'], b = h.hand.joints?.['index-finger-tip'];
    if (a?.visible && b?.visible) return h.pos.addVectors(a.position, b.position).multiplyScalar(0.5);
    if (h.grip.visible) return h.pos.copy(h.grip.position);
    return h.pos.copy(h.ctrl.position);
  };

  // 握持状态
  let gripping = false, gripUsed = false, mode = null, baseSpan = 0, gripT0 = 0, baseYaw = 0, baseDy = 0;
  const startL = new THREE.Vector3(), startR = new THREE.Vector3(), mid = new THREE.Vector3(), catchPos = new THREE.Vector3();
  let catchYaw = 0;
  const lastL = new THREE.Vector3(), lastR = new THREE.Vector3(), dL = new THREE.Vector3(), dR = new THREE.Vector3();
  const together = new THREE.Vector3();
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
    const yawOf = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);
    const rebase = () => { // 从现在起算累计量
      lastL.copy(pl); lastR.copy(pr); startL.copy(pl); startR.copy(pr);
      baseSpan = pl.distanceTo(pr); baseYaw = yawOf(pl, pr); baseDy = pr.y - pl.y;
      baseEye.copy(viewer); baseRoot.copy(root.position);
    };
    if (!gripping) { // 握住的第一帧：只建参照，不动（不跳）
      gripping = true; mode = null; dollying = false; gripT0 = performance.now(); catchPos.set(0, 0, 0); catchYaw = 0;
      rebase();
      return;
    }
    if (!mode && performance.now() - gripT0 < SETTLE) { rebase(); return; } // 手指还在收拢
    dL.subVectors(pl, lastL); dR.subVectors(pr, lastR);
    if (!mode) { // 还没分清：看从握住起累计了多少
      const span = pl.distanceTo(pr);
      const pan = mid.addVectors(pl, pr).sub(startL).sub(startR).multiplyScalar(0.5).length();
      const zoom = Math.abs(span - baseSpan);
      let dyaw = yawOf(pl, pr) - baseYaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const lift = (pl.y - startL.y) - (pr.y - startR.y); // 方向盘：左手比右手多抬了多少
      const ang = Math.max(Math.abs(dyaw), Math.abs(lift) / Math.max(span, MIN_SPAN)); // 连线转过的角度（水平 / 竖直取大的）
      if (zoom > LOCK && zoom > DOMINANCE * pan && ang < ROT_ANGLE) mode = 'zoom';
      else if (ang > ROT_ANGLE) mode = 'rotate';
      else if ((pan > PAN_LOCK && ang < PAN_ANGLE && pan >= zoom) || pan > DECIDE) mode = 'pan';
      if (mode) onMove?.(); // 分出是拖、推拉还是转了：收起卡片（静握不算）
      if (mode === 'pan') catchPos.copy(mid); // 分清之前攒下的那段平移、转动接下来几帧补上（不丢手，也不一下跳过去）
      if (mode === 'rotate') catchYaw = -dyaw * TURN - lift * WHEEL;
    } else if (mode === 'pan') root.position.add(together.addVectors(dL, dR).multiplyScalar(0.5));
    if (mode === 'zoom') { // 拉开 = 拉近：沿握住那一刻"眼睛 → 沙盘"的固定轴，按起始间距 / 当前间距的比值定远近（不累积漂移）
      const span = pl.distanceTo(pr);
      const ax = eye.subVectors(baseRoot, baseEye), d0 = ax.length();
      if (span > MIN_SPAN && baseSpan > MIN_SPAN && d0 > 1e-4) {
        const want = THREE.MathUtils.clamp(d0 * (baseSpan / span), NEAR, FAR);
        dolly.copy(baseRoot).addScaledVector(ax, (want - d0) / d0);
        dollying = true;
      }
    } else if (mode === 'rotate') {
      let a = -(dL.y - dR.y) * WHEEL; // 方向盘：左手往上、右手往下 → 从上往下看顺时针
      const a0 = yawOf(lastL, lastR), a1 = yawOf(pl, pr);
      a += -Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) * TURN; // 转盘：两手连线水平转了多少
      root.rotation.y += a;
    }
    if (catchYaw || catchPos.lengthSq()) { // 补上分清之前的那段，每帧补剩下的 30%
      root.position.addScaledVector(catchPos, 0.3); catchPos.multiplyScalar(0.7);
      root.rotation.y += catchYaw * 0.3; catchYaw *= 0.7;
      if (Math.abs(catchYaw) < 1e-4 && catchPos.lengthSq() < 1e-8) { root.position.add(catchPos); root.rotation.y += catchYaw; catchPos.set(0, 0, 0); catchYaw = 0; }
    }
    lastL.copy(pl); lastR.copy(pr);
  }

  const q = new THREE.Quaternion();
  const viewer = new THREE.Vector3();
  const f = new THREE.Vector3();
  const ro = new THREE.Vector3(), rd = new THREE.Vector3();
  let tick = 0;

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
        if (pending === 'glide') { onMove?.(); dollying = false; } // 推拉的收尾停掉，不然滑过去又被拉回来
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
      if (dollying) { root.position.lerp(dolly, 0.35); if (root.position.distanceToSquared(dolly) < 1e-8) dollying = false; } // 推拉稍微平滑一下
      root.updateMatrixWorld(true);
      tick = (tick + 1) % 4;
      hands.forEach((h, i) => { // 射线 + 落点
        const on = h.ctrl.visible && !gripping;
        h.line.visible = on;
        if (!on) { h.dot.visible = false; h.dist = null; return; }
        h.aim.updateWorldMatrix(true, false);
        ro.setFromMatrixPosition(h.aim.matrixWorld);
        rd.set(0, 0, -1).transformDirection(h.aim.matrixWorld);
        if (tick === i * 2) h.dist = aim?.(ro, rd) ?? null;
        h.line.scale.z = h.dist ?? RAY_LEN;
        h.dot.visible = h.dist != null;
        if (h.dot.visible) {
          h.dot.position.copy(ro).addScaledVector(rd, h.dist);
          const s = (0.004 + 0.012 * h.dist) * (h.pinch ? 1.5 : 1);
          h.dot.scale.set(s, s, 1);
        }
      });
      return true;
    },
  };
}
