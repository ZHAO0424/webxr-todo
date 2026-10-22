import { makeRng } from '../pixel.js';
import { friendsOf } from '../residents.js';
import { BOUNDS } from '../layout.js';
// ---------------------------------------------------------------- 活动
// 每个活动往村民的任务队列里塞一串任务；loop 是任务做完后（活动还没到点结束时）接着做什么。

const WORK = { // 各家默认的干活位置、手里的家伙、朝哪儿
  smith: { spot: 'anvil', item: 'hammer', face: [-1.6, 3.5] }, // 面朝露天里的铁砧
  carpenter: { spot: 'work', item: 'saw', face: [4.7, 1.6] },
  tofu: { spot: 'stove', item: 'ladle', face: [3.6, 0.9] },
  store: { spot: 'counter', item: null, state: 'idle', face: [-1.2, 10] },
  doctor: { spot: 'herbs', item: 'box', face: [3.6, 0.8] },
  square: { spot: 'barber', item: 'box', face: [-1.6, -3.7] },
  school: { spot: 'teach', item: 'book', state: 'talk', face: [0, 4] },
};

const pick = makeRng(7); // 带种子：同样的设置每次模拟结果都一样，问题能复现
/** 一家人 + 要好的（闲聊、看戏挨着）。 */
export function kinOf(v) {
  const ids = new Set(friendsOf(v.p.id));
  for (const o of v.V.people) if (o !== v && o.p.home === v.p.home) ids.add(o.p.id);
  return ids;
}

export const R = (a) => a[Math.floor(pick() * a.length)];

/** 骡帮不在村里（还没来 / 已经走了）：人和骡子都藏起来。 */
function caravanAway(v, mules) {
  v.inside = true;
  v.object.visible = false;
  for (const b of mules) { b.home = true; b.follow = null; b.object.visible = false; }
}

/** 自家门口墙根底下一个没人占的位置（没有就 null）。 */
function wallSpot(v, { sill = false } = {}) { // 门槛上、门口墙根底下的座位；sill：先坐门槛，坐满了再坐墙根
  const c = v.home, spots = [...(c.sillSpots ?? []), ...(c.wallSpots ?? [])];
  const name = spots.length ? v.V.claim(v, c, spots.map((_, i) => `door${i}`), { strict: true, ordered: sill }) : null;
  return name ? spots[Number(name.slice(4))] : null;
}

/**
 * 天黑了人还在西沟深处（离村子 30 米开外，赶回去太远）：就近在水磨坊、山神庙里过一夜，第二天一早从那儿出来。
 * 吃晚饭、晚上闲逛、回家睡觉这几样开头先问一声；返回 true 就是留在西沟了。
 */
function lodgeWest(v) {
  const V = v.V;
  if (v.p.caravan || V.hour() < 17 || v.pos.x > BOUNDS.x0 - 30) return false;
  const spots = [V.mill.at, V.temple.at], d = (p) => Math.hypot(p[0] - v.pos.x, p[1] - v.pos.z);
  v.char.setItem(null);
  v.go(d(spots[0]) < d(spots[1]) ? spots[0] : spots[1]);
  v.tasks.push({ type: 'inside' });
  return true;
}

/** 坐到村口石桌边的石墩上：先走到石墩外头（导航管得到的地方），再直线上去；起身时原路下来。 */
export function toStool(v, name) {
  const sq = v.V.C.square, [x, z] = sq.at(...sq.stools[name]);
  v.go(sq.spot(name));
  v.climb([[x, z, 0]], [[...sq.spot(name), 0]]);
}

export const ACTIVITIES = {
  idle(v) { v.loop = () => v.do('idle', 5); },

  home(v) { if (lodgeWest(v)) return; v.char.setItem(null); v.enter(v.bed, 'house'); },

  cook(v) {
    v.char.setItem(null);
    v.enter(v.home, 'kitchen');
    v.V.cooking.add(v.home.id);
    v.end = () => v.V.cooking.delete(v.home.id);
  },

  work(v, arg) {
    const W = WORK[v.p.home] ?? {};
    if (arg === 'sweep') {
      v.char.setItem('broom');
      v.loop = () => { v.go(v.home.spot(R(['sweepA', 'sweepB']))); v.do('work', 6); };
      return;
    }
    if (arg === 'bellows') { v.char.setItem(null); v.go(v.home.spot('bellows')); v.loop = () => v.do('work', 8, { face: v.home.at(-3.4, 2.6) }); return; }
    if (arg === 'stove') { v.char.setItem('ladle'); v.go(v.home.spot('stove')); v.loop = () => v.do('work', 8, { face: v.home.at(3.6, 0.9) }); return; }
    if (arg === 'work' && v.p.home === 'tofu') { v.go(v.home.spot('mill')); v.loop = () => v.do('idle', 8, { face: v.home.at(-3.2, 1.6) }); return; } // 小孩看驴推磨
    v.char.setItem(W.item === undefined ? v.p.item : W.item);
    v.go(v.home.spot(W.spot ?? 'yard'));
    const face = W.face ? v.home.at(...W.face) : null;
    if (v.p.home === 'square') { ACTIVITIES.barber(v); return; } // 剃头匠（见 barber.js）
    v.loop = () => v.do(W.state ?? 'work', 8, { face });
  },

  fetchWater(v) {
    v.char.setItem('buckets');
    v.go(v.V.well.spot());
    v.do('work', 5, { face: v.V.well.center });
    v.go(v.home.door('kitchen'));
    v.do('idle', 2);
    v.item(v.p.item ?? null);
    v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); };
  },

  feedChickens(v) {
    v.char.setItem('basket');
    v.go(v.home.spot('feedChickens'));
    v.call(() => v.V.attract.set(`${v.home.id}:chicken`, v));
    v.do('scatter', 18);
    v.call(() => v.V.attract.delete(`${v.home.id}:chicken`));
    v.end = () => v.V.attract.delete(`${v.home.id}:chicken`);
    v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); };
  },

  feedPigs(v) {
    v.char.setItem('bucket');
    v.go(v.home.spot('feedPigs'));
    v.call(() => v.V.attract.set(`${v.home.id}:pig`, v));
    v.do('work', 12);
    v.call(() => v.V.attract.delete(`${v.home.id}:pig`));
    v.end = () => v.V.attract.delete(`${v.home.id}:pig`);
    v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); };
  },

  feedRabbits(v) { v.char.setItem('basket'); v.go(v.home.spot('rabbits')); v.do('work', 14); v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); }; },

  yardWork(v) {
    v.char.setItem('broom');
    v.loop = () => { v.go(v.home.randomPoint()); v.do('work', 5); };
  },

  shopping(v) {
    v.char.setItem('basket');
    const store = v.V.C.store;
    v.go(() => store.spot(v.V.claim(v, store, ['customer', 'customer2'])));
    v.do('talk', 8, { face: store.spot('counter') });
    v.call(() => v.V.release(v));
    v.go(v.home.spot('yard'));
    v.loop = () => v.do('idle', 6);
  },

  visit(v, who) {
    const c = v.V.C[who];
    v.char.setItem(v.p.item ?? null);
    v.go(c.spot('yard') ?? c.gateOut());
    v.do('talk', 22);
    v.go(v.home.spot('yard') ?? v.home.gateOut());
    v.loop = () => v.do('idle', 6);
  },

  patrol(v) { // 村长在村里转一圈，见人说两句
    const stops = ['well', 'mid', 'gate:square', 'east', 'e1', 'L1', 'w1', 'gate:store'];
    v.loop = () => { const n = v.V.nodes[R(stops)]; v.go([n.x, n.z]); v.do('talk', 5); };
  },

  chess(v) {
    v.char.setItem(v.p.item ?? null);
    const sq = v.V.C.square;
    const seat = v.p.id === 'wang_deshan' ? 'tableW' : 'tableE';
    toStool(v, seat);
    v.loop = () => { v.seat = 0.45; v.do('sit', 10, { face: sq.at(-0.4, 3.6) }); };
    v.end = () => { v.seat = null; };
  },

  dinner(v) { // 北方的"饭场"：端着碗坐在自家门槛上、门口墙根底下吃，脸朝外看着街上（不坐在路上）
    if (lodgeWest(v)) return;
    v.char.setItem('bowl');
    const c = v.home, spot = wallSpot(v, { sill: true });
    const [gx, gz] = c.gate, k = 4 / Math.hypot(gx, gz), out = c.at(gx * (1 + k), gz * (1 + k)); // 从院子当中往院门外
    const at = spot ? spot.at : v.V.nav.nearestFree(...c.at(gx + 1.6, gz)); // 都占满了：门外路边
    v.go(at);
    v.loop = () => { v.seat = spot?.seat ?? 0.1; v.do('sit', 8, { face: spot ? spot.face : out }); }; // 没座位的盘腿坐在地上
    v.end = () => { v.seat = null; v.char.setItem(v.p.item ?? null); v.V.release(v); };
  },

  evening(v) { // 没有晚上的活动时：吃过晚饭，有的到大槐树下围一圈闲聊，有的坐自家门口，有的早早歇了
    if (lodgeWest(v)) return;
    if (v.p.body === 'child') { ACTIVITIES.play(v); v.doing = 'play'; return; }
    const r = v.rand(), sq = v.V.C.square;
    const spot = r < 0.45 ? v.V.claimNear(v, sq, sq.chat, kinOf(v), (n) => sq.spots[n]) : null; // 挨着自家人、老伙计坐
    if (!spot) { v.doing = r < 0.75 ? 'sitGate' : 'home'; ACTIVITIES[v.doing](v); return; }
    v.doing = 'chat';
    v.char.setItem(v.p.item === 'pipe' ? 'pipe' : null);
    v.go(sq.spot(spot));
    const c = sq.at(...sq.chatCenter);
    v.loop = () => v.do(v.rand() < 0.5 ? 'talk' : v.p.age >= 60 ? 'squat' : 'idle', 6, { face: c });
    v.end = () => v.V.release(v);
  },

  school(v) {
    const s = v.V.C.school;
    v.char.setItem(v.p.item === 'book' ? 'book' : null);
    v.go(() => s.spot(v.V.claim(v, s, ['seat1', 'seat2', 'seat3', 'seat4', 'seat5'])));
    v.loop = () => { v.seat = 0.5; v.do('sit', 10, { face: s.spot('teach') }); };
    v.end = () => { v.seat = null; v.V.release(v); };
  },

  teach(v) { const s = v.V.C.school; v.char.setItem('book'); v.go(s.spot('teach')); v.loop = () => v.do('talk', 10, { face: s.at(0, 4) }); },

  read(v) { v.char.setItem('book'); v.go((v.p.home === 'school' ? v.home : v.home).spot('yard')); v.loop = () => v.do('idle', 10); },

  play(v) { // 孩子们：围着货郎、追着别的孩子，在村口空场疯跑，去溪边玩水、去地里逮蚂蚱
    v.char.setItem(v.p.item === 'kite' ? 'kite' : null);
    const sq = v.V.C.square;
    v.loop = () => {
      const peddler = v.V.byId.qian_xiaoer;
      if (peddler && !peddler.inside && peddler.state !== 'walk' && peddler.doing === 'peddle' && v.rand() < 0.3) {
        v.go(() => [peddler.pos.x + (v.rand() - 0.5) * 2, peddler.pos.z + 1 + v.rand()], { run: true });
        v.do('idle', 6, { face: [peddler.pos.x, peddler.pos.z] });
        return;
      }
      const mates = v.V.people.filter((o) => o !== v && o.doing === 'play' && !o.inside);
      const pals = mates.filter((o) => friendsOf(v.p.id).includes(o.p.id)); // 先找自己那一伙的玩伴
      const r = v.rand();
      if (mates.length && r < 0.35) { // 跟着别的孩子跑
        const m = R(pals.length && v.rand() < 0.75 ? pals : mates);
        v.go(() => [m.pos.x + 0.8, m.pos.z + 0.6], { run: true });
        v.do('idle', 1 + v.rand() * 2);
      } else if (r < 0.55 && v.V.streamBank.length) { // 溪边：蹲着玩水、扔石子
        const [x, z] = R(v.V.streamBank);
        v.go([x, z], { run: true });
        v.do('squat', 5 + v.rand() * 5, { face: [x, z + 3] });
        if (v.rand() < 0.5) v.do('scatter', 2, { face: [x, z + 3] }); // 打水漂
      } else if (r < 0.75 && v.V.playFields.length) { // 地里：在庄稼垄里钻来钻去、蹲下逮蚂蚱
        v.go(R(v.V.playFields), { run: true });
        v.do(v.rand() < 0.5 ? 'squat' : 'idle', 2 + v.rand() * 3);
        v.go(R(v.V.playFields), { run: true });
      } else {
        v.go(sq.randomPoint(sq.playArea), { run: true });
        v.do('idle', 1 + v.rand() * 3);
      }
    };
  },

  chore(v, what) { (ACTIVITIES[what] ?? ACTIVITIES.idle)(v); },

  field(v, node) {
    v.char.setItem(v.p.item === 'pole' ? 'basket' : v.p.item === 'hoe' ? 'hoe' : 'basket');
    const cells = v.V.fields[node] ?? [];
    v.loop = () => { if (cells.length) { v.go(R(cells)); v.do('work', 10); } else v.do('idle', 5); };
  },

  haul(v) { // 挑着谷子往家送
    v.char.setItem('pole');
    v.loop = () => { v.go(R(v.V.fields.fieldE)); v.do('work', 4); v.go(v.home.spot('yard')); v.do('work', 3); };
  },

  thresh(v, arg) {
    const th = v.V.C.threshing;
    if (arg === 'help') {
      v.char.setItem('broom');
      v.go(th.spot('work2'));
      v.loop = () => v.do('work', 8, { face: th.at(0, 0) });
      return;
    }
    const ox = v.V.beasts.find((b) => b.s.role === 'ox');
    v.char.setItem('whip');
    v.go(v.home.spot('manger'));
    v.call(() => { if (ox) ox.follow = v; });
    v.go(th.spot('center'));
    v.call(() => { if (ox) { ox.follow = null; ox.circling = th; } v.V.spin.add('roller'); });
    v.loop = () => v.do('work', 8, { face: th.at(0, 0) });
    v.end = () => { if (ox) { ox.circling = null; if (ox.follow === v) ox.follow = null; } v.V.spin.delete('roller'); };
  },

  oxHome(v) {
    const ox = v.V.beasts.find((b) => b.s.role === 'ox');
    const th = v.V.C.threshing;
    v.char.setItem('whip');
    v.call(() => { if (ox) { ox.circling = null; } });
    v.go(th.spot('center'));
    v.call(() => { if (ox) ox.follow = v; });
    v.go(v.home.spot('manger'));
    v.call(() => { if (ox) ox.follow = null; });
    v.end = () => { if (ox?.follow === v) { ox.follow = null; ox.returning = true; } };
    v.item(v.p.item);
    v.loop = () => { v.go(v.home.spot('yard')); v.do('idle', 6); };
  },

  herd(v) { // 羊倌：开圈，领着羊上山坡吃草
    const sheep = v.V.beasts.filter((b) => b.s.role === 'sheep');
    v.char.setItem('whip');
    v.go(v.home.spot('penGate'));
    v.call(() => sheep.forEach((s, i) => { s.follow = v; s.slot = i; }));
    v.go(R(v.V.pasture));
    v.call(() => sheep.forEach((s) => { s.follow = null; s.graze = [v.pos.x, v.pos.z]; }));
    v.end = () => sheep.forEach((s) => { if (s.follow === v) { s.follow = null; s.graze = [v.pos.x, v.pos.z]; } });
    v.loop = () => { v.do(v.rand() > 0.5 ? 'talk' : 'idle', 12); };
  },

  herdHome(v) {
    const sheep = v.V.beasts.filter((b) => b.s.role === 'sheep');
    v.char.setItem('whip');
    v.call(() => sheep.forEach((s, i) => { s.graze = null; s.follow = v; s.slot = i; }));
    v.go(v.home.spot('penGate'));
    v.call(() => sheep.forEach((s) => { s.follow = null; s.returning = true; s.target = null; })); // 掉队的自己回圈
    v.end = () => sheep.forEach((s) => { if (s.follow === v) { s.follow = null; s.returning = true; s.target = null; } }); // 没赶到家就到点了：羊自己回圈
    v.go(v.home.spot('yard'));
    v.loop = () => v.do('idle', 6);
  },

  grind(v) {
    v.char.setItem('ladle');
    v.go(v.home.spot('mill'));
    v.call(() => { v.V.spin.add('mill'); const d = v.V.beasts.find((b) => b.s.role === 'donkey'); if (d) d.circling = v.home; });
    v.loop = () => v.do('idle', 8, { face: v.home.at(-3.2, 1.6) });
    v.end = () => { v.V.spin.delete('mill'); const d = v.V.beasts.find((b) => b.s.role === 'donkey'); if (d) d.circling = null; };
  },

  boil(v) {
    v.char.setItem('ladle');
    v.go(v.home.spot('stove'));
    v.call(() => v.V.steaming.add(v.home.id));
    v.loop = () => v.do('work', 8, { face: v.home.at(3.6, 0.9) });
    v.end = () => v.V.steaming.delete(v.home.id);
  },

  sellTofu(v) { const sq = v.V.C.square; v.char.setItem('tray'); v.go(sq.spot('tofu')); v.loop = () => v.do(v.rand() > 0.5 ? 'talk' : 'idle', 8); },

  tendBees(v) { v.char.setItem(null); v.go(v.home.spot('bees')); v.loop = () => v.do('work', 8); },

  peddle(v) { // 货郎：挨家挨户在门口停一停
    const stops = ['store', 'headman', 'farmB', 'tofu', 'smith', 'carpenter', 'farmA', 'doctor', 'school', 'farmC'];
    v.char.setItem('peddler');
    v.loop = () => { v.go(v.V.C[R(stops)].gateOut()); v.do(v.rand() < 0.5 ? 'work' : 'talk', 14); }; // 停在门口：摇拨浪鼓吆喝 / 跟人搭话
  },

  peddlerChat(v) {
    const pd = v.V.byId.qian_xiaoer;
    v.go(() => (pd && !pd.inside ? [pd.pos.x + 0.9, pd.pos.z + 0.4] : v.home.spot('yard')));
    v.do('talk', 20, { face: pd ? [pd.pos.x, pd.pos.z] : null });
    v.go(v.home.spot('yard'));
    v.loop = () => v.do('idle', 6);
  },

  deliver(v, who) {
    v.char.setItem('box');
    v.go(v.V.C[who].gateOut());
    v.do('talk', 6);
    v.go(v.home.spot('sweepA'));
    v.item('broom');
    v.loop = () => v.do('idle', 6);
  },

  gatherDucks(v) { // 去溪边把鸭鹅赶回家
    const flock = v.V.beasts.filter((b) => (b.s.role === 'duck' || b.s.role === 'goose') && !b.home);
    const farm = v.V.C.farmC;
    v.char.setItem(v.p.item === 'broom' ? 'broom' : null);
    v.go(v.V.duckWater);
    v.call(() => flock.forEach((b, i) => { b.follow = v; b.slot = i; }));
    v.go(farm.spot('duckHouse'));
    v.call(() => flock.forEach((b) => { b.follow = null; b.home = true; b.object.visible = false; }));
    v.end = () => flock.forEach((b) => { if (b.follow === v) b.follow = null; });
    v.loop = () => { v.go(farm.spot('yard')); v.do('idle', 6); };
  },

  sitGate(v) { // 坐在自家门槛上、门口的墙根底下
    v.char.setItem(v.p.item ?? null);
    const spot = wallSpot(v);
    const [gx, gz] = v.home.gateOut();
    v.go(spot ? spot.at : v.V.nav.nearestFree(gx + 1.2, gz + 0.3));
    v.loop = () => { v.seat = spot?.seat ?? 0.3; v.do('sit', 10, { face: spot ? spot.face : [gx + 1.2, gz + 4] }); };
    v.end = () => { v.seat = null; v.V.release(v); };
  },

  garden(v) { v.char.setItem('hoe'); v.go(v.home.spot('garden')); v.loop = () => v.do('work', 8); },

  laundry(v) { // 去溪边洗衣裳：挎着一篮子衣裳，蹲在溪边搓洗，洗完回院里晾
    v.char.setItem('basket');
    const banks = v.V.streamBank;
    const name = banks.length ? v.V.claim(v, v.V.bankClaims, banks.map((_, i) => `b${i}`), { strict: true }) : null;
    if (!name) { ACTIVITIES.yardWork(v); return; }
    const [x, z] = banks[Number(name.slice(1))];
    v.go([x, z]);
    v.item(null);
    v.do('wash', 16, { face: [x, z + 3] });
    v.call(() => v.V.release(v));
    v.item('basket');
    v.go(v.home.spot('yard'));
    v.item(null);
    v.do('work', 5); // 晾衣裳
    v.loop = () => { v.go(v.home.randomPoint()); v.do('idle', 5); };
    v.end = () => v.V.release(v);
  },

  worship(v) { // 去西沟的山神庙上香：走挂壁古道，爬上崖里凿的石阶，在庙门前作揖、站一会儿
    const T = v.V.temple;
    v.go(T.at);
    v.call(() => T.light?.(v.V.hour())); // 插上香，香炉才冒烟
    v.do('bow', 3, { face: T.face });
    v.loop = () => v.do('idle', 6, { face: T.face });
  },

  caravan(v) { // 骡帮：逢集那天一早从山外进来——顺着西沟崖脚、走挂壁古道、过羊圈进村，在村口西边歇脚做买卖；平常不在村里
    const V = v.V, K = V.caravan, lead = v.p.caravan === 'lead', mules = lead ? V.beasts.filter((b) => b.s.caravan === v.p.id) : [];
    if (V.today() !== 'market' || V.weather() === 'rain' || V.hour() >= 11.5) { caravanAway(v, mules); return; }
    const [ex, ez] = K.route[0]; // 沙盘西边沿：牛老大打头，骡子跟着，石娃殿后（都从沙盘里面一点起步）
    const at = (dx) => V.nav.nearestFree(ex + dx, ez);
    const [sx, sz] = at(lead ? 3.2 : 0.4);
    v.pos.set(sx, 0, sz);
    v.placed = false;
    mules.forEach((b, i) => { const [x, z] = at(2.4 - i * 0.7); b.home = false; b.object.visible = true; b.pos.set(x, 0, z); b.placed = false; b.follow = v; b.slot = i; });
    for (const p of K.route.slice(1)) v.go(p);
    v.go(K.stand[lead ? 0 : 1]);
    v.call(() => mules.forEach((b) => { b.follow = null; b.target = null; })); // 到了：骡子在旁边空地上站着
    v.loop = () => v.do(v.rand() > 0.5 ? 'talk' : 'idle', 8, { face: K.face });
  },

  caravanHome(v) { // 散了集，骡帮原路回山外（沿着挂壁古道出西沟）
    const V = v.V, K = V.caravan, lead = v.p.caravan === 'lead', mules = lead ? V.beasts.filter((b) => b.s.caravan === v.p.id) : [];
    if (!mules.some((b) => !b.home) && !(v.p.caravan === 'helper' && V.today() === 'market' && V.weather() !== 'rain')) { caravanAway(v, mules); return; }
    mules.forEach((b, i) => { b.follow = v; b.slot = i; });
    for (const p of [...K.route].reverse()) v.go(p);
    v.call(() => caravanAway(v, mules));
  },

  mill(v) { // 去西沟的水磨坊磨面：背一口袋粮食去，放下袋子，站在磨台边守着（往斗里添粮、扫磨下来的面）
    const m = v.V.mill;
    v.char.setItem(null);
    v.char.setBack('sack');
    v.go(m.at);
    v.back(null);
    v.item('basket');
    v.loop = () => v.do('work', 10, { face: m.face });
  },

  firewood(v) { // 进山砍柴：扛着斧子上坡，砍一阵，背一捆柴回家
    const woods = v.V.woods;
    if (!woods.length) { ACTIVITIES.field(v, 'fieldW'); return; }
    const spot = woods[Math.floor(v.rand() * woods.length)];
    v.char.setItem('axe');
    v.go(spot.at);
    v.do('work', 14, { face: spot.tree });
    v.back('firewood'); // 砍下来的柴捆成一捆背回家，斧子拎在手里
    v.go(v.home.spot('yard'));
    v.back(null);
    v.item(null);
    v.do('work', 3);
    v.loop = () => { v.go(v.home.randomPoint()); v.do('idle', 6); };
  },

  // ---------------------------------------------------------------- 四季的农活（variety.js 按季节把日程里的 field / haul 等换成这些）

  sow(v, node) { // 春：挎着篮子下地点种，一把一把往垄沟里撒
    v.char.setItem('basket');
    const cells = v.V.fields[node] ?? [];
    v.loop = () => { if (cells.length) { v.go(R(cells)); v.do('scatter', 8); } else v.do('idle', 5); };
  },

  plowHoe(v, node) { // 春：扛着锄头翻地、打垄
    v.char.setItem('hoe');
    const cells = v.V.fields[node] ?? [];
    v.loop = () => { if (cells.length) { v.go(R(cells)); v.do('work', 10); } else v.do('idle', 5); };
  },

  weed(v, node) { // 夏：顶着日头锄草（"锄禾日当午"）
    ACTIVITIES.plowHoe(v, node);
  },

  reapWheat(v, node) { // 夏：拿镰刀割麦，割一阵就背一捆麦个子送到场院
    const F = v.V.fields, cells = { fieldW: F.wheatW, fieldE: F.wheatE }[node]?.length ? { fieldW: F.wheatW, fieldE: F.wheatE }[node] : F[node] ?? [];
    const th = v.V.C.threshing;
    v.char.setItem('sickle');
    v.loop = () => {
      if (!cells.length) { v.do('idle', 5); return; }
      v.go(R(cells));
      v.do('work', 12);
      if (v.rand() < 0.45 && th) {
        v.back('sheaf');
        v.go(th.randomPoint());
        v.back(null);
        v.do('idle', 2);
      }
    };
  },

  carrySheaves(v) { // 夏：把地里割好的麦个子一捆捆背到场院
    const F = v.V.fields, cells = [...(F.wheatE ?? []), ...(F.wheatW ?? [])], th = v.V.C.threshing;
    v.char.setItem(null);
    v.loop = () => {
      if (!cells.length || !th) { v.do('idle', 5); return; }
      v.go(R(cells));
      v.do('work', 3);
      v.back('sheaf');
      v.go(th.randomPoint());
      v.back(null);
      v.do('work', 2);
    };
  },

  reap(v, node) { // 秋：割谷子、割高粱
    const F = v.V.fields, cells = { fieldW: F.milletW, fieldE: F.milletE }[node]?.length ? { fieldW: F.milletW, fieldE: F.milletE }[node] : F[node] ?? [];
    v.char.setItem('sickle');
    v.loop = () => { if (cells.length) { v.go(R(cells)); v.do('work', 12); } else v.do('idle', 5); };
  },

  pickCorn(v, node) { // 秋：背着背篓掰玉米，掰满一篓背回家倒在院里
    const F = v.V.fields, cells = { fieldW: F.cornW, fieldE: F.cornE }[node]?.length ? { fieldW: F.cornW, fieldE: F.cornE }[node] : F[node] ?? [];
    v.char.setItem(null);
    v.char.setBack('basket');
    v.loop = () => {
      if (!cells.length) { v.do('idle', 5); return; }
      v.go(R(cells)); v.do('work', 8);
      v.go(R(cells)); v.do('work', 8);
      v.back('basket:corn');
      v.go(v.home.spot('yard'));
      v.do('work', 2);
      v.back('basket');
    };
  },

  haulManure(v) { // 春：挑着粪筐往地里送粪
    v.char.setItem('pole');
    const cells = [...(v.V.fields.fieldE ?? []), ...(v.V.fields.fieldW ?? [])];
    v.loop = () => { v.go(v.home.spot('yard')); v.do('work', 3); if (cells.length) { v.go(R(cells)); v.do('work', 4); } };
  },

  sweepSnow(v) { // 冬：雪后扫院子（男的拿木锨铲，女的、老人拿扫帚扫）
    v.char.setItem(v.p.sex === '男' && v.p.age < 60 ? 'shovel' : 'broom');
    v.loop = () => { // 一块一块地扫：挑院里离自己近的一处（路短，一家几口都在院里扫也不来回挤）
      const pts = [v.home.randomPoint(), v.home.randomPoint(), v.home.randomPoint()];
      v.go(pts.reduce((a, b) => (Math.hypot(b[0] - v.pos.x, b[1] - v.pos.z) < Math.hypot(a[0] - v.pos.x, a[1] - v.pos.z) ? b : a)));
      v.do('work', 14);
    };
  },

  gatherDung(v) { // 冬：背着粪筐、拿着粪杈沿路拾粪（冬闲时攒肥，开春上地）
    v.char.setItem('fork');
    v.char.setBack('basket:dung');
    const [hx, hz] = v.home.gateOut(), N = v.V.nodes; // 自家附近的几条路上转（30 米以内的路口）
    const names = Object.keys(N).filter((n) => !n.startsWith('gate:') && N[n].x > -45 && Math.hypot(N[n].x - hx, N[n].z - hz) < 30);
    if (!names.length) { ACTIVITIES.sweepSnow(v); return; }
    v.loop = () => {
      const nd = v.V.nodes[R(names)];
      v.go(v.V.nav.nearestFree(nd.x, nd.z));
      v.do('work', 2.5);
    };
  },

  /**
   * 搬条凳（where：'stack' 摞到场子东边腾地方 / 'row' 摆回戏台前）：一条一条扛在肩上搬，几个人一起搬时各搬各的。
   * 搬完 then(v)（默认回日程）。中途被叫走，肩上那条直接放到要去的地方，不会丢。
   */
  moveBenches(v, where, then = (vv) => { if (vv.V.benches.mover === vv) vv.V.benches.mover = null; vv.finish(); }) {
    const B = v.V.benches;
    let carrying = null;
    v.char.setItem(null);
    const end0 = v.end;
    v.end = () => { if (carrying != null) B.put(carrying, where); carrying = null; v.char.setBack(null); v.V.release(v); if (B.mover === v) B.mover = null; end0?.(); };
    v.loop = () => {
      const name = v.V.claim(v, B, B.todo(where).map((i) => `b${i}`), { strict: true });
      if (!name) { if (B.allAt(where) || !B.todo(where).length) then(v); else v.do('idle', 2); return; }
      const i = Number(name.slice(1)), from = B.where(i);
      v.go(B.pickAt(i));
      v.do('work', 1.2, { face: B.face(i, from) });
      v.call(() => { B.take(i); carrying = i; v.char.setBack('bench'); });
      v.go(B.dropAt(i, where));
      v.do('work', 1.2, { face: B.face(i, where) });
      v.call(() => { B.put(i, where); carrying = null; v.char.setBack(null); v.V.release(v); });
    };
  },

  visitFriend(v, who) { // 老人去老伙计家串门：找到他（在家就进院，不在家就在门口等一会儿）
    const f = v.V.byId[who];
    v.char.setItem(v.p.item ?? null);
    const c = f?.home ?? v.home;
    v.go(() => (f && !f.inside && Math.hypot(f.pos.x - c.at(0, 0)[0], f.pos.z - c.at(0, 0)[1]) < 12 ? v.V.nav.nearestFree(f.pos.x + 0.9, f.pos.z + 0.5) : c.spot('yard') ?? c.gateOut()));
    v.loop = () => v.do('talk', 8, { face: f && !f.inside ? [f.pos.x, f.pos.z] : null });
  },

  putOutTorches(v) { // 天亮了：小六子挨个把路口的火把熄了
    v.char.setItem(null);
    const order = [...v.V.torches].sort((a, b) => Math.hypot(a.pos[0] - v.pos.x, a.pos[1] - v.pos.z) - Math.hypot(b.pos[0] - v.pos.x, b.pos[1] - v.pos.z));
    for (const tr of order) {
      v.go(v.V.nav.nearestFree(tr.pos[0] + 0.5, tr.pos[1] + 0.5));
      v.do('work', 1.2, { face: tr.pos });
      v.call(() => { tr.lit = false; });
    }
    v.loop = () => { v.go(v.V.C.store.spot('sweepA')); v.do('idle', 6); };
  },

  nightWatch(v) { // 打更：提着灯笼绕村一圈，每个路口停一下举灯（喊"天干物燥，小心火烛"）
    v.char.setItem('lantern');
    v.call(() => v.glow(true));
    const stops = ['mid', 'well', 'e1', 'L1', 'well', 'w1', 'cw', 'w1', 'well', 'mid', 'gate:square', 'bridgeN', 'gate:square', 'gate:store'];
    const round = () => { for (const n of stops) { const nd = v.V.nodes[n]; v.go(v.V.nav.nearestFree(nd.x, nd.z)); v.do('work', 2.5); } };
    round();
    v.loop = round; // 一圈走完再走一圈
    v.end = () => { v.glow(false); v.char.setItem(null); };
  },

  lightTorches(v) { // 小六子挨个把路口的火把点着
    v.char.setItem(null);
    const order = [...v.V.torches].sort((a, b) => Math.hypot(a.pos[0] - v.pos.x, a.pos[1] - v.pos.z) - Math.hypot(b.pos[0] - v.pos.x, b.pos[1] - v.pos.z));
    for (const tr of order) {
      v.go(v.V.nav.nearestFree(tr.pos[0] + 0.5, tr.pos[1] + 0.5));
      v.do('work', 1.5, { face: tr.pos });
      v.call(() => { tr.lit = true; });
    }
    v.loop = () => { v.go(v.V.C.store.spot('sweepA')); v.do('idle', 6); };
  },
};
