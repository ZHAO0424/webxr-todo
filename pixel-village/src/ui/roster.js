import { VILLAGE, HOUSEHOLDS, RESIDENTS, friendsOf } from '../residents.js';
import { characterAtlas, CELL_W, CELL_H } from '../characters.js';
import { portrait, headCrop } from './frame.js';
import { planHTML } from './cards.js';

/*
 * 村民档案：村子页面里的一张横板大卡（四边留一点，和屏幕一样的比例），不跳新页面。
 *   列表：按户分块，每人一行（头像 + 名字 + 身份），上面一排筛选；
 *   详情：点了人才显示，横着分三栏——头像、身份、此刻 | 来历、性格、手艺、亲友 | 今天的安排。
 * status(id) 给出这个人此刻的状态（和村子里点人看到的同一份），onFind(id) = 关掉档案、在村里选中并跟着他。
 */

const BYID = Object.fromEntries(RESIDENTS.map((p) => [p.id, p]));
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const JOB_COLOR = (p) => (p.body === 'child' ? 'var(--c-child)' : /匠|郎中|掌柜|剃头|货郎|先生|伙计|徒弟|豆腐/.test(p.job) ? 'var(--c-craft)' : /村长/.test(p.job) ? 'var(--c-chief)' : 'var(--c-farm)');

const FILTERS = {
  全部: () => true,
  大人: (p) => p.body !== 'child' && p.age < 60,
  老人: (p) => p.age >= 60,
  孩子: (p) => p.body === 'child',
  手艺人: (p) => /匠|郎中|掌柜|剃头|货郎|伙计|徒弟|豆腐/.test(p.job),
  种地的: (p) => /种地|庄稼|羊倌|喂|农/.test(p.job + p.skills.join()),
  外来的: (p) => p.relation.includes('外村') || p.relation.includes('寄住') || p.relation.includes('住铺里'),
};

function face(p, w, h) {
  const c = headCrop(characterAtlas(p), CELL_W, CELL_H, w, h);
  c.style.width = `calc(${w * 2} * var(--f))`;
  return c;
}

export function createRoster(el, { status, onFind, onClose }) {
  el.className = 'panel px';
  el.id = 'roster';
  el.hidden = true;
  el.innerHTML = `<div class="rhead">
      <span class="title">${esc(VILLAGE.name)} · 村民档案</span>
      <span class="chip soft">${HOUSEHOLDS.length} 户</span><span class="chip soft">${RESIDENTS.length} 口人</span>
      <span class="filters">${Object.keys(FILTERS).map((k, i) => `<button class="btn${i ? '' : ' on'}" data-f="${k}">${k}</button>`).join('')}</span>
      <button class="btn back" hidden>← 返回</button>
      <button class="btn close" title="关闭（Esc）">×</button>
    </div>
    <div class="rbody"><div class="rlist"></div><div class="rdetail" hidden></div></div>`;
  const list = el.querySelector('.rlist'), detail = el.querySelector('.rdetail'), back = el.querySelector('.back'), filters = el.querySelector('.filters');
  let cur = null, lastCur = -2;

  for (const h of HOUSEHOLDS) {
    const sec = document.createElement('div');
    sec.className = 'paper house';
    sec.innerHTML = `<div class="hname">${esc(h.name)}<span class="kind">${esc(h.kind)}</span></div>`;
    for (const p0 of h.people) {
      const p = BYID[p0.id];
      const row = document.createElement('div');
      row.className = 'who';
      row.dataset.id = p.id;
      row.innerHTML = `<span class="f"></span><span class="t"><span class="nm">${esc(p.name)}</span><span class="nk">${esc(p.nick)}</span><br><span class="jb">${esc(p.job)} · ${p.age}岁</span></span><span class="dot"></span>`;
      row.querySelector('.f').append(face(p, 14, 14));
      row.addEventListener('click', () => openPerson(p.id));
      sec.append(row);
    }
    list.append(sec);
  }

  filters.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    filters.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    const f = FILTERS[b.dataset.f];
    for (const sec of list.children) {
      let any = false;
      for (const r of sec.querySelectorAll('.who')) { const on = f(BYID[r.dataset.id]); r.hidden = !on; any ||= on; }
      sec.hidden = !any;
    }
  }));

  function showList() {
    cur = null;
    detail.hidden = true; list.hidden = false; back.hidden = true; filters.hidden = false;
    refresh();
  }

  function openPerson(id) {
    const p = BYID[id];
    if (!p) return;
    cur = p; lastCur = -2;
    const friends = friendsOf(p.id).map((i) => BYID[i]).filter(Boolean);
    const family = RESIDENTS.filter((o) => o.home === p.home && o.id !== p.id);
    const chips = (l, color) => l.map((o) => `<span class="chip link" style="--c:${color}" data-id="${o.id}">${esc(o.name)}<span style="opacity:.8">·${esc(o.nick)}</span></span>`).join('');
    detail.innerHTML = `<div class="col c1">
        <div class="face big"></div>
        <div class="name">${esc(p.name)}<span class="nick">${esc(p.nick)}</span></div>
        <div><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(p.job)}</span><span class="chip soft">${p.age}岁 · ${p.sex}</span><span class="chip soft">${esc(p.household)}</span><span class="chip soft">${esc(p.relation)}</span></div>
        <div class="paper now"><span class="dot"></span><span class="doing"></span></div>
        <div class="next"></div>
        <button class="btn find">去村里找</button>
      </div>
      <div class="col c2">
        <p>${esc(p.bio)}</p>
        <div class="row"><b>性格</b>${p.traits.map((t) => `<span class="chip" style="--c:var(--c-plum)">${esc(t)}</span>`).join('')}</div>
        <div class="row"><b>喜欢</b>${esc(p.likes)}</div>
        <div class="row"><b>手艺</b>${esc(p.skills.join('、'))}</div>
        ${p.owns.length ? `<div class="row"><b>家当</b>${esc(p.owns.join('、'))}</div>` : ''}
        ${family.length ? `<div class="row"><b>家人</b>${chips(family, 'var(--c-craft)')}</div>` : ''}
        ${friends.length ? `<div class="row"><b>好友</b>${chips(friends, 'var(--c-child)')}</div>` : ''}
      </div>
      <div class="col c3"><div class="row"><b>今日安排</b></div><ul class="plan"></ul></div>`;
    const big = portrait(characterAtlas(p), 0, 0, CELL_W, CELL_H, 1);
    big.style.width = `calc(${CELL_W * 3} * var(--f))`;
    detail.querySelector('.face').append(big);
    detail.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => openPerson(c.dataset.id)));
    detail.querySelector('.find').addEventListener('click', () => { const id = p.id; close(); onFind?.(id); });
    list.hidden = true; detail.hidden = false; back.hidden = false; filters.hidden = true;
    refresh();
  }

  /** 此刻：列表里每人一个小圆点（干活 / 歇着 / 睡了 / 赶活动），详情里是完整的一行。村里每过一分钟刷一次。 */
  function refresh() {
    if (el.hidden) return;
    if (!cur) {
      for (const r of list.querySelectorAll('.who')) { const s = status(r.dataset.id); r.querySelector('.dot').className = `dot ${s?.kind ?? 'sleep'}`; r.title = s ? `${s.doing}${s.where ? ' · ' + s.where : ''}` : ''; }
      return;
    }
    const s = status(cur.id);
    if (!s) return;
    detail.querySelector('.doing').innerHTML = `<span class="what">${esc(s.doing)}</span>` + (s.where ? `<span class="loc"><i class="pin"></i>${esc(s.where)}</span>` : '');
    detail.querySelector('.now .dot').className = `dot ${s.kind ?? ''}`;
    detail.querySelector('.next').textContent = s.nextText ?? '';
    if (s.cur !== lastCur) {
      lastCur = s.cur;
      const plan = detail.querySelector('.plan');
      plan.innerHTML = planHTML(cur.day, s.cur);
      plan.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
    }
  }

  function close() { el.hidden = true; document.body.classList.remove('roster-open'); onClose?.(); }
  back.addEventListener('click', showList);
  el.querySelector('.close').addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { if (cur) showList(); else close(); } });

  return {
    get open() { return !el.hidden; },
    show(id) { el.hidden = false; document.body.classList.add('roster-open'); if (id && BYID[id]) openPerson(id); else showList(); },
    close,
    refresh,
  };
}
