import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildVillage } from './village.js';
import { buildBackdrop, skyTexture } from './backdrop.js';
import { createAnchor } from './xr.js';
import { LABELS, PLACES } from './labels.js';
import { setupPixelUI } from './ui/frame.js';
import { residentCard, animalCard, thingCard, hm, label } from './ui/cards.js';
import { pickThing, describe, YARDS } from './things.js';
import { HOUSEHOLDS } from './residents.js';
import { createSound } from './audio.js';
import { createMusic } from './music.js';
import { animalDoing } from './animalInfo.js';
import { EVENTS, WEATHER, fmt, lunarLabel } from './life/index.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
document.body.append(renderer.domElement, VRButton.createButton(renderer));

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

const t0 = performance.now();
const village = buildVillage({ startHour: Number(params.get('time') ?? 15.5), event: params.get('event'), weather: params.get('weather') }); // ?time=6 从早上六点开始；?event=opera|market|bonfire|harvest|movie|shrine|meeting 指定今天的活动
document.documentElement.dataset.buildMs = String(Math.round(performance.now() - t0));
const backdrop = buildBackdrop();
stage.add(village.object, backdrop.object);

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
function applyLight(L) {
  sun.color.set(L.sun);
  sun.intensity = L.sunIntensity;
  sun.position.set(...L.sunPos);
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
  onSession(active) { scene.background = active && !params.has('sky') ? null : sky; },
});
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
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // 拖动视角不算点击
  ray.setFromCamera({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }, camera);
  const targets = [...village.life.people.filter((v) => !v.inside).map((v) => v.object), ...village.life.beasts.filter((b) => b.object.visible).map((b) => b.object)];
  const hit = ray.intersectObjects(targets, true)[0];
  if (!hit) { pickScene(); return; }
  let o = hit.object;
  while (o && !o.userData.resident && !o.userData.beast) o = o.parent;
  if (o?.userData.beast) { selectBeast(o.userData.beast); sound.clickBeast(o.userData.beast); }
  else if (o) selectPerson(village.life.people.find((v) => v.object === o));
});

/** 没点到人和动物：看打到了什么房子、物件；打在院子地上就是这个院子。 */
function pickScene() {
  const hit = ray.intersectObject(village.object, true).find((h) => h.object.isMesh && !h.object.isInstancedMesh && h.object !== marker);
  if (!hit) { closeCard(); return; }
  const p = village.object.worldToLocal(hit.point.clone());
  const t = pickThing(village.things, p);
  if (t) { selectThing(t); sound.clickThing(t); return; }
  const c = village.compoundAt(p.x, p.z, 0);
  if (c) selectYard(c);
  else closeCard();
}

function closeCard() { sel = null; follow = false; host.innerHTML = ''; host.hidden = true; marker.removeFromParent(); marker.visible = false; }
const dockCard = () => { host.style.top = `${clockEl.getBoundingClientRect().bottom + 6}px`; }; // 卡片总在时钟栏下面
addEventListener('resize', dockCard);
function show(card, obj, h) {
  host.innerHTML = ''; host.append(card.el); host.hidden = false; dockCard(); obj.add(marker); marker.position.set(0, h, 0); marker.visible = true; markerH = h;
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
  spot.position.set((t.box.min.x + t.box.max.x) / 2, t.box.max.y, (t.box.min.z + t.box.max.z) / 2);
  show(card, spot, 0.5);
  refreshCard();
}

function selectYard(c) {
  const h = homeOf(c.id), y = YARDS[c.id];
  const card = thingCard({ name: h?.name ?? PLACES[c.id], tags: [h?.kind ?? y?.kind].filter(Boolean), about: h?.note ?? y?.note ?? '', people: residentsOf(c.id) }, { onClose: closeCard, onPick: pick });
  sel = { c, card };
  spot.position.set(c.object.position.x, c.object.position.y + 1.5, c.object.position.z);
  show(card, spot, 0.5);
  refreshCard();
}

/** 房子 / 院子 / 物件卡片的"此刻"。 */
function refreshPlace() {
  const people = village.life.people;
  const who = (list) => list.map((v) => ({ id: v.p.id, name: `${v.p.name}${doingOf(v) ? ' · ' + doingOf(v) : ''}` }));
  const night = village.life.clock.night;
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
  if (sel.t || sel.c) { refreshPlace(); return; }
  const hour = village.life.clock.hour;
  if (sel.b) {
    const b = sel.b;
    sel.card.update({ doing: animalDoing(b, V), where: b.home ? '' : village.whereAt(b.pos.x, b.pos.z), kind: b.home ? 'sleep' : b.moving ? '' : 'rest' });
    return;
  }
  const v = sel.v, day = v.p.day;
  let cur = -1;
  day.forEach(([t], i) => { if (hour >= t) cur = i; });
  const nxt = day[cur + 1];
  const night = village.life.clock.night || cur < 0;
  const key = v.doing.split(':')[0];
  sel.card.update({
    doing: v.inside ? (night ? '已入睡' : '屋内') : LABELS[v.doing] ?? v.doing,
    where: v.inside ? PLACES[v.p.sleepAt ?? v.p.home] : village.whereAt(v.pos.x, v.pos.z),
    kind: v.inside && night ? 'sleep' : EVENTS[key] ? 'event' : REST.has(v.doing) || v.inside ? 'rest' : '',
    nextText: nxt ? `下一项 ${hm(nxt[0])}　${label(nxt[1], nxt[2])}` : '今日安排已全部完成',
    cur,
  });
}

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
if (params.get('pick')) {
  const id = params.get('pick');
  if (id.startsWith('beast:')) selectBeast(village.life.beasts[Number(id.slice(6))]);
  else if (id.startsWith('thing:')) { const [, k, n] = id.split(':'); selectThing(village.things.filter((t) => t.thing === k)[Number(n ?? 0)]); } // ?pick=thing:millstone
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
if (params.has('music')) { music.toggle(); setInterval(() => { document.documentElement.dataset.music = `${music.title}|${music.on}`; }, 500); } // ?music=1：直接放（无头检查用）
soundBtn?.addEventListener('click', (e) => { e.stopPropagation(); sound.toggle(); syncSoundBtn(); });
const viewer = new THREE.Vector3();
let lastLabel = '';
const first = village.update(0, camera.position);
applyLight(first.light);
renderer.setAnimationLoop((_, frame) => {
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
  sound.update(t, dt);
  music.update(dt);
  if (params.has('sound')) document.documentElement.dataset.sound = JSON.stringify(sound.stats);
  if (marker.visible) marker.position.y = markerH + (Math.floor(t * 3) % 2) * 0.1; // 一上一下跳
  applyLight(s.light);
  backdrop.update(t);
  if (clockEl && s.clock.label !== lastLabel) {
    lastLabel = s.clock.label;
    const e = EVENTS[village.life.today()], w = village.life.weather();
    clockEl.innerHTML = `<div class="date">${lunarLabel(s.clock.day)} · ${WEATHER[w]}</div><div class="time">${s.clock.night ? '夜 ' : ''}${lastLabel}</div>`
      + `<div class="ev"><span class="chip" style="--c:${w === 'rain' ? 'var(--c-child)' : 'var(--c-craft)'}">今日</span>${e.name}<br><span class="sub">${w === 'rain' ? '因雨延期' : `${fmt(e.from)}–${fmt(e.to)} ${e.place}`}</span></div>`;
    refreshCard();
  }
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------- 无头检查

// ?sim=秒：先在后台把村子快进这么多秒，统计有没有人 / 动物站进障碍（穿模）
if (params.has('sim')) {
  const total = Number(params.get('sim'));
  const nav = village.nav;
  let samples = 0, clipP = 0, clipA = 0, stuck = 0, escaped = 0, gateOpenSamples = 0, strolls = 0, ajarSamples = 0, beastStuck = 0, waiting = 0, goSamples = 0;
  const attended = {}, kidsAt = {}, waitWhy = {}, seen = new Set(), litLog = {}, leaveLog = {};
  const esc = {};
  const why = {};
  const lastPos = new Map();
  for (let i = 1; i <= total * 10; i++) {
    village.update(i / 10, camera.position);
    sound.update(i / 10, 0.1);
    if (i % 5) continue;
    for (const v of village.life.people) {
      if (v.inside) continue;
      samples++;
      if (v.perched || v.lift > 0) continue; // 台上、凳上不算
      if (!nav.freeAt(v.pos.x, v.pos.z, false, true)) { clipP++; const k = `${v.p.id}/${v.doing}/${v.state}`; why[k] = (why[k] ?? 0) + 1; }
      const lp = lastPos.get(v);
      if (v.state === 'walk' && lp && Math.hypot(lp[0] - v.pos.x, lp[1] - v.pos.z) < 0.01) stuck++;
      if (v.tasks[0]?.type === 'go' && v.state === 'idle' && !v.V.nav.closedDoorAt(v.pos.x + Math.sin(v.heading) * 0.35, v.pos.z + Math.cos(v.heading) * 0.35)) { waiting++; const ob = v.ahead(Math.sin(v.heading), Math.cos(v.heading)); const k = `${v.p.id}/${v.doing}<${ob ? `${ob.p.id}:${ob.state}:${ob.doing}` : '?'}`; waitWhy[k] = (waitWhy[k] ?? 0) + 1; } // 在路上站着等人（排队）
      if (v.tasks[0]?.type === 'go') goSamples++;
      seen.add(v.doing);
      lastPos.set(v, [v.pos.x, v.pos.z]);
    }
    for (const b of village.life.beasts) {
      if (b.home || b.s.perches || b.s.role === 'pigeon' || b.circling) continue;
      if (!nav.freeAt(b.pos.x, b.pos.z, b.swim) && !nav.door[nav.index(b.pos.x, b.pos.z)]) clipA++;
      if ((b.stuck ?? 0) > 0.3) beastStuck++;
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
  document.documentElement.dataset.sim = JSON.stringify({ seconds: total, hour: village.life.clock.label, samples, clipPeople: clipP, clipAnimals: clipA, beastStuck, queue: `${waiting}/${goSamples}`, seen: [...seen].sort(), litLog, leaveLog, waitWhy: Object.entries(waitWhy).sort((a, b) => b[1] - a[1]).slice(0, 6), escaped, esc, ...village.life.people[0].V.stats, kidsAt, gateOpenSamples, ajarSamples, strolls, event: village.life.today(), haircuts: village.life.barber.served, barberPlan: village.life.barber.plan.map((c) => `${c.id}@${c.at.toFixed(1)}${c.done ? '✓' : ''}`), attended: Object.keys(attended).length, roles: Object.values(attended).filter((d) => d.includes(':')), fireLit: village.object.userData.fireSeen, stuckWalkers: stuck, why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 12) });
}

let drawables = 0;
scene.traverse((o) => { if (o.isMesh || o.isSprite) drawables++; });
document.documentElement.dataset.calls = String(drawables); // 每只眼大约这么多 draw call（不含阴影）
document.documentElement.dataset.bake = JSON.stringify(village.object.userData.bake);
document.documentElement.dataset.audit = JSON.stringify({ perchFix: village.object.userData.perchFix, coplanar: village.object.userData.coplanar, flora: village.object.userData.flora, floating: village.object.userData.floating, unreachable: village.object.userData.unreachable, islands: village.object.userData.islands, brokenEdges: village.object.userData.brokenEdges });
document.documentElement.dataset.ready = '1';
