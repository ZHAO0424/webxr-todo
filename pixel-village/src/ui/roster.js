import { VILLAGE, HOUSEHOLDS, RESIDENTS, friendsOf } from '../residents.js';
import { characterAtlas, CELL_W, CELL_H } from '../characters.js';
import { animalAtlas } from '../animals.js';
import { portrait, headCrop } from './frame.js';
import { planHTML } from './cards.js';

/*
 * 村民档案：村子页面里的一张横板大卡（四边留一点，和屏幕一样的比例），不跳新页面。版式参考星露谷的村民关系页、牧场物语的村民资料页：
 *   地图（默认）：真实场景从正上方看下去的截图（main.js 渲染一次），左上角是地名；每户一列头像（右边小字名字、职业）竖排在自家院子上，
 *         挤在一起的推开、用虚线连回院子；右边是点中的人（默认第一个）的小卡和详细资料；
 *   卡片：一格一格的人物卡铺满整面（宽屏 5 列 × 6 行正好 30 人）：全身像 | 名字、身份、哪家、此刻在干什么、性格、喜欢；上面一排筛选；
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

export function createRoster(el, { status, beasts, onFind, onClose, map }) {
  el.className = 'panel px';
  el.id = 'roster';
  el.hidden = true;
  el.innerHTML = `<div class="rhead">
      <span class="title">${esc(VILLAGE.name)} · 村民档案</span>
      <span class="chip soft">${HOUSEHOLDS.length} 户</span><span class="chip soft">${RESIDENTS.length} 口人</span>
      <span class="tabs"><button class="btn on" data-v="map">地图</button><button class="btn" data-v="list">卡片</button></span>
      <span class="filters">${Object.keys(FILTERS).map((k, i) => `<button class="btn${i ? '' : ' on'}" data-f="${k}">${k}</button>`).join('')}</span>
      <span class="nav" hidden><button class="btn prev" title="←">上一个</button><button class="btn next" title="→">下一个</button><button class="btn back">返回</button></span>
      <button class="btn close" title="关闭（Esc）">×</button>
    </div>
    <div class="rbody"><div class="rmap"><div class="mapwrap"></div><div class="mapside"></div></div><div class="rlist" hidden></div><div class="rdetail" hidden></div></div>`;
  const list = el.querySelector('.rlist'), detail = el.querySelector('.rdetail'), nav = el.querySelector('.nav'), filters = el.querySelector('.filters'), tabs = el.querySelector('.tabs');
  const rmap = el.querySelector('.rmap'), wrap = el.querySelector('.mapwrap'), side = el.querySelector('.mapside');
  let cur = null, lastCur = -2, order = RESIDENTS.map((p) => p.id), view = 'map', filter = FILTERS.全部, picked = null;

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
    filter = f;
    order = [];
    for (const t of list.children) { const on = f(BYID[t.dataset.id]); t.hidden = !on; if (on) order.push(t.dataset.id); }
    refresh();
    if (view === 'map') { sideHTML(); layout(); }
  }));

  // ---------------------------------------------------------------- 地图：真实场景的俯视截图，每户一块小牌子（户名 + 这家人的头像和名字）标在自家院子上
  const B = map?.bounds, groups = [], markers = {};
  const svgNS = 'http://www.w3.org/2000/svg';
  const lines = document.createElementNS(svgNS, 'svg');
  lines.classList.add('leaders');
  if (map) {
    const title = document.createElement('div');
    title.className = 'maptitle';
    title.innerHTML = `${esc(VILLAGE.name)}<span>${HOUSEHOLDS.length} 户 · ${RESIDENTS.length} 口人</span>`;
    wrap.append(lines, title);
    for (const h of HOUSEHOLDS) {
      const at = map.homeAt(h.id);
      if (!at) continue;
      const g = document.createElement('div');
      g.className = 'hh';
      g.innerHTML = '<div class="ms"></div>';
      const ms = g.querySelector('.ms');
      for (const p0 of h.people) {
        const p = BYID[p0.id];
        const m = document.createElement('div');
        m.className = 'mk';
        m.dataset.id = p.id;
        m.style.setProperty('--jc', JOB_COLOR(p));
        m.innerHTML = `<span class="hd"></span><span class="t"><span class="nm">${esc(p.name)}</span><span class="jb">${esc(p.job)}</span></span>`;
        m.querySelector('.hd').append(head(p, 2));
        m.addEventListener('click', (e) => { e.stopPropagation(); pick(p.id); });
        ms.append(m);
        markers[p.id] = m;
      }
      const pin = document.createElement('span');
      pin.className = 'home-pin';
      wrap.append(pin, g);
      groups.push({ h, el: g, pin, x0: at[0], z0: at[1], x: 0, y: 0 });
    }
    addEventListener('resize', () => layout());
  }
  let drawn = false;

  /** 摆牌子：先放在自家院子正中，挤在一起的按矩形往两边推开；推远了的用一根细线连回院子。 */
  function layout() {
    if (!map || el.hidden || view !== 'map' || cur) return;
    if (!drawn) {
      const img = map.image();
      if (!img) return;
      drawn = true;
      wrap.prepend(img);
      wrap.style.aspectRatio = `${img.width} / ${img.height}`;
    }
    const W = wrap.clientWidth || 1, H = wrap.clientHeight || 1, gap = 4;
    lines.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const live = groups.filter((g) => {
      let any = false;
      for (const m of g.el.querySelectorAll('.mk')) { const on = filter(BYID[m.dataset.id]); m.hidden = !on; any ||= on; }
      g.el.hidden = g.pin.hidden = !any;
      return any;
    });
    for (const g of live) {
      g.hx = ((g.x0 - B.x0) / (B.x1 - B.x0)) * W; g.hy = ((g.z0 - B.z0) / (B.z1 - B.z0)) * H;
      g.x = g.hx; g.y = g.hy; g.w = g.el.offsetWidth; g.hgt = g.el.offsetHeight;
    }
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
        const P = live[a], Q = live[b];
        const ox = (P.w + Q.w) / 2 + gap - Math.abs(Q.x - P.x), oy = (P.hgt + Q.hgt) / 2 + gap - Math.abs(Q.y - P.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) { const s = (Q.x >= P.x ? 1 : -1) * ox / 2; P.x -= s; Q.x += s; } else { const s = (Q.y >= P.y ? 1 : -1) * oy / 2; P.y -= s; Q.y += s; }
      }
      for (const g of live) { g.x = Math.max(g.w / 2, Math.min(W - g.w / 2, g.x)); g.y = Math.max(g.hgt / 2, Math.min(H - g.hgt / 2, g.y)); }
      if (!moved) break;
    }
    let svg = '';
    for (const g of live) {
      g.el.style.left = `${g.x}px`; g.el.style.top = `${g.y}px`;
      g.pin.style.left = `${g.hx}px`; g.pin.style.top = `${g.hy}px`;
      if (Math.hypot(g.x - g.hx, g.y - g.hy) > Math.min(g.w, g.hgt) / 2) svg += `<line x1="${g.hx}" y1="${g.hy}" x2="${g.x}" y2="${g.y}"/>`;
    }
    lines.innerHTML = svg;
    for (const [id, m] of Object.entries(markers)) m.classList.toggle('on', id === picked);
  }

  /** 地图右边：上面是点中的人的小卡（头像、身份、此刻、下一项、去村里找 / 看大图），下面是他的详细资料（来历、性格喜好手艺家当、家人好友、今日安排）。 */
  function pick(id) { picked = id ?? picked; sideHTML(); for (const [k, m] of Object.entries(markers)) m.classList.toggle('on', k === picked); }
  function sideHTML() {
    if (!map) return;
    const p = BYID[picked] ?? RESIDENTS.find(filter) ?? RESIDENTS[0];
    picked = p.id;
    const s = status(p.id);
    const friends = friendsOf(p.id).map((i) => BYID[i]).filter(Boolean);
    const family = RESIDENTS.filter((o) => o.home === p.home && o.id !== p.id);
    const chips = (l, color) => l.map((o) => `<span class="chip link" style="--c:${color}" data-id="${o.id}">${esc(o.name)}<span class="cn">${esc(o.nick)}</span></span>`).join('');
    side.innerHTML = `<div class="paper box mini"><div class="row1"><span class="hd big"></span><span class="t"><span class="nm">${esc(p.name)}</span><span class="nk">${esc(p.nick)}</span><br>
        <span class="jb">${esc(p.job)} · ${p.age}岁 · ${p.sex} · ${esc(p.relation)}</span><br><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(p.household)}</span>${p.traits.map((x) => `<span class="chip" style="--c:var(--c-plum)">${esc(x)}</span>`).join('')}</span></div>
        <div class="now">${nowHTML(s)}</div><div class="next">${esc(s?.nextText ?? '')}</div>
        <div class="btns"><button class="btn find">去村里找</button><button class="btn more">看大图</button></div></div>
      <div class="paper box info">
        <div class="sec"><div class="lbl">来历</div><p>${esc(p.bio)}</p></div>
        <div class="kv"><b>喜欢</b><span>${esc(p.likes)}</span><b>手艺</b><span>${esc(p.skills.join('、'))}</span>${p.owns.length ? `<b>家当</b><span>${esc(p.owns.join('、'))}</span>` : ''}</div>
        ${family.length ? `<div class="sec"><div class="lbl">家人</div>${chips(family, 'var(--c-craft)')}</div>` : ''}
        ${friends.length ? `<div class="sec"><div class="lbl">好友</div>${chips(friends, 'var(--c-child)')}</div>` : ''}
        <div class="sec"><div class="lbl">今日安排<span class="count">${p.day.length} 项</span></div><ul class="plan">${planHTML(p.day, s?.cur ?? -1)}</ul></div>
      </div>`;
    side.querySelector('.hd.big').append(head(p, 3));
    side.querySelector('.more').addEventListener('click', () => openPerson(p.id));
    side.querySelector('.find').addEventListener('click', () => { close(); onFind?.(p.id); });
    side.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => pick(c.dataset.id)));
  }

  function showView(v = view) {
    view = v; cur = null;
    tabs.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    detail.hidden = true; list.hidden = v !== 'list'; rmap.hidden = v !== 'map'; nav.hidden = true; filters.hidden = false; tabs.hidden = false;
    refresh();
    if (v === 'map') { sideHTML(); requestAnimationFrame(() => layout()); }
  }
  const showList = () => showView();
  tabs.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.v)));
  if (!map) { tabs.remove(); view = 'list'; rmap.remove(); list.hidden = false; }

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
    list.hidden = true; rmap.hidden = true; detail.hidden = false; nav.hidden = false; filters.hidden = true; tabs.hidden = true;
    refresh();
  }

  const step = (d) => { if (!cur) return; const ids = order.includes(cur.id) ? order : RESIDENTS.map((o) => o.id); openPerson(ids[(ids.indexOf(cur.id) + d + ids.length) % ids.length]); };
  nav.querySelector('.prev').addEventListener('click', () => step(-1));
  nav.querySelector('.next').addEventListener('click', () => step(1));

  /** 此刻：列表每张卡一行，详情里加下一项和安排高亮。村里每过一分钟刷一次。 */
  function refresh() {
    if (el.hidden) return;
    if (!cur) {
      if (view === 'map') { sideHTML(); return; } // 小卡上的"此刻"和安排高亮跟着刷
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
    pick: (id) => { if (view === 'map') pick(id); },
  };
}
