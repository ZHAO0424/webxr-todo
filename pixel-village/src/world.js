/*
 * 村子的存档：把模拟到的状态存成一份 JSON，下回（网页、或者后台的 tools/sim.mjs）读回来接着过。
 *
 * 存什么（画面上的东西一概不存，读回来按状态重新摆）：
 *   - 纪年：石峪元年起（ERA），第几天、几点；季节、是不是废墟开局（这两样决定建村时搭什么，要在建村之前定）
 *   - 经济：各户的钱、存货、卖价、产出、欠账、账本，人和人的熟识度，全村的成交记录（最近的），村外的进出，缺口
 *   - 老村址：每处老宅修到哪一步、谁住着；正在修的
 *   - 新来的居民（「创建居民」建的）：长相、会什么、住哪、干什么营生
 * 人和动物这一刻走到哪一步不存：每天凌晨四点半大家本来就回到床边重新开始，读档后各人按日程从家门口出发。
 */

export const ERA = '石峪'; // 纪年：从「石峪元年」算起（石峪村重新住人那年）
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const cnNum = (n) => (n < 10 ? CN[n] : n < 20 ? `十${CN[n - 10]}` : `${CN[Math.floor(n / 10)]}十${CN[n % 10]}`);
/** 第几年（0 = 元年）：开局那个月起，每过一个正月初一加一年。 */
export const yearOf = (day, startMonth, startDate) => Math.floor((startMonth - 1 + Math.floor((startDate + day - 2) / 30)) / 12) - Math.floor((startMonth - 1) / 12);
export const yearLabel = (n) => `${ERA}${n ? cnNum(n + 1) : '元'}年`;

/** 新居民存档的字段（网页存在浏览器里的、后台存档里的，都是这一份）。 */
export const SAVE_KEYS = ['id', 'name', 'nick', 'age', 'sex', 'skills', 'traits', 'bio', 'likes', 'body', 'build', 'elder', 'skin', 'hair', 'hairRamp', 'hat', 'top', 'style', 'pattern', 'pants', 'beard', 'mustache', 'blush', 'smile', 'legwrap', 'apron', 'sash', 'acc', 'coins', 'goods', 'home', 'homeWhy', 'jobId', 'jobWhy', 'houseState', 'jobPicked', 'met', 'jobHistory'];
/** 写文件用：账本里偶尔挂着村民、动物对象（顺手记的），存档只要普通数据。 */
export const toJSON = (state) => JSON.stringify(state, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype ? undefined : v));
export const newcomerData = (p) => Object.fromEntries(SAVE_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));

/** 把村子现在的状态存成一份普通对象（JSON.stringify 就能写文件）。village：buildVillage 的返回值。 */
export function saveWorld(village, { season, ruins }) {
  const V = village.world, E = V.econ, clock = village.life.clock;
  return {
    v: 1,
    era: ERA,
    season,
    ruins,
    day: clock.day,
    hour: +clock.hour.toFixed(4),
    econ: {
      day: E.day,
      flow: E.flow,
      total0: E.total0,
      missing: E.missing,
      units: [...E.units.values()].map((u) => ({ id: u.id, coins: u.coins, stock: u.stock, ask: u.ask, sold: u.sold, made: u.made, owe: u.owe, log: (u.log ?? []).slice(-30), earned: u.earned })),
      ties: [...E.ties.entries()],
      trades: E.trades.slice(-300),
      acc: [...E.acc.entries()].map(([v, a]) => [v.p?.id ?? v, a]), // 键是村民对象：存成 id
    },
    plots: (V.east?.houses ?? []).map((h) => ({ id: h.id, state: h.state, owner: h.owner ?? null, ownerName: h.ownerName ?? null })),
    repairs: V.repairs ?? [],
    newcomers: V.people.filter((v) => v.p.newcomer).map((v) => newcomerData(v.p)),
  };
}

/**
 * 读档：村子已经按存档的季节、开局方式建好（见 ruins / season），这里把新居民放回去、钟拨到存档的钟点、经济和老宅照存档摆好。
 * addNewcomer：life/newcomers.js 的同名函数（从外面传，免得这个文件牵扯一大串 import）；onNewcomer(p)：网页里顺手把新人加进档案。
 */
export function loadWorld(village, s, { addNewcomer, onNewcomer = () => {} }) {
  const V = village.world, clock = village.life.clock;
  clock.day = s.day;
  clock.hour = s.hour;
  for (const p of s.newcomers ?? []) { if (V.byId[p.id]) continue; addNewcomer(V, { ...p }, { arriving: false }); onNewcomer(p); } // 住老宅的会在这里认领那处老宅
  for (const pl of s.plots ?? []) if (V.east?.plotState(pl.id) !== pl.state) V.east.setPlotState(pl.id, pl.state, true);
  V.repairs = s.repairs ?? [];
  const E = V.econ, e = s.econ;
  if (e) {
    for (const su of e.units) { const u = E.units.get(su.id); if (u) Object.assign(u, { coins: su.coins, stock: su.stock ?? {}, ask: su.ask ?? {}, sold: su.sold ?? {}, made: su.made ?? {}, owe: su.owe ?? {}, log: su.log ?? [], earned: su.earned }); }
    E.ties = new Map(e.ties);
    E.trades = e.trades ?? [];
    E.acc = new Map((e.acc ?? []).map(([id, a]) => [V.byId[id], a]).filter(([v]) => v));
    E.flow = e.flow ?? E.flow;
    E.total0 = e.total0 ?? E.total0;
    E.missing = e.missing ?? {};
    E.day = e.day ?? s.day;
  }
  V.trade.plan(clock.day); // 今天想买什么，照读回来的家底重新排
}
