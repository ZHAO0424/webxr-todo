import { RESIDENTS, HOUSEHOLDS } from '../residents.js';
import { previewCanvas, itemCanvas, BUILDS, HAIRS } from '../characters.js';
import { JOBS, JOB_CATS, rankJobs } from '../life/newcomers.js';
import { GOODS } from '../life/economy.js';

/*
 * 「创建居民」：屏幕当中一张游戏里那样的弹窗（后面的沙盘压暗），顶上一条 ①②③ 的步骤条，分三页——
 *   ① 捏人：左边一个竖着的立绘框（人站在地上），一对大箭头夹在立绘两边，立绘下面一块木牌写着正在换哪一样、现在是什么、第几个；
 *      右边「基本」（男女、年纪）和「外观」一格格按钮（身材、头发、发色、帽子、衣裳、样式、裤子、肤色、脸面、绑腿、配饰，格子上写着现在选的），
 *      点哪一格，两边的箭头就换哪一样（同一套箭头）
 *   ② 资料：左边还是立绘框（小一点）和名牌；中间名字、会什么、性格、喜欢、来历；右边住哪儿、带什么来、本钱
 *      住哪儿：让他自己找 / 借住在哪一家（看那家几口人）/ 老村址的一处老宅
 *   ③ 营生：左边一格格营生（像背包格子：每格画着这一行的家伙，下面名字、一天约挣几文，正缺 / 对口的角上标出来），
 *      右边详细（大图标、干什么、在哪儿干、谁买、要置办、四季旺淡）；也可以「先不定」
 * 底下一条底栏：上一步 / 下一步 / 进村。点「进村」，他从村口的桥上走进来，先挨家认人，再按选的营生开张（life/newcomers.js）。
 * 档案里点「改行」也打开第 ③ 页（changeJob），只换营生。
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SKILLS = ['种地', '种菜', '钓鱼', '木工', '泥瓦', '力气大', '挑担', '做饭', '烙饼', '磨面', '裁缝', '针线', '杀猪', '打猎', '采山货', '烧炭', '带孩子', '识字', '算账', '说书', '选种', '赶牲口'];
const TRAITS = [...new Set(RESIDENTS.flatMap((p) => p.traits))].slice(0, 36);
const COLORS = [['indigo', '靛蓝'], ['blue', '蓝'], ['black', '黑'], ['grey', '灰'], ['white', '白'], ['brown', '褐'], ['khaki', '土黄'], ['mud', '赭'], ['russet', '红褐'], ['green', '绿'], ['red', '红'], ['pink', '粉']];
/** 捏人的各类选项：[字段, 值, 名字]。toggle：开关（再点一下取消）。 */
const PARTS = [
  { key: 'build', name: '身材', list: [['', '匀称'], ...Object.entries(BUILDS).map(([k, b]) => [k, b.name])] },
  { key: 'hair', name: '头发', list: Object.entries(HAIRS) },
  { key: 'hairRamp', name: '发色', list: [['hair', '乌黑'], ['brown', '棕黑'], ['khaki', '焦黄'], ['grey', '花白'], ['white', '银白']] },
  { key: 'hat', name: '帽子', list: [['', '不戴'], ['skullcap', '瓜皮帽'], ['towel', '羊肚手巾'], ['felt', '毡帽'], ['scarf', '头巾'], ['straw', '草帽'], ['furcap', '棉帽'], ['douli', '斗笠'], ['veil', '蜂纱帽']] },
  { key: 'top', name: '衣裳', list: COLORS },
  { key: 'style', name: '样式', list: [['', '短褂'], ['side', '大襟'], ['vest', '坎肩'], ['gown', '长衫']] },
  { key: 'pants', name: '裤子', list: COLORS.filter(([c]) => !['pink', 'red', 'white'].includes(c)) },
  { key: 'skin', name: '肤色', list: [['skin', '白净'], ['skinTan', '黝黑']] },
  { key: 'face', name: '脸面', list: [['', '平常'], ['beard', '山羊胡'], ['mustache', '八字胡'], ['blush', '红脸蛋'], ['smile', '笑模样']] },
  { key: 'legwrap', name: '绑腿', list: [['', '不打'], ['1', '打绑腿']] },
  { key: 'extra', name: '配饰', list: [['', '不系'], ['apron:indigo', '蓝围裙'], ['apron:black', '黑围裙'], ['apron:grey', '白围裙'], ['sash:red', '红腰带'], ['sash:black', '黑腰带'], ['sash:indigo', '蓝腰带']] },
];
const BRING = [['grain', 10], ['flour', 5], ['cloth', 10], ['wood', 5]];
const PAGES = ['look', 'info', 'job'];

export function createNewcomerPanel(el, { onCreate, onChangeJob, econ, homes, plots = () => [] }) {
  el.className = 'panel px';
  el.id = 'newcomer';
  el.hidden = true;
  const LOOK0 = { build: '', hair: 'short', hairRamp: 'hair', hat: '', top: 'indigo', style: '', pants: 'black', skin: 'skin', extra: '', beard: false, mustache: false, blush: false, smile: false, legwrap: false };
  const form = { jobId: '', name: '', nick: '', age: 30, sex: '男', skills: new Set(), more: '', traits: new Set(), bio: '', likes: '', coins: 80, bring: new Set(['grain']), home: '', ...LOOK0 };
  let page = 'look', part = 'build', cat = JOB_CATS[0], changing = null, hover = null; // changing：改行的那个人（档案里点「改行」）；hover：鼠标停在哪一格营生上（右边先给看详细）

  const chips = (key, list) => list.map(([v, t]) => `<button class="btn chipbtn" data-k="${key}" data-v="${esc(v)}">${esc(t)}</button>`).join('');
  const portrait = (cls) => `<div class="portrait ${cls}"><div class="v"></div></div>`;
  el.innerHTML = `<div class="rhead"><span class="title">创建居民</span>
      <span class="tabs"><button class="btn step" data-page="look"><b>1</b>捏人</button><i class="link"></i><button class="btn step" data-page="info"><b>2</b>资料</button><i class="link"></i><button class="btn step" data-page="job"><b>3</b>营生</button></span>
      <button class="btn close" title="关闭（Esc）">×</button></div>
    <div class="hint"></div>
    <div class="nbody look-page">
      <div class="pcol">
        <div class="stagebox">
          <button class="btn arr" data-step="-1" title="上一个">←</button>
          ${portrait('big')}
          <button class="btn arr" data-step="1" title="下一个">→</button>
        </div>
        <div class="plaque"><span class="pn"></span><b class="pv"></b><span class="pi"></span></div>
      </div>
      <div class="paper box partbox">
        <h3>基本</h3>
        <div class="field"><span class="k">男女</span><div class="seg">${chips('sex', [['男', '男'], ['女', '女']])}</div></div>
        <div class="field"><span class="k">年纪</span><input class="in" data-f="age" type="range" min="16" max="80" value="30"><span class="val"><b class="agev">30</b> 岁</span></div>
        <h3>外观<small>点一格，再用立绘两边的箭头换</small></h3>
        <div class="ptabs">${PARTS.map((q) => `<button class="btn ptab" data-part="${q.key}"><span>${q.name}</span><i></i></button>`).join('')}</div>
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
        <h3>住哪儿</h3><div class="chips homes"></div>
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
      hair: f.hair, hairRamp: f.hairRamp === 'hair' ? undefined : f.hairRamp, hat: f.hat || undefined, top: f.top, style: f.style || undefined, pants: f.pants, skin: f.skin,
      beard: f.beard || undefined, mustache: f.mustache || undefined, blush: f.blush || undefined, smile: f.smile || undefined, legwrap: f.legwrap || undefined,
      apron: ek === 'apron' ? ev : undefined, sash: ek === 'sash' ? ev : undefined,
      coins: f.coins, goods: Object.fromEntries(BRING.filter(([g]) => f.bring.has(g))), home: f.home || undefined,
      jobId: f.jobId || undefined, jobPicked: !!f.jobId || undefined,
    };
  };
  const draw = (box, p, view, k, withItem = false) => { try { const c = previewCanvas(p, view, 1, withItem); c.style.width = `calc(${24 * k} * var(--f))`; box.replaceChildren(c); } catch { box.textContent = ''; } };
  const views = () => { const p = person(); draw(q('.portrait.big .v'), p, 'front', 7); draw(q('.portrait.small .v'), p, 'front', 5); };
  /** 一类现在选的是第几个（脸面是几样里挑一样：山羊胡、八字胡……）。 */
  const valueOf = (P) => P.key === 'face' ? (['beard', 'mustache', 'blush', 'smile'].find((k) => form[k]) ?? '') : P.key === 'legwrap' ? (form.legwrap ? '1' : '') : String(form[P.key]);
  const setValue = (P, v) => {
    if (P.key === 'face') for (const k of ['beard', 'mustache', 'blush', 'smile']) form[k] = k === v;
    else if (P.key === 'legwrap') form.legwrap = !!v;
    else form[P.key] = v;
  };
  /** 箭头下面写着：换的是哪一样、现在是什么、第几个；右边每个按钮上也写着现在选的是什么。 */
  const opts = () => {
    const P = PARTS.find((x) => x.key === part), i = Math.max(0, P.list.findIndex(([v]) => v === valueOf(P)));
    q('.plaque .pn').textContent = P.name; q('.plaque .pv').textContent = P.list[i][1]; q('.plaque .pi').textContent = `${i + 1} / ${P.list.length}`;
    el.querySelectorAll('.ptab').forEach((b) => { const Q = PARTS.find((x) => x.key === b.dataset.part); b.querySelector('i').textContent = Q.list.find(([v]) => v === valueOf(Q))?.[1] ?? Q.list[0][1]; });
  };
  const step = (d) => { const P = PARTS.find((x) => x.key === part), i = Math.max(0, P.list.findIndex(([v]) => v === valueOf(P))); setValue(P, P.list[(i + d + P.list.length) % P.list.length][0]); sync(); };
  const homeChips = () => {
    const list = homes();
    const old = plots();
    q('.homes').innerHTML = [`<button class="btn chipbtn" data-k="home" data-v="">让他自己找</button>`, ...list.map((h) => `<button class="btn chipbtn" data-k="home" data-v="${esc(h.id)}">借住${esc(h.name)}（${h.n} 口人）</button>`)].join('')
      + `<div class="sub">老村址的空房子：往东，大水以后没人住的老宅。住进去不交房钱，攒够石灰、条石和柴就能请葛石头帮着修</div>`
      + old.map((h) => `<button class="btn chipbtn" data-k="home" data-v="${esc(h.id)}"${h.taken ? ' disabled' : ''} title="${esc(h.story)}">${esc(h.name)}（${h.taken ? `${esc(h.taken)}住着` : esc(h.state)}）</button>`).join('');
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
      if (c) slot.append(c);
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
    if (big) d.querySelector('.slot.big').append(big);
  };
  const sync = () => {
    el.querySelectorAll('.chipbtn[data-k]').forEach((b) => { const cur = form[b.dataset.k]; b.classList.toggle('on', cur instanceof Set ? cur.has(b.dataset.v) : String(cur) === b.dataset.v); });
    el.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === page));
    el.querySelectorAll('[data-part]').forEach((b) => b.classList.toggle('on', b.dataset.part === part));
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
    q('.hint').textContent = page === 'look' ? '先捏个样子：右边点要换的那一样，立绘两边的箭头一下下换' : page === 'info' ? '起个名字、说说会什么，再挑个住处' : changing ? `现在干的是${changing.job}；开张以来挣了 ${changing.earned ?? 0} 文` : '挑个营生点「进村」：他从村口的桥上走进来，先挨家认人，第二天开张';
    q('.coinv').textContent = form.coins; q('.agev').textContent = form.age;
    const p = person();
    q('.info-page .who').innerHTML = `<b>${esc(p.name || '还没起名字')}</b><span>${p.age} 岁 · ${p.sex}</span>`;
    if (!changing) views();
    if (page === 'look') opts();
    if (page === 'job') jobCards();
  };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.dataset.page) { page = t.dataset.page; if (page === 'info') homeChips(); sync(); return; }
    if (t.dataset.cat) { cat = t.dataset.cat; sync(); return; }
    if (t.dataset.go) { page = PAGES[Math.max(0, Math.min(2, PAGES.indexOf(page) + Number(t.dataset.go)))]; if (page === 'info') homeChips(); sync(); return; }
    if (t.dataset.part) { part = t.dataset.part; sync(); return; }
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
    if (['name', 'more', 'bio', 'likes'].includes(i.dataset.f)) { const p = person(); q('.info-page .who b').textContent = p.name || '还没起名字'; return; } // 打字时不重画立绘
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
    show(which = 'look') { changing = null; if (PARTS.some((x) => x.key === which)) { part = which; which = 'look'; } page = which; if (page === 'info') homeChips(); if (page === 'job') { const c = JOBS.find((j) => j.id === form.jobId)?.cat; if (c) cat = c; } sync(); el.hidden = false; document.body.classList.add('roster-open'); },
    close() { el.hidden = true; document.body.classList.remove('roster-open'); },
  };
  return api;
}

export { HOUSEHOLDS };
