import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { buildVillage } from './village.js';
import { BOUNDS } from './layout.js';
import { daylight } from './daylight.js';
import { buildBackdrop, skyTexture } from './backdrop.js';
import { createAnchor } from './xr.js';
import { LABELS, PLACES } from './labels.js';
import { setupPixelUI } from './ui/frame.js';
import { residentCard, animalCard, thingCard, hm, label } from './ui/cards.js';
import { createRoster } from './ui/roster.js';
import { createXRCard } from './ui/xrCard.js';
import { pickThing, describe, YARDS } from './things.js';
import { HOUSEHOLDS, RESIDENTS } from './residents.js';
import { voxelCharacter } from './voxel.js';
import { buildMaterials } from './textures.js';
import { createSound } from './audio.js';
import { createMusic } from './music.js';
import { animalDoing } from './animalInfo.js';
import { EVENTS, WEATHER, fmt, lunarLabel } from './life/index.js';
import { createSceneSwitch } from './scenes.js';
import { setSeason, season, SEASONS, ORDER as SEASON_ORDER } from './season.js';

const params = new URLSearchParams(location.search);
setSeason(params.get('season') ?? 'autumn'); // ?season=spring|summer|autumn|winter：建场景之前定（见 season.js）

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // 阴影隔一帧重画一次（每帧重画要把三百来个投影的东西再画一遍；人走得慢，看不出差别）
renderer.xr.enabled = true;
document.body.append(renderer.domElement, VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] })); // 手部追踪：双手捏合握住沙盘（xr.js）

const scene = new THREE.Scene();
let sky = skyTexture();
scene.background = sky;

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 20);
camera.position.set(0, 0.5, 1.15); // 接近 XR 里的标准视点
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.02, 0);
// ?cam=x,y,z,tx,ty,tz 指定桌面相机（米，沙盘坐标），用来截近景检查细节
if (params.has('cam')) {
  const [x, y, z, tx, ty, tz] = params.get('cam').split(',').map(Number);
  camera.position.set(x, y, z);
  controls.target.set(tx, ty, tz);
}
controls.enableDamping = true;

// 整个场景挂在 stage 下：桌面模式在原点，XR 模式被摆到头前方
const stage = new THREE.Group();
scene.add(stage);

/**
 * 载入画面上走路的货郎：用游戏里同一套体素小人（钱小二挑着货郎担），拍 8 帧走路（透明底，只带脚下的影子），
 * 交给 loader 轮流显示（建村子时主线程卡住也照样走），他走在 index.html 画的一整条草皮土路上。走一步的周期 = 2π / 8 秒（voxel.js 的 pose）。
 */
function loaderFrames(M) {
  const p = RESIDENTS.find((r) => r.id === 'qian_xiaoer');
  if (!p || renderer.xr.isPresenting) return [];
  const S = new THREE.Scene(), W = 180, H = 150, dpr = Math.min(devicePixelRatio, 2); // 和 index.html 里 .ld-walker 一样大
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 50);
  cam.position.set(0.5, 1.35, 5.4);
  cam.lookAt(0, 0.95, 0);
  const sun = new THREE.DirectionalLight('#ffd9a8', 3.0);
  sun.position.set(-3, 6, 4);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 3, bottom: -1, near: 0.1, far: 20 });
  sun.shadow.mapSize.set(1024, 1024);
  S.add(sun, new THREE.HemisphereLight('#c8d8e8', '#7a5a40', 1.6));
  // 地面只接影子（透明）：路是 index.html 里画的一整条，不跟着人走
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.ShadowMaterial({ opacity: 0.35 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  S.add(ground);
  const c = voxelCharacter(p, M);
  c.setItem('peddler');
  c.object.rotation.y = Math.PI / 2 - 0.3; // 朝右走，稍微侧过来一点看得见脸
  c.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  S.add(c.object);
  const rt = new THREE.WebGLRenderTarget(W * dpr, H * dpr, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const frames = [];
  for (let i = 0; i < 8; i++) {
    c.pose('walk', (i / 8) * ((Math.PI * 2) / 8));
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(S, cam);
    const px = new Uint8Array(W * dpr * H * dpr * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W * dpr, H * dpr, px);
    const cv = document.createElement('canvas');
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'), img = g.createImageData(cv.width, cv.height);
    for (let y = 0; y < cv.height; y++) img.data.set(px.subarray((cv.height - 1 - y) * cv.width * 4, (cv.height - y) * cv.width * 4), y * cv.width * 4); // 读出来是倒的
    g.putImageData(img, 0, 0);
    frames.push(cv);
  }
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  rt.dispose();
  return frames;
}

// 载入进度（index.html 的 loader）：建村子要好几秒、主线程整个卡住，进度条按上回建了多久匀速往前挪；每一步之间让页面画一帧
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 120); }); // 标签页在后台时 rAF 不走，最多等 0.12 秒
const lastBuild = (() => { try { return Number(localStorage.getItem('pvBuildMs')) || 5000; } catch { return 5000; } })();
const M0 = buildMaterials();
if (window.loader) window.loader.figure(loaderFrames(M0));
window.loader?.set(0.38, '盖房子、种庄稼…', 0.86, lastBuild);
await nextFrame();
const t0 = performance.now();
const village = buildVillage({ startHour: Number(params.get('time') ?? 15.5), event: params.get('event'), weather: params.get('weather'), M: M0 }); // ?time=6 从早上六点开始；?event=opera|market|bonfire|harvest|movie|shrine|meeting 指定今天的活动
document.documentElement.dataset.buildMs = String(Math.round(performance.now() - t0));
try { localStorage.setItem('pvBuildMs', String(Math.round(performance.now() - t0))); } catch { /* 隐私模式存不了，下回按 5 秒估 */ }
window.loader?.set(0.88, '村民起床…', 0.97, 2500);
await nextFrame();
const west = village.west; // 西沟：接在村子西边的另一块沙盘（village.js 里一起建，共用导航网格和村民）
const backdrop = buildBackdrop();
// 村子和西沟在同一个世界里（西沟的 x 接着村子往西排），换场景 = 把世界平移过来（scenes.js）
const world = new THREE.Group();
world.add(village.object, west.object);
stage.add(world, backdrop.object);
const SCENES = [
  { id: 'village', name: '村子', object: village.object, things: village.things, shift: 0 },
  { id: 'west', name: '西沟', object: west.object, things: west.things, shift: 90 },
];

const sun = new THREE.DirectionalLight('#ffb27a', 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.1, far: 2.5 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.002;
const hemi = new THREE.HemisphereLight('#8a84c8', '#6a4250', 1.5);
stage.add(sun, sun.target, hemi);

const backdropMats = [];
const glowMats = [];
backdrop.object.traverse((o) => { if (o.material) (o.material.blending === THREE.AdditiveBlending ? glowMats : backdropMats).push(o.material); });
let skyKey = '';
const inXR = () => renderer.xr.isPresenting;

/** 按村里的钟调太阳、天光、远山、天空。 */
const sunWant = new THREE.Vector3(); // 太阳该在哪；只在重画阴影的那帧挪过去（见主循环）
function applyLight(L, now = false) {
  sun.color.set(L.sun);
  sun.intensity = L.sunIntensity;
  sunWant.set(...L.sunPos);
  if (now) sun.position.copy(sunWant);
  hemi.color.set(L.sky);
  hemi.groundColor.set(L.ground);
  hemi.intensity = L.hemiIntensity;
  for (const m of backdropMats) m.color.setScalar(1 - 0.62 * L.night);
  for (const m of glowMats) m.color.setRGB(1 - 0.55 * L.night, 1 - 0.5 * L.night, 1 - 0.3 * L.night); // 夕阳 → 淡淡的月亮
  const key = L.bands.join();
  if (key !== skyKey) {
    skyKey = key;
    sky.dispose();
    sky = skyTexture(L.bands);
    if (!inXR() || params.has('sky')) scene.background = sky;
  }
}

// 光学透视眼镜上黑色 = 透明：XR 里去掉天空，让沙盘直接浮在真实桌面上（?sky=1 可保留）
const anchor = createAnchor(renderer, stage, {
  scene,
  aim(origin, dir) { // 射线落点：路牌、当前沙盘上的东西（人、房子、地面），返回距离
    ray.ray.origin.copy(origin); ray.ray.direction.copy(dir); ray.far = 6; ray.camera = inXR() ? renderer.xr.getCamera() : camera; // 打到精灵（炊烟等）要用相机
    const hit = ray.intersectObjects([...scenes.signs, scenes.current.object], true).find((h) => h.object.isMesh && !h.object.isInstancedMesh);
    ray.far = Infinity;
    return hit?.distance ?? null;
  },
  onSession(active) {
    scene.background = active && !params.has('sky') ? null : sky;
    // 阴影贴图：XR 里两只眼各画一遍，贴图降到 2048（一格影子差不多就是场景里一个像素那么大）；出来再换回 4096
    const size = active ? 2048 : 4096;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; renderer.shadowMap.needsUpdate = true; }
  },
  onSelect: (controller) => scenes.onSelect(controller), // 指着路牌：换场景，不重新摆沙盘
  onTap(controller) { // 单手捏一下：和鼠标点场景一样，指着谁就弹谁的卡片，指着空处收起
    if (scenes.busy) return;
    controller.updateMatrixWorld(true);
    ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    ray.ray.direction.set(0, 0, -1).transformDirection(controller.matrixWorld);
    ray.camera = renderer.xr.getCamera();
    pickRay();
  },
  onMove: () => closeCard(), // 双手握住拖、转、拉近推远，或沙盘滑回眼前：卡片收起
});
// 换场景：屏幕左右的按钮、键盘 ← →、XR 里沙盘两边的路牌；?scene=west 直接从西沟开始，?seam=1 两块都画（看接缝）
const scenes = createSceneSwitch({ world, stage, scenes: SCENES, M: village.M, start: Math.max(0, SCENES.findIndex((s) => s.id === params.get('scene'))), onChange: () => closeCard(), showAll: params.has('seam') });
renderer.setClearColor(0x000000, 1);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- 桌面：时钟 + 点村民 / 小动物看卡片

setupPixelUI();
const clockEl = document.getElementById('clock');
const host = document.getElementById('card');
const ray = new THREE.Raycaster();
const V = village.life.people[0].V;
const REST = new Set(['idle', 'sitGate', 'chat', 'dinner', 'home', 'read', 'chess', 'evening', 'play']);
let down = null;
let sel = null; // { v | b, card }
const xrCard = createXRCard();
scene.add(xrCard.mesh);

// 选中的人 / 动物头顶一个上下跳的像素小箭头
const marker = (() => {
  const c = document.createElement('canvas');
  c.width = 7; c.height = 6;
  const g = c.getContext('2d');
  ['#2a1a26', '#ffd84a', '#ffd84a'].forEach((col, k) => { g.fillStyle = col; for (let y = 0; y < 4 - k; y++) g.fillRect(k + y, y + k, 7 - 2 * (k + y), 1); });
  g.fillStyle = '#2a1a26'; g.fillRect(3, 4, 1, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.42, 0.36, 1);
  s.renderOrder = 10;
  s.visible = false;
  return s;
})();

renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
addEventListener('pointerdown', () => { sound.wake(); music.wake(); syncSoundBtn(); }); // 第一次点页面就打开声音和音乐（浏览器要求先有一次点击）
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || scenes.busy) return; // 拖动视角、正在换场景不算点击
  ray.setFromCamera({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }, camera);
  pickRay();
});

/** 顺着 ray 看点到了谁：人、动物，没有就看房子物件（XR 里单手捏合也走这里）。 */
function pickRay() {
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; }; // 另一块沙盘上的人（藏着）点不到
  const targets = [...village.life.people.filter((v) => !v.inside).map((v) => v.object), ...village.life.beasts.filter((b) => b.object.visible).map((b) => b.object)].filter(shown);
  const hit = ray.intersectObjects(targets, true)[0];
  if (!hit) { pickScene(); return; }
  let o = hit.object;
  while (o && !o.userData.resident && !o.userData.beast) o = o.parent;
  if (o?.userData.beast) { selectBeast(o.userData.beast); sound.clickBeast(o.userData.beast); }
  else if (o) selectPerson(village.life.people.find((v) => v.object === o));
}

/** 没点到人和动物：看打到了什么房子、物件；打在院子地上就是这个院子（西沟：这一片叫什么）。 */
function pickScene() {
  const S = scenes.current;
  const hit = ray.intersectObject(S.object, true).find((h) => h.object.isMesh && !h.object.isInstancedMesh && h.object !== marker);
  if (!hit) { closeCard(); return; }
  const p = S.object.worldToLocal(hit.point.clone());
  const t = pickThing(S.things, p);
  if (t) { selectThing(t); sound.clickThing(t); return; }
  if (S.id === 'west') { selectPlace(west.placeAt(p.x, p.z), p); return; }
  const c = village.compoundAt(p.x, p.z, 0);
  if (c) selectYard(c);
  else closeCard();
}

/** 西沟的地上：林子、梯田、红石崖、山溪……卡片上是这一片的介绍和附近有没有人。 */
function selectPlace(w, p) {
  const card = thingCard({ name: w.name, tags: w.tags, about: w.about, people: [] }, { onClose: closeCard, onPick: pick });
  sel = { w, at: [p.x, p.z], card };
  scenes.current.object.add(spot);
  spot.position.set(p.x, p.y + 1.5, p.z);
  show(card, spot, 0.5);
  refreshCard();
}

function closeCard() { sel = null; follow = false; host.innerHTML = ''; host.hidden = true; marker.removeFromParent(); marker.visible = false; xrCard.set(null); }
const dockCard = () => { host.style.top = `${clockEl.getBoundingClientRect().bottom + 6}px`; }; // 卡片总在时钟栏下面
addEventListener('resize', dockCard);
function show(card, obj, h) {
  host.innerHTML = ''; host.append(card.el); host.hidden = false; dockCard(); obj.add(marker); marker.position.set(0, h, 0); marker.visible = true; markerH = h;
  xrCard.set(card.el, obj, h + 0.5); // XR 里同一张卡片画成贴图，浮在箭头上面
  if (sel?.v || sel?.b) { // 人和动物的卡片上有"跟随"：镜头平移着把它留在画面中间（距离、角度不变）
    const b = document.createElement('button');
    b.className = 'btn follow';
    const label = () => { b.textContent = follow ? '跟随中' : '跟随'; b.classList.toggle('on', follow); };
    b.addEventListener('click', () => { follow = !follow; label(); });
    label();
    card.el.querySelector('.facecol')?.append(b); // 放在头像正下方
  }
}
let follow = false;
let markerH = 2.2;
const spot = new THREE.Object3D(); // 房子、物件上方放箭头的点
village.object.add(spot);

const pick = (id) => selectPerson(V.byId[id]);
const homeOf = (cid) => HOUSEHOLDS.find((h) => h.id === cid);
const residentsOf = (cid) => village.life.people.filter((v) => v.p.home === cid).map((v) => ({ id: v.p.id, name: v.p.name }));
const doingOf = (v) => (v.inside ? '' : LABELS[v.doing] ?? LABELS[v.doing?.split(':')[0]] ?? '');

function selectThing(t) {
  const place = t.cid ? PLACES[t.cid] : null;
  const d = describe(t, place);
  const h = t.thing === 'house' ? homeOf(t.cid) : null;
  const card = thingCard({ ...d, household: h && { name: h.name }, people: t.thing === 'house' ? residentsOf(t.cid) : [] }, { onClose: closeCard, onPick: pick });
  sel = { t, card };
  scenes.current.object.add(spot);
  spot.position.set((t.box.min.x + t.box.max.x) / 2, t.box.max.y, (t.box.min.z + t.box.max.z) / 2);
  show(card, spot, 0.5);
  refreshCard();
}

function selectYard(c) {
  const h = homeOf(c.id), y = YARDS[c.id];
  const card = thingCard({ name: h?.name ?? PLACES[c.id], tags: [h?.kind ?? y?.kind].filter(Boolean), about: h?.note ?? y?.note ?? '', people: residentsOf(c.id) }, { onClose: closeCard, onPick: pick });
  sel = { c, card };
  village.object.add(spot);
  spot.position.set(c.object.position.x, c.object.position.y + 1.5, c.object.position.z);
  show(card, spot, 0.5);
  refreshCard();
}

/** 房子 / 院子 / 物件卡片的"此刻"。 */
function refreshPlace() {
  const people = village.life.people;
  const who = (list) => list.map((v) => ({ id: v.p.id, name: `${v.p.name}${doingOf(v) ? ' · ' + doingOf(v) : ''}` }));
  const night = village.life.clock.night;
  if (sel.w) { // 西沟的一片地方：附近有没有人
    const [x, z] = sel.at;
    const near = people.filter((v) => !v.inside && Math.hypot(v.pos.x - x, v.pos.z - z) < 10);
    sel.card.update({ lines: [near.length ? `附近 ${near.length} 人` : '四下无人'], kind: near.length ? '' : 'rest', who: who(near) });
    return;
  }
  if (sel.c) {
    const c = sel.c;
    const here = people.filter((v) => village.compoundAt(v.pos.x, v.pos.z) === c);
    const out = here.filter((v) => !v.inside), inn = here.filter((v) => v.inside);
    const lines = [here.length ? `院中 ${out.length} 人 · 屋内 ${inn.length} 人` : '院中无人'];
    if (c.lit !== undefined && night) lines.push(c.lit ? '灯火未熄' : '灯火已熄');
    sel.card.update({ lines, kind: here.length ? '' : 'rest', who: who(here) });
    return;
  }
  const t = sel.t, b = t.box;
  const dist = (v) => Math.hypot(Math.max(b.min.x - v.pos.x, 0, v.pos.x - b.max.x), Math.max(b.min.z - v.pos.z, 0, v.pos.z - b.max.z));
  if (t.thing === 'house') {
    const inn = people.filter((v) => v.inside && dist(v) < 1.6);
    const c = village.C[t.cid];
    const lines = [inn.length ? `屋内 ${inn.length} 人` : '屋内无人'];
    if (c?.lit !== undefined && night) lines.push(c.lit ? '灯火未熄' : '灯火已熄，主人已歇下');
    sel.card.update({ lines, kind: inn.length ? (night ? 'sleep' : 'rest') : '', who: who(inn) });
    return;
  }
  const near = people.filter((v) => !v.inside && dist(v) < 0.9);
  sel.card.update({ lines: [near.length ? `${near.length} 人正在使用` : '暂无人使用'], kind: near.length ? '' : 'rest', who: who(near) });
}

function selectPerson(v) {
  if (!v) return;
  const card = residentCard(v.p, { onClose: closeCard, onPick: (id) => selectPerson(V.byId[id]) });
  sel = { v, card };
  show(card, v.object, 2.2);
  refreshCard();
}

function selectBeast(b) {
  const card = animalCard(b.info, b.s.kind, { onClose: closeCard, ownerId: b.s.owner, onPick: (id) => selectPerson(V.byId[id]) });
  sel = { b, card };
  show(card, b.object, 1.3);
  refreshCard();
}

/** 卡片上会变的部分：正在干什么、在哪儿、接下来、今天第几项。 */
function refreshCard() {
  if (!sel) return;
  if (sel.t || sel.c || sel.w) { refreshPlace(); return; }
  const hour = village.life.clock.hour;
  if (sel.b) {
    const b = sel.b;
    sel.card.update({ doing: animalDoing(b, V), where: b.home ? '' : village.whereAt(b.pos.x, b.pos.z), kind: b.home ? 'sleep' : b.moving ? '' : 'rest' });
    return;
  }
  sel.card.update(personStatus(sel.v, hour));
}

/** 村民此刻的状态：正在干什么、在哪儿、哪一类（干活 / 歇着 / 睡了 / 赶活动）、下一项、今天第几项。卡片和村民档案共用。 */
function personStatus(v, hour = village.life.clock.hour) {
  const day = v.p.day;
  let cur = -1;
  day.forEach(([t], i) => { if (hour >= t) cur = i; });
  const nxt = day[cur + 1];
  const night = village.life.clock.night || cur < 0;
  const key = v.doing.split(':')[0];
  return {
    doing: v.inside ? (night ? '已入睡' : '屋内') : LABELS[v.doing] ?? v.doing,
    where: v.inside ? (v.pos.x < BOUNDS.x0 ? village.whereAt(v.pos.x, v.pos.z) : PLACES[v.p.sleepAt ?? v.p.home]) : village.whereAt(v.pos.x, v.pos.z), // 在西沟的磨坊、山神庙里过夜的，写那个地方
    kind: v.inside && night ? 'sleep' : EVENTS[key] ? 'event' : REST.has(v.doing) || v.inside ? 'rest' : '',
    nextText: nxt ? `下一项 ${hm(nxt[0])}　${label(nxt[1], nxt[2])}` : '今日安排已全部完成',
    cur,
  };
}

// 村民档案：左下角按钮打开页面里的横板大卡；详情里"去村里找"= 关掉档案、选中这个人并跟着他
const roster = createRoster(document.getElementById('roster'), {
  status: (id) => (V.byId[id] ? personStatus(V.byId[id]) : null),
  hour: () => village.life.clock.hour,
  beasts: (home) => village.life.beasts.filter((b) => !b.s.caravan && (b.c?.id ?? (b.swim ? 'farmC' : b.s.role === 'pigeon' ? 'school' : null)) === home) // 鸭鹅归吴家、鸽子落在学堂（和旧档案页一样）
    .map((b) => ({ kind: b.s.kind, name: b.info.name, kindName: b.info.kind, about: b.info.about })),
  onFind: (id) => {
    const v = V.byId[id];
    if (!v) return;
    const host2 = v.object.parent; // 人在另一块沙盘上：先换过去
    if (host2 !== scenes.current.object && !scenes.busy) scenes.go(host2 === west.object ? 1 : -1, true);
    selectPerson(v);
    host.querySelector('.follow')?.click();
  },
  onClose: () => rosterBtn?.classList.remove('on'),
  // 档案里的地图：真实场景从正上方看下去的截图；居民按户标在自家院子上
  map: {
    bounds: BOUNDS,
    homeAt: (id) => { const c = village.C[id]; return c ? [c.object.position.x, c.object.position.z] : null; },
    image: () => (mapImage ??= mapSnapshot()),
  },
});
let mapImage = null;

/**
 * 村子的俯视图：正交相机从正上方往下拍一张（每米 8 个像素），颜色就是场景里的颜色。
 * 拍的时候光线固定成中午、人和动物先藏起来（地图上另外标头像）、远山和天空不画；拍完下一帧照常。
 */
function mapSnapshot() {
  if (inXR()) return null;
  const B = BOUNDS, PX = 8, W = Math.round((B.x1 - B.x0) * PX), H = Math.round((B.z1 - B.z0) * PX);
  village.object.updateMatrixWorld(true);
  const s = village.object.getWorldScale(new THREE.Vector3()).x;
  const c = village.object.localToWorld(new THREE.Vector3((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2));
  const cam = new THREE.OrthographicCamera((-(B.x1 - B.x0) / 2) * s, ((B.x1 - B.x0) / 2) * s, ((B.z1 - B.z0) / 2) * s, (-(B.z1 - B.z0) / 2) * s, 0.01, 20);
  cam.up.set(0, 0, -1); // 图的上边是北（-z），和村子坐标一致
  cam.position.set(c.x, c.y + 5, c.z);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  const hide = [backdrop.object, west.object, marker, ...village.life.people.map((v) => v.object), ...village.life.beasts.map((b) => b.object)].filter((o) => o?.visible);
  hide.forEach((o) => { o.visible = false; });
  applyLight(daylight(11), true); // 中午的光（会顺手换天空，所以先调光再去掉背景；下一帧 applyLight 照村里的钟换回来）
  const bg = scene.background;
  scene.background = null;
  renderer.shadowMap.needsUpdate = true;
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x1b1626, 1);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  rt.dispose();
  scene.background = bg;
  hide.forEach((o) => { o.visible = true; });
  renderer.shadowMap.needsUpdate = true;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // 读出来是倒的
  g.putImageData(img, 0, 0);
  return cv;
}
const rosterBtn = document.getElementById('rosterBtn');
rosterBtn?.addEventListener('click', (e) => { e.stopPropagation(); if (roster.open) roster.close(); else { roster.show(); rosterBtn.classList.add('on'); showSettings(false); showDebug(false); } });
if (params.has('roster')) { roster.show(params.get('roster') || null); rosterBtn?.classList.add('on');  if (params.get('rpick')) roster.pick(params.get('rpick')); } // ?roster=1 打开档案（地图），&rpick=村民id 在地图上点中这个人；?roster=村民id 直接看这个人的详情（截图检查用）

// ?pick=村民id 或 ?pick=beast:序号：一打开就弹出这张卡（截图检查用）；?unfold=1 把折叠的都展开
// 收集到的物件按种类计数（无头检查看有没有漏标）；?click=x,y 模拟在屏幕这一点点一下
document.documentElement.dataset.things = JSON.stringify(village.things.reduce((m, t) => ((m[t.thing] = (m[t.thing] ?? 0) + 1), m), {}));
if (params.get('click')) {
  const [cx, cy] = params.get('click').split(',').map(Number);
  setTimeout(() => { // 等画过几帧、矩阵都更新了再点
    camera.updateMatrixWorld();
    village.object.updateMatrixWorld(true);
    ray.setFromCamera({ x: (cx / innerWidth) * 2 - 1, y: -(cy / innerHeight) * 2 + 1 }, camera);
    pickScene();
    document.documentElement.dataset.clicked = sel?.t ? `thing:${sel.t.thing}:${sel.t.cid}` : sel?.c ? `yard:${sel.c.id}` : 'none';
  }, 1500);
}
if (params.get('go')) setTimeout(() => scenes.go(Number(params.get('go'))), 500); // ?go=1：打开后往西滑一块（检查换场景用）
if (params.get('pick')) {
  const id = params.get('pick');
  if (id.startsWith('beast:')) selectBeast(village.life.beasts[Number(id.slice(6))]);
  else if (id.startsWith('thing:')) { const [, k, n] = id.split(':'); selectThing(village.things.filter((t) => t.thing === k)[Number(n ?? 0)]); } // ?pick=thing:millstone
  else if (id.startsWith('west:')) { const [, k, n] = id.split(':'); selectThing(west.things.filter((t) => t.thing === k)[Number(n ?? 0)]); } // ?scene=west&pick=west:watermill
  else if (id.startsWith('yard:')) selectYard(village.C[id.slice(5)]);
  else selectPerson(V.byId[id]);
  if (params.get('follow')) host.querySelector('.follow')?.click(); // ?follow=1：选中后直接跟随（截图检查用）
  if (params.get('unfold')) host.querySelectorAll('details').forEach((d) => { d.open = true; });
}

// ---------------------------------------------------------------- 主循环

const clock = new THREE.Clock();
const followAt = new THREE.Vector3(), followD = new THREE.Vector3();
let lastT = 0;
// 声音：默认关着（浏览器要先点一下才能出声），左下角"声音"按钮打开
const sound = createSound(village, () => (inXR() ? renderer.xr.getCamera() : camera));
const soundBtn = document.getElementById('sound');
// 背景音乐：按时辰轮换，唱戏时让路（见 music.js）
const music = createMusic({ hour: () => village.life.clock.hour, busy: () => village.life.people.some((v) => v.state === 'fiddle') });
const musicBtn = document.getElementById('music');
// ?sound=1：直接打开声音，定时把统计写到 data-sound（无头检查：各种声音有没有触发、有没有报错）
// &soundsim=秒：等音效都加载完，把村子快进这么多秒（配合 ?cam= 把镜头放近，测"凑近了才响"）
if (params.has('sound')) {
  sound.toggle();
  setInterval(() => { document.documentElement.dataset.sound = JSON.stringify(sound.stats); }, 500);
  if (params.has('soundsim')) {
    setTimeout(() => renderer.setAnimationLoop(null), 0); // 不画画面，让音效解码快点
    const iv = setInterval(() => {
      if (!sound.ready) return;
      clearInterval(iv);
      camera.updateMatrixWorld();
      const t0 = clock.getElapsedTime() + 1;
      for (let i = 1; i <= Number(params.get('soundsim')) * 10; i++) { village.update(t0 + i / 10, camera.position); sound.update(t0 + i / 10, 0.1); }
      document.documentElement.dataset.soundsim = 'done';
    }, 200);
  }
}
function syncSoundBtn() {
  if (soundBtn) { soundBtn.textContent = sound.on ? '声音：开' : '声音：关'; soundBtn.classList.toggle('on', sound.on); }
  if (musicBtn) { musicBtn.textContent = music.on ? '音乐：开' : '音乐：关'; musicBtn.classList.toggle('on', music.on); }
}
musicBtn?.addEventListener('click', (e) => { e.stopPropagation(); music.toggle(); syncSoundBtn(); });
// 设置按钮：点一下往上弹出声音、音乐、季节，再点（或点场景）收起
const settingsEl = document.getElementById('settings'), settingsBtn = document.getElementById('settingsBtn');
const showSettings = (on) => { if (!settingsEl) return; settingsEl.hidden = !on; settingsBtn.classList.toggle('on', on); if (on) showDebug(false); };
// 调试按钮：往上弹出实时数值（帧率、每帧耗时、draw call、三角面、着色器 / 贴图 / 几何体数、在外面的人和动物、时钟流速）
const debugEl = document.getElementById('debug'), debugBtn = document.getElementById('debugBtn');
function showDebug(on) { if (!debugEl) return; debugEl.hidden = !on; debugBtn.classList.toggle('on', on); if (on && !settingsEl.hidden) { settingsEl.hidden = true; settingsBtn.classList.remove('on'); } }
debugBtn?.addEventListener('click', (e) => { e.stopPropagation(); showDebug(debugEl.hidden); });
const dbg = { frames: 0, ms: 0, t: performance.now(), last: performance.now(), worst: 0, cpu: 0, gpu: [], gpuMs: null };
// GPU 耗时：浏览器支持计时扩展才有（EXT_disjoint_timer_query_webgl2）。查询结果要过几帧才拿得到
const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
let gpuQuery = null;
const gpuBegin = () => { if (!timer || debugEl.hidden || gpuQuery) return; gpuQuery = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, gpuQuery); };
const gpuEnd = () => {
  if (!gpuQuery || gpuQuery.ended) return;
  gl.endQuery(timer.TIME_ELAPSED_EXT); gpuQuery.ended = true; dbg.gpu.push(gpuQuery);
};
const gpuPoll = () => {
  gpuQuery = null;
  while (dbg.gpu.length && gl.getQueryParameter(dbg.gpu[0], gl.QUERY_RESULT_AVAILABLE)) {
    const q = dbg.gpu.shift();
    if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) dbg.gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(q);
  }
};
// 浏览器实际用的显卡：显卡进程崩过一次后 Chrome 会悄悄换成软件渲染（SwiftShader，CPU 模拟显卡），帧率掉到个位数——面板上标红
const gpuName = (() => {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const soft = /swiftshader|llvmpipe|software|basic render/i.test(name);
  const parts = name.replace(/^ANGLE \(|\)$/g, '').split(','); // ANGLE (厂商, 型号 (0x…) Direct3D11 …, D3D11)：只留型号
  const short = (parts[1] ?? parts[0]).replace(/\(0x[0-9A-F]+\)|Direct3D.*|vs_.*/gi, '').trim();
  return soft ? `<span style="color:var(--red)">软件渲染（${short}）——浏览器没用上显卡，重启浏览器或打开硬件加速</span>` : short;
})();
function debugTick() { // 每帧记一下，半秒刷新一次面板
  const now = performance.now(), d = now - dbg.last;
  dbg.last = now; dbg.frames++; dbg.ms += d; dbg.worst = Math.max(dbg.worst, d);
  if (debugEl.hidden || now - dbg.t < 500) return;
  const info = renderer.info, life = village.life, out = life.people.filter((v) => !v.inside).length;
  const row = (k, v) => `${k}  <b>${v}</b>`;
  debugEl.innerHTML = [
    row('帧率', `${Math.round((dbg.frames * 1000) / (now - dbg.t))} fps`),
    row('帧间隔', `${(dbg.ms / dbg.frames).toFixed(1)} ms（最慢 ${dbg.worst.toFixed(0)}）`),
    row('CPU', `${(dbg.cpu / dbg.frames).toFixed(1)} ms / 帧`), // 更新 + 提交渲染真正花的时间；90 帧要压在 11 ms 以内（CPU、GPU 各自）
    row('GPU', timer ? (dbg.gpuMs === null ? '…' : `${dbg.gpuMs.toFixed(1)} ms / 帧`) : '浏览器不支持计时'),
    row('Draw call', info.render.calls),
    row('三角面', `${(info.render.triangles / 10000).toFixed(1)} 万`),
    row('着色器', info.programs.length),
    row('贴图 / 几何体', `${info.memory.textures} / ${info.memory.geometries}`),
    row('显卡', gpuName),
    row('像素比', renderer.getPixelRatio().toFixed(2)),
    row('XR', renderer.xr.isPresenting ? `是 · ${renderer.xr.getSession()?.frameRate ?? '?'} Hz（可选 ${renderer.xr.getSession()?.supportedFrameRates?.join(' / ') ?? '未知'}）` : '否'),
    row('在外面', `${out} 人 · ${life.beasts.filter((b) => !b.home).length} 只`),
    row('时钟', `${life.clock.label}（1 秒 = ${(life.clock.rate).toFixed(2)} 分钟）`),
    row('场景', scenes.current.name),
  ].join('\n');
  dbg.frames = 0; dbg.ms = 0; dbg.worst = 0; dbg.cpu = 0; dbg.t = now;
}
settingsBtn?.addEventListener('click', (e) => { e.stopPropagation(); showSettings(settingsEl.hidden); });
renderer.domElement.addEventListener('pointerdown', () => showSettings(false));
if (params.has('debug')) showDebug(true); // ?debug=1：一打开就显示调试面板
if (params.has('settings')) showSettings(true); // ?settings=1：一打开就展开（截图检查用）
// 季节按钮：春 → 夏 → 秋 → 冬，换季节要重建整个场景，带着新参数重新加载页面（其余参数保留）
const seasonBtn = document.getElementById('season');
if (seasonBtn) {
  seasonBtn.textContent = `季节：${SEASONS[season()].name}`;
  seasonBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const q = new URLSearchParams(location.search);
    q.set('season', SEASON_ORDER[(SEASON_ORDER.indexOf(season()) + 1) % SEASON_ORDER.length]);
    location.search = q.toString();
  });
}
if (params.has('music')) { music.toggle(); setInterval(() => { document.documentElement.dataset.music = `${music.title}|${music.on}`; }, 500); } // ?music=1：直接放（无头检查用）
soundBtn?.addEventListener('click', (e) => { e.stopPropagation(); sound.toggle(); syncSoundBtn(); });
const viewer = new THREE.Vector3();
let lastLabel = '';
let shadowFrame = 1;
const first = village.update(0, camera.position);
applyLight(first.light, true);
renderer.setAnimationLoop((_, frame) => {
  const work0 = performance.now();
  const t = clock.getElapsedTime();
  const dt = Math.min(0.1, t - lastT);
  lastT = t;
  if (!(frame && anchor.update(frame, viewer))) {
    if (follow && sel && (sel.v || sel.b)) { // 跟随：相机和观察点一起平移，角色慢慢移到画面中间
      const o = (sel.v ?? sel.b).object.getWorldPosition(followAt);
      followD.subVectors(o, controls.target).multiplyScalar(Math.min(1, dt * 3));
      controls.target.add(followD);
      camera.position.add(followD);
    }
    controls.update();
    viewer.copy(camera.position);
  }
  const s = village.update(t, viewer);
  west.update(t, { light: s.light, weather: village.life.weather(), viewer, hour: village.life.clock.hour });
  if (follow && sel && (sel.v || sel.b) && !scenes.busy) { // 跟着的人走过了村西口：镜头跟着换到那块沙盘
    const host = (sel.v ?? sel.b).object.parent;
    if (host !== scenes.current.object) scenes.go(host === west.object ? 1 : -1, true);
  }
  scenes.update(dt, inXR() || params.has('signs')); // ?signs=1：桌面上也显示 XR 里的路牌（截图检查用）
  sound.update(t, dt);
  music.update(dt);
  if (params.has('sound')) document.documentElement.dataset.sound = JSON.stringify(sound.stats);
  if (marker.visible) marker.position.y = markerH + (Math.floor(t * 3) % 2) * 0.1; // 一上一下跳
  xrCard.update(viewer, inXR() || params.has('xrcard')); // ?xrcard=1：桌面上也画 XR 卡片（截图检查用）
  applyLight(s.light);
  backdrop.update(t, s.light.night);
  if (clockEl && s.clock.label !== lastLabel) {
    lastLabel = s.clock.label;
    const e = EVENTS[village.life.today()], w = village.life.weather();
    // 时钟栏：大号时间 + 右边日期天气（一行），下面一行今日活动
    clockEl.innerHTML = `<div class="top"><span class="time">${lastLabel}</span><span class="date">${lunarLabel(s.clock.day)}<br>${s.clock.night ? '夜 · ' : ''}${WEATHER[w]}</span></div>`
      + `<div class="ev"><span class="name">${e.name}</span> <span class="sub">${w === 'rain' ? '因雨延期' : `${fmt(e.from)}–${fmt(e.to)} ${e.place}`}</span></div>`;
    refreshCard();
    roster.refresh();
  }
  // 阴影贴图隔一帧重画一次（人在走）；太阳也只在重画的那帧挪，贴图和太阳始终对得上。
  // 太阳挂在沙盘下面，跟沙盘一起动：XR 里拖、转、拉近推远时贴图本身不用重画，但 three 只在重画那帧更新阴影的投影矩阵，
  // 所以每帧照沙盘现在的位置把矩阵补算一遍（很便宜）——否则没重画的那帧影子留在上一帧的位置，一动就一闪一闪
  if ((shadowFrame = (shadowFrame + 1) % 2) === 0 || renderer.shadowMap.needsUpdate) { renderer.shadowMap.needsUpdate = true; sun.position.copy(sunWant); }
  stage.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  if (timer) { gpuPoll(); gpuBegin(); }
  renderer.render(scene, camera);
  if (window.loader && !params.has('holdload')) { window.loader.done(); window.loader = null; setTimeout(buildBVH, 500); } // 第一帧画出来了（着色器也编译完了）：载入画面淡出（?holdload=1 停在载入画面，截图检查用）
  if (timer) gpuEnd();
  dbg.cpu += performance.now() - work0;
  debugTick();
  if (params.has('perf') && ++perfFrames === 2) perfReport();
});

/**
 * 射线检测加速：合批后的大网格（整个村子几十万个三角面）逐个三角面试一遍要 15 毫秒，XR 里两只手的射线每几帧就要测一次。
 * 载入完以后空闲时给大网格各建一棵 BVH（three-mesh-bvh），之后一次射线检测不到 0.1 毫秒；没建的网格照旧逐个试。
 */
THREE.Mesh.prototype.raycast = acceleratedRaycast;
function buildBVH() {
  const todo = [];
  for (const S of SCENES) S.object.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.geometry.boundsTree && (o.geometry.index?.count ?? o.geometry.attributes.position.count) > 600) todo.push(o.geometry); });
  const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 50));
  const next = () => { // 空闲时一次建一棵；indirect：不改动网格本身的索引（不用重新上传显卡）
    const g = todo.pop();
    g.boundsTree ??= new MeshBVH(g, { indirect: true });
    if (todo.length) idle(next);
  };
  if (todo.length) idle(next);
}

// ?perf=1：渲染开销报告（draw call、三角面、材质 / 贴图 / 着色器数，按类别分），写到 data-perf
let perfFrames = 0;
function perfReport() {
  const info = renderer.info, owner = new Map();
  for (const v of village.life.people) v.object.traverse((o) => owner.set(o, 'people'));
  for (const b of village.life.beasts) b.object.traverse((o) => owner.set(o, 'animals'));
  const cat = {}, mats = new Map(), add = (k, o) => { const c = (cat[k] ??= { meshes: 0, shadow: 0, tris: 0 }); c.meshes++; if (o.castShadow) c.shadow++; c.tris += Math.round(((o.geometry?.index?.count ?? o.geometry?.attributes.position?.count ?? 0) / 3) * (o.isInstancedMesh ? o.count : 1)); };
  scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isSprite) return;
    const k = owner.get(o) ?? (o.isSprite ? 'sprites' : o.isInstancedMesh ? 'instanced' : o.userData.baked ? 'baked' : o.material?.side === THREE.BackSide ? 'outlines(dynamic)' : 'dynamic');
    add(k, o);
    const m = o.material, key = `${m.type}:${m.map?.name || m.map?.uuid?.slice(0, 4) || (m.vertexColors ? 'vcol' : m.color?.getHexString?.())}`;
    mats.set(m, (mats.get(m) ?? 0) + 1);
  });
  const inst = [], dyn = {};
  const texName = new Map(Object.entries(village.M).filter(([, v]) => v?.isMaterial).map(([k, v]) => [v, k]));
  const label = (o) => { for (let p = o; p; p = p.parent) { if (p.userData.thing) return p.userData.thing; if (p.userData.label) return p.userData.label; } return (texName.get(o.material) ?? (o.isSprite ? 'sprite' : `misc:${o.material.type}:${o.geometry.type}:${o.parent?.type}`)) + (o.parent?.userData.dynamic ? '@dyn' : ''); };
  scene.traverseVisible((o) => {
    if (o.isInstancedMesh) inst.push(`${o.userData.label ?? o.geometry.attributes.position.count}:${o.count}x${Math.round((o.geometry.index?.count ?? 0) / 3)}`);
    else if ((o.isMesh || o.isSprite) && !owner.has(o) && !o.userData.baked) { const k = label(o); dyn[k] = (dyn[k] ?? 0) + 1; }
  });
  cat.inst = inst; cat.dynBy = Object.entries(dyn).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const byMat = [...mats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([m, n]) => `${m.type}${m.vertexColors ? '(vcol)' : ''}${m.side === THREE.BackSide ? '(hull)' : ''}${m.transparent ? '(alpha)' : ''}×${n}`);
  document.documentElement.dataset.perf = JSON.stringify({ calls: info.render.calls, tris: info.render.triangles, programs: info.programs.length, textures: info.memory.textures, geometries: info.memory.geometries, materials: mats.size, shadowMap: sun.shadow.mapSize.x, cat, byMat });
}

// ---------------------------------------------------------------- 无头检查

// ?sim=秒：先在后台把村子快进这么多秒，统计有没有人 / 动物站进障碍（穿模）
if (params.has('sim')) {
  const total = Number(params.get('sim'));
  const nav = village.nav;
  let samples = 0, clipP = 0, clipA = 0, stuck = 0, escaped = 0, gateOpenSamples = 0, strolls = 0, ajarSamples = 0, beastStuck = 0, waiting = 0, goSamples = 0;
  const attended = {}, kidsAt = {}, waitWhy = {}, seen = new Set(), litLog = {}, leaveLog = {}, westWho = {}, whyA = {};
  const esc = {};
  const why = {};
  const lastPos = new Map();
  const simT0 = performance.now();
  for (let i = 1; i <= total * 10; i++) {
    village.update(i / 10, camera.position);
    sound.update(i / 10, 0.1);
    if (i % 5) continue;
    for (const v of village.life.people) {
      if (v.inside) continue;
      samples++;
      if (v.perched || v.lift > 0 || v.tasks[0]?.type === 'climb') continue; // 台上、凳上、正在爬上爬下（石墩、戏台台阶）的不算
      if (!nav.freeAt(v.pos.x, v.pos.z, false, true)) { clipP++; const k = `${v.p.id}/${v.doing}/${v.state}`; why[k] = (why[k] ?? 0) + 1; }
      const lp = lastPos.get(v);
      if (v.state === 'walk' && lp && Math.hypot(lp[0] - v.pos.x, lp[1] - v.pos.z) < 0.01) stuck++;
      if (v.tasks[0]?.type === 'go' && v.state === 'idle' && !v.V.nav.closedDoorAt(v.pos.x + Math.sin(v.heading) * 0.35, v.pos.z + Math.cos(v.heading) * 0.35)) { waiting++; const ob = v.ahead(Math.sin(v.heading), Math.cos(v.heading)); const k = `${v.p.id}/${v.doing}<${ob ? `${ob.p.id}:${ob.state}:${ob.doing}` : '?'}`; waitWhy[k] = (waitWhy[k] ?? 0) + 1; } // 在路上站着等人（排队）
      if (v.tasks[0]?.type === 'go') goSamples++;
      seen.add(v.doing);
      if (v.pos.x < -45) westWho[v.p.id] = v.doing; // 走到西沟去的人
      lastPos.set(v, [v.pos.x, v.pos.z]);
    }
    for (const b of village.life.beasts) {
      if (b.home || b.s.perches || b.s.role === 'pigeon' || b.circling) continue;
      if (!nav.freeAt(b.pos.x, b.pos.z, b.swim) && !nav.door[nav.index(b.pos.x, b.pos.z)]) { clipA++; const k = `${b.s.role}@${Math.round(b.pos.x)},${Math.round(b.pos.z)}`; whyA[k] = (whyA[k] ?? 0) + 1; }
      if ((b.stuck ?? 0) > 0.3) { beastStuck++; const k = `stuck:${b.s.role}@${b.c?.id ?? Math.round(b.pos.x) + ',' + Math.round(b.pos.z)}`; whyA[k] = (whyA[k] ?? 0) + 1; }
      // 逃逸：没人赶、没人喂的时候，圈养的牲口跑出了自己的院子
      if (b.stroll) strolls++;
      if (b.c && b.s.area && !b.follow && !b.graze && !b.stroll && !b.returning && ['chicken', 'pig', 'sheep'].includes(b.s.role)) {
        const c = b.c, dx = b.pos.x - c.object.position.x, dz = b.pos.z - c.object.position.z;
        const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
        const lx = cs * dx - sn * dz, lz = sn * dx + cs * dz;
        if (Math.abs(lx) > c.w / 2 || Math.abs(lz) > c.d / 2) { escaped++; esc[b.s.role + '@' + c.id] = (esc[b.s.role + '@' + c.id] ?? 0) + 1; if (escaped % 25 === 1) esc['x' + escaped] = `${village.life.clock.label} ${lx.toFixed(1)},${lz.toFixed(1)} t=${b.target ? 1 : 0} p=${b.path?.length ?? '-'} w=${b.wait.toFixed(1)} world=${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)} free=${nav.freeAt(b.pos.x, b.pos.z)} h=${nav.heightAt(b.pos.x, b.pos.z).toFixed(2)} ret=${b.returning} stroll=${!!b.stroll} fol=${!!b.follow} gr=${!!b.graze} area=${JSON.stringify(b.areaPoint())} ok=${!!nav.find(b.pos.x, b.pos.z, ...b.c.at(4, 0), { person: true, maxNodes: Infinity })} reach=${nav.reachable(b.pos.x, b.pos.z)} around=${[-0.5, -0.25, 0, 0.25, 0.5].map((dz) => [-0.5, -0.25, 0, 0.25, 0.5].map((dx) => (nav.freeAt(b.pos.x + dx, b.pos.z + dz) ? '' : '#') + nav.heightAt(b.pos.x + dx, b.pos.z + dz).toFixed(1)).join(' ')).join(' | ')}`; }
      }
    }
    const Cs = Object.values(village.life.people[0].V.C), hh = village.life.clock.hour, slot = Math.floor(hh * 2) / 2;
    if (!litLog[slot]) litLog[slot] = Cs.filter((c) => c.lit).map((c) => c.id).join(',') || '-';
    const leaving = village.life.people.filter((v) => !v.inside && v.tasks[0]?.type === 'go' && v.rushUntil > hh).length;
    if (leaving) leaveLog[Math.floor(hh * 10) / 10] = Math.max(leaveLog[Math.floor(hh * 10) / 10] ?? 0, leaving);
    for (const g of village.gates) { if (g.open > 0.8) gateOpenSamples++; if (g.state.ajar) ajarSamples++; }
    for (const v of village.life.people) if (!v.inside && EVENTS[v.doing.split(':')[0]]) attended[v.p.id] = v.doing;
    for (const v of village.life.people) if (!v.inside && v.doing === 'play') { const V = v.V; const k = V.streamBank.some(([x, z]) => Math.hypot(x - v.pos.x, z - v.pos.z) < 1.5) ? 'stream' : V.playFields.some(([x, z]) => Math.hypot(x - v.pos.x, z - v.pos.z) < 1.0) ? 'field' : 'other'; kidsAt[k] = (kidsAt[k] ?? 0) + 1; }
  }
  const sqc = village.life.people[0].V.C.square, cs = Math.cos(sqc.rot), sn = Math.sin(sqc.rot);
  const eve = village.life.people.filter((v) => !v.inside && /^(opera|bonfire|meeting)/.test(v.doing)).map((v) => { const dx = v.pos.x - sqc.object.position.x, dz = v.pos.z - sqc.object.position.z; return `${v.p.id}:${v.doing}:${v.state}:${v.tasks[0]?.type ?? '-'}:${(cs * dx - sn * dz).toFixed(1)},${(sn * dx + cs * dz).toFixed(1)}:lift${v.lift.toFixed(1)}:${v.V.claimed(v) ?? ''}`; });
  const out = village.life.people.filter((v) => !v.inside);
  const close = [];
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const d = Math.hypot(out[i].pos.x - out[j].pos.x, out[i].pos.z - out[j].pos.z); if (d < 0.7) close.push(`${out[i].p.id}(${out[i].state},${out[i].tasks[0]?.type ?? '-'})~${out[j].p.id}(${out[j].state},${out[j].tasks[0]?.type ?? '-'})=${d.toFixed(2)}`); }
  eve.push(...close.map((c) => 'CLOSE ' + c));
  document.documentElement.dataset.eve = JSON.stringify(eve);
  document.documentElement.dataset.sim = JSON.stringify({ seconds: total, ms: Math.round(performance.now() - simT0), hour: village.life.clock.label, westWho, whyA, caravan: [V.byId.niu_wanshan, V.byId.shi_wa, ...village.life.beasts.filter((b) => b.s.caravan)].map((a) => `${(a.p ? a.inside : a.home) ? '不在村里' : a.p ? a.doing : '骡子'}@${Math.round(a.pos.x)},${Math.round(a.pos.z)}`), samples, clipPeople: clipP, clipAnimals: clipA, beastStuck, queue: `${waiting}/${goSamples}`, seen: [...seen].sort(), litLog, leaveLog, waitWhy: Object.entries(waitWhy).sort((a, b) => b[1] - a[1]).slice(0, 6), escaped, esc, lodged: village.life.people.filter((v) => v.inside && v.pos.x < BOUNDS.x0).map((v) => `${v.p.name}@${village.whereAt(v.pos.x, v.pos.z)}`), pigsOut: village.life.beasts.filter((b) => b.s.role === 'pig').map((b) => { const [x0, z0, x1, z1] = b.s.area, [cx, cz] = b.c.at((x0 + x1) / 2, (z0 + z1) / 2); return Math.hypot(b.pos.x - cx, b.pos.z - cz) > 2.2 ? `${b.c.id}@${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)}${b.stroll || b.returning ? '(溜达)' : ''}` : null; }).filter(Boolean), ...village.life.people[0].V.stats, kidsAt, ducksAt: village.life.beasts.filter((b) => b.swim).map((b) => `${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)}`), gateOpenSamples, ajarSamples, strolls, event: village.life.today(), haircuts: village.life.barber.served, barberPlan: village.life.barber.plan.map((c) => `${c.id}@${c.at.toFixed(1)}${c.done ? '✓' : ''}`), attended: Object.keys(attended).length, roles: Object.values(attended).filter((d) => d.includes(':')), fireLit: village.object.userData.fireSeen, stuckWalkers: stuck, why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 12) });
}

let drawables = 0;
let tris = 0;
scene.traverseVisible((o) => { // 只算当前这块沙盘（另一块藏着不画）
  if (!o.isMesh && !o.isSprite) return;
  drawables++;
  if (o.isMesh) tris += ((o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0) / 3) * (o.isInstancedMesh ? o.count : 1);
});
document.documentElement.dataset.tris = String(Math.round(tris)); // 三角面数（不含阴影那一遍）
document.documentElement.dataset.graves = JSON.stringify(village.life.people[0].V.graves?.at ?? null); // 祖坟在哪（截图对镜头用）
document.documentElement.dataset.calls = String(drawables); // 每只眼大约这么多 draw call（不含阴影）
document.documentElement.dataset.west = JSON.stringify({ audit: west.object.userData.audit, pasture: V.pasture.length, work: { fieldWest: V.fields.fieldWest.length, woods: V.woods.filter((w) => w.at[0] < -45).length, mill: V.mill.at.map((v) => +v.toFixed(1)) }, bake: west.object.userData.bake, flora: west.object.userData.flora, floating: west.object.userData.floating, coplanar: { found: west.object.userData.coplanar.found, left: west.object.userData.coplanar.left, leftSamples: west.object.userData.coplanar.leftSamples }, bridges: west.terrain.bridges.length, things: west.things.reduce((m, t) => ((m[t.thing] = (m[t.thing] ?? 0) + 1), m), {}) });
document.documentElement.dataset.bake = JSON.stringify(village.object.userData.bake);
document.documentElement.dataset.audit = JSON.stringify({ perchFix: village.object.userData.perchFix, coplanar: village.object.userData.coplanar, flora: village.object.userData.flora, floating: village.object.userData.floating, unreachable: village.object.userData.unreachable, islands: village.object.userData.islands, brokenEdges: village.object.userData.brokenEdges });
document.documentElement.dataset.ready = '1';
