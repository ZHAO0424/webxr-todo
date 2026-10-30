/*
 * 「你不在的时候」：上次打开时记下自己居民的几样数（村里第几天、一共挣的、手头的钱、卖出 / 买进多少、混熟的人、勋章），
 * 这次打开一比，过了日子、有了变化，就在左下角按钮上面弹一张小纸条；点「看看她 / 他」打开「我的居民」。
 *
 * - 只跟世界存档比：记的是刚读完存档时的数（网页开着时本机多跑的那一段不算），所以下次打开不会出现倒退的数。
 * - 第一次见到这个人（刚建、换了浏览器）只记不说。
 * - 存在 localStorage（pv.away）：{ 居民 id → 上次的数 }。
 */
import { EN, tr } from '../i18n.js';

const KEY = 'pv.away';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } };
const keep = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* 隐私窗口：这次不记 */ } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * host：放纸条的地方（左下角那一栏）。
 * people：自己的居民 [{ id, name, sex, now }]，now = 现在的数（见 main.js 的 awayNow）。
 * nameOf(id)：村里别人的名字；badgeName(id)：勋章名。onOpen()：点「看看」。
 */
export function showAway(host, { people, nameOf, badgeName, onOpen }) {
  const last = load(), next = {}, notes = [];
  for (const x of people) {
    if (!x.now) continue;
    next[x.id] = x.now;
    const o = last[x.id];
    if (!o) continue;
    const n = x.now, days = n.day - o.day, earned = n.earned - o.earned;
    const friends = n.friends.filter((id) => !o.friends.includes(id)).map(nameOf).filter(Boolean);
    const badges = n.badges.filter((id) => !o.badges.includes(id)).map(badgeName).filter(Boolean);
    const sold = n.sold - o.sold, bought = n.bought - o.bought;
    if (days < 1 && earned <= 0 && !friends.length && !badges.length) continue;
    const lines = [];
    if (days >= 1) lines.push(EN ? `${days} day${days > 1 ? 's' : ''} passed in the village` : `村里过了 ${days} 天`);
    if (earned > 0) lines.push(EN ? `Earned ${earned} coins (now has ${n.coins})` : `挣了 ${earned} 文，手头 ${n.coins} 文`);
    if (sold > 0 || bought > 0) lines.push(EN ? `Sold ${sold}, bought ${bought} goods` : `卖出 ${sold} 份、买进 ${bought} 份东西`);
    if (friends.length) lines.push(`${tr('新混熟：', 'New friends: ')}${friends.slice(0, 4).join(tr('、', ', '))}${friends.length > 4 ? (EN ? ` and ${friends.length - 4} more` : ` 等 ${friends.length} 人`) : ''}`);
    if (badges.length) lines.push(`${tr('拿到勋章：', 'New medals: ')}${badges.join(tr('、', ', '))}`);
    notes.push({ x, lines });
  }
  // 这次读到的数记下来（已经离村、不在了的人就不留了）
  keep(next);
  if (!notes.length) return;
  const el = document.createElement('div');
  el.id = 'away';
  el.className = 'dark px';
  const ta = notes.length === 1 ? (notes[0].x.sex === '女' ? '她' : '他') : '';
  el.innerHTML = `<h4>${tr('你不在的时候', 'While you were away')}</h4>${notes.map(({ x, lines }) => `<div class="who">${esc(x.name)}</div>${lines.map((l) => `<div>${esc(l)}</div>`).join('')}`).join('')}
    <div class="acts"><button class="btn on" data-a="open">${EN ? 'Take a look' : `看看${ta}`}</button><button class="btn" data-a="ok">${tr('知道了', 'Got it')}</button></div>`;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (!a) return;
    e.stopPropagation();
    el.remove();
    if (a === 'open') onOpen();
  });
  host.prepend(el);
  return el;
}
