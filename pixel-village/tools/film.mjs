// 录片：起本地服务器 → 无头 Chrome（用显卡）打开 film.html → 接住每一帧 → ffmpeg 合成。
//   node tools/film.mjs still S04 1.5      出第 1.5 秒的静帧 → shots/film/S04_still_1.5.png（看构图）
//   node tools/film.mjs record S04         整个镜头 → shots/film/S04.mp4（帧图合成后删掉）
//   node tools/film.mjs all                8 个镜头都录，再按 CUT 的时长拼一条粗剪 → shots/film/rough.mp4
// 加 --vertical 出竖版；--w 1280 --h 720 改分辨率（看构图时用小图快）；--fps 30。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, CUT, VERTICAL } from '../src/film/shots.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'shots', 'film');
mkdirSync(dir, { recursive: true });
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? null : args.splice(i, 2)[1]; };
const vertical = args.includes('--vertical') && args.splice(args.indexOf('--vertical'), 1);
const w = flag('w'), h = flag('h'), fps = Number(flag('fps') ?? 60), pageQ = flag('q'); // --q 'nobackdrop=1' 额外的页面参数
const [mode = 'still', id = 'S03', at = '1'] = args;

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 8094;
const server = spawn(process.execPath, [join(root, 'serve.mjs'), String(port)], { stdio: ['ignore', 'inherit', 'inherit'] });
await new Promise((r) => setTimeout(r, 800));

/** 打开一次页面，等页面发来 done（或者超时）。 */
async function run(q, tag, timeoutS) {
  const marker = join(dir, `${tag}.done`);
  rmSync(marker, { force: true });
  const extra = [w && `w=${w}`, h && `h=${h}`, vertical && 'vertical=1', `fps=${fps}`, pageQ].filter(Boolean).join('&');
  const url = `http://localhost:${port}/film.html?${q}&${extra}`;
  if (process.env.FILM_DEBUG) console.log(url);
  const profile = join(dir, '.chrome');
  const p = spawn(chrome, ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--hide-scrollbars',
    `--user-data-dir=${profile}`, '--window-size=1280,800', url], { stdio: 'ignore' });
  const t0 = Date.now();
  while (!existsSync(marker)) {
    if ((Date.now() - t0) / 1000 > timeoutS) { p.kill(); throw new Error(`${tag}: ${timeoutS} 秒没录完`); }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  return (Date.now() - t0) / 1000;
}

function encode(tag) {
  const frames = join(dir, tag);
  const out = join(dir, `${tag}.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${tag}: ffmpeg 失败`);
  rmSync(frames, { recursive: true, force: true });
  return out;
}

async function record(shotId) {
  const s = SHOTS.find((x) => x.id === shotId);
  if (!s) throw new Error(`没有镜头 ${shotId}`);
  const tag = `${shotId}${vertical ? 'v' : ''}`;
  rmSync(join(dir, tag), { recursive: true, force: true });
  const sec = await run(`shot=${shotId}&record=1`, tag, 3600);
  const n = readdirSync(join(dir, tag)).length;
  const out = encode(tag);
  console.log(`${tag} ${s.name}：${n} 帧，渲染 ${sec.toFixed(0)} 秒 → ${out}`);
  return out;
}

try {
  if (mode === 'still') {
    const tag = `${id}${vertical ? 'v' : ''}`;
    const sec = await run(`shot=${id}&still=${at}`, tag, 900);
    console.log(`${tag} 第 ${at} 秒：${sec.toFixed(0)} 秒 → ${join(dir, `${tag}_still_${at}.png`)}`);
  } else if (mode === 'record') {
    await record(id);
  } else if (mode === 'all') { // 粗剪：每个镜头从 0.5 秒处开始取剪辑时长，硬切拼起来（正式剪辑在剪辑软件里配乐、调切点）
    const list = vertical ? VERTICAL : CUT;
    const parts = [];
    for (const [sid, len] of list) parts.push([await record(sid), len]);
    const txt = join(dir, `rough${vertical ? 'v' : ''}.txt`);
    writeFileSync(txt, parts.map(([f, len]) => `file '${f.replace(/\\/g, '/')}'\ninpoint 0.5\noutpoint ${0.5 + len}`).join('\n'));
    const out = join(dir, `rough${vertical ? 'v' : ''}.mp4`);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', txt, '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' });
    console.log(`粗剪 → ${out}`);
  }
} finally {
  server.kill();
}
