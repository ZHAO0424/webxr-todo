import { season } from './season.js';
import { EN } from './i18n.js';

// 活动的中文名（卡片"此刻"、一天的安排、档案页用）。键是 residents.js 日程里的活动名，"活动:参数" 是带参数时的补充说明。
// 写法：简短的动宾短语，像游戏里的状态栏，不用口语。"活动@季节" 是那个季节的叫法（比如夏天的打场叫打麦）。
const NAMES = {
  home: '回屋休息', cook: '灶房做饭', work: '劳作', fetchWater: '井边挑水', feedChickens: '喂鸡', feedPigs: '喂猪',
  feedRabbits: '喂兔', yardWork: '洒扫庭院', shopping: '杂货铺采买', visit: '登门拜访', patrol: '巡视村子', chess: '槐树下对弈',
  dinner: '门口用饭', evening: '晚间闲游', packedLunch: '吃带的干粮',
  chat: '槐树下闲谈', barber: '照看剃头挑子', haircut: '剃头',
  market: '赶集', 'market:tofu': '集上卖豆腐', 'market:goods': '集上摆杂货摊', 'market:veg': '集上卖菜',
  harvest: '场院打场', 'harvest:ox': '赶牛碾场', movie: '观看露天电影', 'movie:projectionist': '放映电影',
  shrine: '土地庙上香', 'shrine:leader': '主持祭土地',
  opera: '戏台前看戏', 'opera:singer': '登台唱梆子', 'opera:fiddler': '台上拉板胡',
  bonfire: '围火夜话', 'bonfire:storyteller': '火堆旁讲古', meeting: '参加村会', 'meeting:speaker': '主持村会', 'meeting:clerk': '记录村会', school: '学堂念书', teach: '授课', read: '读书',
  play: '和伙伴嬉戏', chore: '帮家里做事', field: '下地', haul: '挑谷子回家', thresh: '场院碾场', oxHome: '牵牛回家',
  herd: '赶羊上崖顶', herdHome: '赶羊回圈', grind: '赶驴磨豆', boil: '煮浆点豆腐', sellTofu: '村口卖豆腐',
  tendBees: '照料蜂箱', peddle: '摇鼓沿村叫卖', peddlerChat: '向货郎打听外面的事', deliver: '送货上门',
  gatherDucks: '溪边收鸭', sitGate: '门前小坐', garden: '照料菜园', lightTorches: '点亮路口火把', putOutTorches: '熄灭路口火把', nightWatch: '提灯打更', idle: '休息',
  laundry: '溪边洗衣', firewood: '进西沟砍柴', visitFriend: '探望老友', mill: '去水磨坊磨面', worship: '去山神庙上香', caravan: '赶着骡子进村赶集', caravanHome: '赶着骡子回山外',
  'work:bellows': '拉风箱', 'work:stove': '看守灶火', 'work:sweep': '清扫街道', 'work:work': '照看驴拉磨',
  'visit:tofu': '去豆腐坊', 'visit:doctor': '去药铺', 'visit:farmA': '去陈家出诊', 'deliver:headman': '送往村长家',
  'fish': '溪边钓鱼', 'fish:pool': '去西沟水潭钓鱼', 'field:fieldW': '西坡', 'field:fieldSoy': '豆子地', 'field:fieldE': '东坡', 'field:fieldWest': '西沟梯田', 'thresh:help': '帮忙扫场', 'chore:yardWork': '洒扫庭院', 'chore:fetchWater': '挑水',
  'chore:feedChickens': '喂鸡', 'chore:feedRabbits': '喂兔', 'chore:work': '照看驴拉磨',
  // 四季的农活（life/variety.js 的 seasonal）
  sow: '下地点种', plowHoe: '春耕翻地', weed: '锄地除草', reapWheat: '下地割麦', carrySheaves: '背麦个子上场',
  reap: '割谷子', pickCorn: '掰玉米', haulManure: '往地里挑粪', sweepSnow: '扫雪', gatherDung: '沿路拾粪',
  'harvest@summer': '场院打麦', 'harvest:ox@summer': '赶牛碾麦', 'thresh@summer': '场院碾麦', 'haul@spring': '往地里挑粪',
  'play@winter': '雪地里玩', 'sitGate@winter': '墙根晒太阳', 'chat@summer': '槐树下乘凉', 'evening@summer': '纳凉闲游',
  'firewood@winter': '进山拾柴', 'cook@winter': '烧炕做饭',
  // 日程表（卡片里"今日安排"）上写的还是秋天的活名，换季后显示成当季的
  'field@spring': '下地春耕', 'field@summer': '下地割麦锄草', 'haul@summer': '背麦个子上场',
  'field@winter': '扫雪 / 拾柴', 'haul@winter': '扫雪 / 拾柴', 'garden@winter': '扫雪 / 拾柴', 'mill@winter': '扫雪 / 拾柴', 'tendBees@winter': '扫雪 / 拾柴',
  'laundry@winter': '扫雪 / 拾柴', 'thresh@winter': '扫雪 / 拾柴', 'oxHome@winter': '扫雪 / 拾柴', 'dinner@winter': '屋里炕上吃饭',
  'thresh@spring': '春耕翻地', 'oxHome@spring': '洒扫庭院',
  // 四季的节日（life/events.js）
  chunjie: '串门拜年',
  // 老村址的几户（life/oldsite.js）
  riverIncense: '给河神上香', watchWater: '水则碑前看水', driftwood: '河滩上捞漂木', tendDucks: '河滩上放鸭',
  'driftwood@winter': '河滩上拾冰凌里的漂木', 'tendDucks@winter': '鸭棚里喂鸭',
  moveBenches: '搬条凳', 'market:benches': '搬条凳腾地方',
  qingming: '上坟踏青', duanwu: '包粽子', 'duanwu:host': '张罗包粽子', zhongqiu: '赏月', 'zhongqiu:leader': '主持拜月',
};
/** 英文界面的活动名（键和 NAMES 一样；缺的退回中文）。 */
const NAMES_EN = {
  home: 'Resting at home', cook: 'Cooking in the kitchen', work: 'At work', fetchWater: 'Fetching water at the well', feedChickens: 'Feeding the chickens', feedPigs: 'Feeding the pigs',
  feedRabbits: 'Feeding the rabbits', yardWork: 'Sweeping the yard', shopping: 'Shopping at the store', visit: 'Paying a visit', patrol: 'Walking the village', chess: 'Chess under the locust tree',
  dinner: 'Supper by the door', evening: 'Evening stroll', packedLunch: 'Packed lunch',
  chat: 'Chatting under the locust', barber: 'Minding the barber stall', haircut: 'Getting a haircut',
  market: 'At the market', 'market:tofu': 'Selling tofu at market', 'market:goods': 'Running a market stall', 'market:veg': 'Selling veg at market',
  harvest: 'Threshing grain', 'harvest:ox': 'Driving the ox roller', movie: 'Watching the open-air film', 'movie:projectionist': 'Running the projector',
  shrine: 'Incense at the Earth God Shrine', 'shrine:leader': 'Leading the Earth God rite',
  opera: 'Watching the opera', 'opera:singer': 'Singing bangzi opera', 'opera:fiddler': 'Playing the banhu fiddle',
  bonfire: 'Night talk by the fire', 'bonfire:storyteller': 'Telling old tales by the fire', meeting: 'At the village meeting', 'meeting:speaker': 'Chairing the meeting', 'meeting:clerk': 'Taking meeting notes', school: 'Studying at school', teach: 'Teaching class', read: 'Reading',
  play: 'Playing with friends', chore: 'Helping at home', field: 'Out in the fields', haul: 'Carrying millet home', thresh: 'Rolling the threshing floor', oxHome: 'Leading the ox home',
  herd: 'Herding sheep up the cliff', herdHome: 'Herding sheep home', grind: 'Grinding beans with donkey', boil: 'Boiling soy milk for tofu', sellTofu: 'Selling tofu at the square',
  tendBees: 'Tending the beehives', peddle: 'Hawking with a rattle drum', peddlerChat: 'Asking the peddler for news', deliver: 'Making a delivery',
  gatherDucks: 'Rounding up the ducks', sitGate: 'Sitting by the gate', garden: 'Tending the vegetable plot', lightTorches: 'Lighting the torches', putOutTorches: 'Putting out the torches', nightWatch: 'Night watch with a lantern', idle: 'Resting',
  laundry: 'Washing by the stream', firewood: 'Cutting wood in West Gully', visitFriend: 'Visiting an old friend', mill: 'Milling at the watermill', worship: 'Incense at the Mountain Shrine', caravan: 'Bringing mules to market', caravanHome: 'Taking mules back home',
  'work:bellows': 'Working the bellows', 'work:stove': 'Minding the stove fire', 'work:sweep': 'Sweeping the street', 'work:work': 'Minding the donkey mill',
  'visit:tofu': 'Going to the tofu shop', 'visit:doctor': 'Going to the pharmacy', 'visit:farmA': 'House call at the Chens\'', 'deliver:headman': 'Delivering to the Wangs\'',
  'fish': 'Fishing by the stream', 'fish:pool': 'Fishing at the West Gully pool', 'field:fieldW': 'West slope', 'field:fieldSoy': 'Soybean field', 'field:fieldE': 'East slope', 'field:fieldWest': 'West Gully terraces', 'thresh:help': 'Helping sweep the threshing floor', 'chore:yardWork': 'Sweeping the yard', 'chore:fetchWater': 'Fetching water',
  'chore:feedChickens': 'Feeding the chickens', 'chore:feedRabbits': 'Feeding the rabbits', 'chore:work': 'Minding the donkey mill',
  sow: 'Sowing seeds', plowHoe: 'Spring ploughing', weed: 'Hoeing weeds', reapWheat: 'Reaping wheat', carrySheaves: 'Carrying sheaves in',
  reap: 'Cutting millet', pickCorn: 'Picking corn', haulManure: 'Hauling manure to the field', sweepSnow: 'Sweeping snow', gatherDung: 'Collecting dung on the road',
  'harvest@summer': 'Threshing wheat', 'harvest:ox@summer': 'Driving the ox over wheat', 'thresh@summer': 'Rolling the wheat', 'haul@spring': 'Hauling manure to the field',
  'play@winter': 'Playing in the snow', 'sitGate@winter': 'Sunning by the wall', 'chat@summer': 'Cooling off under the locust', 'evening@summer': 'Strolling in the cool',
  'firewood@winter': 'Gathering firewood', 'cook@winter': 'Heating the kang, cooking',
  'field@spring': 'Spring work in the fields', 'field@summer': 'Reaping and hoeing', 'haul@summer': 'Carrying sheaves in',
  'field@winter': 'Snow / firewood', 'haul@winter': 'Snow / firewood', 'garden@winter': 'Snow / firewood', 'mill@winter': 'Snow / firewood', 'tendBees@winter': 'Snow / firewood',
  'laundry@winter': 'Snow / firewood', 'thresh@winter': 'Snow / firewood', 'oxHome@winter': 'Snow / firewood', 'dinner@winter': 'Supper on the kang',
  'thresh@spring': 'Spring ploughing', 'oxHome@spring': 'Sweeping the yard',
  chunjie: 'New Year visits',
  riverIncense: 'Incense to the River God', watchWater: 'Reading the flood stele', driftwood: 'Fishing out driftwood', tendDucks: 'Herding ducks on the bank',
  'driftwood@winter': 'Prying driftwood from ice', 'tendDucks@winter': 'Feeding ducks in the shed',
  moveBenches: 'Moving benches', 'market:benches': 'Clearing benches for market',
  qingming: 'Graves and a spring walk', duanwu: 'Wrapping zongzi', 'duanwu:host': 'Organising the zongzi', zhongqiu: 'Admiring the moon', 'zhongqiu:leader': 'Leading the moon rite',
};
/** 按当前季节取名字：先找 "键@季节"，没有就用 "键"（英文界面先查英文）。 */
export const LABELS = new Proxy(NAMES, { get: (o, k) => (typeof k !== 'string' ? o[k] : (EN && (NAMES_EN[`${k}@${season()}`] ?? NAMES_EN[k])) || (o[`${k}@${season()}`] ?? o[k])) });

/** 各个院子 / 地方的叫法（卡片上显示"在哪儿"）。 */
const PLACES_ZH = { headman: '王家', school: '学堂', shepherd: '马家羊圈', farmA: '陈家', farmB: '杨家', farmC: '吴家', carpenter: '刘家木匠铺', store: '孙家杂货铺', doctor: '周家药铺', smith: '张家铁匠铺', tofu: '赵家豆腐坊', square: '村口', threshing: '场院', riverTemple: '河神庙', mason: '葛家石匠院', limeKiln: '白家石灰窑', duckYard: '苗家鸭棚' };
const PLACES_EN = { headman: "The Wangs'", school: 'School', shepherd: "Ma's Sheepfold", farmA: "The Chens'", farmB: "The Yangs'", farmC: "The Wus'", carpenter: "Liu's Carpentry", store: "Sun's Store", doctor: "Zhou's Pharmacy", smith: "Zhang's Smithy", tofu: "Zhao's Tofu Shop", square: 'Village Square', threshing: 'Threshing floor', riverTemple: 'River God Temple', mason: "Ge's Mason Yard", limeKiln: "Bai's Lime Kiln", duckYard: "Miao's Duck Shed" };
export const PLACES = new Proxy(PLACES_ZH, { get: (o, k) => (EN && PLACES_EN[k]) || o[k] });
