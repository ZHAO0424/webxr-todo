import * as THREE from 'three';
import { RESIDENTS, HOUSEHOLDS } from '../residents.js';
import { previewCanvas, itemCanvas, BUILDS, HAIRS } from '../characters.js';
import { voxelCharacter } from '../voxel.js';
import { R } from '../palette.js';
import { JOBS, JOB_CATS, rankJobs } from '../life/newcomers.js';
import { GOODS } from '../life/economy.js';

/*
 * 「创建居民」：屏幕当中一张游戏里那样的弹窗（后面的沙盘压暗），顶上一条 ①②③ 的步骤条，分三页——
 *   ① 捏人：左边一个 3D 的体素小人（和村里同一套模型），按住拖动转身看侧面、背面；
 *      右边「基本」（男女、年纪），外观分四组（身形 / 头脸 / 衣裳 / 配饰），每一样一排看得见的选项：
 *      发型、帽子、脸面、样式、花样、配饰是缩略图（就是这个人换上那一样的样子），颜色是色块，点一下就换
 *   ② 资料：左边还是立绘框（小一点）和名牌；中间名字、会什么、性格、喜欢、来历；右边住哪儿、带什么来、本钱
 *      住哪儿：不用选——进村时自己找（老村址空着的老宅优先，挑会什么、什么性子、喜欢什么合得来的；都住满了才借住人家），这里只写他会看中哪处
 *   ③ 营生：左边一格格营生（像背包格子：每格画着这一行的家伙，下面名字、一天约挣几文，正缺 / 对口的角上标出来），
 *      右边详细（大图标、干什么、在哪儿干、谁买、要置办、四季旺淡）；也可以「先不定」
 * 底下一条底栏：上一步 / 下一步 / 进村。点「进村」，他从村口的桥上走进来，先挨家认人，再按选的营生开张（life/newcomers.js）。
 * 档案里点「改行」也打开第 ③ 页（changeJob），只换营生。
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SKILLS = ['种地', '种菜', '钓鱼', '木工', '泥瓦', '力气大', '挑担', '做饭', '烙饼', '磨面', '裁缝', '针线', '杀猪', '打猎', '采山货', '烧炭', '带孩子', '识字', '算账', '说书', '选种', '赶牲口'];
const TRAITS = [...new Set(RESIDENTS.flatMap((p) => p.traits))].slice(0, 36);
const COLORS = [['indigo', '靛蓝'], ['teal', '青'], ['blue', '蓝'], ['black', '黑'], ['grey', '灰'], ['white', '月白'], ['brown', '褐'], ['khaki', '土黄'], ['mud', '赭'], ['gold', '杏黄'], ['russet', '红褐'], ['redwood', '枣红'], ['red', '红'], ['pink', '粉'], ['plum', '藕荷'], ['cabbage', '豆绿'], ['green', '墨绿']];
/** 捏人的各类选项：[字段, 值, 名字]。show：选项怎么画——swatch 色块，head / body / full / legs 缩略图截哪一段。 */
const PARTS = [
  { key: 'build', name: '身材', show: 'full', list: [['', '匀称'], ...Object.entries(BUILDS).map(([k, b]) => [k, b.name])] },
  { key: 'hair', name: '发型', show: 'head', list: Object.entries(HAIRS) },
  { key: 'hairRamp', name: '发色', show: 'swatch', list: [['hair', '乌黑'], ['brown', '棕黑'], ['khaki', '焦黄'], ['grey', '花白'], ['white', '银白']] },
  { key: 'hat', name: '帽子', show: 'head', list: [['', '不戴'], ['skullcap', '瓜皮帽'], ['towel', '羊肚手巾'], ['felt', '毡帽'], ['scarf', '头巾'], ['straw', '草帽'], ['furcap', '棉帽'], ['douli', '斗笠'], ['veil', '蜂纱帽']] },
  { key: 'style', name: '样式', show: 'full', list: [['', '短褂'], ['side', '大襟'], ['vest', '坎肩'], ['cotton', '棉袄'], ['zhongshan', '中山装'], ['overalls', '背带裤'], ['singlet', '白背心'], ['doudou', '红肚兜'], ['gown', '长衫'], ['magua', '长衫马褂'], ['sheepskin', '羊皮袄'], ['army', '军大衣'], ['raincoat', '蓑衣'], ['cape', '斗篷'], ['opera', '戏袍']] },
  { key: 'top', name: '衣裳', show: 'swatch', list: COLORS },
  { key: 'pattern', name: '花样', show: 'body', list: [['', '素面'], ['floral', '碎花'], ['plaid', '格子'], ['stripe', '条纹'], ['patch', '补丁'], ['trim', '镶边']] },
  { key: 'pants', name: '裤子', show: 'swatch', list: COLORS.filter(([c]) => !['pink', 'red', 'white'].includes(c)) },
  { key: 'skin', name: '肤色', show: 'swatch', list: [['skin', '白净'], ['skinTan', '黝黑']] },
  { key: 'face', name: '脸面', show: 'head', list: [['', '平常'], ['beard', '山羊胡'], ['mustache', '八字胡'], ['blush', '红脸蛋'], ['smile', '笑模样']] },
  { key: 'legwrap', name: '绑腿', show: 'legs', list: [['', '不打'], ['1', '打绑腿']] },
  { key: 'extra', name: '配饰', show: 'body', list: [['', '不系'], ['apron:indigo', '蓝围裙'], ['apron:black', '黑围裙'], ['apron:grey', '白围裙'], ['sash:red', '红腰带'], ['sash:black', '黑腰带'], ['sash:indigo', '蓝腰带']] },
];
/** 外观分四组，一组一页。 */
const GROUPS = [['身形', ['build', 'skin']], ['头脸', ['hair', 'hairRamp', 'hat', 'face']], ['衣裳', ['style', 'top', 'pattern', 'pants']], ['配饰', ['extra', 'legwrap']]];
const SWATCH = (key, v) => R[key === 'hairRamp' ? v : key === 'skin' ? v : v] ?? R.grey;
const BRING = [['grain', 10], ['flour', 5], ['cloth', 10], ['wood', 5]];
const PAGES = ['look', 'info', 'job'];

export function createNewcomerPanel(el, { onCreate, onChangeJob, econ, homes, pickHome = () => null, M }) {
  el.className = 'panel px';
  el.id = 'newcomer';
  el.hidden = true;
  const LOOK0 = { build: '', hair: 'short', hairRamp: 'hair', hat: '', top: 'teal', style: '', pattern: '', pants: 'black', skin: 'skin', extra: '', beard: false, mustache: false, blush: false, smile: false, legwrap: false };
  const form = { jobId: '', name: '', nick: '', age: 30, sex: '男', skills: new Set(), more: '', traits: new Set(), bio: '', likes: '', coins: 80, bring: new Set(['grain']), home: '', ...LOOK0 };
  let page = 'look', group = 0, part = 'build', cat = JOB_CATS[0], changing = null, hover = null; // changing：改行的那个人（档案里点「改行」）；hover：鼠标停在哪一格营生上（右边先给看详细）

  const chips = (key, list) => list.map(([v, t]) => `<button class="btn chipbtn" data-k="${key}" data-v="${esc(v)}">${esc(t)}</button>`).join('');
  const portrait = (cls) => `<div class="portrait ${cls}"><div class="v"></div></div>`;
  el.innerHTML = `<div class="rhead"><span class="title">创建居民</span>
      <span class="tabs"><button class="btn step" data-page="look"><b>1</b>捏人</button><i class="link"></i><button class="btn step" data-page="info"><b>2</b>资料</button><i class="link"></i><button class="btn step" data-page="job"><b>3</b>营生</button></span>
      <button class="btn close" title="关闭（Esc）">×</button></div>
    <div class="hint"></div>
    <div class="nbody look-page">
      <div class="pcol">
        <div class="stagebox">
          <div class="portrait big three"><div class="v3"></div></div>
        </div>
        <div class="turn"><button class="btn arr" data-step="-1" title="上一个">←</button><span class="cur"><i class="pn"></i><b class="pv"></b><i class="pi"></i></span><button class="btn arr" data-step="1" title="下一个">→</button></div>
      </div>
      <div class="paper box partbox">
        <h3>基本</h3>
        <div class="field"><span class="k">男女</span><div class="seg">${chips('sex', [['男', '男'], ['女', '女']])}</div></div>
        <div class="field"><span class="k">年纪</span><input class="in" data-f="age" type="range" min="16" max="80" value="30"><span class="val"><b class="agev">30</b> 岁</span></div>
        <h3>外观<small>点一下就换上，左边转着看</small></h3>
        <div class="gtabs">${GROUPS.map(([n], i) => `<button class="btn gtab" data-group="${i}">${n}</button>`).join('')}</div>
        <div class="prows"></div>
        <div class="tools"><button class="btn random">随机捏一个</button><button class="btn reset">换回本来的样子</button></div>
      </div>
    </div>
    <div class="nbody info-page" hidden>
      <div class="pcol">
        <div class="stagebox">${portrait('small')}</div>
        <div class="plaque who"></div>
      </div>
      <div class="paper box">
        <h3>名字</h3>
        <div class="row2"><label><span class="k">名字</span><input class="in" data-f="name" maxlength="6" placeholder="比如 胡二根"></label><label><span class="k">村里叫</span><input class="in" data-f="nick" maxlength="6" placeholder="比如 胡磨倌"></label></div>
        <h3>会什么<small>可多选，也可以自己写</small></h3><div class="chips">${chips('skills', SKILLS.map((s) => [s, s]))}</div>
        <input class="in wide" data-f="more" placeholder="自己写，用顿号隔开，比如 做豆腐、剃头">
        <h3>性格<small>挑两三个</small></h3><div class="chips">${chips('traits', TRAITS.map((s) => [s, s]))}</div>
        <h3>喜欢 · 来历</h3>
        <input class="in wide" data-f="likes" maxlength="16" placeholder="喜欢什么，比如 听戏、喝两口">
        <textarea class="in wide" data-f="bio" maxlength="80" rows="2" placeholder="一两句来历（可以不填），比如 山外胡家庄人，家里的磨坊叫水冲了，出来找营生"></textarea>
      </div>
      <div class="paper box">
        <h3>住哪儿<small>他自己找</small></h3><div class="homes"></div>
        <h3>带着什么来</h3><div class="chips">${chips('bring', BRING.map(([g, q]) => [g, `${GOODS[g].name} ${q}${GOODS[g].unit}`]))}</div>
        <h3>本钱</h3>
        <div class="field nok"><input class="in" data-f="coins" type="range" min="0" max="200" step="10" value="80"><span class="val"><b class="coinv">80</b> 文</span></div>
      </div>
    </div>
    <div class="nbody job-page" hidden>
      <div class="paper box jobbox">
        <div class="jcats"></div>
        <div class="jcards"></div>
        <button class="btn chipbtn undecided" data-k="jobId" data-v="">先不定，到村里看看再说</button>
      </div>
      <div class="paper box jdesc"></div>
    </div>
    <div class="foot"><span class="err"></span>
      <button class="btn back" data-go="-1">← 上一步</button>
      <button class="btn on fwd" data-go="1">下一步 →</button>
      <button class="btn on create">进村</button>
    </div>`;

  const q = (s) => el.querySelector(s);
  /** 照表单拼出这个人（外观字段 + 资料）。over：试穿某一样（缩略图用）。 */
  const person = (over = {}) => {
    const f = { ...form, ...over }, age = Math.max(16, Math.min(80, Number(f.age) || 30)), man = f.sex === '男';
    const [ek, ev] = (f.extra || ':').split(':');
    return {
      name: f.name.trim(), nick: f.nick.trim() || f.name.trim(), age, sex: f.sex,
      skills: [...f.skills, ...f.more.split(/[、，,\s]+/).filter(Boolean)], traits: [...f.traits].slice(0, 3),
      bio: f.bio.trim() || `从山外来的${man ? '汉子' : '妇人'}，在村里找营生。`, likes: f.likes.trim() || '——',
      body: age >= 60 && man ? 'elder' : man ? 'man' : 'woman', build: f.build || undefined, elder: age >= 60 || undefined,
      hair: f.hair, hairRamp: f.hairRamp === 'hair' ? undefined : f.hairRamp, hat: f.hat || undefined, top: f.top, style: f.style || undefined, pattern: f.pattern || undefined, pants: f.pants, skin: f.skin,
      beard: f.beard || undefined, mustache: f.mustache || undefined, blush: f.blush || undefined, smile: f.smile || undefined, legwrap: f.legwrap || undefined,
      apron: ek === 'apron' ? ev : undefined, sash: ek === 'sash' ? ev : undefined,
      coins: f.coins, goods: Object.fromEntries(BRING.filter(([g]) => f.bring.has(g))),
      jobId: f.jobId || undefined, jobPicked: !!f.jobId || undefined,
    };
  };
  /** 裁掉立绘四周的空白（只留人），这样放大以后人几乎占满画框。 */
  const crop = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return c;
    const o = document.createElement('canvas');
    o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  };
  const draw = (box, p, view, h, withItem = false) => { try { const c = crop(previewCanvas(p, view, 1, withItem)); c.style.height = `calc(${h} * var(--f))`; c.style.width = 'auto'; box.replaceChildren(c); } catch { box.textContent = ''; } }; // h：人有多高（画框高的九成多）
  const views = () => { const p = person(); if (page === 'look') view3d.set(p); draw(q('.portrait.small .v'), p, 'front', 180); };
  /**
   * 第一步左边的 3D 小人：和村里同一套体素模型、同一个材质，单独一个小渲染器（只在换了样子、拖动的时候画一帧）。
   * 只用鼠标转：按住拖动转身，滚轮以鼠标所在处为中心放大缩小（1～4 倍），双击复原。正交相机（没有透视畸变），从 20° 往下看；人占画框九成多。
   * 底下两个箭头换样貌：右边最后点的那一样（换组时是这一组的第一样），往前 / 往后换一个。
   */
  const view3d = (() => {
    let r3 = null, scene, cam, fig = null, yaw = -0.5, drag = null, key = '', lastW = 0, lastH = 0, half = 1, zoom = 1, panX = 0, panY = 0, cy0 = 0;
    const place = () => { // 相机对着 (panX, cy0) 再往画面上方挪 panY
      const up = new THREE.Vector3(0, Math.cos(ELEV), -Math.sin(ELEV)), t = new THREE.Vector3(panX, cy0, 0).addScaledVector(up, panY);
      cam.position.set(t.x, t.y + Math.sin(ELEV) * 10, t.z + Math.cos(ELEV) * 10); cam.lookAt(t); cam.zoom = zoom; cam.updateProjectionMatrix();
    };
    const ELEV = THREE.MathUtils.degToRad(20);
    const frame = () => { const a = lastW / lastH || 0.6; cam.left = -half * a; cam.right = half * a; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix(); };
    const box = () => q('.portrait.three .v3');
    const render = () => { if (!r3 || !fig) return; fig.object.rotation.y = yaw; r3.render(scene, cam); };
    const size = () => {
      const b = box(), w = b.clientWidth, h = b.clientHeight;
      if (!r3 || !w || !h || (w === lastW && h === lastH)) return; // 大小没变就不重设（ResizeObserver 也会因为重设画布再叫一次）
      lastW = w; lastH = h;
      r3.setSize(w, h, false); frame(); render();
    };
    const init = () => {
      if (r3 || !M) return;
      r3 = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      r3.setPixelRatio(Math.min(devicePixelRatio, 2));
      r3.outputColorSpace = THREE.SRGBColorSpace;
      scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#fff4e4', '#8a6a48', 2.2));
      const sun = new THREE.DirectionalLight('#fff0d8', 2.4); sun.position.set(1.5, 3, 4); scene.add(sun);
      cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100); // 正交：没有透视畸变
      const c = r3.domElement;
      c.style.cssText = 'width:100%;height:100%;display:block;cursor:grab;touch-action:none';
      box().append(c);
      c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw }; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; });
      c.addEventListener('pointermove', (e) => { if (!drag) return; yaw = drag.yaw + (e.clientX - drag.x) * 0.012; render(); });
      const up = () => { drag = null; c.style.cursor = 'grab'; };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('wheel', (e) => { // 滚轮缩放：鼠标指着的那一点不动
        e.preventDefault();
        const r = c.getBoundingClientRect(), a = r.width / r.height, nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((e.clientY - r.top) / r.height) * 2;
        const z1 = Math.max(1, Math.min(4, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        panX += nx * half * a * (1 / zoom - 1 / z1); panY += ny * half * (1 / zoom - 1 / z1); zoom = z1;
        const lim = half * (1 - 1 / zoom); panX = Math.max(-lim * a, Math.min(lim * a, panX)); panY = Math.max(-lim, Math.min(lim, panY));
        place(); render();
      }, { passive: false });
      c.addEventListener('dblclick', () => { zoom = 1; panX = panY = 0; place(); render(); });
      new ResizeObserver(size).observe(box());
    };
    return {
      set(p) {
        init();
        if (!r3) return;
        const k = JSON.stringify(p, ['age', 'sex', 'body', 'build', 'hair', 'hairRamp', 'hat', 'top', 'style', 'pattern', 'pants', 'skin', 'beard', 'mustache', 'blush', 'smile', 'legwrap', 'apron', 'sash']);
        if (k === key && fig) { render(); return; }
        key = k;
        if (fig) { scene.remove(fig.object); fig.object.traverse((o) => o.geometry?.dispose()); }
        fig = voxelCharacter({ ...p, item: null }, M);
        fig.pose('idle', 0);
        scene.add(fig.object);
        fig.object.rotation.y = 0;
        const bb = new THREE.Box3().setFromObject(fig.object), h = bb.max.y - bb.min.y, cy = (bb.max.y + bb.min.y) / 2;
        const rxz = Math.max(...[bb.min.x, bb.max.x].flatMap((x) => [bb.min.z, bb.max.z].map((z) => Math.hypot(x, z)))); // 怎么转都不出框
        half = ((h / 2) * Math.cos(ELEV) + rxz * Math.sin(ELEV)) * 1.05;
        cy0 = cy; place();
        lastW = lastH = 0; size(); frame(); render();
      },
    };
  })();
  /** 某一样换成 v 的样子（缩略图用）。 */
  const overFor = (P, v) => P.key === 'face' ? Object.fromEntries(['beard', 'mustache', 'blush', 'smile'].map((k) => [k, k === v])) : P.key === 'legwrap' ? { legwrap: !!v } : { [P.key]: v };
  /** 缩略图：这个人换上那一样，截头 / 上身 / 腿 / 全身那一段。 */
  const REGION = { head: [0, 0.4], body: [0.3, 0.74], legs: [0.55, 1], full: [0, 1] };
  const thumb = (P, v) => {
    const c = crop(previewCanvas(person(overFor(P, v)), 'front', 1)), [a, b] = REGION[P.show];
    const y0 = Math.floor(c.height * a), h = Math.max(1, Math.ceil(c.height * b) - y0);
    const o = document.createElement('canvas');
    o.width = c.width; o.height = h;
    o.getContext('2d').drawImage(c, 0, y0, c.width, h, 0, 0, c.width, h);
    const k = (P.show === 'full' ? 40 : 34) / Math.max(o.width, o.height);
    o.style.width = `calc(${(o.width * k).toFixed(1)} * var(--f))`; o.style.height = `calc(${(o.height * k).toFixed(1)} * var(--f))`;
    return o;
  };
  /** 箭头中间写着：正在换哪一样、现在是什么、第几个。 */
  const opts = () => {
    const P = PARTS.find((x) => x.key === part), i = Math.max(0, P.list.findIndex(([v]) => v === valueOf(P)));
    q('.turn .pn').textContent = P.name; q('.turn .pv').textContent = P.list[i][1]; q('.turn .pi').textContent = `${i + 1} / ${P.list.length}`;
  };
  const step = (d) => { const P = PARTS.find((x) => x.key === part), i = Math.max(0, P.list.findIndex(([v]) => v === valueOf(P))); setValue(P, P.list[(i + d + P.list.length) % P.list.length][0]); sync(); };
  /** 外观：当前这一组，一样一排。 */
  const partRows = () => {
    const box = q('.prows');
    box.innerHTML = GROUPS[group][1].map((key) => {
      const P = PARTS.find((x) => x.key === key), cur = valueOf(P);
      const items = P.list.map(([v, n]) => {
        const on = v === cur ? ' on' : '';
        if (P.show === 'swatch') { const r = SWATCH(key, v); return `<button class="btn sw${on}" data-pk="${key}" data-pv="${esc(v)}" title="${esc(n)}"><span class="dot" style="background:linear-gradient(135deg, ${r[Math.min(3, r.length - 1)]}, ${r[2]} 55%, ${r[1]})"></span><i>${esc(n)}</i></button>`; }
        return `<button class="btn tile${on}" data-pk="${key}" data-pv="${esc(v)}" title="${esc(n)}"><span class="th"></span><i>${esc(n)}</i></button>`;
      }).join('');
      return `<div class="prow${key === part ? ' cur' : ''}"><span class="k">${P.name}</span><div class="tiles ${P.show === 'swatch' ? 'sws' : ''}">${items}</div></div>`;
    }).join('');
    box.querySelectorAll('.tile').forEach((b) => { try { b.querySelector('.th').append(thumb(PARTS.find((x) => x.key === b.dataset.pk), b.dataset.pv)); } catch { /* 画不出来就空着 */ } });
  };
  /** 一类现在选的是第几个（脸面是几样里挑一样：山羊胡、八字胡……）。 */
  const valueOf = (P) => P.key === 'face' ? (['beard', 'mustache', 'blush', 'smile'].find((k) => form[k]) ?? '') : P.key === 'legwrap' ? (form.legwrap ? '1' : '') : String(form[P.key]);
  const setValue = (P, v) => {
    if (P.key === 'face') for (const k of ['beard', 'mustache', 'blush', 'smile']) form[k] = k === v;
    else if (P.key === 'legwrap') form.legwrap = !!v;
    else form[P.key] = v;
  };
  const homeChips = () => { // 按现在填的会什么、性格、喜好，他会看中哪处
    const o = pickHome(person());
    const host = homes()[0];
    q('.homes').innerHTML = `<div class="sub">进村以后自己找：老村址空着的老宅优先（不交房钱，攒够料请葛石头来修），挑和自己合得来的；都有人住了才借住人家。</div>`
      + (o ? `<div class="pick">按现在填的，他会看中<b>${esc(o.who)}老宅</b>：${esc(o.why)}</div>` : `<div class="pick">老宅都有人住了，他会借住<b>${esc(host?.name ?? '村里人家')}</b></div>`);
  };

  /** 一样家伙的图标（缓存起来：切一下分类就重画太慢）。 */
  const icons = new Map();
  const icon = (job, px) => {
    const k = `${job.icon ?? job.item}@${px}`;
    if (!icons.has(k)) icons.set(k, itemCanvas(job.icon ?? job.item, px));
    const src = icons.get(k);
    if (!src) return null;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };
  /** 图标按原来的长宽比放进 n×n（随界面缩放）的方框里：格子四周留出空隙，不拉伸、不顶满。 */
  const fit = (c, n) => { const k = n / Math.max(c.width, c.height); c.style.width = `calc(${(c.width * k).toFixed(1)} * var(--f))`; c.style.height = `calc(${(c.height * k).toFixed(1)} * var(--f))`; };
  const seasonBar = (j) => ['spring', 'summer', 'autumn', 'winter'].map((s, i) => { const v = j.season[s], lv = v >= 1.2 ? 'hi' : v <= 0.6 ? 'lo' : 'mid'; return `<span class="sz ${lv}"><b>${'春夏秋冬'[i]}</b>${lv === 'hi' ? '旺' : lv === 'lo' ? '淡' : '平'}</span>`; }).join('');
  /** ③ 营生：左边这一类的格子——每格画着这一行的家伙、名字、一天约挣几文，角上标正缺 / 对口；右边选中那一行的详细。 */
  const jobCards = () => {
    const E = econ(), who = changing ?? person(), ranked = E ? rankJobs(who, E) : JOBS.filter((j) => !j.legacy).map((job) => ({ job, est: job.est, rivals: 0 }));
    const by = Object.fromEntries(ranked.map((r) => [r.job.id, r]));
    q('.jcats').innerHTML = JOB_CATS.map((c) => `<button class="btn${c === cat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    const box = q('.jcards');
    box.innerHTML = '';
    for (const job of JOBS.filter((j) => !j.legacy && j.cat === cat)) {
      const r = by[job.id] ?? { est: job.est, rivals: 0 }, cur = changing && changing.jobId === job.id;
      const b = document.createElement('button');
      b.className = `btn jcard${form.jobId === job.id ? ' on' : ''}`;
      b.dataset.k = 'jobId'; b.dataset.v = job.id;
      if (cur) b.disabled = true;
      const slot = Object.assign(document.createElement('span'), { className: 'slot' });
      const c = icon(job, 56);
      if (c) { fit(c, 34); slot.append(c); }
      if (r.short || r.match) slot.append(Object.assign(document.createElement('i'), { className: `tag ${r.short ? 'short' : 'match'}`, textContent: r.short ? '缺' : '对口' }));
      b.append(slot, Object.assign(document.createElement('span'), { className: 'jt', innerHTML: `<b>${esc(job.name.replace(/（.*）/, ''))}</b><span class="dim">${cur ? '现在干的' : `约 ${r.est} 文/天`}</span>` }));
      box.append(b);
    }
    const j = JOBS.find((x) => x.id === (hover ?? form.jobId)), d = q('.jdesc');
    if (!j) { d.innerHTML = `<div class="empty">${changing ? '挑一个新营生，点「改行」，他马上换过去。' : '左边点一格，看看这一行干什么。<br><br>不选也行：他认完人，自己按"村里缺什么 + 自己会什么"挑一个。'}</div>`; return; }
    const r = by[j.id] ?? { est: j.est, rivals: 0 };
    d.innerHTML = `<div class="dh"><span class="slot big"></span><div><div class="dn">${esc(j.name)}</div><div class="dim">${esc(j.cat)} · 约 ${r.est} 文/天${r.rivals ? ` · 已有 ${r.rivals} 人在做` : ''}</div><div class="tags">${r.short ? '<i class="tag short">村里正缺</i>' : ''}${r.match ? '<i class="tag match">和会的对口</i>' : ''}</div></div></div>
      <p>${esc(j.desc)}</p>
      <dl><dt>在哪儿干</dt><dd>${esc(j.where)}</dd><dt>谁买</dt><dd>${esc(j.buyers)}</dd><dt>要置办</dt><dd>${esc(j.setup)}</dd></dl>
      <div class="season"><span class="k">四季</span>${seasonBar(j)}</div>`;
    const big = icon(j, 84);
    if (big) { fit(big, 50); d.querySelector('.slot.big').append(big); }
  };
  const sync = () => {
    el.querySelectorAll('.chipbtn[data-k]').forEach((b) => { const cur = form[b.dataset.k]; b.classList.toggle('on', cur instanceof Set ? cur.has(b.dataset.v) : String(cur) === b.dataset.v); });
    el.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === page));
    el.querySelectorAll('[data-group]').forEach((b) => b.classList.toggle('on', Number(b.dataset.group) === group));
    q('.look-page').hidden = page !== 'look'; q('.info-page').hidden = page !== 'info'; q('.job-page').hidden = page !== 'job';
    el.querySelector('.rhead .tabs').hidden = !!changing;
    const n = PAGES.indexOf(page);
    el.querySelectorAll('.step').forEach((b, i) => b.classList.toggle('done', i < n));
    q('.rhead .title').textContent = changing ? `给${changing.name}改行` : '创建居民';
    q('.foot .create').textContent = changing ? '改行' : '进村';
    q('.foot .create').hidden = page !== 'job';
    q('.foot .fwd').hidden = page === 'job';
    q('.foot .back').hidden = page === 'look' || !!changing;
    q('.foot .fwd').textContent = page === 'look' ? '下一步：填资料 →' : '下一步：选营生 →';
    q('.hint').textContent = page === 'look' ? '先捏个样子：右边分组点选，也可以用人像底下的箭头一个个换；按住人拖动转着看，滚轮放大缩小' : page === 'info' ? '起个名字、说说会什么，再挑个住处' : changing ? `现在干的是${changing.job}；开张以来挣了 ${changing.earned ?? 0} 文` : '挑个营生点「进村」：他从村口的桥上走进来，先挨家认人，第二天开张';
    q('.coinv').textContent = form.coins; q('.agev').textContent = form.age;
    const p = person();
    q('.info-page .who').innerHTML = `<b>${esc(p.name || '还没起名字')}</b><span>${p.age} 岁 · ${p.sex}</span>`;
    if (!changing) views();
    if (page === 'look') { partRows(); opts(); }
    if (page === 'job') jobCards();
    if (page === 'info') homeChips(); // 改了会什么、性格、喜好，看中的老宅跟着变
  };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.dataset.page) { page = t.dataset.page; if (page === 'info') homeChips(); sync(); return; }
    if (t.dataset.cat) { cat = t.dataset.cat; sync(); return; }
    if (t.dataset.go) { page = PAGES[Math.max(0, Math.min(2, PAGES.indexOf(page) + Number(t.dataset.go)))]; if (page === 'info') homeChips(); sync(); return; }
    if (t.dataset.group) { group = Number(t.dataset.group); part = GROUPS[group][1][0]; sync(); return; }
    if (t.dataset.pk) { part = t.dataset.pk; setValue(PARTS.find((x) => x.key === t.dataset.pk), t.dataset.pv); sync(); return; }
    if (t.dataset.step) { step(Number(t.dataset.step)); return; }
    if (t.classList.contains('random')) { for (const P of PARTS) if (P.key !== 'face' || form.sex === '男' || Math.random() < 0.5) setValue(P, P.list[Math.floor(Math.random() * P.list.length)][0]); if (form.sex === '女') { form.beard = form.mustache = false; } sync(); return; } // 随机：男女、年纪不动
    if (t.classList.contains('reset')) { Object.assign(form, LOOK0, form.sex === '女' ? { hair: 'bun', style: 'side' } : {}); sync(); return; }
    const k = t.dataset.k, v = t.dataset.v;
    if (!k) return;
    if (t.dataset.toggle) form[k] = !form[k];
    else if (form[k] instanceof Set) { if (form[k].has(v)) form[k].delete(v); else if (k !== 'traits' || form[k].size < 3) form[k].add(v); }
    else form[k] = v;
    if (k === 'sex') Object.assign(form, v === '女' ? { hair: 'bun', style: 'side', beard: false, mustache: false } : { hair: 'short', style: '' }); // 换男女：先换一身对应的打扮
    sync();
  });
  el.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('input', () => {
    form[i.dataset.f] = i.type === 'range' || i.type === 'number' ? Number(i.value) : i.value;
    if (i.dataset.f === 'age' && form.age >= 60 && form.hairRamp === 'hair') form.hairRamp = 'grey'; // 上了年纪：头发先给白了（还能再改）
    if (['name', 'more', 'bio', 'likes'].includes(i.dataset.f)) { const p = person(); q('.info-page .who b').textContent = p.name || '还没起名字'; homeChips(); return; } // 打字时不重画立绘（看中的老宅跟着变）
    sync();
  }));
  q('.close').addEventListener('click', () => api.close());
  q('.jcards').addEventListener('pointerover', (e) => { const b = e.target.closest('.jcard'); if (b && b.dataset.v !== hover) { hover = b.dataset.v; jobCards(); } });
  q('.jcards').addEventListener('pointerleave', () => { if (hover !== null) { hover = null; jobCards(); } });
  q('.create').addEventListener('click', () => {
    if (changing) { if (!form.jobId) { q('.foot .err').textContent = '先挑一个'; return; } onChangeJob?.(changing.id, form.jobId); api.close(); return; }
    const p = person();
    const err = (m) => { page = 'info'; sync(); q('.foot .err').textContent = m; };
    if (!p.name) { err('先起个名字'); return; }
    if (RESIDENTS.some((o) => o.name === p.name)) { err('村里已经有叫这个名字的了'); return; }
    q('.foot .err').textContent = '';
    onCreate(p);
    api.close();
  });

  const api = {
    get open() { return !el.hidden; },
    /** 改行：p 是档案里那个人（name、job、jobId、earned、外观）。 */
    changeJob(p) { changing = p; form.jobId = ''; cat = JOBS.find((j) => j.id === p.jobId)?.cat ?? JOB_CATS[0]; page = 'job'; sync(); el.hidden = false; document.body.classList.add('roster-open'); },
    show(which = 'look') { changing = null; if (PARTS.some((x) => x.key === which)) { group = Math.max(0, GROUPS.findIndex(([, ks]) => ks.includes(which))); part = which; which = 'look'; } page = which; if (page === 'info') homeChips(); if (page === 'job') { const c = JOBS.find((j) => j.id === form.jobId)?.cat; if (c) cat = c; } sync(); el.hidden = false; document.body.classList.add('roster-open'); },
    close() { el.hidden = true; document.body.classList.remove('roster-open'); },
  };
  return api;
}

export { HOUSEHOLDS };
