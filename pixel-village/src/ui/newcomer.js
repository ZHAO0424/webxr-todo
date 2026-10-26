import { RESIDENTS, HOUSEHOLDS } from '../residents.js';
import { previewCanvas, BUILDS, HAIRS } from '../characters.js';
import { JOBS, JOB_CATS, rankJobs } from '../life/newcomers.js';
import { GOODS } from '../life/economy.js';

/*
 * 「创建居民」：页面里的横板大卡，分两页——
 *   ① 捏人：左边一个大的正面像，底下一对 ◀ ▶ 箭头换当前这一类；右边男女、年纪，和一排"换哪一样"的按钮（身材、头发、发色、帽子、衣裳、样式、裤子、肤色、脸面、绑腿、配饰），
 *      点哪个按钮，箭头就换哪一样（同一套箭头）
 *   ② 资料：村里缺人（特意留的空缺 + 最近老买不着的东西）、名字、会什么、性格、本钱、带的东西、来历、住哪儿
 *      住哪儿：让他自己找 / 借住在哪一家（看那家几口人）/ 老村址的一处老宅
 *   ③ 营生：分类的卡片（拿着家伙的小人、一天约挣几文、正缺 / 对口 / 几人在做），点一张就定；也可以「先不定」
 * 点「进村」，他从村口的桥上走进来，先挨家认人，再按选的营生开张（life/newcomers.js）。
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

export function createNewcomerPanel(el, { onCreate, onChangeJob, econ, homes, plots = () => [] }) {
  el.className = 'panel px';
  el.id = 'newcomer';
  el.hidden = true;
  const form = { jobId: '', name: '', nick: '', age: 30, sex: '男', skills: new Set(), more: '', traits: new Set(), bio: '', likes: '', coins: 80, bring: new Set(['grain']), home: '',
    build: '', hair: 'short', hairRamp: 'hair', hat: '', top: 'indigo', style: '', pants: 'black', skin: 'skin', extra: '', beard: false, mustache: false, blush: false, smile: false, legwrap: false };
  let page = 'look', part = 'build', cat = JOB_CATS[0], changing = null; // changing：改行的那个人（档案里点「改行」）

  const chips = (key, list) => list.map(([v, t]) => `<button class="btn chipbtn" data-k="${key}" data-v="${esc(v)}">${esc(t)}</button>`).join('');
  el.innerHTML = `<div class="rhead"><span class="title">创建居民</span>
      <span class="tabs"><button class="btn" data-page="look">① 捏人</button><button class="btn" data-page="info">② 资料</button><button class="btn" data-page="job">③ 营生</button></span>
      <span class="hint"></span><button class="btn close" title="关闭（Esc）">×</button></div>
    <div class="nbody look-page">
      <div class="paper box stagebox">
        <div class="views"><div class="v" data-view="front"></div></div>
        <div class="arrows"><button class="btn arr" data-step="-1">←</button><span class="cur"><b class="pn"></b><span class="pv"></span><i class="pi"></i></span><button class="btn arr" data-step="1">→</button></div>
      </div>
      <div class="paper box partbox">
        <div class="lbl">男女</div><div class="seg">${chips('sex', [['男', '男'], ['女', '女']])}</div>
        <div class="lbl">年纪 <b class="agev">30</b> 岁</div><input class="in wide" data-f="age" type="range" min="16" max="80" value="30">
        <div class="lbl">换哪一样（点一个，再用左边的箭头换）</div>
        <div class="ptabs">${PARTS.map((q) => `<button class="btn ptab" data-part="${q.key}"><span>${q.name}</span><i></i></button>`).join('')}</div>
        <div class="go"><button class="btn on next">下一步：填资料 →</button></div>
      </div>
    </div>
    <div class="nbody info-page" hidden>
      <div class="ncol">
        <div class="paper box">
          <div class="row2"><label>名字<input class="in" data-f="name" maxlength="6" placeholder="比如 胡二根"></label><label>村里怎么叫<input class="in" data-f="nick" maxlength="6" placeholder="比如 胡磨倌"></label></div>
          <div class="lbl">会什么（可多选，也可以自己写）</div><div class="chips">${chips('skills', SKILLS.map((s) => [s, s]))}</div>
          <input class="in wide" data-f="more" placeholder="自己写，用顿号隔开，比如 做豆腐、剃头">
          <div class="lbl">性格（挑两三个）</div><div class="chips small">${chips('traits', TRAITS.map((s) => [s, s]))}</div>
          <div class="lbl">带着什么来</div><div class="chips">${chips('bring', BRING.map(([g, q]) => [g, `${GOODS[g].name} ${q}${GOODS[g].unit}`]))}</div>
          <div class="row2"><label>喜欢<input class="in" data-f="likes" maxlength="16" placeholder="比如 听戏、喝两口"></label></div>
          <textarea class="in wide" data-f="bio" maxlength="80" rows="2" placeholder="一两句来历（可以不填），比如 山外胡家庄人，家里的磨坊叫水冲了，出来找营生"></textarea>
        </div>
      </div>
      <div class="ncol">
        <div class="paper box mini"><div class="pv"></div><div class="who"></div></div>
        <div class="paper box">
          <div class="lbl">住哪儿</div><div class="chips homes"></div>
          <div class="lbl">本钱：<b class="coinv">80</b> 文</div><input class="in wide" data-f="coins" type="range" min="0" max="200" step="10" value="80">
          <div class="go"><span class="err"></span><button class="btn back">← 回去改长相</button><button class="btn on tojob">下一步：选营生 →</button></div>
        </div>
      </div>
    </div>
    <div class="nbody job-page" hidden>
      <div class="paper box jobbox">
        <div class="jhead"><span class="jcats"></span><button class="btn chipbtn undecided" data-k="jobId" data-v="">先不定，到村里看看再说</button></div>
        <div class="jcards"></div>
        <div class="jdesc"></div>
        <div class="go"><span class="err"></span><button class="btn toinfo">← 回去改资料</button><button class="btn on create">进村</button></div>
      </div>
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
  const views = () => { const p = person(); draw(q('.views .v'), p, 'front', 8); draw(q('.mini .pv'), p, 'front', 3); };
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
    q('.cur .pn').textContent = P.name; q('.cur .pv').textContent = P.list[i][1]; q('.cur .pi').textContent = `${i + 1} / ${P.list.length}`;
    el.querySelectorAll('.ptab').forEach((b) => { const Q = PARTS.find((x) => x.key === b.dataset.part); b.querySelector('i').textContent = Q.list.find(([v]) => v === valueOf(Q))?.[1] ?? Q.list[0][1]; });
  };
  const step = (d) => { const P = PARTS.find((x) => x.key === part), i = Math.max(0, P.list.findIndex(([v]) => v === valueOf(P))); setValue(P, P.list[(i + d + P.list.length) % P.list.length][0]); sync(); };
  const homeChips = () => {
    const list = homes();
    const old = plots();
    q('.homes').innerHTML = [`<button class="btn chipbtn" data-k="home" data-v="">让他自己找</button>`, ...list.map((h) => `<button class="btn chipbtn" data-k="home" data-v="${esc(h.id)}">借住${esc(h.name)}（${h.n} 口人）</button>`)].join('')
      + `<div class="lbl sub">老村址的空房子（往东，大水以后没人住的老宅：住进去不交房钱，攒够石灰、条石和柴就能请葛石头帮着修）</div>`
      + old.map((h) => `<button class="btn chipbtn" data-k="home" data-v="${esc(h.id)}"${h.taken ? ' disabled' : ''} title="${esc(h.story)}">${esc(h.name)}（${h.taken ? `${esc(h.taken)}住着` : esc(h.state)}）</button>`).join('');
  };
  /** ③ 营生：这一类的卡片——拿着家伙的小人、名字、一天约挣几文、正缺 / 对口 / 几人在做；点一张就定，下面写详细。 */
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
      const pv = document.createElement('span');
      pv.className = 'thumb';
      draw(pv, { ...(changing ?? person()), item: job.item ?? undefined, hat: job.hat ?? (changing ?? person()).hat }, 'front', 3, true);
      b.append(pv, Object.assign(document.createElement('span'), { className: 'jt', innerHTML: `<span class="l1"><b>${esc(job.name)}</b>${r.short ? '<i class="tag short">正缺</i>' : ''}${r.match ? '<i class="tag match">对口</i>' : ''}</span><span class="dim">${cur ? '现在干的' : `一天约 ${r.est} 文${r.rivals ? ` · 已有 ${r.rivals} 人` : ''}`}</span>` }));
      box.append(b);
    }
    const j = JOBS.find((x) => x.id === form.jobId);
    q('.jdesc').innerHTML = j ? `<b>${esc(j.name)}</b>：${esc(j.desc)}<div class="dim">在哪儿干：${esc(j.where)}　谁买：${esc(j.buyers)}　要置办：${esc(j.setup)}</div><div class="dim">一年四季都能干，季节只影响收成：${['spring', 'summer', 'autumn', 'winter'].map((s, i) => `${'春夏秋冬'[i]}${j.season[s] >= 1.2 ? '旺' : j.season[s] <= 0.6 ? '淡' : '平'}`).join(' ')}</div>`
      : `<span class="dim">${changing ? '挑一个新营生，点「改行」，他马上换过去。' : '没选的话，他认完人自己按"村里缺什么 + 自己会什么"挑一个。'}</span>`;
  };
  const sync = () => {
    el.querySelectorAll('.chipbtn[data-k]').forEach((b) => { const cur = form[b.dataset.k]; b.classList.toggle('on', cur instanceof Set ? cur.has(b.dataset.v) : String(cur) === b.dataset.v); });
    el.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === page));
    el.querySelectorAll('[data-part]').forEach((b) => b.classList.toggle('on', b.dataset.part === part));
    q('.look-page').hidden = page !== 'look'; q('.info-page').hidden = page !== 'info'; q('.job-page').hidden = page !== 'job';
    el.querySelector('.rhead .tabs').hidden = !!changing;
    q('.rhead .title').textContent = changing ? `给${changing.name}改行` : '创建居民';
    q('.job-page .create').textContent = changing ? '改行' : '进村';
    q('.job-page .toinfo').hidden = !!changing;
    q('.rhead .hint').textContent = page === 'look' ? '先捏个样子：右边点要换的那一样，左边的箭头一下下换' : page === 'info' ? '填好资料，下一步选营生' : changing ? `现在干的是${changing.job}；开张以来挣了 ${changing.earned ?? 0} 文` : '挑个营生点「进村」：他从村口的桥上走进来，先挨家认人，第二天开张';
    q('.coinv').textContent = form.coins; q('.agev').textContent = form.age;
    const p = person();
    q('.mini .who').innerHTML = `<b>${esc(p.name || '（还没起名字）')}</b><span>${p.age}岁 · ${p.sex}</span>`;
    if (!changing) views();
    if (page === 'look') opts();
    if (page === 'job') jobCards();
  };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.dataset.page) { page = t.dataset.page; if (page === 'info') homeChips(); sync(); return; }
    if (t.dataset.cat) { cat = t.dataset.cat; sync(); return; }
    if (t.classList.contains('tojob')) { page = 'job'; sync(); return; }
    if (t.classList.contains('toinfo')) { page = 'info'; homeChips(); sync(); return; }
    if (t.dataset.part) { part = t.dataset.part; sync(); return; }
    if (t.dataset.step) { step(Number(t.dataset.step)); return; }
    if (t.classList.contains('next')) { page = 'info'; homeChips(); sync(); return; }
    if (t.classList.contains('back')) { page = 'look'; sync(); return; }
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
    if (['name', 'more', 'bio', 'likes'].includes(i.dataset.f)) { const p = person(); q('.mini .who b').textContent = p.name || '（还没起名字）'; return; } // 打字时不重画缩略图
    sync();
  }));
  q('.close').addEventListener('click', () => api.close());
  q('.create').addEventListener('click', () => {
    if (changing) { if (!form.jobId) { q('.job-page .err').textContent = '先挑一个'; return; } onChangeJob?.(changing.id, form.jobId); api.close(); return; }
    const p = person();
    const err = (m) => { page = 'info'; sync(); q('.info-page .err').textContent = m; };
    if (!p.name) { err('先起个名字'); return; }
    if (RESIDENTS.some((o) => o.name === p.name)) { err('村里已经有叫这个名字的了'); return; }
    q('.info-page .err').textContent = '';
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
