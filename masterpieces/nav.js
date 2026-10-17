// 每件作品里都挂着的"上一幅 / 画廊 / 下一幅"：淡出到黑再换页，进来时从黑里淡入
// 快捷键：[ 上一幅  ] 下一幅  G 回画廊。进入 VR / AR 后网页叠层看不见，要先退出头显模式再切换。
(function () {
  const W = window.WORKS || [];
  const slug = location.pathname.split('/').pop().replace(/\.html$/, '');
  const i = W.findIndex(w => w.slug === slug);
  if (i < 0) return;
  const prev = W[(i - 1 + W.length) % W.length], next = W[(i + 1) % W.length];

  const css = document.createElement('style');
  css.textContent = `
    #mp-veil { position: fixed; inset: 0; background: #0b0a0d; z-index: 60; pointer-events: none; opacity: 1; transition: opacity .9s ease; }
    #mp-veil.off { opacity: 0; }
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
  const peek = w => `<span class="peek"><img src="data/thumbs/${w.slug}.jpg" alt=""><b>${w.zh}</b><i>After ${w.after} · ${w.year}</i></span>`;
  const nav = document.createElement('nav'); nav.id = 'mp-nav'; nav.setAttribute('aria-label', '作品切换');
  nav.innerHTML =
    `<a class="p" href="${prev.slug}.html" title="上一幅 [">‹ <span class="lbl">${prev.zh}</span>${peek(prev)}</a>` +
    `<a class="g" href="index.html?from=${slug}" title="回画廊 G"><span class="count">${i + 1} / ${W.length}</span></a>` +
    `<a class="n" href="${next.slug}.html" title="下一幅 ]"><span class="lbl">${next.zh}</span> ›${peek(next)}</a>`;

  const go = href => { veil.classList.remove('off'); setTimeout(() => { location.href = href; }, 850); };
  nav.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); go(a.getAttribute('href')); });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === '[') go(`${prev.slug}.html`);
    else if (e.key === ']') go(`${next.slug}.html`);
    else if (e.key === 'g' || e.key === 'G') go(`index.html?from=${slug}`);
  });
  // 浏览器后退回来时（bfcache）也要把黑幕揭开
  addEventListener('pageshow', () => requestAnimationFrame(() => veil.classList.add('off')));

  const mount = () => {
    document.body.append(veil, nav);
    // 入场页：左边挂上原画（带画框），背后铺一层虚化的画
    const intro = document.getElementById('intro');
    if (intro && !intro.querySelector('.st-plate')) {
      const thumb = `data/thumbs/${slug}.jpg`;
      intro.style.setProperty('--st-thumb', `url("${thumb}")`);
      const fig = document.createElement('figure'); fig.className = 'st-plate'; fig.style.margin = '0';
      fig.innerHTML = `<img src="${thumb}" alt=""><figcaption>${W[i].after} · ${W[i].year} · ${i + 1} / ${W.length}</figcaption>`;
      intro.prepend(fig);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('off')));
    // 下一幅的缩略图先取好，悬停时立刻出来
    [prev, next].forEach(w => { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = `${w.slug}.html`; document.head.appendChild(l); });
  };
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
})();
