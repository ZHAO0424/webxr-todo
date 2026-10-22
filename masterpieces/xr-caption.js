// 头显里的字：没有卡片，跟着头走，停在视野正下方一点（不会因为转头而跑偏）
// 进入 VR / AR 时浮现作品名 + 一句怎么玩，约 10 秒后淡去；之后场景提示（#hud 第一行）一变，就在同一处浮现几秒
// 中 / 英：字都是页面给的（入场页的 h1 / h2 / .how[data-xr]，或 show() 传进来的），这里每次浮现时现取，
// 所以总是当前语言；正在显示时换了语言，入场那几行和 show(() => [...]) 传函数的会当场重画
import * as THREE from 'three';

export function xrCaption({ renderer, scene, camera }) {
  const W = 2048, H = 420;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;   // 各页都关了色彩管理、线性输出：画布颜色原样显示
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false });
  // 0.9 米外、比视线低约 6°，宽约 29°、高约 6°：眼镜的视场只有约 40° × 24°（竖直 ±12°），
  // 以前 38° 宽、低 13° 时左右贴边、下半截掉出视场
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46 * H / W), mat);
  mesh.position.set(0, -0.095, -0.9); mesh.rotation.x = 0.1;
  mesh.renderOrder = 999; mesh.frustumCulled = false; mesh.visible = false;
  camera.add(mesh);
  if (!camera.parent) scene.add(camera);

  const I18N = window.MP_I18N;
  const cjkSerif = '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", Georgia, serif', sans = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  // 英文时西文字体排在前面：宋体里的西文字形不好看
  const serif = () => I18N && I18N.lang === 'en' ? `Georgia, ${cjkSerif}` : cjkSerif;
  // 写一行字，放不下就缩小字号（英文名、英文提示比中文长）
  const shadowText = (txt, x, y, font, size, color, spacing = 0) => {
    for (let k = 0; k < 8; k++) { g.font = font.replace('$', size); g.letterSpacing = `${spacing}px`; if (g.measureText(txt).width <= W - 80) break; size *= 0.9; spacing *= 0.9; }
    g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 18; g.fillStyle = color; g.fillText(txt, x, y);
    g.shadowBlur = 4; g.fillText(txt, x, y);
  };
  const draw = (lines) => {
    g.clearRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle';
    const [title, sub, hint] = lines;
    if (title) shadowText(title, W / 2, 120, `400 $px ${serif()}`, 104, '#f3ede2', 18);
    if (sub) shadowText(sub, W / 2, 222, `italic $px ${serif()}`, 40, 'rgba(232,224,210,.82)', 2);
    if (title && hint) { g.shadowBlur = 0; g.fillStyle = 'rgba(201,164,92,.9)'; g.fillRect(W / 2 - 40, 272, 80, 3); }
    if (hint) shadowText(hint, W / 2, title ? 336 : 210, `500 $px ${sans}`, title ? 46 : 58, title ? 'rgba(239,233,221,.9)' : '#f3ede2', 3);
    tex.needsUpdate = true;
  };

  // 入场页上的作品名、副标题、头显里怎么玩：进 VR 那一刻现取（页面可能已经换过语言）
  const intro = () => {
    const h1 = document.querySelector('#intro h1'), h2 = document.querySelector('#intro h2');
    const how = document.querySelector('#intro .how');
    return [h1 && h1.textContent.trim(), h2 && h2.textContent.trim(), how && how.dataset.xr];
  };
  const stateEl = document.querySelector('#hud > span, #hud > b');
  let until = 0, lastState = stateEl ? stateEl.textContent : '', src = null;

  // lines：[作品名, 副标题, 提示]，或者返回这样一个数组的函数（换语言时会再调一次重画）
  const show = (lines, seconds) => { src = lines; draw(typeof lines === 'function' ? lines() : lines); until = performance.now() + seconds * 1000; mesh.visible = true; };
  renderer.xr.addEventListener('sessionstart', () => show(intro, 10));
  renderer.xr.addEventListener('sessionend', () => { mesh.visible = false; mat.opacity = 0; });
  if (stateEl) new MutationObserver(() => {
    const t = stateEl.textContent;
    if (t === lastState) return; lastState = t;
    if (renderer.xr.isPresenting && performance.now() > until - 1500) show([null, null, t], 4);
  }).observe(stateEl, { childList: true, characterData: true, subtree: true });
  // 换语言：还亮着、而且字是现取的，就按新语言重画（场景提示那种死字等页面自己的 #hud 变了再浮现）
  if (I18N) I18N.onChange(() => { if (mesh.visible && typeof src === 'function') draw(src()); });

  // 每帧淡入淡出（挂在 onBeforeRender 上，不用改各页的动画循环）
  let last = performance.now();
  mesh.onBeforeRender = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const target = now < until ? 1 : 0;
    mat.opacity += (target - mat.opacity) * Math.min(1, dt * (target ? 2.5 : 1.2));
  };
  // onBeforeRender 只在可见时调用：用一个定时器在淡完后收起
  setInterval(() => { if (mat.opacity < 0.01 && performance.now() > until) mesh.visible = false; }, 500);
  return { show: (lines, s = 5) => show(lines, s) };
}
