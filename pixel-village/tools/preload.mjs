// 预加载清单：把 main.js 一路 import 到的所有模块写进 index.html 的 <link rel="modulepreload">。
//
// 用法：node tools/preload.mjs [index.html]（默认项目里的 index.html）。改了 import（加文件、删文件）以后跑一下，和 subset-font.py 一样。
// 顺带在页面里定入口 window.PV_ENTRY（线上跑打包版，本机跑源码，见下面），页面末尾 import(window.PV_ENTRY)。
//
// 为什么：网页没有打包，七十多个小文件按 import 一层套一层地下——下完 main.js 才知道要 village.js，下完 village.js 才知道要
// compounds.js……从国内连 GitHub Pages 一层要半秒到一秒，排了七八层，光下代码就八九秒（东西本身只有一兆多）。
// 清单写在页面里，浏览器一打开就同时下全部文件，只剩一层。sw.js 每次打开都问服务器「改过没有」，也跟着变成同时问。
// 清单旧了也不出错：漏掉的文件照旧按 import 下，只是慢一点。只收静态 import（uicheck 这种按需 import() 的不收）。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const page = resolve(process.argv[2] ?? resolve(root, 'index.html'));
let html = readFileSync(page, 'utf8');

const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const bare = (spec) => { // 按 import map 换成 CDN 的地址
  if (map[spec]) return map[spec];
  const pre = Object.keys(map).find((k) => k.endsWith('/') && spec.startsWith(k));
  return pre ? map[pre] + spec.slice(pre.length) : null;
};

const IMPORT = /(?:^|[;\s])(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
const local = [], cdn = new Set(), seen = new Set();
const walk = (file) => {
  if (seen.has(file)) return;
  seen.add(file);
  local.push(file);
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [, spec] of src.matchAll(IMPORT)) {
    if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
    else { const u = bare(spec); if (u) cdn.add(u); }
  }
};
walk(resolve(root, 'src/main.js'));

const files = local.map((f) => relative(root, f).replaceAll('\\', '/'));
// 入口：线上跑打包版 dist/main.min.js（tools/bundle.mjs），本机开发（localhost、局域网、file://）或 ?src 跑源码；?dist 在本机也跑打包版。
// 预加载跟着入口走：打包版只预加载那一个文件，跑源码时预加载全部源码（线上不白下七十个源码文件）
const block = `  <!-- modulepreload：tools/preload.mjs 生成，别手改 -->
${[...cdn].map((h) => `  <link rel="modulepreload" href="${h}">`).join('\n')}
  <script>
    (() => {
      const q = new URLSearchParams(location.search), dev = location.protocol === 'file:' || /^(localhost|127\\.|\\[::1\\]|192\\.168\\.|10\\.)/.test(location.hostname);
      window.PV_ENTRY = q.has('dist') || !(dev || q.has('src')) ? 'dist/main.min.js' : 'src/main.js';
      const SRC = ${JSON.stringify(files)};
      for (const href of window.PV_ENTRY === 'src/main.js' ? SRC : [window.PV_ENTRY]) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = href; document.head.append(l); }
    })();
  </script>
  <!-- /modulepreload -->`;
const links = [...cdn, ...files];
const old = /  <!-- modulepreload：[\s\S]*?<!-- \/modulepreload -->/;
if (old.test(html)) html = html.replace(old, block);
else { // 第一次：放在 import map 后面（import map 必须在任何模块开始下之前）
  const end = html.indexOf('</script>', html.indexOf('<script type="importmap">')) + '</script>'.length;
  html = `${html.slice(0, end)}\n${block}${html.slice(end)}`;
}
writeFileSync(page, html);
console.log(`${links.length} 个模块（本地 ${local.length}，CDN ${cdn.size}）→ ${relative(root, page)}`);
