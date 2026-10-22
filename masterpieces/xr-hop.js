// 头显里换画：不退出 VR / AR，在同一个页面里卸下这一件、装上下一件
// WebXR 会话活不过一次页面跳转，所以戴着头显时"下一幅"不跳页：取来下一页的 HTML，换掉样式和 DOM，
// 用同一个渲染器（会话就挂在它上面）跑下一页的脚本。为了卸得干净，这里记下每件作品挂上的
// 监听、定时器、声音、麦克风和显存资源，换画时一并释放。
// 画廊主页（index.html）也走这套：在主页进一次 VR，画在眼前排成轮牌，捏住左右拖换画、对准正中那幅捏合走进去，
// 之后换画、回画廊都不出 VR。
// 头显里怎么换：只从电脑端换 —— 点网页上的上一幅 / 下一幅，或按键盘（见 nav.js）。
// 场景里不再有任何会换画的东西：以前视野下方有一条切换栏，进场自动露出 7 秒、看住 1.4 秒就换，
// 捏合作品自己的交互时射线扫过它也会换，观众不知道是什么触发的。XR_SWITCH 打开可以恢复。
import * as THREE from 'three';

const works = () => window.WORKS || [];
const onWork = () => works().some(w => w.slug === slugNow());
const slugNow = () => location.pathname.split('/').pop().replace(/\.html$/, '');
const keep = new WeakSet();          // 本模块自己的显存资源，换画时不释放
const xrObjs = new Set();            // 手柄、手：各件作品共用同一批对象
let bypass = 0;
const untracked = fn => { bypass++; try { return fn(); } finally { bypass--; } };
const newGen = () => ({ res: new Set(), dom: [], xrl: [], timers: new Set(), intervals: new Set(), audio: [], streams: [], observers: [] });
let gen = newGen();
let R = null;

// ---------- 记账：这件作品挂了什么 ----------
const ED = THREE.EventDispatcher.prototype, edAdd = ED.addEventListener;
ED.addEventListener = function (type, fn) {
  if (!bypass) {
    // 渲染器第一次上传几何、材质、贴图、渲染目标时，都会挂一个 dispose 监听：借它知道显存里有什么
    if (type === 'dispose') { if (this.isTexture || this.isBufferGeometry || this.isMaterial || this.isRenderTarget) gen.res.add(this); }
    else if (R && (this === R.xr || xrObjs.has(this))) gen.xrl.push([this, type, fn]);
  }
  return edAdd.call(this, type, fn);
};
const ET = EventTarget.prototype, etAdd = ET.addEventListener;
ET.addEventListener = function (type, fn, opt) {
  if (!bypass && fn && (this === window || this === document || this instanceof Node) && !/^webglcontext/.test(type)) gen.dom.push([this, type, fn, opt]);
  return etAdd.call(this, type, fn, opt);
};
// requestAnimationFrame 不记：three 自己每帧都用它，各件作品都没直接用
const [_st, _si, _raf, _ct, _ci] = [setTimeout, setInterval, requestAnimationFrame, clearTimeout, clearInterval].map(f => f.bind(window));
window.setTimeout = function (...a) { const id = _st(...a); if (!bypass) gen.timers.add(id); return id; };
window.setInterval = function (...a) { const id = _si(...a); if (!bypass) gen.intervals.add(id); return id; };
const MO = window.MutationObserver;
window.MutationObserver = class extends MO { constructor(cb) { super(cb); if (!bypass) gen.observers.push(this); } };
for (const k of ['AudioContext', 'webkitAudioContext']) {
  const A = window[k]; if (!A) continue;
  window[k] = class extends A { constructor(...a) { super(...a); if (!bypass) gen.audio.push(this); } };
}
// 跳过入场页时「进入」是脚本替观众按的，浏览器可能不让声音马上响：观众第一次点、按键、触碰时补一下
untracked(() => { for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => gen.audio.forEach(a => { if (a.state === 'suspended') a.resume(); }), true); });
// 换语言的回调（MP_I18N.onChange）也按作品记：卸下的作品不再收到，免得去改已经不在页面上的字
// 本模块自己的（untracked 里挂的）和 nav.js 的（比本模块先加载）一直有效
const I18N = window.MP_I18N;
if (I18N) {
  const on = I18N.onChange.bind(I18N);
  I18N.onChange = fn => { if (bypass) return on(fn); const g = gen; on(l => { if (g === gen) fn(l); }); };
}
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = c => gum(c).then(s => { gen.streams.push(s); return s; });
}

// ---------- 头显里的叠层：黑幕、换画时的标题、底部的切换条 ----------
const ov = {};
const CJK_SERIF = '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", Georgia, serif', SANS = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
let SERIF = CJK_SERIF;                    // 英文时西文字体排在前面（宋体里的西文字形不好看），每次画卡片前按语言定
// 叠层上的字：中 / 英。没加载 i18n.js 时一律中文
const DICT = {
  zh: { loading: '正在载入…', loadingScene: s => `正在载入场景 · ${s} 秒`, loaded: '载入完成', homeKicker: n => `INTO THE PAINTING · ${n} ROOMS`,
        homeTitle: '入画', homeSub: '回到画廊', stripHome: '⌂ 回画廊', stripPrev: '‹ 上一幅', stripNext: '下一幅 ›',
        eye: '观看点', eyeKeys: 'W/S 前后 · A/D 左右 · Q/E 低高 · 0 复位' },
  en: { loading: 'Loading…', loadingScene: s => `Loading scene · ${s}s`, loaded: 'Ready', homeKicker: n => `${n} ROOMS`,
        homeTitle: 'Into the Painting', homeSub: 'Back to the gallery', stripHome: '⌂ Gallery', stripPrev: '‹ Previous', stripNext: 'Next ›',
        eye: 'Viewpoint', eyeKeys: 'W/S forward/back · A/D left/right · Q/E down/up · 0 reset' },
};
const L = k => I18N ? I18N.t(DICT, k) : DICT.zh[k];
const T = w => window.workText ? workText(w) : { title: w.zh, sub: w.en, blurb: w.blurb, tags: w.tags };
const setFonts = () => { SERIF = I18N && I18N.lang === 'en' ? `Georgia, ${CJK_SERIF}` : CJK_SERIF; };
function canvasPlane(w, h, cw, ch, order) {
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const geo = new THREE.PlaneGeometry(w, h);
  [tex, mat, geo].forEach(o => keep.add(o));
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.frustumCulled = false;
  return { m, g: cv.getContext('2d'), tex, cv };
}
function buildOverlay() {
  ov.scene = new THREE.Scene();
  ov.rig = new THREE.Group(); ov.rig.matrixAutoUpdate = false; ov.scene.add(ov.rig);
  ov.cam = new THREE.PerspectiveCamera(70, 1, 0.05, 100); ov.rig.add(ov.cam);
  const sg = new THREE.SphereGeometry(5, 24, 16), sm = new THREE.MeshBasicMaterial({ color: 0x0b0a0d, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  keep.add(sg); keep.add(sm);
  ov.veil = new THREE.Mesh(sg, sm); ov.veil.renderOrder = 1000; ov.veil.frustumCulled = false; ov.scene.add(ov.veil);
  // 换画时的卡片：载入一件作品要好几秒到十几秒，卡片上放原画、介绍和载入进度，等的时候有东西可读
  ov.title = canvasPlane(1.0, 0.56, 2048, 1146, 1001); ov.scene.add(ov.title.m);   // 2.1 米外约 27° × 15°：眼镜视场约 40° × 24°，四边都留出余量
  ov.strip = canvasPlane(0.6, 0.15, 1600, 400, 1002); ov.scene.add(ov.strip.m);
  // 作品里的「回画廊」按钮：视线下方，手的射线指着它捏合才回去（不看停留，免得低头时误触）
  ov.home = canvasPlane(0.2, 0.068, 640, 216, 1003); ov.scene.add(ov.home.m);
}
let homeKey = '';
function drawHome2(hot) {
  const key = `${hot}|${I18N ? I18N.lang : 'zh'}`; if (key === homeKey) return; homeKey = key;   // 换了语言也要重画
  const { g, cv, tex } = ov.home, w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = hot ? 'rgba(201,164,92,.35)' : 'rgba(11,10,13,.72)'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, (h - 16) / 2); g.fill();
  g.lineWidth = hot ? 8 : 5; g.strokeStyle = hot ? 'rgba(232,200,128,1)' : 'rgba(201,164,92,.75)'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f6f0e4';
  fitText(g, L('stripHome'), w / 2, h / 2 + 4, w - 90, 86, `500 $px ${SANS}`, 6);
  tex.needsUpdate = true;
}

// 换画时的标题：作品名 + 英文名，落在黑幕上
// 写一行字，放不下就缩小字号
function fitText(g, txt, x, y, maxW, size, font, spacing = 0) {
  g.letterSpacing = `${spacing}px`;
  for (let k = 0; k < 8; k++) { g.font = `${font.replace('$', size)}`; if (g.measureText(txt).width <= maxW) break; size *= 0.9; spacing *= 0.9; g.letterSpacing = `${spacing}px`; }
  g.fillText(txt, x, y);
}
// 折行：中文按字，西文按词（连着的字母、数字、标点算一块），最多 maxLines 行，超出用省略号
function wrapText(g, txt, maxW, maxLines) {
  const lines = []; let cur = '';
  for (const ch of txt.match(/[\wÀ-ɏ'’“”",.;:!?()\-–—]+|\s+|[^]/gu) || []) {
    if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch.trim() ? ch : ''; if (lines.length === maxLines) break; }
    else cur += ch;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (lines.length === maxLines) lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…');
  return lines;
}
const thumbs = new Map();                 // 缩略图：载入后若卡片还是这一幅，就重画一次
let cardNow = null;
// status：右上角的进度字，传函数时换语言能按新语言重画
function drawTitle(w, idx, status = () => L('loading')) {
  cardNow = { w, idx, status };
  homeNow = false; setFonts();
  const txt = T(w), st = typeof status === 'function' ? status() : status;
  const { g, cv, tex } = ov.title, W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H); g.shadowBlur = 0;
  g.fillStyle = 'rgba(14,13,18,.92)'; g.beginPath(); g.roundRect(8, 8, W - 16, H - 16, 36); g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(201,164,92,.45)'; g.stroke();
  // 左：原画（画框一道金线）
  let im = thumbs.get(w.slug);
  if (!im) { im = new Image(); im.onload = () => { if (cardNow && cardNow.w === w) untracked(() => drawTitle(w, idx, cardNow.status)); }; im.src = `data/thumbs/${w.slug}.jpg`; thumbs.set(w.slug, im); }
  const bx = 70, by = 90, bw = 860, bh = H - 180;
  if (im.complete && im.naturalWidth) {
    const k = Math.min(bw / im.naturalWidth, bh / im.naturalHeight), iw = im.naturalWidth * k, ih = im.naturalHeight * k;
    const ix = bx + (bw - iw) / 2, iy = by + (bh - ih) / 2;
    g.drawImage(im, ix, iy, iw, ih);
    g.lineWidth = 8; g.strokeStyle = 'rgba(201,164,92,.85)'; g.strokeRect(ix - 6, iy - 6, iw + 12, ih + 12);
  } else { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(bx, by, bw, bh); }
  // 右：标题、介绍、标签、进度
  const x = 1000, cw = W - x - 80;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(201,164,92,.95)'; fitText(g, `${idx + 1} / ${works().length}  ·  AFTER ${w.after.toUpperCase()} · ${w.year}`, x, 150, cw, 38, `500 $px ${SANS}`, 8);
  g.fillStyle = '#f3ede2'; fitText(g, txt.title, x, 300, cw, 120, `400 $px ${SERIF}`, 16);
  g.fillStyle = 'rgba(232,224,210,.75)'; fitText(g, txt.sub, x, 385, cw, 50, `italic $px ${SERIF}`, 2);
  g.fillStyle = 'rgba(201,164,92,.85)'; g.fillRect(x, 430, 90, 4);
  // 介绍：六行放不下（英文比中文长）就把字号缩一点，行距跟着缩
  g.fillStyle = 'rgba(236,231,220,.92)'; g.letterSpacing = '2px';
  let fs = 46, lines;
  for (;;) { g.font = `400 ${fs}px ${SERIF}`; lines = wrapText(g, txt.blurb || '', cw, 99); if (lines.length <= 6 || fs <= 36) break; fs -= 2; }
  if (lines.length > 6) lines = wrapText(g, txt.blurb || '', cw, 6);
  lines.forEach((ln, k) => g.fillText(ln, x, 515 + k * fs * 1.65));
  let tx = x; g.font = `500 32px ${SANS}`; g.letterSpacing = '2px';
  for (const t of txt.tags || []) {
    const tw = g.measureText(t).width + 44; if (tx + tw > W - 80) break;
    g.lineWidth = 2; g.strokeStyle = 'rgba(236,231,220,.35)'; g.beginPath(); g.roundRect(tx, 990, tw, 58, 29); g.stroke();
    g.fillStyle = 'rgba(236,231,220,.75)'; g.fillText(t, tx + 22, 1030); tx += tw + 14;
  }
  g.fillStyle = 'rgba(201,164,92,.9)'; g.font = `500 34px ${SANS}`; g.letterSpacing = '4px'; g.textAlign = 'right';
  g.fillText(st, W - 80, 150 - 70);
  tex.needsUpdate = true;
}

let homeNow = false;                      // 卡片上现在是不是"回到画廊"：换语言时照着重画
function drawHome() {
  cardNow = null; homeNow = true; setFonts();
  const { g, cv, tex } = ov.title, W = cv.width;
  g.clearRect(0, 0, W, cv.height); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(0, 265);                                // 卡片画布比原来高，内容挪到正中
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 12;
  g.fillStyle = 'rgba(201,164,92,.95)'; fitText(g, L('homeKicker')(works().length), W / 2, 96, W - 120, 40, `500 $px ${SANS}`, 10);
  g.fillStyle = '#f3ede2'; fitText(g, L('homeTitle'), W / 2, 290, W - 160, 200, `400 $px ${SERIF}`, I18N && I18N.lang === 'en' ? 8 : 60);
  g.fillStyle = 'rgba(232,224,210,.78)'; fitText(g, L('homeSub'), W / 2, 452, W - 200, 64, `italic $px ${SERIF}`, 12);
  g.shadowBlur = 0; g.fillStyle = 'rgba(201,164,92,.85)'; g.fillRect(W / 2 - 60, 548, 120, 4);
  g.restore();
  tex.needsUpdate = true;
}

// 切换条：‹ 上一幅 · 当前 / 回画廊 · 下一幅 ›，被看住的一侧会有一道金线慢慢走满
// 条宽 0.6 米、离眼 0.9 米：主字约 3°，在头显里读得清
const ZONES = [[0, 0.31], [0.69, 1], [0.31, 0.69]];    // 上一幅、下一幅、回画廊在条上的横向范围（uv）
const ACT = ['prev', 'next', 'home'];
const DWELL = [1.4, 1.4, 1.8];
const XR_SWITCH = false;                                // 场景里的切换栏 / 手柄换画：关                           // 回画廊多看一会儿才算，免得低头读字时误触
let stripKey = '';
function drawStrip(hot, prog) {
  const W = works(), i = W.findIndex(w => w.slug === slugNow()); if (i < 0) return;
  const key = `${i}|${hot}|${Math.round(prog * 40)}|${I18N ? I18N.lang : ''}`; if (key === stripKey) return; stripKey = key;
  setFonts();
  const prev = W[(i - 1 + W.length) % W.length], next = W[(i + 1) % W.length];
  const { g, cv, tex } = ov.strip, w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h); g.textBaseline = 'middle'; g.textAlign = 'center';
  const shadow = b => { g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = b; };
  // 中间：当前是第几幅
  const cw = (ZONES[1][0] - ZONES[0][1]) * w - 40;
  if (hot === 2) {
    shadow(0); g.fillStyle = 'rgba(201,164,92,.18)'; g.beginPath(); g.roundRect(ZONES[2][0] * w + 10, 40, cw + 20, h - 80, 50); g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(222,186,110,.9)'; g.stroke();
  }
  shadow(18); g.fillStyle = 'rgba(201,164,92,.95)'; fitText(g, `${i + 1} / ${W.length}`, w / 2, 100, cw, 50, `500 $px ${SANS}`, 8);
  g.fillStyle = 'rgba(243,237,226,.9)'; fitText(g, T(W[i]).title, w / 2, 200, cw, 80, `400 $px ${SERIF}`, 8);
  g.fillStyle = hot === 2 ? '#f6f0e4' : 'rgba(232,224,210,.7)'; fitText(g, L('stripHome'), w / 2, 300, cw, 50, `500 $px ${SANS}`, 6);
  if (hot === 2 && prog > 0) { shadow(0); g.fillStyle = 'rgba(222,186,110,1)'; g.fillRect(w / 2 - cw / 2 + 50, h - 62, (cw - 100) * prog, 8); }
  const chip = (z, label, name) => {
    const x0 = ZONES[z][0] * w + 10, x1 = ZONES[z][1] * w - 10, on = hot === z, cx = (x0 + x1) / 2;
    shadow(0); g.fillStyle = on ? 'rgba(201,164,92,.28)' : 'rgba(11,10,13,.55)';
    g.beginPath(); g.roundRect(x0, 22, x1 - x0, h - 44, 60); g.fill();
    g.lineWidth = on ? 6 : 4; g.strokeStyle = on ? 'rgba(222,186,110,1)' : 'rgba(201,164,92,.6)'; g.stroke();
    shadow(10); g.fillStyle = '#f6f0e4'; fitText(g, label, cx, 160, x1 - x0 - 60, 104, `500 $px ${SANS}`, 6);
    g.fillStyle = 'rgba(232,224,210,.85)'; fitText(g, name, cx, 280, x1 - x0 - 70, 62, `400 $px ${SERIF}`, 4);
    if (on && prog > 0) { shadow(0); g.fillStyle = 'rgba(222,186,110,1)'; g.fillRect(x0 + 60, h - 62, (x1 - x0 - 120) * prog, 8); }
  };
  chip(0, L('stripPrev'), T(prev).title); chip(1, L('stripNext'), T(next).title);
  tex.needsUpdate = true;
}

// ---------- 每帧：先画作品，再在上面盖叠层 ----------
let workLoop = null, hold = false, xrRT = null, lastCam = null, lastT = 0, inWork = false;
let fade = 0, fadeTarget = 0, fadeSpeed = 2, fadeDone = null;
let titleA = 0, titleTarget = 0, teaserUntil = 0;
let anchorYaw = null, dwellZone = -1, dwell = 0, cooldown = 0;
const pads = new Map();
const head = new THREE.Vector3(), headQ = new THREE.Quaternion(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), tmpM = new THREE.Matrix4();
const ray = new THREE.Raycaster(), plane = new THREE.Plane(), hitP = new THREE.Vector3();
let linger = 0, following = false;
const rays = [];                      // 这一帧各个输入源的射线（叠层坐标）

// ---------- 把人放到这件作品的观看点 ----------
// VITURE 的 runtime 把 local-floor 的"地板"放在眼镜启动那一刻所在的位置：戴着启动时眼睛就在 y≈0，
// 水平原点有时偏出将近一米，朝向也是随机的（efforts/viture/webxr-场景高度-排查.md）。而每件作品都按
// "人站在原点、眼高 1.5 米、面朝 -Z"设计 —— 于是地面挡住画的下半截、离得太近、穿模。
// 这里每次进场景时取一次头的真实位置，用偏移参考空间把头挪到作品设计的观看点（works.js 里的 xr.eye），
// 前方对准你此刻面朝的方向。只取偏航，不取俯仰；之后人走动、转头照常跟踪。
let baseRef = null, recenterIn = -1;
let eyeOverride = null;                                   // 测试钩子：mpHop._eye([x,y,z]) 试别的观看点
// 戴着眼镜在电脑键盘上微调：W / S 前后、A / D 左右各 25 厘米，Q / E 低高 10 厘米，0 复位。按作品记在本机浏览器里
const eyeKey = () => `mp-eye-${slugNow()}`;
const eyeSaved = () => { try { const v = JSON.parse(localStorage.getItem(eyeKey())); return Array.isArray(v) && v.length === 3 ? v : null; } catch (e) { return null; } };
const eyeDefault = () => { if (pageEye) return pageEye; const w = works().find(w => w.slug === slugNow()); return (w && w.xr && w.xr.eye) || (onWork() ? [0, 1.5, 0] : [0, 1.55, 0]); };
function showEye(e) {
  let el = document.getElementById('mp-eye');
  if (!el) { el = document.createElement('div'); el.id = 'mp-eye'; el.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:70;font:12px/1.5 system-ui,sans-serif;color:#ece7dc;background:rgba(14,13,18,.75);padding:6px 10px;border-radius:6px;pointer-events:none'; document.body.appendChild(el); }
  el.textContent = `${L('eye')} (${e.map(v => v.toFixed(2)).join(', ')})　${L('eyeKeys')}`;
  clearTimeout(showEye.t); el.style.display = ''; showEye.t = _st(() => { el.style.display = 'none'; }, 6000);
}
untracked(() => addEventListener('keydown', e => {
  if (!R || !R.xr.isPresenting || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase(), d = { w: [0, 0, -0.25], s: [0, 0, 0.25], a: [-0.25, 0, 0], d: [0.25, 0, 0], q: [0, -0.1, 0], e: [0, 0.1, 0] }[k];
  if (!d && k !== '0') return;
  const cur = eyeOf(), next = k === '0' ? eyeDefault() : cur.map((v, n) => +(v + d[n]).toFixed(2));
  try { if (k === '0') localStorage.removeItem(eyeKey()); else localStorage.setItem(eyeKey(), JSON.stringify(next)); } catch (err) {}
  recenterIn = 0; showEye(next);
}));
let pageEye = null;                                       // 作品自己算出来的观看点（hop.eye = [...]），比如要站在地形上
const eyeOf = () => { if (eyeOverride) return eyeOverride; const sv = eyeSaved(); if (sv) return sv; if (pageEye) return pageEye; const w = works().find(w => w.slug === slugNow()); return (w && w.xr && w.xr.eye) || (onWork() ? [0, 1.5, 0] : [0, 1.55, 0]); };
function recenter(frame) {
  const pose = baseRef && frame.getViewerPose(baseRef); if (!pose) return false;
  const h = pose.transform.position, o = pose.transform.orientation;
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
  const yaw = Math.atan2(-f.x, -f.z), c = Math.cos(yaw), s = Math.sin(yaw), [ex, ey, ez] = eyeOf();
  // 偏移空间的原点（在 local-floor 里）= 头 − Ry(yaw)·观看点，朝向 = Ry(yaw)：于是新空间里头正好在观看点、面朝 -Z
  const p = { x: h.x - (ex * c + ez * s), y: h.y - ey, z: h.z - (-ex * s + ez * c), w: 1 };
  R.xr.setReferenceSpace(baseRef.getOffsetReferenceSpace(new XRRigidTransform(p, { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })));
  return true;
}

function master(t, frame) {
  const dt = Math.min(0.1, lastT ? (t - lastT) / 1000 : 0.016); lastT = t;
  const xr = R.xr.isPresenting && frame;
  // 等追踪稳定几帧再取头的位置（刚进会话的头几帧姿态可能还没收敛）
  if (xr && recenterIn >= 0 && recenterIn-- === 0 && !recenter(frame)) recenterIn = 1;
  if (xr) xrRT = R.getRenderTarget();
  // 换画时新作品在黑幕后面就开始跑（有的作品要跑起来才算载完）
  if (workLoop) { inWork = !!xr; try { workLoop(t, frame); } finally { inWork = false; } }
  if (xr) untracked(() => overlay(dt, frame));
}

const act = a => a === 'home' ? go(0, false, 'home') : go(a === 'prev' ? -1 : 1);
let request = act;                      // 测试时换成记录
function overlay(dt, frame, ref = R.xr.getReferenceSpace(), draw = true) {
  const pose = ref && frame.getViewerPose(ref);
  if (!pose) return;
  // 叠层和作品用同一个坐标系：作品相机挂在哪个父节点下，叠层的相机也套上同样的变换
  const parent = !hold && lastCam && lastCam.parent;
  if (parent) ov.rig.matrix.copy(parent.matrixWorld); else ov.rig.matrix.identity();
  ov.rig.updateMatrixWorld(true);
  if (lastCam) { ov.cam.near = lastCam.near; ov.cam.far = lastCam.far; }
  tmpM.fromArray(pose.transform.matrix).premultiply(ov.rig.matrixWorld);
  tmpM.decompose(head, headQ, tmp);
  fwd.set(0, 0, -1).applyQuaternion(headQ);

  // 黑幕与标题
  fade += Math.sign(fadeTarget - fade) * Math.min(Math.abs(fadeTarget - fade), dt * fadeSpeed);
  if (fade === fadeTarget && fadeDone) { const f = fadeDone; fadeDone = null; f(); }
  ov.veil.position.copy(head); ov.veil.material.opacity = fade; ov.veil.visible = fade > 0.001;
  titleA += (titleTarget - titleA) * Math.min(1, dt * 3);
  const tm = ov.title.m; tm.visible = titleA > 0.01; tm.material.opacity = titleA;
  if (tm.visible) { tmp.copy(fwd).setY(0).normalize().multiplyScalar(2.1).add(head); tmp.y = head.y; tm.position.lerp(tmp, titleA < 0.05 ? 1 : Math.min(1, dt * 2)); tm.lookAt(head); }   // 卡片 1 米宽，2.1 米外约占 27°，四边都在眼镜视场里

  // 切换条：身体朝向锁定，在视线下方约 30°；转身超过 50° 时慢慢转回到正前方
  const yaw = Math.atan2(-fwd.x, -fwd.z);
  if (anchorYaw === null) anchorYaw = yaw;
  const dy = Math.atan2(Math.sin(yaw - anchorYaw), Math.cos(yaw - anchorYaw));
  if (Math.abs(dy) > 50 * Math.PI / 180) following = true;
  if (following) { anchorYaw += dy * Math.min(1, dt * 2.5); if (Math.abs(dy) < 0.05) following = false; }
  const sm = ov.strip.m, PITCH = -30 * Math.PI / 180, D = 0.9;
  sm.position.set(head.x - Math.sin(anchorYaw) * Math.cos(PITCH) * D, head.y + Math.sin(PITCH) * D, head.z - Math.cos(anchorYaw) * Math.cos(PITCH) * D);
  sm.lookAt(head);
  sm.updateMatrixWorld(true);
  // 视线落在条附近、并且停住一小会儿（0.35 秒）才显出来：低头看水、看雾时扫过它不会打扰
  plane.setFromNormalAndCoplanarPoint(tmp.set(0, 0, 1).transformDirection(sm.matrixWorld), sm.position);
  ray.set(head, fwd);
  let near = false;
  if (ray.ray.intersectPlane(plane, hitP)) {
    sm.worldToLocal(hitP);
    const dx = Math.max(0, Math.abs(hitP.x) - 0.3), dy = Math.max(0, Math.abs(hitP.y) - 0.075);
    near = Math.hypot(dx, dy) < 0.06;
  }
  linger = near ? linger + dt : 0;
  let vis = linger > 0.35 || (sm.material.opacity > 0.3 && near) ? 1 : 0;
  if (performance.now() < teaserUntil) vis = Math.max(vis, 0.7);
  if (hold || fade > 0.05 || busy || !onWork() || !XR_SWITCH) vis = 0;           // 画廊里不用这条：轮牌自己能换画、能进
  sm.material.opacity += (vis - sm.material.opacity) * Math.min(1, dt * (vis ? 5 : 3));
  sm.visible = sm.material.opacity > 0.01;

  // 回画廊按钮：身体朝向锁定，视线下方约 17°（刚出视场下沿，微微低头就看见）、偏左一点
  const hm = ov.home.m, HP = -17 * Math.PI / 180, HD = 0.8, HY = anchorYaw + 0.12;
  hm.position.set(head.x - Math.sin(HY) * Math.cos(HP) * HD, head.y + Math.sin(HP) * HD, head.z - Math.cos(HY) * Math.cos(HP) * HD);
  hm.lookAt(head); hm.updateMatrixWorld(true);
  const homeOn = onWork() && !hold && !busy && fade < 0.05;
  const hitHome = (o, d) => { ray.set(o, d); return ray.intersectObject(hm, false).length > 0; };

  // 视线和射线落在条上的哪一格
  const zoneOf = (o, d) => {
    ray.set(o, d); const hit = ray.intersectObject(sm, false)[0];
    if (!hit || !hit.uv) return -1;
    return ZONES.findIndex(([a, b]) => hit.uv.x >= a && hit.uv.x <= b);
  };
  rays.length = 0;
  for (const src of frame.session.inputSources) {
    const p = frame.getPose(src.targetRaySpace, ref); if (!p) continue;
    tmpM.fromArray(p.transform.matrix).premultiply(ov.rig.matrixWorld);
    const o = new THREE.Vector3().setFromMatrixPosition(tmpM), d = new THREE.Vector3(0, 0, -1).transformDirection(tmpM);
    rays.push({ src, zone: sm.visible ? zoneOf(o, d) : -1, home: homeOn && hitHome(o, d) });
    // 手柄按键：A / X 下一幅，B / Y 上一幅
    const gp = src.gamepad; if (!gp) continue;
    const was = pads.get(src) || [];
    const now = [gp.buttons[4] && gp.buttons[4].pressed, gp.buttons[5] && gp.buttons[5].pressed];
    if (onWork() && XR_SWITCH) { if (now[0] && !was[0]) request('next'); if (now[1] && !was[1]) request('prev'); }
    pads.set(src, now);
  }
  cooldown = Math.max(0, cooldown - dt);
  const gz = sm.material.opacity > 0.5 && !busy ? zoneOf(head, fwd) : -1;   // 先显出来，才开始计时
  const hot = gz >= 0 ? gz : (rays.find(r => r.zone >= 0) || { zone: -1 }).zone;
  if (gz >= 0 && gz === dwellZone && cooldown === 0) { dwell += dt; if (dwell > DWELL[gz]) { dwell = 0; request(ACT[gz]); } }
  else { dwellZone = gz; dwell = 0; }
  if (sm.visible) drawStrip(hot, gz >= 0 ? Math.min(1, dwell / DWELL[gz]) : 0);
  const homeHot = rays.some(r => r.home);
  hm.material.opacity += ((homeOn ? (homeHot ? 1 : 0.6) : 0) - hm.material.opacity) * Math.min(1, dt * 6);
  hm.visible = hm.material.opacity > 0.01;
  if (hm.visible) drawHome2(homeHot);

  if (!draw || (!ov.veil.visible && !tm.visible && !sm.visible && !hm.visible)) return;
  const ac = R.autoClear; R.autoClear = false;
  R.render(ov.scene, ov.cam);
  R.autoClear = ac;
}

// ---------- 换画 ----------
let busy = false;
const fadeTo = (v, speed) => R.xr.isPresenting ? new Promise(res => { fadeTarget = v; fadeSpeed = speed; fadeDone = res; }) : Promise.resolve(fade = fadeTarget = v);
const sleep = ms => new Promise(res => _st(res, ms));
const nextFrame = () => new Promise(res => R.xr.getSession() ? R.xr.getSession().requestAnimationFrame(() => res()) : _raf(() => res()));

// dir：±1 换到上一幅 / 下一幅；to：直接换到第几幅（从 0 数），或 'home' 回画廊主页；force：测试用，不在头显里也走一遍换画
export async function go(dir, force = false, to = null) {
  const W = works(), i = W.findIndex(w => w.slug === slugNow()), home = to === 'home';
  if (busy || !R || !(R.xr.isPresenting || force)) return false;
  let j = -1, target = null;
  if (home) { if (i < 0) return false; }
  else {
    if (to === null && i < 0) return false;
    j = to !== null ? to : (i + dir + W.length) % W.length; target = W[j];
    if (!target || j === i) return false;
  }
  const slug = home ? 'index' : target.slug, query = home ? `?from=${W[i].slug}` : '';
  busy = true; cooldown = 1.5;
  untracked(() => home ? drawHome() : drawTitle(target, j));
  titleTarget = 0.0;
  stopMusic(2.4);                        // 配乐跟着黑幕一起淡出
  await fadeTo(1, 2.4);
  hold = true; titleTarget = 1;
  try {
    const t0 = performance.now();
    const src = await fetch(`${slug}.html`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
    if (!src.includes('hop.attach(')) throw new Error('页面还是旧版本');   // 缓存里的旧页面会自己再建一个渲染器：宁可跳页
    teardown();
    await mount(slug, src, query);
    // 作品：等它载完画（「进入」按钮亮起），再替观众按下它。画廊主页的「进入」是走进画，不能按
    const enter = !home && document.getElementById('enter');
    for (let k = 0; enter && enter.disabled && k < 600; k++) {
      if (k % 10 === 0) { const sec = Math.round((performance.now() - t0) / 1000); untracked(() => drawTitle(target, j, () => L('loadingScene')(sec))); }
      await sleep(100);
    }
    if (!home) untracked(() => drawTitle(target, j, () => L('loaded')));
    if (enter && enter.disabled) throw new Error('载入超时');
    setMuted(false);                     // 新作品的「静音」按钮是开着声音的
    if (enter) enter.click();            // 点「进入」会顺带放这件作品的配乐
    else if (home) playMusic('index');
    if (R.xr.isPresenting) R.xr.dispatchEvent({ type: 'sessionstart' });   // 补发一次，让新页面切到头显模式
    teaserUntil = home ? 0 : performance.now() + 7000; anchorYaw = null;
    await sleep(Math.max(0, 1400 - (performance.now() - t0)));   // 标题至少停一会儿
    hold = false;
    if (R.xr.isPresenting) for (let k = 0; k < 6; k++) await nextFrame();              // 新场景的着色器先编译好，再揭幕
    titleTarget = 0;
    await fadeTo(0, 0.9);
  } catch (e) {
    console.error('[xr-hop]', e);
    location.href = `${slug}.html${query}`;                      // 实在不行就退回普通跳页
  }
  busy = false;
  return true;
}

function teardown() {
  untracked(() => {
    workLoop = null; lastCam = null; pageEye = null;
    const g = gen; gen = newGen();
    for (const [t, ty, fn, o] of g.dom) t.removeEventListener(ty, fn, o);
    for (const [t, ty, fn] of g.xrl) t.removeEventListener(ty, fn);
    g.timers.forEach(id => _ct(id)); g.intervals.forEach(id => _ci(id));
    g.observers.forEach(o => o.disconnect());
    g.audio.forEach(a => { try { a.close(); } catch (e) {} });
    g.streams.forEach(s => s.getTracks().forEach(tr => tr.stop()));
    // 手柄和手是共用的：从旧场景里摘下来，去掉旧作品挂上去的射线（保留手的关节）
    for (const o of xrObjs) {
      if (o.parent) o.parent.remove(o);
      const joints = new Set(Object.values(o.joints || {}));
      for (const c of [...o.children]) if (!joints.has(c)) o.remove(c);
    }
    const skip = new Set([xrRT, xrRT && xrRT.texture, xrRT && xrRT.depthTexture]);
    for (const r of g.res) if (!keep.has(r) && !skip.has(r)) { try { r.dispose(); } catch (e) {} }
    R.renderLists.dispose();
    // 渲染器的状态回到出厂值，下一件作品自己再设
    Object.assign(R, { autoClear: true, autoClearColor: true, autoClearDepth: true, autoClearStencil: true, sortObjects: true, localClippingEnabled: false, clippingPlanes: [], toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 });
    R.shadowMap.enabled = false;
    R.setClearColor(0x000000, 0);
  });
}

async function mount(slug, html, query = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = new URL(`${slug}.html`, location.href);
  const code = [...doc.querySelectorAll('script[type="module"]')].map(s => s.textContent).join('\n')
    .replace(/(from\s*|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (m, a, q, p) => a + q + new URL(p, base).href + q);
  untracked(() => {
    document.title = doc.title;
    document.querySelectorAll('head > style:not(#mp-nav-style)').forEach(s => s.remove());
    doc.querySelectorAll('head > style').forEach(s => document.head.appendChild(document.importNode(s, true)));
    const stay = new Set([document.getElementById('mp-veil'), document.getElementById('mp-nav'), document.getElementById('st-xr'), R.domElement]);
    for (const el of [...document.body.children]) if (!stay.has(el)) el.remove();
    const dock = document.getElementById('st-xr'); if (dock) dock.replaceChildren();
    const first = document.body.firstChild;
    for (const el of [...doc.body.children]) if (el.tagName !== 'SCRIPT') document.body.insertBefore(document.importNode(el, true), first);
    history.replaceState(null, '', base.pathname + query);
    if (window.mpNav) window.mpNav.rebuild();
  });
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try { await import(url); } finally { URL.revokeObjectURL(url); }
}

// 在作品的入场页上直接点了「进入 XR」：网页这边也替观众按下「进入」（还在载入就等载完），两边同步进场景
function autoEnterPage() {
  const t0 = performance.now();
  const tick = () => {
    if (!R.xr.isPresenting || busy) return;
    const b = document.getElementById('enter'), intro = document.getElementById('intro');
    if (!b || !intro || intro.classList.contains('gone')) return;
    if (b.disabled) { if (performance.now() - t0 < 60000) _st(tick, 200); return; }
    b.click();
  };
  tick();
}

// ---------- 配乐与交互音效 ----------
// 配乐是一个 <audio>，接在本模块自己的 AudioContext 上（不记账：头显里换画时不跟着作品一起被关掉，而是淡出、换曲、淡入）。
// 小声垫在作品自己的声音后面。进作品（按下「进入」，或在介绍页直接进 XR）才开始放；画廊主页第一次点、按键时开始放。
// 跟着作品的「静音」一起开关。
// 交互音效（hop.sfx）也走这里：音高取配乐所在调的五声音阶，钢琴 / 弦乐一样的软音色，落在同一个混响里，和配乐不打架。
// 作品自己合成的和弦垫底用 hop.ratio(原来的主音) 整体移到配乐的调上。
const HOME_MUSIC = { key: 'D#', title: 'Prelude', by: 'Ovani Sound · Keys Music Pack', lic: 'Royalty-Free' };
const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const MUSIC_VOL = 0.18;                  // 曲子都已统一到 -23 LUFS；再压到约 -15 dB，只当背景，突出作品自己的交互声
const musicOf = slug => slug === 'index' ? HOME_MUSIC : ((works().find(w => w.slug === slug) || {}).music || null);
const snd = { ctx: null, el: null, mg: null, sg: null, master: null, verb: null, slug: null, muted: false, pending: false, tok: 0, vol: MUSIC_VOL };
function sndInit() {
  if (snd.ctx) return snd.ctx;
  untracked(() => {
    const ctx = snd.ctx = new (window.AudioContext || window.webkitAudioContext)();
    snd.master = ctx.createGain(); snd.master.connect(ctx.destination);
    snd.mg = ctx.createGain(); snd.mg.gain.value = 0; snd.mg.connect(snd.master);
    snd.sg = ctx.createGain(); snd.sg.gain.value = 0.6; snd.sg.connect(snd.master);   // 新加的提示音也压低，不盖过作品原有的声音
    // 混响：2.6 秒指数衰减的立体声噪声
    const n = ctx.sampleRate * 2.6 | 0, ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    snd.verb = ctx.createConvolver(); snd.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.55; snd.verb.connect(vg).connect(snd.sg);
    snd.el = new Audio(); snd.el.loop = true; snd.el.preload = 'auto';
    ctx.createMediaElementSource(snd.el).connect(snd.mg);
  });
  return snd.ctx;
}
const tryPlay = () => { snd.el.play().then(() => { snd.pending = false; }, () => { snd.pending = true; }); };
function playMusic(slug) {
  const ctx = sndInit(); if (ctx.state === 'suspended') ctx.resume();
  const m = musicOf(slug), url = m ? new URL(`data/music/${slug}.mp3`, location.href).href : '';
  if (snd.slug === slug && !snd.el.paused) return;
  const tok = ++snd.tok, t = ctx.currentTime, swap = snd.el.src && snd.el.src !== url && !snd.el.paused;
  snd.slug = slug;
  snd.mg.gain.cancelScheduledValues(t); snd.mg.gain.setTargetAtTime(0, t, 0.25);
  _st(() => {
    if (tok !== snd.tok) return;
    if (!url) { snd.el.pause(); return; }
    if (snd.el.src !== url) { snd.el.src = url; snd.el.currentTime = 0; }
    tryPlay();
    snd.vol = m.vol || MUSIC_VOL;
    const t1 = ctx.currentTime; snd.mg.gain.cancelScheduledValues(t1); snd.mg.gain.setValueAtTime(0, t1); snd.mg.gain.linearRampToValueAtTime(snd.vol, t1 + 4);
  }, swap ? 1000 : 0);
}
function stopMusic(sec = 1.5) {
  if (!snd.ctx) return;
  const tok = ++snd.tok, t = snd.ctx.currentTime; snd.slug = null;
  snd.mg.gain.cancelScheduledValues(t); snd.mg.gain.setTargetAtTime(0, t, sec / 3);
  _st(() => { if (tok === snd.tok) snd.el.pause(); }, sec * 1000 + 300);
}
function setMuted(m) {
  snd.muted = m;
  if (snd.ctx) snd.master.gain.setTargetAtTime(m ? 0 : 1, snd.ctx.currentTime, 0.2);
}
// 当前作品配乐的调：主音（C4–B4 之间）和五声音阶
function keyNow() {
  const m = musicOf(slugNow()) || HOME_MUSIC;
  return { tonic: 261.63 * Math.pow(2, PC[m.key] / 12), sc: m.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9], minor: !!m.minor };
}
const degHz = (k, deg) => k.tonic * Math.pow(2, (k.sc[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5)) / 12);
// 作品原来按 fromHz 这个主音写的和弦 → 乘上这个比例，就移到配乐的调上（最多移 ±6 个半音）
function ratio(fromHz) {
  const m = musicOf(slugNow()); if (!m) return 1;
  const from = ((Math.round(12 * Math.log2(fromHz / 261.63)) % 12) + 12) % 12;
  const shift = ((PC[m.key] - from + 18) % 12) - 6;
  return Math.pow(2, shift / 12);
}
// kind：note 一个软钢琴音 · chord 上行琶音（完成、抵达）· bloom 高潮（弦乐铺开 + 琶音 + 配乐涌上来）· swell 弦乐铺进来（开始、苏醒）· low 低音（沉、点燃）· drop 水滴
// o：deg 音阶第几级（可为负、可超过 5）、degs、gain、delay（秒）、pan、dur（swell 的长度）
function sfx(kind = 'note', o = {}) {
  if (!snd.ctx || snd.muted) return;
  const ctx = snd.ctx; if (ctx.state === 'suspended') return;
  untracked(() => {
    const k = keyNow(), t = ctx.currentTime + (o.delay || 0), g0 = o.gain == null ? 1 : o.gain;
    const out = ctx.createGain(); out.gain.value = 1;
    let dst = out;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan || 0; out.connect(p); dst = p; }
    dst.connect(snd.sg); dst.connect(snd.verb);
    const piano = (f, at, amp) => {
      // 软钢琴：基音 + 三个泛音，高的衰减得快；低通让它不刺耳
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(5000, f * 6); lp.connect(out);
      [[1, 1, 3.2], [2, 0.35, 1.6], [3, 0.14, 0.9], [4, 0.06, 0.5]].forEach(([h, a, d]) => {
        const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.value = f * h * (1 + (h - 1) * 0.0008);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp * a, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
        os.connect(g).connect(lp); os.start(at); os.stop(at + d + 0.05);
      });
    };
    if (kind === 'note') piano(degHz(k, o.deg == null ? (Math.random() * 8 | 0) : o.deg), t, 0.16 * g0);
    else if (kind === 'chord') {
      (o.degs || [0, 2, 4, 5, 7]).forEach((d, i) => piano(degHz(k, d), t + i * 0.16, 0.12 * g0));
      snd.mg.gain.setTargetAtTime(snd.vol * 0.6, t, 0.1); snd.mg.gain.setTargetAtTime(snd.vol, t + 1.6, 0.8);   // 配乐让一让
    } else if (kind === 'bloom') {
      sfx('swell', { degs: [0, 2, 4, 5], dur: 7, gain: 1.4 });
      (o.degs || [0, 2, 4, 5, 7, 9, 10]).forEach((d, i) => piano(degHz(k, d), t + 0.8 + i * 0.22, 0.13 * g0));
      snd.mg.gain.setTargetAtTime(Math.min(0.6, snd.vol * 2), t, 1.5); snd.mg.gain.setTargetAtTime(snd.vol, t + 14, 3);
    } else if (kind === 'low') piano(degHz(k, o.deg || 0) / 4, t, 0.3 * g0);
    else if (kind === 'drop') {
      const f = degHz(k, o.deg == null ? 5 + (Math.random() * 5 | 0) : o.deg);
      const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.setValueAtTime(f * 0.6, t); os.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12 * g0, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      os.connect(g).connect(out); os.start(t); os.stop(t + 1);
    } else if (kind === 'swell') {
      // 弦乐：每个音两支略微走调的锯齿波，低通，慢起慢收
      const dur = o.dur || 2.5, lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.5; lp.connect(out);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * g0, t + 1.4); g.gain.setValueAtTime(0.05 * g0, t + 1.4 + dur); g.gain.linearRampToValueAtTime(0, t + 4.4 + dur); g.connect(lp);
      (o.degs || [0, 2, 4]).forEach(d => { for (const det of [-6, 6]) { const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = degHz(k, d) / 2; os.detune.value = det; os.connect(g); os.start(t); os.stop(t + 4.6 + dur); } });
    }
  });
}
// 「静音」按钮：作品自己切换文字，这里随后读一下，配乐和音效跟着开关；「进入」/ 进 XR：开始放这件作品的配乐
untracked(() => document.addEventListener('click', e => {
  const el = e.target && e.target.closest ? e.target : null; if (!el) return;
  if (el.closest('#mute')) { _st(() => { const b = document.getElementById('mute'); setMuted(!!b && /开声音|Sound on/i.test(b.textContent)); }, 0); return; }
  if (el.closest('#enter, #VRButton, #ARButton') && onWork()) playMusic(slugNow());
}, true));
untracked(() => { for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => {
  if (snd.ctx && snd.ctx.state === 'suspended') snd.ctx.resume();
  if (snd.pending) tryPlay();
  if (!busy && slugNow() === 'index' && snd.slug !== 'index') playMusic('index');   // 画廊主页：第一次点 / 按键
}, true); });

// ---------- 作品页调用：第一次建渲染器后挂上来；之后的作品直接拿到同一个渲染器 ----------
export const hop = {
  get renderer() { return R; },
  set eye(v) { pageEye = v; },
  sfx, ratio,                            // 交互音效（按配乐的调）/ 和弦垫底移调的比例
  attach(r) {
    if (R) return;
    R = r;
    untracked(buildOverlay);
    const sal = R.setAnimationLoop.bind(R);
    R.setAnimationLoop = cb => { workLoop = cb; sal(master); };
    // 兜底：作品在 XR 帧里算完 GPU 模拟后写 setRenderTarget(null)，桌面上没事，头显里却把整幅场景
    // 画到了网页画布上 —— 眼镜里黑屏（《雾海之上》就是这样）。XR 帧里的 null 一律换回 XR 帧缓冲
    const srt = R.setRenderTarget.bind(R);
    R.setRenderTarget = (rt, ...a) => srt(rt === null && inWork && xrRT ? xrRT : rt, ...a);
    const rnd = R.render.bind(R);
    R.render = (scene, camera) => { if (camera !== ov.cam && R.getRenderTarget() === (R.xr.isPresenting ? xrRT : null)) lastCam = camera; return rnd(scene, camera); };
    for (const k of ['getController', 'getControllerGrip', 'getHand']) {
      const f = R.xr[k].bind(R.xr);
      R.xr[k] = i => { const o = f(i); xrObjs.add(o); return o; };
    }
    untracked(() => {
      // 换语言：叠层上的卡片当场重画（切换条按语言记了 key，下次画时自己会重画）
      if (I18N) I18N.onChange(() => { if (cardNow) drawTitle(cardNow.w, cardNow.idx, cardNow.status); else if (homeNow) drawHome(); });
      R.xr.addEventListener('sessionstart', () => {
        teaserUntil = performance.now() + 7000; anchorYaw = null;
        if (onWork() && !busy) autoEnterPage();
        const s = R.xr.getSession();
        recenterIn = 3;
        if (s && !s.__hop) {
          s.__hop = true;
          baseRef = R.xr.getReferenceSpace();
          // 射线指着条上的一格扣扳机 / 捏合，立刻换
          s.addEventListener('select', e => {
            const r = rays.find(x => x.src === e.inputSource);
            if (r && r.home && !busy) { go(0, false, 'home'); return; }   // 指着「回画廊」捏合
            if (!XR_SWITCH) return; if (r && r.zone >= 0) act(ACT[r.zone]);
          });
        }
      });
      R.xr.addEventListener('sessionend', () => {
        fade = fadeTarget = 0; titleA = titleTarget = 0; hold = false; pads.clear();
        baseRef = null; recenterIn = -1; R.xr.setReferenceSpace(null);
        if (fadeDone) { const f = fadeDone; fadeDone = null; f(); }   // 换到一半摘了头显：让换画在网页里走完
      });
    });
  },
};
window.mpHop = { go, home: () => go(0, false, 'home'), presenting: () => !!(R && R.xr.isPresenting), _r: () => R,
  _snd: () => ({ slug: snd.slug, paused: !snd.el || snd.el.paused, src: snd.el && snd.el.src.split('/').pop(), gain: snd.mg && +snd.mg.gain.value.toFixed(3), muted: snd.muted, t: snd.el && +snd.el.currentTime.toFixed(1) }),
  _eye: e => { eyeOverride = e; recenterIn = 1; },
  // 测试：不戴头显，按给定的头部朝向（度）把叠层逻辑跑 n 帧，返回条的状态和触发的换画方向
  _sim: (n, yaw, pitch, teaser = false) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.6, 0), q, new THREE.Vector3(1, 1, 1));
    const fake = { session: { inputSources: [] }, getViewerPose: () => ({ transform: { matrix: m.elements } }) };
    const fired = []; request = d => fired.push(d);
    if (!teaser) teaserUntil = 0;
    untracked(() => { for (let k = 0; k < n; k++) overlay(1 / 60, fake, {}, false); });
    request = act;
    return { vis: +ov.strip.m.material.opacity.toFixed(2), linger: +linger.toFixed(2), dwell: +dwell.toFixed(2), zone: dwellZone, fired };
  },
  _preview: () => { stripKey = ''; drawStrip(1, 0.6); const W = works(); drawTitle(W[8], 8); return [ov.strip.cv.toDataURL(), ov.title.cv.toDataURL()]; }, info: () => R && ({ ...R.info.memory, programs: R.info.programs.length, gen: { res: gen.res.size, dom: gen.dom.length, xrl: gen.xrl.length, audio: gen.audio.length } }) };
