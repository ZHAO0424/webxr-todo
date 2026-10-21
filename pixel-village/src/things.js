import * as THREE from 'three';

/*
 * 房子、家具、物件的"身份证"：点它们弹出卡片用。
 *
 * 1. 建的时候打标签：props.js 的每个函数、house / gate / screenWall、土地庙、石敢当、石桥返回的物体，
 *    userData.thing = 种类（tagged() 包一层就行，不用改每个函数）。
 * 2. 合批之前收集（collectThings）：每个带标签的物体算一个包围盒（村子根节点的本地坐标）、属于哪个院子。
 *    合批会把网格拆掉，所以必须在合批前算。
 * 3. 点击时（pickThing）：射线打到场景上的点，找包住这个点的最小的盒子；打在院子地上没碰到东西 → 这个院子。
 */

export const THINGS = {
  house: { name: '房子', about: '' },
  gate: { name: '院门', about: '' },
  screenWall: { name: '影壁', about: '进了大门迎面一堵墙，挡住外人往院里看的视线，也挡煞气。墙心刷白，过年贴个"福"字。' },
  haystack: { name: '麦秸垛', about: '打完麦子剩下的麦秸，垛成圆垛，冬天喂牲口、引火、和泥都用它。垛顶抹一层泥防雨。' },
  cornCrib: { name: '玉米囤', about: '秸秆编的圆囤，装满剥了皮的玉米棒子，通风晾着，一冬天慢慢吃。' },
  firewood: { name: '柴火垛', about: '上山砍的柴劈好码整齐，烧炕做饭全靠它。码得齐不齐，看得出这家人勤不勤快。' },
  vat: { name: '水缸', about: '一早从井里挑水倒满，做饭洗衣用一天。冬天缸外裹一圈草帘子，防冻裂。' },
  well: { name: '水井', about: '全村吃水的老井，井台上架着辘轳。一早一晚挑水的人最多，顺便在这儿说说话。' },
  millstone: { name: '石磨', about: '两扇磨盘一上一下，毛驴蒙着眼拉着转。泡好的黄豆从磨眼里喂进去，磨出豆浆。' },
  roller: { name: '石碾子', about: '场院上的大碾子，老黄牛拉着一圈圈地转，把麦穗、谷穗里的粒碾下来。' },
  forge: { name: '打铁炉', about: '砖砌的炉子，风箱一拉火苗就窜起来。烧红的铁放在砧子上锤，锤好往水槽里一淬，"嗤"一声冒白汽。' },
  lumber: { name: '木料堆', about: '晾着的原木和板子。木头要晾上一两年才不裂不走形，木匠说"好木料是等出来的"。' },
  workbench: { name: '木工案子', about: '刨子、凿子、墨斗都在案子上。架马上架着待锯的木头。' },
  wheel: { name: '车轮', about: '修好或者新做的大车轮子，靠墙立着等人来取。' },
  cart: { name: '大车', about: '木头大车，车辕套上牲口能拉一车庄稼。秋收时各家轮着借。' },
  fence: { name: '栅栏', about: '木栅栏圈起来的地方，留了一道能推开的栅栏门。' },
  pigsty: { name: '猪圈', about: '矮砖墙围的圈，半边搭着棚子遮雨。猪养到年根儿，杀了过年。' },
  coop: { name: '鸡窝', about: '天黑鸡自己钻进去，第二天一早公鸡在窝顶上打鸣。' },
  stoneTable: { name: '石桌石凳', about: '大槐树底下的石桌，老人们天天在这儿下象棋，看棋的比下棋的还多。' },
  herbRacks: { name: '晒药架', about: '竹匾里晒着采回来的草药：柴胡、黄芩、连翘。周郎中说药材"三分采七分晒"。' },
  stage: { name: '戏台', about: '村口的戏台，逢年过节、有喜事就搭班子唱梆子戏，台下摆满板凳。' },
  firePit: { name: '火塘', about: '一圈石头围起来的火塘。晚上点起篝火，大伙儿围着烤火、听老郑讲古。' },
  seatStone: { name: '坐石', about: '火塘边当凳子坐的石头，坐得溜光。' },
  bench: { name: '石凳', about: '长条石凳，歇脚、看戏、听课都坐它。' },
  trough: { name: '食槽', about: '喂牲口的槽子，一倒上料，牲口就围过来。' },
  stove: { name: '灶台', about: '砌在棚下的大灶，一口大铁锅，磨好的豆浆在这儿煮开、点卤，冒着白汽。' },
  torch: { name: '火把', about: '路边插的火把，天黑点上，照亮回家的路；天亮了有人挨个掐灭。' },
  scarecrow: { name: '稻草人', about: '戴着破草帽、披着蓝布的稻草人，吓唬来偷吃谷子的麻雀——麻雀早就不怕了。' },
  beehive: { name: '蜂箱', about: '一摞木头蜂箱，黑口子是蜂进出的门。秋天割一回蜜。' },
  shed: { name: '牲口棚', about: '四根柱子撑一个单坡草顶的敞棚，里面有料槽，牲口在这儿吃草、过夜。' },
  hutch: { name: '兔笼', about: '木架上的笼子，前面一道铁丝网，孩子们每天去割草喂兔子。' },
  duckHouse: { name: '鸭棚', about: '土坯垒的矮棚子，鸭子鹅晚上关在里面。' },
  fieldHut: { name: '看青棚', about: '地头上的人字草棚。庄稼快熟的时候有人夜里睡这儿看着，防野猪也防人。' },
  cornRack: { name: '玉米架', about: '几根木杆搭的架子，挂满金黄的玉米串，秋天村里到处都是这个颜色。' },
  barberStand: { name: '剃头挑子', about: '一头是脸盆架和小火炉，一头是凳子和抽屉。"剃头挑子一头热"说的就是它。' },
  stall: { name: '摊子', about: '赶集那天支起来的摊子，平时收着。' },
  movieScreen: { name: '露天电影幕布', about: '放电影那晚在村口支起来的白幕布，全村老小搬着板凳来看。' },
  sheaf: { name: '庄稼捆', about: '割下来捆好的庄稼，立在地里晾干了再拉到场院。' },
  compost: { name: '粪堆', about: '牲口粪、烂菜叶、草木灰沤在一块儿，开春撒到地里，庄稼一枝花全靠它。' },
  shrine: { name: '土地庙', about: '桥头的小土地庙，供着土地爷爷和土地奶奶。初一十五有人来上香，求风调雨顺。' },
  stoneTablet: { name: '石敢当', about: '丁字路口立着的石碑，上刻"泰山石敢当"，据说能挡住直冲过来的邪气。' },
  bridge: { name: '石拱桥', about: '进村唯一的路，一座单孔石拱桥跨在溪上。桥下溪水清，鸭子鹅常在这儿游。' },
};

const ROLE_ABOUT = {
  正房: '院里坐北朝南的正房，一家之主住这儿。中间是堂屋，供着祖宗牌位、摆着八仙桌；两头是卧房，盘着连灶的土炕。',
  厢房: '正房两侧的厢房，住小辈，或者当灶房、粮仓、放农具的屋子。',
  屋子: '一明两暗的小屋：中间一间进门做饭，两边住人，炕连着灶，冬天烧一把火全屋都暖和。',
};
const WALL = { brick: '青砖墙', rubble: '毛石墙', adobe: '土坯墙', loess: '黄土墙', stone: '石墙' };
const ROOF = { gable: '瓦顶', flat: '平顶', shed: '单坡顶', thatch: '草顶' };
const GATE = { grand: '广亮大门', wall: '墙门', brush: '柴门', plank: '板门' };

/** 院子本身（打在院子地上、没碰到东西时）：没有住户的公共地方的介绍。 */
export const YARDS = {
  square: { kind: '村口空场', note: '进村过了桥就是村口：大槐树、戏台、火塘、石桌都在这儿。白天下棋、剃头，晚上唱戏、放电影、开村会。' },
  threshing: { kind: '打谷场', note: '全村共用的场院，地面压得又平又硬。秋收时各家轮着在这儿碾场、扬场、晒粮食。' },
};

/** 打标签：obj 可以是 Object3D 或 { object }。 */
export function tag(obj, thing, spec) {
  const o = obj?.isObject3D ? obj : obj?.object;
  if (o?.isObject3D) { o.userData.thing = thing; if (spec) o.userData.thingSpec = spec; }
  return obj;
}

/** 给一组建造函数（比如 props.js 整个模块）各包一层：建出来的东西自动标上函数名。 */
export const tagged = (ns) => Object.fromEntries(Object.entries(ns).map(([k, f]) => [k, typeof f === 'function' ? (...a) => tag(f(...a), k) : f]));

/**
 * 合批前收集。返回 [{ thing, spec, box（root 本地坐标）, obj, cid（院子 id）, role }]。
 * 房子按占地排：院里最大的叫正房，其余叫厢房（只有一间就叫屋子）。
 */
export function collectThings(root, C) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byObj = new Map(Object.entries(C).map(([id, c]) => [c.object, id]));
  const list = [];
  const visit = (o, cid) => {
    cid = byObj.get(o) ?? cid;
    if (o.userData.thing && THINGS[o.userData.thing]) {
      const box = solidBox(o).applyMatrix4(inv);
      if (!box.isEmpty()) list.push({ thing: o.userData.thing, spec: o.userData.thingSpec ?? {}, box, obj: o, cid });
    }
    for (const c of o.children) visit(c, cid);
  };
  visit(root, null);
  const houses = {};
  for (const t of list) if (t.thing === 'house') (houses[t.cid] ??= []).push(t);
  for (const hs of Object.values(houses)) {
    const area = (t) => (t.box.max.x - t.box.min.x) * (t.box.max.z - t.box.min.z);
    hs.sort((a, b) => area(b) - area(a));
    hs.forEach((t, i) => { t.role = hs.length === 1 ? '屋子' : i === 0 ? '正房' : '厢房'; });
  }
  return list;
}

/** 只算实心的网格（火光、光晕这类透明的片和精灵不算，不然点火把旁边的地面也会选中火把）。 */
function solidBox(o) {
  const box = new THREE.Box3(), b = new THREE.Box3();
  o.traverse((m) => {
    if (!m.isMesh || m.isSprite || [m.material].flat().some((x) => x?.transparent || x?.blending === THREE.AdditiveBlending)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
  });
  return box;
}

const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

/** 包住 p（root 本地坐标）的最小的物件；没有就 null。 */
export function pickThing(list, p) {
  let best = null, bestV = Infinity;
  const pad = 0.12;
  for (const t of list) {
    const b = t.box;
    if (p.x < b.min.x - pad || p.x > b.max.x + pad || p.y < b.min.y - pad || p.y > b.max.y + pad || p.z < b.min.z - pad || p.z > b.max.z + pad) continue;
    if (!shown(t.obj)) continue;
    const v = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
    if (v < bestV) { bestV = v; best = t; }
  }
  return best;
}

/** 卡片上的标题和标签（不含"此刻"）。 */
export function describe(t, place) {
  const base = THINGS[t.thing];
  if (t.thing === 'house') {
    const s = t.spec;
    return { name: `${place ?? ''}${t.role ?? '屋子'}`, tags: [WALL[s.wall] ?? '青砖墙', ROOF[s.roof] ?? '瓦顶', s.porch ? '带前廊' : null, s.chimney ? '有烟囱' : null].filter(Boolean), about: ROLE_ABOUT[t.role] ?? ROLE_ABOUT.屋子 };
  }
  if (t.thing === 'gate') return { name: `${place ?? ''}${GATE[t.spec.type] ?? '院门'}`, tags: [], about: t.spec.type === 'grand' ? '门楼缩在墙里，门前有台阶，门扇上一对铜门环——村里只有体面人家才盖得起。' : t.spec.type === 'brush' ? '树枝扎的柴门，一推就开，牲口也拱得开。' : '两扇木门，白天虚掩着，晚上插上门闩。' };
  return { name: base.name, tags: place ? [place] : [], about: base.about };
}
