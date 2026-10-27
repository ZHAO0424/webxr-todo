/*
 * 中英文：按浏览器语言自动选（中文系统看中文，别的都看英文）；?lang=zh / ?lang=en 强制。
 * 写法：界面上的字就地写两份——tr('创建居民', 'New resident')；带变量的用模板串：EN ? `${n} people` : `${n} 口人`。
 * 名册、地点这些成段的资料，英文放在同一条数据旁边的 en 字段里（见 residents.js 等）。
 * Node 里（后台模拟）没有浏览器：一律中文。
 */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
const node = typeof process !== 'undefined' && !!process.versions?.node; // Node 22 也有 navigator（en-US），要先认出来
const saved = (() => { try { return localStorage.getItem('pv.lang'); } catch { return null; } })(); // 设置里点过「语言」
/**
 * 先后：?lang= → 设置里选过的 → 浏览器的语言列表里有中文 → 时区在中国（很多人中文系统、浏览器语言却排着英文）→ 英文。
 * index.html 开头有一份一样的规则（模块加载前就要换标题、载入画面的字）。
 */
const detect = () => {
  if (node || typeof navigator === 'undefined') return 'zh';
  if ((navigator.languages ?? [navigator.language]).some((l) => /^zh/i.test(l ?? ''))) return 'zh';
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { return ''; } })();
  return /^Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Hong_Kong|Macau|Taipei)$/.test(tz) ? 'zh' : 'en';
};
export const LANG = q === 'en' || q === 'zh' ? q : saved === 'en' || saved === 'zh' ? saved : detect();
/** 设置里切语言：记下来，重新打开网页（界面上的字都是打开时定的）。 */
export const setLang = (l) => { try { localStorage.setItem('pv.lang', l); } catch { /* 存不了：只靠 ?lang= */ } const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.href; };
export const EN = LANG === 'en';
/** 中文 / 英文二选一。 */
export const tr = (zh, en) => (EN ? en : zh);
if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = EN ? 'en' : 'zh-CN';

/** 英文里数量要配单复数：plural(3, 'person', 'people')。 */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
