// 无头检查：起静态服务器（仓库根目录，好让 ../shared 能加载）→ 无头 Chrome 打开页面 → 读 DOM 上的 data-* → 截图
// 用法（在 weather-palm 目录下）：
//   node test/check.mjs                 自测（selftest）+ 默认画面截图
//   node test/check.mjs rain storm …    指定场景截图（rain storm rainbow wind sun shade drought lush night flood）
// 截图放在 test/shots/。退出码非 0 = 页面报错或自测没过。
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const shots = join(here, 'shots');
await mkdir(shots, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = join(root, p.endsWith('/') ? p + 'index.html' : p);
    if (!f.startsWith(root)) throw 0;
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
const port = Number(process.env.PORT ?? 8097);
await new Promise(r => server.listen(port, r));
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const flags = ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio', '--window-size=1280,800'];
const base = `http://localhost:${port}/weather-palm/index.html`;
// 必须异步起浏览器：spawnSync 会卡住本进程的事件循环，上面的服务器就没法应答了
const run = (args) => new Promise(r => {
  const p = spawn(chrome, args); let out = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', () => { });
  const kill = setTimeout(() => p.kill(), 300000);
  p.on('close', () => { clearTimeout(kill); r(out); });
});
const attr = (dom, k) => dom.match(new RegExp(`data-${k}="([^"]*)"`))?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

let fail = false;
const scenes = process.argv.slice(2);
if (!scenes.length) {
  const dom = await run([...flags, `--virtual-time-budget=${process.env.VT ?? 30000}`, '--dump-dom', base + '?selftest=1']);
  const ready = attr(dom, 'ready'), errs = attr(dom, 'errors'), st = attr(dom, 'selftest');
  console.log(`ready=${ready} errors=${errs ?? 0} calls=${attr(dom, 'calls')} tris=${attr(dom, 'tris')}`);
  if (errs) console.log('  ' + attr(dom, 'errtext'));
  if (st) for (const c of JSON.parse(st)) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  ${c.info}`);
  if (ready !== '1' || errs || attr(dom, 'pass') !== '1') fail = true;
  scenes.push('default');
}
for (const s of scenes) {
  const url = base + (s === 'default' ? '?test=1' : `?scene=${s}`) + (process.env.Q ?? '');
  await run([...flags, `--virtual-time-budget=${process.env.VT ?? 20000}`, `--screenshot=${join(shots, s + '.png')}`, url]);
  console.log('shot', s);
  if (process.env.DUMP) { const dom = await run([...flags, `--virtual-time-budget=${process.env.VT ?? 20000}`, '--dump-dom', url]); console.log('  ', process.env.DUMP + '=', attr(dom, process.env.DUMP), 'errors=', attr(dom, 'errors') ?? 0, attr(dom, 'errtext') ?? ''); }   // DUMP=terra：顺便读页面上的 data-terra
}
server.close();
process.exit(fail ? 1 : 0);
