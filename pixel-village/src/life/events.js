import { ACTIVITIES, R } from './activities.js';

/*
 * 每天一样全村的活动，有白天的也有晚上的，按天轮：
 *   唱戏 → 赶集 → 篝火讲古 → 打场 → 放露天电影 → 祭土地 → 开村会 → ……（?event= 指定）
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
    name: '打场', place: '场院', from: 14.0, to: 17.5, prep: 0.5, stay: ['zheng_laotou'],
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
};
export const ORDER = ['opera', 'market', 'bonfire', 'harvest', 'movie', 'shrine', 'meeting'];
export const EVENT_NAMES = Object.fromEntries(Object.entries(EVENTS).map(([k, e]) => [k, e.name]));
export const fmt = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** 字符串 → [0, 1) 的固定随机数（同一天、同一个人结果不变）。 */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export const eventOf = (day, forced) => forced ?? ORDER[(day - 1) % ORDER.length];
export const roleOf = (key, p) => EVENTS[key].roles[p.id] ?? null;
export const attends = (p, key, day) => !!roleOf(key, p) || (!EVENTS[key].stay?.includes(p.id) && hash(`${day}/${p.id}/${key}`) < EVENTS[key].prob(p)); // stay：手上有买卖走不开的

/** 这会儿 v 该不该在活动上：今天的活动、在时间窗里（有角色的提前到）、自己去、还没提前散。 */
export function eventNow(v, hour) {
  const V = v.V, key = V.today(), e = EVENTS[key], day = V.clockDay();
  const from = e.from - (roleOf(key, v.p) ? e.prep : 0);
  if (hour < from || hour >= e.to || v.leftEvent === `${day}/${key}` || !attends(v.p, key, day)) return null;
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
  const spot = v.V.claim(v, sq, pool, { ordered: true, strict: true });
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
    const name = role === 'storyteller' ? 'ring1' : v.V.claim(v, sq, [...E.ring.filter((n) => n !== 'ring1'), ...E.outer], { ordered: true, strict: true });
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

/** 让 v 参加今天的活动。 */
export function joinEvent(v, key) {
  const role = roleOf(key, v.p);
  v.doing = role ? `${key}:${role}` : key;
  v.end = () => { v.seat = null; v.V.release(v); };
  EVENT_ACTS[key](v, role);
}
