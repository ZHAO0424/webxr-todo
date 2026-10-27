import { PLACES as HOMES } from './labels.js';
import { EN, tr } from './i18n.js';
import { pNick } from './names.js';

/*
 * 村里动物的名字和来历（点小动物弹出的卡片用）。
 * 名字按 院子 + 品种 + 第几只 固定分配，每次打开都一样。
 */

export const KIND_NAMES = {
  dog: '黄狗', dogBlack: '黑狗', cat: '狸花猫', hen: '芦花鸡', henBrown: '麻母鸡', rooster: '大公鸡', duck: '麻鸭', goose: '大白鹅',
  pig: '黑猪', boar: '野猪', sheep: '绵羊', donkey: '灰毛驴', ox: '黄牛', magpie: '喜鹊', pigeon: '鸽子', fox: '赤狐', foxCub: '小狐狸',
};

const NAMES = {
  dog: ['大黄', '虎子'], dogBlack: ['黑子', '乌金'], cat: ['花花', '咪咪', '狸子'],
  hen: ['芦花', '小芦', '点点', '米米', '豆豆', '花脖', '白翅', '小麻'], henBrown: ['麻姑', '红冠', '小褐', '枣子'], rooster: ['大红袍', '金冠', '将军', '打鸣王'],
  duck: ['嘎嘎', '扁嘴', '小麻', '水漂', '鸭头'], goose: ['大白', '二白', '长脖', '老憨'],
  pig: ['黑娃', '胖墩', '哼哼', '肥肥'], boar: ['独眼', '大獠牙', '黑鬃', '小野'], sheep: ['头羊', '白云', '卷卷', '咩咩', '小犄角', '花脸', '棉花', '团子', '老绵'],
  donkey: ['灰灰'], ox: ['老黄', '花鼻子', '大犍', '小犊'], fox: ['火尾巴'], foxCub: ['毛球', '尖耳朵'], magpie: ['喳喳', '报喜'], pigeon: ['灰点', '白羽', '铃铛', '瓦灰', '雨点', '小信', '咕咕', '斑斑'],
};

const ABOUT = {
  dog: '看家护院的好手，终日跟在主人身后。生人路过便吠两声，与常来的货郎却早已相熟。',
  dogBlack: '一身黑毛油亮，性子安静，少有吠叫。主人走到哪里便跟到哪里，看戏时也蹲在脚边。',
  cat: '偏爱高处：墙头、屋檐、缸沿。白天眯眼晒太阳，夜里到柴房捕鼠。',
  hen: '院里下蛋最勤的一只，整日在土里刨食找虫。一撒谷粒，总是第一个冲上前。',
  henBrown: '性子慢，抢食总落在后面，下的蛋个头却最大。',
  rooster: '天未亮便开始打鸣，是全村的报时钟。院里的母鸡都归它照看。',
  duck: '吴家的鸭子。白天漂在溪上觅食，天黑前由小翠赶回家中。',
  goose: '比狗还警觉，生人一靠近便伸长脖子追赶。同属吴家，常随鸭群一同下溪。',
  pig: '吃了睡、睡了吃。听见泔水桶响，便哼哼着挤到槽边。',
  boar: '东山林子边上的野猪，夜里下山拱地里的红薯玉米。打猎的人在林边下了套子，它们精得很，轻易不上当。',
  sheep: '羊倌老马的羊群。清晨随他上坡吃草，日落时一声鞭响，便排成一列返回羊圈。',
  donkey: '豆腐坊的毛驴，蒙着眼拉磨，一圈又一圈。不干活时便站在棚下嚼草。',
  ox: '杨家的老黄牛，碾场全靠它拉动石碾。脾气温和，孩子骑上去也不恼。',
  magpie: '在树梢与屋脊间跳跃。村里人说，喜鹊登枝，好事将至。',
  pigeon: '栖在学堂屋檐下的一群鸽子，白天在村子上空盘旋，傍晚落回屋脊。',
};

// 英文界面：品种、名字（和 NAMES 一一对应，按同一个下标取）、来历
const KIND_EN = {
  dog: 'Yellow dog', dogBlack: 'Black dog', cat: 'Tabby cat', hen: 'Barred hen', henBrown: 'Brown hen', rooster: 'Rooster', duck: 'Speckled duck', goose: 'White goose',
  pig: 'Black pig', boar: 'Wild boar', sheep: 'Sheep', donkey: 'Grey donkey', ox: 'Ox', magpie: 'Magpie', pigeon: 'Pigeon', fox: 'Red fox', foxCub: 'Fox cub',
};
const NAMES_EN = {
  dog: ['Goldie', 'Tiger'], dogBlack: ['Blackie', 'Coal'], cat: ['Patches', 'Mimi', 'Tabby'],
  hen: ['Speckles', 'Little Speck', 'Dot', 'Millet', 'Bean', 'Ruffles', 'Whitewing', 'Freckle'], henBrown: ['Auntie Brown', 'Redcomb', 'Hazel', 'Jujube'], rooster: ['Red Robe', 'Goldcrest', 'General', 'King Crow'],
  duck: ['Quack', 'Flatbill', 'Freckle', 'Floater', 'Duckhead'], goose: ['Big White', 'Second White', 'Longneck', 'Old Dopey'],
  pig: ['Sooty', 'Chubby', 'Oinker', 'Porky'], boar: ['One-eye', 'Big Tusk', 'Bristles', 'Wildling'], sheep: ['Bellwether', 'Cloud', 'Curly', 'Baa', 'Little Horn', 'Spotface', 'Cotton', 'Dumpling', 'Old Wool'],
  donkey: ['Grey'], ox: ['Old Yellow', 'Spotnose', 'Big Bull', 'Calf'], fox: ['Firetail'], foxCub: ['Fluffball', 'Pointy Ears'], magpie: ['Chatter', 'Goodnews'], pigeon: ['Greydot', 'Whitefeather', 'Bell', 'Slate', 'Raindrop', 'Courier', 'Coo', 'Speckle'],
};
const ABOUT_EN = {
  dog: 'A fine guard dog that trails its owner all day. It barks twice at strangers, but the peddler is an old friend by now.',
  dogBlack: 'A glossy black coat and a quiet temper; it rarely barks. It follows its owner everywhere, even sitting at their feet at the opera.',
  cat: 'Loves high places: wall tops, eaves, the rim of the water vat. Naps in the sun by day and hunts mice in the woodshed at night.',
  hen: 'The best layer in the yard, scratching in the dirt for bugs all day. Scatter some grain and she is always first to it.',
  henBrown: 'A slow one, always last to the food, but she lays the biggest eggs.',
  rooster: 'Crows before dawn, the whole village\'s clock. He keeps an eye on all the hens in the yard.',
  duck: 'One of the Wus\' ducks. It paddles in the stream for food by day, and Xiaocui herds it home before dark.',
  goose: 'More alert than a dog: let a stranger come near and it stretches out its neck and gives chase. It belongs to the Wus too and often goes down to the stream with the ducks.',
  pig: 'Eats, sleeps, eats again. At the clank of the slop bucket it grunts its way to the trough.',
  boar: 'Wild boar from the edge of the East Hill woods, coming down at night to root up sweet potatoes and corn. The hunters set snares at the forest edge, but these are too clever to fall for them easily.',
  sheep: 'Shepherd Ma\'s flock. At dawn they follow him up the slope to graze; at sunset one crack of the whip and they file back to the fold.',
  donkey: 'The tofu shop\'s donkey, blindfolded, turning the millstone round and round. When not working it stands under the shed chewing hay.',
  ox: 'The Yangs\' old ox, who pulls the stone roller on the threshing floor. Gentle-natured; doesn\'t mind the kids riding him.',
  magpie: 'Hops between treetops and rooftops. Villagers say a magpie on the branch means good news is coming.',
  pigeon: 'A flock of pigeons living under the school eaves. By day they circle over the village; at dusk they settle back on the roof ridge.',
};
const MULE_EN = { 大青: 'Dapple', 二黑: 'Ebony', 花脸: 'Patchface' };
/** 英文界面换成英文（名字按在中文名单里的下标对应；查不到原样）。 */
function toEn(info, s) {
  if (!EN) return info;
  const zh = NAMES[s.kind] ?? [], i = zh.indexOf(info.name);
  const name = s.role === 'mule' ? MULE_EN[info.name] ?? info.name : i >= 0 ? NAMES_EN[s.kind]?.[i] ?? info.name : info.name === '小家伙' ? 'Little one' : info.name;
  return { ...info, name, kind: KIND_EN[s.kind] ?? info.kind, owner: info.ownerEn ?? info.owner, about: info.aboutEn ?? info.about };
}

const used = new Map();
/** 给一只动物（compounds 里的条目 s、所在院子 c）发名字和来历。 */
export function animalInfo(s, c) {
  const info = animalInfoZh(s, c);
  if (!EN) return info;
  const out = toEn(info, s);
  if (s.role === 'mule') return { ...out, kind: 'Mule', owner: "Boss Niu's mule train", about: 'A pack mule of the caravan, a pannier slung on each side. Used to the cliff road, it is sure-footed and never flinches at the edge.' };
  if (s.ownerText) return { ...out, owner: s.ownerTextEn ?? out.owner, about: s.aboutEn ?? (s.about ? out.about : ABOUT_EN[s.kind] ?? out.about) };
  if (s.role === 'duck' || s.role === 'goose') out.owner = "The Wus'";
  else if (s.role === 'pigeon') out.owner = 'Under the school eaves';
  else if (!HOMES[c?.id]) out.owner = 'Village';
  return { ...out, about: ABOUT_EN[s.kind] ?? out.about };
}

function animalInfoZh(s, c) {
  if (s.role === 'mule') return { name: s.name, kind: '骡子', owner: '骡帮牛老大', about: '骡帮的驮骡，背上一边一个驮篓。走惯了挂壁古道，脚底下稳当，崖边上也不慌。' };
  const pool = NAMES[s.kind] ?? ['小家伙'];
  const key = `${c?.id ?? 'wild'}:${s.kind}`;
  const i = used.get(key) ?? 0;
  used.set(key, i + 1);
  if (s.ownerText) { // 老村址：林子里的野猪、放牛人放的牛
    const k = `${s.ownerText}:${s.kind}`, j = used.get(k) ?? 0; used.set(k, j + 1);
    return { name: (NAMES[s.kind] ?? ['小家伙'])[j % (NAMES[s.kind] ?? [1]).length], kind: KIND_NAMES[s.kind] ?? s.kind, owner: s.ownerText, about: s.about ?? ABOUT[s.kind] ?? '' };
  }
  const owner = s.role === 'duck' || s.role === 'goose' ? '吴家' : s.role === 'pigeon' ? '学堂屋檐下' : HOMES[c?.id] ?? '村里';
  const offset = (c?.id ?? 'w').length; // 不同院子从名单里不同位置开始取，同名少一些
  return { name: pool[(i + offset) % pool.length], kind: KIND_NAMES[s.kind] ?? s.kind, owner, about: ABOUT[s.kind] ?? '' };
}

/** 这会儿在干什么（看动物的状态）。 */
export function animalDoing(b, V) {
  const s = b.s;
  if (b.home) return s.role === 'chicken' ? tr('已回鸡窝歇息', 'Roosting in the coop') : s.role === 'mule' ? tr('跟着骡帮在山外', 'Away with the mule train') : tr('已回窝', 'Back in its pen');
  if (s.role === 'mule' && !b.follow) return tr('驮着货在村口歇脚', 'Resting with its load');
  if (s.role === 'pigeon') return b.moving ? tr('在村子上空盘旋', 'Circling over the village') : tr('栖在学堂屋脊上', 'Perched on the school roof');
  if (s.perches) return b.flight ? (s.role === 'bird' ? tr('飞往另一棵树', 'Flying to another tree') : tr('跃向别处', 'Leaping elsewhere')) : s.role === 'cat' ? tr('蹲在高处小憩', 'Napping up high') : tr('立在高处鸣叫', 'Calling from a perch');
  if (b.circling) return s.role === 'ox' ? tr('拉碾碾场', 'Pulling the roller') : tr('蒙眼拉磨', 'Turning the mill');
  if (b.follow) return EN ? `Following ${pNick(b.follow.p)}` : `跟随${b.follow.p.nick}`;
  if (b.lure) return tr('围拢抢食', 'Crowding for food');
  if (b.stroll) return tr('拱开院门外出闲逛', 'Nosed the gate open, roaming');
  if (b.returning) return tr('独自返回家中', 'Heading home alone');
  if (s.role === 'dog' && s.owner) { const o = V.byId[s.owner]; if (o && !o.inside && Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) < 3) return EN ? `Staying by ${pNick(o.p)}` : `守在${o.p.nick}身旁`; }
  if (b.graze) return tr('山坡上吃草', 'Grazing on the slope');
  if (b.swim && V.nav.water[V.nav.index(b.pos.x, b.pos.z)]) return tr('溪中游弋', 'Swimming in the stream');
  if (b.moving) return tr('四处走动', 'Wandering about');
  if (b.pecking) return s.role === 'sheep' ? tr('低头吃草', 'Grazing') : s.role === 'pig' ? tr('拱土觅食', 'Rooting for food') : tr('低头啄食', 'Pecking at the ground');
  return tr('休息', 'Resting');
}
