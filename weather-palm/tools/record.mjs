// 演示视频录制：有显卡的 Chrome（Playwright）打开页面 → 停掉自带动画循环 → 按分镜逐帧推进模拟、摆合成手、渲染 → 存 JPG → ffmpeg 合成 MP4。
// 逐帧推进（不是实时录屏），所以画面稳定、不掉帧，和机器快慢无关。
// 用法（在 weather-palm 目录下）：node tools/record.mjs [分镜名] [--w 1920 --h 1080 --fps 30]
//   产物：tools/out/<分镜名>.mp4（帧在 tools/out/<分镜名>/，合成后删除）
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'file:///D:/pocket-punchers/node_modules/playwright/index.mjs';
import { STORIES } from './story.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const name = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'demo';
const W = Number(arg('w', 1920)), H = Number(arg('h', 1080)), FPS = Number(arg('fps', 30));
const story = STORIES[name];
if (!story) throw new Error(`没有分镜 ${name}；有：${Object.keys(STORIES).join(', ')}`);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = join(root, p.endsWith('/') ? p + 'index.html' : p);
    if (!f.startsWith(root)) throw 0;
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
const port = Number(process.env.PORT ?? 8098);
await new Promise(r => server.listen(port, r));

const out = join(here, 'out', name);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--mute-audio', `--window-size=${W + 16},${H + 120}`] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://localhost:${port}/weather-palm/index.html?scene=${story.scene ?? 'barren'}&fresh=1${story.query ?? ''}`);
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
// 停掉页面自带的动画循环，之后完全由这里逐帧推进
await page.evaluate(() => { window.__palm.renderer.setAnimationLoop(null); });
if (story.setup) await page.evaluate(story.setup);

const total = Math.round(story.seconds * FPS);
const t0 = Date.now();
for (let f = 0; f < total; f++) {
  const t = f / FPS;
  // 每帧：分镜函数在页面里跑（摆手、摆相机、推进模拟、渲染），返回 JPG dataURL
  const url = await page.evaluate(([fn, t, fps]) => {
    const P = window.__palm;
    // eslint-disable-next-line no-new-func
    new Function('P', 't', 'dt', fn)(P, t, 1 / fps);
    P.renderOnce();
    return P.renderer.domElement.toDataURL('image/jpeg', 0.92);
  }, [story.frame, t, FPS]);
  await writeFile(join(out, `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  if (f % 60 === 0) console.log(`${name}: ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();
server.close();
if (errors.length) console.log('页面报错：\n' + errors.join('\n'));

const mp4 = join(here, 'out', `${name}.mp4`);
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(out, 'f%05d.jpg'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);
if (!process.env.KEEP) await rm(out, { recursive: true, force: true });
console.log(`done ${mp4}  ${total} 帧，${((Date.now() - t0) / 1000).toFixed(0)}s`);
