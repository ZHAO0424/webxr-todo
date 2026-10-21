/*
 * 像素 UI 的底子（村子页面和村民档案共用）。
 *
 * 1. 像素单位 --p：界面里一个"像素"占多少 CSS 像素。取整数个设备像素（像素字体的一个点正好落在整数个屏幕像素上才清楚），
 *    大约让正文落在 16–24 CSS 像素：设备像素比 1 → 2、1.25 → 2、1.5 → 2、2 → 3……
 * 2. 木框：在 14×14 的画布上画一个像素木框（墨色外描边 → 木条，左上亮、右下暗 → 内倒角 → 羊皮纸底），
 *    做成 9 宫格边框图（border-image），框多大都清楚。另有羊皮纸内页、深色标签两种。
 */

const INK = '#2a1a26';

function frameImage({ outer = INK, light, mid, dark, inner, fill, shade }) {
  const N = 14, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.min(x, y, N - 1 - x, N - 1 - y);
    const corner = Math.min(x, N - 1 - x) + Math.min(y, N - 1 - y); // 离最近的角多远（切角用）
    if (corner < 1) continue; // 角上缺一个像素：圆一点
    let col;
    if (d === 0 || corner === 1) col = outer;
    else if (d === 1) col = x === 1 || y === 1 ? light : dark; // 左上受光
    else if (d === 2) col = mid;
    else if (d === 3) col = inner;
    else col = (x === 4 || y === 4) ? shade : fill; // 内页左上一道阴影
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }
  return c.toDataURL();
}

export function setupPixelUI() {
  const root = document.documentElement;
  const unit = () => {
    const dpr = devicePixelRatio || 1;
    const k = Math.max(2, Math.round(dpr * 1.5));
    root.style.setProperty('--p', `${k / dpr}px`);
  };
  unit();
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', unit);
  addEventListener('resize', unit);
  root.style.setProperty('--frame-wood', `url(${frameImage({ light: '#d8955a', mid: '#a8643a', dark: '#6e3e26', inner: '#4a2a1e', fill: '#f4e2bc', shade: '#e2c898' })})`);
  root.style.setProperty('--frame-paper', `url(${frameImage({ outer: '#8a5a3a', light: '#f8ead0', mid: '#ecd6ac', dark: '#d2b080', inner: '#c49c6c', fill: '#f8ecd2', shade: '#efdcb8' })})`);
  root.style.setProperty('--frame-night', `url(${frameImage({ light: '#8a6a9a', mid: '#5a4870', dark: '#3a2e4a', inner: '#1a1424', fill: '#2a2438', shade: '#241e30' })})`); // 档案页：和之前的深紫卡片同色
  root.style.setProperty('--frame-dark', `url(${frameImage({ light: '#6a5478', mid: '#4a3a58', dark: '#2e2238', inner: '#1e1628', fill: '#3a2e48', shade: '#32283e' })})`);
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
