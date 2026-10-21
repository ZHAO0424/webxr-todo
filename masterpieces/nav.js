// 每件作品里都挂着的"上一幅 / 画廊 / 下一幅"：淡出到黑再换页，进来时从黑里淡入
// 快捷键：← 或 [ 或 PageUp 上一幅  → 或 ] 或 PageDown 下一幅（翻页笔也能用）  1–9 直接到第几幅  G 回画廊。
// 戴着头显时（比如眼镜连着电脑），这些键照样能换画，交给 xr-hop.js 在同一个会话里换，不跳页、不退出 VR。
// 从一幅换到另一幅时跳过入场页：黑幕上只写下一幅的名字，载完直接进场景。从画廊进来仍然先看入场页。
// 空格留给《穿过自然的尖叫》（代替声音）；《睡莲》的转头改成了 A / D。
// 画廊主页也加载这个文件，但只用到 VR 按钮坞和头显里的数字键；主页自己的方向键 / 回车照旧。头显里换回主页时，这里把切换栏收起来。
(function () {
  const W = window.WORKS || [];
  let slug, i, prev, next;
  const locate = () => {
    slug = location.pathname.split('/').pop().replace(/\.html$/, '');
    i = W.findIndex(w => w.slug === slug);
    prev = W[(i - 1 + W.length) % W.length]; next = W[(i + 1) % W.length];
    document.documentElement.classList.toggle('mp-home', i < 0);
  };
  locate();

  const css = document.createElement('style'); css.id = 'mp-nav-style';
  css.textContent = `
    #mp-veil { position: fixed; inset: 0; background: #0b0a0d; z-index: 60; pointer-events: none; opacity: 1; transition: opacity .9s ease; }
    #mp-veil.off { opacity: 0; }
    #mp-veil .t { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: #efe9dd; text-align: center; padding: 16px; }
    #mp-veil .t i { font: 11px/1.6 system-ui, sans-serif; letter-spacing: .3em; color: #c9a45c; font-style: normal; text-transform: uppercase; }
    #mp-veil .t b { font: 400 clamp(30px, 6vw, 56px)/1.2 "Songti SC", "STSong", serif; letter-spacing: .16em; }
    #mp-veil .t em { font: italic 16px/1.4 "Songti SC", Georgia, serif; color: #a49e93; }
    #mp-veil .t s { display: block; width: 48px; height: 1px; background: #c9a45c; text-decoration: none; }
    #mp-nav { position: fixed; top: 14px; right: 14px; z-index: 55; display: flex; align-items: stretch; gap: 1px;
      font: 12px/1 system-ui, sans-serif; letter-spacing: .08em; border-radius: 999px; overflow: visible;
      background: rgba(14,13,18,.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 0 0 1px rgba(255,255,255,.12); }
    #mp-nav a { color: #ece7dc; text-decoration: none; padding: 9px 12px; display: flex; align-items: center; gap: 6px; position: relative; white-space: nowrap; }
    #mp-nav a:hover { color: #fff; background: rgba(255,255,255,.08); }
    #mp-nav a:first-child { border-radius: 999px 0 0 999px; } #mp-nav a:last-child { border-radius: 0 999px 999px 0; }
    #mp-nav .count { opacity: .55; }
    #mp-nav .peek { position: absolute; top: calc(100% + 8px); width: 168px; padding: 6px; background: rgba(14,13,18,.9); border-radius: 6px;
      opacity: 0; transform: translateY(-4px); transition: opacity .2s, transform .2s; pointer-events: none; box-shadow: 0 0 0 1px rgba(255,255,255,.12); }
    #mp-nav a.p .peek { left: 0; } #mp-nav a.n .peek { right: 0; }
    #mp-nav a:hover .peek { opacity: 1; transform: none; }
    #mp-nav .peek img { width: 100%; height: 96px; object-fit: cover; display: block; border-radius: 3px; }
    #mp-nav .peek b { display: block; font: 14px/1.4 "Songti SC", "STSong", serif; letter-spacing: .04em; margin-top: 6px; }
    #mp-nav .peek i { font-size: 11px; opacity: .6; font-style: normal; }
    @media (max-width: 520px) { #mp-nav .lbl { display: none; } #mp-nav .peek { display: none; } }
  `;
  document.head.appendChild(css);

  const veil = document.createElement('div'); veil.id = 'mp-veil';
  const showTitle = (w, k) => { veil.innerHTML = `<div class="t"><i>${k + 1} / ${W.length} · After ${w.after} · ${w.year}</i><b>${w.zh}</b><s></s><em>${w.en}</em></div>`; };
  const skipIntro = new URLSearchParams(location.search).has('enter');
  if (skipIntro && i >= 0) showTitle(W[i], i);
  const peek = w => `<span class="peek"><img src="data/thumbs/${w.slug}.jpg" alt=""><b>${w.zh}</b><i>After ${w.after} · ${w.year}</i></span>`;
  const nav = document.createElement('nav'); nav.id = 'mp-nav'; nav.setAttribute('aria-label', '作品切换');
  const fill = () => {
    nav.style.display = i < 0 ? 'none' : '';
    if (i < 0) { nav.innerHTML = ''; return; }
    nav.innerHTML =
    `<a class="p" href="${prev.slug}.html" title="上一幅 [">‹ <span class="lbl">${prev.zh}</span>${peek(prev)}</a>` +
    `<a class="g" href="index.html?from=${slug}" title="回到博物馆的画廊 G">⌂ <span class="lbl">画廊</span><span class="count">${i + 1} / ${W.length}</span></a>` +
    `<a class="n" href="${next.slug}.html" title="下一幅 ]"><span class="lbl">${next.zh}</span> ›${peek(next)}</a>`;
  };

  fill();
  const go = href => {
    const hop = window.mpHop, to = W.findIndex(w => `${w.slug}.html` === href);
    if (hop && hop.presenting() && to >= 0) { hop.go(0, false, to); return; }   // 头显里：不跳页
    // 换到另一件作品：带上 enter=1，到了那边跳过入场页
    if (to >= 0) { showTitle(W[to], to); href += '?enter=1'; }
    veil.classList.remove('off'); setTimeout(() => { location.href = href; }, 850);
  };
  nav.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); go(a.getAttribute('href')); });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = +e.key, xr = window.mpHop && mpHop.presenting();
    if (i < 0) { if (xr && n >= 1 && n <= W.length) mpHop.go(0, false, n - 1); return; }   // 主页：头显里数字键直接走进第几幅
    if (e.key === 'ArrowLeft' || e.key === '[' || e.key === 'PageUp') { e.preventDefault(); go(`${prev.slug}.html`); }
    else if (e.key === 'ArrowRight' || e.key === ']' || e.key === 'PageDown') { e.preventDefault(); go(`${next.slug}.html`); }
    else if (n >= 1 && n <= W.length && n - 1 !== i) go(`${W[n - 1].slug}.html`);
    else if (e.key === 'g' || e.key === 'G') { if (xr) mpHop.home(); else go(`index.html?from=${slug}`); }   // 头显里回画廊也不出 VR
  });
  // 浏览器后退回来时（bfcache）也要把黑幕揭开
  addEventListener('pageshow', e => { if (e.persisted) requestAnimationFrame(() => veil.classList.add('off')); });

  // 进入 VR / AR 的按钮：three 默认把它们钉在底部正中，会压住场景里的提示字；统一收进右下角的一个坞里
  const dock = document.createElement('div'); dock.id = 'st-xr';
  const isXRBtn = el => el.nodeType === 1 && el.parentNode === document.body &&
    (el.id === 'VRButton' || el.id === 'ARButton' || (el.tagName === 'A' && /immersive-web|webxr/i.test(el.href + el.textContent)));
  // 只留一个「进入 XR」：作品自己按 environmentBlendMode 判断要不要画背景，所以 VR / AR 两个入口在眼镜上
  // 进去是一样的（光学透视的眼镜上黑 = 透明，两种都等于把画挂在房间里）。优先 VR；设备只支持 AR 时
  // （手机）才换成 AR 那个按钮。three 的按钮会自己改字、改 display，这里每次按状态改回来
  const relabel = () => {
    const vr = dock.querySelector('#VRButton'), ar = dock.querySelector('#ARButton');
    const ok = b => b && b.tagName === 'BUTTON' && !/NOT|不支持/i.test(b.textContent);
    const use = ok(vr) ? vr : ok(ar) ? ar : vr || ar;
    for (const b of [vr, ar]) if (b) {
      const want = b === use ? '' : 'none';
      if (b.style.display !== want || (want && b.style.getPropertyPriority('display'))) b.style.setProperty('display', want, want ? '' : 'important');
    }
    if (use && use.tagName === 'BUTTON') {
      const s = use.textContent;
      const t = /EXIT|STOP/i.test(s) ? '退出 XR' : /NOT/i.test(s) ? '此设备不支持 XR' : /ENTER|START/i.test(s) ? '进入 XR' : null;
      if (t && s !== t) use.textContent = t;
    }
  };
  const watch = new MutationObserver(relabel);
  const collect = () => {
    for (const el of [...document.body.children]) if (isXRBtn(el)) {
      el.classList.add('st-xrbtn'); dock.appendChild(el);
      watch.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }
    relabel();
  };
  const plate = () => {
    // 入场页：左边挂上原画（带画框），背后铺一层虚化的画
    const intro = document.getElementById('intro');
    if (i >= 0 && intro && !intro.querySelector('.st-plate')) {
      const thumb = `data/thumbs/${slug}.jpg`;
      intro.style.setProperty('--st-thumb', `url("${thumb}")`);
      const fig = document.createElement('figure'); fig.className = 'st-plate'; fig.style.margin = '0';
      fig.innerHTML = `<img src="${thumb}" alt=""><figcaption>${W[i].after} · ${W[i].year} · ${i + 1} / ${W.length}</figcaption>`;
      intro.prepend(fig);
    }
  };
  // 头显里换了画之后（xr-hop.js），按新的地址把上一幅 / 下一幅和入场页的画重新挂好
  window.mpNav = { rebuild() { locate(); fill(); plate(); } };
  const mount = () => {
    document.body.append(veil, nav, dock);
    collect(); new MutationObserver(collect).observe(document.body, { childList: true });
    plate();
    if (i < 0) veil.classList.add('off');
    else if (skipIntro) autoEnter();
    else requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('off')));
    // 下一幅的缩略图先取好，悬停时立刻出来
    if (i >= 0) [prev, next].forEach(w => { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = `${w.slug}.html`; document.head.appendChild(l); });
  };
  // 跳过入场页：等作品载完（「进入」按钮亮起），替观众按下它，再揭开黑幕
  function autoEnter() {
    history.replaceState(null, '', location.pathname);   // 刷新时还是先看入场页
    const t0 = performance.now();
    const tick = () => {
      const b = document.getElementById('enter'), intro = document.getElementById('intro');
      if (b && b.disabled && performance.now() - t0 < 60000) { setTimeout(tick, 100); return; }
      if (b && !b.disabled) {
        if (intro) intro.style.setProperty('transition', 'none', 'important');   // 入场页直接收起，不在黑幕揭开时淡出
        b.click();
      }                                                                         // 载入失败：留着入场页给出原因
      setTimeout(() => veil.classList.add('off'), Math.max(0, 700 - (performance.now() - t0)));
    };
    tick();
  }
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
})();
