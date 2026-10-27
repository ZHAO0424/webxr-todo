/*
 * 云端存居民（Supabase，项目 dfsdksfrrxutmfaysgxz）：玩家在游戏里建、改、让居民离村，直接存到这里，不用 GitHub 账号。
 *
 * - 身份：第一次存的时候自动匿名登录（不用注册），登录凭据存在浏览器里（pv.sb）。换电脑、清了浏览器数据就是另一个人，改不了原来的居民。
 * - 表 public.residents：{ id, owner（自动是自己）, kind join / edit / leave, data 资料, updated_at, applied_at, result }。
 *   数据库的规则（RLS + 列权限）只让每人读写自己的行，applied_at / result 只有后台能写；每人只能有一个居民（离村以后才能再建）。
 * - 后台（.github/workflows/pixel-village-sim.yml → tools/intake.mjs）把 updated_at 比 applied_at 新的行收进村子存档，回写 applied_at 和 result。
 *   什么时候跑：玩家一存（insert / 改了 kind、data），数据库触发器 residents_dispatch 就通过 pg_net 叫 GitHub 马上跑一次（repository_dispatch，
 *   令牌在 Supabase Vault 的 gh_dispatch_token）；另外 pg_cron 每小时叫一次（pv-sim-hourly），GitHub 自己的定时只是备用。
 * - 网络不好：每次请求 15 秒没回就算失败；调用的地方先存本机、标「等联网」，下次打开再发（见 main.js 的 retryQueued）。
 * 这里用的是公开的 publishable key（本来就放在网页里）；管理员密钥只在 GitHub 的私密配置里，后台用。
 */
import { pickKeys, JOIN_KEYS, EDIT_KEYS } from './residentSchema.js';

export const SB_URL = 'https://dfsdksfrrxutmfaysgxz.supabase.co';
const SB_KEY = 'sb_publishable_6Vwp2sQ4rzYXZUKji8BQzQ_5FypDbN_';
const KS = 'pv.sb';
const load = () => { try { return JSON.parse(localStorage.getItem(KS) ?? 'null'); } catch { return null; } };
const keep = (s) => { try { localStorage.setItem(KS, JSON.stringify(s)); } catch { /* 隐私窗口：这次打开里有效 */ } };

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`${SB_URL}${path}`, { method, signal: ctl.signal, headers: { apikey: SB_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body && JSON.stringify(body) });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) throw Object.assign(new Error(data?.message ?? data?.msg ?? `HTTP ${r.status}`), { status: r.status });
    return data;
  } finally { clearTimeout(timer); }
}

/** 登录凭据：有就用（快过期了先续），没有就匿名登录一个。 */
let pending = null;
async function session() {
  const s = load();
  if (s?.access_token && s.expires_at - 60 > Date.now() / 1000) return s;
  return (pending ??= (async () => {
    try {
      let r = null;
      if (s?.refresh_token) r = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } }).catch(() => null);
      r ??= await call('/auth/v1/signup', { method: 'POST', body: {} }); // 匿名登录
      const n = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at ?? Math.floor(Date.now() / 1000) + (r.expires_in ?? 3600), uid: r.user?.id };
      keep(n);
      return n;
    } finally { pending = null; }
  })());
}

export const cloud = {
  /** 存一个人：join 新来 / edit 改样子资料（也带营生）/ leave 离村。成功返回 true，连不上、被拒抛错。 */
  async save(kind, p) {
    if (globalThis.PV_NO_CLOUD) throw Object.assign(new Error('cloud disabled'), { status: 0 }); // 记忆村庄（本地的另一个版本）在 index.html 里关掉：不往像素村落的村子里存
    const s = await session();
    const data = pickKeys(p, kind === 'join' ? JOIN_KEYS : EDIT_KEYS);
    await call('/rest/v1/residents?on_conflict=id', { method: 'POST', token: s.access_token, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { id: p.id, kind, data } });
    return true;
  },
  /** 现在是谁：{ uid, email }（email 没绑就是 null）；还没存过东西（没登录过）返回 null。 */
  who() { const s = load(); return s?.uid ? { uid: s.uid, email: s.email ?? null } : null; },
  /** 绑定邮箱和密码：现在这个匿名身份升级成正式账号（居民还是这些）。换电脑、清了浏览器，用邮箱和密码登录就能找回。 */
  async bind(email, password) {
    const s = await session();
    const u = await call('/auth/v1/user', { method: 'PUT', token: s.access_token, body: { email, password } });
    keep({ ...load(), email: u.email ?? email });
  },
  /** 用邮箱和密码登录（在别的电脑上找回）：换成那个账号的身份。 */
  async login(email, password) {
    const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    keep({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at ?? Math.floor(Date.now() / 1000) + (r.expires_in ?? 3600), uid: r.user?.id, email: r.user?.email ?? email });
  },
  /** 这个账号存过的居民（带资料，找回用）：[{ id, kind, data, … }]。 */
  async mine() {
    const s = await session();
    return call('/rest/v1/residents?select=id,kind,data,updated_at,applied_at,result', { token: s.access_token });
  },
  /** 自己存过的行（看后台处理了没有、退回的原因）：{ id → { kind, updated_at, applied_at, result } }。没登录过 / 连不上返回 null。 */
  async rows() {
    if (!load()) return null;
    try {
      const s = await session();
      const list = await call('/rest/v1/residents?select=id,kind,updated_at,applied_at,result', { token: s.access_token });
      return Object.fromEntries(list.map((r) => [r.id, r]));
    } catch { return null; }
  },
};
