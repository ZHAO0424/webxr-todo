/*
 * 界面出界检查（?uicheck=1，无头截图检查用；英文比中文长，换语言后最容易出界）：
 * 一步步打开各个界面（steps：[{ name, open() }]，main.js 给），每一步量一遍屏幕上看得见的字——
 *   overflow：盒子里的字比盒子宽 / 高（scrollWidth > clientWidth），又没设成可以滚动；
 *   outside：字跑出了所在面板（.panel / .card / #newcomer / #roster）的边，或者跑出屏幕；
 *   clipped：被 text-overflow: ellipsis 截成省略号的（不一定是错，列出来看一眼）；
 *   chinese：英文界面里还露着的中文（漏翻的）。
 * 结果写在 <html data-uicheck="…">（JSON），check.mjs 打印出来。
 */
const frame = () => new Promise((r) => setTimeout(r, 30)); // 不等 requestAnimationFrame：无头里停了画面它不走
const label = (e) => {
  const id = e.id ? `#${e.id}` : '', cls = typeof e.className === 'string' && e.className ? `.${e.className.trim().split(/\s+/).join('.')}` : '';
  return `${e.tagName.toLowerCase()}${id}${cls}`;
};
const path = (e) => { const out = []; for (let x = e; x && x !== document.body && out.length < 4; x = x.parentElement) out.unshift(label(x)); return out.join(' > '); };
const visible = (e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden]'); };
const inScroller = (e) => { for (let x = e.parentElement; x; x = x.parentElement) { const s = getComputedStyle(x); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && x.scrollHeight > x.clientHeight + 1) return true; } return false; }; // 在能滚动的框里：滚到下面去的不算出界
const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
const scrolls = (s) => /(auto|scroll)/.test(s.overflowX + s.overflowY);

/** 量一遍：返回出界的元素（最多 40 条）。 */
export function measure(root = document.body) {
  const found = [], vw = innerWidth, vh = innerHeight;
  for (const e of root.querySelectorAll('*')) {
    if (found.length >= 40) break;
    if (e.closest('canvas, svg') || ['CANVAS', 'SVG', 'SCRIPT', 'STYLE'].includes(e.tagName) || !visible(e)) continue;
    const s = getComputedStyle(e), r = e.getBoundingClientRect(), text = (e.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!text) continue;
    if (document.documentElement.lang === 'en' && ownText(e) && /[㐀-鿿]/.test([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''))) found.push({ kind: 'chinese', at: path(e), text }); // 英文界面里还露着中文
    if (s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) { found.push({ kind: 'clipped', at: path(e), text }); continue; }
    if (!scrolls(s) && (e.scrollWidth > e.clientWidth + 1 || (s.overflowY !== 'visible' && e.scrollHeight > e.clientHeight + 2)) && e.clientWidth > 0) { found.push({ kind: 'overflow', at: path(e), text, box: [e.clientWidth, e.clientHeight], need: [e.scrollWidth, e.scrollHeight] }); continue; }
    if (!ownText(e)) continue;
    const panel = e.parentElement?.closest('.panel, .card, .paper, #newcomer, #roster, .bar, .mk, .hh');
    const pr = panel?.getBoundingClientRect();
    const out = r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1 ? 'screen' : pr && !panel.matches('.hh, .mk') && (r.right > pr.right + 1 || r.left < pr.left - 1) ? label(panel) : null;
    if (out === 'screen' && inScroller(e)) continue;
    if (out) found.push({ kind: 'outside', at: path(e), text, of: out });
  }
  return found;
}

/** 按顺序打开每个界面、量一遍；全部量完写进 data-uicheck。 */
export async function uiCheck(steps) {
  const report = [];
  for (const st of steps) {
    try { await st.open(); } catch (err) { report.push({ step: st.name, error: String(err) }); document.documentElement.dataset.uicheck = JSON.stringify(report); continue; }
    await frame(); await frame();
    const bad = measure();
    report.push({ step: st.name, bad: bad.length, items: bad });
    document.documentElement.dataset.uicheck = JSON.stringify(report); // 每步都写：卡在哪一步也看得出来
  }
  document.documentElement.dataset.uicheck = JSON.stringify(report);
  return report;
}
