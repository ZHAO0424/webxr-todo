import { ACTIVITIES } from './activities.js';
import { hash } from './events.js';

/*
 * 村口的剃头挑子（"剃头挑子一头热"：一头小炉子烧着热水，一头是给客人坐的凳子）。
 *
 * 每天挑 4 个客人（男人、老人、男孩里轮着），各有一个大概的钟点；到点了要是手头的事不要紧（歇着、扫院子、
 * 下棋、串门、玩……），就放下过来剃头：先在一边蹲着等，轮到了坐上凳子；剃头匠站到凳子后头
 * 剃头 → 刮脸 → 掏耳朵，完了客人回去接着干原来的事。没客人时剃头匠荡刀子、吆喝两声、歇着。
 * 剃头匠不在（吃饭、去唱戏）就不接活：等着的回去，下次再来。
 */

const CUSTOMERS = ['wang_deshan', 'chen_mancang', 'li_wenqing', 'zhang_tiechui', 'liu_youfu', 'yang_erniu', 'wu_dachuan', 'zhou_jishi',
  'ma_laoliu', 'qian_xiaoer', 'xiao_shun', 'zhao_mantun', 'sun_youcai', 'zhang_dabao', 'zhao_shitou', 'sun_shuanzi', 'yang_xiaohu'];
const SLOTS = [8.0, 9.6, 14.2, 16.0]; // 大概的钟点（各人再错开一点）
// 这些事放不下（做饭、上课、放羊、赶牛轧场、磨豆腐、吃饭、睡觉、在活动上有角色……）；别的都能抽空来剃个头
const BUSY = new Set(['cook', 'school', 'teach', 'herd', 'herdHome', 'thresh', 'oxHome', 'grind', 'boil', 'home', 'dinner', 'sellTofu', 'lightTorches', 'putOutTorches', 'nightWatch', 'gatherDucks', 'deliver', 'haircut', 'barber']);

export class Barbershop {
  constructor(V) {
    this.V = V;
    this.queue = []; // 等着剃的（先来先剃）
    this.seated = null; // 坐在凳子上的
    this.done = null; // 剃完了、该起身的
    this.day = 0;
    this.plan = [];
    this.served = 0;
  }

  /** 剃头匠在摊子上吗。 */
  open() {
    const b = this.V.byId.zheng_laotou;
    return !!b && !b.inside && b.doing === 'work';
  }

  tick(hour, day) {
    const V = this.V;
    if (day !== this.day) { // 新的一天：挑今天的客人
      this.day = day;
      const picks = [...CUSTOMERS].sort((a, b) => hash(`${day}/${a}/cut`) - hash(`${day}/${b}/cut`)).slice(0, SLOTS.length);
      this.plan = picks.map((id, i) => ({ id, at: SLOTS[i] + hash(`${day}/${id}/at`) * 0.6, done: false }));
    }
    if (!this.open() && this.seated && this.done !== this.seated) this.done = this.seated; // 剃头匠走了：先剃到这儿
    if (!this.open()) return;
    for (const c of this.plan) {
      if (c.done || hour < c.at || hour > c.at + 2) continue;
      const v = V.byId[c.id];
      if (v && !v.inside && !v.errand && !v.perched && !BUSY.has(v.doing) && !v.doing.includes(':')) { v.interrupt('haircut'); c.done = true; }
    }
  }
}

/** 剃头匠：守着挑子；凳子上有人就站到后头剃头、刮脸、掏耳朵。 */
ACTIVITIES.barber = (v) => {
  const sq = v.V.C.square, B = sq.barber, chair = sq.at(...B.chair);
  v.char.setItem('razor');
  v.go(sq.spot('barber'));
  v.loop = () => {
    const shop = v.V.barber, c = shop.seated;
    if (c && shop.done !== c) {
      v.go(sq.spot('barberWork'));
      v.item('razor');
      v.do('work', 10, { face: chair }); // 剃头
      v.do('shave', 6, { face: chair }); // 刮脸
      v.item('earpick');
      v.do('work', 5, { face: chair }); // 掏耳朵
      v.call(() => { if (shop.seated === c) shop.done = c; });
      v.item('razor');
      v.go(sq.spot('barber'));
      return;
    }
    if (shop.queue.length) { v.do('talk', 3, { face: sq.at(...B.wait[0]) }); return; } // 招呼等着的
    const r = v.rand();
    if (r < 0.4) v.do('strop', 6, { face: sq.at(...B.stand) }); // 在挑子上荡刀子
    else if (r < 0.65) v.do('talk', 4, { face: sq.at(-2.6, 2) }); // 吆喝一声
    else v.do('idle', 6);
  };
};

/** 客人：过来等着，轮到了坐上凳子，剃完回去接着干原来的事。 */
ACTIVITIES.haircut = (v) => {
  const sq = v.V.C.square, B = sq.barber, shop = v.V.barber, chair = sq.at(...B.chair), look = sq.at(...B.look);
  v.char.setItem(null);
  if (!shop.queue.includes(v)) shop.queue.push(v);
  const leave = () => { shop.queue = shop.queue.filter((x) => x !== v); if (shop.seated === v) shop.seated = null; if (shop.done === v) shop.done = null; v.V.release(v); };
  v.loop = () => {
    if (shop.done === v || (!shop.open() && shop.seated !== v)) { // 剃完了（或者剃头匠不在）
      if (shop.done === v) shop.served++;
      leave();
      v.finish();
      return;
    }
    if (shop.seated === v) { v.seat = 0.45; v.do('sit', 2, { face: look }); return; }
    if (shop.queue[0] === v && !shop.seated) { // 轮到了：坐上凳子
      v.V.release(v);
      v.go(sq.spot('barberChair'));
      v.climb([[chair[0], chair[1], 0]], [[...sq.spot('barberChair'), 0]]);
      v.call(() => { shop.seated = v; });
      return;
    }
    const w = v.V.claim(v, sq, B.wait.map((_, i) => `barberWait${i}`));
    v.go(sq.spot(w));
    v.do('squat', 3, { face: chair });
  };
  v.end = leave;
};
