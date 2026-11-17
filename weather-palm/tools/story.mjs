// 录像分镜：每个分镜 = 开场场景 + 时长 + 每帧在页面里跑的代码（字符串，参数 P = window.__palm、t = 秒、dt = 每帧秒数）。
// 每帧代码负责：摆合成手（P.hand）、摆相机（P.camera）、推进模拟（P.frame(n, dt)，n > 1 就是快进）。渲染和截图由 record.mjs 做。
// 页面里的持久状态放 window.__rec。
// 演示片公共工具（拼在每帧代码前面）：相机、一次性动作、按键、插值
const LIB = `
  const R = window.__rec ??= { once: new Set() };
  const once = (k, fn) => { if (!R.once.has(k)) { R.once.add(k); fn(); } };
  const key = code => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };
  const pickTool = name => { const T = P.S.TOOLS; key('Digit5'); for (let i = 0; i < T.indexOf(name); i++) key('BracketRight'); };
  const lerp = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k));
  const ease = k => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
  const cam = (yaw, dist, h, ty = 0.05) => { P.camera.position.set(Math.sin(yaw) * dist, h, Math.cos(yaw) * dist); P.camera.lookAt(0, ty, 0); };
  const seg = (a, b) => t >= a && t < b;
  const k = (a, b) => ease((t - a) / (b - a));
`;

export const STORIES = {
  // 排查：选岩浆、捏住倒 6 秒
  lavatest: {
    scene: 'barren', seconds: 6,
    frame: LIB + `
      once('pick', () => pickTool('lava'));
      cam(0.6, 0.45, 0.3, 0.04);
      P.hand(0, process_pose, [0.0, 0.17, 0.05]);
      P.frame(1, dt);
    `.replace('process_pose', "'" + (process.env.POSE || 'pinch') + "'"),
  },
  // 正式演示片（约 72 秒）：荒岛 → 下雨 → 变绿 / 动物来 → 彩虹 → 风 → 雷 → 倒岩浆遇水成石 → 夜 → 收尾
  demo: {
    scene: 'barren',
    seconds: 72,
    // 桌面的"鼠标手"：指针在画布上就会画出来，录像时让指针离开画布把它关掉
    setup: () => window.__palm.renderer.domElement.dispatchEvent(new PointerEvent('pointerleave')),
    frame: LIB + `
      const L = P.S.LAYOUT, m0 = L.meadows[0], pk = L.peaks[0], lk = L.lakes[0];
      let speed = 1;   // 每个画面帧推进几帧模拟（快进）
      // 镜头：一直慢慢绕岛，各段推近 / 拉远
      const yaw = 0.25 + t * 0.012;
      if (t < 5) { cam(yaw - 0.3 + 0.3 * k(0, 5), lerp(0.75, 0.6, k(0, 5)), lerp(0.42, 0.34, k(0, 5))); P.hand(0, null); }
      // 1 下雨：手掌朝下悬在草甸上，云聚起来、下雨
      else if (seg(5, 14)) { cam(yaw, 0.58, 0.34, 0.07); P.hand(0, 'down', [lerp(m0.x - 0.03, m0.x + 0.03, (t - 5) / 9), 0.16, m0.z]); }
      // 2 快进：手在岛上慢慢扫，岛一片片变绿、树长出来、动物来
      else if (seg(14, 26)) {
        cam(yaw, 0.6, 0.35, 0.05); speed = 18;
        const a = (t - 14) * 0.9;
        P.hand(0, 'down', [Math.sin(a) * 0.07 - 0.02, 0.16, Math.cos(a * 0.7) * 0.06 + 0.02]);
      }
      // 3 收手：雨停、彩虹
      else if (seg(26, 34)) { cam(yaw, lerp(0.6, 0.5, k(26, 34)), 0.32, 0.06); P.hand(0, null); }
      // 4 刮风：立掌横扫
      else if (seg(34, 41)) {
        cam(yaw, 0.5, 0.31, 0.06);
        const ph = ((t - 34) % 1.6) / 1.6;
        P.hand(0, 'edge', [-0.13 + ph * 0.26, 0.12, 0.03], 0, 'right', [1, 0]);
      }
      // 5 打雷：握拳蓄力再张开，劈在山尖
      else if (seg(41, 49)) {
        cam(yaw, lerp(0.5, 0.46, k(41, 49)), 0.33, 0.08);
        const p = [pk.x, 0.19, pk.z + 0.02];
        const c = (t - 41) % 4;
        P.hand(0, c < 1.6 ? 'down' : c < 2.6 ? 'fist' : 'down', p);
      }
      // 6 倒岩浆：捏住，岩浆从指尖冲出来，流向湖、遇水冒汽变石头
      else if (seg(49, 60)) {
        once('lava', () => pickTool('lava'));
        cam(yaw + 0.4, lerp(0.5, 0.42, k(49, 60)), 0.3, 0.05);
        // "倒"的姿势（立掌、指尖朝下）：岩浆从指尖冲出一道弧，落在湖上方的草地，往湖里流、遇水冒汽变石头
        P.hand(0, t < 57 ? 'pour' : null, [lk.x - 0.004, 0.16, lk.z - 0.05], -0.6);
      }
      // 7 夜：快进到晚上，萤火、水晶、发光蘑菇
      else if (seg(60, 68)) {
        once('night', () => { pickTool('water'); key('Digit1'); });
        P.hand(0, null); cam(yaw, lerp(0.42, 0.55, k(60, 68)), 0.34, 0.05);
        // 直接推时间：傍晚 → 夜（快进会跳过头绕回早上）
        P.setWorld({ day: lerp(0.6, 0.86, k(60, 64)) });
      }
      // 收尾：拉远
      else { P.hand(0, null); cam(yaw, lerp(0.55, 0.7, k(68, 72)), lerp(0.34, 0.4, k(68, 72)), 0.04); }
      P.frame(speed, dt);
    `,
  },

  // 可行性探针：荒岛上下 4 秒雨，相机慢慢绕
  probe: {
    scene: 'barren',
    seconds: 4,
    frame: `
      const R = window.__rec ??= { };
      const a = 0.35 + t * 0.05, d = 0.5;
      P.camera.position.set(Math.sin(a) * d, 0.29, Math.cos(a) * d);
      P.camera.lookAt(0, 0.03, 0);
      P.hand(0, 'down', [-0.045, 0.17, 0.02]);
      P.frame(1, dt);
    `,
  },
};
