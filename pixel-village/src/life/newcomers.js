import { ACTIVITIES } from './activities.js';
import { hash } from './events.js';
import { GOODS, reasonText } from './economy.js';
import { Villager } from './villager.js';
import { season } from '../season.js';
import { EN } from '../i18n.js';
import { word, registerNewcomerNames } from '../names.js';

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
    desc: '跟着陈家、杨家、吴家下地：锄地、割麦、掰玉米、挑谷子', where: '三家的地里（村里、西沟梯田）', buyers: '最宽裕的那户农家按天给工钱，农忙给得多', setup: '一把锄头',
    en: { name: 'Farmhand', desc: 'Works the fields with the Chens, the Yangs and the Wus: hoeing, cutting wheat, picking corn, carrying millet.', where: 'The three families\' fields (in the village and the West Gully terraces)', buyers: 'The best-off farming family pays by the day, more at harvest time', setup: 'A hoe' } },
  { id: 'fisher', name: '钓鱼', cat: '地里河里', kind: 'make', makes: 'fish', rate: 1.2, max: 16, place: 'beach', item: 'rod', anim: 'sit', season: S4(1, 1.2, 1, 0.5),
    keys: ['钓鱼', '打鱼', '水性', '撒网', '耐性'], est: 6,
    desc: '坐在老村址的河心洲、深水湾下竿，钓上来的鱼挎到村里卖', where: '老村址河滩', buyers: '手头宽裕的人家；过年人人要一条（年年有余）', setup: '一根钓竿',
    en: { name: 'Fisher', desc: 'Sits on the river islet and the deep bend at the Old Site with a line out, then carries the catch into the village to sell.', where: 'The riverbank at the Old Site', buyers: 'Families with money to spare; at New Year everyone wants one (a fish for plenty every year)', setup: 'A fishing rod' } },
  { id: 'gardener', name: '种菜', cat: '地里河里', kind: 'make', makes: 'veg', rate: 4, place: 'yard', item: 'can', anim: 'work', season: S4(1, 1.2, 1, 0.3),
    keys: ['种菜', '种地', '菜', '浇', '庄稼'], est: 7, tool: '锄头、水瓢',
    desc: '在住处边上开块菜地，锄地、浇水，青菜卖给村里', where: '自家院边的菜地', buyers: '村里青菜老是不够吃，补这个缺口', setup: '锄头、菜籽',
    en: { name: 'Gardener', desc: 'Clears a vegetable patch beside their lodgings, hoes and waters it, and sells the greens in the village.', where: 'A vegetable patch by the yard', buyers: 'The village is always short of greens; this fills the gap', setup: 'A hoe and vegetable seed' } },
  { id: 'miller', name: '磨面', cat: '地里河里', kind: 'make', vacancy: true, makes: 'flour', rate: 3, in: { grain: 1 }, place: 'mill', item: 'basket', icon: 'flourSack', anim: 'work', season: S4(1, 1, 1, 1),
    keys: ['磨', '面', '推磨', '碾', '粮'], est: 10, note: '西沟水磨坊没人看着，各家只能自己背粮食去磨',
    desc: '看着西沟的水磨坊，把粮食磨成白面卖', where: '西沟水磨坊', buyers: '想吃白面的人家、卖烧饼的', setup: '不用置办（粮食向三家农户买）',
    en: { name: 'Miller', desc: 'Minds the watermill in the West Gully and grinds grain into flour to sell.', where: 'The watermill in the West Gully', buyers: 'Families who want white flour, and the flatbread seller', setup: 'Nothing to buy (grain comes from the three farming families)', note: 'Nobody minds the West Gully watermill, so every family has to haul its own grain there' } },
  // ---- 手艺、买卖
  { id: 'builder', name: '泥瓦木工', cat: '手艺买卖', kind: 'rounds', service: '修房盘炕', price: 8, place: 'rounds', item: 'trowel', anim: 'work', season: S4(1, 1, 1, 0.7),
    keys: ['木工', '泥瓦', '盖房', '修房', '砌墙', '盘炕', '力气'], est: 9,
    desc: '扛着家伙上门：盘炕、补墙、苫房顶、修门窗；老村址的人修老宅也请他帮工', where: '谁家叫就去谁家', buyers: '各家二十来天有一回小修', setup: '泥抹子、锤子（刘木匠做家具车轮，他盖房修房，不抢生意）',
    en: { name: 'Builder', desc: 'Goes from house to house with their tools: building kangs, patching walls, re-thatching roofs, fixing doors and windows. Old Site settlers hire them to help rebuild their old houses too.', where: 'Wherever they are called', buyers: 'Each family needs a small repair every twenty days or so', setup: 'A trowel and a hammer (Carpenter Liu makes furniture and cartwheels; the builder builds and mends houses, so there\'s no competing)' } },
  { id: 'tailor', name: '裁缝', cat: '手艺买卖', kind: 'make', vacancy: true, makes: 'clothes', rate: 0.35, in: { cloth: 4 }, place: 'gate', item: 'shears', anim: 'sit', season: S4(1, 1, 1, 1),
    keys: ['裁缝', '针线', '缝', '衣', '绣'], est: 8, note: '布是骡帮、货郎卖的，买回来没人会做',
    desc: '坐在自家门口做衣裳', where: '自家门口', buyers: '衣裳穿破了的人', setup: '针线、剪子（布向杂货铺、货郎买）',
    en: { name: 'Tailor', desc: 'Sits at their own front door making clothes.', where: 'Their own front door', buyers: 'Anyone whose clothes are worn through', setup: 'Needle, thread and shears (cloth comes from the store and the peddler)', note: 'The caravan and the peddler sell cloth, but nobody can sew it into clothes' } },
  { id: 'snack', name: '卖吃食', cat: '手艺买卖', kind: 'make', vacancy: true, makes: 'bun', rate: 6, in: { flour: 0.1, wood: 0.05 }, place: 'square', item: 'tray', icon: 'bread', anim: 'work', season: S4(1, 1, 1, 1),
    keys: ['做饭', '面食', '烙', '饼', '馍', '厨', '吃'], est: 6, note: '赶集、看戏的时候，村口没有卖吃的',
    desc: '在村口支个炉子烙烧饼', where: '村口', buyers: '赶集、看戏、闲逛的人', setup: '一个炉子（白面向磨面的买）',
    en: { name: 'Snack stall', desc: 'Sets up a little stove at the Village Square and bakes flatbreads.', where: 'The Village Square', buyers: 'People at the market, at the opera, or out for a stroll', setup: 'A stove (flour from the miller)', note: 'On market days and opera nights there is nothing to eat in the square' } },
  { id: 'butcher', name: '杀猪卖肉', cat: '手艺买卖', kind: 'rounds', service: '杀猪', price: 15, pork: 6, place: 'rounds', item: 'knife', icon: 'cleaver', anim: 'work', season: S4(0.8, 0.6, 1, 1.8),
    keys: ['杀猪', '屠户', '刀', '力气大', '肉'], est: 8,
    desc: '养猪的人家请他去杀猪（年前最忙），分到的肉卖给村里', where: '养猪的人家（陈家、吴家）', buyers: '杀猪：养猪的人家；猪肉：手头宽裕的人家、过节', setup: '一把杀猪刀、一张肉案子',
    en: { name: 'Butcher', desc: 'Pig-keeping families call them in to slaughter their pigs (busiest before New Year); their share of the meat is sold in the village.', where: 'Pig-keeping families (the Chens, the Wus)', buyers: 'Slaughtering: pig-keeping families; pork: families with money to spare, and festivals', setup: 'A butcher\'s knife and a chopping block' } },
  { id: 'teahouse', name: '茶摊说书', cat: '手艺买卖', kind: 'stall', service: '喝茶', price: 1, place: 'square', item: 'teapot', anim: 'talk', season: S4(1, 1.2, 1, 0.8),
    keys: ['说书', '讲古', '泡茶', '烧水', '唱', '会说'], est: 5,
    desc: '村口支个茶摊，大碗茶一文一碗，人多了讲一段书', where: '村口大槐树下', buyers: '在村口闲坐、闲聊的人顺手买一碗', setup: '一把大茶壶、几只粗瓷碗',
    en: { name: 'Tea & stories', desc: 'Sets up a tea stall at the Village Square: a big bowl of tea for one coin, and a story when a crowd gathers.', where: 'Under the big locust tree at the Village Square', buyers: 'People sitting and chatting in the square, who buy a bowl on a whim', setup: 'A big teapot and a few coarse bowls' } },
  // ---- 山上
  { id: 'forager', name: '上山采山货', cat: '山上', kind: 'make', makes: 'wildfood', rate: 1.5, max: 24, place: 'forest', item: 'basket', icon: 'mushrooms', anim: 'squat', season: S4(1.2, 0.8, 1.5, 0.3),
    keys: ['采', '山', '野菜', '蘑菇', '核桃', '认得草木'], est: 6,
    desc: '背着背篓从进山口上山：春天挖野菜，秋天捡核桃、采蘑菇，背回来倒在山货收购棚的竹匾里晒', where: '老村址北边的老林子、山货收购棚', buyers: '各家（尝个鲜）；核桃骡帮也收', setup: '一只背篓',
    en: { name: 'Forager', desc: 'Climbs into the hills through the mountain gate with a back basket: wild greens in spring, walnuts and mushrooms in autumn, brought back and spread to dry on the trays at the forage yard.', where: 'The old woods north of the Old Site, and the forage yard', buyers: 'Every family (for a taste of the season); the caravan buys walnuts too', setup: 'A back basket' } },
  { id: 'hunter', name: '打猎', cat: '山上', kind: 'make', makes: 'game', rate: 0.3, max: 8, place: 'forest', item: 'trap', anim: 'squat', season: S4(0.8, 0.6, 1.1, 1.4),
    keys: ['打猎', '套兔子', '山', '眼尖', '脚力'], est: 6,
    desc: '在老林子边下套子、撵野兔山鸡（林子里还有野猪），入冬最好打', where: '老村址北边的老林子', buyers: '手头宽裕的人家、过节', setup: '几副套子',
    en: { name: 'Hunter', desc: 'Sets snares at the edge of the old woods and chases hares and pheasants (there are wild boar in there too). Winter is the best season.', where: 'The old woods north of the Old Site', buyers: 'Families with money to spare, and festivals', setup: 'A few snares' } },
  { id: 'charcoal', name: '烧炭', cat: '山上', kind: 'make', makes: 'charcoal', rate: 1.5, max: 30, fuel: { coal: 0.4 }, fuelBoost: 1.6, place: 'yard', item: 'shovel', icon: 'charcoal', anim: 'work', season: S4(0.8, 0.7, 1, 1.2),
    keys: ['烧炭', '烧窑', '砍柴', '力气', '看火'], est: 6,
    desc: '捡林子里的枯树枝，在住处边上挖个炭窑焖成木炭；村里有人挖煤，就买点煤引窑火、封窑，一窑出炭多一半', where: '自家院边的炭窑', buyers: '冬天烤火的人家（比柴暖、没烟）', setup: '挖个炭窑（卖炭不卖柴，不和卖柴的抢）；有挖煤的就跟他买煤',
    en: { name: 'Charcoal maker', desc: 'Gathers dead branches in the woods and smoulders them into charcoal in a pit kiln by the house. If someone in the village digs coal, a little coal to light and seal the kiln yields half again as much.', where: 'A pit kiln beside the yard', buyers: 'Families keeping warm in winter (warmer than firewood, and no smoke)', setup: 'Dig a kiln (sells charcoal, not firewood, so no competing); buy coal from the miner if there is one' } },
  { id: 'beekeeper', name: '养蜂', cat: '山上', kind: 'make', makes: 'honey', rate: 0.35, max: 30, place: 'apiary', item: 'smoker', hat: 'veil', anim: 'work', season: S4(1.2, 1.4, 1, 0.2),
    keys: ['养蜂', '蜂', '细心', '胆大', '花'], est: 7,
    desc: '照看老村址向阳坡上的蜂场：开箱、熏烟、割蜜，冬天给蜂箱裹草帘', where: '老村址的蜂场', buyers: '骡帮逢集收蜂蜜（村外的钱）；周郎中做蜜丸也要', setup: '熏烟罐、纱帽（蜂箱现成的）',
    en: { name: 'Beekeeper', desc: 'Tends the apiary on the sunny slope at the Old Site: opening hives, smoking bees, cutting honey, and wrapping the hives in straw mats for winter.', where: 'The apiary at the Old Site', buyers: 'The caravan buys honey on market days (money from outside); Doctor Zhou needs it for honey pills', setup: 'A smoker and a veil (the hives are already there)' } },
  { id: 'miner', name: '挖煤', cat: '山上', kind: 'make', makes: 'coal', rate: 2, max: 40, place: 'mine', item: 'pickaxe', anim: 'work', season: S4(1, 0.9, 1, 1.1),
    keys: ['挖', '力气大', '下窑', '煤', '胆大'], est: 7,
    desc: '下老村址青石崖脚的煤窑，一镐一镐刨煤，装上斗车推出来倒在煤堆上', where: '老村址的煤窑口', buyers: '冬天烧炕、烤火的人家（比柴耐烧）；烧炭的买去引窑火；骡帮也收', setup: '一把镐（煤窑现成的）',
    en: { name: 'Coal miner', desc: 'Goes down the coal pit at the foot of the Bluestone Cliff at the Old Site, hacks out coal pick by pick, and wheels it out to the heap.', where: 'The coal pit at the Old Site', buyers: 'Families heating the kang and keeping warm in winter (burns longer than wood); the charcoal maker, to light the kiln; the caravan buys it too', setup: 'A pickaxe (the pit is already dug)' } },
  { id: 'cowherd', name: '放牛', cat: '地里河里', kind: 'wage', wage: 6, payer: 'farm', place: 'pasture', item: 'whip', anim: 'idle', season: S4(1, 1.2, 1, 0.8),
    keys: ['放牛', '放羊', '赶牲口', '牛', '耐心'], est: 6,
    desc: '看着老村址草场上几家寄养的牛：赶着吃草、饮水，傍晚数一遍', where: '老村址的放牛草场', buyers: '寄养牛的农户按天给工钱', setup: '一根鞭子',
    en: { name: 'Cowherd', desc: 'Minds the families\' cattle boarded on the Old Site pasture: grazing, watering, and counting them every evening.', where: 'The cattle pasture at the Old Site', buyers: 'The farming families who board their cattle pay by the day', setup: 'A whip' } },
  // ---- 照料人
  { id: 'carer', name: '照看老人孩子', cat: '照料人', kind: 'rounds', service: '照看', price: 4, place: 'rounds', item: 'bowl', anim: 'work', season: S4(1, 1.2, 1.2, 1),
    keys: ['照顾', '做饭', '细心', '带孩子', '伺候', '耐心'], est: 5,
    desc: '去陈家老两口、柳婆婆家帮着做饭收拾；农忙时替下地的人家看孩子', where: '有老人、有孩子的人家', buyers: '有老人的人家，农忙时有孩子的人家', setup: '不用置办',
    en: { name: 'Carer', desc: 'Helps the old Chen couple and Granny Liu with cooking and tidying; at harvest time minds the children of families out in the fields.', where: 'Families with elders or children', buyers: 'Families with elders, and families with children at harvest time', setup: 'Nothing to buy' } },
  { id: 'water', name: '挑水送水', cat: '照料人', kind: 'rounds', service: '送水', price: 2, place: 'rounds', item: 'buckets', anim: 'work', season: S4(1, 1.3, 1, 1.1),
    keys: ['挑担', '力气', '挑水', '腿脚快'], est: 5,
    desc: '从井里挑水送到人家水缸里，一担两文', where: '井边到各家院里', buyers: '老人家、挑不动水的人家；夏天用水多', setup: '一副水桶、一根扁担',
    en: { name: 'Water carrier', desc: 'Carries water from the well and tips it into people\'s water vats: two coins a load.', where: 'From the well to every yard', buyers: 'The elderly and anyone who can\'t carry water; more in summer', setup: 'A pair of buckets and a carrying pole' } },
  // ---- 新鲜的
  { id: 'agronomist', name: '农技员（育良种）', cat: '新鲜的', kind: 'make', makes: 'seed', rate: 0.3, max: 10, wage: 3, payer: 'headman', place: 'trial', item: 'seedling', anim: 'squat', season: S4(1.3, 0.8, 1.2, 0.6),
    keys: ['识字', '种地', '选种', '农技', '算账', '庄稼'], est: 8,
    desc: '在老村址的培育田里一畦一样庄稼比着种，挑穗大粒饱的留种；农户换了良种，这一季多打一成半粮', where: '老村址的培育田', buyers: '三家农户，开春、入秋换种；村长家每天补贴 3 文', setup: '几样谷种（向农户要）',
    en: { name: 'Agronomist (seed breeding)', desc: 'Grows rows of each crop side by side in the Old Site trial plots and keeps seed from the fullest ears. A farm that switches to the improved seed harvests 15% more grain that season.', where: 'The trial plots at the Old Site', buyers: 'The three farming families, switching seed in spring and autumn; the headman\'s family pays a 3-coin daily allowance', setup: 'A few kinds of seed grain (asked from the farmers)' } },
  { id: 'clerk', name: '村委会文书', cat: '新鲜的', kind: 'wage', wage: 7, payer: 'headman', place: 'rounds', item: 'book', anim: 'talk', season: S4(1, 1, 1, 1),
    keys: ['识字', '写字', '算账', '记账', '跑腿', '会说'], est: 7,
    desc: '给王村长打下手：记账、写通知，挨家挨户传话，开村会时坐在边上记', where: '村长家、挨家挨户', buyers: '村长家按天给工钱（公中的钱）', setup: '笔墨纸',
    en: { name: 'Village clerk', desc: 'Assists Headman Wang: keeps the accounts, writes notices, carries messages door to door, and takes notes at village meetings.', where: 'The headman\'s house, and door to door', buyers: 'The headman\'s family pays daily wages (from village funds)', setup: 'Brush, ink and paper' } },
  { id: 'relic', name: '挖旧物·办村史馆', cat: '新鲜的', kind: 'make', makes: 'relic', rate: 0.08, max: 6, place: 'digs', item: 'pickaxe', icon: 'pot', anim: 'squat', season: S4(1, 1.3, 1, 0.5),
    keys: ['识字', '好奇', '挖', '古董', '考据', '耐性'], est: 5,
    desc: '在老村址的废墟、旧河道里刨大水埋下的老东西：铜钱、瓷片、老匾……挖到的记进村史馆，品相好的骡帮收', where: '老村址的废墟、旧河道', buyers: '骡帮逢集收；挖到的每一样都记进村史馆', setup: '一把小镐（靠运气）',
    en: { name: 'Relic hunter', desc: 'Digs through the ruins and old riverbed at the Old Site for things the great flood buried: coins, pottery shards, old plaques... Every find goes into the village museum; the caravan buys the good ones.', where: 'The ruins and old riverbed at the Old Site', buyers: 'The caravan on market days; every find is recorded in the village museum', setup: 'A small pick (and some luck)' } },
  // ---- 旧存档里还有人干的（和 NPC 撞，不再给选）
  { id: 'basketry', name: '编筐', legacy: true, kind: 'make', makes: 'basket', rate: 0.5, place: 'yard', item: 'basket', anim: 'squat', keys: ['编', '筐', '篾'], est: 4, season: S4(1, 1, 1, 1), en: { name: 'Basket weaver' } },
  { id: 'woodcutter', name: '砍柴', legacy: true, kind: 'make', makes: 'wood', rate: 5, place: 'firewood', item: 'axe', anim: 'work', keys: ['砍柴', '斧'], est: 4, season: S4(1, 1, 1, 1), en: { name: 'Woodcutter' } },
];
export const jobById = Object.fromEntries(JOBS.map((j) => [j.id, j]));
/** 卡片上"此刻在干什么"。 */
const DOING = { beekeeper: '蜂场里照看蜂箱', miner: '煤窑里挖煤', cowherd: '草场上放牛', hand: '下地帮工', fisher: '河滩上钓鱼', gardener: '侍弄菜地', miller: '水磨坊磨面', builder: '等人叫去修房', tailor: '门口做衣裳', snack: '村口烙烧饼', butcher: '等人叫去杀猪', teahouse: '村口摆茶摊', forager: '上山采山货', hunter: '山上下套子', charcoal: '炭窑烧炭', carer: '照看老人孩子', water: '挑水送水', agronomist: '试验田里育种', clerk: '村委会的差事', relic: '老村址刨旧物', basketry: '编筐', woodcutter: '砍柴' };
const DOING_EN = { beekeeper: 'Tending the hives', miner: 'Digging coal in the pit', cowherd: 'Herding cattle on the pasture', hand: 'Helping in the fields', fisher: 'Fishing at the riverbank', gardener: 'Tending the vegetable patch', miller: 'Grinding flour at the watermill', builder: 'Waiting to be called for repairs', tailor: 'Sewing at the front door', snack: 'Baking flatbread in the square', butcher: 'Waiting to be called to slaughter a pig', teahouse: 'Running the tea stall', forager: 'Foraging in the hills', hunter: 'Setting snares in the hills', charcoal: 'Burning charcoal at the kiln', carer: 'Looking after elders and children', water: 'Carrying water', agronomist: 'Breeding seed in the trial plots', clerk: 'On village business', relic: 'Digging for relics at the Old Site', basketry: 'Weaving baskets', woodcutter: 'Cutting firewood' };
const doingText = (id) => (EN ? DOING_EN[id] ?? jobById[id]?.en?.name : DOING[id]);
export const JOB_CATS = ['地里河里', '手艺买卖', '山上', '照料人', '新鲜的'];

/** 挖到的老东西（村史馆的展品，按挖到的先后轮着来）。 */
export const RELICS = ['一枚光绪通宝', '半只青花碗', '一块刻着"石峪"的老匾', '一把锈了的铜锁', '一只瓷枕', '一副老碾框', '一面铜镜', '一枚银簪子', '一只烟袋锅', '一块界碑', '一只瓦当', '一册泡烂的账本'];
/** RELICS 的英文（同样的顺序）。 */
export const RELICS_EN = ['a Guangxu-era copper coin', 'half a blue-and-white bowl', 'an old plaque carved with "Shiyu"', 'a rusted brass lock', 'a porcelain pillow', 'an old roller frame', 'a bronze mirror', 'a silver hairpin', 'a pipe bowl', 'a boundary stone', 'a roof-tile end', 'a water-rotted account book'];
/** 第 n 件（从 1 数）挖到的老东西，按界面语言。 */
export const relicText = (n) => (EN ? RELICS_EN : RELICS)[(n - 1) % RELICS.length];

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
    const whyEn = [hits ? `Knows ${(p.skills ?? []).filter((s) => job.keys.some((k) => s.includes(k) || k.includes(s))).map(word).join(', ')}` : '', short ? 'the village needs it' : '', rivals ? `${rivals} already doing it` : ''].filter(Boolean).join('; ');
    return { job, score, why, whyEn: whyEn && whyEn[0].toUpperCase() + whyEn.slice(1), est, short, match: hits > 0, rivals };
  }).sort((a, b) => b.score - a.score);
}

/*
 * 新来的住哪儿：自己找，不用在卡片上选。老村址空着的老宅优先（住进去不交房钱），
 * 挑和自己合得来的那处——会什么（磨坊给会磨面的、铁匠炉给会打铁的、羊圈给赶牲口的……）、
 * 什么性子（爱热闹的住老街边上，性子静的住西头窑洞、崖边、北坡）、喜欢什么（院里有柿子树、枣树）。
 * 老宅都有人住了，才去借住人家（pickHost）。
 */
const QUIET = ['文静', '寡言', '孤僻', '话少', '闷葫芦', '腼腆', '斯文', '好读书', '胆小', '老实', '憨厚', '念旧'];
const SOCIAL = ['热心', '嗓门洪亮', '爱笑', '爱吆喝', '爱说笑', '健谈', '能说会道', '消息灵通', '嘴甜', '笑脸迎人', '和气', '爽利', '豪爽', '好动', '嘴巧', '唠叨', '嘴碎'];
const PROUD = ['好面子', '讲究', '稳重', '严厉', '爱整洁', '精明'];
const THRIFT = ['勤快', '埋头苦干', '实在', '精打细算', '会持家', '能干', '早起', '力大', '力气大', '能吃苦'];
/** 每处老宅：合什么手艺 / 喜好（关键词）、看中它的理由、在哪一片（street 老街边上、far 偏一点）、是不是大院。 */
const PLOT_FIT = {
  old1: { keys: ['赶牲口', '牛', '种地', '庄稼'], what: '院里有牛棚', whatEn: 'there is a cattle shed in the yard', who: '王家', street: true, big: true },
  old2: { keys: ['算账', '买卖', '做生意', '卖', '货', '吆喝', '铺'], what: '临街的老铺面', whatEn: 'it is an old shopfront on the street', who: '孙家', street: true },
  old3: { keys: ['磨面', '磨', '豆腐', '面', '烙饼', '鸡'], what: '院里有石磨', whatEn: 'there is a stone mill in the yard', who: '赵家', street: true },
  old4: { keys: ['杀猪', '猪', '柿'], what: '有猪圈、柿子树', whatEn: 'it has a pigsty and a persimmon tree', who: '陈家', big: true },
  old5: { keys: ['种地', '种菜', '挑担', '力气', '帮工'], what: '北坡上清静的小院', whatEn: 'it is a quiet little yard on the north slope', who: '杨家', far: true, small: true },
  old6: { keys: ['鸡', '种地', '槐'], what: '西头石头院，墙外老槐树', whatEn: 'a stone yard at the west end, with an old locust tree outside the wall', who: '吴家', far: true },
  old7: { keys: ['木工', '木匠', '木', '梁'], what: '院里码着木料', whatEn: 'there is timber stacked in the yard', who: '刘家', street: true },
  old8: { keys: ['打铁', '铁', '锻', '力气大'], what: '院里有铁匠炉', whatEn: "there is a blacksmith's forge in the yard", who: '张家' },
  old9: { keys: ['医', '药', '采山货', '采药', '识字', '枣'], what: '老药铺，院里有枣树', whatEn: 'it is the old pharmacy, with a jujube tree in the yard', who: '周家', big: true, far: true },
  old10: { keys: ['赶牲口', '放羊', '羊', '牲口'], what: '门前有羊圈的窑洞', whatEn: 'a cave dwelling with a sheepfold out front', who: '马家', far: true },
  old11: { keys: ['剃头', '针线', '裁缝', '说书'], what: '场院跟前的小屋', whatEn: 'a little house by the threshing floor', who: '郑家', street: true, small: true },
  old12: { keys: ['识字', '教', '书', '说书', '柿'], what: '崖边的石头房，院里柿子树', whatEn: 'a stone house on the cliff edge, with a persimmon tree in the yard', who: '李家', far: true },
};
/** 老宅原来是谁家的（英文界面：Zhao old house）。 */
const WHO_EN = { 王家: 'Wang', 孙家: 'Sun', 赵家: 'Zhao', 陈家: 'Chen', 杨家: 'Yang', 吴家: 'Wu', 刘家: 'Liu', 张家: 'Zhang', 周家: 'Zhou', 马家: 'Ma', 郑家: 'Zheng', 李家: 'Li' };
const plotWho = (plotId) => { const w = PLOT_FIT[plotId]?.who; return EN ? WHO_EN[w] ?? word(w) ?? plotId : w ?? plotId; };
registerNewcomerNames((id) => (EN ? jobById[id]?.en?.name : jobById[id]?.name) ?? id, plotWho);
/** 看中老宅的理由里那几样（英文）。 */
const WHY_EN = { 爱热闹: 'likes company', 性子静: 'quiet by nature', 讲体面: 'likes things proper', 过日子实在: 'down-to-earth' };

/** 老村址哪处空着的老宅最合他：返回 { id, who, why }；都有人住了返回 null。 */
export function pickOldHouse(p, houses) {
  const free = houses.filter((h) => !h.owner);
  if (!free.length) return null;
  const text = [...(p.skills ?? []), p.more ?? '', p.likes ?? '', p.bio ?? '', p.jobId ? jobById[p.jobId]?.name ?? '' : ''].join(' ');
  const traits = p.traits ?? [];
  const has = (list) => traits.filter((t) => list.includes(t)).length;
  const quiet = has(QUIET), social = has(SOCIAL), proud = has(PROUD), thrift = has(THRIFT);
  const ranked = free.map((h) => {
    const f = PLOT_FIT[h.id] ?? { keys: [], what: '' };
    const hits = f.keys.filter((k) => text.includes(k));
    const why = [];
    let s = hits.length * 6 + hash(`${p.name ?? ""}/${h.id}/plot`) * 2 + (h.state ?? 2) * 0.4;
    if (hits.length) why.push(`会${hits[0]}`);
    if (f.street) { s += social * 3 - quiet * 2; if (social) why.push('爱热闹'); }
    if (f.far) { s += quiet * 3 - social * 1.5; if (quiet) why.push('性子静'); }
    if (f.big) { s += proud * 3 - thrift; if (proud) why.push('讲体面'); }
    if (f.small) { s += thrift * 2; if (thrift) why.push('过日子实在'); }
    const en = why.slice(0, 2).map((w) => WHY_EN[w] ?? (word(w.slice(1)) !== w.slice(1) ? `good at ${word(w.slice(1)).toLowerCase()}` : 'their skills fit')); // 会X → good at X（词表里没有的写 skills fit）
    const whyEn = en.length ? `${en.join(', ')}; ${f.whatEn ?? ''}` : f.whatEn ?? '';
    return { h, s, why: why.length ? `${why.slice(0, 2).join('、')}；那儿${f.what}` : f.what, whyEn: whyEn && whyEn[0].toUpperCase() + whyEn.slice(1) };
  }).sort((a, b) => b.s - a.s);
  const best = ranked[0];
  return { id: best.h.id, who: best.h.who, whoEn: WHO_EN[best.h.who] ?? best.h.who, why: best.why, whyEn: best.whyEn };
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
  p.stats ??= {}; p.stats.since ??= V.econ.day; // 进村那天（勋章「老住户」从这天算）
  V.jobOf ??= (id) => jobById[id]; // badges.js 查营生做什么（不直接 import，免得绕圈）
  if (arriving && !p.home) { const o = V.east && pickOldHouse(p, V.east.houses); if (o) { p.home = o.id; p.homeWhy = o.why; } } // 自己找住处：空着的老宅优先
  const plot = p.home && V.C[p.home]?.plot ? V.east.claim(p.home, p) : null; // 住进老村址的一处老宅：自己住（不交房钱），塌了的先苫半边顶
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
  if (p.jobId && jobById[p.jobId]?.hat && !p.hat) p.hat = jobById[p.jobId].hat; // 养蜂的：没戴帽子的给一顶纱帽
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
  v.errandText = EN ? 'New here, calling on every household' : '新来的，在挨家认人';
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
  v.errandText = doingText(id) ?? job.name;
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
  const O = V.oldSite;
  if (job.place === 'mine') { // 挖煤：在洞口里头刨一阵，背一筐出来倒在煤堆上
    v.loop = () => { v.go(O.mine.at); v.do('work', 25, { face: O.mine.face }); v.back('basket:coal'); v.go(O.mine.heap); v.do('work', 3); v.back(null); };
    return;
  }
  if (job.place === 'pasture') { v.loop = () => { v.go(pick(O.pasture)); v.do(v.rand() < 0.5 ? 'idle' : 'work', 18); }; return; } // 放牛：草场里转，时不时甩一鞭
  if (job.place === 'apiary') { v.loop = () => { v.go(pick(O.apiary)); v.do('work', 20); }; return; } // 养蜂：蜂箱跟前熏烟、开箱
  if (job.place === 'trial') { v.loop = () => { v.go(pick(O.trial)); v.do(v.rand() < 0.6 ? 'squat' : 'work', 22); }; return; } // 培育田：蹲在畦头看穗、比着记
  if (job.place === 'forest') { // 进老林子：林子边上挖、捡、下套子；采山货的隔一阵背回收购棚倒下
    let n = 0;
    v.loop = () => {
      v.go(near(O.forest, 4));
      v.do(job.anim, 25);
      if (job.id === 'forager' && ++n % 3 === 0) { v.back('basket:wild'); v.go(O.gather); v.do('work', 4); v.back(null); }
    };
    return;
  }
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
    if (!call) { v.char.setItem(job.item); v.errandText = doingText(job.id); v.go(v.home.spot('yard') ?? v.home.gateOut()); v.do('idle', 10); return; }
    const c = V.C[call.home] ?? V.C.square;
    v.errandText = EN ? `${reasonText(call.service)} at ${call.place.replace(/^The /, 'the ')}` : `去${call.place}${call.service}`;
    if (job.id === 'water') { v.char.setItem('buckets'); v.go(V.well.spot()); v.do('work', 4, { face: V.well.center }); }
    v.go(c.spot('yard') ?? c.gateOut());
    v.do(job.anim, call.dur);
    v.call(() => { E.serveCall(call, v); v.errandText = doingText(job.id); });
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
