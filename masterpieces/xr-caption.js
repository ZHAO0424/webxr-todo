// 头显里的字：没有卡片，跟着头走，停在视野正下方一点（不会因为转头而跑偏）
// 进入 VR / AR 时浮现作品名 + 一句怎么玩，约 10 秒后淡去；之后场景提示（#hud 第一行）一变，就在同一处浮现几秒
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

  const serif = '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", Georgia, serif', sans = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  const shadowText = (txt, x, y, font, color, spacing = 0) => {
    g.font = font; g.letterSpacing = `${spacing}px`;
    g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 18; g.fillStyle = color; g.fillText(txt, x, y);
    g.shadowBlur = 4; g.fillText(txt, x, y);
  };
  const draw = (lines) => {
    g.clearRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle';
    const [title, sub, hint] = lines;
    if (title) shadowText(title, W / 2, 120, `400 104px ${serif}`, '#f3ede2', 18);
    if (sub) shadowText(sub, W / 2, 222, `italic 40px ${serif}`, 'rgba(232,224,210,.82)', 2);
    if (title && hint) { g.shadowBlur = 0; g.fillStyle = 'rgba(201,164,92,.9)'; g.fillRect(W / 2 - 40, 272, 80, 3); }
    if (hint) shadowText(hint, W / 2, title ? 336 : 210, `500 ${title ? 46 : 58}px ${sans}`, title ? 'rgba(239,233,221,.9)' : '#f3ede2', 3);
    tex.needsUpdate = true;
  };

  const h1 = document.querySelector('#intro h1'), h2 = document.querySelector('#intro h2');
  const how = document.querySelector('#intro .how');
  const intro = [h1 && h1.textContent.trim(), h2 && h2.textContent.trim(), how && how.dataset.xr];
  const stateEl = document.querySelector('#hud > span, #hud > b');
  let until = 0, lastState = stateEl ? stateEl.textContent : '';

  const show = (lines, seconds) => { draw(lines); until = performance.now() + seconds * 1000; mesh.visible = true; };
  renderer.xr.addEventListener('sessionstart', () => show(intro, 10));
  renderer.xr.addEventListener('sessionend', () => { mesh.visible = false; mat.opacity = 0; });
  if (stateEl) new MutationObserver(() => {
    const t = stateEl.textContent;
    if (t === lastState) return; lastState = t;
    if (renderer.xr.isPresenting && performance.now() > until - 1500) show([null, null, t], 4);
  }).observe(stateEl, { childList: true, characterData: true, subtree: true });

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
