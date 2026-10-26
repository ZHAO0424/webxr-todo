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
  peddlerCart: { name: '货郎车', about: '赶集那天货郎钱小二推来的小车：两只大木轮，车上摆着针线、头绳、布头和糖块，篷檐下挂着草帽、小筐，平日他挑着货郎担走村串户。' },
  movieScreen: { name: '露天电影幕布', about: '放映之夜在村口支起的白色幕布，全村老少搬来板凳围坐观看。' },
  sheaf: { name: '庄稼捆', about: '割下捆好的庄稼，立在地里晾干后再运往场院。' },
  compost: { name: '粪堆', about: '牲口粪、烂菜叶与草木灰一同沤制的肥堆，开春撒进田里，是庄稼的好肥料。' },
  shrine: { name: '土地庙', about: '桥头的小土地庙，供奉土地公与土地婆。每逢初一、十五有人上香，祈求风调雨顺。' },
  stoneTablet: { name: '石敢当', about: '立在丁字路口的石碑，刻着"泰山石敢当"，相传能挡住迎面冲来的邪祟。' },
  woodBench: { name: '木条凳', about: '村口摆的几排木条凳，对着戏台。平时坐着歇脚、看戏；赶集那天摆摊人多，就两条一摞搬到场子东边，腾出地方。' },
  dryingMat: { name: '晒席', about: '场子边、场院上摊开的苇席：夏天晒麦粒，秋天晒玉米、谷子、红辣椒，隔一阵有人拿木耙翻一翻。' },
  grainHeap: { name: '粮堆', about: '碾过、扬净的粮食先在场院上堆成一堆，插着木锨，晒干了再装袋进仓。' },
  sacks: { name: '粮袋', about: '扎了口的布口袋：夏秋装新打的粮食，等着扛回家进仓；春天是留下的种子。' },
  winnower: { name: '簸箕', about: '柳条编的簸箕，扬场、簸粮食，把秕子和土簸出去。' },
  graves: { name: '祖坟', about: '村西坡上的一排坟头，立着小石碑。清明这天各家来添土、压纸、烧纸钱，给先人磕头。' },
  moonOffering: { name: '拜月供桌', about: '中秋夜在石桌上摆供：一摞月饼、一盘苹果石榴、一个切成莲花瓣的西瓜，再点一炉香。月亮升起来，由村里最年长的人领着拜月。' },
  zongziPlate: { name: '粽子', about: '端午前一晚泡好苇叶，第二天一早在村口包粽子：江米里裹上红枣，包成三角，用马莲草扎紧。' },
  snowman: { name: '雪人', about: '孩子们趁着雪后堆起的雪人：煤球做眼睛、胡萝卜当鼻子，脖子上围一条红布，头上扣一只破簸箕。' },
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
  // 老村址（east.js）
  ruin: { name: '老宅', about: '' },
  riverTemple: { name: '河神庙', about: '黄土坎沿上一间小砖庙，红门灰瓦，供着河神爷。大水以后修的，庙门正对着那条冲出来的旧河道。柳婆婆每天一早来上香、扫地。' },
  floodStele: { name: '水则碑', about: '庙前的一块石碑，碑身上一道红漆横线，是大水那年水漫到的高度——比人还高出一头。碑上刻着那年的年月和"后人勿忘"四个字。' },
  stonePile: { name: '条石', about: '葛石头从东山上采下来、一块块凿方的条石，码在院里。修堤、砌墙基、盖房子都要用。' },
  millstoneBlank: { name: '没打完的磨盘', about: '葛石头正在凿的一扇石磨盘，磨齿才錾了一半。豆腐坊、水磨坊的磨盘磨平了，都找他来錾。' },
  limeKiln: { name: '石灰窑', about: '毛石砌的一座圆窑，青石和柴火一层层码进去，烧上三天三夜，出来就是白花花的石灰。抹墙、勾缝、刷屋子都离不了它。' },
  limePile: { name: '石灰', about: '刚出窑的生石灰，堆成一堆，见了水就冒热气。白老灰说：修房子，三分砖瓦七分灰。' },
  oldStage: { name: '老戏台台基', about: '老石峪的戏台，大水那年被冲倒了，只剩一座毛石台基和一根烧黑的柱子茬。老郑小时候就在这台下看戏。' },
  oldBridge: { name: '冲歪的老石桥', about: '原先过溪的石桥，桥面被大水冲走了，只剩两个桥墩歪在水里。如今搭着一根独木，胆大的孩子才敢走。' },
  driftwood: { name: '漂木堆', about: '水生从河里捞上来的漂木，码在河滩上晒干，劈了当柴卖。发一回水，上游就冲下来一回。' },
  coalMine: { name: '煤窑口', about: '东北角青石崖脚凿进去的大窑口，一人多高。三道木头撑子一道比一道往里，最外面那道横梁上挂着红布和两盏马灯，往里黑洞洞的看不见底。一对铁轨从洞里伸出来，挖煤的把煤装上斗车推出来，倒在洞口东边的煤堆上；烧炭的也来这儿背煤引窑火。' },
  coalHeap: { name: '煤堆', about: '刚从窑里推出来的煤，黑亮黑亮的。冬天村里烧炕、烤火，好些人家来这儿背煤。' },
  mineCart: { name: '斗车', about: '在小铁轨上跑的木斗车，一车能装两三百斤煤。' },
  mountainGate: { name: '进山口', about: '一座石头牌坊，两根石柱一道石梁，梁上挂着块匾。从这儿往北，一条石阶钻进又高又密的老林子，采山货、打猎的人都从这儿上山。旁边的界碑上刻着"山林公有，勿伐幼树"。' },
  smallDam: { name: '小石坝', about: '小溪进湖的口子上一道矮石坝：一排条石，中间留着几道过水的口子，溪水漫过来跌进湖里，哗哗地响。坝上头的水深一点，苗家的鸭子爱在这儿扎猛子。' },
  lakeSteps: { name: '石头码头', about: '湖边砌的几级石台阶，一直下到水里。早上村里的媳妇在这儿捶衣裳、挑水，傍晚钓鱼的人坐在最下面一级。' },
  gatherPoint: { name: '山货场', about: '进山口下面一块场子：晾山货的木架上挂着蘑菇、山楂、核桃，地上摊着竹匾；一堆从山上拖下来的原木、破板子的木架、劈柴的木墩，一辆拉木头的车，一排背篓和背架。上山的人从这儿背上家什进林子，逢集骡帮来收山货。' },
  trialField: { name: '培育田', about: '一溜五畦试验田：谷子、玉米、高粱、麦子，一畦一样，畦头插着木牌，写着是什么种、哪天种的、长得怎样。农技员在这儿挑穗大粒饱的留种。' },
  apiary: { name: '蜂场', about: '向阳坡上摆着两排蜂箱，四周一圈野花。养蜂的人戴着纱帽、拿着熏烟罐开箱割蜜，蜂蜜骡帮最爱收。' },
  lake: { name: '湖', about: '坡下一口塘，冲沟里下雨时的水都流到这儿，南边一道沟流进小溪。塘边柳树、竹子，女人们蹲在塘边的石头上洗衣裳，钓鱼的爱坐在柳树底下。' },
  oldThresh: { name: '场院', about: '老街南边一块轧平的场院。秋天各家把谷子、高粱拉来晒，碌碡一圈圈地轧，扬场的簸箕一扬，谷糠随风飘走；场边码着两座谷草垛。' },
  oldGraves: { name: '祖坟', about: '林子边上老石峪各家的祖坟，几个坟头、一块石碑。清明各家从下游上来烧纸、添土。' },
  veggie: { name: '菜园子', about: '院边篱笆围起来的一小块菜地，一畦畦白菜、萝卜，地头插个稻草人赶鸟。' },
  earthBridge: { name: '土拱桥', about: '老街从冲沟上过的地方：沟里垫起一道土埂，两面砌着黄土拱券，看着像一座拱桥。桥栏是一道矮土墙，站在桥上往下看，沟底的柳树梢才到脚下。' },
  ancestralRuin: { name: '老祠堂遗址', about: '老石峪原先的祠堂，大水以后各家把牌位请到了下游王家祠堂，这里只剩一座石头台基、两排柱础和半截石碑，台基缝里长满了蒿草。' },
  eastFall: { name: '崖口瀑布', about: '东北角青石崖顶上一道山溪，从十来米高的崖口直跌下来，落进崖脚的深潭，水声老远就听得见。潭水再顺着台地一级级跌下去，流进坡下的大湖。挖煤的歇晌就坐在潭边洗脸。' },
  oldShrine: { name: '老土地庙', about: '老村址路口的小土地庙，比村口那座还老。大水冲歪了半边，柳婆婆逢初一十五也来上一炷香。' },
  oldTablet: { name: '石敢当', about: '老街路口立的石敢当，顶上那抹红漆早褪了。' },
  oldWillow: { name: '歪脖子老柳', about: '河滩上的一棵老柳树，大水里硬是没倒，只是从此歪着脖子。树干上一人多高的地方有一道刻痕，是柳婆婆的男人当年刻的水印。' },
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
  if (t.spec?.name) return { name: t.spec.name, tags: t.spec.tags ?? [], about: t.spec.about ?? base.about }; // 自己带着名字和介绍的（老村址的老宅、原住户的家）
  if (t.thing === 'house') {
    const s = t.spec;
    return { name: `${place ?? ''}${t.role ?? '屋子'}`, tags: [WALL[s.wall] ?? '青砖墙', ROOF[s.roof] ?? '瓦顶', s.porch ? '带前廊' : null, s.chimney ? '有烟囱' : null].filter(Boolean), about: ROLE_ABOUT[t.role] ?? ROLE_ABOUT.屋子 };
  }
  if (t.thing === 'gate') return { name: `${place ?? ''}${GATE[t.spec.type] ?? '院门'}`, tags: [], about: t.spec.type === 'grand' ? '门楼退入墙内，门前设台阶，门扇上一对铜门环——村中只有殷实人家才建得起。' : t.spec.type === 'brush' ? '树枝编成的柴门，轻轻一推即开，牲口也能拱开。' : '两扇木门，白天虚掩，入夜插上门闩。' };
  return { name: base.name, tags: place ? [place] : [], about: base.about };
}
