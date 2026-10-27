/*
 * 公用词的英文：按中文原词查（找不到就原样显示——比如玩家自己填的中文）。word('力气大') → 'Strong'（见 names.js）。
 * 分几份写（翻译时各管各的，不互相改）：people 会什么、性格、亲属称呼；world 地名、地方、动物；econ 货物、营生分类；ui 界面杂项。
 */
import people from './words-people.js';
import world from './words-world.js';
import econ from './words-econ.js';
import ui from './words-ui.js';
export const EN_WORDS = { ...ui, ...econ, ...world, ...people };
