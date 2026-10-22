import * as THREE from 'three';

/** 沙盘中心离眼睛多远（米）、比眼睛低多少——一臂之内、略低于视线，落在正前方视锥里。 */
const DISTANCE = 1.05;
const DROP = 0.38;

/**
 * 进入 XR 后把场景摆到"当前头的正前方"。
 *
 * 用 'local' 参考空间而不是 'local-floor'：VITURE runtime 的 LOCAL_FLOOR 高度取决于
 * SLAM 启动时眼镜在哪，可能在天上也可能在桌面（见 webxr-场景高度-排查）。
 * 以头为准就不依赖地板。手柄扳机 / 手势捏合 / 参考空间 reset 都会重新摆一次——
 * 除非 onSelect(手柄) 返回 true（扳机点中了沙盘边上的路牌，拿去换场景，不重新摆）。
 */
export function createAnchor(renderer, root, { onSession, onSelect } = {}) {
  const xr = renderer.xr;
  xr.setReferenceSpaceType('local');
  let pending = false;

  xr.addEventListener('sessionstart', () => {
    pending = true;
    // 刷新率：不申请的话不少眼镜默认只跑 60 / 72Hz。设备支持的话要最高的那档（90 / 120）
    const session = xr.getSession(), rates = session?.supportedFrameRates;
    if (rates?.length && session.updateTargetFrameRate) {
      const best = Math.max(...rates);
      if (best > (session.frameRate ?? 0)) session.updateTargetFrameRate(best).catch(() => {});
    }
    xr.getReferenceSpace()?.addEventListener('reset', () => { pending = true; });
    onSession?.(true);
  });
  xr.addEventListener('sessionend', () => {
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    onSession?.(false);
  });
  for (const i of [0, 1]) xr.getController(i).addEventListener('select', (e) => { if (!onSelect?.(e.target)) pending = true; });

  const q = new THREE.Quaternion();
  const f = new THREE.Vector3();

  return {
    recenter() { pending = true; },

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
        root.position.set(p.x + f.x * DISTANCE, p.y - DROP, p.z + f.z * DISTANCE);
        root.rotation.set(0, Math.atan2(-f.x, -f.z), 0); // 让沙盘正面（+z）朝向观察者
        root.updateMatrixWorld(true);
        pending = false;
      }
      return true;
    },
  };
}
