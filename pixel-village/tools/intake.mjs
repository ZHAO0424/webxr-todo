// 收新居民：把玩家提交的新来的、改样子资料的、离村的写进村子存档（world/state.json）；存档提交以后再回结果。两个来源：
//   - 云端（Supabase 的 public.residents，网页 src/cloud.js 写的）：updated_at 比 applied_at 新的行。回结果 = 写回 applied_at、result（网页「我的居民」里显示）。
//     要环境变量 SUPABASE_SERVICE_KEY（GitHub 仓库的私密配置；没有就跳过云端）。
//   - GitHub Issue（正文里有 ```pv-resident 代码块，网页 src/mine.js 的 issueUrl 生成；连不上云端时的后路）。回结果 = 回帖、关 Issue。要 GH_TOKEN。
//
// 用法（GitHub Actions 里，见 .github/workflows/pixel-village-sim.yml）：
//   node tools/intake.mjs apply <结果文件> [--state world/state.json]   收 → 改存档 → 结果写进结果文件
//   node tools/intake.mjs close <结果文件>                                按结果回帖关 Issue、写回云端（存档推上去以后才跑）
//   本地试：node tools/intake.mjs apply out.json --issues 某个.json --rows 某个.json   不连 GitHub / 云端，从文件读
//
// 规矩：
//   - 提交是谁都能发的，内容不可信：只认 src/residentSchema.js 列出来的字段和值（sanitize）。
//   - 主人（owner）：Issue 的是发 Issue 的 GitHub 账号；云端的是 sb:匿名身份。改样子、离村只认主人。每个主人只能有一个居民。
//   - 名字不能和村里已有的人重。
//   - 新来的标 pending：接下来的后台模拟（tools/sim.mjs）读档时让他从村口进村、自己找住处（和网页里「进村」一样）；
//     改了营生的标 pendingJob，读档时换过去。离村的直接从存档里拿掉（他认领的老宅空出来，房子还是修好的样子）。
//   - 处理过的再处理一遍不会出错：push 失败下回重跑也没事（云端写回时带着当时的 updated_at，处理期间玩家又改了的不会被误标成处理过）。
import './headless.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [mode, out] = process.argv.slice(2);
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? null : process.argv[i + 1]; };
const statePath = resolve(arg('state') ?? resolve(here, '../world/state.json'));
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' });
const MAX_PER_OWNER = 1; // 一个浏览器（一个身份 / 一个 GitHub 账号）一个居民
const SB_URL = process.env.SUPABASE_URL ?? 'https://dfsdksfrrxutmfaysgxz.supabase.co', SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const sb = async (path, { method = 'GET', body } = {}) => {
  const r = await fetch(`${SB_URL}${path}`, { method, headers: { apikey: SB_KEY, ...(SB_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};

if (mode === 'close') {
  const results = JSON.parse(readFileSync(out, 'utf8'));
  for (const r of results) {
    try {
      if (r.n) { // Issue：回帖、关掉
        gh(['issue', 'comment', String(r.n), '--body', r.msg]);
        gh(['issue', 'close', String(r.n), ...(r.ok ? [] : ['--reason', 'not planned'])]);
      } else if (r.row && SB_KEY) { // 云端：写回处理过了（玩家在处理期间又改了的话 updated_at 对不上，这行不动，下回再收）
        await sb(`/rest/v1/residents?id=eq.${encodeURIComponent(r.row)}&updated_at=eq.${encodeURIComponent(r.at)}`, { method: 'PATCH', body: { applied_at: new Date().toISOString(), result: r.msg } });
      }
    } catch (e) { console.log(`${r.n ? `#${r.n}` : r.row} 回结果失败：${e.message}`); }
  }
  console.log(`回了 ${results.length} 条结果`);
  process.exit(0);
}
if (mode !== 'apply' || !out) { console.log('用法：node tools/intake.mjs apply|close <结果文件>'); process.exit(1); }

const { sanitize, EDIT_KEYS } = await import('../src/residentSchema.js');
const { RESIDENTS } = await import('../src/residents.js');
const { JOBS } = await import('../src/life/newcomers.js');
const jobs = new Set(JOBS.filter((j) => !j.legacy).map((j) => j.id));

// 两个来源排成一队：{ ref（回结果用）, owner, req: { kind, id, data }, at（先后） }
const queue = [];
const issues = arg('issues') ? JSON.parse(readFileSync(arg('issues'), 'utf8'))
  : process.env.GH_TOKEN ? JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,body,author,createdAt'])) : [];
for (const is of issues) {
  const m = /```pv-resident\s*\n([\s\S]*?)\n```/.exec(is.body ?? '');
  if (!m) continue; // 别的 Issue：不管
  let req = null;
  try { req = JSON.parse(m[1]); } catch { /* 下面按看不懂退回 */ }
  queue.push({ ref: { n: is.number }, owner: is.author?.login, req, at: String(is.createdAt) });
}
const rows = arg('rows') ? JSON.parse(readFileSync(arg('rows'), 'utf8'))
  : SB_KEY ? await sb('/rest/v1/residents?select=id,owner,kind,data,updated_at,applied_at&order=updated_at').catch((e) => { console.log(`云端读不到：${e.message}`); return []; }) : [];
for (const r of rows) {
  if (r.applied_at && new Date(r.applied_at) >= new Date(r.updated_at)) continue; // 处理过了、之后没再改
  queue.push({ ref: { row: r.id, at: r.updated_at }, owner: `sb:${r.owner}`, req: { kind: r.kind, id: r.id, data: r.data }, at: r.updated_at });
}

const state = JSON.parse(readFileSync(statePath, 'utf8'));
state.newcomers ??= [];
const results = [];
const taken = (name, self) => RESIDENTS.some((p) => p.name === name) || state.newcomers.some((p) => p.name === name && p.id !== self);
const who = (o) => (o.startsWith('sb:') ? '' : `（@${o}）`);

for (const { ref, owner, req, at } of queue.sort((a, b) => a.at.localeCompare(b.at))) {
  const say = (ok, zh, en) => results.push({ ...ref, ok, msg: `${ok ? '✅' : '⚠️'} ${zh}\n\n${en}` });
  if (!req || typeof req !== 'object') { say(false, '没看懂提交的资料（代码块被改坏了？）。请在网页上「我的居民」里重新提交。', 'Could not read the submitted data (was the code block edited?). Please submit again from "My residents" on the page.'); continue; }
  if (!owner) { say(false, '不知道是谁提交的。', 'Could not tell who submitted this.'); continue; }
  const id = typeof req.id === 'string' && /^new_[a-z0-9]{4,24}$/.test(req.id) ? req.id : null;
  const target = id && state.newcomers.find((p) => p.id === id);
  let kind = req.kind;
  if (kind === 'join' && target && target.owner === owner) kind = 'edit'; // 已经在村里了（网页还没读到最新存档就又存了一次）：当成修改

  if (kind === 'join') {
    if (target) { say(false, '这个居民编号已经有人用了，请在网页上重新建一个。', 'That resident id is taken; please create the resident again on the page.'); continue; }
    if (state.newcomers.filter((p) => p.owner === owner).length >= MAX_PER_OWNER) { say(false, '每人只能在村里放一个居民。让原来那个离村以后才能再建。', 'You can only have one resident. Let the current one leave first.'); continue; }
    const { data, errors } = sanitize(req.data, { join: true, jobs });
    if (errors.length) { say(false, `没收：${errors.join('、')}。`, 'Not accepted: the resident needs a name.'); continue; }
    if (taken(data.name)) { say(false, `村里已经有叫「${data.name}」的了，换个名字再提交吧。`, `Someone named "${data.name}" already lives here. Pick another name and submit again.`); continue; }
    state.newcomers.push({ ...data, id: id ?? `new_${Date.now().toString(36)}${ref.n ?? ''}`, owner, pending: true });
    say(true, `${data.name} 进村了！刷新网页（Ctrl+F5）就能看到：从村口的桥上走进来，先挨家认人，再自己找住处、开张。`,
      `${data.name} has joined the village! Refresh the page to see them walk in over the bridge, meet everyone, find a home and start work.`);
  } else if (kind === 'edit' || kind === 'leave') {
    if (!target && kind === 'leave') { say(true, '还没进村就取消了。', 'Cancelled before joining.'); continue; } // 提交了还没收就又让他走：当没来过
    if (!target) { say(false, '村里没找到这个居民（可能还没进村，或者已经离开了）。', 'This resident is not in the village (not joined yet, or already left).'); continue; }
    if (target.owner !== owner) { say(false, `只有建这个居民的人${who(target.owner)}能改他。`, 'Only whoever created this resident can change them.'); continue; }
    if (kind === 'leave') {
      state.newcomers = state.newcomers.filter((p) => p.id !== id);
      for (const pl of state.plots ?? []) if (pl.owner === id) { pl.owner = null; pl.ownerName = null; }
      const E = state.econ;
      if (E) {
        E.units = E.units.filter((u) => u.id !== id);
        E.ties = E.ties.filter(([k]) => !k.split('|').includes(id));
        E.acc = (E.acc ?? []).filter(([k]) => k !== id);
      }
      say(true, `${target.name} 离开了村子。`, `${target.name} has left the village.`);
      continue;
    }
    const { data, errors } = sanitize(req.data, { join: false, jobs });
    if (errors.length) { say(false, `没改：${errors.join('、')}。`, 'Not changed: the resident needs a name.'); continue; }
    if (taken(data.name, id)) { say(false, `村里已经有叫「${data.name}」的了，换个名字再提交吧。`, `Someone named "${data.name}" already lives here. Pick another name.`); continue; }
    for (const k of EDIT_KEYS) if (k !== 'jobId') { if (data[k] === undefined) delete target[k]; else target[k] = data[k]; } // 摘掉的帽子、配饰也要去掉
    if (data.jobId && data.jobId !== target.jobId) target.pendingJob = data.jobId;
    say(true, `${data.name} 的样子和资料改好了，刷新网页就能看到。`, `${data.name}'s look and profile are updated. Refresh the page to see.`);
  } else say(false, '看不懂要做什么。', 'Unknown request.');
}

writeFileSync(statePath, JSON.stringify(state));
writeFileSync(out, JSON.stringify(results));
console.log(`处理 ${results.length} 条（Issue ${results.filter((r) => r.n).length}，云端 ${results.filter((r) => r.row).length}）：收下 ${results.filter((r) => r.ok).length}，退回 ${results.filter((r) => !r.ok).length}`);
