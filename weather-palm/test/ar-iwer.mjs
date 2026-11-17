// Quest 透视（immersive-ar）入口检查：IWER 模拟一台 Quest 3（手部追踪模式）→ 透视按钮出现 → 点击进 AR 会话 →
// 读会话模式、混合模式、透明清屏、两只手的关节、跑几秒看有没有报错，截一张 XR 画面。
// 用法（在 weather-palm 目录下）：node test/ar-iwer.mjs        截图 test/shots/ar-iwer.png
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///D:/pocket-punchers/node_modules/playwright/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IWER = 'D:/pocket-punchers/node_modules/iwer/build/iwer.min.js';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = join(root, p.endsWith('/') ? p + 'index.html' : p);
    if (!f.startsWith(root)) throw 0;
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(8099, r));
await mkdir(join(here, 'shots'), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[AR]')) errors.push(m.text() + ' @' + (m.location()?.url ?? '')); });
// IWER 必须在页面脚本之前装好（navigator.xr 被它接管）
await page.addInitScript({ content: (await readFile(IWER, 'utf8')) + `
  const dev = new IWER.XRDevice(IWER.metaQuest3);
  dev.installRuntime({ forceInstall: true });
  dev.primaryInputMode = 'hand';
  window.__iwer = dev;` });
await page.goto('http://localhost:8099/weather-palm/index.html?fresh=1');
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });

const checks = [];
const ok = (name, pass, info = '') => { checks.push({ name, pass: !!pass, info }); };
await page.waitForTimeout(500);
ok('Quest 上显示透视按钮', await page.evaluate(() => getComputedStyle(document.getElementById('ARButton')).display !== 'none'));
const t0 = await page.evaluate(() => window.__palm.w.t);
await page.click('#ARButton');
await page.waitForFunction(() => window.__palm.renderer.xr.isPresenting, null, { timeout: 20000 }).catch(() => { });
await page.waitForTimeout(3000);   // 跑几秒：摆岛、手追踪、模拟
const st = await page.evaluate(() => {
  const r = window.__palm.renderer, s = r.xr.getSession();
  const hands = s ? [...s.inputSources].filter(x => x.hand).map(x => x.handedness) : [];
  const c = new (r.getClearColor(new (window.__palm.camera.position.constructor)()).constructor)();
  return {
    presenting: r.xr.isPresenting,
    mode: s?.mode ?? null,
    blend: s?.environmentBlendMode ?? null,
    alpha: r.getClearAlpha(),
    bgNull: window.__palm.scene.background === null,
    hands,
    btn: document.getElementById('ARButton').textContent,
    t: window.__palm.w.t,
  };
});
// XRSession.mode 不是标准属性（IWER 没有），以"在呈现 + 透视混合"判断进的是 AR
ok('进了透视会话', st.presenting && st.blend === 'alpha-blend', `presenting=${st.presenting}`);
ok('透视混合（alpha-blend）', st.blend === 'alpha-blend', `blend=${st.blend}`);
ok('透明清屏、无背景', st.alpha === 0 && st.bgNull, `alpha=${st.alpha} bgNull=${st.bgNull}`);
ok('两只手都在追踪', st.hands.length === 2, st.hands.join(','));
ok('按钮变成退出', st.btn === 'EXIT AR', st.btn);
ok('XR 帧在跑、模拟在推进', st.t > t0 + 0.2, `t ${t0.toFixed(1)} → ${st.t.toFixed(1)}（软件渲染的 XR 帧很慢）`);
await page.screenshot({ path: join(here, 'shots', 'ar-iwer.png') });
// 退出会话（进了会话以后 IWER 的画面层盖在按钮上，直接调按钮）
await page.evaluate(() => document.getElementById('ARButton').click());
await page.waitForTimeout(800);
ok('退出后回到桌面预览', await page.evaluate(() => !window.__palm.renderer.xr.isPresenting && document.getElementById('ARButton').textContent === 'ENTER AR'));
ok('没有报错', errors.filter(e => !e.includes('favicon.ico')).length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  ${c.info}`);
process.exit(checks.every(c => c.pass) ? 0 : 1);
