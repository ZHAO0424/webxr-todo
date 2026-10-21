import { PLACES as HOMES } from './labels.js';

/*
 * 村里动物的名字和来历（点小动物弹出的卡片用）。
 * 名字按 院子 + 品种 + 第几只 固定分配，每次打开都一样。
 */

export const KIND_NAMES = {
  dog: '黄狗', dogBlack: '黑狗', cat: '狸花猫', hen: '芦花鸡', henBrown: '麻母鸡', rooster: '大公鸡', duck: '麻鸭', goose: '大白鹅',
  pig: '黑猪', sheep: '绵羊', donkey: '灰毛驴', ox: '黄牛', magpie: '喜鹊', pigeon: '鸽子',
};

const NAMES = {
  dog: ['大黄', '虎子'], dogBlack: ['黑子', '乌金'], cat: ['花花', '咪咪', '狸子'],
  hen: ['芦花', '小芦', '点点', '米米', '豆豆', '花脖', '白翅', '小麻'], henBrown: ['麻姑', '红冠', '小褐', '枣子'], rooster: ['大红袍', '金冠', '将军', '打鸣王'],
  duck: ['嘎嘎', '扁嘴', '小麻', '水漂', '鸭头'], goose: ['大白', '二白', '长脖', '老憨'],
  pig: ['黑娃', '胖墩', '哼哼', '肥肥'], sheep: ['头羊', '白云', '卷卷', '咩咩', '小犄角', '花脸', '棉花', '团子', '老绵'],
  donkey: ['灰灰'], ox: ['老黄'], magpie: ['喳喳', '报喜'], pigeon: ['灰点', '白羽', '铃铛', '瓦灰', '雨点', '小信', '咕咕', '斑斑'],
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
  sheep: '羊倌老马的羊群。清晨随他上坡吃草，日落时一声鞭响，便排成一列返回羊圈。',
  donkey: '豆腐坊的毛驴，蒙着眼拉磨，一圈又一圈。不干活时便站在棚下嚼草。',
  ox: '杨家的老黄牛，碾场全靠它拉动石碾。脾气温和，孩子骑上去也不恼。',
  magpie: '在树梢与屋脊间跳跃。村里人说，喜鹊登枝，好事将至。',
  pigeon: '栖在学堂屋檐下的一群鸽子，白天在村子上空盘旋，傍晚落回屋脊。',
};


const used = new Map();
/** 给一只动物（compounds 里的条目 s、所在院子 c）发名字和来历。 */
export function animalInfo(s, c) {
  const pool = NAMES[s.kind] ?? ['小家伙'];
  const key = `${c?.id ?? 'wild'}:${s.kind}`;
  const i = used.get(key) ?? 0;
  used.set(key, i + 1);
  const owner = s.role === 'duck' || s.role === 'goose' ? '吴家' : s.role === 'pigeon' ? '学堂屋檐下' : HOMES[c?.id] ?? '村里';
  const offset = (c?.id ?? 'w').length; // 不同院子从名单里不同位置开始取，同名少一些
  return { name: pool[(i + offset) % pool.length], kind: KIND_NAMES[s.kind] ?? s.kind, owner, about: ABOUT[s.kind] ?? '' };
}

/** 这会儿在干什么（看动物的状态）。 */
export function animalDoing(b, V) {
  const s = b.s;
  if (b.home) return s.role === 'chicken' ? '已回鸡窝歇息' : '已回窝';
  if (s.role === 'pigeon') return b.moving ? '在村子上空盘旋' : '栖在学堂屋脊上';
  if (s.perches) return b.flight ? (s.role === 'bird' ? '飞往另一棵树' : '跃向别处') : s.role === 'cat' ? '蹲在高处小憩' : '立在高处鸣叫';
  if (b.circling) return s.role === 'ox' ? '拉碾碾场' : '蒙眼拉磨';
  if (b.follow) return `跟随${b.follow.p.nick}`;
  if (b.lure) return '围拢抢食';
  if (b.stroll) return '拱开院门外出闲逛';
  if (b.returning) return '独自返回家中';
  if (s.role === 'dog' && s.owner) { const o = V.byId[s.owner]; if (o && !o.inside && Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) < 3) return `守在${o.p.nick}身旁`; }
  if (b.graze) return '山坡上吃草';
  if (b.swim && V.nav.water[V.nav.index(b.pos.x, b.pos.z)]) return '溪中游弋';
  if (b.moving) return '四处走动';
  if (b.pecking) return s.role === 'sheep' ? '低头吃草' : s.role === 'pig' ? '拱土觅食' : '低头啄食';
  return '休息';
}
