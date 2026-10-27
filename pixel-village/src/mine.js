/*
 * 我的居民：这台电脑上自己建的人。浏览器里存一份完整资料（pv.newcomers），另记每人提交到哪一步了（pv.mine）。
 *
 * 大家看的是同一个村子（仓库里的 world/state.json，后台每小时往前过一段）。自己建的人要进这个村子：
 *   默认存到云端（src/cloud.js，Supabase，匿名登录，不用账号）：建好、改好、离村时自动存上去；
 *   连不上云端时先存本机、标「等联网」，下次打开自动再发；还可以改走 GitHub Issue（issueUrl，要 GitHub 账号）。
 *   后台模拟（.github/workflows/pixel-village-sim.yml → tools/intake.mjs）每小时把两边收到的都放进存档。
 *   主人：云端的是这个浏览器的匿名身份，Issue 的是发 Issue 的 GitHub 账号；以后只认主人的修改、离村。
 * 还没进村、改了还没生效的时候，人先按自己这边的样子显示。
 *
 * 状态（statusOf）：
 *   local    只在这台电脑上（没提交）               queued：存云端没成功，等联网了自动再发
 *   pending  提交了，等入村（一存云端就叫后台马上跑，见 cloud.js）       stale：提交三小时了还没进村
 *   rejected 后台退回了（重名、超过三个……），云端那一行的 result 里写着原因
 *   in       已经在村子里，和存档里一样
 *   changed  在村子里，这边改过样子 / 资料，还没提交   editing：改动提交了，等后台改
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

/** 这个人走到哪一步了。p：本地那份；w：存档里的那份（没有就是还没进村）；row：云端那一行（看后台处理结果）。 */
export function statusOf(p, w, meta = mine.meta()[p.id] ?? {}, row = null) {
  if (meta.left) return 'leaving';
  if (meta.queue) return 'queued';
  if (row?.applied_at && row.applied_at >= row.updated_at && /^⚠/.test(row.result ?? '') && (!w || signature(w) !== signature(p))) return 'rejected';
  const sent = meta.sent, old = sent && Date.now() - sent.at > STALE;
  if (!w) return sent?.kind === 'join' ? (old ? 'stale' : 'pending') : 'local';
  const same = signature(w) === signature(p);
  if (same) return 'in';
  if (sent?.kind === 'edit' && sent.sig === signature(p)) return old ? 'stale' : 'editing';
  return 'changed';
}
export const STATUS = { // 你这边（这个浏览器）建好、改好马上就看得见；「世界」= 大家共同的村子，别人打开网页看到的是世界里的样子
  local: [tr('还没上传到世界', 'Not in the shared world yet'), tr('只有你这边看得见。上传到世界，别人打开村子也能看见他。', 'Only you can see them. Upload them to the shared world so everyone can.')],
  queued: [tr('等联网上传', 'Waiting to upload'), tr('已经存在这台电脑上，但没连上世界的服务器。下次打开会自动再上传，也可以点「再试一次」。', 'Saved on this computer, but the world server couldn\'t be reached. It retries next time you open the page, or press Retry.')],
  pending: [tr('正在保存到世界', 'Saving to the world'), tr('你这边已经能看见他了。世界那边一般两三分钟收下，之后别人打开村子也能看见他。', 'You can already see them. The shared world usually takes them in within a few minutes; after that everyone can see them.')],
  stale: [tr('世界还没收下', 'Not in the world yet'), tr('上传好几个小时了，世界那边还没收下。可以再上传一次。', 'Uploaded hours ago but the world still hasn\'t taken them in. You can upload again.')],
  rejected: [tr('世界没收下', 'Not accepted'), ''], // 原因在云端那一行的 result 里
  in: [tr('已保存到世界', 'Saved to the world'), tr('别人打开村子也能看见他。', 'Everyone who opens the village can see them.')],
  changed: [tr('改动还没上传', 'Changes not uploaded'), tr('改动只在你这边，上传以后世界里才跟着变。', 'Your changes are only here; upload them to update the shared world.')],
  editing: [tr('正在把改动存到世界', 'Saving changes to the world'), tr('你这边已经是新样子了。世界那边一般两三分钟跟着变。', 'You already see the new look. The shared world usually updates within a few minutes.')],
  leaving: [tr('正在离开世界', 'Leaving the world'), tr('已经让他离村，你这边先不显示他；世界那边两三分钟后他也走了。', 'They\'ve been told to leave; hidden here, and gone from the shared world within a few minutes.')],
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
/** 记下提交了（存上云端、或者打开 GitHub 页面的那一刻）。 */
export const markSent = (kind, p) => { if (kind === 'leave') mine.setMeta(p.id, { left: true, queue: undefined, sent: { kind, at: Date.now() } }); else mine.setMeta(p.id, { left: undefined, queue: undefined, sent: { kind, at: Date.now(), sig: signature(p) } }); };
/** 存云端没成功：记下要发什么，等联网了再发（离村的这边先不显示）。 */
export const markQueued = (kind, p) => mine.setMeta(p.id, { queue: kind, ...(kind === 'leave' ? { left: true } : {}) });
