import { characterAtlas, CELL_W, CELL_H } from '../characters.js';
import { animalAtlas } from '../animals.js';
import { LABELS } from '../labels.js';
import { friendsOf, RESIDENTS } from '../residents.js';
import { portrait, headCrop } from './frame.js';

/*
 * 村民卡片 / 动物卡片（村子页面点人、点动物弹出；村民档案页也用同一张卡）。
 *   村民：头像 + 名字 + 身份标签 → "此刻"（正在干什么、在哪儿、接下来干什么）→ 来历
 *         → 可折叠：性格喜好 / 手艺家当 / 亲近的人 / 今天的安排（按早中晚分段，默认收起）
 *   动物：头像 + 名字 + 品种 / 谁家的 → 此刻 → 来历
 * 卡片分静态部分（建一次）和动态部分（update，每过村里一分钟刷新一次），折叠状态不会被刷新打断。
 */

const BYID = Object.fromEntries(RESIDENTS.map((p) => [p.id, p]));
const hm = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
const label = (a, arg) => (LABELS[a] ?? a) + (arg && LABELS[`${a}:${arg}`] ? `（${LABELS[`${a}:${arg}`]}）` : '');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const JOB_COLOR = (p) => (p.body === 'child' ? 'var(--c-child)' : /匠|郎中|掌柜|剃头|货郎|先生|伙计|徒弟|豆腐/.test(p.job) ? 'var(--c-craft)' : /村长/.test(p.job) ? 'var(--c-chief)' : 'var(--c-farm)');
const SEGS = [[0, '清早'], [7, '上午'], [11.5, '中午'], [13.5, '下午'], [18, '晚上']];

/** 村民头像：正面待机帧的上半身。 */
function residentFace(p) {
  const c = headCrop(characterAtlas(p), CELL_W, CELL_H, 20, 22);
  c.style.width = `calc(${20 * 2} * var(--f))`; // 一个像素 = 2 个字点
  return c;
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
  const close = onClose ? '<button class="btn close" title="关闭">×</button>' : '';
  const friends = friendsOf(p.id).map((id) => BYID[id]).filter(Boolean);
  const family = RESIDENTS.filter((o) => o.home === p.home && o.id !== p.id);
  const chips = (list, color) => list.map((o) => `<span class="chip ${onPick ? 'link' : ''}" style="--c:${color}" data-id="${o.id}">${esc(o.name)}<span style="opacity:.8">·${esc(o.nick)}</span></span>`).join('');
  el.innerHTML = `${close}
    <div class="head"><div class="face"></div><div class="who">
      <div class="name title">${esc(p.name)}<span class="nick">${esc(p.nick)}</span></div>
      <div><span class="chip" style="--c:${JOB_COLOR(p)}">${esc(p.job)}</span><span class="chip soft">${p.age}岁 · ${p.sex}</span><span class="chip soft">${esc(p.household)}</span><span class="chip soft">${esc(p.relation)}</span></div>
    </div></div>
    ${live ? '<div class="paper now"><span class="dot"></span><span class="doing"></span></div><div class="next"></div>' : ''}
    <p style="margin-top:calc(3 * var(--p))">${esc(p.bio)}</p>
    <details class="fold"><summary>性格 · 喜好</summary><div>
      <div class="row">${p.traits.map((t) => `<span class="chip" style="--c:var(--c-plum)">${esc(t)}</span>`).join('')}</div>
      <div class="row"><b>喜欢</b>${esc(p.likes)}</div></div></details>
    <details class="fold"><summary>手艺 · 家当</summary><div>
      <div class="row"><b>手艺</b>${esc(p.skills.join('、'))}</div>
      ${p.owns.length ? `<div class="row"><b>家当</b>${esc(p.owns.join('、'))}</div>` : ''}</div></details>
    <details class="fold"><summary>亲友<span class="count">${family.length + friends.length}</span></summary><div>
      ${family.length ? `<div class="row"><b>家人</b></div><div class="row">${chips(family, 'var(--c-craft)')}</div>` : ''}
      ${friends.length ? `<div class="row"><b>好友</b></div><div class="row">${chips(friends, 'var(--c-child)')}</div>` : ''}</div></details>
    <details class="fold"><summary>${live ? '今日安排' : '日常安排'}<span class="count">${p.day.length} 项</span></summary><div><ul class="plan">${planHTML(p.day, -1)}</ul></div></details>`;
  el.querySelector('.face').append(residentFace(p));
  el.querySelector('.close')?.addEventListener('click', onClose);
  if (onPick) el.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => onPick(c.dataset.id)));
  const doing = el.querySelector('.doing'), dot = el.querySelector('.dot'), next = el.querySelector('.next'), plan = el.querySelector('.plan');
  let lastCur = -2;
  return {
    el,
    update({ doing: d, where, kind, nextText, cur }) {
      if (!live) return;
      doing.innerHTML = esc(d) + (where ? `<span class="loc"><i class="pin"></i>${esc(where)}</span>` : '');
      dot.className = `dot ${kind ?? ''}`;
      next.textContent = nextText ?? '';
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
  el.innerHTML = `${onClose ? '<button class="btn close" title="关闭">×</button>' : ''}
    <div class="head"><div class="face"></div><div class="who">
      <div class="name title">${esc(info.name)}</div>
      <div><span class="chip" style="--c:var(--c-craft)">${esc(info.kind)}</span><span class="chip soft">${esc(info.owner)}</span>
      ${owner ? `<span class="chip link" style="--c:var(--c-child)" data-id="${owner.id}">主人 · ${esc(owner.nick)}</span>` : ''}</div>
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
      doing.innerHTML = esc(d) + (where ? `<span class="loc"><i class="pin"></i>${esc(where)}</span>` : '');
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
  el.innerHTML = `${onClose ? '<button class="btn close" title="关闭">×</button>' : ''}
    <div class="name title">${esc(info.name)}</div>
    <div>${info.household ? `<span class="chip" style="--c:var(--c-craft)">${esc(info.household.name)}</span>` : ''}${info.tags.map((t) => `<span class="chip soft">${esc(t)}</span>`).join('')}</div>
    <div class="paper now"><span class="dot"></span><span class="doing"></span></div>
    <div class="who-now row"></div>
    ${info.about ? `<p style="margin-top:calc(3 * var(--p))">${esc(info.about)}</p>` : ''}
    ${info.people?.length ? `<details class="fold" open><summary>住户<span class="count">${info.people.length}</span></summary><div><div class="row">${chips(info.people, 'var(--c-farm)')}</div></div></details>` : ''}`;
  el.querySelector('.close')?.addEventListener('click', onClose);
  const bind = (root) => { if (onPick) root.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => onPick(c.dataset.id))); };
  bind(el);
  const doing = el.querySelector('.doing'), dot = el.querySelector('.dot'), whoEl = el.querySelector('.who-now');
  let lastWho = '';
  return {
    el,
    update({ lines, kind, who = [] }) {
      doing.innerHTML = lines.map(esc).join('<br>');
      dot.className = `dot ${kind ?? ''}`;
      const key = who.map((o) => o.id).join();
      if (key !== lastWho) { lastWho = key; whoEl.innerHTML = chips(who, 'var(--c-child)'); bind(whoEl); }
    },
  };
}

export { hm, label, planHTML };
