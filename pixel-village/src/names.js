/*
 * 人、户、公用词在界面上怎么写（中文界面原样；英文界面查 i18n/en-people.js、en-words.js，查不到的原样显示）。
 * 界面上凡是显示名册里的字（名字、叫法、职业、哪家、性格、手艺……）都走这里，不直接读 p.name。
 * 新来的人：名字、来历是玩家自己填的（填什么显示什么）；职业、哪家、身份是程序拼的，英文界面按代码重新拼。
 */
import { EN } from './i18n.js';
import { EN_PEOPLE, EN_HOUSEHOLDS, EN_VILLAGE } from './i18n/en-people.js';
import { EN_WORDS } from './i18n/en-words.js';

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

export const pName = (p) => ep(p, 'name') ?? p?.name ?? '';
export const pNick = (p) => ep(p, 'nick') ?? p?.nick ?? '';
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
