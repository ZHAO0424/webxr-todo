import { season } from './season.js';

// 活动的中文名（卡片"此刻"、一天的安排、档案页用）。键是 residents.js 日程里的活动名，"活动:参数" 是带参数时的补充说明。
// 写法：简短的动宾短语，像游戏里的状态栏，不用口语。"活动@季节" 是那个季节的叫法（比如夏天的打场叫打麦）。
const NAMES = {
  home: '回屋休息', cook: '灶房做饭', work: '劳作', fetchWater: '井边挑水', feedChickens: '喂鸡', feedPigs: '喂猪',
  feedRabbits: '喂兔', yardWork: '洒扫庭院', shopping: '杂货铺采买', visit: '登门拜访', patrol: '巡视村子', chess: '槐树下对弈',
  dinner: '门口用饭', evening: '晚间闲游',
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
  'field:fieldW': '西坡', 'field:fieldSoy': '豆子地', 'field:fieldE': '东坡', 'field:fieldWest': '西沟梯田', 'thresh:help': '帮忙扫场', 'chore:yardWork': '洒扫庭院', 'chore:fetchWater': '挑水',
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
};
/** 按当前季节取名字：先找 "键@季节"，没有就用 "键"。 */
export const LABELS = new Proxy(NAMES, { get: (o, k) => (typeof k === 'string' ? o[`${k}@${season()}`] ?? o[k] : o[k]) });

/** 各个院子 / 地方的叫法（卡片上显示"在哪儿"）。 */
export const PLACES = { headman: '王家', school: '学堂', shepherd: '马家羊圈', farmA: '陈家', farmB: '杨家', farmC: '吴家', carpenter: '刘家木匠铺', store: '孙家杂货铺', doctor: '周家药铺', smith: '张家铁匠铺', tofu: '赵家豆腐坊', square: '村口', threshing: '场院' };
