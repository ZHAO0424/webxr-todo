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
  dog: '看家护院，一天到晚跟在主人脚后头；生人从门口过就叫两声，货郎来了倒不叫——熟了。',
  dogBlack: '黑得发亮，不爱叫。主人去哪它去哪，看戏都蹲在脚边。',
  cat: '爱蹲在高处：墙头、房檐、缸沿。白天眯着眼晒太阳，夜里去柴房逮耗子。',
  hen: '下蛋的主力，整天在院里刨土找虫子。一撒食就第一个冲过来。',
  henBrown: '性子慢，抢食总落在后头，下的蛋倒是个大。',
  rooster: '天不亮就打鸣，全村的钟。院里的母鸡都归它管。',
  duck: '吴家养的，白天在溪里漂着找吃的，天黑前小翠来赶回家。',
  goose: '比狗还凶，生人靠近就伸着脖子追。也是吴家的，跟着鸭子一块儿下溪。',
  pig: '吃了睡、睡了吃。听见泔水桶响就哼哼着挤到槽边。',
  sheep: '羊倌老马的羊，一早跟着他上坡吃草，太阳落山一声鞭响就排着队回圈。',
  donkey: '豆腐坊的驴，蒙着眼拉磨，一圈一圈地转。不干活时站在棚里嚼草。',
  ox: '杨二哥家的老黄牛，轧场全靠它拉碾子。脾气好，小孩骑上去也不恼。',
  magpie: '在树梢、屋脊上跳来跳去。村里人说喜鹊叫，好事到。',
  pigeon: '学堂屋檐下的一群鸽子，白天在村子上空兜圈子，傍晚落回屋脊。',
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
  if (b.home) return s.role === 'chicken' ? '钻进鸡窝睡了' : '回窝了';
  if (s.role === 'pigeon') return b.moving ? '在村子上空兜圈子' : '落在学堂屋脊上';
  if (s.perches) return b.flight ? (s.role === 'bird' ? '飞到另一棵树上' : '跳到另一处') : s.role === 'cat' ? '蹲在高处眯着眼' : '站在高处喳喳叫';
  if (b.circling) return s.role === 'ox' ? '拉着碾子轧场' : '蒙着眼拉磨';
  if (b.follow) return `跟着${b.follow.p.nick}走`;
  if (b.lure) return '围过来抢食';
  if (b.stroll) return '拱开院门溜出去转转';
  if (b.returning) return '自己溜达回家';
  if (s.role === 'dog' && s.owner) { const o = V.byId[s.owner]; if (o && !o.inside && Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) < 3) return `守在${o.p.nick}脚边`; }
  if (b.graze) return '在坡上吃草';
  if (b.swim && V.nav.water[V.nav.index(b.pos.x, b.pos.z)]) return '在溪里漂着';
  if (b.moving) return '东游西逛';
  if (b.pecking) return s.role === 'sheep' ? '低头吃草' : s.role === 'pig' ? '拱土' : '低头啄食';
  return '歇着';
}
