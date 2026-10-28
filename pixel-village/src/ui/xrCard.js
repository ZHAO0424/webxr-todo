import * as THREE from 'three';

/*
 * XR 里的卡片：网页上那张 HTML 卡片在眼镜里看不到，这里把同一张卡片画成贴图，挂在选中的人 / 物件头顶。
 *   画法：把卡片 DOM 克隆一份（去掉关闭、跟随按钮和收起的抽屉，头像画布换成图片），连同 ui.css 和两个点阵字体（内嵌成 data URL）
 *         塞进 SVG 的 foreignObject 当图片画到画布上——和桌面卡片一模一样，不用另写一套排版。字按 2 倍点阵画（--f = 2px），贴图最近邻采样。
 *   摆法：卡片正对眼睛，角度大小固定（离得远就放大）；不做深度测试、最后画，房子、树挡不住它，也不会插进模型里；
 *         放在选中的东西头顶（小箭头上面），深度也和它一样（只往眼睛这边让出 3%），两只眼看去都在它正上方。
 *   卡片内容变了（村里过了一分钟、换了人）才重画，最多一秒一次。
 */

const F = 2; // 一个字点 = 2 个贴图像素
const WIDTH = 0.2; // 卡片宽度：离眼睛 1 米时 0.2 米（约 11°）
const NEAR = 0.97; // 卡片放在"眼睛 → 目标"这条线的 97% 处：就在目标头顶（两眼看去也在那儿），只往眼睛这边让出一点

let cssText = null;
async function loadCSS() {
  const toData = async (url) => {
    const b = await (await fetch(url)).blob();
    return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  };
  const base = new URL('src/ui/ui.css', document.baseURI); // 按网页的位置找（线上跑的是打包后的 dist/main.min.js，不能按这个文件自己的位置）
  let css = await (await fetch(base)).text();
  for (const m of [...css.matchAll(/url\('([^']+\.woff)'\)/g)]) css = css.replace(m[0], `url('${await toData(new URL(m[1], base))}')`);
  const root = getComputedStyle(document.documentElement);
  const frames = ['--frame-panel', '--frame-inset', '--frame-face'].map((k) => `${k}: ${root.getPropertyValue(k)};`).join(' ');
  return `${css}\n.xr { ${frames} }\n${SIZE}`;
}
const SIZE = `.xr { --f: ${F}px; --p: ${2 * F}px; --panel-w: calc(116 * var(--p)); } .xr .card { padding: calc(3 * var(--p)) calc(4 * var(--p)); }`;

export function createXRCard() {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 100;
  mesh.visible = false;
  mesh.frustumCulled = false;

  // 量尺寸用的隐藏容器（字号固定，不跟窗口缩放）
  const measure = document.createElement('div');
  measure.className = 'xr';
  measure.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none';
  document.body.append(measure);
  const style = document.createElement('style');
  style.textContent = SIZE; // 隐藏容器也按同样的字号量
  document.head.append(style);

  let source = null, anchor = null, lift = 0, lastHTML = '', busy = false, lastAt = -Infinity, aspect = 1, ready = false;
  const faces = new WeakMap(); // 头像画布 → data URL（只转一次）

  async function draw() {
    if (!source || busy) return;
    const clone = source.cloneNode(true);
    clone.querySelectorAll('.close, .follow, details:not([open])').forEach((e) => e.remove());
    const from = source.querySelectorAll('canvas'), to = clone.querySelectorAll('canvas');
    to.forEach((c, i) => {
      const o = from[i];
      if (!faces.has(o)) faces.set(o, o.toDataURL());
      const img = document.createElement('img');
      img.src = faces.get(o); img.style.cssText = c.style.cssText; img.style.display = 'block';
      c.replaceWith(img);
    });
    const html = new XMLSerializer().serializeToString(clone);
    if (html === lastHTML && ready) return;
    busy = true;
    try {
      cssText ??= await loadCSS();
      measure.replaceChildren(clone);
      const w = Math.ceil(clone.offsetWidth), h = Math.ceil(clone.offsetHeight);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">`
        + `<div xmlns="http://www.w3.org/1999/xhtml" class="xr" lang="${document.documentElement.lang || 'zh-CN'}"><style>${cssText.replace(/</g, '\\3c ')}</style>${html}</div></foreignObject></svg>`;
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      if (!source) return;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; tex.dispose(); }
      g.clearRect(0, 0, w, h);
      g.drawImage(img, 0, 0);
      tex.needsUpdate = true;
      aspect = h / w; lastHTML = html; ready = true;
    } catch (e) {
      console.warn('XR 卡片没画出来', e);
    } finally { busy = false; measure.replaceChildren(); }
  }

  const eye = new THREE.Vector3(), at = new THREE.Vector3();
  return {
    mesh,
    /** 换一张卡片：el = 卡片 DOM，obj = 挂在谁身上，h = 头顶多高（obj 的本地坐标）。el 为 null 时收起。 */
    set(el, obj, h) {
      source = el; anchor = obj; lift = h; ready = false; lastHTML = ''; lastAt = -Infinity;
      mesh.visible = false;
    },
    /** 每帧：viewer = 眼睛的世界坐标。 */
    update(viewer, active) {
      if (!active || !source || !anchor) { mesh.visible = false; return; }
      const now = performance.now();
      if (now - lastAt > 1000) { lastAt = now; draw(); } // 内容没变不会重画
      if (!ready) { mesh.visible = false; return; }
      anchor.updateWorldMatrix(true, false);
      at.set(0, lift, 0).applyMatrix4(anchor.matrixWorld);
      eye.copy(viewer);
      const d = at.distanceTo(eye) * NEAR, s = WIDTH * d;
      mesh.position.lerpVectors(eye, at, NEAR);
      mesh.scale.set(s, s * aspect, 1);
      mesh.position.y += s * aspect * 0.5 + 0.01 * d; // 卡片底边在头顶上面一点
      mesh.lookAt(eye); // 正对眼睛
      mesh.visible = true;
    },
  };
}
