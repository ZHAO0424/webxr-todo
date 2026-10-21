import * as THREE from 'three';
import { buildVillage } from '../village.js';
import { buildBackdrop, skyTexture } from '../backdrop.js';
import { SHOTS } from './shots.js';
import { Rig } from './rig.js';
import { createPost } from './post.js';

// 录片模式（film.html）：按 shots.js 的镜头表，固定步长一帧一帧地推进村子和相机，渲染到固定分辨率。
//   ?shot=S04              预览这个镜头（循环播放）
//   &still=1.5             只出第 1.5 秒那一帧（发给本地服务器存成 PNG，截图检查构图用）
//   &record=1              逐帧渲染整个镜头，每帧发给本地服务器（node tools/film.mjs 会接住并合成视频）
//   &vertical=1            竖版 9:16；&w= &h= 指定分辨率（默认 1920×1080 / 1080×1920）；&fps=（默认 60）
// 村子的模拟全部带种子，同样的镜头每次拍出来一样，可以反复调。

const params = new URLSearchParams(location.search);
const shot = { ...(SHOTS.find((s) => s.id === params.get('shot')) ?? SHOTS[0]) };
// 调构图：&cam=x,离地高,z&look=x,离地高,z（村里的米）临时替换这个镜头的机位和看向点；&stagecam= 用沙盘坐标
const pts = (k) => params.get(k)?.split(';').map((s) => s.split(',').map(Number));
if (params.has('cam')) shot.cam = pts('cam').map((at) => ({ at }));
if (params.has('stagecam')) shot.cam = pts('stagecam').map((stage) => ({ stage }));
if (params.has('look')) shot.look = pts('look').map((at) => ({ at }));
if (params.has('stagelook')) shot.look = pts('stagelook').map((stage) => ({ stage }));
if (params.has('orbit')) shot.cam = pts('orbit').map((orbit) => ({ orbit })); // &orbit=半径,高,角度;半径,高,角度
if (params.has('rel')) shot.cam = pts('rel').map((rel) => ({ rel }));
if (params.has('fov')) shot.fov = Number(params.get('fov'));
if (params.has('blur')) shot.blur = Number(params.get('blur'));
const vertical = params.has('vertical');
const W = Number(params.get('w') ?? (vertical ? 1080 : 1920)), H = Number(params.get('h') ?? (vertical ? 1920 : 1080));
const FPS = Number(params.get('fps') ?? 60), DT = 1 / FPS;
const N = Math.round((Number(params.get('dur')) || shot.dur) * FPS);
const statusEl = document.getElementById('status');
const say = (m) => { statusEl.textContent = m; };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.append(renderer.domElement);
{ // 显示时按窗口等比缩放（渲染分辨率不变）
  const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); Object.assign(renderer.domElement.style, { width: `${W * k}px`, height: `${H * k}px` }); };
  fit(); addEventListener('resize', fit);
}
const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
document.documentElement.dataset.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(shot.fov, W / H, 0.001, 6);
const stage = new THREE.Group();
scene.add(stage);

say(`${shot.id} ${shot.name}：建村…`);
const village = buildVillage({ startHour: shot.hour, event: shot.event ?? null, weather: shot.weather ?? 'sunny' });
const backdrop = buildBackdrop();
stage.add(village.object, backdrop.object);
if (params.has('nobackdrop')) backdrop.object.visible = false; // 调试：看画面里哪些是远景板

// 光：和 main.js 一样的太阳、天光、远山、天空
const sun = new THREE.DirectionalLight('#ffb27a', 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.1, far: 2.5 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.002;
const hemi = new THREE.HemisphereLight('#8a84c8', '#6a4250', 1.5);
stage.add(sun, sun.target, hemi);
const backdropMats = [], glowMats = [];
backdrop.object.traverse((o) => { if (o.material) (o.material.blending === THREE.AdditiveBlending ? glowMats : backdropMats).push(o.material); });
const black = new THREE.Color(0, 0, 0), band = new THREE.Color();
let sky = null, skyKey = '';
function applyLight(L, fade = 0) {
  sun.color.set(L.sun);
  sun.intensity = L.sunIntensity;
  sun.position.set(...L.sunPos);
  hemi.color.set(L.sky);
  hemi.groundColor.set(L.ground);
  hemi.intensity = L.hemiIntensity;
  for (const m of backdropMats) m.color.setScalar(1 - 0.62 * L.night);
  for (const m of glowMats) m.color.setRGB(1 - 0.55 * L.night, 1 - 0.5 * L.night, 1 - 0.3 * L.night);
  const bands = fade > 0 ? L.bands.map((c) => `#${band.set(c).lerp(black, fade).getHexString()}`) : L.bands; // 天空渐黑（揭示镜头）
  const key = bands.join();
  if (key !== skyKey) { skyKey = key; sky?.dispose(); sky = skyTexture(bands); scene.background = sky; }
}

// 镜头前先把村子快进到"该发生的事正在发生"
let t = 0, L = null;
const step = (dt) => { t += dt; L = village.update(t, camera.position).light; };
const rig = new Rig(shot, village, { fovScale: vertical ? 1.7 : 1 });
camera.position.set(0, 0.5, 1.15);
step(0);
if (shot.until) {
  let s = 0;
  while (!shot.until(village) && s < (shot.warm ?? 300)) { step(0.1); s += 0.1; }
  document.documentElement.dataset.warm = `${s.toFixed(1)}s ${shot.until(village) ? 'ok' : 'TIMEOUT'} @${village.life.clock.label}`;
  if (!shot.until(village)) console.error(`${shot.id}: 快进 ${s.toFixed(0)} 秒还没等到开拍条件（${village.life.clock.label}）`);
}
for (let s = 0; s < (shot.after ?? 0); s += 0.1) step(0.1);
rig.apply(camera, 0, N, DT);
for (let k = 0; k < 30; k++) { step(DT); rig.apply(camera, 0, N, DT); } // 半秒预热：阻尼跟上目标、粒子飘起来

const post = createPost(renderer, scene, camera, W, H);
const proj = new THREE.Vector3();

/** 画第 i 帧（调用前村子已经推进到这一帧）。 */
function frame(i) {
  const { u, look } = rig.apply(camera, i, N, DT);
  const [f0, f1] = shot.fadeBlack ?? [2, 3];
  applyLight(L, Math.min(1, Math.max(0, (u - f0) / (f1 - f0))));
  proj.copy(look).project(camera);
  const blur = shot.blurEnd !== undefined ? (shot.blur ?? 6) * (1 - u) + shot.blurEnd * u : shot.blur ?? 6;
  post.set({ center: proj.y * 0.5 + 0.5, band: shot.band ?? 0.12, blur, night: L.night });
  post.render(DT);
  document.documentElement.dataset.clock = village.life.clock.label;
}
const advance = () => { for (let k = 0; k < (shot.speed ?? 1); k++) step(DT); };

async function send(name) {
  const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/png'));
  await fetch(`/film/frame?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
}

const tag = `${shot.id}${vertical ? 'v' : ''}`;
if (params.has('still')) {
  const at = Math.min(N - 1, Math.round(Number(params.get('still')) * FPS));
  for (let i = 1; i <= at; i++) { advance(); rig.apply(camera, i, N, DT); }
  frame(at);
  say(`${tag} 第 ${(at / FPS).toFixed(2)} 秒 · 村里 ${village.life.clock.label}`);
  await send(`${tag}_still_${params.get('still')}.png`);
  const c = camera.position, v3 = (p) => p.toArray().map((x) => x.toFixed(3)).join(',');
  await fetch('/film/log', { method: 'POST', body: `${tag} still ${params.get('still')}s 村里 ${village.life.clock.label} cam=${v3(c)} fov=${camera.fov.toFixed(1)} warm=${document.documentElement.dataset.warm ?? '-'} gpu=${document.documentElement.dataset.gpu}` });
  await fetch('/film/done', { method: 'POST', body: tag });
} else if (params.has('record')) {
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    if (i) advance();
    frame(i);
    await send(`${tag}/${String(i).padStart(5, '0')}.png`);
    if (i % 30 === 0) say(`${tag} 录制 ${i}/${N} 帧`);
  }
  say(`${tag} 录完 ${N} 帧，${((performance.now() - t0) / 1000).toFixed(0)} 秒`);
  await fetch('/film/done', { method: 'POST', body: tag });
} else { // 预览：一帧推进一步，播完重开（重开只是倒回相机，村子接着往下过）
  let i = 0;
  renderer.setAnimationLoop(() => {
    if (i) advance();
    frame(i);
    say(`${tag} ${shot.name} · ${(i / FPS).toFixed(1)}/${shot.dur}s · 村里 ${village.life.clock.label}`);
    i = (i + 1) % N;
  });
}
document.documentElement.dataset.ready = '1';
