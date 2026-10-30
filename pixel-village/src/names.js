/*
 * 人、户、公用词在界面上怎么写（中文界面原样；英文界面查 i18n/en-people.js、en-words.js，查不到的原样显示）。
 * 界面上凡是显示名册里的字（名字、叫法、职业、哪家、性格、手艺……）都走这里，不直接读 p.name。
 * 新来的人：名字、来历是玩家自己填的（填什么显示什么）；职业、哪家、身份是程序拼的，英文界面按代码重新拼。
 */
import { EN } from './i18n.js';
import { EN_PEOPLE, EN_HOUSEHOLDS, EN_VILLAGE } from './i18n/en-people.js';
import { EN_WORDS } from './i18n/en-words.js';
import { PINYIN } from './i18n/pinyin.js';

// ---------------------------------------------------------------- 玩家填的中文名字：英文界面显示成拼音
let PY = null;
const pyOf = (c) => {
  if (!PY) { PY = new Map(); for (const g of PINYIN.split('|')) { const [syl, cs] = g.split(':'); for (const ch of cs) if (!PY.has(ch)) PY.set(ch, syl); } }
  return PY.get(c);
};
/** 常见的姓（两个字的名字头一个字是这里的，才当成「姓 + 名」分开写）。 */
const SURNAMES = new Set('王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤常温康施文牛樊葛邢安齐易乔伍庞颜倪庄聂章鲁岳翟殷詹申欧耿关兰焦俞左柳甘祝包宁尚符舒阮柯纪梅童凌毕单季裴霍涂成苗谷盛曲翁冉骆蓝路游辛靳管柴蒙鲍华喻祁蒲房滕屈饶解牟艾尤阳时穆农司卓古吉缪简车项连芦麦褚娄窦戚岑景党宫费卜冷晏席卫米柏宗瞿桂全佟应臧闵苟邬边卞姬师和仇栾隋商刁沙荣巫寇桑郎甄丛仲虞敖巩明佘池查麻苑迟邝葛焦'.split(''));
const DOUBLE = ['欧阳', '司马', '上官', '诸葛', '东方', '皇甫', '尉迟', '公孙', '慕容', '令狐', '长孙', '宇文', '司徒', '夏侯', '轩辕', '端木', '独孤', '南宫', '西门', '百里'];
/** 当姓时读法不一样的字。 */
const AS_SURNAME = { 单: 'shan', 曾: 'zeng', 解: 'xie', 仇: 'qiu', 朴: 'piao', 查: 'zha', 区: 'ou', 盖: 'ge', 乐: 'yue', 尉: 'yu', 覃: 'qin', 缪: 'miao', 翟: 'zhai', 柏: 'bai', 万: 'wan', 长: 'zhang', 率: 'shuai', 种: 'chong' };
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const syl = (cs) => cs.map((c) => pyOf(c) ?? c).join('');
/**
 * 玩家填的中文名字 → 拼音：林小梅 → Lin Xiaomei，欧阳二根 → Ouyang Ergen，建国 → Jianguo（只填了名）。
 * given = true：当成名字不分姓（叫法、小名）。没有汉字的照原样。
 */
export function romanize(name, given = false) {
  if (!name || !/[\u4e00-\u9fff]/.test(name)) return name;
  const cs = [...name.trim()];
  const n = given ? 0 : DOUBLE.some((d) => name.startsWith(d)) ? 2 : cs.length >= 3 || (cs.length === 2 && SURNAMES.has(cs[0])) ? 1 : 0;
  if (!n || n >= cs.length) return cap(syl(cs));
  const sur = n === 1 ? AS_SURNAME[cs[0]] ?? pyOf(cs[0]) ?? cs[0] : syl(cs.slice(0, 2));
  return `${cap(sur)} ${cap(syl(cs.slice(n)))}`;
}

/** 公用词：会什么、性格、货物、营生名…… */
export const word = (s) => (EN && s != null ? EN_WORDS[s] ?? s : s);
const ep = (p, k) => (EN ? EN_PEOPLE[p?.id]?.[k] : undefined);

export const villageName = (V) => (EN ? EN_VILLAGE.name ?? 'Shiyu Village' : V.name);
/** 户名（去掉括号里的补充：王家（村长家）→ 王家）。full：带括号的全名。 */
export const hhName = (h, full = false) => {
  if (!h) return '';
  const s = EN ? EN_HOUSEHOLDS[h.id]?.name ?? h.name : h.name;
  return full ? s : s.replace(/（.*）|\s*\(.*\)/, '');
};
export const hhField = (h, k) => (EN ? EN_HOUSEHOLDS[h.id]?.[k] ?? h[k] : h[k]);

export const pName = (p) => ep(p, 'name') ?? (EN ? romanize(p?.name) : p?.name) ?? ''; // 英文界面：玩家填的中文名字写成拼音
export const pNick = (p) => ep(p, 'nick') ?? (EN ? romanize(p?.nick, p?.nick !== p?.name) : p?.nick) ?? '';
export const pBio = (p) => ep(p, 'bio') ?? (p?.bio || (p?.newcomer ? defaultBio(p) : ''));
export const pStory = (p) => ep(p, 'story') ?? p?.story ?? pBio(p);
export const pLikes = (p) => ep(p, 'likes') ?? (p?.likes && p.likes !== '——' ? p.likes : '——');
export const pSkills = (p) => (p?.skills ?? []).map(word);
export const pTraits = (p) => (p?.traits ?? []).map(word);
export const pOwns = (p) => ep(p, 'owns') ?? p?.owns ?? [];
export const pSex = (p) => (EN ? (p?.sex === '女' ? 'F' : 'M') : p?.sex);
export const pAge = (p) => (EN ? `${p.age}` : `${p.age}岁`);

/** 新来的人没写来历：按男女给一句。 */
export const defaultBio = (p) => (EN ? `Came from beyond the hills to find work in the village.` : `从山外来的${p.sex === '女' ? '妇人' : '汉子'}，在村里找营生。`);

// 新来的人：职业、哪家、身份是程序拼的（life/newcomers.js、residents.js 的 addResident），英文界面照代码重新拼
let jobName = (id) => id;
let plotWho = (id) => id;
/** life/newcomers.js 注册：营生 id → 名字（英文界面用英文名）；老宅 id → 原来是谁家的。 */
export const registerNewcomerNames = (jobs, plots) => { jobName = jobs; plotWho = plots; };

export const pJob = (p) => {
  const e = ep(p, 'job');
  if (e) return e;
  if (!EN || !p?.newcomer) return p?.job ?? '';
  if (!p.jobId) return 'Newcomer, still looking for work';
  return p.met ? jobName(p.jobId) : `Newcomer, meeting people (job: ${jobName(p.jobId)})`;
};
export const pRelation = (p) => {
  const e = ep(p, 'relation');
  if (e) return e;
  if (EN && p?.newcomer) return 'Newcomer';
  return p?.relation ?? '';
};
/** 哪家：原住户查户名；新来的住老宅写「老村址·赵家老宅」，借住的写「王家（借住）」。 */
export const pHousehold = (p, HOUSEHOLDS) => {
  if (!EN) return p?.household ?? '';
  if (p?.newcomer) {
    if (p.oldHouse) return `Old Site · ${plotWho(p.oldHouse)} old house`;
    const h = HOUSEHOLDS?.find((x) => x.id === p.home);
    return h ? `${hhName(h)} (lodging)` : 'Lodging';
  }
  const h = HOUSEHOLDS?.find((x) => x.id === p.home);
  return h ? hhName(h, true) : p?.household ?? '';
};
