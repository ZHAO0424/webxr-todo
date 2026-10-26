import { VILLAGE, HOUSEHOLDS, RESIDENTS, friendsOf } from '../residents.js';
import { characterAtlas, CELL_W, CELL_H } from '../characters.js';
import { animalAtlas } from '../animals.js';
import { LABELS } from '../labels.js';
import { portrait, bodyCrop } from './frame.js';

/*
 * 村民档案：村子页面里的一张横板大卡（四边留一点，和屏幕一样的比例），不跳新页面。版式参考星露谷的村民关系页、牧场物语的村民资料页：
 *   地图（默认）：真实场景从正上方看下去的截图（main.js 渲染一次），左上角是地名；每户一列小头像（右边小字名字、职业）竖排在自家院子上、左上角院子名，
 *         挤在一起的推开、用虚线连回院子；右边是点中的人（默认第一个）的全部资料：小卡（半身像、身份、此刻、喜好手艺家当）+ 背景故事、一天（时间条 + 各类时长）、
 *         家人好友（头像）和牲口。← → 在筛选出来的人里翻；
 *   卡片：一格一格的人物卡铺满整面（宽屏 5 列 × 6 行正好 30 人）：全身像 | 名字、身份、哪家、此刻在干什么、性格、喜欢；点了回到地图看这个人。
 * status(id) 给出这个人此刻的状态（和村子里点人看到的同一份），beasts(home) 给出这家的牲口，hour() 是村里的钟，onFind(id) = 关掉档案、在村里选中并跟着这个人。
 */

const BYID = new Proxy({}, { get: (_, id) => RESIDENTS.find((p) => p.id === id) }); // 实时查（新来的人随时会加进名册）
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const JOB_COLOR = (p) => (p.body === 'child' ? 'var(--c-child)' : /匠|郎中|掌柜|剃头|货郎|先生|伙计|徒弟|豆腐/.test(p.job) ? 'var(--c-craft)' : /村长/.test(p.job) ? 'var(--c-chief)' : 'var(--c-farm)');

const FILTERS = {
  全部: () => true,
  大人: (p) => p.body !== 'child' && p.age < 60,
  老人: (p) => p.age >= 60,
  孩子: (p) => p.body === 'child',
  手艺人: (p) => /匠|郎中|掌柜|剃头|货郎|伙计|徒弟|豆腐/.test(p.job),
  种地的: (p) => /种地|种田|庄稼|羊倌|喂|农/.test(p.job + p.skills.join()),
  外来的: (p) => p.relation.includes('外村') || p.relation.includes('寄住') || p.relation.includes('住铺里'),
};

// 一天的时间花在哪儿：日程里的活动分五类（时间条和下面的柱条用同一套颜色）
const KINDS = [
  { k: 'work', name: '干活', color: 'var(--c-farm)' },
  { k: 'chore', name: '家务', color: 'var(--c-craft)' },
  { k: 'school', name: '上学', color: 'var(--c-child)' },
  { k: 'rest', name: '歇着', color: 'var(--blue)' },
  { k: 'home', name: '回屋', color: '#3d3125' },
];
const CHORE = new Set(['cook', 'chore', 'yardWork', 'fetchWater', 'feedChickens', 'feedPigs', 'feedRabbits', 'garden', 'shopping', 'gatherDucks', 'herdHome', 'oxHome']);
const REST = new Set(['dinner', 'evening', 'play', 'sitGate', 'read', 'chess', 'visit', 'fish', 'worship', 'peddlerChat', 'idle', 'chat']);
const kindOf = (a) => (a === 'home' ? 'home' : a === 'school' ? 'school' : CHORE.has(a) ? 'chore' : REST.has(a) ? 'rest' : 'work');
const DAY0 = 5, DAY1 = 22; // 时间条从清早五点画到夜里十点
const actLabel = (a, arg) => (LABELS[a] ?? a) + (arg && LABELS[`${a}:${arg}`] ? `（${LABELS[`${a}:${arg}`]}）` : '');
const hm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** 全身像，一个像素 = k 个字点。 */
function body(p, k) {
  const c = portrait(characterAtlas(p), 0, 0, CELL_W, CELL_H, 1);
  c.style.width = `calc(${CELL_W * k} * var(--f))`;
  return c;
}
// 小孩是大头身材（头和大人差不多大、身子短），按身高截同一截身子要换个比例：半身像大人 56%、小孩 72%，头像大人 48%、小孩 55%（截出来都是十八九行）
const BUST = (p) => (p.body === 'child' ? 0.72 : 0.56), HEAD = (p) => (p.body === 'child' ? 0.55 : 0.48);
/** 半身像：头和上半身，一个像素 = 3 个字点（所有人一样大）。 */
function bust(p) {
  const { canvas, w } = bodyCrop(characterAtlas(p), CELL_W, CELL_H, BUST(p), 20);
  canvas.style.width = `calc(${w * 3} * var(--f))`;
  return canvas;
}
/** 头像：头和肩膀，一个像素 = k 个字点。 */
function head(p, k) {
  const { canvas, w } = bodyCrop(characterAtlas(p), CELL_W, CELL_H, HEAD(p), 18);
  canvas.style.width = `calc(${w * k} * var(--f))`;
  return canvas;
}
const nowHTML = (s) => `<span class="dot ${s?.kind ?? 'sleep'}"></span><span class="what">${esc(s?.doing ?? '')}</span>${s?.where ? `<span class="loc"><i class="pin"></i>${esc(s.where)}</span>` : ''}`;

/** 一天：时间条（每段一种颜色，悬停看几点、干什么）+ 刻度 + 此刻的竖线，下面各类一共几个钟头的柱条。 */
function dayHTML(day) {
  const segs = [];
  const items = [[0, 'home'], ...day.filter(([t]) => t < DAY1)];
  items.forEach(([t, a, arg], i) => {
    const t0 = Math.max(DAY0, t), t1 = Math.min(DAY1, items[i + 1]?.[0] ?? DAY1);
    if (t1 > t0) segs.push({ t0, t1, a, arg, kind: kindOf(a) });
  });
  const pct = (t) => ((t - DAY0) / (DAY1 - DAY0)) * 100;
  const sum = Object.fromEntries(KINDS.map(({ k }) => [k, 0]));
  for (const s of segs) sum[s.kind] += s.t1 - s.t0;
  const max = Math.max(...Object.values(sum));
  const color = (k) => KINDS.find((x) => x.k === k).color;
  return `<div class="tl">${segs.map((s) => `<span class="sg" style="left:${pct(s.t0)}%;width:${pct(s.t1) - pct(s.t0)}%;background:${color(s.kind)}" title="${hm(s.t0)}–${hm(s.t1)} ${esc(actLabel(s.a, s.arg))}"></span>`).join('')}<span class="now-line"></span></div>
    <div class="ticks">${[6, 9, 12, 15, 18, 21].map((h) => `<span style="left:${pct(h)}%">${h}</span>`).join('')}</div>
    <div class="bars">${KINDS.filter(({ k }) => sum[k] > 0).map(({ k, name }) => `<div class="bar"><span class="bn"><i style="background:${color(k)}"></i>${name}</span><span class="bt"><i style="width:${(sum[k] / max) * 100}%;background:${color(k)}"></i></span><span class="bh">${sum[k].toFixed(1)} 时</span></div>`).join('')}</div>`;
}

export function createRoster(el, { status, beasts, econ, onFind, onChangeJob, onClose, map, hour }) {
  el.className = 'panel px';
  el.id = 'roster';
  el.hidden = true;
  el.innerHTML = `<div class="rhead">
      <span class="title">${esc(VILLAGE.name)} · 村民档案</span>
      <span class="chip soft">${HOUSEHOLDS.length} 户</span><span class="chip soft">${RESIDENTS.length} 口人</span>
      <span class="tabs"><button class="btn on" data-v="map">地图</button><button class="btn" data-v="list">卡片</button></span>
      <span class="filters">${Object.keys(FILTERS).map((k, i) => `<button class="btn${i ? '' : ' on'}" data-f="${k}">${k}</button>`).join('')}</span>
      <button class="btn close" title="关闭（Esc）">×</button>
    </div>
    <div class="rbody"><div class="rmap"><div class="mapwrap"></div><div class="mapside"></div></div><div class="rlist" hidden></div></div>`;
  const list = el.querySelector('.rlist'), filters = el.querySelector('.filters'), tabs = el.querySelector('.tabs');
  const rmap = el.querySelector('.rmap'), wrap = el.querySelector('.mapwrap'), side = el.querySelector('.mapside');
  let order = RESIDENTS.map((p) => p.id), view = 'map', filter = FILTERS.全部, picked = null;

  // 卡片：每人一张横的小卡
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
    if (view === 'map') { layout(); sideHTML(); }
  }));

  // ---------------------------------------------------------------- 地图：真实场景的俯视截图，每户一列小头像标在自家院子上
  const B = map?.bounds, groups = [], markers = {};
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
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
      g.innerHTML = `<div class="yn">${esc(h.name.replace(/（.*）/, ''))}</div><div class="ms"></div>`;
      const ms = g.querySelector('.ms');
      for (const p0 of h.people) {
        const p = BYID[p0.id];
        const m = document.createElement('div');
        m.className = 'mk';
        m.dataset.id = p.id;
        m.style.setProperty('--jc', JOB_COLOR(p));
        m.innerHTML = `<span class="hd"></span><span class="t"><span class="nm">${esc(p.name)}</span><span class="jb">${esc(p.job)}</span></span>`;
        m.querySelector('.hd').append(head(p, 1));
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

  /** 摆每户那一列：先放在自家院子正中，挤在一起的按矩形往两边推开；推远了的用一根虚线连回院子。 */
  function layout() {
    if (!map || el.hidden || view !== 'map') return;
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

  /**
   * 地图右边：点中的人（默认第一个）的全部资料——
   *   上面小卡：半身像 | 名字、身份、哪家和性格、此刻、喜欢 / 手艺 / 家当、去村里找；
   *   下面资料：背景故事、一天（时间条 + 各类时长，代替长长的今日安排）、家人好友（头像，点了换人）| 家里的牲口。
   */
  function pick(id) { picked = id ?? picked; sideHTML(); for (const [k, m] of Object.entries(markers)) m.classList.toggle('on', k === picked); }
  function sideHTML() {
    if (!map) return;
    const p = BYID[picked] ?? RESIDENTS.find(filter) ?? RESIDENTS[0];
    picked = p.id;
    const friends = friendsOf(p.id).map((i) => BYID[i]).filter(Boolean);
    const family = RESIDENTS.filter((o) => o.home === p.home && o.id !== p.id);
    // 关系从这个人的角度说：对方是"王德山的媳妇"就写"媳妇"、是户主就写"户主"，说不清的写村里怎么叫（杨二嫂）
    const relOf = (o) => (o.relation.startsWith(`${p.name}的`) ? o.relation.slice(p.name.length + 1) : o.relation === '户主' ? '户主' : o.nick);
    const rel = (o, tag, color) => `<div class="rel" data-id="${o.id}" style="--rc:${color}"><span class="hd"></span><span class="rn">${esc(o.name)}</span><span class="rt">${esc(tag === '家人' ? relOf(o) : '好友')}</span></div>`;
    side.innerHTML = `<div class="paper box mini"><div class="row1"><span class="hd big"></span><div class="t">
        <div class="l1"><span class="nm">${esc(p.name)}</span><span class="nk">${esc(p.nick)}</span><button class="btn find">去村里找</button>${p.newcomer && p.met ? '<button class="btn chjob">改行</button>' : ''}</div>
        <div class="jb">${esc(p.job)} · ${p.age}岁 · ${p.sex} · ${esc(p.relation)}</div>
        <div><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(p.household)}</span>${p.traits.map((x) => `<span class="chip" style="--c:var(--c-plum)">${esc(x)}</span>`).join('')}</div>
        <div class="now"></div>
        <div class="kv"><b>喜欢</b><span>${esc(p.likes)}</span><b>手艺</b><span>${esc(p.skills.join('、'))}</span><b>家当</b><span>${esc(p.owns.length ? p.owns.join('、') : '——')}</span></div>
      </div></div></div>
      <div class="paper box info">
        <div class="sec"><div class="lbl">背景故事</div><p class="story">${esc(p.story ?? p.bio)}</p></div>
        <div class="sec"><div class="lbl">一天<span class="count">${p.day.length} 项安排</span></div>${dayHTML(p.day)}</div>
        <div class="sec econ-sec"><div class="lbl">家当和账<span class="count"></span></div><div class="econ"></div></div>
        <div class="two">
          <div class="sec"><div class="lbl">家人 · 好友</div><div class="rels">${family.map((o) => rel(o, '家人', 'var(--c-craft)')).join('')}${friends.map((o) => rel(o, '好友', 'var(--c-child)')).join('')}</div></div>
          <div class="sec pets-sec"><div class="lbl">家里的牲口</div><div class="pets"></div></div>
        </div>
      </div>`;
    side.querySelector('.hd.big').append(bust(p));
    side.querySelectorAll('.rel').forEach((r) => { r.querySelector('.hd').append(head(BYID[r.dataset.id], 2)); r.addEventListener('click', () => pick(r.dataset.id)); });
    const pets = side.querySelector('.pets'), animals = beasts?.(p.home) ?? [];
    for (const b of animals) {
      const a = animalAtlas(b.kind), c = portrait(a.canvas, 0, 0, a.cellW, a.cellH, 1);
      c.style.width = `calc(${a.cellW * 2} * var(--f))`;
      const s = document.createElement('span');
      s.className = 'pet';
      s.title = b.about ?? '';
      s.append(c, b.name);
      pets.append(s);
    }
    if (!animals.length) side.querySelector('.pets-sec').remove();
    side.querySelector('.find').addEventListener('click', () => { close(); onFind?.(p.id); });
    side.querySelector('.chjob')?.addEventListener('click', () => { close(); onChangeJob?.(p.id); }); // 新来的人：换个营生
    nowHTMLs();
  }

  /** 家当和账（economy.js）：这户的铜钱、存着的东西、最近的买卖、赊的账。没有经济数据时整块不显示。 */
  function econHTML(p) {
    const box = side.querySelector('.econ'), e = econ?.(p.id);
    if (!box) return;
    if (!e) { side.querySelector('.econ-sec')?.remove(); return; }
    side.querySelector('.econ-sec .count').textContent = `${e.unit} · ${e.coins} 文`;
    box.innerHTML = `<div class="stock">${e.stock.map(([n, q, u]) => `<span class="chip soft">${esc(n)} ${q}${esc(u)}</span>`).join('') || '<span class="dim">家里没什么存货</span>'}</div>`
      + (e.owe.length ? `<div class="owe">${e.owe.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '')
      + `<ul class="deals">${e.log.map((x) => `<li>${esc(x)}</li>`).join('') || '<li class="dim">这几天还没有买卖</li>'}</ul>`;
  }

  /** 小卡上会变的：此刻在干什么、在哪儿，时间条上此刻的竖线。 */
  function nowHTMLs() {
    const p = BYID[picked];
    if (!p || !side.firstChild) return;
    const s = status(p.id);
    econHTML(p);
    side.querySelector('.mini .now').innerHTML = nowHTML(s);
    const h = hour?.() ?? 12, line = side.querySelector('.now-line');
    line.hidden = h < DAY0 || h > DAY1;
    line.style.left = `${((h - DAY0) / (DAY1 - DAY0)) * 100}%`;
  }

  function showView(v = view) {
    view = v;
    tabs.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    list.hidden = v !== 'list'; rmap.hidden = v !== 'map';
    if (v === 'map') { sideHTML(); requestAnimationFrame(() => layout()); }
    refresh();
  }
  tabs.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.v)));
  if (!map) { tabs.remove(); view = 'list'; rmap.remove(); list.hidden = false; }

  /** 卡片页点一个人：回到地图，右边换成这个人。 */
  function openPerson(id) { if (!map || !BYID[id]) return; picked = id; showView('map'); pick(id); }
  const step = (d) => { const ids = order.length ? order : RESIDENTS.map((o) => o.id); pick(ids[(ids.indexOf(picked) + d + ids.length) % ids.length]); };

  /** 此刻：卡片列表每张一行、地图右边小卡上的此刻和接下来。村里每过一分钟刷一次。 */
  function refresh() {
    if (el.hidden) return;
    if (view === 'map') nowHTMLs();
    else for (const t of list.children) if (!t.hidden) t.querySelector('.now').innerHTML = nowHTML(status(t.dataset.id));
  }

  function close() { el.hidden = true; document.body.classList.remove('roster-open'); onClose?.(); }
  el.querySelector('.rhead .close').addEventListener('click', close);
  addEventListener('keydown', (e) => { // 档案开着时 ← → 在地图上换人（筛选出来的人里翻），不换场景
    if (el.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.stopImmediatePropagation(); if (view === 'map') step(e.key === 'ArrowLeft' ? -1 : 1); }
  }, true);

  return {
    get open() { return !el.hidden; },
    show(id) { el.hidden = false; document.body.classList.add('roster-open'); if (id && BYID[id]) picked = id; showView(); },
    close,
    refresh,
    pick: (id) => { if (view === 'map') pick(id); },
  };
}
