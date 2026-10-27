/*
 * 新居民能填什么、每一样有哪些选项（「创建居民」面板和后台收新人 tools/intake.mjs 用同一份）。
 * 选项写成 [值, 中文名, 英文名]。后台收到的提交只认这里列出来的值，别的一概丢掉（提交是从网页外面来的，不能信）。
 */
import { BUILDS, HAIRS } from './characters.js';
import { RESIDENTS } from './residents.js';

const HAIR_EN = { short: 'Short', crew: 'Crew cut', part: 'Side part', shaved: 'Shaved', queue: 'Long queue', bun: 'Bun', topknot: 'Topknot', twinbuns: 'Twin buns', braids: 'Two braids', ponytail: 'Ponytail', fringe: 'Fringe', long: 'Long loose' };
const BUILD_EN = { stout: 'Burly', thin: 'Wiry', tall: 'Tall', short: 'Stocky', fat: 'Portly', slim: 'Slender', petite: 'Petite', broad: 'Broad', bent: 'Stooped' };
export const COLORS = [['indigo', '靛蓝', 'Indigo'], ['teal', '青', 'Teal'], ['blue', '蓝', 'Blue'], ['black', '黑', 'Black'], ['grey', '灰', 'Grey'], ['white', '月白', 'Pale'], ['brown', '褐', 'Brown'], ['khaki', '土黄', 'Khaki'], ['mud', '赭', 'Ochre'], ['gold', '杏黄', 'Apricot'], ['russet', '红褐', 'Russet'], ['redwood', '枣红', 'Maroon'], ['red', '红', 'Red'], ['pink', '粉', 'Pink'], ['plum', '藕荷', 'Mauve'], ['cabbage', '豆绿', 'Pea green'], ['green', '墨绿', 'Dark green']];
/** 捏人的各类选项：key 字段，name 中文、en 英文，show 选项怎么画（swatch 色块，head / body / full / legs 缩略图截哪一段）。 */
export const PARTS = [
  { key: 'build', name: '身材', en: 'Build', show: 'full', list: [['', '匀称', 'Average'], ...Object.entries(BUILDS).map(([k, b]) => [k, b.name, BUILD_EN[k] ?? k])] },
  { key: 'hair', name: '发型', en: 'Hair', show: 'head', list: Object.entries(HAIRS).map(([k, n]) => [k, n, HAIR_EN[k] ?? k]) },
  { key: 'hairRamp', name: '发色', en: 'Hair colour', show: 'swatch', list: [['hair', '乌黑', 'Black'], ['brown', '棕黑', 'Dark brown'], ['khaki', '焦黄', 'Sandy'], ['grey', '花白', 'Greying'], ['white', '银白', 'Silver']] },
  { key: 'hat', name: '帽子', en: 'Hat', show: 'head', list: [['', '不戴', 'None'], ['skullcap', '瓜皮帽', 'Skullcap'], ['towel', '羊肚手巾', 'Head towel'], ['felt', '毡帽', 'Felt hat'], ['scarf', '头巾', 'Headscarf'], ['straw', '草帽', 'Straw hat'], ['furcap', '棉帽', 'Padded cap'], ['douli', '斗笠', 'Bamboo hat'], ['veil', '蜂纱帽', 'Bee veil']] },
  { key: 'style', name: '样式', en: 'Style', show: 'full', list: [['', '短褂', 'Short jacket'], ['side', '大襟', 'Side-fasten'], ['vest', '坎肩', 'Vest'], ['cotton', '棉袄', 'Padded coat'], ['zhongshan', '中山装', 'Mao suit'], ['overalls', '背带裤', 'Overalls'], ['singlet', '白背心', 'Singlet'], ['doudou', '红肚兜', 'Red bib'], ['gown', '长衫', 'Long gown'], ['magua', '长衫马褂', 'Gown & jacket'], ['sheepskin', '羊皮袄', 'Sheepskin'], ['army', '军大衣', 'Army coat'], ['cape', '斗篷', 'Cape'], ['opera', '戏袍', 'Opera robe']] },
  { key: 'top', name: '衣裳', en: 'Top', show: 'swatch', list: COLORS },
  { key: 'pattern', name: '花样', en: 'Pattern', show: 'body', list: [['', '素面', 'Plain'], ['floral', '碎花', 'Floral'], ['plaid', '格子', 'Plaid'], ['stripe', '条纹', 'Stripes'], ['patch', '补丁', 'Patched'], ['trim', '镶边', 'Trimmed']] },
  { key: 'pants', name: '裤子', en: 'Trousers', show: 'swatch', list: COLORS.filter(([c]) => !['pink', 'red', 'white'].includes(c)) },
  { key: 'skin', name: '肤色', en: 'Skin', show: 'swatch', list: [['skin', '白净', 'Fair'], ['skinTan', '黝黑', 'Tanned']] },
  { key: 'face', name: '脸面', en: 'Face', show: 'head', list: [['', '平常', 'Plain'], ['beard', '山羊胡', 'Goatee'], ['mustache', '八字胡', 'Moustache'], ['blush', '红脸蛋', 'Rosy cheeks'], ['smile', '笑模样', 'Smiling']] },
  { key: 'legwrap', name: '绑腿', en: 'Leg wraps', show: 'legs', list: [['', '不打', 'None'], ['1', '打绑腿', 'Leg wraps']] },
  { key: 'extra', name: '配饰', en: 'Extras', show: 'body', list: [['', '不戴', 'None'], ['apron:indigo', '围裙', 'Apron'], ['sash:red', '红腰带', 'Red sash'], ['acc:dalian', '褡裢', 'Saddlebag'], ['acc:satchel', '军挎包', 'Army satchel'], ['acc:scarf', '围巾', 'Scarf'], ['acc:towel', '毛巾搭肩', 'Shoulder towel'], ['acc:lock', '长命锁', 'Longevity lock'], ['acc:redscarf', '红领巾', 'Red scarf'], ['acc:beads', '念珠', 'Prayer beads'], ['acc:pipe', '烟袋', 'Pipe'], ['acc:glasses', '眼镜', 'Glasses'], ['acc:shades', '墨镜', 'Sunglasses']] },
];
/** 外观分四组，一组一页：[中文, 英文, 字段]。 */
export const GROUPS = [['身形', 'Body', ['build', 'skin']], ['头脸', 'Head', ['hair', 'hairRamp', 'hat', 'face']], ['衣裳', 'Clothes', ['style', 'top', 'pattern', 'pants']], ['配饰', 'Extras', ['extra', 'legwrap']]];
export const SKILLS = ['种地', '种菜', '钓鱼', '木工', '泥瓦', '力气大', '挑担', '做饭', '烙饼', '磨面', '裁缝', '针线', '杀猪', '打猎', '采山货', '烧炭', '带孩子', '识字', '算账', '说书', '选种', '赶牲口'];
export const TRAITS = [...new Set(RESIDENTS.flatMap((p) => p.traits))].slice(0, 36);
export const BRING = [['grain', 10], ['flour', 5], ['cloth', 10], ['wood', 5]];

/** 提交时带的字段：样子和资料（改的时候也只能改这些）；新来的还带本钱、带的东西、选的营生。 */
export const EDIT_KEYS = ['name', 'nick', 'age', 'sex', 'skills', 'traits', 'bio', 'likes', 'body', 'build', 'elder', 'skin', 'hair', 'hairRamp', 'hat', 'top', 'style', 'pattern', 'pants', 'beard', 'mustache', 'blush', 'smile', 'legwrap', 'apron', 'sash', 'acc', 'jobId'];
export const JOIN_KEYS = [...EDIT_KEYS, 'coins', 'goods', 'jobPicked'];
export const pickKeys = (p, keys) => Object.fromEntries(keys.filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== '').map((k) => [k, p[k]]));
/** 样子和资料的指纹：本地改过没提交，就和存档里那份对不上。 */
export const signature = (p) => JSON.stringify(EDIT_KEYS.map((k) => { const v = p[k]; return Array.isArray(v) ? [...v].sort() : v ?? null; }));

const vals = (key) => new Set(PARTS.find((x) => x.key === key).list.map(([v]) => v).filter(Boolean));
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>`]/g, '').trim().slice(0, n) : undefined);
const one = (v, set) => (set.has(v) ? v : undefined);
/**
 * 清洗一份提交（来自 GitHub Issue，不可信）：只留认得的字段和值，字符串截短、去掉尖括号和控制字符。
 * 返回 { data, errors }；errors 非空就不收（名字没填之类）。jobs：营生 id 的集合（life/newcomers.js 的 JOBS）。
 */
export function sanitize(raw, { join, jobs }) {
  const r = raw && typeof raw === 'object' ? raw : {}, d = {}, errors = [];
  d.name = str(r.name, 6);
  d.nick = str(r.nick, 6) || d.name;
  if (!d.name) errors.push('没有名字');
  const age = Math.round(Number(r.age));
  d.age = Number.isFinite(age) ? Math.max(16, Math.min(80, age)) : 30;
  d.sex = r.sex === '女' ? '女' : '男';
  d.body = d.age >= 60 && d.sex === '男' ? 'elder' : d.sex === '男' ? 'man' : 'woman';
  if (d.age >= 60) d.elder = true;
  d.skills = (Array.isArray(r.skills) ? r.skills : []).map((s) => str(s, 8)).filter(Boolean).slice(0, 12);
  d.traits = (Array.isArray(r.traits) ? r.traits : []).filter((s) => TRAITS.includes(s)).slice(0, 3);
  d.bio = str(r.bio, 80) ?? '';
  d.likes = str(r.likes, 16) || '——';
  for (const k of ['build', 'hair', 'hairRamp', 'hat', 'style', 'pattern', 'skin']) { const v = one(r[k], vals(k)); if (v) d[k] = v; }
  d.hair ??= 'short'; d.skin ??= 'skin';
  d.top = one(r.top, vals('top')) ?? 'teal';
  d.pants = one(r.pants, vals('pants')) ?? 'black';
  for (const k of ['beard', 'mustache', 'blush', 'smile', 'legwrap']) if (r[k] === true) d[k] = true;
  if (r.apron === 'indigo') d.apron = 'indigo';
  if (r.sash === 'red') d.sash = 'red';
  const accs = new Set(PARTS.find((x) => x.key === 'extra').list.map(([v]) => v).filter((v) => v.startsWith('acc:')).map((v) => v.slice(4)));
  if (accs.has(r.acc)) d.acc = r.acc;
  if (typeof r.jobId === 'string' && jobs.has(r.jobId)) d.jobId = r.jobId;
  if (join) {
    const c = Math.round(Number(r.coins));
    d.coins = Number.isFinite(c) ? Math.max(0, Math.min(200, c)) : 80;
    d.goods = Object.fromEntries(BRING.filter(([g]) => r.goods && Number(r.goods[g]) > 0)); // 带什么来：只认四样、数量按规定的
    if (d.jobId) d.jobPicked = true;
  }
  return { data: d, errors };
}
