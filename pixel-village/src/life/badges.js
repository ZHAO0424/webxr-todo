/*
 * 成就（勋章）和好感度：给玩家建的居民（新来的人）看自己在村里走到哪一步。档案里点自己的人，详情里有一栏「成就」和「好感度」。
 *
 * - 计数（p.stats，跟着存档走）：进村那天 since、手头最多攒过多少钱 coinsMax、一共挣了多少 earned、
 *   每样东西卖出 / 买进多少 sold / bought。economy.js 每记一笔买卖就叫 track()，所以后台模拟和网页里都在记。
 * - 勋章（p.badges：{ 勋章 id: 拿到那天是村里第几天 }）：每天清早（life/index.js 新的一天）check() 一遍，够了就记上，记上就不会掉
 *   （钱花掉了也还算攒到过）。
 * - 好感度：就是经济系统里两个人的熟识度（economy.js 的 ties，0–20：买卖、闲聊、串门都会涨）。
 *   一家人算平均，0–20 换成 0–5 颗心；平均到 15 算「信得过」（勋章「自家人」）。
 */
import { tr } from '../i18n.js';

const TRUST = 15; // 平均熟识度到这么多：这家人完全信得过
const ANIMAL_GOODS = ['egg', 'duckEgg', 'pork', 'wool', 'honey', 'fish']; // 鸡、鸭、猪、羊、蜂、鱼

/** 勋章：tier 1 铜 / 2 银 / 3 金；goal(c) 返回 [现在, 要多少]（c 见 progress）。 */
export const BADGES = [
  { id: 'firstSale', tier: 1, name: tr('开张大吉', 'Open for business'), desc: tr('头一回有人照顾生意', 'Make your first sale'), goal: (c) => [c.s.earned > 0 ? 1 : 0, 1] },
  { id: 'met', tier: 1, name: tr('熟门熟路', 'Knows everyone'), desc: tr('挨家挨户认过人', 'Meet every household'), goal: (c) => [c.p.met ? 1 : 0, 1] },
  { id: 'coins100', tier: 1, name: tr('第一桶金', 'First nest egg'), desc: tr('手头攒到 100 文', 'Save up 100 coins'), goal: (c) => [c.s.coinsMax ?? 0, 100] },
  { id: 'coins300', tier: 2, name: tr('小有积蓄', 'Comfortably off'), desc: tr('手头攒到 300 文', 'Save up 300 coins'), goal: (c) => [c.s.coinsMax ?? 0, 300] },
  { id: 'coins800', tier: 3, name: tr('富甲一方', 'Richest around'), desc: tr('手头攒到 800 文', 'Save up 800 coins'), goal: (c) => [c.s.coinsMax ?? 0, 800] },
  { id: 'earn1000', tier: 2, name: tr('生意兴隆', 'Thriving trade'), desc: tr('进村以来一共挣满 1000 文', 'Earn 1,000 coins in total'), goal: (c) => [c.s.earned ?? 0, 1000] },
  { id: 'home', tier: 2, name: tr('安家落户', 'A home of my own'), desc: tr('住的老宅修成囫囵房子', 'Fully repair your old house'), goal: (c) => [c.p.houseState >= 2 ? 1 : 0, 1] },
  { id: 'trust', tier: 3, name: tr('自家人', 'One of the family'), desc: tr('和村里一户人家处到完全信得过', 'Win the full trust of one household'), goal: (c) => [Math.round(c.best), TRUST] },
  { id: 'friends', tier: 2, name: tr('全村的朋友', 'Friend to all'), desc: tr('和 20 个村民混熟', 'Get to know 20 villagers well'), goal: (c) => [c.friends, 20] },
  { id: 'animals', tier: 2, name: tr('六畜兴旺', 'Every creature'), desc: tr('鸡蛋、鸭蛋、猪肉、羊毛、蜂蜜、鱼，样样买过或卖过', 'Trade eggs, duck eggs, pork, wool, honey and fish'), goal: (c) => [ANIMAL_GOODS.filter((g) => c.s.sold?.[g] || c.s.bought?.[g]).length, ANIMAL_GOODS.length] },
  { id: 'coal', tier: 2, name: tr('煤黑子', 'Coal hauler'), desc: tr('卖出 50 份煤', 'Sell 50 loads of coal'), goal: (c) => [c.s.sold?.coal ?? 0, 50] },
  { id: 'craft', tier: 3, name: tr('老字号', 'A trusted name'), desc: tr('自己做的东西卖出 200 份', 'Sell 200 of your own goods'), goal: (c) => [c.makes ? c.s.sold?.[c.makes] ?? 0 : 0, 200] },
  { id: 'jobs', tier: 1, name: tr('多面手', 'Jack of all trades'), desc: tr('干过三种营生', 'Work three different jobs'), goal: (c) => [c.jobs, 3] },
  { id: 'old', tier: 3, name: tr('老住户', 'Old-timer'), desc: tr('在村里住满 30 天', 'Live in the village for 30 days'), goal: (c) => [c.days, 30] },
];

const stats = (p) => (p.stats ??= {});
/** 记一笔买卖（economy.js 的 record 每笔都叫）：卖的一方记 sold、挣的钱，买的一方记 bought。只记新来的人（玩家建的）。 */
export function track(V, t) {
  const seller = V.byId[t.to]?.p, buyer = V.byId[t.from]?.p;
  if (seller?.newcomer) {
    const s = stats(seller);
    if (t.good) s.sold = { ...s.sold, [t.good]: (s.sold?.[t.good] ?? 0) + (t.qty ?? 1) };
    if (t.price > 0 && t.kind !== 'gift') s.earned = (s.earned ?? 0) + t.price;
    const u = V.econ.unit(t.to);
    if (u) s.coinsMax = Math.max(s.coinsMax ?? 0, Math.round(u.coins));
  }
  if (buyer?.newcomer && t.good) { const s = stats(buyer); s.bought = { ...s.bought, [t.good]: (s.bought?.[t.good] ?? 0) + (t.qty ?? 1) }; }
}

/** 和各户的好感度：[{ id, avg（0–20）, hearts（0–5）, trusted }]，熟的在前。HOUSEHOLDS：residents.js 的户（people 里有村民）。 */
export function affinity(V, p, HOUSEHOLDS) {
  const E = V.econ;
  return HOUSEHOLDS.filter((h) => h.people.length && h.id !== p.home).map((h) => {
    const ids = h.people.map((o) => o.id).filter((id) => id !== p.id && V.byId[id]);
    if (!ids.length) return null;
    const avg = ids.reduce((s, id) => s + E.tie(p.id, id), 0) / ids.length;
    return { id: h.id, avg, hearts: Math.min(5, Math.round(avg / 4)), trusted: avg >= TRUST };
  }).filter(Boolean).sort((a, b) => b.avg - a.avg);
}

/** 每个勋章现在怎么样：[{ ...BADGES 那一项, cur, need, got（拿到那天，没拿到 undefined） }]。 */
export function progress(V, v, HOUSEHOLDS) {
  const p = v.p, E = V.econ, s = stats(p);
  const u = E.unitOfV(v);
  if (u) s.coinsMax = Math.max(s.coinsMax ?? 0, Math.round(u.coins));
  const aff = affinity(V, p, HOUSEHOLDS);
  const c = {
    p, s,
    best: aff[0]?.avg ?? 0,
    friends: V.people.filter((o) => o !== v && E.tie(p.id, o.p.id) >= 6).length,
    makes: V.jobOf?.(p.jobId)?.makes,
    jobs: new Set([...(p.jobHistory ?? []), ...(p.jobId && p.met ? [p.jobId] : [])]).size,
    days: Math.max(0, E.day - (s.since ?? E.day)),
  };
  return BADGES.map((b) => { const [cur, need] = b.goal(c); return { ...b, cur: Math.min(cur, need), need, got: p.badges?.[b.id] }; });
}

/** 每天清早：够了的勋章记上拿到那天（记上就不会掉）。返回今天新拿到的。 */
export function check(V, v, HOUSEHOLDS) {
  const p = v.p, s = stats(p);
  s.since ??= V.econ.day;
  const fresh = [];
  for (const b of progress(V, v, HOUSEHOLDS)) if (!b.got && b.cur >= b.need) { p.badges = { ...p.badges, [b.id]: V.econ.day }; fresh.push(b); }
  return fresh;
}
