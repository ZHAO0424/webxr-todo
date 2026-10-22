import { ACTIVITIES, R, kinOf } from './activities.js';
import { season, is, festival } from '../season.js';

/*
 * 每天一样全村的活动，有白天的也有晚上的：
 *   按农历逢五逢十赶集（初五、初十、十五……），其余日子轮着唱戏 → 篝火讲古 → 打场 → 放露天电影 → 祭土地 → 开村会（?event= 指定）。
 *   下雨天户外的活动都不办了（天气见 weatherOf，?weather= 指定）。
 *
 * 每样活动：时间窗 [from, to)、有固定角色的人（提前 prep 小时到场布置，一定去）、其余人去不去按 prob 掷骰子
 * （同一天、同一个人结果固定）。去的人在时间窗里放下日程来参加，散了再回到日程；不去的照常过。
 * 活动的场面道具（幕布、摊子、香火……）由 village.js 按 V.eventOn(key) 显示 / 隐藏。
 */

const kid = (p) => p.body === 'child', elder = (p) => p.age >= 60, head = (p) => p.relation === '户主', outsider = (p) => p.relation.includes('外村');
const likesOpera = (p) => ((p.likes ?? '').includes('戏') ? 0.1 : 0);

export const EVENTS = {
  opera: {
    name: '唱戏', place: '村口戏台', from: 19.1, to: 20.8, prep: 0.6,
    roles: { ma_laoliu: 'singer', zheng_laotou: 'fiddler' }, // 羊倌老马嗓子亮，剃头匠老郑拉板胡
    prob: (p) => (kid(p) ? 0.9 : elder(p) ? 0.85 : 0.7) + likesOpera(p),
  },
  market: {
    name: '赶集', place: '村口', from: 8.5, to: 11.5, prep: 0.6, stay: ['zheng_laotou'], // 剃头匠守着挑子做买卖
    roles: { feng_yuzhen: 'tofu', qian_xiaoer: 'goods', sun_qiaoyun: 'veg' }, // 豆腐嫂卖豆腐、货郎摆杂货、吴大嫂卖菜
    prob: (p) => (kid(p) ? (p.age < 8 ? 0.8 : 0) : p.sex === '女' ? 0.8 : elder(p) ? 0.6 : 0.4),
  },
  bonfire: {
    name: '篝火讲古', place: '村口火塘', from: 19.1, to: 20.8, prep: 0.3,
    roles: { zheng_laotou: 'storyteller' },
    prob: (p) => (kid(p) ? 0.55 : elder(p) ? 0.6 : p.sex === '男' ? 0.75 : 0.4),
  },
  harvest: {
    get name() { return is('summer') ? '打麦' : '打场'; }, place: '场院', // 夏天打麦子、秋天打谷子；春冬不办 from: 14.0, to: 17.5, prep: 0.5, stay: ['zheng_laotou'],
    roles: { yang_erniu: 'ox' }, // 杨二哥赶牛拉碾子，大伙儿扫场、翻场；农忙，孩子也逃学来疯
    prob: (p) => (kid(p) ? 0.5 : elder(p) ? 0.25 : p.sex === '男' ? 0.7 : 0.45),
  },
  movie: {
    name: '放露天电影', place: '村口戏台前', from: 19.2, to: 21.2, prep: 0.5,
    roles: { qian_xiaoer: 'projectionist' }, // 货郎从镇上捎回来一部片子
    prob: (p) => (kid(p) ? 0.95 : elder(p) ? 0.6 : 0.8),
  },
  shrine: {
    name: '祭土地', place: '桥头土地庙', from: 7.0, to: 8.6, prep: 0.3, stay: ['zheng_laotou'],
    roles: { wang_deshan: 'leader' }, // 村长领头上头一炷香
    prob: (p) => (kid(p) ? 0.3 : elder(p) ? 0.9 : p.sex === '女' ? 0.6 : 0.4),
  },
  meeting: {
    name: '开村会', place: '村口戏台', from: 19.1, to: 20.5, prep: 0.5,
    roles: { wang_deshan: 'speaker', li_wenqing: 'clerk' }, // 村长主持，李先生记账
    prob: (p) => (kid(p) ? 0 : head(p) ? 1 : outsider(p) ? 0.15 : 0.45),
  },
  // ---- 四季的大节日（第 1 天，见 season.js 的 FESTIVALS）
  chunjie: { // 春节：上午各家穿着新衣出门拜年，挨家走到门口道一声"过年好"，站着说会儿话；孩子跟着大人
    name: '春节·拜年', place: '各家门口', from: 8.6, to: 11.4, prep: 0, roles: {},
    prob: (p) => (outsider(p) ? 0.3 : 0.9),
  },
  qingming: { // 清明：上午各家去西坡祖坟添土、烧纸、磕头；孩子在地头放风筝
    name: '清明·上坟踏青', place: '西坡祖坟', from: 8.0, to: 11.0, prep: 0.3, roles: {},
    prob: (p) => (kid(p) ? 0.9 : elder(p) ? 0.85 : outsider(p) ? 0 : 0.75),
  },
  duanwu: { // 端午：上午妇女们在村口围坐包粽子，孩子们跑来跑去，男人在旁边说话
    name: '端午·包粽子', place: '村口', from: 9.0, to: 11.4, prep: 0.3, roles: { feng_yuzhen: 'host' },
    prob: (p) => (kid(p) ? 0.8 : p.sex === '女' ? 0.9 : elder(p) ? 0.6 : 0.3),
  },
  zhongqiu: { // 中秋：晚上村口石桌摆供，村长领着拜月，大伙儿围坐赏月、吃月饼，孩子提着灯笼跑
    name: '中秋·赏月', place: '村口', from: 19.0, to: 21.0, prep: 0.3, roles: { wang_deshan: 'leader' },
    prob: (p) => (kid(p) ? 0.95 : elder(p) ? 0.85 : 0.75),
  },
};
export const ORDER = ['opera', 'market', 'bonfire', 'harvest', 'movie', 'shrine', 'meeting'];
export const EVENT_NAMES = new Proxy({}, { get: (_, k) => EVENTS[k]?.name }); // 名字跟季节走（打麦 / 打场）
export const fmt = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** 字符串 → [0, 1) 的固定随机数（同一天、同一个人结果不变）。 */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

// ---------------------------------------------------------------- 农历、天气

// 第 1 天是这个季节的节日（春三月初五清明、夏五月初五端午、秋八月十五中秋、冬正月初一春节；每月按 30 天算）
export function lunarOf(day) {
  const F = festival();
  let m = F.m, d = F.d + day - 1;
  while (d > 30) { d -= 30; m = (m % 12) + 1; }
  return { m, d };
}
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function lunarLabel(day) {
  const { m, d } = lunarOf(day);
  const month = m === 1 ? '正月' : m === 11 ? '冬月' : m === 12 ? '腊月' : `${CN[m]}月`;
  const dd = d <= 10 ? `初${CN[d]}` : d < 20 ? `十${CN[d - 10]}` : d === 20 ? '二十' : d < 30 ? `廿${CN[d - 20]}` : '三十';
  return month + dd;
}

/** 这天村里办什么：逢五逢十赶集，其余日子轮着来（打场只在夏秋农忙时办）。 */
export function eventOf(day, forced) {
  if (forced) return forced;
  if (day === 1) return festival().key; // 头一天过节
  if (lunarOf(day).d % 5 === 0) return 'market';
  const others = ORDER.filter((k) => k !== 'market' && (k !== 'harvest' || is('summer', 'autumn')));
  let k = 0;
  for (let i = 1; i < day; i++) if (lunarOf(i).d % 5) k++;
  return others[k % others.length];
}

// 冬天的 'rain' 是下雪：活动照样按"下雨"处理（户外的事改天），只是画面是雪花、叫"小雪"
const WEATHER_NAMES = { sunny: '晴', cloudy: '阴', rain: '小雨' };
export const WEATHER = new Proxy(WEATHER_NAMES, { get: (o, k) => (k === 'rain' && is('winter') ? '小雪' : o[k]) });
const WET = { spring: 0.12, summer: 0.2, autumn: 0.15, winter: 0.18 }; // 下雨（雪）的几率：夏天雨多
/** 这天的天气：头一天晴，之后晴、阴、雨（雪）按季节的几率。 */
export function weatherOf(day, forced) {
  if (forced) return forced;
  if (day === 1) return 'sunny';
  const h = hash(`${day}/weather`), wet = WET[season()];
  return h < 0.75 - wet ? 'sunny' : h < 1 - wet ? 'cloudy' : 'rain';
}
export const roleOf = (key, p) => EVENTS[key].roles[p.id] ?? null;
export const attends = (p, key, day) => !p.caravan && (!!roleOf(key, p) || (!EVENTS[key].stay?.includes(p.id) && hash(`${day}/${p.id}/${key}`) < EVENTS[key].prob(p))); // stay：手上有买卖走不开的；骡帮自己走自己的（activities.js 的 caravan）

/** 这会儿 v 该不该在活动上：今天的活动、在时间窗里（有角色的提前到）、自己去、还没提前散。 */
export function eventNow(v, hour) {
  const V = v.V, key = V.today(), e = EVENTS[key], day = V.clockDay();
  if (V.weather() === 'rain') return null; // 下雨，改天
  const role = roleOf(key, v.p);
  const from = e.from - (role ? e.prep : 0);
  const to = role ? e.to : e.to + (hash(`${day}/${v.p.id}/leave`) - 0.35) * 0.6; // 散场错开：有的提前走，有的留下说会儿话（−13 ～ +23 分钟）
  if (hour < from || hour >= to || v.leftEvent === `${day}/${key}` || !attends(v.p, key, day)) return null;
  return key;
}

// ---------------------------------------------------------------- 各样活动里人做什么

/** 从台阶爬上戏台，走到台上的位置；下来原路返回。 */
function onStage(v, to) {
  const sq = v.V.C.square, E = sq.evening, W = (p) => sq.at(p[0], p[1]);
  const [fx, fz] = W(E.foot), [tx, tz] = W(E.top), [x, z] = W(to);
  v.go(sq.spot('stageFoot'));
  v.climb([[fx, fz, 0], [tx, tz, E.lift], [x, z, E.lift]], [[tx, tz, E.lift], [fx, fz, 0]]);
}

/** 走到村口的某个位置；火塘边的石凳要爬上去坐。返回那个座（不是火塘边的座返回 null）。 */
function takeSquare(v, name) {
  const sq = v.V.C.square;
  const seat = name.startsWith('ring') ? sq.ringSeats[Number(name.slice(4))] : null;
  v.go(sq.spot(name));
  if (seat?.perch) { const [x, z] = sq.at(seat.x, seat.z); v.climb([[x, z, 0]], [[...sq.spot(name), 0]]); }
  return seat;
}

/** 占不到位置：这趟不去了，回自家门口坐着（今天这样活动就算散了）。 */
function giveUp(v, key) {
  v.leftEvent = `${v.V.clockDay()}/${key}`;
  v.doing = 'sitGate';
  ACTIVITIES.sitGate(v);
}

/** 戏台前的观众（看戏、开会、看电影）：一圈圈站着、蹲着，小孩挤最里圈，老人坐石桌边，火塘边的石头、石凳也坐人。 */
function audience(v, key) {
  const sq = v.V.C.square, E = sq.evening, face = sq.at(...E.face), isKid = kid(v.p);
  v.char.setItem(key !== 'meeting' && v.p.item === 'pipe' ? 'pipe' : null);
  const pool = isKid && key !== 'meeting' ? [...E.front, ...E.rows, ...E.ring] : elder(v.p) ? [...E.elders, ...E.ring, ...E.rows] : [...E.rows, ...E.ring];
  const spot = v.V.claimNear(v, sq, pool, kinOf(v), (n) => sq.spots[n]); // 一圈圈从里往外，挨着自家人、要好的站
  if (!spot) { giveUp(v, key); return; }
  const seat = takeSquare(v, spot);
  const seated = E.elders.includes(spot) || seat;
  v.loop = () => {
    const r = v.rand();
    if (seated) { v.seat = seat?.seat ?? 0.45; v.do(key !== 'meeting' && r < 0.1 ? 'cheer' : 'sit', 10, { face }); return; }
    if (key === 'meeting') v.do(r < 0.08 ? 'talk' : r < 0.6 ? 'squat' : 'idle', 8, { face });
    else v.do(isKid ? (r < 0.15 ? 'cheer' : 'squat') : r < 0.12 ? 'cheer' : r < 0.4 ? 'talk' : r < 0.6 ? 'squat' : 'idle', 6, { face });
  };
}

export const EVENT_ACTS = {
  opera(v, role) {
    const sq = v.V.C.square, E = sq.evening, W = (p) => sq.at(p[0], p[1]);
    if (role === 'singer') { v.char.setItem('fan'); onStage(v, E.singer); v.loop = () => v.do('sing', 12, { face: W([3.5, 6]) }); return; }
    if (role === 'fiddler') { v.char.setItem('huqin'); onStage(v, E.chairL); v.loop = () => { v.seat = 0.45; v.do('fiddle', 10, { face: W([2.6, 4]) }); }; return; }
    audience(v, 'opera');
  },

  meeting(v, role) {
    const sq = v.V.C.square, E = sq.evening, W = (p) => sq.at(p[0], p[1]);
    if (role === 'speaker') { v.char.setItem(null); onStage(v, E.speaker); v.loop = () => v.do('speech', 10, { face: W([3.5, 6]) }); return; }
    if (role === 'clerk') { v.char.setItem('book'); onStage(v, E.chairR); v.loop = () => { v.seat = 0.45; v.do('sit', 10, { face: W([4.6, 4]) }); }; return; }
    audience(v, 'meeting');
  },

  movie(v, role) { // 幕布挂在戏台前檐下，放映机摆在石桌上
    const sq = v.V.C.square;
    if (role === 'projectionist') {
      v.char.setItem(null);
      v.go(sq.spot('projector'));
      v.loop = () => v.do(v.rand() < 0.3 ? 'work' : 'idle', 8, { face: sq.at(...sq.evening.face) }); // 摇放映机、换片子
      return;
    }
    audience(v, 'movie');
  },

  bonfire(v, role) { // 围着火堆：石头、石凳上坐一圈，坐满了外圈站着；讲古的先把火点上
    const sq = v.V.C.square, E = sq.evening, pit = sq.at(...E.pit);
    v.char.setItem(v.p.item === 'pipe' ? 'pipe' : null);
    const name = role === 'storyteller' ? 'ring1' : v.V.claimNear(v, sq, [...E.ring.filter((n) => n !== 'ring1'), ...E.outer], kinOf(v), (n) => sq.spots[n]);
    if (!name) { giveUp(v, 'bonfire'); return; }
    if (role === 'storyteller') v.V.claim(v, sq, ['ring1']);
    const seat = takeSquare(v, name);
    if (role === 'storyteller') {
      v.call(() => { v.V.bonfire.lit = true; });
      v.loop = () => { v.seat = seat.seat; v.do(v.rand() < 0.6 ? 'talk' : 'sit', 6, { face: pit }); }; // 站起来比划着讲，讲累了坐下
      v.end = () => { v.seat = null; v.V.release(v); v.V.bonfire.lit = false; };
      return;
    }
    v.loop = () => {
      if (!seat) { v.do(v.rand() < 0.3 ? 'talk' : kid(v.p) ? 'squat' : 'idle', 8, { face: pit }); return; }
      v.seat = seat.seat;
      v.do(kid(v.p) && !seat.perch ? 'squat' : 'sit', 8, { face: pit });
    };
  },

  market(v, role) { // 村口三个摊子：卖的站在摊子后头吆喝，买的挎着篮子一个摊一个摊地看、讲价
    const sq = v.V.C.square, M = sq.market;
    if (role) {
      const st = M.stalls.find((s) => s.kind === role);
      v.char.setItem(role === 'tofu' ? 'tray' : null);
      v.go(sq.spot(`stall${st.i}_seller`));
      v.loop = () => v.do(R(['talk', 'talk', 'idle', 'work']), 6, { face: sq.at(st.x, st.z) });
      return;
    }
    v.char.setItem('basket');
    v.loop = () => {
      const name = v.V.claim(v, sq, M.buyers, { strict: true }); // 随便挑一个没人站的摊前
      if (name) {
        const st = M.stalls[Number(name.match(/stall(\d)/)[1])];
        v.go(sq.spot(name));
        v.do('talk', 6 + v.rand() * 4, { face: sq.at(st.x, st.z) }); // 挑一挑、讲讲价
        v.call(() => v.V.release(v));
      }
      v.go(sq.randomPoint(sq.playArea)); // 逛一逛，碰见熟人说两句
      v.do(v.rand() < 0.5 ? 'talk' : 'idle', 3 + v.rand() * 3);
    };
  },

  harvest(v, role) { // 场院打场：牛拉着碾子转，大伙儿围着扫场、翻场；孩子在麦秸垛边疯跑
    const th = v.V.C.threshing;
    if (role === 'ox') { ACTIVITIES.thresh(v); return; }
    const center = th.at(0, 0);
    if (kid(v.p)) {
      v.char.setItem(null);
      v.loop = () => { v.go(th.spot(R(th.harvestSpots)), { run: true }); v.do(v.rand() < 0.4 ? 'cheer' : 'idle', 2 + v.rand() * 3, { face: center }); };
      return;
    }
    const spot = v.V.claim(v, th, th.harvestSpots, { strict: true });
    if (!spot) { giveUp(v, 'harvest'); return; }
    v.char.setItem(elder(v.p) ? (v.p.item ?? null) : v.rand() < 0.5 ? 'broom' : 'hoe');
    v.go(th.spot(spot));
    v.loop = () => v.do(elder(v.p) ? (v.rand() < 0.5 ? 'squat' : 'talk') : 'work', 8, { face: center });
  },

  shrine(v, role) { // 桥头土地庙：村长先上头一炷香，大伙儿排着一个个上香磕头，磕完在桥头说会儿话就散
    const S = v.V.shrine;
    v.char.setItem(null);
    const bow = () => { v.go(S.front); v.do('bow', 4, { face: S.at }); v.do('idle', 1.5, { face: S.at }); };
    if (role === 'leader') {
      v.V.claim(v, S, ['front']);
      bow();
      v.call(() => { v.V.release(v); S.opened = v.V.clockDay(); }); // 头一炷香上了，大伙儿才上
      v.go(S.wait[0]);
      v.loop = () => v.do(v.rand() < 0.5 ? 'talk' : 'idle', 6, { face: S.at });
      return;
    }
    let done = false;
    v.loop = () => {
      if (done) { v.leftEvent = `${v.V.clockDay()}/shrine`; v.finish(); return; } // 磕完头就散了
      const opened = S.opened === v.V.clockDay() || v.V.hour() > EVENTS.shrine.from + 0.5; // 村长上完头一炷香（他迟迟不来就不等了）
      if (opened && v.V.claim(v, S, ['front'], { strict: true })) {
        bow();
        v.call(() => { v.V.release(v); done = true; });
        const w = v.V.claim(v, S, S.wait.map((_, i) => `w${i}`), { strict: true });
        if (w) { v.go(S.wait[Number(w.slice(1))]); v.do('talk', 4 + v.rand() * 4, { face: S.at }); } // 磕完在边上说两句
        return;
      }
      const w = v.V.claim(v, S, S.wait.map((_, i) => `w${i}`), { strict: true }); // 排队：每人占一个等的地方，不挤在一块
      if (w) v.go(S.wait[Number(w.slice(1))]);
      v.do(kid(v.p) ? 'squat' : 'idle', 3, { face: S.at });
    };
    v.end = () => v.V.release(v);
  },
};

// ---------------------------------------------------------------- 节日（见 season.js 的 FESTIVALS）

/** 围着火塘那一圈坐（篝火、包粽子、赏月）：石头、石凳坐满了在外圈站着。返回 { seat, face }，占不到返回 null。 */
function ringSeat(v, key, skip = []) {
  const sq = v.V.C.square, E = sq.evening;
  const name = v.V.claimNear(v, sq, [...E.ring.filter((n) => !skip.includes(n)), ...E.outer], kinOf(v), (n) => sq.spots[n]);
  if (!name) { giveUp(v, key); return null; }
  return { seat: takeSquare(v, name) };
}

Object.assign(EVENT_ACTS, {
  chunjie(v) { // 拜年：挨家走到门口，朝着院门说会儿话，再去下一家（不进院、不磕头，动作都是平常的）
    const homes = Object.values(v.V.C).filter((c) => c.gates?.length && c.id !== v.p.home);
    v.char.setItem(v.p.item === 'cane' || v.p.item === 'pipe' ? v.p.item : null);
    v.loop = () => {
      const c = R(homes), [gx, gz] = c.gateOut();
      v.go(v.V.nav.nearestFree(gx + (v.rand() - 0.5) * 1.6, gz + 0.6 + v.rand() * 0.8));
      v.do('talk', 5 + v.rand() * 4, { face: c.at(...c.gate) });
      v.do('idle', 1 + v.rand() * 2);
    };
  },

  qingming(v) { // 上坟：去西坡祖坟，在坟前磕头、烧纸，站一会儿说说话；孩子在地头放风筝
    const G = v.V.graves;
    if (kid(v.p) || !G) {
      v.char.setItem('kite');
      const fields = v.V.playFields;
      v.loop = () => { v.go(R(fields), { run: true }); v.do('work', 6 + v.rand() * 4); };
      return;
    }
    v.char.setItem(v.p.item === 'cane' ? 'cane' : 'basket'); // 挎着篮子：纸钱、供品
    let done = false;
    v.loop = () => {
      if (done) { v.leftEvent = `${v.V.clockDay()}/qingming`; v.finish(); return; } // 磕完头、说两句话就回去了
      const name = v.V.claim(v, G, G.spots.map((_, i) => `g${i}`), { strict: true });
      if (name) {
        const sp = G.spots[Number(name.slice(1))];
        v.go(sp.at);
        v.do('bow', 4, { face: sp.face });
        v.do('work', 3, { face: sp.face }); // 添土、压纸
        v.call(() => { v.V.release(v); done = true; });
      }
      v.go(v.V.nav.nearestFree(G.at[0] + (v.rand() - 0.5) * 7, G.at[1] + 2.5 + v.rand() * 2.5)); // 等着、磕完了在坟前稍远处站一会儿
      v.do(v.rand() < 0.5 ? 'talk' : 'idle', 4, { face: G.at });
    };
  },

  duanwu(v, role) { // 包粽子：妇女、老人围着火塘坐一圈，手里端着盆包；孩子跑着玩；男人站在外圈说话
    const sq = v.V.C.square, pit = sq.at(...sq.evening.pit);
    if (kid(v.p)) { v.char.setItem(null); v.loop = () => { v.go(sq.randomPoint(sq.playArea), { run: true }); v.do(v.rand() < 0.4 ? 'cheer' : 'idle', 2 + v.rand() * 3, { face: pit }); }; return; }
    if (v.p.sex === '男' && !elder(v.p)) { v.char.setItem(v.p.item === 'pipe' ? 'pipe' : null); v.loop = () => { v.go(sq.randomPoint(sq.playArea)); v.do('talk', 6, { face: pit }); }; return; }
    v.char.setItem('bowl');
    const r = ringSeat(v, 'duanwu');
    if (!r) return;
    v.loop = () => { if (r.seat) { v.seat = r.seat.seat; v.do(v.rand() < 0.3 ? 'talk' : 'sit', 8, { face: pit }); } else v.do('work', 8, { face: pit }); };
  },

  zhongqiu(v, role) { // 赏月：村长先在石桌供前拜月，大伙儿围坐火塘一圈（不点火）吃月饼说话；孩子提着灯笼满场跑
    const sq = v.V.C.square, table = sq.at(-0.4, 3.6), moon = sq.at(30, 0); // 月亮从东边升起来
    if (role === 'leader') {
      v.char.setItem(null);
      v.go(sq.spot('table'));
      v.do('bow', 4, { face: table });
      v.go(sq.spot('tableE')); // 拜完挪到石桌边坐（别堵着石桌南边的过道）
      v.loop = () => { v.seat = 0.45; v.do('sit', 10, { face: moon }); };
      return;
    }
    if (kid(v.p)) {
      v.char.setItem('lantern'); // 提着小红灯笼（不加光晕：一群孩子的光晕叠在一起，整个场子都发红）
      v.loop = () => { v.go(sq.randomPoint([-2, 0.6, 3.6, 2.4])); v.do('idle', 5 + v.rand() * 4, { face: moon }); }; // 只在戏台前那块空地转（别在坐着的人中间穿）
      return;
    }
    v.char.setItem(v.p.item === 'pipe' ? 'pipe' : null);
    const r = ringSeat(v, 'zhongqiu');
    if (!r) return;
    v.loop = () => { if (r.seat) { v.seat = r.seat.seat; v.do(v.rand() < 0.25 ? 'eat' : v.rand() < 0.4 ? 'talk' : 'sit', 8, { face: moon }); } else v.do(v.rand() < 0.4 ? 'talk' : 'idle', 8, { face: moon }); };
  },
});

/** 让 v 参加今天的活动。 */
export function joinEvent(v, key) {
  const role = roleOf(key, v.p);
  v.doing = role ? `${key}:${role}` : key;
  v.end = () => { v.seat = null; v.V.release(v); };
  EVENT_ACTS[key](v, role);
}
