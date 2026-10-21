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
  screenWall: { name: '影壁', about: '正对大门的一堵砖墙，挡住外人望向院内的视线。墙心刷白，年节时贴一个"福"字。' },
  haystack: { name: '麦秸垛', about: '打麦后剩下的秸秆堆成圆垛，顶上抹泥防雨。冬日喂牲口、生火、和泥都取自这里。' },
  cornCrib: { name: '玉米囤', about: '秸秆编成的圆囤，盛满剥净的玉米棒，通风晾干，供一冬食用。' },
  firewood: { name: '柴火垛', about: '山上砍来的柴劈好码齐，烧炕做饭全仗它。柴垛是否整齐，最能看出一户人家是否勤快。' },
  vat: { name: '水缸', about: '每日清晨从井里挑满，一天的饮水、做饭、洗涤都从这里取。入冬后外裹草帘，以防冻裂。' },
  well: { name: '水井', about: '全村共用的老井，井台上架着辘轳。早晚挑水的人最多，也是村里交换消息的地方。' },
  millstone: { name: '石磨', about: '上下两扇磨盘，毛驴蒙眼拉动。泡好的黄豆从磨眼喂入，磨出的豆浆顺着磨槽流下。' },
  roller: { name: '石碾子', about: '场院中央的石碾，黄牛拉着一圈圈碾过麦穗与谷穗，把粮粒压出来。' },
  forge: { name: '打铁炉', about: '砖砌的炉膛，风箱一推火苗便蹿起。烧红的铁料在砧上锤打成形，再入水淬火，腾起一团白汽。' },
  lumber: { name: '木料堆', about: '晾晒中的原木与板材。木料需晾足一两年才不开裂、不变形。' },
  workbench: { name: '木工案子', about: '刨子、凿子、墨斗齐备的木工台，架马上搁着待锯的木料。' },
  wheel: { name: '车轮', about: '新做或修好的大车轮，靠墙立着，等主顾来取。' },
  cart: { name: '大车', about: '木制大车，套上牲口能拉满满一车庄稼。秋收时各家轮流借用。' },
  fence: { name: '栅栏', about: '木栅栏围起的圈，留有一扇可推开的栅栏门。' },
  pigsty: { name: '猪圈', about: '矮砖墙围成的猪圈，半边搭棚遮雨。猪养到年底，正好备作年货。' },
  coop: { name: '鸡窝', about: '天黑后鸡群自行归窝。次日清晨，公鸡站上窝顶报晓。' },
  stoneTable: { name: '石桌石凳', about: '大槐树下的石桌石凳。老人们每日在此对弈，围观的人往往比下棋的还多。' },
  herbRacks: { name: '晒药架', about: '竹匾里晾着采回的草药：柴胡、黄芩、连翘。周郎中常说，药材"三分采，七分晒"。' },
  stage: { name: '戏台', about: '村口的戏台。逢年过节或有喜事，便请戏班登台唱梆子，台下摆满长凳。' },
  firePit: { name: '火塘', about: '石块围成的火塘。夜晚燃起篝火，村民围坐取暖，听老郑讲古。' },
  seatStone: { name: '坐石', about: '火塘边当作坐凳的石块，经年累月被磨得光滑。' },
  bench: { name: '石凳', about: '条石长凳，歇脚、看戏、听课都坐在这里。' },
  trough: { name: '食槽', about: '喂牲口的料槽，草料一倒进去，牲口便围拢过来。' },
  stove: { name: '灶台', about: '棚下砌起的大灶，架一口大铁锅。磨好的豆浆在这里煮沸、点卤，热气终日不散。' },
  torch: { name: '火把', about: '插在路口的火把，入夜点亮，为晚归的人照路，天明时逐一熄灭。' },
  scarecrow: { name: '稻草人', about: '头戴破草帽、身披蓝布的稻草人，用来驱赶偷食谷子的麻雀——不过麻雀早已见怪不怪。' },
  beehive: { name: '蜂箱', about: '一摞木制蜂箱，黑色的小口是蜜蜂的出入口。每年秋天取一次蜜。' },
  shed: { name: '牲口棚', about: '四根立柱撑起单坡草顶的敞棚，内设料槽，是牲口吃草、过夜的地方。' },
  hutch: { name: '兔笼', about: '木架上的兔笼，正面一道铁丝网。孩子们每天割草来喂。' },
  duckHouse: { name: '鸭棚', about: '土坯垒成的矮棚，夜里鸭和鹅都关在里面。' },
  fieldHut: { name: '看青棚', about: '地头的人字形草棚。庄稼将熟时有人夜宿于此看守，防野猪，也防偷盗。' },
  cornRack: { name: '玉米架', about: '木杆搭成的架子，挂满金黄的玉米串，是秋日村里最常见的颜色。' },
  barberStand: { name: '剃头挑子', about: '一头是脸盆架与小火炉，一头是坐凳与抽屉。俗语"剃头挑子一头热"说的正是它。' },
  stall: { name: '摊子', about: '集市上临时支起的摊位，平日收起。' },
  movieScreen: { name: '露天电影幕布', about: '放映之夜在村口支起的白色幕布，全村老少搬来板凳围坐观看。' },
  sheaf: { name: '庄稼捆', about: '割下捆好的庄稼，立在地里晾干后再运往场院。' },
  compost: { name: '粪堆', about: '牲口粪、烂菜叶与草木灰一同沤制的肥堆，开春撒进田里，是庄稼的好肥料。' },
  shrine: { name: '土地庙', about: '桥头的小土地庙，供奉土地公与土地婆。每逢初一、十五有人上香，祈求风调雨顺。' },
  stoneTablet: { name: '石敢当', about: '立在丁字路口的石碑，刻着"泰山石敢当"，相传能挡住迎面冲来的邪祟。' },
  bridge: { name: '石拱桥', about: '进村的唯一通路，一座单孔石拱桥横跨溪上。桥下溪水清浅，常有鸭鹅游过。' },
  // 西沟
  watermill: { name: '水磨坊', about: '小溪北岸的木板房，苫着草顶：上游垒了一道拦河石坝，水从坝上跌下来，推着坝下的大水轮转，屋里的石磨就跟着磨面。东边土坯厢房的平顶上晒满柿饼和山楂片，檐下挂着柿子串、辣椒串，院里靠着几扇换下来的旧磨盘。' },
  logPile: { name: '原木垛', about: '截齐的原木码成三层，底下三根、上头一根，两头钉着木桩挡着。晾上一冬，开春拖去木匠铺做梁做檩。' },
  stump: { name: '树桩', about: '砍柴、伐木留下的树桩，截面上一圈圈年轮还看得清。' },
  log: { name: '原木', about: '刚放倒的一根原木，枝杈还没削干净，等着拖回村里的木匠铺。' },
  weir: { name: '拦河石坝', about: '毛石垒的一道矮坝，把溪水拦高一截，水从坝顶漫过去跌下来，正好冲着水磨坊的水轮。' },
  waterfall: { name: '红石崖瀑布', about: '后山的泉水流到崖边，从二十来米高的红石崖上直落下来，砸进崖脚的深潭；潭水再顺着山沟一级级跌下去，汇进南边的小溪。' },
  cliffRoad: { name: '挂壁古道', about: '在半山腰的崖壁里一锤一钎凿出来的路，中间一段钻进石头里，外侧留着一排窗洞透光。骡帮驮着山货从这里进出，是西沟通往山外的近路。' },
  mountainTemple: { name: '山神庙', about: '半崖上凿进去一个深龛，一间木头小庙整个缩在里面：红柱前廊、灰瓦顶、檐角往上翘。门前一截木栈台挑出崖面，悬在古道上方，西头挂着一口钟。供着山神爷，进山砍柴、采药的人从古道边的石阶爬上去拜一拜。' },
  slabBridge: { name: '石板桥', about: '几块青石板搭在山溪上，两头垒着石墩，挑着担子也走得过去。' },
};

const ROLE_ABOUT = {
  正房: '院中坐北朝南的正房，由一家之主居住。中间为堂屋，供奉祖先牌位、摆放八仙桌；两侧是卧房，土炕与灶台相连。',
  厢房: '正房两侧的厢房，供晚辈居住，也用作灶房、粮仓或农具房。',
  屋子: '一明两暗的小屋：居中一间兼作灶房，两侧住人。炕与灶相连，冬日烧一把火，满屋皆暖。',
};
const WALL = { brick: '青砖墙', rubble: '毛石墙', adobe: '土坯墙', loess: '黄土墙', stone: '石墙' };
const ROOF = { gable: '瓦顶', flat: '平顶', shed: '单坡顶', thatch: '草顶' };
const GATE = { grand: '广亮大门', wall: '墙门', brush: '柴门', plank: '板门' };

/** 院子本身（打在院子地上、没碰到东西时）：没有住户的公共地方的介绍。 */
export const YARDS = {
  square: { kind: '村口空场', note: '过了石桥便是村口：大槐树、戏台、火塘与石桌都在这里。白天有人对弈、剃头，夜晚则唱戏、放电影、开村会。' },
  threshing: { kind: '打谷场', note: '全村共用的场院，地面夯得平整坚实。秋收时各家轮流在此碾场、扬场、晾晒粮食。' },
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
  if (t.thing === 'gate') return { name: `${place ?? ''}${GATE[t.spec.type] ?? '院门'}`, tags: [], about: t.spec.type === 'grand' ? '门楼退入墙内，门前设台阶，门扇上一对铜门环——村中只有殷实人家才建得起。' : t.spec.type === 'brush' ? '树枝编成的柴门，轻轻一推即开，牲口也能拱开。' : '两扇木门，白天虚掩，入夜插上门闩。' };
  return { name: base.name, tags: place ? [place] : [], about: base.about };
}
