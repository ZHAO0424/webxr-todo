import * as THREE from 'three';
import { RESIDENTS, HOUSEHOLDS } from '../residents.js';
import { previewCanvas, itemCanvas } from '../characters.js';
import { voxelCharacter } from '../voxel.js';
import { R } from '../palette.js';
import { JOBS, rankJobs } from '../life/newcomers.js';
import { GOODS } from '../life/economy.js';
import { PARTS, GROUPS, SKILLS, TRAITS, BRING } from '../residentSchema.js';
import { issueUrl, markSent, STATUS } from '../mine.js';
import { EN, tr } from '../i18n.js';
import { word, pName, pNick, pJob } from '../names.js';

/*
 * 「我的居民」+「创建居民」：屏幕当中一张游戏里那样的弹窗（后面的沙盘压暗）。
 *   我的居民（mine）：自己在这台电脑上建的人，一人一张卡——立绘、名字、营生、走到哪一步了（只在这台电脑上 / 等入村 / 在村里 / 有改动没提交……，见 src/mine.js），
 *       按状态给最该点的那个按钮（提交到村子 / 提交改动），再加修改、改行、去村里找、离村；最后一格是「再建一个」。一个都没有时直接进创建。
 *   创建：顶上一条 ①②③ 的步骤条，分三页——
 *     ① 捏人：左边一个 3D 的体素小人（和村里同一套模型），按住拖动转身看侧面、背面；
 *        右边「基本」（男女、年纪），外观分四组（身形 / 头脸 / 衣裳 / 配饰），每一样一排看得见的选项：
 *        发型、帽子、脸面、样式、花样、配饰是缩略图（就是这个人换上那一样的样子），颜色是色块，点一下就换
 *     ② 资料：左边还是立绘框（小一点）和名牌；中间名字、会什么、性格、喜欢、来历；右边住哪儿、带什么来、本钱
 *        住哪儿：不用选——进村时自己找（老村址空着的老宅优先，挑会什么、什么性子、喜欢什么合得来的；都住满了才借住人家），这里只写他会看中哪处
 *     ③ 营生：左边一格格营生（像背包格子：每格画着这一行的家伙，下面名字、一天约挣几文，正缺 / 对口的角上标出来），
 *        右边详细（大图标、干什么、在哪儿干、谁买、要置办、四季旺淡）；也可以「先不定」
 *     点「进村」：他从村口的桥上走进来（life/newcomers.js），弹窗换成「进村了」——说明现在只在这台电脑上，给「提交到村子」。
 *   修改（edit）：我的居民里点「修改」，打开 ①② 两页（营生走「改行」），底栏「保存修改」；改完回到我的居民，提示提交改动。
 *   档案里点「改行」也打开第 ③ 页（changeJob），只换营生。
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nameOf = (P, v) => { const o = P.list.find(([x]) => x === v); return o ? (EN ? o[2] : o[1]) : ''; };
const SWATCH = (key, v) => R[v] ?? R.grey;
const PAGES = ['look', 'info', 'job'];
const cjk = (s) => /[^\x00-\x7f]/.test(s);
const jt = (j, k) => (EN ? j.en?.[k] ?? j[k] : j[k]); // 营生的字（英文界面读 job.en）
const goodName = (g) => (EN ? GOODS[g].en?.name ?? GOODS[g].name : GOODS[g].name);
const goodUnit = (g) => (EN ? GOODS[g].en?.unit ?? '' : GOODS[g].unit);

export function createNewcomerPanel(el, { onCreate, onChangeJob, onEdit, onFind, onLeave, onDetail, share, account, residents = () => [], econ, homes, pickHome = () => null, M }) {
  el.className = 'panel px';
  el.id = 'newcomer';
  el.hidden = true;
  const LOOK0 = { build: '', hair: 'short', hairRamp: 'hair', hat: '', top: 'teal', style: '', pattern: '', pants: 'black', skin: 'skin', extra: '', beard: false, mustache: false, blush: false, smile: false, legwrap: false };
  const FORM0 = () => ({ jobId: '', name: '', nick: '', age: 30, sex: '男', skills: new Set(), more: '', traits: new Set(), bio: '', likes: '', coins: 80, bring: new Set(['grain']), home: '', ...LOOK0 });
  let form = FORM0();
  let page = 'look', group = 0, part = 'build', changing = null, editing = null, hover = null, made = null, leaveAsk = null;
  // changing：改行的那个人（档案里点「改行」）；editing：在改样子资料的那个人；hover：鼠标停在哪一格营生上；made：刚进村的那个人（「进村了」页）；leaveAsk：在问"真让他走吗"的那个人

  const chips = (key, list) => list.map(([v, t]) => `<button class="btn chipbtn" data-k="${key}" data-v="${esc(v)}">${esc(t)}</button>`).join('');
  const portrait = (cls) => `<div class="portrait ${cls}"><div class="v"></div></div>`;
  el.innerHTML = `<div class="rhead"><button class="btn tohub" data-act="mine" title="${tr('回到我的居民', 'Back to my residents')}">← ${tr('我的居民', 'My residents')}</button><span class="title"></span>
      <span class="tabs"><button class="btn step" data-page="look"><b>1</b>${tr('捏人', 'Look')}</button><i class="link"></i><button class="btn step" data-page="info"><b>2</b>${tr('资料', 'Profile')}</button><i class="link l2"></i><button class="btn step s3" data-page="job"><b>3</b>${tr('营生', 'Work')}</button></span>
      <button class="btn close" title="${tr('关闭（Esc）', 'Close (Esc)')}">×</button></div>
    <div class="hint"></div>
    <div class="nbody mine-page" hidden><div class="mcards"></div></div>
    <div class="nbody done-page" hidden>
      <div class="pcol"><div class="stagebox">${portrait('small donep')}</div></div>
      <div class="paper box donebox"></div>
    </div>
    <div class="nbody look-page">
      <div class="pcol">
        <div class="stagebox">
          <div class="portrait big three"><div class="v3"></div></div>
        </div>
        <div class="turn"><button class="btn arr" data-step="-1" title="${tr('上一个', 'Previous')}">←</button><span class="cur"><i class="pn"></i><b class="pv"></b><i class="pi"></i></span><button class="btn arr" data-step="1" title="${tr('下一个', 'Next')}">→</button></div>
      </div>
      <div class="paper box partbox">
        <h3>${tr('基本', 'Basics')}</h3>
        <div class="field"><span class="k">${tr('男女', 'Sex')}</span><div class="seg">${chips('sex', [['男', tr('男', 'Male')], ['女', tr('女', 'Female')]])}</div></div>
        <div class="field"><span class="k">${tr('年纪', 'Age')}</span><input class="in" data-f="age" type="range" min="16" max="80" value="30"><span class="val">${EN ? '<b class="agev">30</b>' : '<b class="agev">30</b> 岁'}</span></div>
        <h3>${tr('外观', 'Appearance')}<small>${tr('点一下就换上，左边转着看', 'Click to try on; drag the figure to turn it')}</small></h3>
        <div class="gtabs">${GROUPS.map(([n, en], i) => `<button class="btn gtab" data-group="${i}">${EN ? en : n}</button>`).join('')}</div>
        <div class="prows"></div>
        <div class="tools"><button class="btn random">${tr('随机捏一个', 'Randomise')}</button><button class="btn reset">${tr('换回本来的样子', 'Reset look')}</button></div>
      </div>
    </div>
    <div class="nbody info-page" hidden>
      <div class="pcol">
        <div class="stagebox">${portrait('small')}</div>
        <div class="plaque who"></div>
      </div>
      <div class="paper box">
        <h3>${tr('名字', 'Name')}</h3>
        <div class="row2"><label><span class="k">${tr('名字', 'Name')}</span><input class="in" data-f="name" maxlength="${EN ? 14 : 6}" placeholder="${tr('比如 胡二根', 'e.g. Hu Ergen')}"></label></div>
        <h3>${tr('会什么', 'Skills')}<small>${tr('可多选，也可以自己写', 'Pick any, or write your own')}</small></h3><div class="chips">${chips('skills', SKILLS.map((s) => [s, word(s)]))}</div>
        <input class="in wide" data-f="more" placeholder="${tr('自己写，用顿号隔开，比如 做豆腐、剃头', 'Your own, comma-separated, e.g. tofu making, barbering')}">
        <h3>${tr('性格', 'Personality')}<small>${tr('挑两三个', 'Pick two or three')}</small></h3><div class="chips">${chips('traits', TRAITS.map((s) => [s, word(s)]))}</div>
        <h3>${tr('喜欢 · 来历', 'Likes · background')}</h3>
        <input class="in wide" data-f="likes" maxlength="${EN ? 32 : 16}" placeholder="${tr('喜欢什么，比如 听戏、喝两口', 'Likes, e.g. opera, a drop of liquor')}">
        <textarea class="in wide" data-f="bio" maxlength="${EN ? 160 : 80}" rows="2" placeholder="${tr('一两句来历（可以不填），比如 山外胡家庄人，家里的磨坊叫水冲了，出来找营生', 'A line or two of background (optional), e.g. From Hujiazhuang beyond the hills; the family mill was washed away, so came out to find work.')}"></textarea>
      </div>
      <div class="paper box newonly">
        <h3>${tr('住哪儿', 'Home')}<small>${tr('他自己找', 'They choose')}</small></h3><div class="homes"></div>
        <h3 class="bring-h">${tr('带着什么来', 'Brings along')}</h3><div class="chips bring">${chips('bring', BRING.map(([g, q]) => [g, EN ? `${goodName(g)} ×${q}` : `${GOODS[g].name} ${q}${GOODS[g].unit}`]))}</div>
        <h3 class="coin-h">${tr('本钱', 'Savings')}</h3>
        <div class="field nok coin-f"><input class="in" data-f="coins" type="range" min="0" max="200" step="10" value="80"><span class="val"><b class="coinv">80</b> ${tr('文', 'coins')}</span></div>
      </div>
    </div>
    <div class="nbody job-page" hidden>
      <div class="paper box jobbox">
        <div class="jcards"></div>
        <button class="btn chipbtn undecided" data-k="jobId" data-v="">${tr('先不定，到村里看看再说', 'Decide later, after looking around')}</button>
      </div>
      <div class="paper box jdesc"></div>
    </div>
    <div class="foot"><span class="err"></span>
      <button class="btn back" data-go="-1">← ${tr('上一步', 'Back')}</button>
      <button class="btn on fwd" data-go="1"></button>
      <button class="btn on create"></button>
    </div>`;

  const q = (s) => el.querySelector(s);
  /** 照表单拼出这个人（外观字段 + 资料）。over：试穿某一样（缩略图用）。 */
  const person = (over = {}) => {
    const f = { ...form, ...over }, age = Math.max(16, Math.min(80, Number(f.age) || 30)), man = f.sex === '男';
    const [ek, ev] = (f.extra || ':').split(':');
    return {
      name: f.name.trim(), nick: f.name.trim(), age, sex: f.sex, // 不另起外号：村里就叫名字
      skills: [...f.skills, ...f.more.split(/[、，,;；\s]+/).filter(Boolean)], traits: [...f.traits].slice(0, 3),
      bio: f.bio.trim(), likes: f.likes.trim() || '——', // 来历没写：卡片上按男女给一句（names.js 的 defaultBio）
      body: age >= 60 && man ? 'elder' : man ? 'man' : 'woman', build: f.build || undefined, elder: age >= 60 || undefined,
      hair: f.hair, hairRamp: f.hairRamp === 'hair' ? undefined : f.hairRamp, hat: f.hat || undefined, top: f.top, style: f.style || undefined, pattern: f.pattern || undefined, pants: f.pants, skin: f.skin,
      beard: f.beard || undefined, mustache: f.mustache || undefined, blush: f.blush || undefined, smile: f.smile || undefined, legwrap: f.legwrap || undefined,
      apron: ek === 'apron' ? ev : undefined, sash: ek === 'sash' ? ev : undefined, acc: ek === 'acc' ? ev : undefined,
      coins: f.coins, goods: Object.fromEntries(BRING.filter(([g]) => f.bring.has(g))),
      jobId: f.jobId || undefined, jobPicked: !!f.jobId || undefined,
    };
  };
  /** 反过来：一个已有的人 → 表单（「修改」时先照他现在的样子填好）。 */
  const formOf = (p) => ({
    ...FORM0(), name: p.name ?? '', nick: p.nick && p.nick !== p.name ? p.nick : '', age: p.age ?? 30, sex: p.sex === '女' ? '女' : '男',
    skills: new Set((p.skills ?? []).filter((s) => SKILLS.includes(s))), more: (p.skills ?? []).filter((s) => !SKILLS.includes(s)).join(EN ? ', ' : '、'),
    traits: new Set(p.traits ?? []), bio: p.bio ?? '', likes: p.likes && p.likes !== '——' ? p.likes : '',
    build: p.build ?? '', hair: p.hair ?? 'short', hairRamp: p.hairRamp ?? 'hair', hat: p.hat ?? '', top: p.top ?? 'teal', style: p.style ?? '', pattern: p.pattern ?? '', pants: p.pants ?? 'black', skin: p.skin ?? 'skin',
    extra: p.apron ? `apron:${p.apron}` : p.sash ? `sash:${p.sash}` : p.acc ? `acc:${p.acc}` : '',
    beard: !!p.beard, mustache: !!p.mustache, blush: !!p.blush, smile: !!p.smile, legwrap: !!p.legwrap, jobId: p.jobId ?? '',
  });
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
  const views = () => { const p = person(); if (page === 'look') view3d.set(p); draw(q('.info-page .portrait.small .v'), p, 'front', 180); };
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
        const k = JSON.stringify(p, ['age', 'sex', 'body', 'build', 'hair', 'hairRamp', 'hat', 'top', 'style', 'pattern', 'pants', 'skin', 'beard', 'mustache', 'blush', 'smile', 'legwrap', 'apron', 'sash', 'acc']);
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
    q('.turn .pn').textContent = EN ? P.en : P.name; q('.turn .pv').textContent = EN ? P.list[i][2] : P.list[i][1]; q('.turn .pi').textContent = `${i + 1} / ${P.list.length}`;
  };
  const step = (d) => { const P = PARTS.find((x) => x.key === part), i = Math.max(0, P.list.findIndex(([v]) => v === valueOf(P))); setValue(P, P.list[(i + d + P.list.length) % P.list.length][0]); sync(); };
  /** 外观：当前这一组，一样一排。 */
  const partRows = () => {
    const box = q('.prows');
    box.innerHTML = GROUPS[group][2].map((key) => {
      const P = PARTS.find((x) => x.key === key), cur = valueOf(P);
      const items = P.list.map(([v, zh, en]) => {
        const on = v === cur ? ' on' : '', n = EN ? en : zh;
        if (P.show === 'swatch') { const r = SWATCH(key, v); return `<button class="btn sw${on}" data-pk="${key}" data-pv="${esc(v)}" title="${esc(n)}"><span class="dot" style="background:linear-gradient(135deg, ${r[Math.min(3, r.length - 1)]}, ${r[2]} 55%, ${r[1]})"></span><i>${esc(n)}</i></button>`; }
        return `<button class="btn tile${on}" data-pk="${key}" data-pv="${esc(v)}" title="${esc(n)}"><span class="th"></span><i>${esc(n)}</i></button>`;
      }).join('');
      return `<div class="prow${key === part ? ' cur' : ''}"><span class="k">${EN ? P.en : P.name}</span><div class="tiles ${P.show === 'swatch' ? 'sws' : ''}">${items}</div></div>`;
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
  const homeChips = () => { // 按现在填的会什么、性格、喜好，他会看中哪处（修改时：写现在住哪儿）
    if (editing) { q('.homes').innerHTML = `<div class="sub">${EN ? 'Already settled in the village; the home stays as it is.' : '已经在村里住下了，住处不变。'}</div>`; return; }
    const o = pickHome(person());
    const host = homes()[0];
    q('.homes').innerHTML = `<div class="sub">${tr('进村以后自己找：老村址空着的老宅优先（不交房钱，攒够料请葛石头来修），挑和自己合得来的；都有人住了才借住人家。', 'They find a home on arrival: empty old houses at the Old Site first (rent-free; they save up materials and ask Stonemason Ge to repair it), choosing one that suits them. If all are taken, they lodge with a family.')}</div>`
      + (o ? `<div class="pick">${EN ? `With this profile they\'d choose the <b>${esc(o.whoEn ?? word(o.who))} old house</b>: ${esc(o.whyEn ?? o.why)}` : `按现在填的，他会看中<b>${esc(o.who)}老宅</b>：${esc(o.why)}`}</div>` : `<div class="pick">${EN ? `All old houses are taken; they\'d lodge with <b>${esc((host?.name ?? 'a family').replace(/^The /, 'the '))}</b>` : `老宅都有人住了，他会借住<b>${esc(host?.name ?? '村里人家')}</b>`}</div>`);
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
  const SEASONS = EN ? ['Spr', 'Sum', 'Aut', 'Win'] : ['春', '夏', '秋', '冬'];
  const seasonBar = (j) => ['spring', 'summer', 'autumn', 'winter'].map((s, i) => { const v = j.season[s], lv = v >= 1.2 ? 'hi' : v <= 0.6 ? 'lo' : 'mid'; return `<span class="sz ${lv}"><b>${SEASONS[i]}</b>${lv === 'hi' ? tr('旺', '↑') : lv === 'lo' ? tr('淡', '↓') : tr('平', '–')}</span>`; }).join('');
  /** ③ 营生：左边所有营生放在一起（不分类、不标钱）——每格画着这一行的家伙、名字，角上标正缺 / 对口；右边选中那一行的详细。 */
  const jobCards = () => {
    const E = econ(), who = changing ?? person(), ranked = E ? rankJobs(who, E) : JOBS.filter((j) => !j.legacy).map((job) => ({ job, est: job.est, rivals: 0 }));
    const by = Object.fromEntries(ranked.map((r) => [r.job.id, r]));
    const box = q('.jcards');
    box.innerHTML = '';
    for (const job of JOBS.filter((j) => !j.legacy)) {
      const r = by[job.id] ?? { est: job.est, rivals: 0 }, cur = changing && changing.jobId === job.id;
      const b = document.createElement('button');
      b.className = `btn jcard${form.jobId === job.id ? ' on' : ''}`;
      b.dataset.k = 'jobId'; b.dataset.v = job.id;
      if (cur) b.disabled = true;
      const slot = Object.assign(document.createElement('span'), { className: 'slot' });
      const c = icon(job, 56);
      if (c) { fit(c, 34); slot.append(c); }
      if (r.short || r.match) slot.append(Object.assign(document.createElement('i'), { className: `tag ${r.short ? 'short' : 'match'}`, textContent: r.short ? tr('缺', 'Need') : tr('对口', 'Fit') }));
      b.append(slot, Object.assign(document.createElement('span'), { className: 'jt', innerHTML: `<b>${esc(jt(job, 'name').replace(/（.*）|\s*\(.*\)/, ''))}</b>${cur ? `<span class="dim">${tr('现在干的', 'Current')}</span>` : ''}` }));
      box.append(b);
    }
    const j = JOBS.find((x) => x.id === (hover ?? form.jobId)), d = q('.jdesc');
    if (!j) { d.innerHTML = `<div class="empty">${changing ? tr('挑一个新营生，点「改行」，他马上换过去。', 'Pick a new job and press "Change job" — they switch right away.') : tr('左边点一格，看看这一行干什么。<br><br>不选也行：他认完人，自己按"村里缺什么 + 自己会什么"挑一个。', 'Click a tile on the left to see what the job involves.<br><br>Or skip it: after meeting everyone they pick one based on what the village needs and what they can do.')}</div>`; return; }
    const r = by[j.id] ?? { est: j.est, rivals: 0 };
    d.innerHTML = `<div class="dh"><span class="slot big"></span><div><div class="dn">${esc(jt(j, 'name'))}</div>${r.rivals ? `<div class="dim">${EN ? `${r.rivals} already doing it` : `已有 ${r.rivals} 人在做`}</div>` : ''}<div class="tags">${r.short ? `<i class="tag short">${tr('村里正缺', 'Village needs it')}</i>` : ''}${r.match ? `<i class="tag match">${tr('和会的对口', 'Matches skills')}</i>` : ''}</div></div></div>
      <p>${esc(jt(j, 'desc'))}</p>
      <dl><dt>${tr('在哪儿干', 'Where')}</dt><dd>${esc(jt(j, 'where'))}</dd><dt>${tr('谁买', 'Buyers')}</dt><dd>${esc(jt(j, 'buyers'))}</dd><dt>${tr('要置办', 'Needs')}</dt><dd>${esc(jt(j, 'setup'))}</dd></dl>
      <div class="season"><span class="k">${tr('四季', 'Seasons')}</span>${seasonBar(j)}</div>`;
    const big = icon(j, 84);
    if (big) { fit(big, 50); d.querySelector('.slot.big').append(big); }
  };

  // ---------------------------------------------------------------- 我的居民
  const STATUS_CLS = { local: 'warn', queued: 'warn', pending: 'wait', stale: 'warn', rejected: 'warn', in: 'ok', changed: 'warn', editing: 'wait', leaving: 'off' };
  /** 退回的原因（后台回的是「中文\n\n英文」两段）：按界面语言取一段。 */
  const reason = (s) => { const parts = String(s ?? '').replace(/^[⚠️✅\s]+/, '').split(/\n\n/); return (EN ? parts[1] ?? parts[0] : parts[0]).trim(); };
  /**
   * 「我的居民」：一个浏览器只能有一个居民（让他离村以后才能再建）。像游戏里的角色页——
   *   有居民：大立绘、名字、现在走到哪一步（一句话说明）、勋章，常用的按钮一排，「离村」单独放在角上（先问一句）；
   *   没有：欢迎页，一个大的「创建新居民」，或者用邮箱登录找回。最底下一条是账号：绑定邮箱 / 用邮箱登录找回。
   * 建好以后创建的入口、步骤条都不再出现（create() 也挡着）。
   */
  const SLOTS = 1;
  let selId = null;
  const mineCards = () => {
    const box = q('.mcards'), list = residents();
    if (!list.some((r) => r.p.id === selId)) selId = list[0]?.p.id ?? null;
    box.innerHTML = '';
    const hub = document.createElement('div');
    hub.className = 'hub';
    // 这个人（或者欢迎页）
    const stage = document.createElement('div');
    stage.className = 'paper rstage';
    const r = list.find((x) => x.p.id === selId);
    if (!r) {
      stage.innerHTML = `<div class="welcome"><h3>${tr('在村里安个家', 'Make a home in the village')}</h3>
        <p>${tr('捏一个自己的居民，给他起名字、挑营生。他会从村口走进来，认人、找住处、开张做买卖，在大家共同的村子里过日子——关了网页也接着过。', 'Create your own villager, name them and pick a trade. They walk in from the bridge, meet everyone, find a home and start working in the shared village, and life goes on even when the page is closed.')}</p>
        <div class="acts"><button class="btn on big" data-act="new">${tr('创建新居民', 'Create a resident')}</button></div>
        <p class="dim">${tr('在别的电脑上建过？用底下的「用邮箱登录找回」。', 'Made residents on another computer? Use "Log in to recover" below.')}</p></div>`;
    } else {
      const { p, status, owner, row } = r, [st, why0] = STATUS[status];
      const why = status === 'rejected' ? `${reason(row?.result)} ${tr('改好了点「修改」保存，会自动再提交。', 'Fix it via Edit; saving resubmits automatically.')}` : why0;
      const main = ['local', 'stale', 'changed'].includes(status) ? tr('提交到村子', 'Submit to village') : status === 'queued' ? tr('再试一次', 'Retry') : null;
      const viaIssue = ['local', 'queued', 'stale'].includes(status); // 连不上村子的服务器：还可以走 GitHub
      const asking = leaveAsk === p.id;
      stage.innerHTML = `<div class="big-p"><div class="v"></div></div><div class="sinfo">
          <div class="sname"><b>${esc(pName(p))}</b>${pNick(p) && pNick(p) !== pName(p) ? `<span class="dim">${esc(pNick(p))}</span>` : ''}</div>
          <div class="dim">${esc(pJob(p))}${owner && !owner.startsWith('sb:') ? ` · GitHub @${esc(owner)}` : ''}</div>
          <div class="sstat"><span class="badge ${STATUS_CLS[status]}">${esc(st)}</span><span class="why">${esc(why)}</span></div>
          ${notes[p.id] ? `<div class="okmsg">${esc(notes[p.id])}</div>` : ''}
          ${r.badges ? `<div class="smedal"><span class="k">${tr('勋章', 'Medals')}</span><span class="bar"><i style="width:${Math.round((r.badges[0] / r.badges[1]) * 100)}%"></i></span><b>${r.badges[0]}/${r.badges[1]}</b></div>` : ''}
          <div class="acts main">${main ? `<button class="btn on" data-act="share">${main}</button>` : ''}<button class="btn${main ? '' : ' on'}" data-act="detail">${tr('详情：勋章、好感度', 'Details: medals, affinity')}</button><button class="btn" data-act="find">${tr('去村里找', 'Find in village')}</button></div>
          <div class="acts"><button class="btn" data-act="edit">${tr('修改样子和资料', 'Edit look & profile')}</button>${p.met ? `<button class="btn" data-act="job">${tr('改行', 'Change job')}</button>` : ''}${viaIssue ? `<button class="btn" data-act="issue">${tr('改用 GitHub 提交', 'Submit via GitHub')}</button>` : ''}</div>
          <div class="leave">${asking ? `<span class="ask">${status === 'local' ? tr('他还没提交过，删掉就没了。确定？', 'They were never submitted; this deletes them. Sure?') : tr('他会离开大家的村子（下次村子更新时），之后可以再建一个新居民。确定？', 'They will leave the shared village at the next update; then you can create a new resident. Sure?')}</span><button class="btn danger" data-act="leaveYes">${tr('让他走', 'Yes, leave')}</button><button class="btn" data-act="leaveNo">${tr('算了', 'Cancel')}</button>`
            : `<button class="btn danger small" data-act="leave">${tr('让他离村…', 'Leave village...')}</button>`}</div>
        </div>`;
      draw(stage.querySelector('.big-p .v'), p, 'front', 230);
      stage.dataset.id = p.id;
    }
    if (list.length > SLOTS) { // 旧版能建好几个：现在只能留一个，让玩家挑出多余的删掉
      const pick = document.createElement('div');
      pick.className = 'paper extra';
      pick.innerHTML = `<span class="dim">${tr(`这个浏览器上有 ${list.length} 个居民（以前建的），现在只能留一个。选中多余的，点右下角「让他离村」：`, `This browser has ${list.length} residents from before; only one is allowed now. Pick the extra one and use "Leave village":`)}</span>
        ${list.map((x) => `<button class="btn${x.p.id === selId ? ' on' : ''}" data-sel="${esc(x.p.id)}">${esc(pName(x.p))}</button>`).join('')}`;
      hub.append(pick);
    }
    hub.append(stage);
    box.append(hub, acctBox());
  };
  /**
   * 「我的居民」顶上的账号框：没绑邮箱时劝绑（换电脑、清了浏览器也能找回）；还有「用邮箱登录找回」（在别的电脑上建过）。
   * 不发验证邮件：邮箱 + 密码就是账号（account.bind / login，见 main.js 和 cloud.js）。
   */
  let acctMode = null, acctMsg = '', acctEmail = '';
  const acctBox = () => {
    const d = document.createElement('div');
    d.className = 'paper acct';
    const me = account?.who?.(), n = residents().length;
    const form = (act, label) => `<div class="af"><input class="in" type="email" data-af="email" value="${esc(acctEmail)}" placeholder="${tr('邮箱', 'Email')}" autocomplete="email"><input class="in" type="password" data-af="pw" placeholder="${tr('密码（至少 6 位）', 'Password (6+ characters)')}" autocomplete="${act === 'bind' ? 'new-password' : 'current-password'}"><button class="btn on" data-act="${act}">${label}</button><button class="btn" data-act="acctCancel">${tr('算了', 'Cancel')}</button></div>`;
    d.innerHTML = me?.email
      ? `<div class="al"><b>${tr('已绑定邮箱', 'Email linked')}</b> ${esc(me.email)} <span class="dim">${tr('换电脑或清了浏览器，用这个邮箱和密码登录就能找回居民。', 'On another computer, log in with this email and password to get your residents back.')}</span></div>`
      : acctMode === 'bind' ? `<div class="al"><b>${tr('绑定邮箱', 'Link an email')}</b> <span class="dim">${tr('以后换电脑或清了浏览器，用它登录就能找回居民。不会发邮件，记好密码（忘了找不回）。', 'Use it to get your residents back on another computer. No email is sent, so remember the password (it can\'t be reset).')}</span></div>${form('bind', tr('绑定', 'Link'))}`
      : acctMode === 'login' ? `<div class="al"><b>${tr('用邮箱登录找回', 'Log in to recover')}</b> <span class="dim">${n ? tr(`注意：这台电脑上现在的 ${n} 个居民没绑邮箱，登录别的账号以后就改不了它们了。`, `Note: the ${n} resident(s) on this computer aren't linked to an email; after logging in to another account you won't be able to edit them.`) : tr('输入在别的电脑上绑定的邮箱和密码。', 'Enter the email and password you linked on the other computer.')}</span></div>${form('login', tr('登录', 'Log in'))}`
      : `<div class="al"><span class="dim">${n ? tr('居民认的是这个浏览器：换电脑、清了浏览器就改不了了。', 'Your residents are tied to this browser; you\'d lose them on another computer.') : tr('在别的电脑上建过居民？', 'Made residents on another computer?')}</span>${n ? `<button class="btn on" data-act="acctBind">${tr('绑定邮箱', 'Link email')}</button>` : ''}<button class="btn" data-act="acctLogin">${tr('用邮箱登录找回', 'Log in to recover')}</button></div>`;
    if (acctMsg) d.insertAdjacentHTML('beforeend', `<div class="okmsg">${esc(acctMsg)}</div>`);
    return d;
  };
  const acctRun = (act, btn) => {
    const box = btn.closest('.acct'), email = box.querySelector('[data-af=email]').value.trim(), pw = box.querySelector('[data-af=pw]').value;
    acctEmail = email;
    if (!/^\S+@\S+\.\S+$/.test(email)) { acctMsg = tr('邮箱格式不对', 'That email doesn\'t look right'); sync(); return; }
    if (pw.length < 6) { acctMsg = tr('密码至少 6 位', 'Password needs at least 6 characters'); sync(); return; }
    acctMsg = tr('稍等……', 'One moment...'); btn.disabled = true;
    account[act](email, pw).then((r) => { acctMsg = r === 'ok' ? (act === 'bind' ? tr('绑好了。', 'Linked.') : tr('登录好了，正在找回居民……', 'Logged in, restoring residents...')) : r; if (r === 'ok') acctMode = null; if (!el.hidden) sync(); });
  };
  /** 走 GitHub 提交（连不上村子服务器时的后路）：打开填好资料的 Issue 页面。 */
  const viaGitHub = (kind, p) => { window.open(issueUrl(kind, p), '_blank', 'noopener'); markSent(kind, p); };
  /** 存到村子的服务器（main.js 的 share：存云端，连不上就排队等联网）。结果写在卡片 / 「进村了」页上。 */
  let notes = {}, doneState = null;
  const send = (p, leave = false) => {
    if (p === made) doneState = 'sending';
    notes[p.id] = tr('正在提交……', 'Submitting...');
    sync();
    return Promise.resolve(share?.(p, leave)).then((r) => {
      notes[p.id] = r === 'ok' || r === 'queued' ? '' : r || ''; // 提交上了 / 排队了：状态那一栏已经写着，不再重复
      if (p === made) doneState = r;
      if (!el.hidden) sync();
      return r;
    });
  };

  /** 「进村了」页：刚建的人已经自动提交到大家的村子（或者连不上、排队等联网）——说清楚现在是什么情况。 */
  const doneHTML = () => {
    const p = made;
    if (!p) return;
    draw(q('.donep .v'), p, 'front', 180);
    const st = doneState;
    q('.donebox').innerHTML = `<h3>${EN ? `${esc(pName(p))} has arrived!` : `${esc(p.name)} 进村了！`}</h3>
      <p>${tr('他正从村口的桥上走进来：先挨家认人，再自己找住处，第二天开张。', 'They\'re walking in over the bridge now: first meeting everyone, then finding a home, and starting work the next day.')}</p>
      <div class="note">${st === 'sending' ? `<b>${tr('正在提交到大家的村子……', 'Submitting to the shared village...')}</b>`
        : st === 'ok' ? `<b>${tr('已经提交到大家的村子。', 'Submitted to the shared village.')}</b>${tr('一般两三分钟他就从村口走进来，所有打开村子的人都看得见他（刷新网页看）。在这之前只有你看得见。以后在「我的居民」里改他、让他离村，存一下就自动提交（认的是这个浏览器，换电脑就改不了了）。', 'They usually walk in within a few minutes, and everyone who opens the village will see them (refresh the page). Until then only you can. Edit them or let them leave from "My residents"; saving submits automatically (tied to this browser, so you can\'t edit them from another computer).')}`
        : st === 'queued' ? `<b>${tr('没连上村子的服务器。', 'Couldn\'t reach the village server.')}</b>${tr('他已经存在这台电脑上，下次打开网页会自动再提交；也可以点「再试一次」，或者改用 GitHub 提交（要 GitHub 账号）。', 'They\'re saved on this computer and will be resubmitted next time you open the page. You can also retry now, or submit via GitHub (needs an account).')}`
        : `<b>${esc(st ?? '')}</b>`}</div>
      <div class="acts">${st === 'queued' ? `<button class="btn on" data-act="retryMade">${tr('再试一次', 'Retry')}</button><button class="btn" data-act="issueMade">${tr('改用 GitHub 提交', 'Submit via GitHub')}</button>` : ''}<button class="btn${st === 'queued' ? '' : ' on'}" data-act="watch">${tr('去看看他', 'Watch them')}</button><button class="btn" data-act="mine">${tr('我的居民', 'My residents')}</button></div>`;
  };

  const sync = () => {
    el.querySelectorAll('.chipbtn[data-k]').forEach((b) => { const cur = form[b.dataset.k]; b.classList.toggle('on', cur instanceof Set ? cur.has(b.dataset.v) : String(cur) === b.dataset.v); });
    el.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === page));
    el.querySelectorAll('[data-group]').forEach((b) => b.classList.toggle('on', Number(b.dataset.group) === group));
    for (const pg of ['mine', 'done', 'look', 'info', 'job']) q(`.${pg}-page`).hidden = page !== pg;
    const stepper = !changing && (page === 'look' || page === 'info' || page === 'job');
    q('.rhead .tabs').hidden = !stepper;
    q('.rhead .tohub').hidden = !stepper || (!editing && !residents().length); // 创建、修改时：回到「我的居民」（一个都没有就没得回）
    q('.rhead .s3').hidden = q('.rhead .l2').hidden = !!editing; // 修改：只有 ①②（营生走「改行」）
    const n = PAGES.indexOf(page);
    el.querySelectorAll('.step').forEach((b, i) => b.classList.toggle('done', i < n));
    q('.rhead .title').textContent = page === 'mine' ? tr('我的居民', 'My residents') : page === 'done' ? tr('进村了', 'Arrived') : changing ? (EN ? `New job for ${pName(changing)}` : `给${changing.name}改行`) : editing ? (EN ? `Edit ${pName(editing)}` : `修改${editing.name}`) : tr('创建居民', 'New resident');
    const foot = q('.foot');
    foot.hidden = page === 'mine' || page === 'done';
    q('.foot .create').textContent = changing ? tr('改行', 'Change job') : editing ? tr('保存修改', 'Save changes') : tr('进村', 'Move in');
    q('.foot .create').hidden = editing ? false : page !== 'job';
    q('.foot .fwd').hidden = page === 'job' || (editing && page === 'info');
    q('.foot .back').hidden = page === 'look' || !!changing;
    q('.foot .fwd').textContent = page === 'look' ? `${tr('下一步：填资料', 'Next: profile')} →` : `${tr('下一步：选营生', 'Next: work')} →`;
    q('.newonly .bring-h').hidden = q('.newonly .bring').hidden = q('.newonly .coin-h').hidden = q('.newonly .coin-f').hidden = !!editing; // 改的时候：本钱、带的东西不能改
    q('.hint').textContent = page === 'mine' ? (residents().length ? tr('你在村里的居民（一个浏览器一个）。改好会自动提交到大家的村子，两三分钟后生效。', 'Your resident in the village (one per browser). Edits are submitted to the shared village and apply within minutes.') : tr('你还没有自己的居民：建一个，他就住进大家的村子（一个浏览器一个）。', 'You have no resident yet. Create one to move into the shared village (one per browser).'))
      : page === 'done' ? ''
      : page === 'look' ? tr('先捏个样子：右边分组点选，也可以用人像底下的箭头一个个换；按住人拖动转着看，滚轮放大缩小', 'Shape their look: pick from the groups on the right, or step through with the arrows; drag to turn, scroll to zoom')
      : page === 'info' ? (editing ? tr('改好了点「保存修改」：这边马上换样子，也会自动提交到大家的村子', 'Press "Save changes": they change right away here and are submitted to the shared village') : tr('起个名字、说说会什么，再挑个住处', 'Give them a name, say what they can do'))
      : changing ? (EN ? `Currently: ${pJob(changing)}; earned ${changing.earned ?? 0} coins since starting` : `现在干的是${changing.job}；开张以来挣了 ${changing.earned ?? 0} 文`)
      : tr('挑个营生点「进村」：他从村口的桥上走进来，先挨家认人，第二天开张', 'Pick a job and press "Move in": they walk in over the bridge, meet everyone and start work the next day');
    q('.coinv').textContent = form.coins; q('.agev').textContent = form.age;
    const p = person();
    q('.info-page .who').innerHTML = `<b>${esc(p.name || tr('还没起名字', 'No name yet'))}</b><span>${EN ? `${p.age} · ${p.sex === '女' ? 'Female' : 'Male'}` : `${p.age} 岁 · ${p.sex}`}</span>`;
    if (!changing && (page === 'look' || page === 'info')) views();
    if (page === 'look') { partRows(); opts(); }
    if (page === 'job') jobCards();
    if (page === 'info') homeChips(); // 改了会什么、性格、喜好，看中的老宅跟着变
    if (page === 'mine') mineCards();
    if (page === 'done') doneHTML();
    for (const i of el.querySelectorAll('[data-f]')) if (i.type !== 'range' && document.activeElement !== i) i.value = form[i.dataset.f] ?? '';
  };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    const act = t.dataset.act, card = t.closest('.rstage'), r = card && residents().find((x) => x.p.id === card.dataset.id);
    if (t.dataset.sel) { selId = t.dataset.sel; leaveAsk = null; sync(); return; } // 左边点一个居民位：右边换成他
    if (act) {
      q('.foot .err').textContent = '';
      if (act === 'new') { api.create(); return; }
      if (act === 'acctBind' || act === 'acctLogin') { acctMode = act === 'acctBind' ? 'bind' : 'login'; acctMsg = ''; sync(); el.querySelector('.acct [data-af=email]')?.focus(); return; }
      if (act === 'acctCancel') { acctMode = null; acctMsg = ''; sync(); return; }
      if (act === 'bind' || act === 'login') { acctRun(act, t); return; }
      if (act === 'detail' && r) { api.close(); onDetail?.(r.p.id); return; }
      if (act === 'share' && r) { send(r.p); return; }
      if (act === 'issue' && r) { viaGitHub(r.inWorld ? 'edit' : 'join', r.p); notes[r.p.id] = tr('已打开 GitHub 提交页：在那边点「Submit new issue」。', 'GitHub opened: press "Submit new issue" there.'); sync(); return; }
      if (act === 'edit' && r) { api.edit(r.p); return; }
      if (act === 'job' && r) { api.close(); onChangeJob?.(r.p.id); return; }
      if (act === 'find' && r) { api.close(); onFind?.(r.p.id); return; }
      if (act === 'leave' && r) { leaveAsk = r.p.id; sync(); return; }
      if (act === 'leaveNo') { leaveAsk = null; sync(); return; }
      if (act === 'leaveYes' && r) { leaveAsk = null; if (r.status !== 'local') send(r.p, true); onLeave?.(r.p.id, r.status); sync(); if (!residents().length) api.close(); return; } // 没提交过的直接删；提交过的告诉村子他走了
      if (act === 'retryMade' && made) { send(made); return; }
      if (act === 'issueMade' && made) { viaGitHub('join', made); doneState = tr('已打开 GitHub 提交页：在那边点「Submit new issue」就行。', 'GitHub opened: press "Submit new issue" there.'); sync(); return; }
      if (act === 'watch') { api.close(); if (made) onFind?.(made.id); return; }
      if (act === 'mine') { if (made) selId = made.id; editing = null; changing = null; page = 'mine'; sync(); return; }
    }
    if (t.dataset.page) { page = t.dataset.page; sync(); return; }
    if (t.dataset.go) { page = PAGES[Math.max(0, Math.min(editing ? 1 : 2, PAGES.indexOf(page) + Number(t.dataset.go)))]; sync(); return; }
    if (t.dataset.group) { group = Number(t.dataset.group); part = GROUPS[group][2][0]; sync(); return; }
    if (t.dataset.pk) { part = t.dataset.pk; setValue(PARTS.find((x) => x.key === t.dataset.pk), t.dataset.pv); sync(); return; }
    if (t.dataset.step) { step(Number(t.dataset.step)); return; }
    if (t.classList.contains('random')) { for (const P of PARTS) if (P.key !== 'face' || form.sex === '男' || Math.random() < 0.5) setValue(P, P.list[Math.floor(Math.random() * P.list.length)][0]); if (form.sex === '女') { form.beard = form.mustache = false; } sync(); return; } // 随机：男女、年纪不动
    if (t.classList.contains('reset')) { Object.assign(form, editing ? formOf(editing) : { ...LOOK0, ...(form.sex === '女' ? { hair: 'bun', style: 'side' } : {}) }); sync(); return; }
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
    if (['name', 'nick', 'more', 'bio', 'likes'].includes(i.dataset.f)) { const p = person(); q('.info-page .who b').textContent = p.name || tr('还没起名字', 'No name yet'); homeChips(); q('.foot .err').textContent = ''; return; } // 打字时不重画立绘（看中的老宅跟着变）
    sync();
  }));
  q('.close').addEventListener('click', () => api.close());
  q('.jcards').addEventListener('pointerover', (e) => { const b = e.target.closest('.jcard'); if (b && b.dataset.v !== hover) { hover = b.dataset.v; jobCards(); } });
  q('.jcards').addEventListener('pointerleave', () => { if (hover !== null) { hover = null; jobCards(); } });
  /** 名字：要填、不能和村里的人重名（改自己的时候不算自己）。 */
  const nameError = (p) => {
    if (!p.name) return tr('先起个名字', 'Give them a name first');
    if (RESIDENTS.some((o) => o.name === p.name && o.id !== editing?.id)) return tr('村里已经有叫这个名字的了', 'Someone in the village already has that name');
    return '';
  };
  q('.create').addEventListener('click', () => {
    if (changing) { if (!form.jobId) { q('.foot .err').textContent = tr('先挑一个', 'Pick one first'); return; } onChangeJob?.(changing.id, form.jobId); api.close(); return; }
    const p = person();
    const bad = nameError(p);
    if (bad) { page = 'info'; sync(); q('.foot .err').textContent = bad; q('[data-f=name]').focus(); return; }
    q('.foot .err').textContent = '';
    if (editing) { // 只改样子和资料：本钱、带的东西、营生不动；存好自动提交到村子
      const { coins, goods, jobId, jobPicked, ...look } = p;
      const who = editing;
      onEdit?.(who.id, look);
      editing = null; page = 'mine';
      send(who);
      return;
    }
    made = onCreate(p) ?? p;
    form = FORM0();
    page = 'done';
    send(made); // 进村就提交到大家的村子
  });
  addEventListener('keydown', (e) => { if (!el.hidden && e.key === 'Escape' && !e.target.closest?.('input, textarea')) api.close(); });

  const open = () => { el.hidden = false; document.body.classList.add('roster-open'); };
  const api = {
    get open() { return !el.hidden; },
    /** 改行：p 是档案里那个人（name、job、jobId、earned、外观）。 */
    changeJob(p) { changing = p; editing = null; form.jobId = ''; page = 'job'; sync(); open(); },
    /** 改样子、资料：p 是村里那个人。 */
    edit(p) { changing = null; editing = p; form = formOf(p); group = 0; part = 'build'; page = 'look'; sync(); open(); },
    /** 新建一个（which：直接到哪一页 / 哪一样，截图检查用）。 */
    create(which = 'look') { if (residents().length) { api.mine(); return; } // 已经有自己的居民了：一个浏览器只能有一个
      changing = null; editing = null; if (made) { form = FORM0(); made = null; } if (PARTS.some((x) => x.key === which)) { group = Math.max(0, GROUPS.findIndex(([, , ks]) => ks.includes(which))); part = which; which = 'look'; } page = which; sync(); open(); },
    /** 左下角按钮：有自己的人先看「我的居民」，一个都没有直接新建。 */
    show(which) { if (which) { api.create(which); return; } changing = null; editing = null; leaveAsk = null; page = 'mine'; sync(); open(); }, // 一个都没有也先到「我的居民」：有「新建」那一格，也能用邮箱登录找回
    mine() { changing = null; editing = null; page = 'mine'; sync(); open(); },
    close() { el.hidden = true; document.body.classList.remove('roster-open'); if (editing) editing = null; },
  };
  return api;
}

export { HOUSEHOLDS };
