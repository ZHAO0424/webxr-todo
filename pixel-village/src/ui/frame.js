/*
 * 像素 UI 的底子（村子页面和村民档案共用）。
 *
 * 1. 两个像素单位，都取整数个设备像素（像素点正好落在整数个屏幕像素上才清楚）：
 *    --f：字的一个点。按窗口大小缩放（1100×680 的窗口一个点 ≈ 1 个 CSS 像素，大屏 / 全屏跟着放大，小窗口缩小），再取整到整数个设备像素。
 *    --p：边框、间距的一个"像素" = 2 个 --f，框比字粗一档，像游戏里的 UI。
 * 2. 框：在 10×10 的画布上画一个细的像素框（深色外描边 → 一道斜面，左上亮、右下暗 → 内描边 → 底色），
 *    做成 9 宫格边框图（border-image），框多大都清楚。三种：面板、凹进去的内框、头像框。
 *    配色参考潜水员戴夫：深色底 + 亮的细边，字是奶白、名字金黄，标签用压低饱和度的实色小块。
 */

function frameImage({ outer, light, dark, inner, fill }) {
  const N = 10, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.min(x, y, N - 1 - x, N - 1 - y);
    const corner = Math.min(x, N - 1 - x) + Math.min(y, N - 1 - y); // 离最近的角多远（切角用）
    if (corner < 1) continue; // 角上缺一个像素：圆一点
    let col;
    if (d === 0 || corner === 1) col = outer;
    else if (d === 1) col = x === 1 || y === 1 ? light : dark; // 左上受光
    else if (d === 2) col = inner;
    else col = fill;
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }
  return c.toDataURL();
}

export function setupPixelUI() {
  const root = document.documentElement;
  const unit = () => { // 跟着窗口大小缩放：以 1100×680 的窗口为一倍，宽高取小的那个比例；手机竖屏不再往小缩（字会看不清）
    const dpr = devicePixelRatio || 1;
    const s = Math.min(innerWidth / 1100, innerHeight / 680);
    const k = Math.max(1, Math.round(dpr * Math.max(innerWidth < 700 ? 1 : 0.75, s))); // 一个点取整数个设备像素，点阵字不糊
    root.style.setProperty('--f', `${k / dpr}px`);
    root.style.setProperty('--p', `${(2 * k) / dpr}px`);
  };
  unit();
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', unit);
  addEventListener('resize', unit);
  root.style.setProperty('--frame-panel', `url(${frameImage({ outer: '#0e0b14', light: '#6c5c88', dark: '#3a3050', inner: '#1b1626', fill: '#28213a' })})`);
  root.style.setProperty('--frame-inset', `url(${frameImage({ outer: '#0e0b14', light: '#16121f', dark: '#4c4066', inner: '#2a2338', fill: '#342b48' })})`); // 凹进去：左上暗、右下亮
  root.style.setProperty('--frame-face', `url(${frameImage({ outer: '#0e0b14', light: '#8a78a8', dark: '#4a3e62', inner: '#1b1626', fill: '#3a3050' })})`);
}

/** 头肩像：从图集的第一帧里找到头顶，往下截 h 行、左右截 w 列（档案页的小卡片用）。 */
export function headCrop(atlas, cellW, cellH, w = 20, h = 18) {
  const g = atlas.getContext('2d');
  const data = g.getImageData(0, 0, cellW, cellH).data;
  let top = 0;
  find: for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) if (data[(y * cellW + x) * 4 + 3] > 0) { top = y; break find; }
  return portrait(atlas, Math.floor((cellW - w) / 2), Math.max(0, top - 1), w, h, 1);
}

/** 把像素图（canvas 的一块）按整数倍放大画到新画布上，给头像用。 */
export function portrait(src, sx, sy, sw, sh, scale = 1) {
  const c = document.createElement('canvas');
  c.width = sw * scale;
  c.height = sh * scale;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
  return c;
}
