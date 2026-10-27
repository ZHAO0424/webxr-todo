// 后台模拟：在 Node 里跑村子（不画画面），从存档接着过一段时间，再存回去。以后 GitHub Actions 定时跑的就是这个。
//
// 用法：node tools/sim.mjs [--state world/state.json] [--hours 6 | --days 1 | --catchup] [--new] [--season autumn]
//   --state  存档文件（默认 world/state.json）；没有这个文件、或者加了 --new：新开一个村子——
//            老村址的老宅是塌的（废墟开局），从石峪元年头一天早上六点过起
//   --hours / --days  这次往前过多久（村里的时间；默认 1 天）
//   --catchup 补到现在：存档里记着上回存的现实时刻（savedAt），离现在过去了多少现实秒，村里就照网页开着那样走多少秒
//            （村里一天约合现实 50 分钟）。一次最多补 --max 秒（默认 3 小时，免得停了很久之后一次跑太久）
//   --season 新开村子时的季节（读档时用存档里的）
// GitHub Actions 每小时跑一次 --catchup（.github/workflows/pixel-village-sim.yml），存档提交回仓库，网页默认读这份存档。
// 第一次要先在项目目录里 npm install（只装 three，给后台用；网页不需要）。
import './headless.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const statePath = resolve(arg('state', resolve(here, '../world/state.json')));
const fresh = process.argv.includes('--new') || !existsSync(statePath);
const saved = fresh ? null : JSON.parse(readFileSync(statePath, 'utf8'));
const hours = Number(arg('hours', 0)) || Number(arg('days', 1)) * 24;
const catchup = process.argv.includes('--catchup');
const now = Date.now();
const realSecs = catchup ? Math.min(Number(arg('max', 3 * 3600)), Math.max(0, (now - (saved?.savedAt ?? now - 3600e3)) / 1000)) : 0; // 新开村子：先过一个钟头

const season = saved?.season ?? arg('season', 'autumn');
const ruins = saved?.ruins ?? true; // 要模拟的话从残缺的老宅开始
const { setSeason } = await import('../src/season.js');
setSeason(season);
const { setRuins } = await import('../src/east.js');
setRuins(ruins);
const { buildVillage } = await import('../src/village.js');
const { addNewcomer, setJob } = await import('../src/life/newcomers.js');
const { addResident } = await import('../src/residents.js');
const { saveWorld, loadWorld, toJSON, yearOf, yearLabel } = await import('../src/world.js');
const { lunarLabel, lunarOf } = await import('../src/life/events.js');
const { festival } = await import('../src/season.js');

const t0 = performance.now();
const village = buildVillage({ startHour: saved?.hour ?? 6 });
if (saved) loadWorld(village, saved, { addNewcomer, setJob, onNewcomer: addResident });
const built = performance.now() - t0;
const clock = village.life.clock;
const when = () => { const F = festival(); return `${yearLabel(yearOf(clock.day, F.m, F.d))} ${lunarLabel(clock.day)} ${clock.label}`; };
const from = when(), dayStart = clock.day;

// 往前过：每步 0.1 秒（和网页里一样的步长），直到村里的钟走够 hours 个钟头（--catchup：走够 realSecs 现实秒）
const target = (clock.day - 1) * 24 + clock.hour + hours;
let t = 0;
const t1 = performance.now();
if (catchup) while (t < realSecs) { t += 0.1; village.step(t); }
else while ((clock.day - 1) * 24 + clock.hour < target) { t += 0.1; village.step(t); }
const ran = performance.now() - t1;

// 存档记下「村里这一刻」对应的现实时刻：补算时少补了的（超过 --max）就当村子在那段时间里睡着了，下回从现在接着补
const state = saveWorld(village, { season, ruins, savedAt: catchup ? now : Date.now() });
mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, toJSON(state));

const V = village.world, E = V.econ;
const households = [...E.units.values()].filter((u) => u.id !== 'caravan').sort((a, b) => b.coins - a.coins);
console.log(`${fresh ? '新开村子' : '读档'}：${from} → ${when()}（过了 ${clock.day - dayStart} 天多${catchup ? `，补了现实 ${Math.round(realSecs / 60)} 分钟` : ''}）`);
console.log(`建村 ${(built / 1000).toFixed(1)} 秒，模拟 ${(ran / 1000).toFixed(1)} 秒`);
console.log(`老村址：${state.plots.map((p) => `${p.id}:${['塌', '能遮雨', '囫囵'][p.state]}${p.ownerName ? '(' + p.ownerName + ')' : ''}`).join(' ')}`);
console.log(`钱最多的五户：${households.slice(0, 5).map((u) => `${u.id} ${Math.round(u.coins)}文`).join('，')}；成交 ${E.trades.length} 笔`);
console.log(`存到 ${statePath}`);
