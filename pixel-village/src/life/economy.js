import { hash, lunarOf } from './events.js';
import { season } from '../season.js';
import { friendsOf } from '../residents.js';
import { PLACES } from '../labels.js';
import { EN } from '../i18n.js';
import { pNick } from '../names.js';

/*
 * 村里的买卖（设计见 wikigarden efforts/creative-coding/像素村落-经济与交易系统设计.md）。
 *
 * 钱和东西按"户"算（一家人一个钱袋、一个存货；村口的剃头匠、货郎各自一户；骡帮算村外）。用铜钱（文），也可以以物易物、赊账。
 *   产出：人在干活的位置上真干着（不是在路上走），按产出表一点点攒，攒够一件进自家库存（豆腐早上磨出来，早上就能卖）
 *   吃用：每天凌晨 4:30 结一次——按人头和季节吃掉粮食、青菜、柴、盐；豆腐、青菜、鸡蛋放久了坏
 *   用坏：锄头镰刀、筐、衣裳隔些日子坏一件，有人生病要看郎中——这些是"想买"的来头
 *   调价：卖家自己定价（TownSnyty 的规则）：昨天卖掉 ≥2 件且剩货 ≤2 涨一成，一件没卖且剩货 ≥5 降一成，夹在底价 0.5～2 倍
 *   购物：每户"缺的 = 目标存量 − 现有"，挑卖家（价钱、远近、熟不熟、各人口味），派一个人在某个钟点去买（临时差事，见 trade.js）
 *   付账：先付铜钱；钱不够拿卖家缺的东西抵；再不行熟人赊账（赶集日结清）；都不行就挂着，明天再说
 *   村外：骡帮逢集来，收山货（钱进村）、卖盐铁布火柴给杂货铺（钱出村）。其余都是村里转手，每天对一遍"总数 = 上次 + 进 − 出"
 * 全部用 hash(天/户/事) 掷骰子，同样设置每次结果一样。
 */

/** 东西：底价（文）、单位；decay：每天放坏的比例；outside：只能从村外进；export：骡帮收。 */
export const GOODS = {
  grain: { name: '粮食', unit: '升', en: { name: 'Grain', unit: '' }, price: 6 },
  flour: { name: '白面', unit: '升', en: { name: 'Wheat flour', unit: '' }, price: 10 },
  soy: { name: '豆子', unit: '升', en: { name: 'Soybeans', unit: '' }, price: 5 },
  tofu: { name: '豆腐', unit: '块', en: { name: 'Tofu', unit: 'cake' }, price: 2, decay: 1 },
  veg: { name: '青菜', unit: '斤', en: { name: 'Greens', unit: '' }, price: 1, decay: 0.5 },
  pickle: { name: '咸菜', unit: '坛', en: { name: 'Pickles', unit: 'jar' }, price: 8 },
  egg: { name: '鸡蛋', unit: '个', en: { name: 'Eggs', unit: '' }, price: 1, decay: 0.12 },
  wood: { name: '柴', unit: '捆', en: { name: 'Firewood', unit: 'bundle' }, price: 3 },
  salt: { name: '盐', unit: '斤', en: { name: 'Salt', unit: '' }, price: 12, outside: true },
  match: { name: '洋火', unit: '盒', en: { name: 'Matches', unit: 'box' }, price: 2, outside: true },
  cloth: { name: '布', unit: '尺', en: { name: 'Cloth', unit: '' }, price: 6, outside: true },
  iron: { name: '铁料', unit: '斤', en: { name: 'Pig iron', unit: '' }, price: 8, outside: true },
  tool: { name: '铁农具', unit: '件', en: { name: 'Iron tools', unit: '' }, price: 80 },
  wooden: { name: '木器', unit: '件', en: { name: 'Woodenware', unit: '' }, price: 50 },
  pill: { name: '丸药', unit: '丸', en: { name: 'Pills', unit: '' }, price: 5 },
  honey: { name: '蜂蜜', unit: '斤', en: { name: 'Honey', unit: '' }, price: 15, export: true },
  wool: { name: '羊毛', unit: '斤', en: { name: 'Wool', unit: '' }, price: 10, export: true },
  basket: { name: '筐', unit: '个', en: { name: 'Baskets', unit: '' }, price: 8, export: true },
  bun: { name: '烧饼', unit: '个', en: { name: 'Flatbread', unit: '' }, price: 3, decay: 1 }, // 卖吃食的（村里特意留的空缺）
  clothes: { name: '衣裳', unit: '件', en: { name: 'Clothes', unit: 'set' }, price: 40 }, // 裁缝做的（空缺）
  lime: { name: '石灰', unit: '斤', en: { name: 'Lime', unit: '' }, price: 3 }, // 老村址白家石灰窑：盘炕、刷墙、修房子（太沉，骡帮不收）
  stone: { name: '条石', unit: '块', en: { name: 'Stone blocks', unit: '' }, price: 6 }, // 老村址葛家石匠院：砌墙基、修猪圈、盘灶台
  duckEgg: { name: '鸭蛋', unit: '个', en: { name: 'Duck eggs', unit: '' }, price: 2, decay: 0.05 }, // 老村址凤仙嫂的鸭蛋（腌成咸鸭蛋放得住）
  // 新来的人的行当（newcomers.js 的 JOBS）：村里原来没人做的东西
  fish: { name: '鱼', unit: '条', en: { name: 'Fish', unit: '' }, price: 3, decay: 0.5 },
  pork: { name: '猪肉', unit: '斤', en: { name: 'Pork', unit: '' }, price: 4, decay: 0.3 },
  wildfood: { name: '山货', unit: '斤', en: { name: 'Wild produce', unit: '' }, price: 3, decay: 0.1, export: true }, // 野菜、蘑菇、核桃（核桃骡帮收）
  game: { name: '野味', unit: '只', en: { name: 'Game', unit: '' }, price: 6, decay: 0.3 },
  charcoal: { name: '木炭', unit: '斤', en: { name: 'Charcoal', unit: '' }, price: 4 },
  seed: { name: '良种', unit: '升', en: { name: 'Seed grain', unit: '' }, price: 30 }, // 农技员育的谷种：换上的农户这一季多打一成半粮
  relic: { name: '老物件', unit: '件', en: { name: 'Relics', unit: '' }, price: 25, export: true }, // 老村址废墟里挖出来的（骡帮收）
  coal: { name: '煤', unit: '斤', en: { name: 'Coal', unit: '' }, price: 2, export: true }, // 老村址煤窑挖的（骡帮也收）
};

/** 界面上东西的名字（英文界面读 GOODS[g].en）。 */
export const goodName = (g) => (EN ? GOODS[g]?.en?.name : GOODS[g]?.name) ?? g;
/** 单位：直接接在数量后面写——中文「升」「捆」；英文带前导空格、配单复数（" bundles"），没有量词的返回 ''。 */
export const goodUnit = (g, n = 2) => {
  if (!EN) return GOODS[g]?.unit ?? '';
  const u = GOODS[g]?.en?.unit;
  return u ? ` ${n === 1 ? u : /(x|ch|sh|s)$/.test(u) ? `${u}es` : `${u}s`}` : '';
};
/** 「柴 11捆」/「Firewood 11 bundles」。 */
export const goodQty = (g, n) => `${goodName(g)} ${n}${goodUnit(g, n)}`;

/*
 * 账上存的字（成交记录的 service / place、想买的 why）一律存中文（存档是中文的 Node 模拟写的，英文网页也读这份），
 * 显示时用 reasonText 翻：查不到的（比如 place 里存的卖家名字）原样返回。
 */
export const REASON_EN = {
  // service：手艺活、工钱、房钱……（成交记录里 good 为空时的那件事）
  房钱: 'Rent', 工钱: 'Wages', 帮工修房: 'Help with house repairs', 地租: 'Land rent', 学费: 'School fees', 钉马掌: 'Shoeing mules', 牵线: 'Brokerage',
  修农具: 'Tool mending', 修家什: 'Furniture mending', 錾磨盘: 'Millstone dressing', 修房盘炕: 'House and kang repairs', 送水: 'Water delivery', 照看: 'Caregiving',
  杀猪: 'Pig slaughtering', 传话: 'Passing on notices', 喝茶: 'Tea', 剃头: 'Haircut', 看病: "Doctor's visit", 跑腿: 'Errand fee',
  // place：在哪儿 / 怎么成交的
  接济: 'Neighbourly help', 骡帮: 'Mule caravan', 集上: 'At the market', 货郎代买: 'Bought by the peddler',
  // why：为什么想买
  锄头用坏了: 'The hoe wore out', '板凳、犁把子坏了': 'A stool or plough handle broke', 筐漏了: 'The basket has a hole in it', 衣裳穿破了: 'Clothes worn through',
  '赶集、看戏饿了想吃个烧饼': 'Hungry at the market or the opera, fancies a flatbread', 想吃白面: 'Craving white flour', 烧炭引窑火: 'To fire up the charcoal kiln',
  有人病了: 'Someone is ill', 修房子: 'To fix up the house', 想吃咸鸭蛋: 'Craving salted duck eggs', 想吃条鱼: 'Fancies a fish', 割二斤肉: 'A couple of jin of pork',
  尝个鲜野菜: 'A taste of fresh wild greens', 买点核桃蘑菇: 'Some walnuts and mushrooms', 买只野味: 'Some game for the pot', '烤火（炭没烟）': 'For the brazier (charcoal gives no smoke)',
  '烧水、熨衣裳': 'Boiling water, pressing clothes', '烧炕、烤火': 'Heating the kang, keeping warm', 换新谷种: 'New seed grain', 蒸白面馍: 'Steaming white buns',
  添置家具: 'Some new furniture', 做身新衣裳: 'A new set of clothes', 扯布做新衣裳: 'Cloth for new clothes', '盘炕、刷墙': 'Building a kang, whitewashing walls',
  '修猪圈、垒灶台': 'Mending the pigsty, building a stove',
};
/** 账上的中文字 → 当前界面语言（中文原样；英文查 REASON_EN，查不到原样）。 */
export const reasonText = (s) => (EN && s ? REASON_EN[s] ?? s : s);

/** 哪户算哪户：村口的几个人各自一户；骡帮是村外的。 */
export const unitOf = (p) => p.unit ?? (p.caravan ? 'caravan' : p.home === 'square' ? p.id : p.home); // 新来的人自己一户（p.unit）

const kid = (p) => p.body === 'child';
const adult = (p) => !kid(p) && !p.caravan;

/**
 * 产出：人在干这件事（v.doing），每干一个时辰出多少；in：每出一件要用掉什么（不够就不出）；
 * who：谁干这件事才算（不写 = 谁都算）；max：自家存到这么多就不再做了（卖不掉白做）。
 */
const MAKE = [
  { act: ['grind', 'boil'], unit: 'tofu', good: 'tofu', rate: 3, in: { soy: 0.25 }, max: 14 },
  { act: ['garden'], good: 'veg', rate: 4, max: 14, seasons: ['spring', 'summer', 'autumn'] },
  { act: ['field', 'weed', 'sow', 'plowHoe'], unit: ['carpenter', 'farmB', 'farmC'], good: 'veg', rate: 3.5, max: 14, seasons: ['spring', 'summer', 'autumn'] },
  { act: ['field', 'reap', 'pickCorn', 'reapWheat', 'carrySheaves', 'haul', 'thresh'], unit: ['farmA', 'farmB', 'farmC'], good: 'grain', rate: 2.5, max: 400, seasons: ['summer', 'autumn'] },
  { act: ['field'], unit: 'tofu', good: 'soy', rate: 2, max: 80, seasons: ['autumn'] },
  { act: ['field'], unit: 'farmC', good: 'soy', rate: 1, max: 60, seasons: ['summer', 'autumn'] }, // 吴家东坡也种豆子，卖给豆腐坊
  { act: ['firewood'], good: 'wood', rate: 5, max: 30 },
  { act: ['work'], who: 'zhang_tiechui', good: 'tool', rate: 0.12, in: { iron: 2, wood: 1 }, max: 6 },
  { act: ['work'], who: 'liu_youfu', good: 'wooden', rate: 0.15, max: 6 },
  { act: ['work'], who: 'zhou_jishi', good: 'pill', rate: 1.5, in: { honey: 0.05 }, max: 40 },
  { act: ['tendBees'], good: 'honey', rate: 0.5, max: 30, seasons: ['spring', 'summer', 'autumn'] },
  { act: ['herd'], good: 'wool', rate: 0.6, max: 40, seasons: ['spring'] },
  { act: ['sitGate', 'garden'], who: 'chen_mancang', good: 'basket', rate: 0.15, max: 8 },
  { act: ['yardWork'], who: ['he_xiulan', 'sun_qiaoyun'], good: 'pickle', rate: 0.06, in: { veg: 2, salt: 0.1 }, max: 6, seasons: ['autumn', 'winter'] },
  { act: ['mill'], good: 'flour', rate: 2, in: { grain: 1 }, max: 30 },
  // 老村址
  { act: ['driftwood'], good: 'wood', rate: 4, max: 30 }, // 水生捞漂木，晒干当柴卖
  { act: ['tendDucks'], good: 'duckEgg', rate: 2.5, max: 30 }, // 凤仙嫂的鸭蛋
  { act: ['work'], who: 'ge_shitou', good: 'stone', rate: 0.6, max: 20 },
  { act: ['work'], who: 'bai_laohui', good: 'lime', rate: 2, in: { wood: 0.15 }, max: 60 },
];

/** 天天吃用（每户每天）：n = 人头（小孩算 0.6 个）。返回 { 东西: 数量 }。 */
function eatToday(u) {
  const S = season(), n = u.members.reduce((s, p) => s + (kid(p) ? 0.6 : 1), 0);
  const use = { grain: 0.5 * n, wood: (0.8 + 0.12 * n) * (S === 'winter' ? 1.8 : 1), salt: 0.02 * n, match: 0.05 };
  if (S === 'winter') use.pickle = 0.03 * n; else use.veg = 0.3 * n;
  return use;
}

/** 存多少心里才踏实（低于六成就想买）。 */
function targetOf(u) {
  const e = eatToday(u), t = {};
  t.grain = e.grain * 7; t.wood = e.wood * 4; t.salt = Math.max(0.3, e.salt * 15); t.match = 0.3;
  if (e.veg) t.veg = e.veg * 1.5; if (e.pickle) t.pickle = 0.3;
  t.tofu = 1; // 隔两三天吃一回豆腐（看手头宽不宽）
  return t;
}

/** 开局的家底（铜钱）。 */
const PURSE = { headman: 320, store: 420, doctor: 160, smith: 140, carpenter: 120, tofu: 110, school: 60, shepherd: 90, farmA: 80, farmB: 100, farmC: 100, zheng_laotou: 40, qian_xiaoer: 90, riverTemple: 40, mason: 70, limeKiln: 60, duckYard: 50 };

export class Economy {
  constructor(V) {
    this.V = V;
    this.units = new Map();
    for (const v of V.people) {
      const id = unitOf(v.p);
      if (!this.units.has(id)) this.units.set(id, { id, members: [], coins: PURSE[id] ?? 60, stock: {}, ask: {}, sold: {}, made: {}, wants: [], log: [], owe: {} });
      this.units.get(id).members.push(v.p);
    }
    this.units.get('caravan').coins = 0; // 村外的：钱进出都记在 flow 上
    this.ties = new Map(); // "a|b" → 熟识度
    for (const v of V.people) for (const id of friendsOf(v.p.id)) this.ties.set(this.key(v.p.id, id), 4);
    for (const u of this.units.values()) for (const a of u.members) for (const b of u.members) if (a !== b) this.ties.set(this.key(a.id, b.id), 8);
    this.trades = []; // 全村的账（最近的在后面）
    this.flow = { in: 0, out: 0 };
    this.day = 0;
    this.acc = new Map(); // 人 → { 东西: 攒了多少 }
    this.missing = {}; // 东西 → 连着几天想买没买到（缺口）
    this.hungry = []; // 断粮的：'天:户'（自检用）
    this.fails = []; // 买不成的原因（自检用）
    this.seedStock();
    this.total0 = this.total();
  }

  key(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
  tie(a, b) { return this.ties.get(this.key(a, b)) ?? 0; }
  bump(a, b, d = 1) { const k = this.key(a, b); this.ties.set(k, Math.min(20, (this.ties.get(k) ?? 0) + d)); }
  unit(id) { return this.units.get(id); }
  unitOfV(v) { return this.units.get(unitOf(v.p)); }
  total() { let s = 0; for (const u of this.units.values()) if (u.id !== 'caravan') s += u.coins; return s; }

  /** 开局的存货：看季节（秋天粮仓满、春天快见底），各户按家当有不同的东西。 */
  seedStock() {
    const S = season(), grainK = { autumn: 1.4, winter: 1, spring: 0.55, summer: 0.4 }[S];
    for (const u of this.units.values()) {
      if (u.id === 'caravan') continue;
      const t = targetOf(u), st = u.stock;
      // 开局的家底：每户都存着够吃一个月上下的口粮（25～35 天，各家错开，别哪天全村一起去买粮）、十天的柴、一个月的盐和火柴、两天的青菜——
      // 开局几天村里照常过日子，买卖从豆腐、青菜、剃头这些日常小事开始，存粮吃下去了才陆续有人去买粮
      const e = eatToday(u), days = (g, d0, d1) => e[g] ? Math.ceil(e[g] * (d0 + hash(`${u.id}/${g}/seed`) * (d1 - d0))) : 0;
      Object.assign(st, { grain: days('grain', 25, 35), wood: days('wood', 8, 12), salt: Math.max(1, days('salt', 25, 40)), match: 2, veg: days('veg', 1.5, 2.5), pickle: days('pickle', 30, 40) });
      st.tofu = 0;
      if (['farmA', 'farmB', 'farmC'].includes(u.id)) st.grain = Math.round(160 * grainK);
      if (u.id === 'tofu') { st.soy = Math.round(40 * grainK); st.grain = Math.round(st.grain * 0.8); }
      if (u.id === 'store') Object.assign(st, { salt: 20, match: 30, cloth: 60, iron: 10 });
      if (u.id === 'qian_xiaoer') Object.assign(st, { cloth: 30, match: 15 });
      if (u.id === 'smith') Object.assign(st, { iron: 8, wood: 8, tool: 2 });
      if (u.id === 'carpenter') st.wooden = 1;
      if (u.id === 'doctor') Object.assign(st, { honey: 6, pill: 20 });
      if (u.id === 'farmA') st.basket = 3;
      if (u.id === 'shepherd') st.wool = S === 'spring' ? 0 : 6;
      if (u.id === 'mason') st.stone = 6;
      if (u.id === 'limeKiln') Object.assign(st, { lime: 20, wood: st.wood + 4 });
      if (u.id === 'duckYard') st.duckEgg = 8;
      for (const g in st) u.ask[g] = GOODS[g]?.outside && ['store', 'qian_xiaoer'].includes(u.id) ? Math.ceil(GOODS[g].price * 1.5) : GOODS[g]?.price ?? 1; // 杂货铺、货郎卖外来货：进价加五成（翻山背进来的辛苦钱）
    }
  }

  // ---------------------------------------------------------------- 产出（每帧）

  /** dh：这一帧过了多少村里的钟点。人在干活的位置上干着（不是在走路、不在屋里）才攒。 */
  tick(dh) {
    if (dh <= 0 || dh > 1) return;
    const S = season();
    for (const v of this.V.people) {
      if (v.inside || (v.state === 'walk' && !(v.p.jobId && v.doing === 'newJob' && this.jobs?.[v.p.jobId]?.kind !== 'make')) || v.p.caravan) continue; // 上门做活、帮工的走路也算在干活
      const u = this.unitOfV(v);
      if (v.p.jobId && v.doing === 'newJob') { this.jobTick(v, u, dh); continue; }
      for (const r of MAKE) {
        if (!r.act.includes(v.doing)) continue;
        if (r.unit && !(Array.isArray(r.unit) ? r.unit : [r.unit]).includes(u.id)) continue;
        if (r.who && !(Array.isArray(r.who) ? r.who : [r.who]).includes(v.p.id)) continue;
        if (r.seasons && !r.seasons.includes(S)) continue;
        if ((u.stock[r.good] ?? 0) >= r.max) continue;
        const a = this.acc.get(v) ?? {}; this.acc.set(v, a);
        a[r.good] = (a[r.good] ?? 0) + r.rate * dh * (r.good === 'grain' && u.boost === S ? 1.15 : 1); // 换了良种的农户：这一季多打一成半
        while (a[r.good] >= 1) {
          const need = r.in ?? {};
          if (Object.entries(need).some(([g, q]) => (u.stock[g] ?? 0) < q)) { a[r.good] = 0.99; break; } // 原料不够：做不出来
          for (const [g, q] of Object.entries(need)) u.stock[g] -= q;
          u.stock[r.good] = (u.stock[r.good] ?? 0) + 1;
          u.made[r.good] = (u.made[r.good] ?? 0) + 1;
          u.ask[r.good] ??= GOODS[r.good].price;
          a[r.good] -= 1;
        }
        break;
      }
    }
  }

  /** 新来的人干自己的行当（newcomers.js 的 JOBS）：产出进自己的库存；短工记干了几个时辰（第二天东家给工钱）。 */
  jobTick(v, u, dh) {
    const job = this.jobs?.[v.p.jobId];
    if (!job) return;
    u.worked = (u.worked ?? 0) + dh; // 干了几个时辰（帮工、文书、农技员第二天按这个给工钱 / 补贴）
    if (!job.makes) return;
    if ((u.stock[job.makes] ?? 0) >= (job.max ?? 12)) return;
    const a = this.acc.get(v) ?? {}; this.acc.set(v, a);
    const fueled = job.fuel && Object.entries(job.fuel).every(([g, q]) => (u.stock[g] ?? 0) >= q); // 烧炭的手头有煤：引窑火、封窑，一窑出炭多一半
    a[job.makes] = (a[job.makes] ?? 0) + job.rate * dh * (job.season?.[season()] ?? 1) * (fueled ? job.fuelBoost ?? 1 : 1); // 季节影响收成
    while (a[job.makes] >= 1) {
      const need = job.in ?? {};
      if (Object.entries(need).some(([g, q]) => (u.stock[g] ?? 0) - this.keep(u, g) < q)) { a[job.makes] = 0.99; u.short = true; break; } // 原料不够（自家口粮留着不动）：今天得去买
      for (const [g, q] of Object.entries(need)) u.stock[g] -= q;
      if (job.fuel) for (const [g, q] of Object.entries(job.fuel)) if ((u.stock[g] ?? 0) >= q) u.stock[g] -= q;
      u.stock[job.makes] = (u.stock[job.makes] ?? 0) + 1;
      u.made[job.makes] = (u.made[job.makes] ?? 0) + 1;
      u.ask[job.makes] ??= Math.max(1, Math.floor(GOODS[job.makes].price * 0.8)); // 刚开张：便宜点招揽客人
      a[job.makes] -= 1;
      if (job.makes === 'relic') { const V = this.V; V.relics ??= []; V.relics.push({ day: this.day, by: v.p.name }); V.onRelic?.(v, V.relics.length); } // 挖到一件老东西：记进村史馆
    }
  }

  /** 加一户（新来的人）：本钱、带来的东西。 */
  addUnit(p, coins, goods) {
    const u = { id: p.id, members: [p], coins: Math.round(coins), stock: { ...goods }, ask: {}, sold: {}, made: {}, wants: [], log: [], owe: {} };
    for (const g in u.stock) u.ask[g] = GOODS[g]?.price ?? 1;
    this.units.set(p.id, u);
    this.total0 += u.coins; // 带进村的钱：算"进村"
    this.flow.in += 0; // （不记成骡帮的流入，开局总数里加上）
    u.wants = this.wantsOf(u, this.day);
    return u;
  }

  /** 短工给谁干：手头最宽裕的种地人家。 */
  employerFor() { return ['farmA', 'farmB', 'farmC'].map((id) => this.unit(id)).sort((a, b) => b.coins - a.coins)[0]; }

  /** 新来的人每天的开销：给房东房钱；短工收东家工钱（昨天干够三个时辰）。 */
  newcomerDues(day) {
    for (const u of this.units.values()) {
      const p = u.members[0];
      if (!p?.newcomer) continue;
      const host = this.unit(p.home), job = this.jobs?.[p.jobId];
      if (host && host !== u) {
        const rent = 2, hp = host.members.find(adult) ?? host.members[0];
        if (u.coins >= rent) { u.coins -= rent; host.coins += rent; this.record({ day, hour: 6.5, buyer: p.id, from: u.id, seller: hp.id, to: host.id, good: null, service: '房钱', qty: 1, price: rent, kind: 'cash' }); }
      }
      if (job?.wage && (u.worked ?? 0) >= 3) { // 帮工、文书：昨天干够三个时辰，东家（农户 / 村长家）给工钱，季节有忙闲
        const boss = job.payer === 'headman' ? this.unit('headman') : this.unit(p.workFor) ?? this.employerFor(), wage = Math.min(Math.round(job.wage * (job.season?.[season()] ?? 1)), boss?.coins ?? 0);
        if (wage > 0) { boss.coins -= wage; u.coins += wage; this.record({ day, hour: 6.4, buyer: boss.members.find(adult)?.id ?? boss.members[0].id, from: boss.id, seller: p.id, to: u.id, good: null, service: '工钱', qty: 1, price: wage, kind: 'cash' }); }
      }
      u.worked = 0;
    }
  }

  // ---------------------------------------------------------------- 每天凌晨结一次

  newDay(day) {
    if (day === this.day) return;
    const first = this.day === 0;
    this.day = day;
    const S = season();
    for (const u of this.units.values()) {
      if (u.id === 'caravan') continue;
      const st = u.stock;
      if (!first) {
        for (const [g, q] of Object.entries(eatToday(u))) { if ((st[g] ?? 0) < q && g === 'grain') this.hungry.push(`${day}:${u.id}`); st[g] = Math.max(0, (st[g] ?? 0) - q); } // 吃用（粮食不够吃记一笔）
        for (const g in st) if (GOODS[g]?.decay) st[g] = Math.floor(st[g] * (1 - GOODS[g].decay) + 1e-9); // 放坏
        if (u.members.some((p) => /鸡/.test((p.owns ?? []).join()))) st.egg = (st.egg ?? 0) + (S === 'winter' ? 1 : 3); // 鸡下蛋
        if (u.members.some((p) => p.sex === '男' && adult(p) && p.age >= 16 && p.age < 60)) st.wood = (st.wood ?? 0) + 1; // 有壮劳力的人家：顺手捡柴、劈柴，每天自给一捆
        if (this.V.C[u.members[0]?.home]?.east && !u.members[0].newcomer) st.grain = (st.grain ?? 0) + 0.35 * u.members.length; // 老村址的几户：坎上开了几块小地，口粮大半自己种
        for (const g in u.ask) { // 调价
          const sold = u.sold[g] ?? 0, left = st[g] ?? 0, base = GOODS[g].price;
          if (sold >= 2 && left <= 2) u.ask[g] = Math.min(base * 2, Math.ceil(u.ask[g] * 1.1));
          else if (sold === 0 && left >= 5) u.ask[g] = Math.max(this.floorOf(g, u), Math.floor(u.ask[g] * 0.9));
        }
      }
      u.sold = {};
      u.wants = this.wantsOf(u, day);
    }
    if (!first) { this.relief(day); this.newcomerDues(day); }
    for (const g in this.missing) { this.missing[g] *= 0.7; if (this.missing[g] < 0.05) delete this.missing[g]; } // 缺口慢慢淡忘
    if (!first) { this.caravan(day); this.tuition(day); this.repairsReady(day); }
    for (const u of this.units.values()) if ((u.stock.seed ?? 0) >= 1 && u.boost !== S && ['farmA', 'farmB', 'farmC'].includes(u.id)) { u.stock.seed -= 1; u.boost = S; } // 农户换上良种
    this.planCalls(day);
  }

  // ---------------------------------------------------------------- 上门的活（新来的人：泥瓦木工、挑水、照看、杀猪、文书传话）

  /** 凌晨排今天各家要叫人上门的活：calls[行当] = [{ unit, home, place, service, price, dur }]。没人干这一行的，记成缺口（选营生页标"正缺"）。 */
  planCalls(day) {
    const S = season(), have = new Set(this.V.people.map((v) => v.p.jobId).filter(Boolean));
    this.calls = {};
    const add = (job, u, service, price, dur) => {
      if (!have.has(job)) { this.missing[`job:${job}`] = (this.missing[`job:${job}`] ?? 0) + 0.3; return; }
      const home = u.members[0].sleepAt ?? u.members[0].home;
      (this.calls[job] ??= []).push({ job, unit: u, home, place: PLACES[home] ?? (EN ? `${pNick(u.members[0])}'s place` : `${u.members[0].nick}那儿`), service, price, dur });
    };
    for (const u of this.units.values()) {
      if (u.id === 'caravan' || !u.members.length) continue;
      const h = (tag) => hash(`${day}/${u.id}/call/${tag}`), rich = Math.min(1.5, Math.max(0, u.coins - 120) / 200);
      const old = u.members.every((p) => p.age >= 65 || p.body === 'child'), kids = u.members.some((p) => p.body === 'child');
      const farm = ['farmA', 'farmB', 'farmC'].includes(u.id), pigs = u.members.some((p) => /猪/.test((p.owns ?? []).join()));
      if (h('build') < (S === 'winter' ? 1 / 30 : 1 / 18)) add('builder', u, '修房盘炕', 8, 40);
      if (h('water') < (old ? 0.8 : 0.1 + rich * 0.3) * (S === 'summer' ? 1.3 : 1)) add('water', u, '送水', 2, 6);
      if (old && h('water2') < 0.5) add('water', u, '送水', 2, 6); // 老人家一天两担
      if ((old && h('care') < 0.6) || (kids && farm && (S === 'summer' || S === 'autumn') && h('care') < 0.25)) add('carer', u, '照看', 4, 45);
      if (pigs && h('pig') < (S === 'winter' ? 1 / 6 : 1 / 30)) add('butcher', u, '杀猪', 15, 30);
      if (h('notice') < 0.25 && u.id !== 'headman') add('clerk', u, '传话', 0, 5);
    }
  }

  /** 领一件今天的上门活（同一行当的几个人分着干）。 */
  nextCall(job) { return this.calls?.[job]?.shift() ?? null; }

  /** 上门的活干完了：主家给钱（钱不够、熟的先赊着）；杀猪的分到几斤肉拿去卖。 */
  serveCall(call, v) {
    const pu = this.unitOfV(v), job = this.jobs?.[call.job];
    if (job?.pork) { pu.stock.pork = (pu.stock.pork ?? 0) + job.pork; pu.ask.pork ??= GOODS.pork.price; pu.made.pork = (pu.made.pork ?? 0) + job.pork; }
    if (call.price > 0) this.charge(call.unit, v, call.price, call.service, this.V.byId[call.unit.members.find(adult)?.id]);
    else for (const p of call.unit.members) this.bump(v.p.id, p.id); // 文书传话：不收钱，混个脸熟
  }

  /** 主家 cu 给干活 / 卖东西的人 v 付钱（服务）：钱不够就赊着（熟人），再不行算了。 */
  charge(cu, v, price, service, buyerV = null) {
    const pu = this.unitOfV(v);
    if (!cu || !pu || cu === pu) return null;
    let kind = 'cash';
    if (cu.coins >= price) { cu.coins -= price; pu.coins += price; } else if (this.tie(v.p.id, cu.members[0].id) >= 2) { kind = 'credit'; pu.owe[cu.id] = (pu.owe[cu.id] ?? 0) + price; } else return null;
    for (const p of cu.members) this.bump(v.p.id, p.id);
    const t = { day: this.day, hour: this.V.hour(), buyer: buyerV?.p.id ?? cu.members[0].id, from: cu.id, seller: v.p.id, to: pu.id, good: null, service, qty: 1, price, kind };
    this.record(t);
    return t;
  }

  /** 修房子要的料：石灰、条石、柴（除了自家烧的）。 */
  static REPAIR = { lime: 4, stone: 2, wood: 3 }; // 一共三十来文：新来的人头几天就攒得齐

  /**
   * 住进老宅的新人：料备齐了，今天就请葛石头来帮着修（给 6 文帮工钱，手头没钱就算人情），料用掉；
   * 白天的活见 life/oldsite.js（两个人在院里干一天，傍晚房子换样子）。
   */
  repairsReady(day) {
    const V = this.V;
    V.repairs ??= [];
    for (const u of this.units.values()) for (const p of u.members) {
      if (!p.oldHouse || (V.east?.plotState(p.oldHouse) ?? 2) >= 2 || V.repairs.some((r) => r.plot === p.oldHouse && !r.done)) continue;
      const st = u.stock, R = Economy.REPAIR;
      if ((st.lime ?? 0) < R.lime || (st.stone ?? 0) < R.stone || (st.wood ?? 0) - this.keep(u, 'wood') < R.wood) continue;
      for (const [g, q] of Object.entries(R)) st[g] -= q;
      const mason = this.unit('mason'), wage = Math.min(6, u.coins);
      if (mason && wage > 0) { u.coins -= wage; mason.coins += wage; this.record({ day, hour: 6.6, buyer: p.id, from: u.id, seller: 'ge_shitou', to: 'mason', good: null, service: '帮工修房', qty: 1, price: wage, kind: 'cash' }); }
      V.repairs.push({ plot: p.oldHouse, owner: p.id, day, done: false });
    }
  }

  /** 最低卖到多少：外来货不亏本（进价 × 1.1），自家产的最低半价。 */
  floorOf(g, u) { return GOODS[g]?.outside && u && ['store', 'qian_xiaoer'].includes(u.id) ? Math.ceil(GOODS[g].price * 1.1) : Math.ceil((GOODS[g]?.price ?? 1) * 0.5); }

  /**
   * 接济：哪家粮食见底、手里又没钱，跟他家最熟、粮食有富余的那家送三天的口粮过去（人情，不记账，熟识度涨）。
   * 免得穷的越来越穷、一直断粮（矮人要塞的教训：钱别把人逼进死循环）。
   */
  relief(day) {
    for (const u of this.units.values()) {
      if (u.id === 'caravan') continue;
      const need = eatToday(u).grain * 3;
      if ((u.stock.grain ?? 0) >= eatToday(u).grain || u.coins >= need * GOODS.grain.price) continue;
      let best = null, bestTie = 0;
      for (const o of this.units.values()) {
        if (o === u || o.id === 'caravan' || (o.stock.grain ?? 0) - this.keep(o, 'grain') < need) continue;
        let tie = 0;
        for (const a of u.members) for (const b of o.members) tie = Math.max(tie, this.tie(a.id, b.id));
        if (tie >= bestTie) { bestTie = tie; best = o; }
      }
      if (!best) continue;
      const q = Math.ceil(need), giver = best.members.find(adult) ?? best.members[0], taker = u.members.find(adult) ?? u.members[0];
      best.stock.grain -= q; u.stock.grain = (u.stock.grain ?? 0) + q;
      for (const a of u.members) this.bump(a.id, giver.id, 2);
      this.record({ day, hour: 6, buyer: taker.id, from: u.id, seller: giver.id, to: best.id, good: 'grain', qty: q, price: 0, kind: 'gift', place: '接济' });
    }
  }

  /** 想买没买着（村里没人有富余 / 付不起）：记成缺口。新来的人按缺口挑行当。 */
  miss(g, n = 1) { this.missing[g] = (this.missing[g] ?? 0) + n; }

  /** 每月初一：学费（每个孩子 3 升粮食 + 20 文给李先生）；地租（杨家、吴家种着王家的地，每家交 25 升粮食 + 40 文，钱不够的拿粮食抵）。 */
  tuition(day) {
    if (lunarOf(day).d !== 1) return;
    const school = this.unit('school'), head = this.unit('headman');
    for (const id of ['farmB', 'farmC']) {
      const u = this.unit(id), coins = Math.min(40, Math.max(0, u.coins - 30)), q = 25 + Math.ceil((40 - coins) / GOODS.grain.price);
      u.coins -= coins; head.coins += coins;
      const g = Math.min(q, Math.max(0, Math.floor((u.stock.grain ?? 0) - this.keep(u, 'grain'))));
      if (g > 0) { u.stock.grain -= g; head.stock.grain = (head.stock.grain ?? 0) + g; }
      this.record({ day, hour: 8, buyer: u.members[0].id, from: u.id, seller: 'wang_deshan', to: 'headman', good: null, service: '地租', qty: 1, price: coins, kind: g > 0 ? 'barter' : 'cash', swap: g > 0 ? { good: 'grain', qty: g } : null });
    }
    for (const u of this.units.values()) {
      const kids = u.members.filter((p) => p.job === '学童').length;
      if (!kids || u === school) continue;
      const q = Math.min(3 * kids, Math.floor(u.stock.grain ?? 0)), coins = Math.min(20 * kids, Math.max(0, u.coins - 20)); // 每个孩子每月 3 升粮食 + 20 文（手头紧的少给点）
      if (q > 0) { u.stock.grain -= q; school.stock.grain = (school.stock.grain ?? 0) + q; }
      if (coins > 0) { u.coins -= coins; school.coins += coins; }
      if (q > 0 || coins > 0) this.record({ day, hour: 7.3, buyer: u.members.find((p) => p.job === '学童').id, from: u.id, seller: 'li_wenqing', to: 'school', good: null, service: '学费', qty: 1, price: coins, kind: q > 0 ? 'barter' : 'cash', swap: q > 0 ? { good: 'grain', qty: q } : null });
    }
  }

  /** 这户今天想买什么：低于目标六成的日用品，加上今天用坏的、生病要的药。 */
  wantsOf(u, day) {
    const w = [], st = u.stock, t = targetOf(u), h = (tag) => hash(`${day}/${u.id}/${tag}`);
    const rich = Math.min(1.5, Math.max(0, u.coins - 120) / 200); // 手头宽裕的程度：钱多了就舍得花（不然钱全淤在种地的人家）
    for (const [g, q] of Object.entries(t)) {
      if (g === 'tofu') { if (u.id !== 'tofu' && u.coins > 15 && h('tofu') < 0.3 + rich * 0.4) w.push({ good: 'tofu', qty: 1 + (h('tofu2') < 0.3 + rich * 0.3 ? 1 : 0) }); continue; }
      if ((st[g] ?? 0) < q * 0.6) w.push({ good: g, qty: Math.max(1, Math.ceil(q - (st[g] ?? 0))) });
    }
    const farm = ['farmA', 'farmB', 'farmC', 'tofu', 'carpenter'].includes(u.id);
    if (farm && h('tool') < 1 / 25 && season() !== 'winter') w.push({ good: 'tool', qty: 1, why: '锄头用坏了' });
    if (h('wooden') < 1 / 45) w.push({ good: 'wooden', qty: 1, why: '板凳、犁把子坏了' });
    if (h('basket') < 1 / 30) w.push({ good: 'basket', qty: 1, why: '筐漏了' });
    const tailor = [...this.units.values()].some((x) => x.made.clothes > 0 || (x.stock.clothes ?? 0) > 0);
    if (u.members.some((p) => h(`cloth/${p.id}`) < 1 / 60)) { // 衣裳穿破了：村里有裁缝就找他做，没有就扯布自己缝（"想找人做"记成缺口）
      if (tailor) w.push({ good: 'clothes', qty: 1, why: '衣裳穿破了' }); else { w.push({ good: 'cloth', qty: 4, why: '衣裳穿破了' }); this.miss('clothes'); }
    }
    const festive = ['market', 'opera', 'movie'].includes(this.V.today?.());
    if (!u.members[0]?.newcomer && h('bun') < (festive ? 0.45 : 0.08) + rich * 0.1) w.push({ good: 'bun', qty: 2, why: '赶集、看戏饿了想吃个烧饼' }); // 没人卖：记成缺口（卖吃食的空缺）
    if (h('mill') < 0.12 + rich * 0.1) w.push({ good: 'flour', qty: 3, why: '想吃白面' });
    for (const p of u.members) { // 新来的人干活要的原料：备够两天的
      const job = this.jobs?.[p.jobId];
      for (const [g, q] of Object.entries(job?.in ?? {})) { const need = Math.ceil(q * job.rate * 8) + this.keep(u, g); if ((st[g] ?? 0) < need) w.push({ good: g, qty: need - Math.floor(st[g] ?? 0) }); }
      for (const [g, q] of Object.entries(job?.fuel ?? {})) { const need = Math.ceil(q * job.rate * 6); if ((st[g] ?? 0) < need && [...this.units.values()].some((x) => x !== u && (x.stock[g] ?? 0) >= 1)) w.push({ good: g, qty: need - Math.floor(st[g] ?? 0), why: '烧炭引窑火' }); } // 村里有人挖煤才买
    }
    if (u.members.some((p) => h(`sick/${p.id}`) < 1 / 50)) w.push({ good: 'pill', qty: 2, why: '有人病了' });
    for (const p of u.members) if (p.oldHouse && (this.V.east?.plotState(p.oldHouse) ?? 2) < 2) { // 住进老宅的：攒修房子的料（排在清单最前头）
      for (const [g, q] of Object.entries(Economy.REPAIR)) { const need = q + (g === 'wood' ? this.keep(u, 'wood') : 0); if ((st[g] ?? 0) < need) w.unshift({ good: g, qty: Math.ceil(need - (st[g] ?? 0)), why: '修房子' }); }
    }
    if (h('duckEgg') < 0.05 + rich * 0.12) w.push({ good: 'duckEgg', qty: 4, why: '想吃咸鸭蛋' }); // 只有老村址凤仙嫂家有
    // 新来的人卖的东西：村里有人卖才想着买（没人卖的记成缺口，选营生页标"正缺"）
    const S = season(), festive2 = festive || this.V.holiday?.();
    const want = (g, p, qty, why) => { if (h(`n/${g}`) >= p) return; if ([...this.units.values()].some((x) => x !== u && (x.stock[g] ?? 0) >= 1)) w.push({ good: g, qty, why }); else this.miss(g, 0.3); };
    want('fish', 0.04 + rich * 0.1 + (festive2 ? 0.2 : 0), 1, '想吃条鱼');
    want('pork', 0.04 + rich * 0.12 + (festive2 ? 0.25 : 0) + (S === 'winter' ? 0.05 : 0), 2, '割二斤肉');
    want('wildfood', (S === 'spring' || S === 'autumn' ? 0.07 : 0.03) + rich * 0.04, 2, S === 'spring' ? '尝个鲜野菜' : '买点核桃蘑菇');
    want('game', 0.05 + rich * 0.08 + (festive2 ? 0.1 : 0) + (S === 'winter' ? 0.04 : 0), 1, '买只野味');
    want('charcoal', (S === 'winter' ? 0.16 : S === 'autumn' ? 0.1 : 0.06) + rich * 0.08, 3, S === 'winter' || S === 'autumn' ? '烤火（炭没烟）' : '烧水、熨衣裳');
    want('coal', (S === 'winter' ? 0.2 : S === 'autumn' ? 0.08 : 0.03) + rich * 0.06, 6, '烧炕、烤火');
    if (['farmA', 'farmB', 'farmC'].includes(u.id) && u.boost !== S && (st.seed ?? 0) < 1 && S !== 'winter') want('seed', 0.15, 1, '换新谷种');
    if (u.id === 'smith' && (st.iron ?? 0) < 4) w.push({ good: 'iron', qty: 6 });
    if (u.id === 'tofu' && (st.soy ?? 0) < 10) w.push({ good: 'soy', qty: 12 });
    if (u.id === 'doctor' && (st.honey ?? 0) < 2) w.push({ good: 'honey', qty: 3 });
    // 手头宽裕了添置点东西：蒸白面馍、买鸡蛋蜂蜜、添件家具、扯布做新衣裳
    if (h('flour') < rich * 0.3) w.push({ good: 'flour', qty: 2, why: '蒸白面馍' });
    if (h('egg') < 0.08 + rich * 0.25) w.push({ good: 'egg', qty: 3 });
    if (h('honey') < rich * 0.08) w.push({ good: 'honey', qty: 1 });
    if (h('furniture') < rich * 0.06) w.push({ good: 'wooden', qty: 1, why: '添置家具' });
    if (h('newcloth') < rich * 0.12 + (tailor ? 0.03 : 0)) w.push(tailor ? { good: 'clothes', qty: 1, why: '做身新衣裳' } : { good: 'cloth', qty: 6, why: '扯布做新衣裳' }); // 村里有裁缝了：直接找他做
    // 手艺活：农具钝了找铁匠修，家什松了找木匠修（按次给钱）
    if (farm && season() !== 'winter' && h('fix') < 1 / 4) w.push({ service: '修农具', to: 'smith', price: 6 });
    if (h('fixwood') < 1 / 8) w.push({ service: '修家什', to: 'carpenter', price: 5 });
    // 老村址的手艺：磨盘磨平了找葛石头来錾；盘炕、刷墙要石灰；砌猪圈、垒灶台要条石
    if ((u.id === 'tofu' || u.members.some((p) => p.jobId === 'miller')) && h('dress') < 1 / 20) w.push({ service: '錾磨盘', to: 'mason', price: 12 });
    if (h('lime') < 1 / 30 + rich * 0.03) w.push({ good: 'lime', qty: 4, why: '盘炕、刷墙' });
    if (farm && h('stone') < 1 / 50) w.push({ good: 'stone', qty: 2, why: '修猪圈、垒灶台' });
    const seen = new Map(); // 同一样东西想买两回：合成一回
    for (const x of w) { const k = x.good ?? x.service; if (seen.has(k)) seen.get(k).qty = Math.max(seen.get(k).qty ?? 1, x.qty ?? 1); else seen.set(k, x); }
    return [...seen.values()].filter((x) => x.service ? x.to !== u.id : !this.sellsItself(u, x.good));
  }

  /** 自己家就产这个（豆腐坊不买豆腐、种菜的不买菜）：不去买。 */
  sellsItself(u, g) { if (u.members.some((p) => this.jobs?.[p.jobId]?.makes === g)) return true; return MAKE.some((r) => r.good === g && ((r.unit && [].concat(r.unit).includes(u.id)) || (r.who && u.members.some((p) => [].concat(r.who).includes(p.id))))) && (u.stock[g] ?? 0) > 0; }

  /** 卖家：有富余的户（自家存够了还多出来的），杂货铺和货郎卖村外的货。返回按买家心里的分数排好的 [户]。 */
  sellersFor(buyer, good, qty, who) {
    const list = [];
    for (const u of this.units.values()) {
      if (u === buyer || u.id === 'caravan') continue;
      const keep = this.keep(u, good), spare = (u.stock[good] ?? 0) - keep;
      if (spare < Math.min(qty, 1)) continue;
      const price = u.ask[good] ?? GOODS[good].price;
      const seller = u.members.find(adult) ?? u.members[0];
      const near = this.V.C[u.members[0].home] ?? this.V.C.square, home = this.V.C[buyer.members[0].home];
      const dist = near && home ? Math.hypot(near.object.position.x - home.object.position.x, near.object.position.z - home.object.position.z) : 20;
      const taste = hash(`${buyer.id}/${u.id}/taste`) - 0.5;
      const score = -price - dist * 0.05 + this.tie(who.p.id, seller.id) * price * 0.04 + taste * price * 0.24;
      list.push({ u, score });
    }
    return list.sort((a, b) => b.score - a.score).map((x) => x.u);
  }

  /** 这户自己要留多少（吃用的目标，卖家不卖掉）。 */
  keep(u, g) { const t = targetOf(u); return Math.ceil((t[g] ?? 0) * (g === 'grain' ? 1.5 : 1)); }

  // ---------------------------------------------------------------- 成交

  /**
   * 买家 v（代表他家）向 seller 户买 good × qty。按 铜钱 → 以物易物 → 赊账 的顺序试；返回这一笔（失败 null）。
   * 当面成交时调（trade.js 的差事走到跟前了）。
   */
  settle(v, seller, good, qty, { place = '' } = {}) {
    const buyer = this.unitOfV(v);
    const spare = Math.floor((seller.stock[good] ?? 0) - this.keep(seller, good) + 1e-9);
    qty = Math.min(qty, spare);
    if (qty <= 0) { this.fail(v, good, '卖家没有富余'); return null; }
    const unitPrice = seller.ask[good] ?? GOODS[good].price;
    if (buyer.coins < unitPrice * qty && buyer.coins >= unitPrice) qty = Math.floor(buyer.coins / unitPrice); // 钱不够全买：先买得起的那些
    const price = unitPrice * qty;
    const sp = seller.members.find(adult) ?? seller.members[0];
    let kind = null, swap = null;
    if (buyer.coins >= price && unitPrice <= GOODS[good].price * 2) kind = 'cash';
    else {
      swap = this.barterFor(buyer, seller, price);
      if (swap) kind = 'barter';
      else if (this.tie(v.p.id, sp.id) >= 4 && (seller.owe[buyer.id] ?? 0) + price <= 40) kind = 'credit';
      else if (v.p.newcomer && (this.jobs?.[v.p.jobId]?.in?.[good] || this.jobs?.[v.p.jobId]?.fuel?.[good] || (v.p.oldHouse && Economy.REPAIR[good])) && (seller.owe[buyer.id] ?? 0) + price <= 60) kind = 'credit'; // 新来的人开张：干活的原料、修老宅的料先赊着，挣了再还（赶集日结）
    }
    if (!kind) { this.fail(v, good, `钱不够（${buyer.coins}文，要${price}文），没东西可换，也赊不着`); return null; }
    if (kind === 'cash') { buyer.coins -= price; seller.coins += price; }
    if (kind === 'barter') { buyer.stock[swap.good] -= swap.qty; seller.stock[swap.good] = (seller.stock[swap.good] ?? 0) + swap.qty; }
    if (kind === 'credit') seller.owe[buyer.id] = (seller.owe[buyer.id] ?? 0) + price;
    seller.stock[good] -= qty;
    buyer.stock[good] = (buyer.stock[good] ?? 0) + qty;
    seller.sold[good] = (seller.sold[good] ?? 0) + qty;
    buyer.wants = buyer.wants.filter((w) => w.good !== good);
    this.bump(v.p.id, sp.id);
    const t = { day: this.day, hour: this.V.hour(), buyer: v.p.id, from: buyer.id, seller: sp.id, to: seller.id, good, qty, price, kind, swap, place };
    this.record(t);
    return t;
  }

  /** 买不成的记一笔原因（自检看：谁老买不着、为什么）。 */
  fail(v, good, why) { this.fails.push(`${this.day}d ${v.p.id} ${GOODS[good]?.name ?? good}：${why}`); if (this.fails.length > 40) this.fails.shift(); }

  /** 以物易物：买家家里有卖家缺的（或者能卖得出去的）东西，按底价折够 price。 */
  barterFor(buyer, seller, price) {
    const sellerWants = new Set(seller.wants.map((w) => w.good));
    const goods = Object.keys(buyer.stock).filter((g) => g !== 'tofu' && (buyer.stock[g] ?? 0) - this.keep(buyer, g) > 0)
      .sort((a, b) => (sellerWants.has(b) ? 1 : 0) - (sellerWants.has(a) ? 1 : 0) || GOODS[b].price - GOODS[a].price);
    for (const g of goods) {
      const q = Math.ceil(price / GOODS[g].price);
      if ((buyer.stock[g] ?? 0) - this.keep(buyer, g) >= q && (sellerWants.has(g) || ['grain', 'egg', 'flour'].includes(g))) return { good: g, qty: q };
    }
    return null;
  }

  record(t) {
    if (t.price > 0 && t.kind !== 'gift') { const u = this.unit(t.to); if (u) u.earned = (u.earned ?? 0) + t.price; } // 开张以来挣了多少（新人改行参考）
    this.trades.push(t);
    if (this.trades.length > 400) this.trades.shift();
    for (const id of [t.from, t.to]) { const u = this.unit(id); u.log.push(t); if (u.log.length > 30) u.log.shift(); }
    this.V.onTrade?.(t);
  }

  /** 剃头、看病这类手艺活：直接付钱（钱不够就赊着）。 */
  pay(v, toUnitId, coins, what) {
    const from = this.unitOfV(v), to = this.unit(toUnitId);
    if (!from || !to || from === to) return;
    const sp = to.members.find(adult) ?? to.members[0];
    let kind = 'cash';
    if (from.coins >= coins) { from.coins -= coins; to.coins += coins; } else { kind = 'credit'; to.owe[from.id] = (to.owe[from.id] ?? 0) + coins; }
    this.bump(v.p.id, sp.id);
    this.record({ day: this.day, hour: this.V.hour(), buyer: v.p.id, from: from.id, seller: sp.id, to: to.id, good: null, service: what, qty: 1, price: coins, kind });
  }

  /**
   * 骡帮（逢集日）：杂货铺补盐、火柴、布、铁料（钱出村）；各户把山货卖给骡帮（钱进村）；赊的账在集上结清。
   * 现在先在凌晨按"今天逢集"一次结好，画面上骡帮照旧进村歇脚（M2 改成看得见：伙计搬货、各家送山货）。
   */
  caravan(day) {
    if (this.V.today() !== 'market' || this.V.weather() === 'rain') return;
    const store = this.unit('store'), out = (u, g, q) => { const cost = q * GOODS[g].price; u.coins -= cost; this.flow.out += cost; u.stock[g] = (u.stock[g] ?? 0) + q; this.record({ day, hour: 9, buyer: u.members[0].id, from: u.id, seller: 'niu_wanshan', to: 'caravan', good: g, qty: q, price: cost, kind: 'cash', place: '骡帮' }); };
    for (const [g, want] of Object.entries({ salt: 20, match: 30, cloth: 50, iron: 12 })) {
      const q = Math.floor(Math.min(want - (store.stock[g] ?? 0), Math.max(0, store.coins - 60) * 0.6 / GOODS[g].price)); // 进货留 60 文过日子
      if (q > 0) out(store, g, q);
    }
    const pd = this.unit('qian_xiaoer');
    if (pd && (pd.stock.cloth ?? 0) < 15 && pd.coins > 60) out(pd, 'cloth', 10);
    const smith = this.unit('smith'), fee = 3 * 6; // 骡帮的三头骡子在铁匠铺钉马掌（村外的钱，给手艺人的）
    if (smith) { smith.coins += fee; this.flow.in += fee; this.record({ day, hour: 8.8, buyer: 'niu_wanshan', from: 'caravan', seller: 'zhang_tiechui', to: 'smith', good: null, service: '钉马掌', qty: 3, price: fee, kind: 'cash', place: '骡帮' }); }
    let brokered = 0;
    for (const u of this.units.values()) { // 山货卖给骡帮
      if (u.id === 'caravan') continue;
      for (const g of Object.keys(u.stock)) {
        if (!GOODS[g].export) continue;
        const q = Math.floor((u.stock[g] ?? 0) - this.keep(u, g) - (g === 'honey' ? 4 : 0));
        if (q <= 0) continue;
        const gain = q * GOODS[g].price;
        u.stock[g] -= q; u.coins += gain; this.flow.in += gain; brokered += gain;
        this.record({ day, hour: 9.5, buyer: 'niu_wanshan', from: 'caravan', seller: u.members.find(adult)?.id ?? u.members[0].id, to: u.id, good: g, qty: q, price: gain, kind: 'cash', place: '骡帮' });
      }
    }
    const cut = Math.floor(brokered * 0.1); // 杂货铺给骡帮牵线、存货：骡帮多给一成（村外的钱）
    if (cut > 0) { store.coins += cut; this.flow.in += cut; this.record({ day, hour: 10, buyer: 'niu_wanshan', from: 'caravan', seller: 'sun_youcai', to: 'store', good: null, service: '牵线', qty: 1, price: cut, kind: 'cash', place: '骡帮' }); }
    for (const u of this.units.values()) for (const [id, debt] of Object.entries(u.owe)) { // 赶集日结账：还得起的还上
      const d = this.unit(id);
      const pay = Math.min(debt, Math.max(0, d.coins - 10));
      if (pay > 0) { d.coins -= pay; u.coins += pay; u.owe[id] -= pay; }
      if (u.owe[id] <= 0) delete u.owe[id];
    }
  }

  /** 自检：铜钱守恒（村里总数 = 开局 + 进村 − 出村）。 */
  audit() { return { total: this.total(), expect: this.total0 + this.flow.in - this.flow.out, in: this.flow.in, out: this.flow.out }; }
}
