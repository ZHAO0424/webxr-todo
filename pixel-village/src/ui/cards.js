import { characterAtlas, CELL_W, CELL_H } from '../characters.js';
import { animalAtlas } from '../animals.js';
import { LABELS } from '../labels.js';
import { friendsOf, RESIDENTS, HOUSEHOLDS } from '../residents.js';
import { EN, tr } from '../i18n.js';
import { pName, pNick, pJob, pRelation, pHousehold, pBio, pLikes, pSkills, pTraits, pOwns } from '../names.js';
import { portrait, bodyCrop } from './frame.js';

/*
 * 村民卡片 / 动物卡片（村子页面点人、点动物弹出；村民档案页也用同一张卡）。
 *   村民：头像 + 名字 + 身份标签 → "此刻"（正在干什么、在哪儿、接下来干什么）→ 来历
 *         → 可折叠：性格喜好 / 手艺家当 / 亲近的人 / 今天的安排（按早中晚分段，默认收起）
 *   动物：头像 + 名字 + 品种 / 谁家的 → 此刻 → 来历
 * 卡片分静态部分（建一次）和动态部分（update，每过村里一分钟刷新一次），折叠状态不会被刷新打断。
 */

const BYID = new Proxy({}, { get: (_, id) => RESIDENTS.find((p) => p.id === id) }); // 实时查（新来的人随时会加进名册）
const hm = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
const label = (a, arg) => (LABELS[a] ?? a) + (arg && LABELS[`${a}:${arg}`] ? (EN ? ` (${LABELS[`${a}:${arg}`]})` : `（${LABELS[`${a}:${arg}`]}）`) : '');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const JOB_COLOR = (p) => (p.body === 'child' ? 'var(--c-child)' : /匠|郎中|掌柜|剃头|货郎|先生|伙计|徒弟|豆腐/.test(p.job) ? 'var(--c-craft)' : /村长/.test(p.job) ? 'var(--c-chief)' : 'var(--c-farm)');
const SEGS = [[0, tr('清早', 'Early')], [7, tr('上午', 'Morning')], [11.5, tr('中午', 'Noon')], [13.5, tr('下午', 'Afternoon')], [18, tr('晚上', 'Evening')]];
const CLOSE = tr('关闭', 'Close');
const list = (a) => a.join(tr('、', ', '));

/** 村民头像：正面待机帧的头和上半身。 */
function residentFace(p) {
  const { canvas, w } = bodyCrop(characterAtlas({ ...p, item: undefined }), CELL_W, CELL_H, p.body === 'child' ? 0.66 : 0.5, 20); // 不拿手里的东西：竖着的竹篙、烟袋会把头像挤偏 // 头和肩膀：小孩大头身材，按身高要多截一点才和大人截到同一截
  canvas.style.width = `calc(${w * 2} * var(--f))`; // 一个像素 = 2 个字点
  return canvas;
}

function animalFace(kind) {
  const a = animalAtlas(kind);
  const c = portrait(a.canvas, 0, 0, a.cellW, a.cellH, 1);
  const s = Math.max(1, Math.min(4, Math.floor(40 / a.cellW))); // 小动物放大一些，和人的头像差不多大
  c.style.width = `calc(${a.cellW * s} * var(--f))`;
  return c;
}

/** 一天的安排，按早中晚分段；cur = 当前是第几条。 */
function planHTML(day, cur) {
  let html = '', seg = -1;
  day.forEach(([t, a, arg], i) => {
    const s = SEGS.findLastIndex(([h]) => t >= h);
    if (s !== seg) { seg = s; html += `<li class="seg">${SEGS[s][1]}</li>`; }
    html += `<li class="item${i < cur ? ' past' : i === cur ? ' cur' : ''}" data-i="${i}"><span class="t">${hm(t)}</span><span>${esc(label(a, arg))}</span></li>`;
  });
  return html;
}

/**
 * 村民卡片。opts.onPick(id)：点"亲近的人"里的名字；opts.onClose：点关闭。
 * 返回 { el, update({ doing, where, kind, next, cur }) }。live = false 时（档案页）不显示"此刻"。
 */
export function residentCard(p, { live = true, onPick, onClose } = {}) {
  const el = document.createElement('div');
  el.className = 'panel card px';
  el.style.position = 'relative';
  const close = onClose ? `<button class="btn close" title="${CLOSE}">×</button>` : '';
  const friends = friendsOf(p.id).map((id) => BYID[id]).filter(Boolean);
  const family = RESIDENTS.filter((o) => o.home === p.home && o.id !== p.id);
  const chips = (list, color) => list.map((o) => `<span class="chip ${onPick ? 'link' : ''}" style="--c:${color}" data-id="${o.id}">${esc(pName(o))}<span style="opacity:.8">·${esc(pNick(o))}</span></span>`).join('');
  el.innerHTML = `${close}
    <div class="head"><div class="facecol"><div class="face"></div></div><div class="who">
      <div class="name">${esc(pName(p))}<span class="nick">${esc(pNick(p))}</span></div>
      <div><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(pJob(p))}</span><span class="chip soft">${EN ? `Age ${p.age} · ${p.sex === '女' ? 'F' : 'M'}` : `${p.age}岁 · ${p.sex}`}</span><span class="chip soft">${esc(pHousehold(p, HOUSEHOLDS))}</span><span class="chip soft">${esc(pRelation(p))}</span></div>
    </div></div>
    ${live ? '<div class="paper now"><span class="dot"></span><span class="doing"></span></div><div class="next"></div><div class="deal"></div>' : ''}
    <p style="margin-top:calc(3 * var(--p))">${esc(pBio(p))}</p>
    <details class="fold"><summary>${tr('性格 · 喜好', 'Traits · Likes')}</summary><div>
      <div class="row">${pTraits(p).map((t) => `<span class="chip" style="--c:var(--c-plum)">${esc(t)}</span>`).join('')}</div>
      <div class="row"><b>${tr('喜欢', 'Likes')}</b>${esc(pLikes(p))}</div></div></details>
    <details class="fold"><summary>${tr('手艺 · 家当', 'Skills · Belongings')}</summary><div>
      <div class="row"><b>${tr('手艺', 'Skills')}</b>${esc(list(pSkills(p)))}</div>
      ${pOwns(p).length ? `<div class="row"><b>${tr('家当', 'Owns')}</b>${esc(list(pOwns(p)))}</div>` : ''}</div></details>
    <details class="fold"><summary>${tr('亲友', 'Family & friends')}<span class="count">${family.length + friends.length}</span></summary><div>
      ${family.length ? `<div class="row"><b>${tr('家人', 'Family')}</b></div><div class="row">${chips(family, 'var(--c-craft)')}</div>` : ''}
      ${friends.length ? `<div class="row"><b>${tr('好友', 'Friends')}</b></div><div class="row">${chips(friends, 'var(--c-child)')}</div>` : ''}</div></details>
    <details class="fold"><summary>${live ? tr('今日安排', 'Today') : tr('日常安排', 'Daily routine')}<span class="count">${EN ? p.day.length : `${p.day.length} 项`}</span></summary><div><ul class="plan">${planHTML(p.day, -1)}</ul></div></details>`;
  el.querySelector('.face').append(residentFace(p));
  el.querySelector('.close')?.addEventListener('click', onClose);
  if (onPick) el.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => onPick(c.dataset.id)));
  const doing = el.querySelector('.doing'), dot = el.querySelector('.dot'), next = el.querySelector('.next'), deal = el.querySelector('.deal'), plan = el.querySelector('.plan');
  let lastCur = -2;
  return {
    el,
    update({ doing: d, where, kind, nextText, cur, dealText }) {
      if (!live) return;
      doing.innerHTML = `<span class="what">${esc(d)}</span>` + (where ? `<span class="loc"><i class="pin"></i>${esc(where)}</span>` : '');
      dot.className = `dot ${kind ?? ''}`;
      next.textContent = nextText ?? '';
      deal.textContent = dealText ?? ''; // 今天的买卖（最近一笔）
      if (cur !== lastCur) { lastCur = cur; plan.innerHTML = planHTML(p.day, cur); }
    },
  };
}

/** 动物卡片。info：animalInfo()；返回 { el, update({ doing, where }) }。 */
export function animalCard(info, kind, { onClose, onPick, ownerId } = {}) {
  const el = document.createElement('div');
  el.className = 'panel card px';
  el.style.position = 'relative';
  const owner = ownerId && BYID[ownerId];
  el.innerHTML = `${onClose ? `<button class="btn close" title="${CLOSE}">×</button>` : ''}
    <div class="head"><div class="facecol"><div class="face"></div></div><div class="who">
      <div class="name">${esc(info.name)}</div>
      <div><span class="chip" style="--c:var(--c-craft)">${esc(info.kind)}</span><span class="chip soft">${esc(info.owner)}</span>
      ${owner ? `<span class="chip link" style="--c:var(--c-child)" data-id="${owner.id}">${tr('主人', 'Owner')} · ${esc(pNick(owner))}</span>` : ''}</div>
    </div></div>
    <div class="paper now"><span class="dot"></span><span class="doing"></span></div>
    <p style="margin-top:calc(3 * var(--p))">${esc(info.about)}</p>`;
  el.querySelector('.face').append(animalFace(kind));
  el.querySelector('.close')?.addEventListener('click', onClose);
  if (onPick) el.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => onPick(c.dataset.id)));
  const doing = el.querySelector('.doing'), dot = el.querySelector('.dot');
  return {
    el,
    update({ doing: d, where, kind: k }) {
      doing.innerHTML = `<span class="what">${esc(d)}</span>` + (where ? `<span class="loc"><i class="pin"></i>${esc(where)}</span>` : '');
      dot.className = `dot ${k ?? ''}`;
    },
  };
}

/**
 * 房子 / 院子 / 物件卡片。info：{ name, tags, about, household（{ name, kind }）, people（住这儿的人） }。
 * 返回 { el, update({ lines: [文字], kind, who: [人] }) }：lines 是"此刻"的几行（屋里有谁、灯亮没亮、谁在用），who 是此刻在这儿的人（可点）。
 */
export function thingCard(info, { onClose, onPick } = {}) {
  const el = document.createElement('div');
  el.className = 'panel card thing px';
  el.style.position = 'relative';
  const chips = (list, color) => list.map((o) => `<span class="chip ${onPick ? 'link' : ''}" style="--c:${color}" data-id="${o.id}">${esc(o.name)}</span>`).join('');
  el.innerHTML = `${onClose ? `<button class="btn close" title="${CLOSE}">×</button>` : ''}
    <div class="name">${esc(info.name)}</div>
    <div>${info.household ? `<span class="chip" style="--c:var(--c-craft)">${esc(info.household.name)}</span>` : ''}${info.tags.map((t) => `<span class="chip soft">${esc(t)}</span>`).join('')}</div>
    <div class="paper now"><span class="dot"></span><span class="doing"></span></div>
    <div class="who-now row"></div>
    ${info.about ? `<p style="margin-top:calc(3 * var(--p))">${esc(info.about)}</p>` : ''}
    ${info.people?.length ? `<details class="fold" open><summary>${tr('住户', 'Residents')}<span class="count">${info.people.length}</span></summary><div><div class="row">${chips(info.people, 'var(--c-farm)')}</div></div></details>` : ''}`;
  el.querySelector('.close')?.addEventListener('click', onClose);
  const bind = (root) => { if (onPick) root.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => onPick(c.dataset.id))); };
  bind(el);
  const doing = el.querySelector('.doing'), dot = el.querySelector('.dot'), whoEl = el.querySelector('.who-now');
  let lastWho = '';
  return {
    el,
    update({ lines, kind, who = [] }) {
      doing.innerHTML = lines.map((l) => `<span class="what">${esc(l)}</span>`).join('');
      dot.className = `dot ${kind ?? ''}`;
      const key = who.map((o) => o.id).join();
      if (key !== lastWho) { lastWho = key; whoEl.innerHTML = chips(who, 'var(--c-child)'); bind(whoEl); }
    },
  };
}

export { hm, label, planHTML };
