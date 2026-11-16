// 龙舟鼓手 · 无头检查：起本地静态服务（仓库根目录，页面要读 ../shared）→ 无头 Chrome 打开页面 → 读 DOM 里的结果 → 截图。
// 用法：node dragon-boat/check.mjs [输出目录]。退出码非 0 = 页面报错或断言没过。
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const out = resolve(process.argv[2] ?? join(here, 'shots')); mkdirSync(out, { recursive: true });
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;
const flags = ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--window-size=1280,760'];
const url = q => `http://localhost:${port}/dragon-boat/index.html${q}`;
// 异步起 Chrome（同步调用会堵住本进程里的静态服务）；超时就杀掉
const run = (args, ms = 150000) => new Promise(r => {
  const p = spawn(chrome, [...args, `--user-data-dir=${join(out, '.profile')}`]); let stdout = '';
  p.stdout.on('data', d => stdout += d);
  const k = setTimeout(() => p.kill(), ms);
  p.on('close', () => { clearTimeout(k); r({ stdout }); });
});

let fail = 0;
const check = (name, cond, info = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info); if (!cond) fail++; };
// 1) 整局：?ff=120 用逻辑快进到结算，再渲染若干帧；页面把结果写进 data-result
const dump = (await run([...flags, '--virtual-time-budget=20000', '--dump-dom', url('?ff=120&probe')])).stdout || '';
const m = dump.match(/data-result="([^"]*)"/);
const res = m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
check('页面加载并跑完', /data-ready="1"/.test(dump) && !!res, res ? '' : dump.slice(0, 300));
if (res) {
  check('无脚本错误', !res.errors.length, res.errors.join(' | '));
  check('一局跑到结算', res.state === 'result', res.state);
  check('自动鼓手拿第一', res.stats.rank === 1, JSON.stringify(res.stats));
  check('一局 60–90 s', res.stats.time > 60 && res.stats.time < 90, res.stats.time);
  check('笔触数在预算内', res.strokes > 500 && res.strokes < 14000, res.strokes);
  check('draw call ≤ 150', res.perf.calls <= 150, res.perf.calls);
  check('三角形 ≤ 40 万', res.perf.tris <= 400000, res.perf.tris);
  console.log('perf', JSON.stringify(res.perf));
}
// 2) 截图：标题、比赛中、过线庆祝
for (const [name, q] of [['title', '?title'], ['race', '?ff=40'], ['finish', '?ff=73']]) {
  await run([...flags, '--virtual-time-budget=4000', `--screenshot=${join(out, name + '.png')}`, url(q)]);
  check('截图 ' + name, existsSync(join(out, name + '.png')));
}
server.close();
process.exit(fail ? 1 : 0);
