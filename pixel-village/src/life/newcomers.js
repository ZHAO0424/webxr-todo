import { ACTIVITIES } from './activities.js';
import { hash } from './events.js';
import { GOODS } from './economy.js';
import { Villager } from './villager.js';
import { season } from '../season.js';

/*
 * 新来的人（用户在「创建居民」里填的）怎么融进村子：
 *   1. 落脚：借住在人口少的人家（每天两文房钱），或者住进老村址的一处老宅（不交房钱，攒料修房，见 life/oldsite.js）
 *   2. 认人：头一天挨家串门打招呼（熟识度 +2），卡片上写"新来的，在认人"
 *   3. 营生：用户在「创建居民」第 ③ 页自己选（p.jobPicked）；选了「先不定」的，认完人按打分自动挑——
 *        分 = 缺口价值（最近有多少人想买没买着 × 底价）+ 空缺加分 − 同行人数 × 4 + 手艺对得上的关键词 × 6 + 一点固定随机数
 *      打分也给选营生的卡片标"正缺""对口"、估一天挣几文
 *   4. 开张：按行当排日程，在干活的地方产出、开始卖 / 上门做活 / 拿工钱
 *   5. 改行：档案里点「改行」重新选（用户来点），马上按新行当过
 * 行当都是山村里常见的营生（设计见 wikigarden efforts/creative-coding/像素村落-东边新地计划.md §10）；
 * 只做村里 NPC 不做的东西 / 服务，或者帮工挣工钱，不抢老住户的饭碗。一年四季都能干，季节只影响收成（season 倍数）。
 *
 * kind：make 自己做东西卖（makes / rate / in）；wage 帮工拿工钱（wage / payer）；rounds 上门做活（service / price，活从 economy.js 的 calls 里领）；
 *       stall 摆摊卖碗茶（村口闲坐的人顺手买）
 */

const S4 = (spring, summer, autumn, winter) => ({ spring, summer, autumn, winter });

/** 行当模板（cat：分类；desc：干什么；where：在哪儿干；buyers：谁买 / 谁给钱；setup：要置办什么；est：一个人独做一天约挣几文）。 */
export const JOBS = [
  // ---- 地里、河里
  { id: 'hand', name: '帮忙种田', cat: '地里河里', kind: 'wage', wage: 6, payer: 'farm', place: 'field', item: 'hoe', anim: 'work', season: S4(1, 1.3, 1.3, 0.7),
    keys: ['种地', '力气', '挑担', '干活', '帮工', '庄稼'], est: 7,
    desc: '跟着陈家、杨家、吴家下地：锄地、割麦、掰玉米、挑谷子', where: '三家的地里（村里、西沟梯田）', buyers: '最宽裕的那户农家按天给工钱，农忙给得多', setup: '一把锄头' },
  { id: 'fisher', name: '钓鱼', cat: '地里河里', kind: 'make', makes: 'fish', rate: 1.2, max: 16, place: 'beach', item: 'rod', anim: 'sit', season: S4(1, 1.2, 1, 0.5),
    keys: ['钓鱼', '打鱼', '水性', '撒网', '耐性'], est: 6,
    desc: '坐在老村址的河心洲、深水湾下竿，钓上来的鱼挎到村里卖', where: '老村址河滩', buyers: '手头宽裕的人家；过年人人要一条（年年有余）', setup: '一根钓竿' },
  { id: 'gardener', name: '种菜', cat: '地里河里', kind: 'make', makes: 'veg', rate: 4, place: 'yard', item: 'hoe', anim: 'work', season: S4(1, 1.2, 1, 0.3),
    keys: ['种菜', '种地', '菜', '浇', '庄稼'], est: 7,
    desc: '在住处边上开块菜地，锄地、浇水，青菜卖给村里', where: '自家院边的菜地', buyers: '村里青菜老是不够吃，补这个缺口', setup: '锄头、菜籽' },
  { id: 'miller', name: '磨面', cat: '地里河里', kind: 'make', vacancy: true, makes: 'flour', rate: 3, in: { grain: 1 }, place: 'mill', item: 'basket', anim: 'work', season: S4(1, 1, 1, 1),
    keys: ['磨', '面', '推磨', '碾', '粮'], est: 10, note: '西沟水磨坊没人看着，各家只能自己背粮食去磨',
    desc: '看着西沟的水磨坊，把粮食磨成白面卖', where: '西沟水磨坊', buyers: '想吃白面的人家、卖烧饼的', setup: '不用置办（粮食向三家农户买）' },
  // ---- 手艺、买卖
  { id: 'builder', name: '泥瓦木工', cat: '手艺买卖', kind: 'rounds', service: '修房盘炕', price: 8, place: 'rounds', item: 'hammer', anim: 'work', season: S4(1, 1, 1, 0.7),
    keys: ['木工', '泥瓦', '盖房', '修房', '砌墙', '盘炕', '力气'], est: 9,
    desc: '扛着家伙上门：盘炕、补墙、苫房顶、修门窗；老村址的人修老宅也请他帮工', where: '谁家叫就去谁家', buyers: '各家二十来天有一回小修', setup: '泥抹子、锤子（刘木匠做家具车轮，他盖房修房，不抢生意）' },
  { id: 'tailor', name: '裁缝', cat: '手艺买卖', kind: 'make', vacancy: true, makes: 'clothes', rate: 0.35, in: { cloth: 4 }, place: 'gate', item: null, anim: 'sit', season: S4(1, 1, 1, 1),
    keys: ['裁缝', '针线', '缝', '衣', '绣'], est: 8, note: '布是骡帮、货郎卖的，买回来没人会做',
    desc: '坐在自家门口做衣裳', where: '自家门口', buyers: '衣裳穿破了的人', setup: '针线、剪子（布向杂货铺、货郎买）' },
  { id: 'snack', name: '卖吃食', cat: '手艺买卖', kind: 'make', vacancy: true, makes: 'bun', rate: 6, in: { flour: 0.1, wood: 0.05 }, place: 'square', item: 'tray', anim: 'work', season: S4(1, 1, 1, 1),
    keys: ['做饭', '面食', '烙', '饼', '馍', '厨', '吃'], est: 6, note: '赶集、看戏的时候，村口没有卖吃的',
    desc: '在村口支个炉子烙烧饼', where: '村口', buyers: '赶集、看戏、闲逛的人', setup: '一个炉子（白面向磨面的买）' },
  { id: 'butcher', name: '杀猪卖肉', cat: '手艺买卖', kind: 'rounds', service: '杀猪', price: 15, pork: 6, place: 'rounds', item: 'tray', anim: 'work', season: S4(0.8, 0.6, 1, 1.8),
    keys: ['杀猪', '屠户', '刀', '力气大', '肉'], est: 8,
    desc: '养猪的人家请他去杀猪（年前最忙），分到的肉卖给村里', where: '养猪的人家（陈家、吴家）', buyers: '杀猪：养猪的人家；猪肉：手头宽裕的人家、过节', setup: '一把杀猪刀、一张肉案子' },
  { id: 'teahouse', name: '茶摊说书', cat: '手艺买卖', kind: 'stall', service: '喝茶', price: 1, place: 'square', item: 'bowl', anim: 'talk', season: S4(1, 1.2, 1, 0.8),
    keys: ['说书', '讲古', '泡茶', '烧水', '唱', '会说'], est: 5,
    desc: '村口支个茶摊，大碗茶一文一碗，人多了讲一段书', where: '村口大槐树下', buyers: '在村口闲坐、闲聊的人顺手买一碗', setup: '一把大茶壶、几只粗瓷碗' },
  // ---- 山上
  { id: 'forager', name: '上山采山货', cat: '山上', kind: 'make', makes: 'wildfood', rate: 1.5, max: 24, place: 'woods', item: 'basket', anim: 'squat', season: S4(1.2, 0.8, 1.5, 0.3),
    keys: ['采', '山', '野菜', '蘑菇', '核桃', '认得草木'], est: 6,
    desc: '背着背篓上山：春天挖野菜，秋天捡核桃、采蘑菇', where: '村外山坡、西沟的林子', buyers: '各家（尝个鲜）；核桃骡帮也收', setup: '一只背篓' },
  { id: 'hunter', name: '打猎', cat: '山上', kind: 'make', makes: 'game', rate: 0.3, max: 8, place: 'woods', item: 'pole', anim: 'squat', season: S4(0.8, 0.6, 1.1, 1.4),
    keys: ['打猎', '套兔子', '山', '眼尖', '脚力'], est: 6,
    desc: '在林子边下套子、撵野兔山鸡，入冬最好打', where: '村外山坡、西沟的林子', buyers: '手头宽裕的人家、过节', setup: '几副套子' },
  { id: 'charcoal', name: '烧炭', cat: '山上', kind: 'make', makes: 'charcoal', rate: 1.5, max: 30, place: 'yard', item: 'hoe', anim: 'work', season: S4(0.8, 0.7, 1, 1.2),
    keys: ['烧炭', '烧窑', '砍柴', '力气', '看火'], est: 6,
    desc: '捡林子里的枯树枝，在住处边上挖个炭窑焖成木炭', where: '自家院边的炭窑', buyers: '冬天烤火的人家（比柴暖、没烟）', setup: '挖个炭窑（卖炭不卖柴，不和卖柴的抢）' },
  // ---- 照料人
  { id: 'carer', name: '照看老人孩子', cat: '照料人', kind: 'rounds', service: '照看', price: 4, place: 'rounds', item: 'bowl', anim: 'work', season: S4(1, 1.2, 1.2, 1),
    keys: ['照顾', '做饭', '细心', '带孩子', '伺候', '耐心'], est: 5,
    desc: '去陈家老两口、柳婆婆家帮着做饭收拾；农忙时替下地的人家看孩子', where: '有老人、有孩子的人家', buyers: '有老人的人家，农忙时有孩子的人家', setup: '不用置办' },
  { id: 'water', name: '挑水送水', cat: '照料人', kind: 'rounds', service: '送水', price: 2, place: 'rounds', item: 'buckets', anim: 'work', season: S4(1, 1.3, 1, 1.1),
    keys: ['挑担', '力气', '挑水', '腿脚快'], est: 5,
    desc: '从井里挑水送到人家水缸里，一担两文', where: '井边到各家院里', buyers: '老人家、挑不动水的人家；夏天用水多', setup: '一副水桶、一根扁担' },
  // ---- 新鲜的
  { id: 'agronomist', name: '农技员（育良种）', cat: '新鲜的', kind: 'make', makes: 'seed', rate: 0.3, max: 10, wage: 3, payer: 'headman', place: 'yard', item: 'hoe', anim: 'squat', season: S4(1.3, 0.8, 1.2, 0.6),
    keys: ['识字', '种地', '选种', '农技', '算账', '庄稼'], est: 8,
    desc: '在住处边开一溜试验田，挑穗大粒饱的留种、比着种；农户换了良种，这一季多打一成半粮', where: '自家院边的试验田', buyers: '三家农户，开春、入秋换种；村长家每天补贴 3 文', setup: '几样谷种（向农户要）' },
  { id: 'clerk', name: '村委会文书', cat: '新鲜的', kind: 'wage', wage: 7, payer: 'headman', place: 'rounds', item: 'book', anim: 'talk', season: S4(1, 1, 1, 1),
    keys: ['识字', '写字', '算账', '记账', '跑腿', '会说'], est: 7,
    desc: '给王村长打下手：记账、写通知，挨家挨户传话，开村会时坐在边上记', where: '村长家、挨家挨户', buyers: '村长家按天给工钱（公中的钱）', setup: '笔墨纸' },
  { id: 'relic', name: '挖旧物·办村史馆', cat: '新鲜的', kind: 'make', makes: 'relic', rate: 0.08, max: 6, place: 'digs', item: 'hoe', anim: 'squat', season: S4(1, 1.3, 1, 0.5),
    keys: ['识字', '好奇', '挖', '古董', '考据', '耐性'], est: 5,
    desc: '在老村址的废墟、旧河道里刨大水埋下的老东西：铜钱、瓷片、老匾……挖到的记进村史馆，品相好的骡帮收', where: '老村址的废墟、旧河道', buyers: '骡帮逢集收；挖到的每一样都记进村史馆', setup: '一把小镐（靠运气）' },
  // ---- 旧存档里还有人干的（和 NPC 撞，不再给选）
  { id: 'basketry', name: '编筐', legacy: true, kind: 'make', makes: 'basket', rate: 0.5, place: 'yard', item: 'basket', anim: 'squat', keys: ['编', '筐', '篾'], est: 4, season: S4(1, 1, 1, 1) },
  { id: 'woodcutter', name: '砍柴', legacy: true, kind: 'make', makes: 'wood', rate: 5, place: 'firewood', item: 'axe', anim: 'work', keys: ['砍柴', '斧'], est: 4, season: S4(1, 1, 1, 1) },
];
export const jobById = Object.fromEntries(JOBS.map((j) => [j.id, j]));
/** 卡片上"此刻在干什么"。 */
const DOING = { hand: '下地帮工', fisher: '河滩上钓鱼', gardener: '侍弄菜地', miller: '水磨坊磨面', builder: '等人叫去修房', tailor: '门口做衣裳', snack: '村口烙烧饼', butcher: '等人叫去杀猪', teahouse: '村口摆茶摊', forager: '上山采山货', hunter: '山上下套子', charcoal: '炭窑烧炭', carer: '照看老人孩子', water: '挑水送水', agronomist: '试验田里育种', clerk: '村委会的差事', relic: '老村址刨旧物', basketry: '编筐', woodcutter: '砍柴' };
export const JOB_CATS = ['地里河里', '手艺买卖', '山上', '照料人', '新鲜的'];

/** 挖到的老东西（村史馆的展品，按挖到的先后轮着来）。 */
export const RELICS = ['一枚光绪通宝', '半只青花碗', '一块刻着"石峪"的老匾', '一把锈了的铜锁', '一只瓷枕', '一副老碾框', '一面铜镜', '一枚银簪子', '一只烟袋锅', '一块界碑', '一只瓦当', '一册泡烂的账本'];

/** 手艺对得上几个关键词（勾的标签 + 自己写的）。 */
const skillHits = (p, job) => job.keys.filter((k) => (p.skills ?? []).some((s) => s.includes(k) || k.includes(s))).length;
const rivalsOf = (job, V, self) => (V?.people ?? []).filter((v) => v.p.jobId === job.id && v.p.id !== self).length;

/**
 * 给每个行当打分、估挣头，返回 [{ job, score, why, est, short, match, rivals }]（高的在前）。
 * short：村里正缺（特意留的空缺没人做，或者这样东西 / 这门活最近老有人要没人给）；match：手艺对口；est：照今天的季节、同行人数估一天挣几文。
 */
export function rankJobs(p, econ, V = econ.V) {
  const S = season();
  return JOBS.filter((j) => !j.legacy).map((job) => {
    const g = job.makes, miss = g ? (econ.missing[g] ?? 0) : (econ.missing[`job:${job.id}`] ?? 0);
    const rivals = rivalsOf(job, V, p.id);
    const hits = skillHits(p, job);
    const short = (job.vacancy && !rivals) || miss > 1;
    const value = miss * (g ? GOODS[g]?.price ?? 1 : job.price ?? 4) * 0.5;
    const est = Math.max(1, Math.round((job.est * (job.season?.[S] ?? 1)) / (rivals + 1)));
    const score = value + (short ? 8 : 0) - rivals * 4 + hits * 6 + est * 0.3 + hash(`${p.id}/${job.id}`);
    const why = [hits ? `会${(p.skills ?? []).filter((s) => job.keys.some((k) => s.includes(k) || k.includes(s))).join('、')}` : '', short ? '村里正缺' : '', rivals ? `已有 ${rivals} 人在做` : ''].filter(Boolean).join('，');
    return { job, score, why, est, short, match: hits > 0, rivals };
  }).sort((a, b) => b.score - a.score);
}

/** 借住哪家：人口少（住得下）、和他合得来的（固定随机数 + 同样的手艺）。 */
export function pickHost(p, V) {
  const homes = ['school', 'doctor', 'shepherd', 'store', 'carpenter', 'farmA', 'farmB', 'tofu', 'smith', 'headman', 'farmC'];
  const count = (id) => V.people.filter((v) => (v.p.sleepAt ?? v.p.home) === id).length;
  return homes.map((id) => ({ id, s: -count(id) * 2 + hash(`${p.id}/${id}/host`) * 3 + (V.people.some((v) => v.p.home === id && (v.p.skills ?? []).some((s) => (p.skills ?? []).includes(s))) ? 2 : 0) }))
    .sort((a, b) => b.s - a.s)[0].id;
}

/** 按行当生成一天的日程（和名册里一样的写法：[[钟点, 活动, 参数], …]）。还没认完人的：一整天认人。 */
export function scheduleFor(job, met = true) {
  if (!job || !met) return [[6.2, 'meetVillage'], [11.8, 'dinner'], [12.5, 'meetVillage'], [18.4, 'dinner'], [19.0, 'evening'], [20.4, 'home']];
  const w = ['newJob', job.id];
  if (job.id === 'teahouse') return [[6.0, 'yardWork'], [8.0, ...w], [11.8, 'dinner'], [12.5, 'home'], [14.0, ...w], [18.2, 'dinner'], [18.8, ...w], [21.0, 'home']]; // 茶摊：傍晚村口人最多
  return [[5.8, 'yardWork'], [6.6, ...w], [11.8, 'dinner'], [12.5, 'home'], [13.2, ...w], [17.8, 'yardWork'], [18.4, 'dinner'], [19.0, 'evening'], [20.4, 'home']];
}

/**
 * 把一个新人放进村子。p：卡片上填的（name、nick、age、sex、skills、traits、bio、likes、外观……，还有 coins、goods、home、jobId / jobPicked）。
 * 已经认过人的（从浏览器存档里读回来的）照旧；新来的现在借住 / 住进老宅、先认人，认完按选好的行当开张（没选的自动挑）。
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
  if (p.jobId && !jobById[p.jobId]) p.jobId = undefined;
  p.met ??= !!(p.jobId && !p.jobPicked); // 旧存档：定了行当的都认过人了
  const job = p.jobId ? jobById[p.jobId] : null;
  p.job = job ? (p.met ? job.name : `新来的（要做${job.name}），在认人`) : '新来的，还没找着活';
  p.day = scheduleFor(job, p.met);
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

/** 认人：挨家走到院门口打招呼（说会儿话），每家熟识度 +2；走完一圈就开张。 */
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

/** 认完人：用户选好的照选的开张；没选的打分取最高。按行当重排日程，存档。 */
export function chooseJob(v) {
  const V = v.V, ranked = rankJobs(v.p, V.econ, V);
  const pick = (v.p.jobPicked && ranked.find((r) => r.job.id === v.p.jobId)) || ranked[0];
  setJob(v, pick.job.id, { why: pick.why });
  V.onNewcomer?.(v, ranked);
  v.finish();
}

/** 定下 / 改换行当：日程按新行当排，卡片、档案跟着变。picked：用户亲手选的。 */
export function setJob(v, id, { why = '', picked = v.p.jobPicked } = {}) {
  const job = jobById[id];
  if (!job) return;
  if (v.p.jobId && v.p.jobId !== id && v.p.met) v.p.jobHistory = [...(v.p.jobHistory ?? []), v.p.jobId]; // 改过行
  v.p.jobId = id;
  v.p.jobPicked = picked;
  v.p.met = true;
  v.p.job = job.name;
  v.p.jobWhy = why;
  v.p.day = scheduleFor(job);
  const u = v.V.econ.unitOfV(v);
  if (u) { u.since = v.V.econ.day; u.earned = 0; } // 从哪天开张、开张以来挣了多少（档案里看，挣不着钱可以改行）
}

/** 干自己的行当：走到干活的地方，按模板的动作干（产出在 economy.js 的 jobTick 里按 job 攒；上门的活从 econ.calls 里领）。 */
ACTIVITIES.newJob = (v, id) => {
  const V = v.V, job = jobById[id], sq = V.C.square, pick = (a) => a[Math.floor(v.rand() * a.length)];
  const near = (a, k = 5) => { const [x, z] = [v.pos.x, v.pos.z]; return pick([...a].sort((p, q) => Math.hypot(p[0] - x, p[1] - z) - Math.hypot(q[0] - x, q[1] - z)).slice(0, k)); }; // 就近换个地方（别一趟趟满山跑）
  if (!job) { ACTIVITIES.idle(v); return; }
  v.char.setItem(job.item);
  v.errandText = DOING[id] ?? job.name;
  if (job.place === 'mill') { v.go(V.mill.at); v.loop = () => v.do(job.anim, 10, { face: V.mill.face }); return; }
  if (job.place === 'square') { // 村口：烧饼炉子、茶摊，站在场子东南角
    const at = V.nav.nearestFree(...sq.at(job.id === 'teahouse' ? -2.4 : 2.6, 6.4));
    v.go(at);
    v.loop = () => v.do(v.rand() < 0.5 ? 'talk' : job.anim === 'talk' ? 'idle' : job.anim, 8, { face: sq.at(0, 3) });
    return;
  }
  if (job.place === 'gate') { v.go(v.home.gateOut()); v.loop = () => { v.seat = 0.3; v.do(job.anim, 10); }; return; }
  if (job.place === 'firewood') { ACTIVITIES.firewood(v); return; }
  if (job.place === 'beach') { // 河滩上找个地方坐下，脸朝水
    const spots = V.oldSite.beach;
    v.loop = () => { const at = spots.length ? near(spots, 4) : v.home.spot('yard'); v.go(at); v.seat = 0.1; v.do('sit', 30, { face: [at[0], at[1] + 4] }); };
    v.end = () => { v.seat = null; };
    return;
  }
  if (job.place === 'woods') { // 上山：离住处最近的一片林子边，挖、捡、下套子；一处干一阵再挪
    const [hx, hz] = v.home.gateOut(), spots = V.woods.map((w) => w.at).sort((p, q) => Math.hypot(p[0] - hx, p[1] - hz) - Math.hypot(q[0] - hx, q[1] - hz)).slice(0, 10);
    v.loop = () => { v.go(near(spots, 4)); v.do(job.anim, 25); };
    return;
  }
  if (job.place === 'digs') { v.loop = () => { v.go(near(V.oldSite.digs, 4)); v.do('squat', 25); }; return; } // 老村址的废墟、旧河道里刨（一处刨一阵，再挪到旁边）
  if (job.place === 'field') { // 帮忙种田：到最宽裕的那户的地里帮着干，傍晚收工钱（economy.js 的 newcomerDues）
    const boss = V.econ.employerFor(v);
    v.p.workFor = boss?.id ?? null;
    const pts = V.fields[boss && ['farmB', 'farmC'].includes(boss.id) ? (boss.id === 'farmC' ? 'fieldE' : 'fieldWest') : 'fieldW'] ?? [];
    v.loop = () => { const p = pts[Math.floor(v.rand() * pts.length)]; if (p) v.go(p); v.do('work', 10); };
    return;
  }
  if (job.place === 'rounds') { rounds(v, job); return; }
  v.loop = () => { v.go(v.home.randomPoint()); v.do(job.anim, 8); }; // 自家（借住人家 / 老宅）院里
};

/**
 * 上门做活：从今天的活计单（economy.js 凌晨排的 calls[行当]）里领一家，走过去在院里干一阵，主家给钱。
 * 挑水送水先去井边打水；文书挨家传话（不收钱，工钱村长家按天给）。今天的活干完了，回住处歇着。
 */
function rounds(v, job) {
  const V = v.V, E = V.econ;
  v.loop = () => {
    const call = E.nextCall(job.id, v);
    if (!call) { v.char.setItem(job.item); v.errandText = DOING[job.id]; v.go(v.home.spot('yard') ?? v.home.gateOut()); v.do('idle', 10); return; }
    const c = V.C[call.home] ?? V.C.square;
    v.errandText = `去${call.place}${call.service}`;
    if (job.id === 'water') { v.char.setItem('buckets'); v.go(V.well.spot()); v.do('work', 4, { face: V.well.center }); }
    v.go(c.spot('yard') ?? c.gateOut());
    v.do(job.anim, call.dur);
    v.call(() => { E.serveCall(call, v); v.errandText = DOING[job.id]; });
  };
}

/** 茶摊：每过一阵，旁边闲坐、闲聊的人里有一个来喝碗茶（economy.js 的 charge）。life/index.js 每帧调。 */
export function teaTick(V, h) {
  for (const v of V.people) {
    if (v.p.jobId !== 'teahouse' || v.doing !== 'newJob' || v.state === 'walk' || v.inside) continue;
    if (v.nextTea !== undefined && h < v.nextTea && v.nextTea - h < 2) continue;
    v.nextTea = h + 0.5 + v.rand() * 0.6;
    const me = V.econ.unitOfV(v);
    const near = V.people.filter((o) => o !== v && !o.inside && !o.p.caravan && o.p.body !== 'child' && o.state !== 'walk' && Math.hypot(o.pos.x - v.pos.x, o.pos.z - v.pos.z) < 9 && V.econ.unitOfV(o) !== me);
    const o = near[Math.floor(v.rand() * near.length)];
    if (o) V.econ.charge(V.econ.unitOfV(o), v, 1, '喝茶', o);
  }
}
