import { ACTIVITIES } from './activities.js';
import { hash } from './events.js';
import { GOODS, unitOf, goodName, reasonText } from './economy.js';
import { EN } from '../i18n.js';
import { pNick } from '../names.js';

/*
 * 看得见的买卖：经济（economy.js）每天凌晨给各户列好"想买什么"，这里派人去买——照剃头挑子那套临时差事：
 * 到了钟点，手头的事不要紧就放下，挎上篮子走到卖家跟前（杂货铺的柜台前、村口的豆腐挑子、人家院门口），
 * 当面说几句话成交（卖家闲着会转过身来招呼），拿着东西回家，接着干原来的事。
 * 每人每天最多跑一趟，只在手头的事放得下的时候去（做饭、上课、吃饭、睡觉时不叫）。赶集那天上午不派（大伙儿都在集上，集上的摊子按各家的清单卖真货，见 events.js 的 market）。
 */

// 放不下的事（和剃头挑子一样）：做饭、上课、放羊、磨豆腐、吃饭、睡觉、在活动上有角色……
const BUSY = new Set(['riverIncense', 'repair', 'cook', 'school', 'teach', 'herd', 'herdHome', 'thresh', 'oxHome', 'grind', 'boil', 'home', 'dinner', 'sellTofu', 'lightTorches', 'putOutTorches', 'nightWatch', 'gatherDucks', 'deliver', 'haircut', 'barber', 'buy', 'serve', 'caravan', 'caravanHome', 'worship', 'mill', 'firewood', 'fish', 'packedLunch']);
const HEAVY = new Set(['grain', 'wood', 'tool', 'wooden', 'iron', 'soy', 'basket', 'lime', 'stone', 'charcoal', 'seed', 'coal']); // 男人去扛
const KIDS_OK = new Set(['tofu', 'match', 'salt']); // 打发孩子去买
const REMOTE = new Set(['lime', 'stone', 'duckEgg', 'coal']); // 只有老村址有的东西
/** 拿着什么回家。 */
const CARRY = { tofu: ['tray'], veg: ['basket'], egg: ['basket'], salt: ['basket'], match: ['basket'], cloth: ['basket'], pill: ['basket'], honey: ['basket'], pickle: ['basket'], flour: [null, 'sack'], grain: [null, 'sack'], soy: [null, 'sack'], wood: [null, 'firewood'], tool: ['hoe'], wooden: ['box'], iron: ['box'], basket: ['basket'], wool: [null, 'sack'], lime: [null, 'sack'], stone: [null, 'sack'], duckEgg: ['basket'], fish: ['basket'], pork: ['basket'], wildfood: ['basket'], game: ['basket'], charcoal: [null, 'sack'], seed: [null, 'sack'], relic: ['box'], coal: [null, 'basket:coal'] };
const PLACE = { headman: '王家', school: '学堂', shepherd: '马家', farmA: '陈家', farmB: '杨家', farmC: '吴家', carpenter: '刘家木匠铺', store: '孙家杂货铺', doctor: '周家药铺', smith: '张家铁匠铺', tofu: '赵家豆腐坊', zheng_laotou: '剃头挑子', qian_xiaoer: '货郎那儿', cart: '村口代销车', riverTemple: '柳婆婆家', mason: '葛家石匠院', limeKiln: '白家石灰窑', duckYard: '凤仙嫂家' };
/** 英文界面的同一张表（卡片上的差事：Off to Sun's Store for Salt）。 */
const PLACE_EN = { headman: "the Wangs'", school: 'the school', shepherd: "the Mas'", farmA: "the Chens'", farmB: "the Yangs'", farmC: "the Wus'", carpenter: "Liu's Carpentry", store: "Sun's Store", doctor: "Zhou's Pharmacy", smith: "Zhang's Smithy", tofu: "Zhao's Tofu Shop", zheng_laotou: "the barber's stall", qian_xiaoer: 'the peddler', riverTemple: "Granny Liu's", mason: "Ge's Mason Yard", limeKiln: "Bai's Lime Kiln", duckYard: "Sister Fengxian's" , cart: 'the consignment cart' };
const placeOf = (id, who) => (EN ? PLACE_EN[id] ?? (who ? pNick(who.p) : '') : PLACE[id] ?? who?.p.nick ?? '');
const STALL_SELLER = { tofu: 'tofu', goods: 'qian_xiaoer', veg: 'farmC' }; // 集上三个摊子各是谁家的

/** v 今天闲着的时段 [[开始, 结束], …]：日程里不是放不下的事（放羊、做饭、上课、吃饭、歇晌……）、白天 7 点到傍晚 6 点之间、至少半个钟点。赶集日上午都在集上，不算。 */
function freeWindows(v, market) {
  const day = v.p.day, out = [];
  for (let i = 0; i < day.length; i++) {
    const [t, act] = day[i], end = day[i + 1]?.[0] ?? 21;
    if (BUSY.has(act) || act === 'event') continue;
    const a = Math.max(t + 0.1, market ? 12 : 7.2), b = Math.min(end - 0.1, 18);
    if (b - a >= 0.5) out.push([a, b]);
  }
  return out;
}

export const busy = (v) => v.inside || v.errand || v.perched || BUSY.has(v.doing) || v.doing.includes(':');

export class Trading {
  constructor(V, econ) {
    this.V = V;
    this.econ = econ;
    this.orders = [];
    this.runs = []; // 交给货郎代买的（买的人没空）
    this.day = 0;
  }

  /** 新的一天：按各户的清单派人、定钟点。每人一天最多跑两趟，钟点错开。 */
  plan(day) {
    this.day = day;
    this.orders = [];
    this.runs = [];
    const V = this.V, market = V.today() === 'market' && V.weather() !== 'rain';
    // 只有老村址的人家有富余的东西（石灰、鸭蛋，还有住老宅的新人打的野味、采的山货）：家里没人有空就托货郎捎
    const remote = (g) => REMOTE.has(g) || (!!g && !this.econ.cartQty(g) && (() => { const has = [...this.econ.units.values()].filter((x) => x.id !== 'caravan' && (x.stock[g] ?? 0) - this.econ.keep(x, g) >= 1); return has.length > 0 && has.every((x) => V.C[x.members[0].home]?.east); })());
    for (const u of this.econ.units.values()) {
      if (u.id === 'caravan') continue;
      const ppl = u.members.map((p) => V.byId[p.id]).filter(Boolean);
      const grown = ppl.filter((v) => v.p.body !== 'child' && !v.p.caravan);
      const count = new Map();
      // 自家产的东西富余了：挑一样送到村口代销车（算这人今天的一趟）。新居民自己送，老住户挑家里今天有空的大人
      const cg = this.econ.consignable(u), hc = (tag) => hash(`${day}/${u.id}/consign/${tag}`);
      const free = cg ? grown.filter((x) => freeWindows(x, market).length) : [], cv = free[Math.floor(hc('who') * free.length)];
      if (cv) {
        const wins = freeWindows(cv, market), win = wins[Math.floor(hc('ampm') * wins.length)];
        this.orders.push({ v: cv, alts: [], unit: u, consign: cg[0], qty: cg[1], at: win[0] + hc('at') * Math.max(0.1, win[1] - win[0] - 0.4), done: false });
        count.set(cv, 1);
      }
      u.wants.forEach((w, i) => {
        const h = (tag) => hash(`${day}/${u.id}/${w.good ?? w.service}/${tag}`);
        let pool = HEAVY.has(w.good) || w.service ? grown.filter((v) => v.p.sex === '男') : grown.filter((v) => v.p.sex === '女');
        if (!pool.length) pool = grown;
        const kids = ppl.filter((v) => v.p.body === 'child' && v.p.age >= 8);
        if (KIDS_OK.has(w.good) && kids.length && h('kid') < 0.35) pool = kids;
        const cap = u.members.some((p) => p.newcomer) || V.C[u.members[0].home]?.east ? 2 : 1; // 新来的（一个人一户、要开张要修房）和老村址几户（离村子远）每天能跑两趟
        pool = pool.filter((v) => (count.get(v) ?? 0) < cap); // 每人每天最多跑一趟：买东西不打乱正常作息
        if (!pool.length) { if (remote(w.good) && grown.length) this.runs.push({ v: grown[0], alts: [], unit: u, good: w.good, qty: w.qty, why: w.why, at: 9, done: true }); return; } // 老村址才有的东西（石灰、条石、鸭蛋）：家里没人有空，托货郎捎回来
        const v = pool[Math.floor(h('who') * pool.length)];
        count.set(v, (count.get(v) ?? 0) + 1);
        const wins = freeWindows(v, market), win = wins[Math.floor(h('ampm') * wins.length)] ?? [13.6, 17]; // 只挑他今天真闲着的时段（羊倌上午放羊、中午歇晌，就下午去）
        const at = win[0] + h('at') * Math.max(0.1, win[1] - win[0] - 0.4) + i * 0.05;
        const o = { v, alts: grown.filter((x) => x !== v), unit: u, good: w.good, qty: w.qty, service: w.service, to: w.to, price: w.price, why: w.why, at, done: false };
        const old = grown.every((x) => x.p.age >= 65); // 家里只有上了年纪的老人（陈老汉老两口、周郎中）：腿脚不便，买东西默认让货郎送上门
        if ((!wins.length || old) && !w.service) { o.done = true; this.runs.push(o); return; } // 一整天都没空 / 老人家：一早就交给货郎代买
        this.orders.push(o);
      });
    }
    this.orders.sort((a, b) => a.at - b.at);
  }

  /** 每帧：到点了、人手头不忙就去买；三个钟点内一直没空就算了（明天再说）。 */
  tick(hour) {
    for (const o of this.orders) {
      if (o.done || hour < o.at) continue;
      if (hour > o.at + 3) { o.done = true; if (!o.service && !o.consign) this.runs.push(o); continue; } // 三个钟点都没抽出空：交给货郎代买（修农具这类得本人拿着家伙去的不算）
      if (busy(o.v)) { // 原定的人一个钟点都抽不出空（磨豆腐的、上课的……）：换家里别的闲着的人去
        const alt = hour > o.at + 1 && o.alts.find((x) => !busy(x));
        if (!alt) continue;
        o.v = alt;
      }
      if (!o.consign && !o.unit.wants.some((w) => (o.service ? w.service === o.service : w.good === o.good))) { o.done = true; continue; } // 已经买到了（比如集上买了）
      o.done = true;
      o.v.interrupt('buy', o);
    }
  }

  /**
   * 顺手买：村口代销车就停在晚上闲聊那一圈旁边。人在车跟前（九米内）闲着，家里今天想买的东西车上正好有，就走过去买——
   * 补上「一人一天只跑一趟、排在后头的东西轮不上」。每人每天最多顺手一回。
   */
  cartTick(hour) {
    if (!this.econ.cart.length || Math.abs(hour - (this.lastCart ?? -9)) < 0.15) return;
    this.lastCart = hour;
    const V = this.V, sq = V.C.square, f = sq.spots.cartBuyA, [cx, cz] = sq.at(f[2], f[3]);
    for (const v of V.people) {
      if (v.p.body === 'child' || v.p.caravan || busy(v) || v.state === 'walk' || v.cartDay === this.day) continue;
      if (Math.hypot(v.pos.x - cx, v.pos.z - cz) > 9) continue;
      const u = this.econ.unitOfV(v), w = u?.wants.find((x) => x.good && this.econ.cartLot(x.good, u.id));
      if (!w) continue;
      v.cartDay = this.day;
      v.interrupt('buy', { v, alts: [], unit: u, good: w.good, qty: w.qty, why: w.why, at: hour, done: true, seller: this.econ.cartSeller });
    }
  }

  /** 卖家此刻在哪儿收钱：[位置, 朝向, 卖的人]。 */
  counter(seller, v) {
    const V = this.V;
    if (seller.cart) { // 代销车：站到车前，脸朝车；货郎多半不在跟前，钱投进钱匣子
      const sq = V.C.square, f = sq.spots.cartBuyA;
      return { to: () => sq.spot(V.claim(v, sq, ['cartBuyA', 'cartBuyB'])), face: () => sq.at(f[2], f[3]), who: null };
    }
    if (seller.id === 'store') {
      const st = V.C.store, keeper = V.byId.sun_youcai ?? V.byId.xiao_liuzi;
      return { to: () => st.spot(V.claim(v, st, ['customer', 'customer2'])), face: () => st.spot('counter'), who: keeper };
    }
    const ppl = seller.members.map((p) => V.byId[p.id]).filter((x) => x && x.p.body !== 'child');
    // 卖的人在摆摊、叫卖（村口的豆腐挑子、货郎、新来的人的摊子）：走到跟前（站在导航上的空地，别把人挤进墙里）；
    // 在自家院里、作坊里干活的：到院门口喊一声，不往人家院里挤
    const out = ppl.find((x) => !x.inside && (x.doing === 'sellTofu' || x.doing === 'peddle' || (x.doing === 'newJob' && x.p.jobId !== 'tailor')));
    if (out) return { to: () => V.nav.nearestFree(out.pos.x + 0.9, out.pos.z + 0.6), face: () => [out.pos.x, out.pos.z], who: out };
    const c = V.C[seller.members[0].home] ?? V.C.square; // 人不在跟前：到他家院门口喊一声
    return { to: () => c.gateOut(), face: () => c.gateOut(), who: ppl[0] };
  }

  /** 卖的人闲着、就在跟前：转过身来招呼两句。 */
  greet(who, buyer) {
    if (!who || busy(who) || who.state === 'walk' || Math.hypot(who.pos.x - buyer.pos.x, who.pos.z - buyer.pos.z) > 3) return;
    who.interrupt('serve', buyer);
  }

  /** 集上：逛到这个摊子跟前，按自家清单买（摊子是谁家的见 STALL_SELLER）。 */
  atStall(v, kind) {
    const buyer = this.econ.unitOfV(v), seller = this.econ.unit(STALL_SELLER[kind]);
    if (!buyer || !seller || buyer === seller) return null;
    for (const w of [...buyer.wants]) {
      if (!w.good) continue; // 修农具这类手艺活集上办不了
      const t = this.econ.settle(v, seller, w.good, w.qty, { place: '集上' });
      if (t) { this.carry(v, t.good); return t; }
    }
    return null;
  }

  carry(v, good) {
    const [hand, back] = CARRY[good] ?? ['basket'];
    if (hand !== undefined) v.char.setItem(hand);
    if (back) v.char.setBack(back);
  }
}

/**
 * 货郎代买（跑腿）：叫卖的间隙，接了没空买东西的人家的活——先到卖家门口取货，再送到买家院门口，
 * 买家在不在家都直接成交（钱从这户的钱袋里出，东西放进这户的存货），另收一文跑腿钱。
 */
function runFor(v, o) {
  const V = v.V, T = V.trade, econ = T.econ;
  if (!o.unit.wants.some((w) => w.good === o.good)) return false; // 已经买到了
  const seller = econ.sellersFor(o.unit, o.good, o.qty, o.v).find((u) => u.id !== 'qian_xiaoer') ?? econ.unit('qian_xiaoer');
  if (!seller || seller === o.unit) return false;
  const from = V.C[seller.members[0].home] ?? V.C.square, to = V.C[o.unit.members[0].sleepAt ?? o.unit.members[0].home] ?? V.C[o.unit.members[0].home];
  v.errandText = EN ? `Buying ${goodName(o.good).toLowerCase()} for ${placeOf(o.unit.id, o.v)}` : `给${PLACE[o.unit.id] ?? o.v.p.nick}代买${GOODS[o.good].name}`;
  if (seller.id !== 'qian_xiaoer') { v.go(from.gateOut()); v.do('talk', 4, { face: from.gateOut() }); } // 去卖家门口取货（自己担子里有的就不用跑）
  v.go(to.gateOut());
  v.do('talk', 4, { face: to.gateOut() });
  v.call(() => {
    const t = econ.settle(o.v, seller, o.good, o.qty, { place: '货郎代买' });
    if (t) { econ.pay(o.v, 'qian_xiaoer', 1, '跑腿'); V.onRun?.(v, t); }
    v.errandText = null;
  });
  return true;
}
const peddle0 = ACTIVITIES.peddle;
ACTIVITIES.peddle = (v) => { // 货郎叫卖：有代买的活先跑代买
  peddle0(v);
  const loop0 = v.loop;
  v.loop = () => { const T = v.V.trade; let o; while ((o = T.runs.shift())) if (runFor(v, o)) return; loop0(); };
};

/** 去买东西：挎上篮子走到卖家跟前，说几句、成交，拿着东西回家。 */
ACTIVITIES.buy = (v, o) => {
  const T = v.V.trade, econ = T.econ;
  if (o.service) { fix(v, o); return; }
  if (o.consign) { consign(v, o); return; }
  const sellers = o.seller ? [o.seller] : econ.sellersFor(o.unit, o.good, o.qty, v); // o.seller：顺手在代销车上买
  if (!sellers.length) { econ.miss(o.good); econ.fail(v, o.good, '村里没人有富余'); v.finish(); return; } // 村里没人有富余：今天买不着
  const seller = sellers[0], c = T.counter(seller, v);
  v.errandText = EN ? `Off to ${placeOf(seller.id, c.who)} for ${goodName(o.good).toLowerCase()}` : `去${PLACE[seller.id] ?? c.who?.p.nick ?? ''}买${GOODS[o.good].name}`;
  v.char.setItem(o.good === 'tofu' ? 'bowl' : 'basket');
  v.go(c.to);
  v.call(() => {
    T.greet(c.who, v);
    v.do('talk', 5 + v.rand() * 3, { face: c.face() });
    v.call(() => {
      v.V.release(v);
      const t = econ.settle(v, seller, o.good, o.qty, { place: c.who?.p.name ?? '' });
      if (t) {
        T.carry(v, t.good);
        if (t.good === 'pill' && seller.id === 'doctor') econ.pay(v, 'doctor', 10, '看病');
      } else econ.miss(o.good);
      v.go(v.home.spot('yard') ?? v.home.gateOut());
      v.do('idle', 2);
      v.call(() => { v.char.setItem(v.p.item ?? null); v.char.setBack(null); v.finish(); });
    });
  });
};

/** 手艺活（修农具、修家什）：拿着坏了的家伙走到铁匠 / 木匠跟前，等他拾掇好，给钱，拿回家。 */
function fix(v, o) {
  const T = v.V.trade, econ = T.econ, shop = econ.unit(o.to), c = T.counter(shop, v);
  v.errandText = EN ? `${reasonText(o.service)} at ${placeOf(o.to)}` : `去${PLACE[o.to] ?? ''}${o.service}`;
  v.char.setItem(o.service === '修农具' ? 'hoe' : o.service === '錾磨盘' ? null : 'box');
  v.go(c.to);
  v.call(() => {
    T.greet(c.who, v);
    v.do('talk', 8 + v.rand() * 4, { face: c.face() });
    v.call(() => {
      v.V.release(v);
      econ.pay(v, o.to, o.price, o.service);
      o.unit.wants = o.unit.wants.filter((w) => w.service !== o.service);
      v.go(v.home.spot('yard') ?? v.home.gateOut());
      v.do('idle', 2);
      v.call(() => { v.char.setItem(v.p.item ?? null); v.finish(); });
    });
  });
}

/** 往代销车上送货：背着自家做的东西走到村口的车前，摆上去，回去接着干活。 */
function consign(v, o) {
  const T = v.V.trade, econ = T.econ, c = T.counter(econ.cartSeller, v);
  v.errandText = EN ? `Taking ${goodName(o.consign).toLowerCase()} to the consignment cart` : `把${GOODS[o.consign].name}送到村口代销车`;
  T.carry(v, o.consign);
  v.go(c.to);
  v.do('work', 3, { face: c.face() });
  v.call(() => {
    v.V.release(v);
    econ.consign(o.unit, o.consign, o.qty);
    v.char.setItem(v.p.item ?? null); v.char.setBack(null);
    v.finish();
  });
}

/** 卖的人：转向买家，说两句（递东西、收钱），回去接着干。 */
ACTIVITIES.serve = (v, buyer) => {
  v.errandText = EN ? `Serving ${pNick(buyer.p)}` : `招呼${buyer.p.nick}`;
  v.do('talk', 5, { face: [buyer.pos.x, buyer.pos.z] });
  v.call(() => v.finish());
};

export { STALL_SELLER, unitOf };
