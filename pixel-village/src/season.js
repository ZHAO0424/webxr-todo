import { R } from './palette.js';

/*
 * 四季：春（三月，返青、播种、开花）、夏（六月，麦收、蝉鸣、萤火虫）、秋（九月，原来的样子：秋收、晒秋）、冬（腊月，下雪、贴对联挂灯笼）。
 *
 * 季节在建场景之前定（?season=spring|summer|autumn|winter，默认秋），整局不变；换季节 = 带着新参数重新加载页面。
 * 建场景时各处按季节取不同的东西：
 *   - 调色：草、树叶的色阶在这里按季节改写（贴图、体素都从 palette.js 的 R 取色，改了就全跟着变）
 *   - 贴图：地皮、屋顶、水面换成季节版（textures.js 的 SEASON_TILES）
 *   - 树：冬天落叶树只剩枝条、常绿树顶上积雪；春天开花；夏天一片绿（voxel.js 的 voxelTree）
 *   - 庄稼：春天是苗、夏天青纱帐和成熟的麦子、秋天是熟庄稼、冬天地里只有雪（farmland.js）
 *   - 道具：晒秋的玉米串、稻草人、看青棚只在夏秋；冬天各家门口贴对联、挂灯笼，院里堆雪人
 *   - 生活：农历月份、节庆（打场只在夏秋）、天气（冬天的"雨"是雪）、各人日程里的农活（life/variety.js）
 */

export const SEASONS = {
  spring: { name: '春', month: 3 },
  summer: { name: '夏', month: 6 },
  autumn: { name: '秋', month: 9 },
  winter: { name: '冬', month: 12 },
};
export const ORDER = ['spring', 'summer', 'autumn', 'winter'];

// 每个季节一个大节日：场景就从过节那天开始（第 1 天），节日的装饰整个季节都在
//   春·清明（三月初五）：家家门上插柳，上坟扫墓，孩子放风筝
//   夏·端午（五月初五）：门上挂艾草，村口包粽子
//   秋·中秋（八月十五）：村口石桌上摆月饼瓜果拜月，晚上赏月，孩子提灯笼；天上一轮大圆月
//   冬·春节（正月初一）：对联、红灯笼、福字、门口一地鞭炮碎屑，天亮放鞭炮，上午穿新衣挨家拜年
export const FESTIVALS = {
  spring: { key: 'qingming', name: '清明', m: 3, d: 5 },
  summer: { key: 'duanwu', name: '端午', m: 5, d: 5 },
  autumn: { key: 'zhongqiu', name: '中秋', m: 8, d: 15 },
  winter: { key: 'chunjie', name: '春节', m: 1, d: 1 },
};

let cur = 'autumn';
export const festival = () => FESTIVALS[cur];
export const season = () => cur;
export const is = (...list) => list.includes(cur);

// 原来（秋天）的色阶：换季时从这里改写，换回来能还原
const BASE = { grass: [...R.grass], leaf: [...R.leaf] };
const RAMPS = {
  spring: {
    grass: ['#1c2e30', '#2a4a36', '#3e6e3e', '#5e9448', '#94bc5e'], // 返青的嫩草
    leaf: ['#1c3436', '#2a5040', '#447a44', '#6ea650', '#a8d070'], // 新叶：嫩绿
  },
  summer: {
    grass: ['#162a2c', '#22422e', '#345e36', '#4e7c3e', '#7aa04a'], // 盛夏：深绿
    leaf: ['#122a30', '#1a3e36', '#28583a', '#3e7640', '#62964a'],
  },
  autumn: BASE,
  winter: {
    grass: ['#2a2430', '#4a4040', '#6e6250', '#948466', '#b8a680'], // 枯草（雪没盖住的地方）
    leaf: BASE.leaf,
  },
};

// 雪：阴影偏蓝紫、亮面偏暖白（夕阳照着）
R.snow = ['#4e5476', '#7a84a8', '#aab4d0', '#d4dcec', '#f6f4f2'];
R.ice = ['#3a4a6e', '#5e7a9e', '#8eaec8', '#bcd2e0', '#e2eef2'];
R.blossom = ['#7e3a5a', '#c06a86', '#e89cac', '#f8c8cc', '#fff0ee']; // 杏花、桃花

/** 定季节（建场景之前调用一次）。 */
export function setSeason(s) {
  cur = SEASONS[s] ? s : 'autumn';
  for (const k of ['grass', 'leaf']) R[k].splice(0, R[k].length, ...RAMPS[cur][k]);
  return cur;
}
