import { makeRng } from '../pixel.js';
import { friendsOf } from '../residents.js';
// ---------------------------------------------------------------- 活动
// 每个活动往村民的任务队列里塞一串任务；loop 是任务做完后（活动还没到点结束时）接着做什么。

const WORK = { // 各家默认的干活位置、手里的家伙、朝哪儿
  smith: { spot: 'anvil', item: 'hammer', face: [-3.4, 2.6] },
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

/** 自家门口墙根底下一个没人占的位置（没有就 null）。 */
function wallSpot(v) {
  const c = v.home, spots = c.wallSpots ?? [];
  const name = spots.length ? v.V.claim(v, c, spots.map((_, i) => `wall${i}`), { strict: true }) : null;
  return name ? spots[Number(name.slice(4))] : null;
}

export const ACTIVITIES = {
  idle(v) { v.loop = () => v.do('idle', 5); },

  home(v) { v.char.setItem(null); v.enter(v.bed, 'house'); },

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
    v.go(sq.spot(seat));
    v.loop = () => { v.seat = 0.45; v.do('sit', 10, { face: sq.at(-0.4, 3.6) }); };
    v.end = () => { v.seat = null; };
  },

  dinner(v) { // 北方的"饭场"：端着碗到门口墙根底下蹲着吃，邻居凑一块儿（不蹲在路上、门前）
    v.char.setItem('bowl');
    const spot = wallSpot(v);
    if (spot) { v.go(spot.at); v.loop = () => v.do(v.rand() > 0.3 ? 'squat' : 'talk', 8, { face: spot.face }); }
    else { const [gx, gz] = v.home.gateOut(); v.go(v.V.nav.nearestFree(gx, gz + 1)); v.loop = () => v.do('squat', 8, { face: [gx, gz - 3] }); }
    v.end = () => { v.char.setItem(v.p.item ?? null); v.V.release(v); };
  },

  evening(v) { // 没有晚上的活动时：吃过晚饭，有的到大槐树下围一圈闲聊，有的坐自家门口，有的早早歇了
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
    v.char.setItem('pole');
    v.loop = () => { v.go(v.V.C[R(stops)].gateOut()); v.do('talk', 14); };
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

  sitGate(v) { // 坐在自家门口的墙根底下，不挡道
    v.char.setItem(v.p.item ?? null);
    const spot = wallSpot(v);
    const [gx, gz] = v.home.gateOut();
    v.go(spot ? spot.at : v.V.nav.nearestFree(gx + 1.2, gz + 0.3));
    v.loop = () => { v.seat = 0.3; v.do('sit', 10, { face: spot ? spot.face : [gx + 1.2, gz + 4] }); };
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

  firewood(v) { // 进山砍柴：扛着斧子上坡，砍一阵，背一捆柴回家
    const woods = v.V.woods;
    if (!woods.length) { ACTIVITIES.field(v, 'fieldW'); return; }
    const spot = woods[Math.floor(v.rand() * woods.length)];
    v.char.setItem('axe');
    v.go(spot.at);
    v.do('work', 14, { face: spot.tree });
    v.item('firewood');
    v.go(v.home.spot('yard'));
    v.item(null);
    v.do('work', 3);
    v.loop = () => { v.go(v.home.randomPoint()); v.do('idle', 6); };
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
