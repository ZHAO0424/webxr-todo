// 山村总平面（单位米）。+x 东，+z 南（朝向观察者）。
//
// 地形北高南低，东西两侧是山梁；南边一条小溪自东向西弯过去，溪上一座石拱桥是进村的路。
// 院子沿等高线摆，各自转一点角度，挖平台嵌进坡里；路是弯的，爬坡处自动变成石台阶。
//
//                 北（高处）
//        羊倌      陈家     吴家       学堂
//          木匠        村长四合院        药铺
//              铁匠  豆腐坊   杂货铺       杨家
//                    村口戏台    场院
//       ～～～～～～～～小溪～～石拱桥～～～～～～～
//                 南（低处，进村）

export const BOUNDS = { x0: -45, x1: 45, z0: -36, z1: 36 };

/** 小溪中心线（z 随 x 弯曲）和半宽。 */
export const streamZ = (x) => 30 + 2.5 * Math.sin(x * 0.09 + 0.6);
export const STREAM_HALF = 1.6;
export const WATER_Y = -0.9;

/** 院落：id 对应 compounds.js 里的建造函数和 residents.js 里的户；x/z 是平台中心，rot 是转角（度）。 */
export const PLACEMENTS = [
  { id: 'square', x: 4, z: 19.5, rot: -4 },
  { id: 'threshing', x: 24, z: 25.5, rot: 6 },
  { id: 'headman', x: -2, z: -12, rot: 3 },
  { id: 'school', x: 19, z: -22.3, rot: -7 },
  { id: 'smith', x: -22, z: 14, rot: 8 },
  { id: 'tofu', x: -6, z: 5, rot: -4 },
  { id: 'store', x: 12, z: 4.5, rot: 5 },
  { id: 'doctor', x: 29, z: -7.5, rot: -10 },
  { id: 'carpenter', x: -26, z: -2, rot: 10 },
  { id: 'shepherd', x: -32, z: -24, rot: 12 },
  { id: 'farmA', x: -15, z: -27, rot: 5 },
  { id: 'farmB', x: 30, z: 12, rot: -12 },
  { id: 'farmC', x: 0, z: -30, rot: -3 },
];

/** 路网上不属于任何院子的点（院门口的点由院落自动生成，名字是 gate:院落id）。 */
export const NODES = {
  edgeS: { x: -1, z: 35.6 },
  bridgeS: { x: 0.5, z: 34.2 },
  bridgeN: { x: 0.8, z: 28.3 },
  sqW: { x: -6.8, z: 22 },
  sqNW: { x: -6.8, z: 11.6 },
  mid: { x: 2.9, z: 11.4 },
  well: { x: 2.9, z: -1.7 },
  e1: { x: 9.6, z: -2.6 },
  e2: { x: 21.0, z: -2.4 },
  e3: { x: 35.6, z: 1.6 },
  sqE: { x: 16.2, z: 22.0 },
  L1: { x: 9.6, z: -12.6 },
  L2: { x: 9.4, z: -24.2 },
  w1: { x: -14, z: -1.7 },
  cw: { x: -16, z: 5.8 },
  nw: { x: -14, z: -12.5 },
  east: { x: 21, z: 20 },
  fieldW: { x: -39, z: 8 },
  fieldE: { x: 40, z: -3 },
  westGate: { x: -44.7, z: 8 }, // 村西口：路翻过山梁接到西沟（west.js 的 east 节点就在接缝另一边）
  westCliff: { x: -44.7, z: -21.5 }, // 羊圈西边：接西沟的挂壁古道东头（骡帮从这儿进村，羊倌从这儿赶羊上崖顶）
  shepS: { x: -37.5, z: -13 }, shepW: { x: -43.2, z: -15 }, // 从羊圈院门绕到院子西南角，再上去接古道
};

/** 路（两端是节点名）。 */
export const EDGES = [
  ['edgeS', 'bridgeS'], ['bridgeS', 'bridgeN'], ['bridgeN', 'gate:square'],
  ['gate:square', 'sqW'], ['gate:threshing', 'sqE'], ['sqE', 'east'], ['gate:square', 'gate:threshing'], ['east', 'gate:farmB'],
  ['sqW', 'gate:smith'], ['sqW', 'sqNW'], ['sqNW', 'gate:tofu'], ['sqNW', 'mid'], ['mid', 'gate:tofu'], ['mid', 'gate:store'],
  ['mid', 'well'], ['well', 'gate:headman'], ['well', 'w1'], ['well', 'e1'],
  ['e1', 'e2'], ['e2', 'gate:doctor'], ['e1', 'L1'], ['L1', 'gate:school'], ['L1', 'L2'], ['L2', 'gate:farmC'],
  ['w1', 'cw'], ['cw', 'gate:carpenter'], ['w1', 'nw'], ['nw', 'gate:farmA'], ['nw', 'gate:shepherd'],
  ['gate:carpenter', 'fieldW'], ['gate:doctor', 'e3'], ['e3', 'fieldE'], ['fieldW', 'westGate'], ['gate:shepherd', 'shepS'], ['shepS', 'shepW'], ['shepW', 'westCliff'],
];

/** 豆腐坊自家的大豆地：村西坡最高那几级梯田贴着沙盘西边的一溜。 */
export const SOY = { x0: -45, x1: -41.5, z0: 9.5, z1: 22 };
export const inSoy = (x, z) => x >= SOY.x0 && x < SOY.x1 && z >= SOY.z0 && z < SOY.z1;

/** 井在正街路口旁。 */
export const WELL = { x: 0.8, z: -1.9 };
