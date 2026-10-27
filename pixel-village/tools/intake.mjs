// 收新居民：读 GitHub 上还开着的「提交到村子」Issue（正文里有 ```pv-resident 代码块，网页 src/mine.js 生成），
// 把新来的、改样子资料的、离村的写进村子存档（world/state.json）；存档提交以后再回帖、关掉这些 Issue。
//
// 用法（GitHub Actions 里，见 .github/workflows/pixel-village-sim.yml；要 GH_TOKEN）：
//   node tools/intake.mjs apply <结果文件> [--state world/state.json]   读 Issue → 改存档 → 结果写进结果文件
//   node tools/intake.mjs close <结果文件>                                按结果回帖、关 Issue（存档推上去以后才跑）
//   本地试：node tools/intake.mjs apply out.json --issues 某个.json      不连 GitHub，从文件读 Issue 列表（gh issue list --json 的格式）
//
// 规矩：
//   - Issue 是谁都能开的，内容不可信：只认 src/residentSchema.js 列出来的字段和值（sanitize）。
//   - 发 Issue 的 GitHub 账号就是这个人的主人（owner）：改样子、离村只认主人。一个账号最多三个居民。
//   - 名字不能和村里已有的人重。
//   - 新来的标 pending：接下来的后台模拟（tools/sim.mjs）读档时让他从村口进村、自己找住处（和网页里「进村」一样）；
//     改了营生的标 pendingJob，读档时换过去。离村的直接从存档里拿掉（他认领的老宅空出来，房子还是修好的样子）。
//   - 同一条 Issue 处理过的（存档里已经有这个 id 的新人、或者改动已经一样）再处理一遍不会出错：push 失败下回重跑也没事。
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
const MAX_PER_OWNER = 3;

if (mode === 'close') {
  const results = JSON.parse(readFileSync(out, 'utf8'));
  for (const r of results) {
    try {
      gh(['issue', 'comment', String(r.n), '--body', r.msg]);
      gh(['issue', 'close', String(r.n), ...(r.ok ? [] : ['--reason', 'not planned'])]);
    } catch (e) { console.log(`#${r.n} 回帖 / 关闭失败：${e.message}`); }
  }
  console.log(`回帖并关掉 ${results.length} 条`);
  process.exit(0);
}
if (mode !== 'apply' || !out) { console.log('用法：node tools/intake.mjs apply|close <结果文件>'); process.exit(1); }

const { sanitize, EDIT_KEYS } = await import('../src/residentSchema.js');
const { RESIDENTS } = await import('../src/residents.js');
const { JOBS } = await import('../src/life/newcomers.js');
const jobs = new Set(JOBS.filter((j) => !j.legacy).map((j) => j.id));

const issues = arg('issues') ? JSON.parse(readFileSync(arg('issues'), 'utf8'))
  : JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,body,author,createdAt']));
const state = JSON.parse(readFileSync(statePath, 'utf8'));
state.newcomers ??= [];
const results = [];
const say = (n, ok, zh, en) => results.push({ n, ok, msg: `${ok ? '✅' : '⚠️'} ${zh}\n\n${en}` });
const taken = (name, self) => RESIDENTS.some((p) => p.name === name) || state.newcomers.some((p) => p.name === name && p.id !== self);

for (const is of issues.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
  const m = /```pv-resident\s*\n([\s\S]*?)\n```/.exec(is.body ?? '');
  if (!m) continue; // 别的 Issue：不管
  const n = is.number, login = is.author?.login;
  let req;
  try { req = JSON.parse(m[1]); } catch { say(n, false, '没看懂提交的资料（代码块被改坏了？）。请在网页上「我的居民」里重新提交。', 'Could not read the submitted data (was the code block edited?). Please submit again from “My residents” on the page.'); continue; }
  if (!login) { say(n, false, '不知道是谁提交的。', 'Could not tell who submitted this.'); continue; }
  const id = typeof req.id === 'string' && /^new_[a-z0-9]{4,24}$/.test(req.id) ? req.id : null;
  const target = id && state.newcomers.find((p) => p.id === id);

  if (req.kind === 'join') {
    if (target) { // 已经收过（上回 push 失败重跑之类）
      if (target.owner === login) say(n, true, `**${target.name}** 已经在村里了。`, `**${target.name}** is already in the village.`);
      else say(n, false, '这个居民编号已经有人用了，请在网页上重新建一个。', 'That resident id is taken; please create the resident again on the page.');
      continue;
    }
    if (state.newcomers.filter((p) => p.owner === login).length >= MAX_PER_OWNER) { say(n, false, `一个 GitHub 账号最多在村里放 ${MAX_PER_OWNER} 个居民。可以先让一个离村。`, `Each GitHub account can have at most ${MAX_PER_OWNER} residents. Let one leave first.`); continue; }
    const { data, errors } = sanitize(req.data, { join: true, jobs });
    if (errors.length) { say(n, false, `没收：${errors.join('、')}。`, 'Not accepted: the resident needs a name.'); continue; }
    if (taken(data.name)) { say(n, false, `村里已经有叫「${data.name}」的了，换个名字再提交吧。`, `Someone named “${data.name}” already lives here — pick another name and submit again.`); continue; }
    const nid = id ?? `new_${Date.now().toString(36)}${n}`;
    state.newcomers.push({ ...data, id: nid, owner: login, pending: true });
    say(n, true, `**${data.name}** 进村了！刷新网页（Ctrl+F5）就能看到：从村口的桥上走进来，先挨家认人，再自己找住处、开张。以后改样子、离村，在网页「我的居民」里用这个 GitHub 账号提交。`,
      `**${data.name}** has joined the village! Refresh the page to see them walk in over the bridge, meet everyone, find a home and start work. Later edits or leaving must be submitted from this same GitHub account via “My residents”.`);
  } else if (req.kind === 'edit' || req.kind === 'leave') {
    if (!target) { say(n, false, '村里没找到这个居民（可能还没进村，或者已经离开了）。', 'This resident is not in the village (not joined yet, or already left).'); continue; }
    if (target.owner !== login) { say(n, false, `只有建这个居民的账号（@${target.owner}）能改他。`, `Only the account that created this resident (@${target.owner}) can change them.`); continue; }
    if (req.kind === 'leave') {
      state.newcomers = state.newcomers.filter((p) => p.id !== id);
      for (const pl of state.plots ?? []) if (pl.owner === id) { pl.owner = null; pl.ownerName = null; }
      const E = state.econ;
      if (E) {
        E.units = E.units.filter((u) => u.id !== id);
        E.ties = E.ties.filter(([k]) => !k.split('|').includes(id));
        E.acc = (E.acc ?? []).filter(([k]) => k !== id);
      }
      say(n, true, `**${target.name}** 离开了村子。`, `**${target.name}** has left the village.`);
      continue;
    }
    const { data, errors } = sanitize(req.data, { join: false, jobs });
    if (errors.length) { say(n, false, `没改：${errors.join('、')}。`, 'Not changed: the resident needs a name.'); continue; }
    if (taken(data.name, id)) { say(n, false, `村里已经有叫「${data.name}」的了，换个名字再提交吧。`, `Someone named “${data.name}” already lives here — pick another name.`); continue; }
    for (const k of EDIT_KEYS) if (k !== 'jobId') { if (data[k] === undefined) delete target[k]; else target[k] = data[k]; } // 摘掉的帽子、配饰也要去掉
    if (data.jobId && data.jobId !== target.jobId) target.pendingJob = data.jobId;
    say(n, true, `**${data.name}** 的样子和资料改好了，刷新网页就能看到。`, `**${data.name}**’s look and profile are updated — refresh the page to see.`);
  }
}

writeFileSync(statePath, JSON.stringify(state));
writeFileSync(out, JSON.stringify(results));
console.log(`处理 ${results.length} 条：收下 ${results.filter((r) => r.ok).length}，退回 ${results.filter((r) => !r.ok).length}`);
