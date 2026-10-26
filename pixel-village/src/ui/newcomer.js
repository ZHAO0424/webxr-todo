import { RESIDENTS, HOUSEHOLDS } from '../residents.js';
import { previewCanvas, BUILDS, HAIRS } from '../characters.js';
import { JOBS } from '../life/newcomers.js';
import { GOODS } from '../life/economy.js';

/*
 * 「创建居民」：页面里的横板大卡，分两页——
 *   ① 捏人：左边大预览（正面 / 侧面 / 背面），男女、年纪；右边一类类挑：身材、头发、发色、帽子、衣裳、样式、裤子、肤色、脸面、配饰，
 *      每个选项是一个小人缩略图（换上这一样的样子），点了马上换
 *   ② 资料：村里缺人（特意留的空缺 + 最近老买不着的东西）、名字、会什么、性格、本钱、带的东西、来历、住哪儿
 *      住哪儿：让他自己找 / 借住在哪一家（看那家几口人）；"空房子"先占个位，以后加了空房子就能选
 * 点「进村」，他从村口的桥上走进来，先挨家认人，再自己挑行当（life/newcomers.js）。
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SKILLS = ['磨面', '做饭', '烙饼', '蒸馍', '裁缝', '针线', '编筐', '砍柴', '种菜', '种地', '挑担', '力气大', '木工', '打铁', '算账', '赶牲口'];
const TRAITS = [...new Set(RESIDENTS.flatMap((p) => p.traits))].slice(0, 36);
const COLORS = [['indigo', '靛蓝'], ['blue', '蓝'], ['black', '黑'], ['grey', '灰'], ['white', '白'], ['brown', '褐'], ['khaki', '土黄'], ['mud', '赭'], ['russet', '红褐'], ['green', '绿'], ['red', '红'], ['pink', '粉']];
/** 捏人的各类选项：[字段, 值, 名字]。toggle：开关（再点一下取消）。 */
const PARTS = [
  { key: 'build', name: '身材', list: [['', '匀称'], ...Object.entries(BUILDS).map(([k, b]) => [k, b.name])] },
  { key: 'hair', name: '头发', list: Object.entries(HAIRS) },
  { key: 'hairRamp', name: '发色', list: [['hair', '乌黑'], ['brown', '棕黑'], ['khaki', '焦黄'], ['grey', '花白'], ['white', '银白']] },
  { key: 'hat', name: '帽子', list: [['', '不戴'], ['skullcap', '瓜皮帽'], ['towel', '羊肚手巾'], ['felt', '毡帽'], ['scarf', '头巾'], ['straw', '草帽'], ['furcap', '棉帽'], ['douli', '斗笠']] },
  { key: 'top', name: '衣裳', list: COLORS },
  { key: 'style', name: '样式', list: [['', '短褂'], ['side', '大襟'], ['vest', '坎肩'], ['gown', '长衫']] },
  { key: 'pants', name: '裤子', list: COLORS.filter(([c]) => !['pink', 'red', 'white'].includes(c)) },
  { key: 'skin', name: '肤色', list: [['skin', '白净'], ['skinTan', '黝黑']] },
  { key: 'face', name: '脸面', toggles: [['beard', '山羊胡'], ['mustache', '八字胡'], ['blush', '红脸蛋'], ['smile', '笑模样'], ['legwrap', '打绑腿']] },
  { key: 'extra', name: '配饰', list: [['', '不系'], ['apron:indigo', '蓝围裙'], ['apron:black', '黑围裙'], ['apron:grey', '白围裙'], ['sash:red', '红腰带'], ['sash:black', '黑腰带'], ['sash:indigo', '蓝腰带']] },
];
const BRING = [['grain', 10], ['flour', 5], ['cloth', 10], ['wood', 5]];

export function createNewcomerPanel(el, { onCreate, econ, homes, plots = () => [] }) {
  el.className = 'panel px';
  el.id = 'newcomer';
  el.hidden = true;
  const form = { name: '', nick: '', age: 30, sex: '男', skills: new Set(), more: '', traits: new Set(), bio: '', likes: '', coins: 80, bring: new Set(['grain']), home: '',
    build: '', hair: 'short', hairRamp: 'hair', hat: '', top: 'indigo', style: '', pants: 'black', skin: 'skin', extra: '', beard: false, mustache: false, blush: false, smile: false, legwrap: false };
  let page = 'look', part = 'build';

  const chips = (key, list) => list.map(([v, t]) => `<button class="btn chipbtn" data-k="${key}" data-v="${esc(v)}">${esc(t)}</button>`).join('');
  el.innerHTML = `<div class="rhead"><span class="title">创建居民</span>
      <span class="tabs"><button class="btn" data-page="look">① 捏人</button><button class="btn" data-page="info">② 资料</button></span>
      <span class="hint"></span><button class="btn close" title="关闭（Esc）">×</button></div>
    <div class="nbody look-page">
      <div class="paper box stagebox">
        <div class="views"><div class="v" data-view="front"></div><div class="v" data-view="side"></div><div class="v" data-view="back"></div></div>
        <div class="row2"><label>男女<span class="seg">${chips('sex', [['男', '男'], ['女', '女']])}</span></label><label>年纪 <b class="agev">30</b> 岁<input class="in" data-f="age" type="range" min="16" max="80" value="30"></label></div>
      </div>
      <div class="paper box partbox">
        <div class="ptabs">${PARTS.map((q) => `<button class="btn" data-part="${q.key}">${q.name}</button>`).join('')}</div>
        <div class="opts"></div>
        <div class="go"><button class="btn on next">下一步：填资料 →</button></div>
      </div>
    </div>
    <div class="nbody info-page" hidden>
      <div class="ncol">
        <div class="paper box vac"><div class="lbl">村里缺人</div><div class="vacs"></div></div>
        <div class="paper box">
          <div class="row2"><label>名字<input class="in" data-f="name" maxlength="6" placeholder="比如 胡二根"></label><label>村里怎么叫<input class="in" data-f="nick" maxlength="6" placeholder="比如 胡磨倌"></label></div>
          <div class="lbl">会什么（可多选，也可以自己写）</div><div class="chips">${chips('skills', SKILLS.map((s) => [s, s]))}</div>
          <input class="in wide" data-f="more" placeholder="自己写，用顿号隔开，比如 做豆腐、剃头">
          <div class="lbl">性格（挑两三个）</div><div class="chips small">${chips('traits', TRAITS.map((s) => [s, s]))}</div>
        </div>
      </div>
      <div class="ncol">
        <div class="paper box mini"><div class="pv"></div><div class="who"></div></div>
        <div class="paper box">
          <div class="lbl">住哪儿</div><div class="chips homes"></div>
          <div class="lbl">本钱：<b class="coinv">80</b> 文</div><input class="in wide" data-f="coins" type="range" min="0" max="200" step="10" value="80">
          <div class="lbl">带着什么来</div><div class="chips">${chips('bring', BRING.map(([g, q]) => [g, `${GOODS[g].name} ${q}${GOODS[g].unit}`]))}</div>
          <div class="row2"><label>喜欢<input class="in" data-f="likes" maxlength="16" placeholder="比如 听戏、喝两口"></label></div>
          <textarea class="in wide" data-f="bio" maxlength="80" rows="2" placeholder="一两句来历（可以不填），比如 山外胡家庄人，家里的磨坊叫水冲了，出来找营生"></textarea>
          <div class="go"><span class="err"></span><button class="btn back">← 回去改长相</button><button class="btn on create">进村</button></div>
        </div>
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
    };
  };
  const draw = (box, p, view, k) => { try { const c = previewCanvas(p, view, 1); c.style.width = `calc(${24 * k} * var(--f))`; box.replaceChildren(c); } catch { box.textContent = ''; } };
  const views = () => { const p = person(); el.querySelectorAll('.views .v').forEach((v) => draw(v, p, v.dataset.view, 5)); draw(q('.mini .pv'), p, 'front', 3); };
  /** 当前这一类的选项：每个都是"换上这一样"的小人。 */
  const opts = () => {
    const P = PARTS.find((x) => x.key === part), box = q('.opts');
    box.innerHTML = '';
    const items = P.toggles ? P.toggles.map(([k, t]) => ({ over: { [k]: !form[k] }, on: !!form[k], k, v: '1', t })) : P.list.map(([v, t]) => ({ over: { [P.key]: v }, on: String(form[P.key]) === v, k: P.key, v, t }));
    for (const it of items) {
      const b = document.createElement('button');
      b.className = `btn opt${it.on ? ' on' : ''}`;
      b.dataset.k = it.k; b.dataset.v = it.v; b.dataset.toggle = P.toggles ? '1' : '';
      const pv = document.createElement('span');
      pv.className = 'thumb';
      draw(pv, person(P.toggles ? { [it.k]: true } : it.over), part === 'hair' || part === 'hairRamp' || part === 'hat' || part === 'face' ? 'front' : 'front', 2);
      b.append(pv, Object.assign(document.createElement('span'), { className: 'ot', textContent: it.t }));
      box.append(b);
    }
  };
  const homeChips = () => {
    const list = homes();
    const old = plots();
    q('.homes').innerHTML = [`<button class="btn chipbtn" data-k="home" data-v="">让他自己找</button>`, ...list.map((h) => `<button class="btn chipbtn" data-k="home" data-v="${esc(h.id)}">借住${esc(h.name)}（${h.n} 口人）</button>`)].join('')
      + `<div class="lbl sub">老村址的空房子（往东，大水以后没人住的老宅：住进去不交房钱，攒够石灰、条石和柴就能请葛石头帮着修）</div>`
      + old.map((h) => `<button class="btn chipbtn" data-k="home" data-v="${esc(h.id)}"${h.taken ? ' disabled' : ''} title="${esc(h.story)}">${esc(h.name)}（${h.taken ? `${esc(h.taken)}住着` : esc(h.state)}）</button>`).join('');
  };
  const vacancies = () => {
    const E = econ(), miss = E?.missing ?? {}, rows = JOBS.filter((j) => j.vacancy).map((j) => {
      const taken = [...(E?.units.values() ?? [])].some((u) => u.made[j.makes] > 0);
      return `<div class="vrow${taken ? ' taken' : ''}"><b>${esc(j.name)}</b><span>${taken ? '已经有人做了' : esc(j.note)}</span><span class="dim">会：${esc(j.keys.slice(0, 3).join('、'))}</span></div>`;
    });
    const top = Object.entries(miss).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => GOODS[g]?.name).filter(Boolean);
    q('.vacs').innerHTML = rows.join('') + (top.length ? `<div class="vrow"><b>常缺</b><span>${esc(top.join('、'))}（最近老有人想买没买着）</span></div>` : '');
  };
  const sync = () => {
    el.querySelectorAll('.chipbtn[data-k]').forEach((b) => { const cur = form[b.dataset.k]; b.classList.toggle('on', cur instanceof Set ? cur.has(b.dataset.v) : String(cur) === b.dataset.v); });
    el.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === page));
    el.querySelectorAll('[data-part]').forEach((b) => b.classList.toggle('on', b.dataset.part === part));
    q('.look-page').hidden = page !== 'look'; q('.info-page').hidden = page !== 'info';
    q('.rhead .hint').textContent = page === 'look' ? '先捏个样子：点右边的选项，左边马上换' : '填好了点「进村」：他从村口的桥上走进来，先借住、挨家认人，再自己挑一个行当';
    q('.coinv').textContent = form.coins; q('.agev').textContent = form.age;
    const p = person();
    q('.mini .who').innerHTML = `<b>${esc(p.name || '（还没起名字）')}</b><span>${p.age}岁 · ${p.sex}</span>`;
    views();
    if (page === 'look') opts();
  };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.dataset.page) { page = t.dataset.page; if (page === 'info') { vacancies(); homeChips(); } sync(); return; }
    if (t.dataset.part) { part = t.dataset.part; sync(); return; }
    if (t.classList.contains('next')) { page = 'info'; vacancies(); homeChips(); sync(); return; }
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
    const p = person();
    if (!p.name) { q('.err').textContent = '先起个名字'; return; }
    if (RESIDENTS.some((o) => o.name === p.name)) { q('.err').textContent = '村里已经有叫这个名字的了'; return; }
    q('.err').textContent = '';
    onCreate(p);
    api.close();
  });

  const api = {
    get open() { return !el.hidden; },
    show(which = 'look') { if (PARTS.some((x) => x.key === which)) { part = which; which = 'look'; } page = which; if (page === 'info') { vacancies(); homeChips(); } sync(); el.hidden = false; document.body.classList.add('roster-open'); },
    close() { el.hidden = true; document.body.classList.remove('roster-open'); },
  };
  return api;
}

export { HOUSEHOLDS };
