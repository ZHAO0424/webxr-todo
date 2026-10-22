// 入画的中 / 英界面。语言默认跟浏览器，切换按钮在 nav.js 的胶囊里，选择记在 localStorage ——
// 和粒子场用同一个键 pf-lang，同一个站点下换一次处处生效（读写失败就只是不记）。
// 普通 <script> 加载，要排在 works.js / nav.js 和页面自己的 module 之前；模块里用 window.MP_I18N。
//
// 用法：每页自己带一份 dict = { zh: {...}, en: {...} }
//   MP_I18N.t(dict, 'key')        取当前语言的文字（英文缺了就退回中文）
//   MP_I18N.apply(dict, root)     把 root 下 data-i18n / data-i18n-html / data-i18n-attr="title:key;aria-label:key2" 刷成当前语言
//   MP_I18N.onChange(fn)          切换后回调 fn(lang)：页面在这里重刷 JS 生成的文字、重画写在 canvas 上的字
//   MP_I18N.pick(zh, en)          两段文字二选一，给 works.js 这种数据用
(function () {
  const KEY = 'pf-lang';
  let lang = '';
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) { lang = ''; }
  if (lang !== 'zh' && lang !== 'en') lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  const subs = [];
  const setDocLang = () => { document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'; };
  setDocLang();

  const MP_I18N = {
    get lang() { return lang; },
    t(dict, key) {
      const d = dict[lang] || {};
      return key in d ? d[key] : (dict.zh || {})[key];
    },
    pick(zh, en) { return lang === 'en' && en != null && en !== '' ? en : zh; },
    apply(dict, root) {
      root = root || document;
      root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = MP_I18N.t(dict, el.dataset.i18n); });
      root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = MP_I18N.t(dict, el.dataset.i18nHtml); });
      root.querySelectorAll('[data-i18n-attr]').forEach(el => {
        el.dataset.i18nAttr.split(';').forEach(pair => {
          const [attr, key] = pair.split(':').map(s => s.trim());
          if (attr && key) el.setAttribute(attr, MP_I18N.t(dict, key));
        });
      });
    },
    set(next) {
      if (next !== 'zh' && next !== 'en' || next === lang) return;
      lang = next;
      try { localStorage.setItem(KEY, lang); } catch (e) { /* 隐私模式等：只是不记 */ }
      setDocLang();
      subs.forEach(fn => { try { fn(lang); } catch (e) { console.error(e); } });
    },
    toggle() { MP_I18N.set(lang === 'en' ? 'zh' : 'en'); },
    onChange(fn) { subs.push(fn); },
  };
  window.MP_I18N = MP_I18N;
})();
