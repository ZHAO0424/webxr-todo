import { ACTIVITIES } from './activities.js';
import { hash } from './events.js';
import { GOODS } from './economy.js';
import { Villager } from './villager.js';

/*
 * 新来的人（用户在「来了个新人」卡片上填的）怎么融进村子：
 *   1. 落脚：在人口少、跟他合得来的人家借住（每天给两文房钱）；住处 = 那家，钱袋是他自己的（一个人一户）
 *   2. 认人：头一天挨家串门打招呼（熟识度 +2），卡片上写"新来的，在认人"
 *   3. 选行当：给每个行当模板打分，取最高的——
 *        分 = 缺口价值（这一行的产出最近有多少人想买没买着 × 底价）+ 空缺加分（村里特意留的）
 *           − 同行已有几户在做 × 4 + 手艺对得上的关键词 × 6 + 一点固定随机数（打破平局）
 *      TownSnyty 只看同行人数；这里加上了"村里缺什么"
 *   4. 开张：按行当生成日程（几点干活、在哪儿干），在干活的地方产出、开始卖；买过他东西的人越来越熟
 * 三个特意留的空缺（开局就一直有人想买、没人做）：磨倌（西沟水磨坊）、卖吃食（村口）、裁缝。
 * 用户填的人存在浏览器里（localStorage），刷新后还在，按当时选好的行当、住处接着过。
 */

/** 行当模板：做什么（MAKE 规则）、在哪儿干（place）、手艺关键词、是不是村里特意留的空缺。 */
export const JOBS = [
  { id: 'miller', name: '磨倌', vacancy: true, keys: ['磨', '面', '推磨', '碾', '粮'], makes: 'flour', rate: 3, in: { grain: 1 }, place: 'mill', item: 'basket', anim: 'work', note: '西沟水磨坊没人看着，各家只能自己背粮食去磨' },
  { id: 'snack', name: '卖吃食', vacancy: true, keys: ['做饭', '面食', '烙', '饼', '馍', '厨', '吃'], makes: 'bun', rate: 6, in: { flour: 0.1, wood: 0.05 }, place: 'square', item: 'tray', anim: 'work', note: '赶集、看戏的时候，村口没有卖吃的' }, // 一升面烙十个烧饼
  { id: 'tailor', name: '裁缝', vacancy: true, keys: ['裁缝', '针线', '缝', '衣', '绣', '纳鞋'], makes: 'clothes', rate: 0.35, in: { cloth: 4 }, place: 'gate', item: null, anim: 'sit', note: '布是骡帮、货郎卖的，买回来没人会做' },
  { id: 'basketry', name: '编筐', keys: ['编', '筐', '篾', '荆条'], makes: 'basket', rate: 0.5, place: 'yard', item: 'basket', anim: 'squat' },
  { id: 'woodcutter', name: '砍柴', keys: ['砍柴', '斧', '山', '力气', '挑担'], makes: 'wood', rate: 5, place: 'firewood', item: 'axe', anim: 'work' },
  { id: 'gardener', name: '种菜', keys: ['种菜', '种地', '菜', '庄稼', '浇'], makes: 'veg', rate: 4, place: 'yard', item: 'hoe', anim: 'work' },
  { id: 'hand', name: '短工', keys: ['力气', '挑担', '干活', '帮工'], makes: null, wage: 6, place: 'field', item: 'hoe', anim: 'work', note: '给手头宽裕的人家干活，一天六文工钱' },
];
export const jobById = Object.fromEntries(JOBS.map((j) => [j.id, j]));


/** 手艺对得上几个关键词（勾的标签 + 自己写的）。 */
const skillHits = (p, job) => job.keys.filter((k) => (p.skills ?? []).some((s) => s.includes(k) || k.includes(s))).length;

/** 给每个行当打分，返回 [{ job, score, why }]（高的在前）。econ：经济（缺口、谁在做）。 */
export function rankJobs(p, econ) {
  return JOBS.map((job) => {
    const g = job.makes, miss = g ? (econ.missing[g] ?? 0) : 0;
    const value = g ? miss * (GOODS[g]?.price ?? 1) * 0.5 : 0;
    const rivals = g ? [...econ.units.values()].filter((u) => u.made[g] > 0 && u.id !== p.id).length : 0;
    const hits = skillHits(p, job);
    const score = value + (job.vacancy && !rivals ? 8 : 0) - rivals * 4 + hits * 6 + (job.id === 'hand' ? 2 : 0) + hash(`${p.id}/${job.id}`);
    const why = [hits ? `会${p.skills.filter((s) => job.keys.some((k) => s.includes(k) || k.includes(s))).join('、')}` : '', job.vacancy && !rivals ? '村里正缺这一行' : '', miss > 1 ? `${GOODS[g]?.name}常有人想买没买着` : '', rivals ? `已有 ${rivals} 户在做` : ''].filter(Boolean).join('，');
    return { job, score, why };
  }).sort((a, b) => b.score - a.score);
}

/** 借住哪家：人口少（住得下）、和他合得来的（固定随机数 + 同样的手艺）。 */
export function pickHost(p, V) {
  const homes = ['school', 'doctor', 'shepherd', 'store', 'carpenter', 'farmA', 'farmB', 'tofu', 'smith', 'headman', 'farmC'];
  const count = (id) => V.people.filter((v) => (v.p.sleepAt ?? v.p.home) === id).length;
  return homes.map((id) => ({ id, s: -count(id) * 2 + hash(`${p.id}/${id}/host`) * 3 + (V.people.some((v) => v.p.home === id && (v.p.skills ?? []).some((s) => (p.skills ?? []).includes(s))) ? 2 : 0) }))
    .sort((a, b) => b.s - a.s)[0].id;
}

/** 按行当生成一天的日程（和名册里一样的写法：[[钟点, 活动, 参数], …]）。 */
export function scheduleFor(job) {
  if (!job) return [[6.2, 'meetVillage'], [11.8, 'dinner'], [12.5, 'meetVillage'], [18.4, 'dinner'], [19.0, 'evening'], [20.4, 'home']];
  const w = ['newJob', job.id];
  return [[5.8, 'yardWork'], [6.6, ...w], [11.8, 'dinner'], [12.5, 'home'], [13.2, ...w], [17.8, 'yardWork'], [18.4, 'dinner'], [19.0, 'evening'], [20.4, 'home']];
}

/**
 * 把一个新人放进村子。p：卡片上填的（name、nick、age、sex、skills、traits、bio、likes、外观……，还有 coins、goods）。
 * 已经选过行当、定过住处的（从浏览器存档里读回来的）照旧；新来的现在借住、明天认人、认完选行当。
 */
export function addNewcomer(V, p, { arriving = true } = {}) {
  p.id ??= `new_${Date.now().toString(36)}${(V.newcomerCount = (V.newcomerCount ?? 0) + 1)}`; // 同一毫秒加好几个人也不撞
  p.newcomer = true;
  const plot = p.home && V.C[p.home]?.plot ? V.east.claim(p.home, p) : null; // 选了老村址的一处老宅：自己住（不交房钱），塌了的先苫半边顶
  if (plot) { p.oldHouse = p.home; p.houseState = plot.state; p.household = `老村址·${plot.who}老宅`; }
  p.home ??= pickHost(p, V);
  p.sleepAt = p.home;
  p.unit = p.id; // 自己一户：钱和东西不跟房东家混
  p.relation ??= '外来户';
  p.household ??= '外来户';
  p.owns ??= [];
  p.traits ??= [];
  p.skills ??= [];
  p.job = p.jobId ? jobById[p.jobId].name : '新来的，还没找着活';
  p.day = scheduleFor(p.jobId ? jobById[p.jobId] : null);
  const v = new Villager(p, V, V.newcomerRand ??= (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })());
  V.people.push(v);
  V.byId[p.id] = v;
  V.econ.addUnit(p, p.coins ?? 50, p.goods ?? {});
  for (const o of V.people) if (o.p.home === (plot ? 'riverTemple' : p.home) && o !== v) V.econ.bump(p.id, o.p.id, 3); // 房东一家先熟起来；住老宅的先认柳婆婆（老村址的领路人）
  if (arriving) { // 现在就来：从村口的桥上走进来
    const [x, z] = V.nav.nearestFree(V.nodes.bridgeS.x, V.nodes.bridgeS.z);
    v.pos.set(x, 0, z);
    v.inside = false;
    v.object.visible = true;
  }
  return v;
}

/** 认人：挨家走到院门口打招呼（说会儿话），每家熟识度 +2；走完一圈就选行当。 */
ACTIVITIES.meetVillage = (v) => {
  const V = v.V, village = ['headman', 'store', 'tofu', 'smith', 'carpenter', 'doctor', 'school', 'farmA', 'farmB', 'farmC', 'shepherd'], old = ['riverTemple', 'mason', 'limeKiln', 'duckYard'];
  const homes = v.p.oldHouse ? [...old, ...village] : [...village, ...old]; // 住老宅的：先去河神庙见柳婆婆，再认坎上几户，再进村
  v.errandText = '新来的，在挨家认人';
  v.char.setItem(null);
  v.met ??= new Set();
  v.loop = () => {
    const next = homes.find((h) => !v.met.has(h));
    if (!next) { chooseJob(v); return; }
    v.met.add(next);
    const c = V.C[next];
    v.go(c.gateOut());
    v.do('talk', 8, { face: c.gateOut() });
    v.call(() => { for (const o of V.people) if (o.p.home === next) V.econ.bump(v.p.id, o.p.id, 2); });
  };
};

/** 选行当：打分取最高，按行当重排日程，存档。 */
export function chooseJob(v) {
  const V = v.V, ranked = rankJobs(v.p, V.econ), best = ranked[0];
  v.p.jobId = best.job.id;
  v.p.job = best.job.name;
  v.p.jobWhy = best.why;
  v.p.day = scheduleFor(best.job);
  V.onNewcomer?.(v, ranked);
  v.finish();
}

/** 干自己的行当：走到干活的地方，按模板的动作干（产出在 economy.js 的 tick 里按 job 攒）。 */
ACTIVITIES.newJob = (v, id) => {
  const V = v.V, job = jobById[id], sq = V.C.square;
  v.char.setItem(job.item);
  v.errandText = null;
  if (job.place === 'mill') { v.go(V.mill.at); v.loop = () => v.do(job.anim, 10, { face: V.mill.face }); return; }
  if (job.place === 'square') { const at = V.nav.nearestFree(...sq.at(2.6, 6.4)); v.go(at); v.loop = () => v.do(v.rand() < 0.5 ? 'talk' : job.anim, 8, { face: sq.at(2.6, 3) }); return; }
  if (job.place === 'gate') { v.go(v.home.gateOut()); v.loop = () => { v.seat = 0.3; v.do(job.anim, 10); }; return; }
  if (job.place === 'firewood') { ACTIVITIES.firewood(v); return; }
  if (job.place === 'field') { // 短工：到最宽裕的那户的地里帮着干，傍晚收工钱（economy.js 的 wages）
    const boss = V.econ.employerFor(v);
    v.p.workFor = boss?.id ?? null;
    const node = V.fields[boss && ['farmB', 'farmC'].includes(boss.id) ? (boss.id === 'farmC' ? 'fieldE' : 'fieldWest') : 'fieldW'];
    const pts = node ?? [];
    v.loop = () => { const p = pts[Math.floor(v.rand() * pts.length)]; if (p) v.go(p); v.do('work', 10); };
    return;
  }
  v.loop = () => { v.go(v.home.randomPoint()); v.do(job.anim, 8); }; // 自家（借住人家）院里
};
