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
    // 另一套固定的：按整块屏幕算（= 全屏时的大小），窗口怎么拉都不变。左下角的设置 / 调试 / 档案按钮用这套（index.html 的 #hint）
    const sf = Math.min(screen.width / 1100, screen.height / 680);
    const kf = Math.max(1, Math.round(dpr * Math.max(screen.width < 700 ? 1 : 0.75, sf)));
    root.style.setProperty('--f-fixed', `${kf / dpr}px`);
    root.style.setProperty('--p-fixed', `${(2 * kf) / dpr}px`);
  };
  unit();
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', unit);
  addEventListener('resize', unit);
  root.style.setProperty('--frame-panel', `url(${frameImage({ outer: '#120e0a', light: '#7a6448', dark: '#3d3125', inner: '#1c1611', fill: '#2b231b' })})`);
  root.style.setProperty('--frame-inset', `url(${frameImage({ outer: '#120e0a', light: '#17120d', dark: '#5a4a38', inner: '#2e251c', fill: '#3a3024' })})`); // 凹进去：左上暗、右下亮
  root.style.setProperty('--frame-face', `url(${frameImage({ outer: '#120e0a', light: '#9a8262', dark: '#54442f', inner: '#1c1611', fill: '#3d3125' })})`);
}

/**
 * 按身高比例截的头像 / 半身像：头顶（正中一竖条里最上面的点）到脚底（整行最下面的点）是这个人的身高，
 * 从头顶往下截身高的 frac，宽和高一样（至少 minW）。大人小孩个子不一样，按固定像素截的话小孩会截到腿、大人只到胸口；
 * 按身高比例截（小孩大头身材，比例要大一些，见 roster.js 的 BUST / HEAD），截到的就是同一截身子。
 * 返回 { canvas, w, h }（像素）。
 */
export function bodyCrop(atlas, cellW, cellH, frac, minW = 0) {
  const data = atlas.getContext('2d').getImageData(0, 0, cellW, cellH).data;
  const solid = (x, y) => data[(y * cellW + x) * 4 + 3] > 0;
  const x0 = Math.floor(cellW / 2) - 3, x1 = Math.floor(cellW / 2) + 3;
  let top = 0, bottom = cellH - 1;
  find: for (let y = 0; y < cellH; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) { top = y; break find; }
  feet: for (let y = cellH - 1; y > top; y--) for (let x = 0; x < cellW; x++) if (solid(x, y)) { bottom = y; break feet; }
  const h = Math.max(4, Math.round((bottom - top + 1) * frac)) + 1;
  // 以头为中心截（头顶往下半截的左右边界：宽檐帽也算进去），宽度不小于高度
  let l = cellW, r = -1;
  for (let y = top; y < Math.min(cellH, top + Math.ceil(h * 0.6)); y++) for (let x = 0; x < cellW; x++) if (solid(x, y)) { l = Math.min(l, x); r = Math.max(r, x); }
  const cx = r >= 0 ? (l + r + 1) / 2 : cellW / 2, w = Math.min(cellW, Math.max(minW, h, r - l + 3));
  const sx = Math.max(0, Math.min(cellW - w, Math.round(cx - w / 2)));
  return { canvas: portrait(atlas, sx, Math.max(0, top - 1), w, h, 1), w, h };
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
