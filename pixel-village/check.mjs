// 无头检查：起服务器 → 无头 Chrome 打开页面 → 读 data-ready / data-errors → 截图。
// 用法：node check.mjs [页面] [输出目录]。页面默认 index（主场景），sheet = 角色表。
// 退出码非 0 表示页面报错或没跑完。
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const page = process.argv[2] ?? 'index';
const out = resolve(process.argv[3] ?? join(here, 'shots'));
mkdirSync(out, { recursive: true });
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 8093;

const server = spawn(process.execPath, [join(here, 'serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const size = page === 'sheet' || page === 'roster' ? '1400,2000' : page === 'cast' ? '1600,900' : '1280,800';
const flags = ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', `--virtual-time-budget=${process.env.VT ?? 10000}`, `--window-size=${size}`];
const url = `http://localhost:${port}/${page === 'index' ? '' : page + '.html'}${process.env.Q ?? ''}`;
const dom = spawnSync(chrome, [...flags, '--dump-dom', url], { encoding: 'utf8', timeout: 400000 }).stdout ?? '';
spawnSync(chrome, [...flags, `--screenshot=${join(out, page + '.png')}`, url], { timeout: 400000 });
server.kill();

const ready = /data-ready="1"/.test(dom);
const errors = dom.match(/<pre id="err"[^>]*>([\s\S]*?)<\/pre>/)?.[1].trim() ?? '';
console.log(`ready=${ready}`);
const calls = dom.match(/data-calls="(\d+)"/)?.[1];
const bake = dom.match(/data-bake="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"');
const ms = dom.match(/data-build-ms="(\d+)"/)?.[1];
const tris = dom.match(/data-tris="(\d+)"/)?.[1];
if (calls) console.log(`draw calls=${calls}  tris=${tris}  bake=${bake}  build=${ms}ms`);
const sim = dom.match(/data-sim="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"');
if (sim) console.log(`sim=${sim}`);
const audit = dom.match(/data-audit="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"');
if (audit) console.log(`audit=${audit}`);
const west = dom.match(/data-west="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"'); if (west) console.log(`west=${west}`);
const things = dom.match(/data-things="([^"]*)"/)?.[1]?.replace(/&quot;/g, "\""); if (things) console.log(`things=${things}`);
const clicked = dom.match(/data-clicked="([^"]*)"/)?.[1]; if (clicked) console.log(`clicked=${clicked}`);
const snd = dom.match(/data-sound="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"'); if (snd) console.log(`sound=${snd}`);
const graves = dom.match(/data-graves="([^"]*)"/)?.[1]; if (graves) console.log(`graves=${graves.replace(/&quot;/g, '"')}`);
const perf = dom.match(/data-perf="([^"]*)"/)?.[1]; if (perf) console.log(`perf=${perf.replace(/&quot;/g, '"')}`);
const eve = dom.match(/data-eve="([^"]*)"/)?.[1]?.replace(/&quot;/g, "\""); if (eve) console.log(`eve=${eve}`);
if (errors) console.log(`errors:\n${errors}`);
console.log(`screenshot: ${join(out, page + '.png')}`);
process.exit(ready && !errors ? 0 : 1);
