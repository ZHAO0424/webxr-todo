// 发布用的压缩合并：把 src/main.js 一路 import 到的模块合成一个文件 dist/main.min.js（去掉注释、缩短变量名），
// three.js 照旧走 index.html 的 import map（CDN），不打进来。
//
// 用法：node tools/bundle.mjs（发布之前跑，和 subset-font.py、preload.mjs 一样；源码改了没重跑，线上跑的就还是旧代码）
//
// 为什么：从国内连 GitHub Pages 常常只有几十 KB/s，七十多个源码文件（注释很多）压缩传输也要 460 KB；
// 合成一个压缩文件约 290 KB，一个请求。本机开发不受影响：index.html 在 localhost 上、或者带 ?src 时直接跑 src/ 里的源码
// （带 ?dist 在本机也跑打包版，发布前用来检查）。旁边生成 main.min.js.map，线上报错时开发者工具里能看到原来的文件和行号。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/main.min.js');
execFileSync('npx', ['-y', 'esbuild@0.24.0', 'src/main.js', '--bundle', '--minify', '--format=esm', '--target=es2022',
  '--external:three', '--external:three/*', '--external:three-mesh-bvh',
  '--charset=utf8', // 中文原样写（转成 \uXXXX 要大一倍多）
  '--legal-comments=none', '--sourcemap', '--sources-content=false', `--outfile=${out}`, '--log-level=warning'], { cwd: root, stdio: 'inherit', shell: true });

// 文件头记一下用的哪版源码（main.js 一路 import 到的所有文件的内容摘要），对不上就知道忘了重跑
const map = JSON.parse(readFileSync(`${out}.map`, 'utf8'));
const h = createHash('sha1');
for (const s of map.sources) h.update(readFileSync(resolve(dirname(out), s)));
const code = readFileSync(out, 'utf8');
writeFileSync(out, `/* 像素村落 打包版（tools/bundle.mjs 生成，别手改）src ${h.digest('hex').slice(0, 12)}，${map.sources.length} 个文件 */\n${code}`);
console.log(`dist/main.min.js：${map.sources.length} 个源码文件 → ${(statSync(out).size / 1024).toFixed(0)} KB，压缩传输约 ${(gzipSync(readFileSync(out)).length / 1024).toFixed(0)} KB`);
