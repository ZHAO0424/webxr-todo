import { VILLAGE, HOUSEHOLDS, RESIDENTS, friendsOf } from '../residents.js';
import { characterAtlas, CELL_W, CELL_H } from '../characters.js';
import { animalAtlas } from '../animals.js';
import { portrait, headCrop } from './frame.js';
import { planHTML } from './cards.js';
import { drawMap } from './villageMap.js';

/*
 * 村民档案：村子页面里的一张横板大卡（四边留一点，和屏幕一样的比例），不跳新页面。版式参考星露谷的村民关系页、牧场物语的村民资料页：
 *   地图（默认）：村子的像素俯视图，每人一个头像 + 名字站在此刻所在的地方（边框颜色 = 干活 / 歇着 / 睡了 / 赶活动，在屋里的半透明，在西沟的排在左边一栏），
 *         挤在一起的自动推开；右边是点中的人的小卡，下面"此刻谁在哪儿"按地方分组；
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
    <div class="rbody"><div class="rmap"><div class="mapwrap"><div class="west" hidden><span class="wl">在西沟</span></div></div><div class="mapside"></div></div><div class="rlist" hidden></div><div class="rdetail" hidden></div></div>`;
  const list = el.querySelector('.rlist'), detail = el.querySelector('.rdetail'), nav = el.querySelector('.nav'), filters = el.querySelector('.filters'), tabs = el.querySelector('.tabs');
  const rmap = el.querySelector('.rmap'), wrap = el.querySelector('.mapwrap'), side = el.querySelector('.mapside'), westBox = el.querySelector('.west');
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
  }));

  // ---------------------------------------------------------------- 地图：俯视图上每人一个头像 + 名字，站在此刻真正所在的地方
  const B = map?.bounds, markers = {};
  if (map) {
    for (const pl of map.places) { // 各家院子的名字
      const l = document.createElement('span');
      l.className = 'place';
      l.textContent = pl.name;
      l.style.left = `${((pl.x - B.x0) / (B.x1 - B.x0)) * 100}%`;
      l.style.top = `${((pl.z - B.z0) / (B.z1 - B.z0)) * 100}%`;
      wrap.append(l);
    }
    for (const p of RESIDENTS) {
      const m = document.createElement('div');
      m.className = 'mk';
      m.dataset.id = p.id;
      m.innerHTML = `<span class="hd"></span><span class="nm">${esc(p.name)}</span>`;
      m.querySelector('.hd').append(head(p, 2));
      m.addEventListener('click', (e) => { e.stopPropagation(); pick(p.id); });
      wrap.append(m);
      markers[p.id] = { el: m, x: 0, y: 0 };
    }
    wrap.addEventListener('click', () => pick(null));
  }
  let drawn = false, lastTick = 0;

  /** 每帧调用（档案开着、在看地图时）：一秒更新 5 次头像位置。挤在一起的往两边推开，不叠成一坨。 */
  function tick(force = false) {
    if (!map || el.hidden || view !== 'map' || cur) return;
    const now = performance.now();
    if (!force && now - lastTick < 200) return;
    lastTick = now;
    if (!drawn) { drawn = true; const cv = drawMap(map.nav, map.terrain, B, { winter: map.winter }); wrap.prepend(cv); wrap.style.aspectRatio = `${cv.width} / ${cv.height}`; }
    const W = wrap.clientWidth || 1, H = wrap.clientHeight || 1, pts = [], inWest = [];
    for (const p of RESIDENTS) {
      const m = markers[p.id], w = map.where(p.id), s = status(p.id);
      m.el.hidden = !w || !filter(p);
      if (m.el.hidden) continue;
      m.el.className = `mk ${s?.kind ?? ''}${w.inside ? ' in' : ''}${picked === p.id ? ' on' : ''}`;
      m.el.title = `${p.name}：${s?.doing ?? ''}${s?.where ? ' · ' + s.where : ''}`;
      if (w.west) { inWest.push(m); continue; }
      m.x = ((w.x - B.x0) / (B.x1 - B.x0)) * W; m.y = ((w.z - B.z0) / (B.z1 - B.z0)) * H;
      pts.push(m);
    }
    const f = parseFloat(getComputedStyle(el).getPropertyValue('--f')) || 1, RX = 54 * f, RY = 46 * f, R = 34 * f; // 头像 + 名字大概这么大：两人离得比这近就推开
    for (let it = 0; it < 10; it++) for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
      const P = pts[a], Q = pts[b], dx = (Q.x - P.x) / RX, dy = (Q.y - P.y) / RY, d = Math.hypot(dx, dy);
      if (d >= 1) continue;
      const k = (1 - d) / 2 / (d || 1), ux = d ? dx : 1, uy = d ? dy : 0;
      P.x -= ux * k * RX; Q.x += ux * k * RX; P.y -= uy * k * RY; Q.y += uy * k * RY;
    }
    for (const m of pts) { m.el.style.left = `${Math.max(R, Math.min(W - R, m.x))}px`; m.el.style.top = `${Math.max(R, Math.min(H, m.y))}px`; }
    westBox.hidden = !inWest.length; // 在西沟的人：地图左边一栏，从上往下排
    inWest.forEach((m, i) => { m.el.style.left = `${R * 0.8}px`; m.el.style.top = `${R * 2 + i * R * 1.5}px`; });
  }

  /** 地图右边：点中的人一张小卡（头像、身份、此刻、下一项、看详情 / 去村里找），下面是"此刻谁在哪儿"按地方分组。 */
  function pick(id) { picked = id; sideHTML(); tick(true); }
  function sideHTML() {
    if (!map) return;
    let html = '';
    const p = picked && BYID[picked];
    if (p) {
      const s = status(p.id);
      html += `<div class="paper box mini"><div class="row1"><span class="hd big"></span><span class="t"><span class="nm">${esc(p.name)}</span><span class="nk">${esc(p.nick)}</span><br>
          <span class="jb">${esc(p.job)} · ${p.age}岁</span><br><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(p.household)}</span></span></div>
        <div class="now">${nowHTML(s)}</div><div class="next">${esc(s?.nextText ?? '')}</div>
        <p class="bio">${esc(p.bio)}</p>
        <div class="btns"><button class="btn more">看详情</button><button class="btn find">去村里找</button></div></div>`;
    } else html += `<div class="paper box mini hint">点地图上的头像，看这个人此刻在干什么。<br>头像边框：<span class="dot"></span>干活 <span class="dot rest"></span>歇着 <span class="dot sleep"></span>睡了 <span class="dot event"></span>赶活动；半透明的在屋里。</div>`;
    const groups = {};
    for (const o of RESIDENTS) {
      if (!filter(o)) continue;
      const s = status(o.id), w = map.where(o.id);
      const k = !s || !w ? '不在村里' : w.inside ? (s.kind === 'sleep' ? '睡下了' : '在屋里') : (s.where || '路上');
      (groups[k] ??= []).push(o);
    }
    const keys = Object.keys(groups).sort((a, b) => (/屋里|睡下|不在/.test(a) - /屋里|睡下|不在/.test(b)) || groups[b].length - groups[a].length);
    html += `<div class="paper box groups"><div class="lbl">此刻谁在哪儿</div>${keys.map((k) => `<div class="grp"><div class="gk">${esc(k)}<span class="count">${groups[k].length}</span></div><div>${groups[k].map((o) => `<span class="chip link${o.id === picked ? ' on' : ''}" data-id="${o.id}">${esc(o.name)}</span>`).join('')}</div></div>`).join('')}</div>`;
    side.innerHTML = html;
    if (p) {
      side.querySelector('.hd.big').append(head(p, 3));
      side.querySelector('.more').addEventListener('click', () => openPerson(p.id));
      side.querySelector('.find').addEventListener('click', () => { close(); onFind?.(p.id); });
    }
    side.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => pick(c.dataset.id)));
  }

  function showView(v = view) {
    view = v; cur = null;
    tabs.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    detail.hidden = true; list.hidden = v !== 'list'; rmap.hidden = v !== 'map'; nav.hidden = true; filters.hidden = false; tabs.hidden = false;
    refresh();
    if (v === 'map') requestAnimationFrame(() => tick(true));
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
      if (view === 'map') { sideHTML(); tick(true); return; }
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
    tick,
    pick: (id) => { if (view === 'map') pick(id); },
  };
}
