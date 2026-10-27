/*
 * 中英文：按浏览器语言自动选（中文系统看中文，别的都看英文）；?lang=zh / ?lang=en 强制。
 * 写法：界面上的字就地写两份——tr('创建居民', 'New resident')；带变量的用模板串：EN ? `${n} people` : `${n} 口人`。
 * 名册、地点这些成段的资料，英文放在同一条数据旁边的 en 字段里（见 residents.js 等）。
 * Node 里（后台模拟）没有浏览器：一律中文。
 */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
const node = typeof process !== 'undefined' && !!process.versions?.node; // Node 22 也有 navigator（en-US），要先认出来
const nav = node || typeof navigator === 'undefined' ? 'zh' : navigator.languages?.[0] ?? navigator.language ?? '';
export const LANG = q === 'en' || q === 'zh' ? q : /^zh/i.test(nav) ? 'zh' : 'en';
export const EN = LANG === 'en';
/** 中文 / 英文二选一。 */
export const tr = (zh, en) => (EN ? en : zh);
if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = EN ? 'en' : 'zh-CN';

/** 英文里数量要配单复数：plural(3, 'person', 'people')。 */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
