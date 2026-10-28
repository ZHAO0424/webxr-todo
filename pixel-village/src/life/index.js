import { makeRng } from '../pixel.js';
import { Clock } from './clock.js';
import { Villager } from './villager.js';
import { Beast } from './beast.js';
import { eventOf, weatherOf, EVENTS } from './events.js';
import { Barbershop } from './barber.js';
import { holiday } from './variety.js';
import { Economy } from './economy.js';
import { Trading } from './trade.js';
import { jobById, teaTick } from './newcomers.js';
import { check as checkBadges } from './badges.js';
import { HOUSEHOLDS } from '../residents.js';
import { repairTick } from './oldsite.js';

export { Clock, RATES, rateAt } from './clock.js';
export { EVENTS, EVENT_NAMES, ORDER, WEATHER, fmt, lunarLabel } from './events.js';

/*
 * 村里的"生活"（各部分见同目录下的文件）：
 *   clock.js       完整的一天，各时段流速不同（白天放慢、深夜快进）
 *   villager.js    人：按日程到点换活动；今天的全村活动优先；临时差事（剃头）办完回日程
 *   activities.js  日常活动；events.js 每天一样的全村活动；barber.js 剃头挑子
 *   beast.js       动物：按角色过日子、响应人、会拱门但不关门
 * 这里负责放人放动物，以及每天的重置（凌晨 4:30 大家还睡着时：动物回白天的位置、门关上、人回到各自床边）。
 */

/**
 * 放人放动物。V：村子上下文（M、root、nav、C、nodes、fields、pasture、torches、well …）。
 * 返回 { people, beasts, clock, update(t, dt), cookingAt(homeId), insideCount(homeId) }。
 */
export function populate(V, residents, extraAnimals, startHour, { event: forcedEvent = null, weather: forcedWeather = null } = {}) {
  const rand = makeRng(2024);
  V.frameCache = new Map();
  V.attract = new Map();
  V.cooking = new Set();
  V.steaming = new Set();
  V.spin = new Set();
  V.stats = { madeWay: 0, detours: 0, duckHops: 0 };
  const claims = new Map(); // 公共位置有人占了就换一个
  V.claim = (v, c, names, { ordered = false, strict = false } = {}) => { // ordered：从前往后占（里圈先坐满）；strict：占满了返回 null，不跟人挤
    const mine = claims.get(v);
    if (mine && names.includes(mine.name) && mine.c === c) return mine.name;
    const taken = new Set([...claims.entries()].filter(([o, x]) => o !== v && x.c === c).map(([, x]) => x.name));
    const free = names.filter((n) => !taken.has(n));
    if (!free.length && strict) return null;
    const name = free.length ? (ordered ? free[0] : free[Math.floor(v.rand() * free.length)]) : names[Math.floor(v.rand() * names.length)];
    claims.set(v, { c, name });
    return name;
  };
  V.release = (v) => claims.delete(v);
  /** 挨着自家人 / 要好的人占位置：他们已经占了的，挑离他们最近的空位；都没来就按顺序占。posOf(name) → [x, z]。 */
  V.claimNear = (v, c, names, near, posOf) => {
    const mine = claims.get(v);
    if (mine && mine.c === c && names.includes(mine.name)) return mine.name;
    const taken = new Set([...claims.entries()].filter(([o, x]) => o !== v && x.c === c).map(([, x]) => x.name));
    const free = names.filter((n) => !taken.has(n));
    if (!free.length) return null;
    const anchors = [...claims.entries()].filter(([o, x]) => o !== v && x.c === c && near.has(o.p.id) && names.includes(x.name)).map(([, x]) => posOf(x.name));
    let name = free[0];
    if (anchors.length) {
      let best = Infinity;
      for (const n of free) { const [x, z] = posOf(n); const d = Math.min(...anchors.map(([ax, az]) => Math.hypot(x - ax, z - az))); if (d < best) { best = d; name = n; } }
    }
    claims.set(v, { c, name });
    return name;
  };
  V.claimed = (v) => claims.get(v)?.name;
  V.people = residents.map((p) => new Villager(p, V, rand));
  V.byId = Object.fromEntries(V.people.map((v) => [v.p.id, v]));
  V.beasts = [
    ...Object.values(V.C).flatMap((c) => c.animals.map((s) => new Beast(s, V, c, rand))),
    ...extraAnimals.map((s) => new Beast(s, V, null, rand)),
  ];
  const clock = new Clock(startHour);
  V.clockDay = () => clock.day;
  V.hour = () => clock.hour;
  V.today = () => eventOf(clock.day, forcedEvent); // 头一天唱戏，第二天赶集，第三天篝火……
  V.weather = () => weatherOf(clock.day, forcedWeather);
  V.eventOn = (key) => { const e = EVENTS[key]; return V.today() === key && V.weather() !== 'rain' && clock.hour >= e.from - e.prep && clock.hour < e.to; }; // 场面道具什么时候摆出来
  V.barber = new Barbershop(V);
  V.holiday = () => holiday(clock.day);
  V.econ = new Economy(V); // 各户的钱和东西、产出、吃用、调价、成交（economy.js）
  V.trade = new Trading(V, V.econ); // 派人去买、当面成交（trade.js）
  V.econ.jobs = jobById; // 新来的人的行当（newcomers.js）
  V.econ.newDay(clock.day);
  V.trade.plan(clock.day);
  return {
    people: V.people,
    beasts: V.beasts,
    clock,
    today: () => V.today(),
    weather: () => V.weather(),
    barber: V.barber,
    econ: V.econ,
    trade: V.trade,
    update(t, dt) {
      const prev = clock.hour;
      clock.update(dt);
      const h = clock.hour, crossed = (x) => prev < x && h >= x;
      if (crossed(4.5)) { // 新的一天（大家都还睡着）：动物回到白天的位置，鸡出窝，人从各自床边起来
        for (const b of V.beasts) b.reset();
        for (const g of V.nav.gates) g.ajar = false;
        for (const v of V.people) { v.entry = -1; v.inside = true; v.lift = 0; v.perched = false; v.down = null; const [dx, dz] = V.nav.nearestFree(...v.bed.door('house')); v.pos.set(dx, 0, dz); }
        V.econ.newDay(clock.day); // 结账：吃用、放坏、调价、今天想买什么
        V.trade.plan(clock.day);
        for (const v of V.people) if (v.p.newcomer && !v.gone) { const got = checkBadges(V, v, HOUSEHOLDS); if (got.length) V.onBadge?.(v, got); } // 新来的人：够了的勋章记上（见 badges.js）
      }
      if (crossed(6.6)) for (const tr of V.torches) tr.lit = false; // 天亮了还没人去灭的，算熄了
      if (h > 19.25 || h < 5) for (const tr of V.torches) tr.lit = true; // 兜底：过了七点一刻还没点的，算别人顺手点了
      V.barber.tick(h, clock.day);
      V.econ.tick(h >= prev ? h - prev : h + 24 - prev); // 干活的攒产出
      V.trade.tick(h); // 到点去买东西
      repairTick(V, h); // 老村址：请了葛石头来修房子的，白天两个人在院里干
      teaTick(V, h); // 村口茶摊：旁边闲坐的人顺手买碗茶
      V.trade.cartTick(h); // 村口代销车：路过、闲坐的人顺手买家里想要的
      for (const v of V.people) v.update(t, dt, h);
      for (const b of V.beasts) b.update(t, dt, h);
    },
    insideCount: (id) => V.people.filter((v) => v.inside && (v.p.sleepAt ?? v.p.home) === id).length,
  };
}
