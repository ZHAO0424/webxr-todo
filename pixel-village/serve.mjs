// 零依赖静态服务器。WebXR 需要安全上下文，localhost 算安全上下文。
// 用法：node serve.mjs [端口]，然后 PC 上的 Chrome 打开 http://localhost:8080/
import { createServer } from 'node:http';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

// 录片模式（film.html）的帧和日志：POST 上来写到 shots/film/（只在本地用）
const filmDir = join(root, 'shots', 'film');
async function film(req, res, url) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const kind = url.pathname.slice('/film/'.length);
  const name = kind === 'frame' ? url.searchParams.get('name') : kind === 'done' ? `${body}.done` : 'log.txt';
  const file = normalize(join(filmDir, name));
  if (!file.startsWith(filmDir)) { res.writeHead(403).end(); return; }
  await mkdir(dirname(file), { recursive: true });
  if (kind === 'log') { await appendFile(file, `${body}\n`); console.log(`[film] ${body}`); }
  else await writeFile(file, body);
  res.writeHead(204).end();
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname.startsWith('/film/')) { await film(req, res, url); return; }
  const path = decodeURIComponent(url.pathname);
  const file = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`pixel-village: http://localhost:${port}/`));
