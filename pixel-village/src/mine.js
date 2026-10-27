/*
 * 我的居民：这台电脑上自己建的人。浏览器里存一份完整资料（pv.newcomers），另记每人提交到哪一步了（pv.mine）。
 *
 * 大家看的是同一个村子（仓库里的 world/state.json，后台每小时往前过一段）。自己建的人要进这个村子，得「提交到村子」：
 *   打开 GitHub 新建 Issue 的页面，资料已经填好（```pv-resident 代码块），点提交就行（要有 GitHub 账号）。
 *   后台模拟（.github/workflows/pixel-village-sim.yml → tools/intake.mjs）收到就把人放进存档、关掉 Issue；
 *   发 Issue 的 GitHub 账号就是这个人的主人，以后只认这个账号的修改、离村。
 * 没提交、还在等的时候，人先只在自己这台电脑的村子里；改了样子、资料没提交的，也是自己这边先看到。
 *
 * 状态（statusOf）：
 *   local    只在这台电脑上（没提交）
 *   pending  提交了，等入村（后台一般几分钟到一小时）     stale：提交三小时了还没进村（多半 Issue 没提交成功）
 *   in       已经在村子里，和存档里一样
 *   changed  在村子里，这边改过样子 / 资料，还没提交      editing：改动提交了，等后台改
 *   leaving  提交了离村（这边先不显示他）
 */
import { EN, tr } from './i18n.js';
import { signature, pickKeys, JOIN_KEYS, EDIT_KEYS } from './residentSchema.js';

export const REPO = 'ZHAO0424/webxr-todo';
const K = 'pv.newcomers', KM = 'pv.mine';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }; // 隐私窗口存不了：只在这次打开里有效
const STALE = 3 * 3600e3;

export const mine = {
  /** 自己建的人（完整资料）。 */
  list: () => read(K, []),
  save: (arr) => write(K, arr),
  /** 每人提交到哪一步：{ [id]: { sent: { kind, at, sig }, left: true } }。 */
  meta: () => read(KM, {}),
  setMeta(id, m) { const all = read(KM, {}); if (m) all[id] = { ...(all[id] ?? {}), ...m }; else delete all[id]; write(KM, all); },
  ids() { return new Set(this.list().map((p) => p.id)); },
  remove(id) { this.save(this.list().filter((p) => p.id !== id)); this.setMeta(id, null); },
};

/** 这个人走到哪一步了。p：本地那份；w：存档里的那份（没有就是还没进村）。 */
export function statusOf(p, w, meta = mine.meta()[p.id] ?? {}) {
  if (meta.left) return 'leaving';
  const sent = meta.sent, old = sent && Date.now() - sent.at > STALE;
  if (!w) return sent?.kind === 'join' ? (old ? 'stale' : 'pending') : 'local';
  const same = signature(w) === signature(p);
  if (same) return 'in';
  if (sent?.kind === 'edit' && sent.sig === signature(p)) return old ? 'stale' : 'editing';
  return 'changed';
}
export const STATUS = {
  local: [tr('只在这台电脑上', 'Only on this computer'), tr('别人看不到。提交到村子，大家就都能看见他。', 'Others can\'t see them yet. Submit to the village so everyone can.')],
  pending: [tr('等入村', 'Joining soon'), tr('已提交，后台处理好就进村（一般几分钟，最多一小时左右）。', 'Submitted. They\'ll join once it\'s processed (usually minutes, at most about an hour).')],
  stale: [tr('还没处理', 'Not processed yet'), tr('提交好几个小时了还没生效：多半 GitHub 页面上没点「提交」。可以再提交一次。', 'Submitted hours ago but still not applied — most likely Submit was never clicked on the GitHub page. You can submit again.')],
  in: [tr('在村里', 'In the village'), tr('大家都看得见他。', 'Everyone can see them.')],
  changed: [tr('有改动没提交', 'Unsubmitted changes'), tr('改动只在这台电脑上，提交以后大家才看得见。', 'Your changes are only on this computer until you submit them.')],
  editing: [tr('改动等生效', 'Changes pending'), tr('改动已提交，后台处理好就生效。', 'Changes submitted; they\'ll apply once processed.')],
  leaving: [tr('正在离村', 'Leaving'), tr('已提交离村，这台电脑上先不显示他。', 'Leaving submitted; hidden on this computer.')],
};

/** GitHub 新建 Issue 的链接（资料填在代码块里）。kind：join 新来 / edit 改样子资料 / leave 离村。 */
export function issueUrl(kind, p) {
  const keys = kind === 'join' ? JOIN_KEYS : kind === 'edit' ? EDIT_KEYS : [];
  const name = p.name || '?';
  const title = EN
    ? `[Pixel Village] ${kind === 'join' ? 'New resident' : kind === 'edit' ? 'Edit resident' : 'Resident leaves'}: ${name}`
    : `[像素村落] ${kind === 'join' ? '新居民' : kind === 'edit' ? '修改居民' : '居民离村'}：${name}`;
  const intro = EN
    ? (kind === 'join' ? `Please add **${name}** to the shared village.` : kind === 'edit' ? `Update **${name}**'s look and profile.` : `**${name}** is leaving the village.`)
      + '\n\nJust press **Submit new issue** below — the village picks this up automatically (usually within minutes, at most about an hour) and closes the issue. Please don\'t edit the code block.'
    : (kind === 'join' ? `请把 **${name}** 放进大家的村子。` : kind === 'edit' ? `更新 **${name}** 的样子和资料。` : `**${name}** 要离开村子。`)
      + '\n\n直接点下面的 **Submit new issue** 就好：村子会自动处理（一般几分钟，最多一小时左右），处理完自动关掉这条。代码块请不要改。';
  const body = `${intro}\n\n\`\`\`pv-resident\n${JSON.stringify({ v: 1, kind, id: p.id, data: pickKeys(p, keys) })}\n\`\`\`\n`;
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
/** 记下提交了（打开 GitHub 页面的那一刻）。 */
export const markSent = (kind, p) => { if (kind === 'leave') mine.setMeta(p.id, { left: true, sent: { kind, at: Date.now() } }); else mine.setMeta(p.id, { left: undefined, sent: { kind, at: Date.now(), sig: signature(p) } }); };
