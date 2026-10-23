import { VILLAGE, HOUSEHOLDS, RESIDENTS, friendsOf } from '../residents.js';
import { characterAtlas, CELL_W, CELL_H } from '../characters.js';
import { animalAtlas } from '../animals.js';
import { portrait, headCrop } from './frame.js';
import { planHTML } from './cards.js';

/*
 * 村民档案：村子页面里的一张横板大卡（四边留一点，和屏幕一样的比例），不跳新页面。版式参考星露谷的村民关系页、牧场物语的村民资料页：
 *   列表：一格一格的人物卡铺满整面（宽屏 5 列 × 6 行正好 30 人）：全身像 | 名字、身份、哪家、此刻在干什么、性格、喜欢；上面一排筛选；
 *   详情：点了人才显示，横着三栏都用框填满——
 *         立绘台（全身像 + 名牌）、身份、此刻 | 来历、性格 / 喜欢 / 手艺 / 家当四格、今日安排 | 家人好友（头像 + 关系 + 此刻在干什么）、这一家（院子、介绍、牲口）。
 *         右上角上一个 / 下一个（← →）在当前筛选出来的人里翻。
 * status(id) 给出这个人此刻的状态（和村子里点人看到的同一份），beasts(home) 给出这家的牲口，onFind(id) = 关掉档案、在村里选中并跟着这个人。
 */

const BYID = Object.fromEntries(RESIDENTS.map((p) => [p.id, p]));
const HOUSE = Object.fromEntries(HOUSEHOLDS.map((h) => [h.id, h]));
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

/** 全身像，一个像素 = k 个字点。 */
function body(p, k) {
  const c = portrait(characterAtlas(p), 0, 0, CELL_W, CELL_H, 1);
  c.style.width = `calc(${CELL_W * k} * var(--f))`;
  return c;
}
function head(p, k) {
  const c = headCrop(characterAtlas(p), CELL_W, CELL_H, 14, 14);
  c.style.width = `calc(${14 * k} * var(--f))`;
  return c;
}
const nowHTML = (s) => `<span class="dot ${s?.kind ?? 'sleep'}"></span><span class="what">${esc(s?.doing ?? '')}</span>${s?.where ? `<span class="loc"><i class="pin"></i>${esc(s.where)}</span>` : ''}`;

export function createRoster(el, { status, beasts, onFind, onClose }) {
  el.className = 'panel px';
  el.id = 'roster';
  el.hidden = true;
  el.innerHTML = `<div class="rhead">
      <span class="title">${esc(VILLAGE.name)} · 村民档案</span>
      <span class="chip soft">${HOUSEHOLDS.length} 户</span><span class="chip soft">${RESIDENTS.length} 口人</span>
      <span class="filters">${Object.keys(FILTERS).map((k, i) => `<button class="btn${i ? '' : ' on'}" data-f="${k}">${k}</button>`).join('')}</span>
      <span class="nav" hidden><button class="btn prev" title="←">上一个</button><button class="btn next" title="→">下一个</button><button class="btn back">返回列表</button></span>
      <button class="btn close" title="关闭（Esc）">×</button>
    </div>
    <div class="rbody"><div class="rlist"></div><div class="rdetail" hidden></div></div>`;
  const list = el.querySelector('.rlist'), detail = el.querySelector('.rdetail'), nav = el.querySelector('.nav'), filters = el.querySelector('.filters');
  let cur = null, lastCur = -2, order = RESIDENTS.map((p) => p.id);

  // 列表：每人一张横的小卡
  for (const p of RESIDENTS) {
    const t = document.createElement('div');
    t.className = 'paper tile';
    t.dataset.id = p.id;
    t.innerHTML = `<div class="stage"></div><div class="txt">
        <div class="l1"><span class="nm">${esc(p.name)}</span><span class="nk">${esc(p.nick)}</span><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(p.household.replace(/（.*）/, ''))}</span></div>
        <div class="jb">${esc(p.job)} · ${p.age}岁</div>
        <div class="now"></div>
        <div class="tr">${p.traits.slice(0, 3).map((x) => `<span class="chip" style="--c:var(--c-plum)">${esc(x)}</span>`).join('')}</div>
        <div class="lk"><b>喜欢</b>${esc(p.likes)}</div>
      </div>`;
    t.querySelector('.stage').append(body(p, 2));
    t.addEventListener('click', () => openPerson(p.id));
    list.append(t);
  }

  filters.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    filters.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    const f = FILTERS[b.dataset.f];
    order = [];
    for (const t of list.children) { const on = f(BYID[t.dataset.id]); t.hidden = !on; if (on) order.push(t.dataset.id); }
    refresh();
  }));

  function showList() {
    cur = null;
    detail.hidden = true; list.hidden = false; nav.hidden = true; filters.hidden = false;
    refresh();
  }

  function openPerson(id) {
    const p = BYID[id];
    if (!p) return;
    cur = p; lastCur = -2;
    const friends = friendsOf(p.id).map((i) => BYID[i]).filter(Boolean);
    const family = RESIDENTS.filter((o) => o.home === p.home && o.id !== p.id);
    const h = HOUSE[p.home];
    const rel = (o, tag, color) => `<div class="rel" data-id="${o.id}"><span class="hd"></span><span class="t"><span class="l1"><span class="nm">${esc(o.name)}</span><span class="nk">${esc(o.nick)}</span><span class="chip" style="--c:${color}">${tag}</span></span><span class="rr">${esc(tag === '家人' ? o.relation : o.job)}</span><span class="now"></span></span></div>`;
    detail.innerHTML = `<div class="col c1">
        <div class="stage big"><div class="plate"><span class="nm">${esc(p.name)}</span><span class="nk">${esc(p.nick)}</span></div></div>
        <div class="chips"><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(p.job)}</span><span class="chip soft">${p.age}岁 · ${p.sex}</span><span class="chip soft">${esc(p.relation)}</span></div>
        <div class="paper box nowbox"><div class="lbl">此刻</div><div class="now"></div><div class="next"></div></div>
        <button class="btn find">去村里找</button>
      </div>
      <div class="col c2">
        <div class="paper box bio"><div class="lbl">来历</div><p>${esc(p.bio)}</p></div>
        <div class="quad">
          <div class="paper box"><div class="lbl">性格</div>${p.traits.map((t) => `<span class="chip" style="--c:var(--c-plum)">${esc(t)}</span>`).join('')}</div>
          <div class="paper box"><div class="lbl">喜欢</div>${esc(p.likes)}</div>
          <div class="paper box"><div class="lbl">手艺</div>${esc(p.skills.join('、'))}</div>
          <div class="paper box"><div class="lbl">家当</div>${esc(p.owns.length ? p.owns.join('、') : '——')}</div>
        </div>
        <div class="paper box planbox"><div class="lbl">今日安排<span class="count">${p.day.length} 项</span></div><ul class="plan"></ul></div>
      </div>
      <div class="col c3">
        <div class="paper box rels"><div class="lbl">家人 · 好友<span class="count">${family.length + friends.length}</span></div>
          <div class="relgrid">${family.map((o) => rel(o, '家人', 'var(--c-craft)')).join('')}${friends.map((o) => rel(o, '好友', 'var(--c-child)')).join('')}</div></div>
        <div class="paper box home"><div class="lbl">${esc(h?.name ?? p.household)}<span class="count">${esc(h?.kind ?? '')}</span></div>
          <p>${esc(h?.note ?? '')}</p><div class="pets"></div></div>
      </div>`;
    detail.querySelector('.stage').prepend(body(p, 6));
    detail.querySelectorAll('.rel').forEach((r) => { r.querySelector('.hd').append(head(BYID[r.dataset.id], 3)); r.addEventListener('click', () => openPerson(r.dataset.id)); });
    const pets = detail.querySelector('.pets'), animals = beasts?.(p.home) ?? [];
    for (const b of animals) {
      const a = animalAtlas(b.kind), c = portrait(a.canvas, 0, 0, a.cellW, a.cellH, 1);
      c.style.width = `calc(${a.cellW * 2} * var(--f))`;
      const s = document.createElement('span');
      s.className = 'pet';
      s.innerHTML = `<span class="ic"></span><span class="t"><span class="nm">${esc(b.name)}</span><span class="kd">${esc(b.kindName ?? '')}</span><br><span class="ab">${esc(b.about ?? '')}</span></span>`;
      s.querySelector('.ic').append(c);
      pets.append(s);
    }
    if (!animals.length) pets.remove();
    detail.querySelector('.find').addEventListener('click', () => { const pid = p.id; close(); onFind?.(pid); });
    list.hidden = true; detail.hidden = false; nav.hidden = false; filters.hidden = true;
    refresh();
  }

  const step = (d) => { if (!cur) return; const ids = order.includes(cur.id) ? order : RESIDENTS.map((o) => o.id); openPerson(ids[(ids.indexOf(cur.id) + d + ids.length) % ids.length]); };
  nav.querySelector('.prev').addEventListener('click', () => step(-1));
  nav.querySelector('.next').addEventListener('click', () => step(1));

  /** 此刻：列表每张卡一行，详情里加下一项和安排高亮。村里每过一分钟刷一次。 */
  function refresh() {
    if (el.hidden) return;
    if (!cur) {
      for (const t of list.children) if (!t.hidden) t.querySelector('.now').innerHTML = nowHTML(status(t.dataset.id));
      return;
    }
    const s = status(cur.id);
    if (!s) return;
    detail.querySelector('.nowbox .now').innerHTML = nowHTML(s);
    for (const r of detail.querySelectorAll('.rel')) r.querySelector('.now').innerHTML = nowHTML(status(r.dataset.id)); // 家人好友此刻在干什么
    detail.querySelector('.next').textContent = s.nextText ?? '';
    if (s.cur !== lastCur) { // 安排换了一项才重画
      lastCur = s.cur;
      const plan = detail.querySelector('.plan');
      plan.innerHTML = planHTML(cur.day, s.cur);
      plan.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
    }
  }

  function close() { el.hidden = true; document.body.classList.remove('roster-open'); onClose?.(); }
  nav.querySelector('.back').addEventListener('click', showList);
  el.querySelector('.close').addEventListener('click', close);
  addEventListener('keydown', (e) => { // 档案开着时 ← → 翻人，不换场景
    if (el.hidden) return;
    if (e.key === 'Escape') { if (cur) showList(); else close(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.stopImmediatePropagation(); if (cur) step(e.key === 'ArrowLeft' ? -1 : 1); }
  }, true);

  return {
    get open() { return !el.hidden; },
    show(id) { el.hidden = false; document.body.classList.add('roster-open'); if (id && BYID[id]) openPerson(id); else showList(); },
    close,
    refresh,
  };
}
