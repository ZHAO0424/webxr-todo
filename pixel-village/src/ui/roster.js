import { VILLAGE, HOUSEHOLDS, RESIDENTS, friendsOf } from '../residents.js';
import { characterAtlas, CELL_W, CELL_H } from '../characters.js';
import { animalAtlas } from '../animals.js';
import { LABELS } from '../labels.js';
import { portrait, bodyCrop } from './frame.js';
import { EN, tr } from '../i18n.js';
import { villageName, pName, pNick, pJob, pRelation, pHousehold, pTraits, pSkills, pLikes, pOwns, pStory, pSex, pAge } from '../names.js';

/*
 * 村民档案：村子页面里的一张横板大卡（四边留一点，和屏幕一样的比例），不跳新页面。版式参考星露谷的村民关系页、牧场物语的村民资料页：
 *   地图（默认）：真实场景从正上方看下去的截图（main.js 渲染一次），左上角是地名；三块沙盘各一张（村子 / 西沟 / 老村址，标题栏里切换）。
 *         每一组一列小头像（右边小字名字、职业）竖排在那个地方上、左上角是地方名，挤在一起的推开、用虚线连回去：
 *         村子、老村址按户标在自家院子上（老村址的老宅住了新人也算一户）；西沟没人住，按"谁到这儿干活"标在梯田、水磨坊、山神庙、崖顶草坡、水潭上。
 *         右边是点中的人（默认第一个）的全部资料：小卡（半身像、身份、此刻、喜好手艺家当）+ 背景故事、一天（时间条 + 各类时长）、
 *         家人好友（头像）和牲口。← → 在筛选出来的人里翻；
 *   卡片：一格一格的人物卡铺满整面（宽屏 5 列 × 6 行正好 30 人）：全身像 | 名字、身份、哪家、此刻在干什么、性格、喜欢；点了回到地图看这个人。
 * status(id) 给出这个人此刻的状态（和村子里点人看到的同一份），beasts(home) 给出这家的牲口，hour() 是村里的钟，onFind(id) = 关掉档案、在村里选中并跟着这个人。
 * mine(id)：是不是自己建的居民（档案里标「我的」，多一个「修改」按钮 → onEdit(id)）。
 */

const BYID = new Proxy({}, { get: (_, id) => RESIDENTS.find((p) => p.id === id) }); // 实时查（新来的人随时会加进名册）
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const JOB_COLOR = (p) => (p.body === 'child' ? 'var(--c-child)' : /匠|郎中|掌柜|剃头|货郎|先生|伙计|徒弟|豆腐/.test(p.job) ? 'var(--c-craft)' : /村长/.test(p.job) ? 'var(--c-chief)' : 'var(--c-farm)');

const FILTERS = {
  全部: () => true,
  大人: (p) => p.body !== 'child' && p.age < 60,
  老人: (p) => p.age >= 60,
  孩子: (p) => p.body === 'child',
  手艺人: (p) => /匠|郎中|掌柜|剃头|货郎|伙计|徒弟|豆腐/.test(p.job),
  种地的: (p) => /种地|种田|庄稼|羊倌|喂|农/.test(p.job + p.skills.join()),
  外来的: (p) => p.newcomer || p.relation.includes('外村') || p.relation.includes('寄住') || p.relation.includes('住铺里'),
};
const FILTER_EN = { 全部: 'All', 大人: 'Adults', 老人: 'Elders', 孩子: 'Kids', 手艺人: 'Crafts', 种地的: 'Farmers', 外来的: 'Outsiders' };

// 一天的时间花在哪儿：日程里的活动分五类（时间条和下面的柱条用同一套颜色）
const KINDS = [
  { k: 'work', name: tr('干活', 'Work'), color: 'var(--c-farm)' },
  { k: 'chore', name: tr('家务', 'Chores'), color: 'var(--c-craft)' },
  { k: 'school', name: tr('上学', 'School'), color: 'var(--c-child)' },
  { k: 'rest', name: tr('歇着', 'Leisure'), color: 'var(--blue)' },
  { k: 'home', name: tr('回屋', 'Indoors'), color: '#3d3125' },
];
const CHORE = new Set(['cook', 'chore', 'yardWork', 'fetchWater', 'feedChickens', 'feedPigs', 'feedRabbits', 'garden', 'shopping', 'gatherDucks', 'herdHome', 'oxHome']);
const REST = new Set(['dinner', 'evening', 'play', 'sitGate', 'read', 'chess', 'visit', 'fish', 'worship', 'peddlerChat', 'idle', 'chat']);
const kindOf = (a) => (a === 'home' ? 'home' : a === 'school' ? 'school' : CHORE.has(a) ? 'chore' : REST.has(a) ? 'rest' : 'work');
const DAY0 = 5, DAY1 = 22; // 时间条从清早五点画到夜里十点
const actLabel = (a, arg) => (LABELS[a] ?? a) + (arg && LABELS[`${a}:${arg}`] ? (EN ? ` (${LABELS[`${a}:${arg}`]})` : `（${LABELS[`${a}:${arg}`]}）`) : '');
const hm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** 全身像，一个像素 = k 个字点。 */
function body(p, k) {
  const c = portrait(characterAtlas(p), 0, 0, CELL_W, CELL_H, 1);
  c.style.width = `calc(${CELL_W * k} * var(--f))`;
  return c;
}
// 小孩是大头身材（头和大人差不多大、身子短），按身高截同一截身子要换个比例：半身像大人 56%、小孩 72%，头像大人 48%、小孩 55%（截出来都是十八九行）
const BUST = (p) => (p.body === 'child' ? 0.72 : 0.56), HEAD = (p) => (p.body === 'child' ? 0.55 : 0.48);
/** 截头像、半身像用的：不拿手里的东西（水生的竹篙竖得比头高，会被当成头的一部分，头像就往一边偏）。 */
const bare = (p) => ({ ...p, item: undefined });
/** 半身像：头和上半身，一个像素 = 3 个字点（所有人一样大）。 */
function bust(p) {
  const { canvas, w } = bodyCrop(characterAtlas(bare(p)), CELL_W, CELL_H, BUST(p), 20);
  canvas.style.width = `calc(${w * 3} * var(--f))`;
  return canvas;
}
/** 头像：头和肩膀，一个像素 = k 个字点。 */
function head(p, k) {
  const { canvas, w } = bodyCrop(characterAtlas(bare(p)), CELL_W, CELL_H, HEAD(p), 18);
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
    <div class="bars">${KINDS.filter(({ k }) => sum[k] > 0).map(({ k, name }) => `<div class="bar"><span class="bn"><i style="background:${color(k)}"></i>${name}</span><span class="bt"><i style="width:${(sum[k] / max) * 100}%;background:${color(k)}"></i></span><span class="bh">${sum[k].toFixed(1)}${tr(' 时', 'h')}</span></div>`).join('')}</div>`;
}

/**
 * map：{ boards: [{ id, name, sub, bounds, image(), groups() }] }——每块沙盘一张俯视图；groups() 给出这块图上的一组组人：
 *   [{ key, name, at: [x, z], ids: [村民 id…] }]（at 是那块沙盘的坐标）。
 */
export function createRoster(el, { status, beasts, econ, onFind, onChangeJob, onEdit, mine = () => false, onClose, map, hour }) {
  el.className = 'panel px';
  el.id = 'roster';
  el.hidden = true;
  const boards = map?.boards ?? [];
  el.innerHTML = `<div class="rhead">
      <span class="title">${esc(villageName(VILLAGE))} · ${tr('村民档案', 'Villagers')}</span>
      <span class="chip soft">${EN ? `${HOUSEHOLDS.length} homes` : `${HOUSEHOLDS.length} 户`}</span><span class="chip soft">${EN ? `${RESIDENTS.length} people` : `${RESIDENTS.length} 口人`}</span>
      <span class="tabs"><button class="btn on" data-v="map">${tr('地图', 'Map')}</button><button class="btn" data-v="list">${tr('卡片', 'Cards')}</button></span>
      <span class="btabs">${boards.map((b, i) => `<button class="btn${i ? '' : ' on'}" data-b="${b.id}">${esc(b.name)}</button>`).join('')}</span>
      <span class="filters">${Object.keys(FILTERS).map((k, i) => `<button class="btn${i ? '' : ' on'}" data-f="${k}">${EN ? FILTER_EN[k] : k}</button>`).join('')}</span>
      <button class="btn close" title="${tr('关闭（Esc）', 'Close (Esc)')}">×</button>
    </div>
    <div class="rbody"><div class="rmap"><div class="mapwrap"></div><div class="mapside"></div></div><div class="rlist" hidden></div></div>`;
  const list = el.querySelector('.rlist'), filters = el.querySelector('.filters'), tabs = el.querySelector('.tabs'), btabs = el.querySelector('.btabs');
  const rmap = el.querySelector('.rmap'), wrap = el.querySelector('.mapwrap'), side = el.querySelector('.mapside');
  let order = RESIDENTS.map((p) => p.id), view = 'map', filter = FILTERS.全部, picked = null, board = boards[0];
  const mineTag = (p) => (mine(p.id) ? `<span class="chip mine">${tr('我的', 'Mine')}</span>` : '');

  // 卡片：每人一张横的小卡
  for (const p of RESIDENTS) {
    const t = document.createElement('div');
    t.className = 'paper tile';
    t.dataset.id = p.id;
    t.innerHTML = `<div class="stage"></div><div class="txt">
        <div class="l1"><span class="nm">${esc(pName(p))}</span><span class="nk">${esc(pNick(p))}</span>${mineTag(p)}<span class="chip" style="--c:${JOB_COLOR(p)}">${esc(pHousehold(p, HOUSEHOLDS).replace(/（.*）|\s*\(.*\)/, ''))}</span></div>
        <div class="jb">${esc(pJob(p))} · ${pAge(p)}</div>
        <div class="now"></div>
        <div class="tr">${pTraits(p).slice(0, 3).map((x) => `<span class="chip" style="--c:var(--c-plum)">${esc(x)}</span>`).join('')}</div>
        <div class="lk"><b>${tr('喜欢', 'Likes')}</b>${esc(pLikes(p))}</div>
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

  // ---------------------------------------------------------------- 地图：真实场景的俯视截图，每组一列小头像标在那个地方上
  let groups = [], markers = {}, drawnFor = null;
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.classList.add('leaders');
  const title = document.createElement('div');
  title.className = 'maptitle';
  /** 换一块沙盘：换俯视图，按这块的分组重新摆头像。 */
  function buildBoard() {
    if (!board) return;
    wrap.replaceChildren(lines, title);
    drawnFor = null;
    groups = []; markers = {};
    const gs = board.groups();
    const n = new Set(gs.flatMap((g) => g.ids)).size;
    title.innerHTML = `${esc(board.name)}<span>${esc(board.sub(n))}</span>`;
    for (const gr of gs) {
      const g = document.createElement('div');
      g.className = 'hh';
      g.innerHTML = `<div class="yn">${esc(gr.name)}</div><div class="ms"></div>`;
      const ms = g.querySelector('.ms');
      for (const id of gr.ids) {
        const p = BYID[id];
        if (!p) continue;
        const m = document.createElement('div');
        m.className = 'mk';
        m.dataset.id = p.id;
        m.style.setProperty('--jc', JOB_COLOR(p));
        m.innerHTML = `<span class="hd"></span><span class="t"><span class="nm">${esc(pName(p))}</span><span class="jb">${esc(gr.role?.(p) ?? pJob(p))}</span></span>`;
        m.querySelector('.hd').append(head(p, 1));
        m.addEventListener('click', (e) => { e.stopPropagation(); pick(p.id); });
        ms.append(m);
        (markers[p.id] ??= []).push(m);
      }
      const pin = document.createElement('span');
      pin.className = 'home-pin';
      wrap.append(pin, g);
      groups.push({ el: g, pin, x0: gr.at[0], z0: gr.at[1], x: 0, y: 0 });
    }
    if (!gs.length) { const e = document.createElement('div'); e.className = 'mapempty'; e.textContent = board.empty ?? ''; wrap.append(e); }
  }
  if (map) addEventListener('resize', () => layout());

  /** 摆每组那一列：先放在那个地方正中，挤在一起的按矩形往两边推开；推远了的用一根虚线连回去。 */
  function layout() {
    if (!board || el.hidden || view !== 'map') return;
    if (drawnFor !== board.id) {
      const img = board.image();
      if (!img) return;
      drawnFor = board.id;
      wrap.querySelector(':scope > canvas')?.remove();
      wrap.prepend(img);
      wrap.style.aspectRatio = `${img.width} / ${img.height}`;
    }
    const B = board.bounds, W = wrap.clientWidth || 1, H = wrap.clientHeight || 1, gap = 4;
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
    mark();
  }
  const mark = () => { for (const [id, ms] of Object.entries(markers)) for (const m of ms) m.classList.toggle('on', id === picked); };
  function setBoard(id) {
    const b = boards.find((x) => x.id === id);
    if (!b) return;
    board = b;
    btabs.querySelectorAll('[data-b]').forEach((x) => x.classList.toggle('on', x.dataset.b === id));
    buildBoard();
    const here = b.groups().flatMap((g) => g.ids); // 点中的人不在这块图上：换成这块的第一个
    if (here.length && !here.includes(picked)) picked = here[0];
    if (view === 'map') sideHTML();
    requestAnimationFrame(() => layout());
  }
  btabs.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => setBoard(b.dataset.b)));

  /**
   * 地图右边：点中的人（默认第一个）的全部资料——
   *   上面小卡：半身像 | 名字、身份、哪家和性格、此刻、喜欢 / 手艺 / 家当、去村里找；
   *   下面资料：背景故事、一天（时间条 + 各类时长，代替长长的今日安排）、家人好友（头像，点了换人）| 家里的牲口。
   */
  function pick(id) { picked = id ?? picked; sideHTML(); mark(); }
  function sideHTML() {
    if (!map) return;
    const p = BYID[picked] ?? RESIDENTS.find(filter) ?? RESIDENTS[0];
    picked = p.id;
    const friends = friendsOf(p.id).map((i) => BYID[i]).filter(Boolean);
    const family = RESIDENTS.filter((o) => o.home === p.home && o.id !== p.id);
    // 关系从这个人的角度说：对方是"王德山的媳妇"就写"媳妇"、是户主就写"户主"，说不清的写村里怎么叫（杨二嫂）
    const relOf = (o) => {
      const r = pRelation(o), pre = EN ? `${pName(p)}'s ` : `${p.name}的`;
      const t = r.startsWith(pre) ? r.slice(pre.length) : o.relation === '户主' ? r : pNick(o);
      return EN ? t.replace(/\s*\(.*\)/, '') : t; // 头像底下地方小：英文去掉括号里的补充
    };
    const rel = (o, fam, color) => `<div class="rel" data-id="${o.id}" style="--rc:${color}"><span class="hd"></span><span class="rn">${esc(pName(o))}</span><span class="rt">${esc(fam ? relOf(o) : tr('好友', 'Friend'))}</span></div>`;
    const owns = pOwns(p);
    side.innerHTML = `<div class="paper box mini"><div class="row1"><span class="hd big"></span><div class="t">
        <div class="l1"><span class="nm">${esc(pName(p))}</span><span class="nk">${esc(pNick(p))}</span>${mineTag(p)}<span class="acts"><button class="btn find">${tr('去村里找', 'Find')}</button>${mine(p.id) ? `<button class="btn edit">${tr('修改', 'Edit')}</button>` : ''}${p.newcomer && p.met && mine(p.id) ? `<button class="btn chjob">${tr('改行', 'New job')}</button>` : ''}</span></div>
        <div class="jb">${esc(pJob(p))} · ${pAge(p)} · ${pSex(p)} · ${esc(pRelation(p))}</div>
        <div><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(pHousehold(p, HOUSEHOLDS))}</span>${pTraits(p).map((x) => `<span class="chip" style="--c:var(--c-plum)">${esc(x)}</span>`).join('')}</div>
        <div class="now"></div>
        <div class="kv"><b>${tr('喜欢', 'Likes')}</b><span>${esc(pLikes(p))}</span><b>${tr('手艺', 'Skills')}</b><span>${esc(pSkills(p).join(tr('、', ', ')))}</span><b>${tr('家当', 'Owns')}</b><span>${esc(owns.length ? owns.join(tr('、', ', ')) : '——')}</span></div>
      </div></div></div>
      <div class="paper box info">
        <div class="sec"><div class="lbl">${tr('背景故事', 'Story')}</div><p class="story">${esc(pStory(p))}</p></div>
        <div class="sec"><div class="lbl">${tr('一天', 'A day')}<span class="count">${EN ? `${p.day.length} activities` : `${p.day.length} 项安排`}</span></div>${dayHTML(p.day)}</div>
        <div class="sec econ-sec"><div class="lbl">${tr('家当和账', 'Money & goods')}<span class="count"></span></div><div class="econ"></div></div>
        <div class="two">
          <div class="sec"><div class="lbl">${tr('家人 · 好友', 'Family · friends')}</div><div class="rels">${family.map((o) => rel(o, true, 'var(--c-craft)')).join('')}${friends.map((o) => rel(o, false, 'var(--c-child)')).join('')}</div></div>
          <div class="sec pets-sec"><div class="lbl">${tr('家里的牲口', 'Animals')}</div><div class="pets"></div></div>
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
    side.querySelector('.edit')?.addEventListener('click', () => { close(); onEdit?.(p.id); }); // 自己建的人：改样子、改资料
    side.querySelector('.chjob')?.addEventListener('click', () => { close(); onChangeJob?.(p.id); }); // 新来的人：换个营生
    nowHTMLs();
  }

  /** 家当和账（economy.js）：这户的铜钱、存着的东西、最近的买卖、赊的账。没有经济数据时整块不显示。 */
  function econHTML(p) {
    const box = side.querySelector('.econ'), e = econ?.(p.id);
    if (!box) return;
    if (!e) { side.querySelector('.econ-sec')?.remove(); return; }
    side.querySelector('.econ-sec .count').textContent = EN ? `${e.unit} · ${e.coins} ${e.coins === 1 ? 'coin' : 'coins'}` : `${e.unit} · ${e.coins} 文`;
    box.innerHTML = `<div class="stock">${e.stock.map(([n, q, u]) => `<span class="chip soft">${esc(n)} ${q}${esc(u)}</span>`).join('') || `<span class="dim">${tr('家里没什么存货', 'Nothing in store')}</span>`}</div>`
      + (e.owe.length ? `<div class="owe">${e.owe.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '')
      + `<ul class="deals">${e.log.map((x) => `<li>${esc(x)}</li>`).join('') || `<li class="dim">${tr('这几天还没有买卖', 'No trades these days')}</li>`}</ul>`;
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
    list.hidden = v !== 'list'; rmap.hidden = v !== 'map'; btabs.hidden = v !== 'map';
    if (v === 'map') { if (!groups.length && board) buildBoard(); sideHTML(); requestAnimationFrame(() => layout()); }
    refresh();
  }
  tabs.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.v)));
  if (!map) { tabs.remove(); btabs.remove(); view = 'list'; rmap.remove(); list.hidden = false; }

  /** 这个人标在哪块图上（看他的那块先，不在就找有他的那块）。 */
  const boardOf = (id) => (board && board.groups().some((g) => g.ids.includes(id)) ? board : boards.find((b) => b.groups().some((g) => g.ids.includes(id))));
  /** 卡片页点一个人：回到地图（换到标着他的那块），右边换成这个人。 */
  function openPerson(id) {
    if (!map || !BYID[id]) return;
    picked = id;
    const b = boardOf(id);
    if (b && b !== board) setBoard(b.id);
    showView('map'); pick(id);
  }
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
    show(id, which) { el.hidden = false; document.body.classList.add('roster-open'); if (which && which !== board?.id) setBoard(which); if (id && BYID[id]) { picked = id; const b = !which && boardOf(id); if (b && b !== board) setBoard(b.id); } showView(); },
    close,
    refresh,
    pick: (id) => { if (view === 'map') pick(id); },
    layout: () => layout(), // 马上把地图上的头像摆好（平时等下一帧；无头检查用）
  };
}
