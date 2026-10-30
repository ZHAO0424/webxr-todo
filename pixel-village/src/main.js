import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
import { createTradeBubbles, coinText } from './ui/tradeBubble.js';
import { GOODS, goodName, goodUnit, reasonText } from './life/economy.js';
import { addNewcomer, jobById, setJob, relicText, pickOldHouse } from './life/newcomers.js';
import { createNewcomerPanel } from './ui/newcomer.js';
import { addResident } from './residents.js';
import { pickThing, describe, YARDS } from './things.js';
import { HOUSEHOLDS, RESIDENTS } from './residents.js';
import { voxelCharacter } from './voxel.js';
import { buildMaterials } from './textures.js';
import { createSound } from './audio.js';
import { createMusic } from './music.js';
import { animalDoing } from './animalInfo.js';
import { EVENTS, WEATHER, fmt, lunarLabel } from './life/index.js';
import { createSceneSwitch } from './scenes.js';
import { setSeason, season, festival, SEASONS, ORDER as SEASON_ORDER } from './season.js';
import { setRuins, ruinsMode, EAST_BOUNDS } from './east.js';
import { auditOverlaps } from './overlap.js';
import { SAVE_KEYS, loadWorld, yearOf, yearLabel } from './world.js';
import { mine, statusOf, markSent, markQueued } from './mine.js';
import { cloud } from './cloud.js';
import { progress as badgeProgress, affinity, check as checkBadges, BADGES } from './life/badges.js';
import { showAway } from './ui/away.js';
import { signature, pickKeys, EDIT_KEYS } from './residentSchema.js';
import { EN, tr, plural, setLang } from './i18n.js';
import { villageName, hhName, hhField, word, pName, pNick, pJob, pHousehold, pStory, pTraits, pSkills, pLikes } from './names.js';
import { VILLAGE } from './residents.js';
import { WEST_BOUNDS } from './west.js';

const params = new URLSearchParams(location.search);
// 缓存管家（sw.js）：以后每次打开都先问服务器代码有没有更新，不会新旧文件混用；无头检查时不装
if ('serviceWorker' in navigator && !navigator.webdriver && !params.has('uicheck') && !params.has('sim')) navigator.serviceWorker.register('sw.js').catch(() => {});
// ?world=world/state.json：读后台模拟（tools/sim.mjs）存下的村子接着过——季节、开局方式、第几天几点、经济、老宅、新居民都照存档
// 村子存档：默认读仓库里的 world/state.json（GitHub Actions 每小时在后台把村子往前过一段、存回这里）；?world=别的.json 读别的；?world=0 不读存档（旧的整村、从下午开始）
const worldUrl = params.get('world') ?? (['time', 'season', 'ruins', 'event', 'sim'].some((k) => params.has(k)) ? '0' : 'world/state.json'); // 指定了时间、季节这些的（截图、回归）照旧不读
const saved = worldUrl === '0' ? null // PV_SAVED：index.html 里一打开就开始下的默认存档
  : await (worldUrl === 'world/state.json' && window.PV_SAVED ? window.PV_SAVED : fetch(worldUrl, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null), () => null));
setSeason(saved?.season ?? params.get('season') ?? 'autumn'); // ?season=spring|summer|autumn|winter：建场景之前定（见 season.js）
auditOverlaps(params.get('overlap') === '1'); // ?overlap=1：建村时按三角面查共面重叠（慢，调试用），结果在 data-audit / data-east / data-west 的 overlap 里
setRuins(saved ? saved.ruins : params.get('ruins') === '1'); // ?ruins=1：废墟开局（老村址没人住的老宅是塌的，新居民住进来才修好）；设置里的「老宅」按钮切换

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // 阴影隔一帧重画一次（每帧重画要把三百来个投影的东西再画一遍；人走得慢，看不出差别）
renderer.xr.enabled = true;
document.body.append(renderer.domElement); // 进入 VR 的按钮在设置里（下面 vrBtn）

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
  c.object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); // 自己不接自己的影子：每帧姿势不同，身上的影子斑纹跟着变，看着像材质在闪
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
window.loader?.set(0.38, tr('盖房子、种庄稼…', 'Raising houses, sowing fields...'), 0.86, lastBuild);
await nextFrame();
const t0 = performance.now();
const village = buildVillage({ startHour: saved?.hour ?? Number(params.get('time') ?? 15.5), event: params.get('event'), weather: params.get('weather'), M: M0 }); // ?time=6 从早上六点开始；?event=opera|market|bonfire|harvest|movie|shrine|meeting 指定今天的活动
document.documentElement.dataset.buildMs = String(Math.round(performance.now() - t0));
try { localStorage.setItem('pvBuildMs', String(Math.round(performance.now() - t0))); } catch { /* 隐私模式存不了，下回按 5 秒估 */ }
window.loader?.set(0.88, tr('村民起床…', 'Villagers waking up...'), 0.97, 2500);
await nextFrame();
const west = village.west; // 西沟：接在村子西边的另一块沙盘（village.js 里一起建，共用导航网格和村民）
const east = village.east; // 老村址：接在村子东边
const backdrop = buildBackdrop();
// 村子和西沟在同一个世界里（西沟的 x 接着村子往西排），换场景 = 把世界平移过来（scenes.js）
const world = new THREE.Group();
world.add(village.object, west.object, east.object);
stage.add(world, backdrop.object);
const SCENES = [
  { id: 'east', name: tr('老村址', 'Old Site'), object: east.object, things: east.things, shift: -90 },
  { id: 'village', name: tr('村子', 'Village'), object: village.object, things: village.things, shift: 0 },
  { id: 'west', name: tr('西沟', 'West Gully'), object: west.object, things: west.things, shift: 90 },
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
    controller.updateWorldMatrix(true, false); // controller：手上那条朝下 20° 的射线（xr.js）
    ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    ray.ray.direction.set(0, 0, -1).transformDirection(controller.matrixWorld);
    ray.camera = renderer.xr.getCamera();
    pickRay();
  },
  onMove: () => closeCard(), // 双手握住拖、转、拉近推远，或沙盘滑回眼前：卡片收起
});
// 换场景：屏幕左右的按钮、键盘 ← →、XR 里沙盘两边的路牌；?scene=west 直接从西沟开始，?seam=1 两块都画（看接缝）
const scenes = createSceneSwitch({ world, stage, scenes: SCENES, M: village.M, start: Math.max(0, SCENES.findIndex((s) => s.id === (params.get('scene') ?? 'village'))), onChange: () => closeCard(), showAll: params.has('seam') });
renderer.setClearColor(0x000000, 1);
/** 跟着人走到另一块沙盘：直接换到那一块（不算"换场景"，不关卡片）。 */
const goToBoard = (object) => { const i = SCENES.findIndex((s) => s.object === object); if (i >= 0) scenes.go(i - SCENES.indexOf(scenes.current), true); };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- 桌面：时钟 + 点村民 / 小动物看卡片

setupPixelUI();
if (EN) { // index.html 里写死的中文按钮、提示：英文界面换掉（声音、音乐、季节、老宅按钮下面按状态写）
  const set = (id, text, title) => { const el = document.getElementById(id); if (!el) return; if (text) el.textContent = text; if (title) el.title = title; };
  set('settingsBtn', 'Settings'); set('debugBtn', 'Debug'); set('rosterBtn', 'Villagers');
  set('goLeft', null, 'Go west (←)'); set('goRight', null, 'Go east (→)');
}
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
// 界面按钮的点击声：捕获阶段听，面板里自己拦了冒泡的按钮也会响；亮着的主按钮（进村、下一步……）用确认那一声
addEventListener('click', (e) => { const b = e.target.closest?.('button'); if (b && !b.disabled) sound.ui(b.classList.contains('on') || b.classList.contains('create')); }, true);
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
  if (S.id === 'east') { selectPlace(east.placeAt(p.x, p.z), p); return; }
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

function closeCard() { sel = null; follow = false; closeTo = 0; host.innerHTML = ''; host.hidden = true; marker.removeFromParent(); marker.visible = false; xrCard.set(null); }
const dockCard = () => { host.style.top = `${clockEl.getBoundingClientRect().bottom + 6}px`; }; // 卡片总在时钟栏下面
addEventListener('resize', dockCard);
function show(card, obj, h) {
  host.innerHTML = ''; host.append(card.el); host.hidden = false; dockCard(); obj.add(marker); marker.position.set(0, h, 0); marker.visible = true; markerH = h;
  xrCard.set(card.el, obj, h + 0.5); // XR 里同一张卡片画成贴图，浮在箭头上面
  if (sel?.v || sel?.b) { // 人和动物的卡片上有"跟随"：镜头平移着把它留在画面中间（距离、角度不变）
    const b = document.createElement('button');
    b.className = 'btn follow';
    const label = () => { b.textContent = follow ? tr('跟随中', 'Following') : tr('跟随', 'Follow'); b.classList.toggle('on', follow); };
    b.addEventListener('click', () => { follow = !follow; label(); });
    label();
    card.el.querySelector('.facecol')?.append(b); // 放在头像正下方
  }
}
let follow = false;
let closeTo = 0; // 跟随时把镜头慢慢推近到这个距离（0 = 不推）；自己拖、滚轮缩放就停
/** 跟住卡片上这个人：已经在跟就不动（按钮是开关，连点两次会关掉），再把镜头推近到看得清人。 */
const followSel = (near = 0.32) => { if (!follow) host.querySelector('.follow')?.click(); closeTo = near; };
controls.addEventListener('start', () => { closeTo = 0; });
let markerH = 2.2;
const spot = new THREE.Object3D(); // 房子、物件上方放箭头的点
village.object.add(spot);

const pick = (id) => selectPerson(V.byId[id]);
const homeOf = (cid) => HOUSEHOLDS.find((h) => h.id === cid);
const residentsOf = (cid) => village.life.people.filter((v) => v.p.home === cid).map((v) => ({ id: v.p.id, name: pName(v.p) }));
const doingOf = (v) => (v.inside ? '' : LABELS[v.doing] ?? LABELS[v.doing?.split(':')[0]] ?? '');

/** 代销车卡片上加一句：车上现在有什么、是谁家的。 */
function cartNow() {
  const L = V.econ.cartLines();
  if (!L.length) return tr('车上现在空着。', 'The cart is empty right now.');
  return tr('车上现在：', 'On the cart now: ') + L.map((l) => (EN ? `${l.qty}${goodUnit(l.good, l.qty)} ${goodName(l.good).toLowerCase()} (${l.owner})` : `${goodName(l.good)} ${l.qty} ${goodUnit(l.good)}（${l.owner}的）`)).join(EN ? ', ' : '、') + tr('。', '.');
}

function selectThing(t) {
  const place = t.cid ? PLACES[t.cid] : null;
  const d0 = describe(t, place);
  const d = t.thing === 'consignCart' ? { ...d0, about: `${d0.about} ${cartNow()}` } : d0;
  const h = t.thing === 'house' ? homeOf(t.cid) : null;
  const card = thingCard({ ...d, household: h && { name: hhName(h, true) }, people: t.thing === 'house' ? residentsOf(t.cid) : [] }, { onClose: closeCard, onPick: pick });
  sel = { t, card };
  scenes.current.object.add(spot);
  spot.position.set((t.box.min.x + t.box.max.x) / 2, t.box.max.y, (t.box.min.z + t.box.max.z) / 2);
  show(card, spot, 0.5);
  refreshCard();
}

function selectYard(c) {
  const h = homeOf(c.id), y = YARDS[c.id];
  const card = thingCard({ name: h ? hhName(h, true) : PLACES[c.id], tags: [(h && hhField(h, 'kind')) ?? y?.kind].filter(Boolean), about: (h && hhField(h, 'note')) ?? y?.note ?? '', people: residentsOf(c.id) }, { onClose: closeCard, onPick: pick });
  sel = { c, card };
  village.object.add(spot);
  spot.position.set(c.object.position.x, c.object.position.y + 1.5, c.object.position.z);
  show(card, spot, 0.5);
  refreshCard();
}

/** 房子 / 院子 / 物件卡片的"此刻"。 */
function refreshPlace() {
  const people = village.life.people;
  const who = (list) => list.map((v) => ({ id: v.p.id, name: `${pName(v.p)}${doingOf(v) ? ' · ' + doingOf(v) : ''}` }));
  const night = village.life.clock.night;
  if (sel.w) { // 西沟的一片地方：附近有没有人
    const [x, z] = sel.at;
    const near = people.filter((v) => !v.inside && Math.hypot(v.pos.x - x, v.pos.z - z) < 10);
    sel.card.update({ lines: [near.length ? (EN ? `${plural(near.length, 'person', 'people')} nearby` : `附近 ${near.length} 人`) : tr('四下无人', 'Nobody around')], kind: near.length ? '' : 'rest', who: who(near) });
    return;
  }
  if (sel.c) {
    const c = sel.c;
    const here = people.filter((v) => village.compoundAt(v.pos.x, v.pos.z) === c);
    const out = here.filter((v) => !v.inside), inn = here.filter((v) => v.inside);
    const lines = [here.length ? (EN ? `Yard: ${out.length} · Indoors: ${inn.length}` : `院中 ${out.length} 人 · 屋内 ${inn.length} 人`) : tr('院中无人', 'Yard is empty')];
    if (c.lit !== undefined && night) lines.push(c.lit ? tr('灯火未熄', 'Lamps still lit') : tr('灯火已熄', 'Lamps out'));
    sel.card.update({ lines, kind: here.length ? '' : 'rest', who: who(here) });
    return;
  }
  const t = sel.t, b = t.box;
  const dist = (v) => Math.hypot(Math.max(b.min.x - v.pos.x, 0, v.pos.x - b.max.x), Math.max(b.min.z - v.pos.z, 0, v.pos.z - b.max.z));
  if (t.thing === 'house') {
    const inn = people.filter((v) => v.inside && dist(v) < 1.6);
    const c = village.C[t.cid];
    const lines = [inn.length ? (EN ? `${plural(inn.length, 'person', 'people')} inside` : `屋内 ${inn.length} 人`) : tr('屋内无人', 'Nobody inside')];
    if (c?.lit !== undefined && night) lines.push(c.lit ? tr('灯火未熄', 'Lamps still lit') : tr('灯火已熄，主人已歇下', 'Lamps out, all asleep'));
    sel.card.update({ lines, kind: inn.length ? (night ? 'sleep' : 'rest') : '', who: who(inn) });
    return;
  }
  const near = people.filter((v) => !v.inside && dist(v) < 0.9);
  sel.card.update({ lines: [near.length ? (EN ? `In use by ${plural(near.length, 'person', 'people')}` : `${near.length} 人正在使用`) : tr('暂无人使用', 'Not in use')], kind: near.length ? '' : 'rest', who: who(near) });
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
    doing: v.inside ? (night ? tr('已入睡', 'Asleep') : tr('屋内', 'Indoors')) : v.errandText ?? LABELS[v.doing] ?? v.doing,
    where: v.inside ? (v.pos.x < BOUNDS.x0 ? village.whereAt(v.pos.x, v.pos.z) : PLACES[v.p.sleepAt ?? v.p.home] ?? village.whereAt(v.pos.x, v.pos.z)) : village.whereAt(v.pos.x, v.pos.z), // 在西沟的磨坊、山神庙里过夜的，写那个地方
    kind: v.inside && night ? 'sleep' : EVENTS[key] ? 'event' : REST.has(v.doing) || v.inside ? 'rest' : '',
    nextText: nxt ? (EN ? `Next ${hm(nxt[0])}  ${label(nxt[1], nxt[2])}` : `下一项 ${hm(nxt[0])}　${label(nxt[1], nxt[2])}`) : tr('今日安排已全部完成', 'All done for today'),
    dealText: dealLine(v),
    cur,
  };
}

// ---------------------------------------------------------------- 买卖（life/economy.js、trade.js）：成交气泡、卡片上今天的买卖、档案里的家当和账

const ECON = village.life.econ;
if (params.has('debug')) { window.__life = village.life; window.__village = village; } // 调试：控制台里能看经济（__life.econ / __life.trade）、导航（__village.nav）
const bubbles = createTradeBubbles();
if (!params.has('sim')) V.onTrade = (t) => { bubbles.show(t, V.byId); document.documentElement.dataset.trade = `${t.buyer}:${t.good ?? t.service}`; if (params.has('followtrade') && !sel) { const b = V.byId[t.buyer]; selectPerson(b); host.querySelector('.follow')?.click(); const p = b.object.getWorldPosition(new THREE.Vector3()); controls.target.copy(p); camera.position.set(p.x, p.y + 0.09, p.z + 0.13); } }; // ?followtrade=1：第一笔成交时选中买家、镜头跟过去（截图检查用） // 无头快进时不画气泡；data-trade 给无头截图等成交用
V.onRun = (pd, t) => bubbles.say(pd.object, [[tr('代买 ', 'Errand: '), '#e0d4bf'], [`${goodName(t.good)}×${t.qty}`, '#ffcc66']]); // 货郎代买：头顶冒一句
const nameOf = (id) => (V.byId[id] ? pNick(V.byId[id].p) : id === 'niu_wanshan' ? tr('骡帮', 'the mule train') : id === 'county' ? tr('县里', 'the county') : id); // county：县里发村长补贴
/** 英文句子中间的词：首字母小写（Tofu → tofu；两个大写字母开头的缩写、专名不动）。 */
const mid = (s) => (EN && /^[A-Z][a-z]/.test(s ?? '') ? s[0].toLowerCase() + s.slice(1) : s);
const goodText = (t) => (t.good ? (EN ? `${mid(goodName(t.good))} ×${t.qty}` : `${goodName(t.good)}×${t.qty}`) : EN ? mid(reasonText(t.service)) : t.service);
const payText = (t) => (EN
  ? (t.place === '货郎代买' ? `${coinText(t.price)}, via the peddler` : t.kind === 'gift' ? 'a gift, free' : t.kind === 'barter' ? `traded for ${mid(goodName(t.swap.good))} ×${t.swap.qty}` : t.kind === 'credit' ? `${coinText(t.price)} on credit` : coinText(t.price))
  : (t.place === '货郎代买' ? `${t.price}文，货郎代买` : t.kind === 'gift' ? '人情，不要钱' : t.kind === 'barter' ? `拿${goodName(t.swap.good)}×${t.swap.qty}换的` : t.kind === 'credit' ? `赊了${t.price}文` : `${t.price}文`));
/** 账本里的一户 / 一个人叫什么。 */
const unitName = (id) => PLACES[id] ?? nameOf(id);
/** 卡片上：今天最近一笔和他有关的买卖。 */
function dealLine(v) {
  const t = ECON.trades.findLast((x) => x.day === ECON.day && (x.buyer === v.p.id || x.seller === v.p.id));
  if (!t) return '';
  if (t.buyer === 'county') return tr(`今天：领了县里发的村干部补贴（${payText(t)}）`, `Today: headman allowance from the county (${payText(t)})`);
  if (EN) {
    if (t.kind === 'gift') return t.buyer === v.p.id ? `Today: ${nameOf(t.seller)}'s family sent ${goodText(t)} (a gift)` : `Today: sent ${goodText(t)} to ${nameOf(t.buyer)}'s family (a gift)`;
    return t.buyer === v.p.id ? `Today: ${t.service ? '' : 'bought '}${goodText(t)} (${payText(t)})` : `Today: ${t.service ? `${goodText(t)} for ${nameOf(t.buyer)}` : `sold ${nameOf(t.buyer)} ${goodText(t)}`} (${payText(t)})`;
  }
  if (t.kind === 'gift') return t.buyer === v.p.id ? `今天：${nameOf(t.seller)}家送来${goodText(t)}（接济）` : `今天：给${nameOf(t.buyer)}家送去${goodText(t)}（接济）`;
  return t.buyer === v.p.id ? `今天：${t.service ? '' : '买了'}${goodText(t)}（${payText(t)}）` : `今天：${t.service ? `给${nameOf(t.buyer)}${t.service}` : `卖给${nameOf(t.buyer)}${goodText(t)}`}（${payText(t)}）`;
}
/** 档案里的"家当和账"。 */
function econOf(id, n = 6) { // n：列最近几笔（档案 6 笔；我的居民列满 30 笔，前面带哪天）
  const v = V.byId[id], u = v && ECON.unitOfV(v);
  if (!u) return null;
  const stock = Object.entries(u.stock).filter(([g, q]) => q >= 1 && GOODS[g]).sort((a, b) => b[1] * GOODS[b[0]].price - a[1] * GOODS[a[0]].price).map(([g, q]) => [goodName(g), Math.floor(q), goodUnit(g, Math.floor(q))]);
  const owedBy = Object.entries(u.owe), owedTo = [...ECON.units.values()].filter((x) => x.owe[u.id]);
  const owe = EN
    ? [...owedBy.map(([o, n]) => `${unitName(o)} owes this family ${coinText(n)}`), ...owedTo.map((x) => `Owes ${unitName(x.id).replace(/^The /, 'the ')} ${coinText(x.owe[u.id])}`)]
    : [...owedBy.map(([o, n]) => `${unitName(o)} 欠这家 ${n} 文`), ...owedTo.map((x) => `欠 ${unitName(x.id)} ${x.owe[u.id]} 文`)];
  const logEN = (t) => (t.buyer === 'county' ? `Headman allowance from the county (${payText(t)})` : t.kind === 'gift'
    ? (t.from === u.id ? `${nameOf(t.seller)}'s family sent ${goodText(t)} (a gift)` : `Sent ${goodText(t)} to ${(PLACES[t.from] ?? nameOf(t.buyer)).replace(/^The /, 'the ')} (a gift)`)
    : `${nameOf(t.buyer)} ${t.service ? (t.from === u.id ? `paid for ${goodText(t)}` : `came for ${goodText(t)}`) : t.from === u.id ? `bought ${goodText(t)}` : `bought ${goodText(t)} here`} (${payText(t)})`);
  const logZH = (t) => (t.buyer === 'county' ? `县里发来村干部补贴（${payText(t)}）` : t.kind === 'gift' ? `${t.from === u.id ? `${nameOf(t.seller)}家送来${goodText(t)}（接济）` : `给${PLACES[t.from] ?? nameOf(t.buyer)}送去${goodText(t)}（接济）`}` : `${nameOf(t.buyer)}${t.service ? (t.from === u.id ? `付${t.service}` : `来${t.service}`) : t.from === u.id ? `买${goodText(t)}` : `从这家买${goodText(t)}`}（${payText(t)}）`);
  const ago = (t) => { const k = ECON.day - t.day; return n <= 6 || !k ? '' : k === 1 ? (EN ? 'Yesterday ' : '昨天 ') : EN ? `${k}d ago ` : `${k} 天前 `; };
  const log = u.log.slice(-n).reverse().map((t) => `${ago(t)}${hm(t.hour)} ${EN ? logEN(t) : logZH(t)}`);
  // 进村以来一共卖过 / 买过什么（新来的人才记）
  const tally = (o) => Object.entries(o ?? {}).filter(([g, q]) => q > 0 && GOODS[g]).sort((a, b) => b[1] - a[1]).map(([g, q]) => `${goodName(g)} ${q}`);
  return { unit: unitName(u.id), coins: u.coins, stock, owe, log, sold: tally(v.p.stats?.sold), bought: tally(v.p.stats?.bought) };
}

// ---------------------------------------------------------------- 新来的人（「创建居民」卡片 → life/newcomers.js）：存在浏览器里，刷新后照旧在村里过

// 我的居民（src/mine.js）：这台电脑上自己建的人。?nonew=1 不带（截图、回归用）
const noMine = params.has('nonew') || params.has('sim');
const myList = noMine ? [] : mine.list();
const myIds = () => (noMine ? new Set() : mine.ids());
/** 存档里的新人（读进来之前的原样，「我的居民」拿来对比：改了没提交、提交了生效没有）。 */
const worldNewcomers = new Map((saved?.newcomers ?? []).map((p) => [p.id, structuredClone(p)]));
const saveNewcomers = () => { // 自己的人：照村里此刻的样子存一份（只存自己的，存档里别人的不存）
  if (noMine) return;
  const ids = myIds();
  mine.save(mine.list().map((p) => (ids.has(p.id) && V.byId[p.id] ? Object.fromEntries(SAVE_KEYS.filter((k) => V.byId[p.id].p[k] !== undefined).map((k) => [k, V.byId[p.id].p[k]])) : p)));
};
if (saved) {
  const meta = mine.meta();
  for (const p of myList) { // 提交的已经处理过了（存档比提交新）：本地这份照存档对齐（后台会把名字截短、补默认值）；离村的从本地拿掉
    const w = worldNewcomers.get(p.id), m = meta[p.id], done = m?.sent && (saved.savedAt ?? 0) > m.sent.at;
    if (m?.left && !w && done) mine.remove(p.id);
    else if (w && done && !m.left && m.sent.sig === signature(p)) { Object.assign(p, pickKeys(w, EDIT_KEYS)); for (const k of EDIT_KEYS) if (w[k] === undefined) delete p[k]; mine.setMeta(p.id, { sent: undefined }); }
  }
  if (!noMine) mine.save(myList.filter((p) => mine.ids().has(p.id)));
  const mineNow = new Map(mine.list().map((p) => [p.id, p])), metaNow = mine.meta();
  saved.newcomers = (saved.newcomers ?? []).filter((w) => !metaNow[w.id]?.left) // 提交了离村的：这边先不显示
    .map((w) => (mineNow.has(w.id) ? { ...w, ...pickKeys(mineNow.get(w.id), EDIT_KEYS.filter((k) => k !== 'jobId')) } : w)); // 自己改了样子、资料还没提交：这边先照改过的显示
  loadWorld(village, saved, { addNewcomer, setJob, onNewcomer: addResident }); // 存档里的新人先住进去
}
// 自己建的、还没进村子存档的：接着放进来
for (const p of noMine ? [] : mine.list()) {
  if (V.byId[p.id] || mine.meta()[p.id]?.left) continue; // 存档里已经有了 / 提交了离村
  if (V.C[p.home]?.plot && V.east.houses.find((h) => h.id === p.home)?.owner) { const o = pickOldHouse(p, V.east.houses); p.home = o?.id; p.homeWhy = o?.why; } // 看中的老宅在存档里已经有人住了：另找一处空的，都住满了就借住村里人家
  addNewcomer(V, p, { arriving: false }); addResident(p);
}
saveNewcomers();
// ?addnew=胡二根:磨面|推磨@old3#miller;马翠:做饭 开局就放几个新人进村（名:手艺|手艺@住处#行当，后两段可省；不存档，无头快进测行当用）
for (const s of (params.get('addnew') ?? '').split(';').filter(Boolean)) { const [rest, job] = s.split('#'), [who, home] = rest.split('@'), [name, sk = ''] = who.split(':'); const p = { name, nick: name, home: home || undefined, jobId: job || undefined, jobPicked: job ? true : undefined, age: 32, sex: '男', skills: sk.split('|').filter(Boolean), traits: ['勤快'], bio: '测试用的新人', likes: '——', body: 'man', skin: 'skin', hair: 'short', top: 'indigo', pants: 'black', coins: 60, goods: { grain: 10 } }; addNewcomer(V, p); addResident(p); }
V.onRepaired = (v, plot) => { // 老宅修好了：存档，头顶冒一句
  if (!v) return;
  saveNewcomers();
  if (!params.has('sim')) bubbles.say(v.object, [[tr('房子修好了', 'House repaired'), '#ffcc66'], [tr(' 搬进新屋', ', moving in'), '#e0d4bf']]);
};
V.onRelic = (v, n) => { // 挖到一件老东西：头顶冒一句（村史馆第几件）
  const relic = relicText(n);
  if (!params.has('sim')) bubbles.say(v.object, EN ? [[`Found ${relic}`, '#ffcc66'], [` museum piece #${n}`, '#e0d4bf']] : [[`挖到${relic}`, '#ffcc66'], [` 村史馆第${n}件`, '#e0d4bf']]);
};
V.onBadge = (v, list) => { // 新来的人拿到勋章：头顶冒一句（自己的人才冒）
  if (params.has('sim') || !myIds().has(v.p.id)) return;
  bubbles.say(v.object, [[tr('得勋章 ', 'Medal: '), '#e0d4bf'], [list.map((b) => b.name).join(tr('、', ', ')), '#ffcc66']]);
  saveNewcomers();
};
V.onNewcomer = (v) => { // 认完人、挑好行当了：存档，头顶冒一句，档案重建
  saveNewcomers();
  bubbles.say(v.object, EN ? [[pJob(v.p), '#ffcc66'], [' open for business', '#e0d4bf']] : [[`当${v.p.job}`, '#ffcc66'], [' 开张了', '#e0d4bf']]);
  roster = makeRoster();
};
/** 「我的居民」里每个人：本地那份（村里有就用村里活着的那个）、走到哪一步、主人是谁。 */
let cloudRows = null; // 云端自己那几行（后台处理了没有、退回的原因）：打开网页时取一次，提交后再取
const myResidents = () => noMine ? [] : mine.list().filter((p) => !mine.meta()[p.id]?.left).map((p0) => {
  const live = V.byId[p0.id]?.p, w = worldNewcomers.get(p0.id), row = cloudRows?.[p0.id];
  const bs = V.byId[p0.id] && badgeProgress(V, V.byId[p0.id], HOUSEHOLDS);
  return { p: live ?? p0, status: statusOf(live ?? p0, w, undefined, row), owner: w?.owner, row, inWorld: !!w, badges: bs && [bs.filter((b) => b.got).length, bs.length] };
});
/** 绑定邮箱 / 用邮箱登录找回（src/cloud.js）。返回 'ok' 或者给人看的原因。 */
const accountError = (e) => {
  const m = String(e?.message ?? '');
  if (/already.*regist|already exists|email_exists/i.test(m)) return tr('这个邮箱已经绑过别的身份了：要找回那边的居民，点「用邮箱登录找回」。', 'That email is already linked to another identity. Use "Log in to recover" instead.');
  if (/invalid login|credentials/i.test(m)) return tr('邮箱或密码不对。', 'Wrong email or password.');
  if (/password/i.test(m)) return tr('密码至少 6 位。', 'Password needs at least 6 characters.');
  if (/email/i.test(m) && /invalid|format|validate/i.test(m)) return tr('邮箱格式不对。', 'That email doesn\'t look right.');
  if (/rate limit/i.test(m)) return tr('试得太频繁了，过一会儿再试。', 'Too many tries; wait a bit and try again.');
  return tr('连不上世界的服务器，稍后再试。', 'Couldn\'t reach the world server; try again later.');
};
const account = {
  who: () => cloud.who(),
  async bind(email, pw) { try { await cloud.bind(email, pw); return 'ok'; } catch (e) { return accountError(e); } },
  /** 登录以后把这个账号的居民接回这台电脑（村子存档里有的用存档那份，还没进村的用提交的资料），然后重新打开网页。 */
  async login(email, pw) {
    try {
      await cloud.login(email, pw);
      const rows = await cloud.mine();
      const list = []; // 一个身份一个居民：换成这个账号的（这台电脑上原来那个属于原来的匿名身份，已经提示过）
      for (const r of rows) {
        if (r.kind === 'leave') continue;
        const w = worldNewcomers.get(r.id);
        list.push(w ? structuredClone(w) : { ...r.data, id: r.id });
        mine.setMeta(r.id, w ? null : { sent: { kind: 'join', at: Date.now(), sig: '' } });
      }
      mine.save(list);
      setTimeout(() => location.reload(), 600);
      return 'ok';
    } catch (e) { return accountError(e); }
  },
};
/**
 * 提交到大家的村子（src/cloud.js）：在存档里了就是改（edit），还没进就是新来（join），leave 离村。
 * 返回 'ok'；连不上（超时、断网、服务器出错）返回 'queued'——先存本机，下次打开自动再发；被数据库拒了（一个浏览器超过三个）返回原因。
 */
async function share(p0, leave = false) {
  const p = V.byId[p0.id]?.p ?? p0, kind = leave ? 'leave' : worldNewcomers.has(p.id) ? 'edit' : 'join';
  if (params.has('uicheck') || params.has('nocloud')) { markSent(kind, p); return 'ok'; } // 无头检查界面：不往真的云端写
  try {
    await cloud.save(kind, p);
    markSent(kind, p);
    cloud.rows().then((r) => { if (r) cloudRows = r; });
    return 'ok';
  } catch (e) {
    if (e.status >= 400 && e.status < 500 && /too many/.test(e.message)) return tr('一个浏览器只能有一个居民：让原来那个离村以后才能再建。', 'One resident per browser: let the current one leave first.');
    markQueued(kind, p);
    return 'queued';
  } finally { updateNewBtn(); }
}
/** 打开网页：上回没发出去的再发一遍；顺手取云端那几行看处理结果。 */
if (!noMine) setTimeout(async () => {
  const meta = mine.meta();
  for (const p of mine.list()) if (meta[p.id]?.queue) await share(p, meta[p.id].queue === 'leave');
  cloudRows = (await cloud.rows()) ?? cloudRows;
}, 3000);
/** 自己的人走了（离村、或者删掉没提交的）：这次打开里先让他进屋不出来（模拟里别人可能正跟他打交道，不直接拿掉），档案里不再列。 */
function dropResident(id) {
  const v = V.byId[id];
  if (v) v.gone = true;
  const i = RESIDENTS.findIndex((p) => p.id === id);
  if (i >= 0) RESIDENTS.splice(i, 1);
  for (const h of HOUSEHOLDS) { const j = h.people.findIndex((p) => p.id === id); if (j >= 0) h.people.splice(j, 1); }
  roster = makeRoster();
  updateNewBtn();
}
const newBtn = document.getElementById('newBtn');
const updateNewBtn = () => { if (newBtn) newBtn.textContent = myResidents().length ? tr('我的居民', 'My residents') : tr('创建居民', 'New resident'); };
const newcomerPanel = createNewcomerPanel(document.getElementById('newcomer'), {
  residents: myResidents,
  onFind: (id) => { const v = V.byId[id]; if (!v) return; if (v.object.parent !== scenes.current.object && !scenes.busy) goToBoard(v.object.parent); selectPerson(v); followSel(); },
  onEdit(id, look) { // 改了样子、资料：村里这个人马上换样子，本地存一份（提交以后大家才看得见）
    const v = V.byId[id];
    if (!v) return;
    for (const k of EDIT_KEYS) if (k !== 'jobId' && k in v.p && !(k in look)) delete v.p[k]; // 摘掉的帽子、配饰
    Object.assign(v.p, Object.fromEntries(Object.entries(look).filter(([, x]) => x !== undefined)));
    v.restyle();
    saveNewcomers();
    roster = makeRoster();
  },
  onLeave(id, status) { // 离村：没提交过的直接删；提交过的面板已经告诉村子他走了（mine.js 记下 left）
    if (status === 'local') mine.remove(id);
    dropResident(id);
  },
  share,
  account,
  onDetail: (id) => { roster.show(id); rosterBtn?.classList.add('on'); }, // 详情：档案里这个人（勋章、好感度）
  /**
   * 「我的居民」页一次摊开的全部资料：此刻在干什么、钱和存货、最近的买卖、勋章，还有他和村里每个人的交情（熟识度 0–20，熟的在前）。
   * 原来这些在档案页里，要点「详情」跳过去、在窄窄一栏里上下滚着看。
   */
  detail: (id) => {
    const v = V.byId[id];
    if (!v) return null;
    if (v.p.newcomer) checkBadges(V, v, HOUSEHOLDS);
    const ties = V.people.filter((o) => o !== v && !o.gone && !o.p.caravan).map((o) => ({ p: o.p, tie: ECON.tie(v.p.id, o.p.id), home: PLACES[o.p.home] ?? '' })).filter((x) => x.tie >= 1).sort((a, b) => b.tie - a.tie);
    const u = ECON.unitOfV(v);
    return { now: personStatus(v), econ: econOf(id, 30), badges: badgeProgress(V, v, HOUSEHOLDS), ties, people: V.people.filter((o) => o !== v && !o.gone && !o.p.caravan).length, coins: Math.round(u?.coins ?? 0), earned: Math.round(v.p.stats?.earned ?? 0), home: (v.p.oldHouse ? pHousehold(v.p, HOUSEHOLDS) : PLACES[v.p.home]) ?? pHousehold(v.p, HOUSEHOLDS), day: ECON.day, since: v.p.stats?.since, sched: v.p.day ?? [], hour: village.life.clock.hour,
      // 背景：来历 + 为什么住这儿、为什么干这行（村里安顿他时记下的）
      story: [pStory(v.p), !EN && v.p.homeWhy ? `住进${(v.p.oldHouse ? pHousehold(v.p, HOUSEHOLDS) : PLACES[v.p.home]) ?? ''}：${v.p.homeWhy}。` : '', !EN && v.p.jobWhy ? `营生是${pJob(v.p)}：${v.p.jobWhy}。` : ''].filter(Boolean),
      traits: pTraits(v.p), skills: pSkills(v.p), likes: pLikes(v.p) };
  },
  econ: () => ECON,
  homes: () => HOUSEHOLDS.filter((h) => village.C[h.id] && h.id !== 'square' && !h.oldSite).map((h) => ({ id: h.id, name: PLACES[h.id] ?? hhName(h), n: V.people.filter((v) => (v.p.sleepAt ?? v.p.home) === h.id).length })).sort((a, b) => a.n - b.n), // 借住哪家：人少的排前头
  M: village.M, // 第一步的 3D 小人用村里同一套材质
  pickHome: (p) => pickOldHouse(p, east.houses), // 住哪儿不用选：他按会什么、性格、喜好挑老村址空着的老宅（卡片上先写出来会看中哪处）
  onChangeJob(id, jobId) { // 档案里点「改行」选好了：马上换过去
    const v = V.byId[id];
    if (!v) return;
    setJob(v, jobId, { picked: true });
    v.finish();
    saveNewcomers();
    roster = makeRoster();
    if (myIds().has(id)) share(v.p); // 自己的人：改行也提交到村子
    bubbles.say(v.object, EN ? [['New job: ', '#e0d4bf'], [pJob(v.p), '#ffcc66']] : [['改行', '#e0d4bf'], [` 当${v.p.job}`, '#ffcc66']]);
  },
  onCreate(p) {
    p.id = `new_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; // 大家的村子里不撞号
    const v = addNewcomer(V, p);
    addResident(p);
    mine.save([...mine.list(), Object.fromEntries(SAVE_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]))]);
    saveNewcomers();
    updateNewBtn();
    roster = makeRoster();
    if (scenes.current.object !== village.object) goToBoard(village.object);
    selectPerson(v);
    followSel();
    if (params.has('closeup')) { const p = v.object.getWorldPosition(new THREE.Vector3()); controls.target.copy(p); camera.position.set(p.x, p.y + 0.06, p.z + 0.09); } // ?closeup=1：镜头推到新人跟前（截图检查用）
    return p;
  },
});
updateNewBtn();
if (params.has('newcomer')) setTimeout(() => newcomerPanel.show(['look', 'info', 'job'].includes(params.get('newcomer')) || /^(build|hair|hairRamp|hat|top|style|pants|skin|face|extra)$/.test(params.get('newcomer')) ? params.get('newcomer') : 'look'), 0); // ?newcomer=1 / info / hair……：一打开就是「创建居民」的那一页（截图检查用）
newBtn?.addEventListener('click', (e) => { e.stopPropagation(); if (newcomerPanel.open) newcomerPanel.close(); else { roster.close(); newcomerPanel.show(); showSettings(false); showDebug(false); } });

// 村民档案：左下角按钮打开页面里的横板大卡；详情里"去村里找"= 关掉档案、选中这个人并跟着他
const makeRoster = () => createRoster(document.getElementById('roster'), {
  status: (id) => (V.byId[id] ? personStatus(V.byId[id]) : null),
  econ: econOf,
  hour: () => village.life.clock.hour,
  beasts: (home) => village.life.beasts.filter((b) => !b.s.caravan && (b.c?.id ?? (b.swim ? 'farmC' : b.s.role === 'pigeon' ? 'school' : null)) === home) // 鸭鹅归吴家、鸽子落在学堂（和旧档案页一样）
    .map((b) => ({ kind: b.s.kind, name: b.info.name, kindName: b.info.kind, about: b.info.about })),
  onChangeJob: (id) => { const v = V.byId[id]; if (v) newcomerPanel.changeJob({ ...v.p, earned: ECON.unitOfV(v)?.earned ?? 0 }); }, // 改行：打开「创建居民」的营生页
  onFind: (id) => {
    const v = V.byId[id];
    if (!v) return;
    const host2 = v.object.parent; // 人在另一块沙盘上：先换过去
    if (host2 !== scenes.current.object && !scenes.busy) goToBoard(host2);
    selectPerson(v);
    followSel();
  },
  onClose: () => rosterBtn?.classList.remove('on'),
  mine: (id) => myIds().has(id),
  // 新来的人：勋章和好感度（life/badges.js）；原住户没有
  // 先把够了的勋章记上（平时每天清早记一次）
  progress: (id) => { const v = V.byId[id]; if (v?.p.newcomer) checkBadges(V, v, HOUSEHOLDS); return v?.p.newcomer ? { badges: badgeProgress(V, v, HOUSEHOLDS), affinity: affinity(V, v.p, HOUSEHOLDS).slice(0, 6), day: V.econ.day } : null; },
  onEdit: (id) => { const v = V.byId[id]; if (v) newcomerPanel.edit(v.p); },
  // 档案里的地图：三块沙盘各一张真实场景从正上方看下去的截图；村子、老村址的居民按户标在自家院子上，西沟按"谁到这儿干活"标
  map: { boards: mapBoards() },
});
const mapImages = {};
let roster = makeRoster();

/**
 * 村子的俯视图：正交相机从正上方往下拍一张（每米 8 个像素），颜色就是场景里的颜色。
 * 拍的时候光线固定成中午、人和动物先藏起来（地图上另外标头像）、远山和天空不画；拍完下一帧照常。
 */
/**
 * 档案地图的三块沙盘：村子、西沟、老村址。groups()：这块图上标哪些人（每组 { key, name, at, ids, role? }）。
 *   村子、老村址：按户（住老村址老宅的新人一处老宅算一户）；西沟没人住：按日程里谁来这儿干活（梯田、水磨坊、山神庙、崖顶草坡、水潭）。
 */
function mapBoards() {
  const idsOf = (h) => h.people.map((p) => p.id).filter((id) => RESIDENTS.some((p) => p.id === id));
  const homes = (east) => HOUSEHOLDS.filter((h) => { const c = village.C[h.id]; return c && !c.plot && !!c.east === east; }).map((h) => ({ key: h.id, name: hhName(h), at: [village.C[h.id].object.position.x, village.C[h.id].object.position.z], ids: idsOf(h) })).filter((g) => g.ids.length);
  const avg = (pts) => pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : null;
  const doesIn = (p, test) => (p.day ?? []).some(([, a, arg]) => test(a, arg));
  const WEST = [ // 西沟干活的地方：在哪、日程里哪一项算来这儿（新来的人按营生）
    { key: 'fieldWest', name: tr('西沟梯田', 'West Gully terraces'), at: avg(west.work.fieldWest), test: (a, arg) => a === 'field' && arg === 'fieldWest', act: 'field:fieldWest' },
    { key: 'mill', name: tr('水磨坊', 'Watermill'), at: west.work.mill.at, test: (a, arg) => a === 'mill' || (a === 'newJob' && arg === 'miller'), act: 'mill' },
    { key: 'temple', name: tr('山神庙', 'Mountain Shrine'), at: west.work.temple.at, test: (a) => a === 'worship', act: 'worship' },
    { key: 'pasture', name: tr('崖顶草坡', 'Clifftop pasture'), at: V.pasture[0]?.[0] < BOUNDS.x0 ? avg(V.pasture) : null, test: (a) => a === 'herd', act: 'herd' },
    { key: 'pool', name: tr('瀑布水潭', 'Waterfall pool'), at: avg(west.work.pool.map((p) => p.at ?? p)), test: (a, arg) => a === 'fish' && arg === 'pool', act: 'fish:pool' },
  ];
  const plots = () => east.houses.filter((h) => h.owner).map((h) => ({ key: h.id, name: EN ? `${word(h.who)} old house` : `${h.who}老宅`, at: [village.C[h.id].object.position.x, village.C[h.id].object.position.z], ids: RESIDENTS.filter((p) => p.oldHouse === h.id).map((p) => p.id) })).filter((g) => g.ids.length);
  const sub = (gs, n, what) => EN ? `${gs} ${what ?? 'homes'} · ${n} people` : `${gs} ${what ?? '户'} · ${n} 口人`;
  return [
    { id: 'village', name: villageName(VILLAGE), bounds: BOUNDS, image: () => (mapImages.village ??= mapSnapshot(village.object, BOUNDS)), groups: () => homes(false), sub(n) { return sub(this.groups().length, n); } },
    { id: 'west', name: tr('西沟', 'West Gully'), bounds: WEST_BOUNDS, image: () => (mapImages.west ??= mapSnapshot(west.object, WEST_BOUNDS)), empty: tr('这几天没人来西沟干活', 'Nobody works in West Gully these days'),
      groups: () => WEST.filter((w) => w.at).map((w) => ({ ...w, ids: RESIDENTS.filter((p) => doesIn(p, w.test)).map((p) => p.id), role: () => LABELS[w.act.split(':')[0]] && (LABELS[w.act] ?? LABELS[w.act.split(':')[0]]) })).filter((g) => g.ids.length),
      sub: (n) => (EN ? `Nobody lives here · ${n} people come to work` : `没人住 · ${n} 人来这儿干活`) },
    { id: 'east', name: tr('老村址', 'Old Site'), bounds: EAST_BOUNDS, image: () => (mapImages.east ??= mapSnapshot(east.object, EAST_BOUNDS)), groups: () => [...homes(true), ...plots()], sub(n) { return sub(this.groups().length, n); } },
  ];
}
/** 一块沙盘从正上方看下去的截图（中午的光、不带人和牲口、不带别的沙盘和背景）：obj 那块沙盘，B 它的范围。 */
function mapSnapshot(obj = village.object, B = BOUNDS) {
  if (inXR()) return null;
  const PX = 8, W = Math.round((B.x1 - B.x0) * PX), H = Math.round((B.z1 - B.z0) * PX);
  const boardsAll = [village.object, west.object, east.object];
  const wasOn = boardsAll.map((o) => o.visible);
  boardsAll.forEach((o) => { o.visible = o === obj; });
  obj.updateMatrixWorld(true);
  const s = obj.getWorldScale(new THREE.Vector3()).x;
  const c = obj.localToWorld(new THREE.Vector3((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2));
  const cam = new THREE.OrthographicCamera((-(B.x1 - B.x0) / 2) * s, ((B.x1 - B.x0) / 2) * s, ((B.z1 - B.z0) / 2) * s, (-(B.z1 - B.z0) / 2) * s, 0.01, 20);
  cam.up.set(0, 0, -1); // 图的上边是北（-z），和村子坐标一致
  cam.position.set(c.x, c.y + 5, c.z);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  const hide = [backdrop.object, marker, ...village.life.people.map((v) => v.object), ...village.life.beasts.map((b) => b.object)].filter((o) => o?.visible);
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
  boardsAll.forEach((o, i) => { o.visible = wasOn[i]; });
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
if (params.has('roster')) { roster.show(params.get('roster') === '1' ? null : params.get('roster') || null, params.get('rboard') || undefined); // &rboard=west|east：地图看哪一块
  rosterBtn?.classList.add('on');  if (params.get('rpick')) roster.pick(params.get('rpick')); if (params.get('rview') === 'list') document.querySelector('#roster [data-v=list]')?.click(); } // &rview=list：卡片页 // ?roster=1 打开档案（地图），&rpick=村民id 在地图上点中这个人；?roster=村民id 直接看这个人的详情（截图检查用）

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
  else if (id.startsWith('east:')) { const [, k, n] = id.split(':'); selectThing(east.things.filter((t) => t.thing === k)[Number(n ?? 0)]); } // ?scene=east&pick=east:ruin:2
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
let lastLabel = ''; // 时钟栏上次写的钟点（换了曲子置空，下一帧重写）
const music = createMusic({ hour: () => village.life.clock.hour, busy: () => village.life.people.some((v) => v.state === 'fiddle'), onChange: () => { lastLabel = null; } }); // 换了曲子：时钟栏马上重写（上面写着正在放哪一首）
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
  if (soundBtn) { soundBtn.textContent = EN ? `Sound: ${sound.on ? 'on' : 'off'}` : sound.on ? '声音：开' : '声音：关'; soundBtn.classList.toggle('on', sound.on); }
  if (musicBtn) { musicBtn.textContent = EN ? `Music: ${music.on ? 'on' : 'off'}` : music.on ? '音乐：开' : '音乐：关'; musicBtn.classList.toggle('on', music.on); }
}
musicBtn?.addEventListener('click', (e) => { e.stopPropagation(); music.toggle(); syncSoundBtn(); lastLabel = null; });
const nextBtn = document.getElementById('nextTrack');
if (nextBtn) nextBtn.textContent = tr('下一首', 'Next track');
const langBtn = document.getElementById('lang'); // 设置里切中英文（记在浏览器里，重新打开）
if (langBtn) { langBtn.textContent = EN ? 'Language: English' : '语言：中文'; langBtn.title = EN ? '切换到中文' : 'Switch to English'; langBtn.addEventListener('click', (e) => { e.stopPropagation(); setLang(EN ? 'zh' : 'en'); }); }
nextBtn?.addEventListener('click', (e) => { e.stopPropagation(); music.next(); syncSoundBtn(); lastLabel = null; }); // 跳过这一首
syncSoundBtn(); // 按钮上的字按当前语言写一遍
// 进入 VR（设置里第一个）：先要 immersive-vr，不支持再试 immersive-ar（有的光学透视眼镜只给 AR）。
// three 自带的 VRButton 进不去时什么都不说，这里把原因写在按钮下面。手部追踪：双手捏合握住沙盘（xr.js）
const vrBtn = document.getElementById('vrBtn'), vrMsg = document.getElementById('vrMsg');
const XR_INIT = { optionalFeatures: ['local-floor', 'bounded-floor', 'layers', 'hand-tracking'] };
const vrSay = (msg) => { vrMsg.textContent = msg ?? ''; vrMsg.hidden = !msg; };
const syncVR = () => { vrBtn.textContent = inXR() ? tr('退出 VR', 'Exit VR') : tr('进入 VR', 'Enter VR'); };
vrBtn?.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (inXR()) { renderer.xr.getSession()?.end(); return; }
  if (!navigator.xr) { vrSay(window.isSecureContext ? tr('这个浏览器不支持 WebXR。', 'This browser has no WebXR.') : tr('要用 https 打开才能进 VR。', 'Open the page over https to use VR.')); return; }
  vrSay(tr('正在进入……', 'Starting...'));
  let err = null;
  for (const mode of ['immersive-vr', 'immersive-ar']) { // 直接要，不先问 isSessionSupported：多等一下，点击的「用户操作」就可能过期了
    if (err && err.name !== 'NotSupportedError') break;
    try {
      const session = await navigator.xr.requestSession(mode, XR_INIT);
      session.addEventListener('end', () => { syncVR(); }, { once: true });
      await renderer.xr.setSession(session);
      vrSay(null); syncVR(); showSettings(false);
      return;
    } catch (x) { err = x; }
  }
  vrSay(err.name === 'NotSupportedError' ? tr('没找到 VR 设备（眼镜连上了吗？连上后再点一次）。', 'No VR device found (is the headset connected? Try again once it is).') : tr(`进不去 VR：${err.name} ${err.message}`, `Could not enter VR: ${err.name} ${err.message}`));
});
if (vrBtn) syncVR();
// 设置按钮：点一下往上弹出声音、音乐、季节，再点（或点场景）收起
const settingsEl = document.getElementById('settings'), settingsBtn = document.getElementById('settingsBtn');
const showSettings = (on) => { if (!settingsEl) return; settingsEl.hidden = !on; settingsBtn.classList.toggle('on', on); if (on) { showDebug(false); document.getElementById('away')?.remove(); } }; // 设置弹出来和「你不在的时候」在同一处：收起纸条
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
  return soft ? `<span style="color:var(--red)">${EN ? `Software rendering (${short}): no GPU in use.\nRestart the browser or turn on hardware acceleration` : `软件渲染（${short}）——浏览器没用上显卡，重启浏览器或打开硬件加速`}</span>` : short;
})();
function debugTick() { // 每帧记一下，半秒刷新一次面板
  const now = performance.now(), d = now - dbg.last;
  dbg.last = now; dbg.frames++; dbg.ms += d; dbg.worst = Math.max(dbg.worst, d);
  if (debugEl.hidden || now - dbg.t < 500) return;
  const info = renderer.info, life = village.life, out = life.people.filter((v) => !v.inside).length;
  const row = (k, v) => `${k}  <b>${v}</b>`;
  debugEl.innerHTML = [
    row(tr('帧率', 'FPS'), `${Math.round((dbg.frames * 1000) / (now - dbg.t))} fps`),
    row(tr('帧间隔', 'Frame time'), EN ? `${(dbg.ms / dbg.frames).toFixed(1)} ms (worst ${dbg.worst.toFixed(0)})` : `${(dbg.ms / dbg.frames).toFixed(1)} ms（最慢 ${dbg.worst.toFixed(0)}）`),
    row('CPU', `${(dbg.cpu / dbg.frames).toFixed(1)} ms / ${tr('帧', 'frame')}`), // 更新 + 提交渲染真正花的时间；90 帧要压在 11 ms 以内（CPU、GPU 各自）
    row('GPU', timer ? (dbg.gpuMs === null ? tr('…', '...') : `${dbg.gpuMs.toFixed(1)} ms / ${tr('帧', 'frame')}`) : tr('浏览器不支持计时', 'No timer support')),
    row('Draw call', info.render.calls),
    row(tr('三角面', 'Triangles'), EN ? `${(info.render.triangles / 1000).toFixed(0)}k` : `${(info.render.triangles / 10000).toFixed(1)} 万`),
    row(tr('着色器', 'Shaders'), info.programs.length),
    row(tr('贴图 / 几何体', 'Textures / geoms'), `${info.memory.textures} / ${info.memory.geometries}`),
    row(tr('显卡', 'GPU name'), gpuName),
    row(tr('像素比', 'Pixel ratio'), renderer.getPixelRatio().toFixed(2)),
    row('XR', renderer.xr.isPresenting ? (EN ? `Yes · ${renderer.xr.getSession()?.frameRate ?? '?'} Hz (options ${renderer.xr.getSession()?.supportedFrameRates?.join(' / ') ?? 'unknown'})` : `是 · ${renderer.xr.getSession()?.frameRate ?? '?'} Hz（可选 ${renderer.xr.getSession()?.supportedFrameRates?.join(' / ') ?? '未知'}）`) : tr('否', 'No')),
    row(tr('在外面', 'Outdoors'), EN ? `${plural(out, 'person', 'people')} · ${plural(life.beasts.filter((b) => !b.home).length, 'animal')}` : `${out} 人 · ${life.beasts.filter((b) => !b.home).length} 只`),
    row(tr('时钟', 'Clock'), EN ? `${life.clock.label} (1 s = ${(life.clock.rate).toFixed(2)} min)` : `${life.clock.label}（1 秒 = ${(life.clock.rate).toFixed(2)} 分钟）`),
    row(tr('场景', 'Scene'), scenes.current.name),
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
  seasonBtn.textContent = EN ? `Season: ${SEASONS[season()].en ?? season()}` : `季节：${SEASONS[season()].name}`;
  seasonBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const q = new URLSearchParams(location.search);
    q.set('season', SEASON_ORDER[(SEASON_ORDER.indexOf(season()) + 1) % SEASON_ORDER.length]);
    location.search = q.toString();
  });
}
// 老宅按钮：完好开局 ⇄ 废墟开局（要重建场景，带着新参数重新加载页面）
const ruinsBtn = document.getElementById('ruins');
if (ruinsBtn) {
  ruinsBtn.textContent = EN ? `Old houses: ${ruinsMode() ? 'ruins' : 'intact'}` : `老宅：${ruinsMode() ? '废墟开局' : '完好'}`;
  ruinsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const q = new URLSearchParams(location.search);
    if (ruinsMode()) q.delete('ruins'); else q.set('ruins', '1');
    location.search = q.toString();
  });
}
if (params.has('music')) { music.toggle(); setInterval(() => { document.documentElement.dataset.music = `${music.title}|${music.on}`; }, 500); } // ?music=1：直接放（无头检查用）
soundBtn?.addEventListener('click', (e) => { e.stopPropagation(); sound.toggle(); syncSoundBtn(); });
const viewer = new THREE.Vector3();
lastLabel = '';
let shadowFrame = 1;
const first = village.update(0, camera.position);
applyLight(first.light, true);
let fishLook = params.get('fish');
renderer.setAnimationLoop((_, frame) => {
  const work0 = performance.now();
  const t = clock.getElapsedTime();
  const dt = Math.min(0.1, t - lastT);
  lastT = t;
  if (!(frame && anchor.update(frame, viewer))) {
    if (fishLook && village.fish) { const which = fishLook; fishLook = null; const sp = village.fish.spot(which === 'stream'); if (sp) { const p = sp.host.localToWorld(new THREE.Vector3(sp.x, sp.y, sp.z)); controls.target.copy(p); camera.position.set(p.x, p.y + 0.1, p.z + 0.16); } } // ?fish=jump：镜头对准湖心看跳鱼；?fish=stream：对准村前小溪里的鱼（截图检查用）
    if (follow && sel && (sel.v || sel.b)) { // 跟随：相机和观察点一起平移，角色慢慢移到画面中间
      const o = (sel.v ?? sel.b).object.getWorldPosition(followAt);
      followD.subVectors(o, controls.target).multiplyScalar(Math.min(1, dt * 3));
      controls.target.add(followD);
      camera.position.add(followD);
      if (closeTo) { const d = camera.position.distanceTo(controls.target); if (d > closeTo * 1.03) camera.position.lerp(controls.target, Math.min(1, dt * 1.5) * (1 - closeTo / d)); else closeTo = 0; }
    }
    controls.update();
    viewer.copy(camera.position);
  }
  const s = village.update(t, viewer);
  west.update(t, { light: s.light, weather: village.life.weather(), viewer, hour: village.life.clock.hour });
  east.update(t, { light: s.light, weather: village.life.weather(), viewer, hour: village.life.clock.hour });
  if (follow && sel && (sel.v || sel.b) && !scenes.busy) { // 跟着的人走过了村西口：镜头跟着换到那块沙盘
    const host = (sel.v ?? sel.b).object.parent;
    if (host !== scenes.current.object) goToBoard(host);
  }
  scenes.update(dt, inXR() || params.has('signs')); // ?signs=1：桌面上也显示 XR 里的路牌（截图检查用）
  sound.update(t, dt);
  music.update(dt);
  if (params.has('sound')) document.documentElement.dataset.sound = JSON.stringify(sound.stats);
  if (marker.visible) marker.position.y = markerH + (Math.floor(t * 3) % 2) * 0.1; // 一上一下跳
  xrCard.update(viewer, inXR() || params.has('xrcard'));
  bubbles.update(); // ?xrcard=1：桌面上也画 XR 卡片（截图检查用）
  applyLight(s.light);
  backdrop.update(t, s.light.night);
  if (clockEl && s.clock.label !== lastLabel) {
    lastLabel = s.clock.label;
    const e = EVENTS[village.life.today()], w = village.life.weather();
    // 时钟栏：大号时间 + 右边日期天气（一行），下面一行今日活动
    clockEl.innerHTML = `<div class="top"><span class="time">${lastLabel}</span><span class="date">${yearLabel(yearOf(s.clock.day, festival().m, festival().d))} ${lunarLabel(s.clock.day)}<br>${s.clock.night ? tr('夜 · ', 'Night · ') : ''}${WEATHER[w]}</span></div>`
      + `<div class="ev"><span class="name">${e.name}</span> <span class="sub">${w === 'rain' ? tr('因雨延期', 'Rained off') : `${fmt(e.from)}–${fmt(e.to)} ${e.place}`}</span></div>`
      + (music.title ? `<div class="bgm">${tr('乐曲', 'Music')} <b>${music.title}</b> <span class="sub">${music.file}</span></div>` : ''); // 正在放的背景音乐（设置里「下一首」可以换）
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
  { // 经济自检：铜钱守恒、断粮、每天成交多少、怎么付的、缺口、各户家底
    const E = village.life.econ, tr = E.trades, by = (f) => tr.reduce((m, t) => ((m[f(t)] = (m[f(t)] ?? 0) + 1), m), {});
    document.documentElement.dataset.econ = JSON.stringify({ repairs: (V.repairs ?? []).map((r) => `${r.plot}:第${r.day}天${r.done ? '✓' : ''}`), plots: east.houses.filter((h) => h.owner).map((h) => `${h.id}:${h.ownerName}:${h.state}`), oldSite: ['riverTemple', 'mason', 'limeKiln', 'duckYard'].map((id) => { const u = E.unit(id); return u && `${id} ${u.coins}文 ${JSON.stringify(Object.fromEntries(Object.entries(u.stock).filter(([, n]) => n >= 1).map(([g, n]) => [g, Math.round(n)])))} 卖出${E.trades.filter((t) => t.to === id && t.kind !== 'gift').length}笔`; }), newcomers: V.people.filter((v) => v.p.newcomer).map((v) => { const u = E.unitOfV(v); return `${v.p.name}@${v.p.home} ${v.p.job}（${v.p.jobWhy ?? ''}）${u.coins}文 挣${u.earned ?? 0}文 产${JSON.stringify(u.made)} 卖出${E.trades.filter((t) => t.to === u.id && t.kind !== 'gift').length}笔 认识${[...E.ties.entries()].filter(([k, n]) => k.includes(v.p.id) && n >= 2).length}人`; }), days: E.day, audit: E.audit(), trades: tr.length, perDay: by((t) => t.day), kind: by((t) => t.kind), goods: by((t) => t.good ?? t.service), hungry: E.hungry.slice(-20), fails: E.fails.slice(-15), missing: E.missing,
      units: [...E.units.values()].map((u) => `${u.id}:${u.coins}文 粮${Math.round(u.stock.grain ?? 0)} 柴${Math.round(u.stock.wood ?? 0)}${Object.keys(u.owe).length ? ' 欠他' + JSON.stringify(u.owe) : ''}`),
      asks: Object.fromEntries([...E.units.values()].filter((u) => Object.keys(u.sold).length || u.id === 'tofu').map((u) => [u.id, u.ask])),
      sample: tr.slice(-12).map((t) => `${t.day}d${t.hour.toFixed(1)} ${t.buyer}←${t.seller} ${t.good ?? t.service}×${t.qty} ${t.price}文 ${t.kind}${t.swap ? `(${t.swap.good}×${t.swap.qty})` : ''} ${t.place ?? ''}`) });
  }
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
document.documentElement.dataset.east = JSON.stringify({ audit: east.object.userData.audit, bake: east.object.userData.bake, flora: east.object.userData.flora, floating: east.object.userData.floating, coplanar: { found: east.object.userData.coplanar.found, left: east.object.userData.coplanar.left }, overlap: east.object.userData.overlap, things: east.things.reduce((m, t) => ((m[t.thing] = (m[t.thing] ?? 0) + 1), m), {}) });
document.documentElement.dataset.west = JSON.stringify({ audit: west.object.userData.audit, pasture: V.pasture.length, work: { fieldWest: V.fields.fieldWest.length, woods: V.woods.filter((w) => w.at[0] < -45).length, mill: V.mill.at.map((v) => +v.toFixed(1)) }, bake: west.object.userData.bake, flora: west.object.userData.flora, floating: west.object.userData.floating, coplanar: { found: west.object.userData.coplanar.found, left: west.object.userData.coplanar.left, leftSamples: west.object.userData.coplanar.leftSamples }, overlap: west.object.userData.overlap, bridges: west.terrain.bridges.length, things: west.things.reduce((m, t) => ((m[t.thing] = (m[t.thing] ?? 0) + 1), m), {}) });
document.documentElement.dataset.bake = JSON.stringify(village.object.userData.bake);
document.documentElement.dataset.audit = JSON.stringify({ perchFix: village.object.userData.perchFix, coplanar: village.object.userData.coplanar, overlap: village.object.userData.overlap, flora: village.object.userData.flora, floating: village.object.userData.floating, unreachable: village.object.userData.unreachable, islands: village.object.userData.islands, brokenEdges: village.object.userData.brokenEdges });
// 「你不在的时候」（src/ui/away.js）：和上次打开时的世界存档比，自己的居民这几天怎么样了
const awayNow = (id) => {
  const v = V.byId[id];
  if (!v || v.gone) return null;
  const s = v.p.stats ?? {}, sum = (o) => Math.round(Object.values(o ?? {}).reduce((a, b) => a + b, 0));
  return { day: ECON.day, earned: Math.round(s.earned ?? 0), coins: Math.round(ECON.unitOfV(v)?.coins ?? 0), sold: sum(s.sold), bought: sum(s.bought),
    friends: V.people.filter((o) => o !== v && !o.gone && ECON.tie(id, o.p.id) >= 6).map((o) => o.p.id), badges: Object.keys(v.p.badges ?? {}) }; // 混熟 = 熟识度 6 以上（和勋章「全村的朋友」一样）
};
if (!params.has('sim') && !params.has('uicheck')) showAway(document.getElementById('hint'), {
  people: myResidents().map((r) => ({ id: r.p.id, name: pName(r.p), sex: r.p.sex, now: awayNow(r.p.id) })),
  nameOf: (id) => V.byId[id] && pName(V.byId[id].p),
  badgeName: (id) => BADGES.find((b) => b.id === id)?.name,
  onOpen: () => { roster.close(); showSettings(false); newcomerPanel.mine(); },
});
document.documentElement.dataset.ready = '1';

// ?uicheck=1：一个个打开界面，量哪里的字出了框（src/uicheck.js；英文比中文长，换语言后用 ?lang=en&uicheck=1 跑一遍）
if (params.has('uicheck')) {
  const { uiCheck } = await import('./uicheck.js');
  renderer.setAnimationLoop(() => {}); // 只量界面，不画村子：无头里一帧要画好久；留一个空循环，requestAnimationFrame 照样走
  const closeAll = () => { closeCard(); roster.close(); newcomerPanel.close(); showSettings(false); showDebug(false); };
  const thing = (k) => [...village.things, ...west.things, ...east.things].find((t) => t.thing === k);
  const steps = [
    { name: 'hud', open: closeAll },
    { name: 'settings', open: () => { closeAll(); showSettings(true); } },
    { name: 'debug', open: () => { closeAll(); showDebug(true); } },
    ...['wang_xiaomei', 'zheng_laotou', 'miao_fengxian', 'niu_wanshan'].map((id) => ({ name: `person:${id}`, open: () => { closeAll(); if (V.byId[id]) selectPerson(V.byId[id]); } })),
    { name: 'beast', open: () => { closeAll(); selectBeast(village.life.beasts[0]); } },
    ...['house', 'gate', 'oldBridge', 'ruin'].map((k) => ({ name: `thing:${k}`, open: () => { closeAll(); const t = thing(k); if (t) selectThing(t); } })),
    ...['village', 'west', 'east'].map((b) => ({ name: `roster:${b}`, open: () => { closeAll(); roster.show(null, b); roster.layout(); } })),
    { name: 'roster:cards', open: () => { closeAll(); roster.show(); document.querySelector('#roster [data-v=list]')?.click(); } },
    ...[0, 1, 2, 3].map((g) => ({ name: `new:look${g}`, open: () => { closeAll(); newcomerPanel.create('look'); document.querySelector(`#newcomer [data-group="${g}"]`)?.click(); } })),
    { name: 'new:info', open: () => { closeAll(); newcomerPanel.create('info'); } },
    { name: 'new:job', open: () => { closeAll(); newcomerPanel.create('job'); document.querySelector('#newcomer .jcard')?.dispatchEvent(new Event('pointerover', { bubbles: true })); } },
    { name: 'new:done', open: () => { const n = document.querySelector('#newcomer [data-f=name]'); n.value = EN ? 'Hu Ergen' : '胡二根'; n.dispatchEvent(new Event('input')); document.querySelector('#newcomer .create').click(); } },
    { name: 'new:mine', open: () => { closeAll(); newcomerPanel.mine(); } },
    { name: 'detail', open: () => { closeAll(); const id = myIds().values().next().value; if (id) { roster.show(id); roster.layout(); } } }, // 自己的人的详情：勋章、好感度
    { name: 'new:edit', open: () => { closeAll(); newcomerPanel.mine(); document.querySelector('#newcomer .rstage [data-act=edit]')?.click(); } },
    { name: 'new:editinfo', open: () => { document.querySelector('#newcomer [data-page=info]')?.click(); } },
  ];
  const stop = params.get('uicheck'), upto = steps.findIndex((st) => st.name === stop); // ?uicheck=new:mine：走到这一步就停（截这一页的图）
  await uiCheck(upto >= 0 ? steps.slice(0, upto + 1) : steps);
}
