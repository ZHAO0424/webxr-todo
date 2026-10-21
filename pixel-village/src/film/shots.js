// 30 秒预告片的 8 个镜头（剪辑顺序）。每个比剪辑里用的多拍 1 秒左右，留给剪辑挑切点。
//
// 坐标都是村里的米（+x 东，+z 南）。机位点的写法：
//   { at: [x, 离地高度, z] }      固定点，高度从那里的地面算起
//   { rel: [dx, dy, dz] }         相对跟随目标（目标走，机位跟着走）
//   { stage: [x, y, z] }          沙盘坐标（米，桌面 / XR 的标准视点用这个）
//   { orbit: [半径, 高, 角度°] }  绕跟随目标转，角度 0 = 在目标正南
// look：看向点，写法同上；或者 { follow: 村民id, dy } 看向这个人。
// 时间：hour 从几点开始；until(村子) 在开拍前把村子快进到这个条件成立（最多 warm 秒），再多走 after 秒；
// speed：每帧推进几步模拟（延时镜头用，>1 就是延时）。
// ease：inOut（默认）| pull（拉远用：先慢后快再稳住，距离按指数长）。

const V = (village, id) => village.life.people.find((v) => v.p.id === id);

export const SHOTS = [
  {
    id: 'S03', name: '日出 · 炊烟', dur: 4, hour: 5.8, speed: 8, fov: 30,
    cam: [{ at: [4, 70, 78] }, { at: [3, 52, 66] }, { at: [2, 40, 58] }],
    look: [{ at: [0, 0, -2] }],
    title: '九月初五 晴',
  },
  {
    id: 'S04', name: '羊倌赶羊上坡', dur: 3, hour: 5.8, fov: 22,
    until: (vl) => { const v = V(vl, 'ma_laoliu'); return v.doing === 'herd' && v.state === 'walk' && !v.inside && vl.life.beasts.some((b) => b.s.role === 'sheep' && b.follow); },
    after: 4, warm: 400,
    target: 'ma_laoliu',
    cam: [{ rel: [7, 2.4, 3.5] }, { rel: [6, 2.2, 3] }],
    look: [{ follow: 'ma_laoliu', dy: 0.6 }],
  },
  {
    id: 'S06', name: '打铁 · 火星', dur: 3, hour: 7.5, fov: 20,
    until: (vl) => { const v = V(vl, 'zhang_tiechui'); return v.doing === 'work' && v.state !== 'walk' && !v.inside; },
    after: 2, warm: 400,
    target: 'zhang_tiechui',
    cam: [{ orbit: [4.2, 1.8, -20] }, { orbit: [4.2, 1.8, 10] }],
    look: [{ follow: 'zhang_tiechui', dy: 0.8 }],
  },
  {
    id: 'S09', name: '剃头挑子', dur: 3, hour: 7.8, fov: 18,
    until: (vl) => !!vl.life.barber.seated && V(vl, 'zheng_laotou').doing === 'work',
    after: 15, warm: 900, // 剃头 10 秒 + 刮脸 6 秒，接着是掏耳朵
    target: 'zheng_laotou',
    cam: [{ orbit: [3.2, 1.1, 25] }, { orbit: [2.9, 1.0, 32] }],
    look: [{ follow: 'zheng_laotou', dy: 0.7 }],
  },
  {
    id: 'S11', name: '打场 · 牛拉碾子', dur: 4, hour: 14.2, event: 'harvest', fov: 28,
    until: (vl) => vl.life.beasts.some((b) => b.s.role === 'ox' && b.circling),
    after: 3, warm: 600,
    target: 'ox',
    cam: [{ orbit: [1.2, 15, 0] }, { orbit: [1.2, 15, 40] }],
    look: [{ follow: 'ox', dy: 0 }],
    up: 'north', // 正俯拍：画面上方朝北，跟着机位一起转
  },
  {
    id: 'S12', name: '掌灯延时', dur: 7, hour: 17.6, speed: 20, fov: 28,
    cam: [{ at: [-30, 22, 60] }, { at: [-27, 20.5, 55] }],
    look: [{ at: [2, 0, 2] }],
  },
  {
    id: 'S14', name: '唱戏', dur: 6, hour: 18.9, event: 'opera', fov: 20,
    until: (vl) => V(vl, 'ma_laoliu').perched,
    after: 6, warm: 600,
    target: 'ma_laoliu',
    cam: [{ rel: [-0.5, 2.4, 10] }, { rel: [-0.3, 1.9, 6] }],
    look: [{ follow: 'ma_laoliu', dy: 0.9 }],
  },
  {
    id: 'S16', name: '拉远 · 原来是沙盘', dur: 7, hour: 18.9, event: 'opera', fov: 22, fovEnd: 35, ease: 'pull',
    until: (vl) => V(vl, 'ma_laoliu').perched,
    after: 14, warm: 600,
    target: 'ma_laoliu',
    cam: [{ rel: [-0.3, 1.9, 6] }, { rel: [0, 9, 22] }, { stage: [0, 0.5, 1.15] }],
    look: [{ follow: 'ma_laoliu', dy: 0.9 }, { stage: [0, 0.02, 0] }],
    fadeBlack: [0.55, 1], // 后半段天空渐黑：XR 里背景是黑的（眼镜上就是透明）
    blurEnd: 0, // 移轴在最后收掉，整个沙盘都清楚
  },
];

/** 30 秒主片的剪辑顺序和各镜头在片子里的时长（秒），合计 30。 */
export const CUT = [['S03', 3], ['S04', 2], ['S06', 2], ['S09', 2], ['S11', 3], ['S12', 6], ['S14', 5], ['S16', 7]];

/** 9:16 竖版用到的镜头和各自的时长（秒）。 */
export const VERTICAL = [['S06', 3], ['S12', 4], ['S14', 3], ['S16', 5]];
