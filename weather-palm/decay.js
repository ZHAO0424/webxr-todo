// 掌心气象台 · 树的残骸：烧掉以后不会凭空消失，而是一步步衰败、回到土里
//
//   活树 ──烧（火 / 岩浆）──▶ 焦树干（枝叶没了，炭化的干立着，刚烧完还透着红）
//        ──雨淋、风刮、水冲、再烧、岩浆舔──▶ 塌成一堆木炭渣
//        ──风吹成灰、雨水冲走、岩浆埋掉──▶ 没了（灰落进土里：那一片长得快）
//        ──地上又绿了、歇够了──▶ 原地重新冒出小树
//
// 纯数据、不碰 three.js：输入一棵树的状态和它脚下的环境，输出新状态和事件（给画面出特效）。
// 时间尺度按"看得见的上帝视角"压缩过：什么都不做，焦树干约 2 分钟塌，炭堆再约 1.5 分钟散完。

export const STAGE = { ALIVE: 0, SNAG: 1, CHAR: 2, GONE: 3 };

const SNAG_LIFE = 120;   // 秒：放着不管多久塌
const CHAR_LIFE = 90;    // 秒：炭堆放着不管多久散完
const REGROW_REST = 45;  // 秒：灰散完以后至少歇多久才重新长

// 烧了：变成焦树干。已经是残骸的再烧一遍，只是加速它垮掉（在 stepRemains 里按 fire 算）
export function burnTree(t) {
  if (t.stage && t.stage !== STAGE.ALIVE) return false;
  t.stage = STAGE.SNAG; t.hp = 1; t.glow = 1; t.pile = 0; t.rest = 0;
  return true;
}

// env：rain 0–1、wind 风速（0–1+）、flow 地表水流速（m/s 量级 0–0.004）、water 积水深（米）、
//      lava 脚下岩浆厚（米）、fire 这一格还在烧（>0）、green 地上草长得怎样 0–1、th 这棵树冒头的门槛
// 返回事件数组：{type:'quench'} 雨浇灭余火 / 'collapse' 塌成炭堆 / 'ash' 风吹起一股灰 / 'wash' 水冲走一点炭 / 'gone' 散完 / 'bury' 被岩浆埋了 / 'regrow' 重新长
export function stepRemains(t, env, dt, rnd = Math.random) {
  const ev = [];
  const rain = env.rain || 0, wind = env.wind || 0, flow = env.flow || 0, lava = env.lava || 0, fire = env.fire > 0 ? 1 : 0;
  if (t.stage === STAGE.SNAG) {
    // 余烬：自己慢慢暗下去，下雨一浇就灭（冒白汽）
    if (t.glow > 0) {
      const g0 = t.glow;
      t.glow = Math.max(0, t.glow - dt * (1 / 25 + rain * 0.8 + (env.water > 0.0002 ? 0.5 : 0)));
      if (g0 > 0.15 && t.glow <= 0.15 && rain > 0.2) ev.push({ type: 'quench' });
    }
    // 垮掉：时间 + 雨泡（炭吸水变脆）+ 风推 + 水冲根 + 再烧 + 岩浆舔
    let wear = 1 / SNAG_LIFE + rain * 0.012 + Math.max(0, wind - 0.2) * 0.02 + flow * 6 + fire * 0.08 + (lava > 0.00008 ? 0.35 : 0);
    if (wind > 0.7 && rnd() < dt * 0.05) wear += 0.4 / Math.max(dt, 1e-3);   // 一阵大风：直接吹倒
    t.hp -= dt * wear;
    if (t.hp <= 0) { t.stage = STAGE.CHAR; t.hp = 0; t.pile = 1; t.glow = Math.max(t.glow, fire ? 0.6 : 0); ev.push({ type: 'collapse' }); }
  } else if (t.stage === STAGE.CHAR) {
    if (lava > 0.0003) { t.stage = STAGE.GONE; t.pile = 0; t.rest = 0; ev.push({ type: 'bury' }); return ev; }   // 岩浆漫过来：埋了
    t.glow = Math.max(0, (t.glow || 0) - dt * (1 / 15 + rain));
    const blow = Math.max(0, wind - 0.15) * 0.02, wash = rain * 0.012 + flow * 5;
    t.pile -= dt * (1 / CHAR_LIFE + blow + wash + fire * 0.03);
    if (blow > 0 && rnd() < dt * (1 + wind * 4)) ev.push({ type: 'ash' });
    if (wash > 0.002 && rnd() < dt * 2) ev.push({ type: 'wash' });
    if (t.pile <= 0) { t.stage = STAGE.GONE; t.pile = 0; t.rest = 0; ev.push({ type: 'gone' }); }
  } else if (t.stage === STAGE.GONE) {
    t.rest = (t.rest || 0) + dt;
    if (t.rest > REGROW_REST && (env.green ?? 0) > (env.th ?? 0.4) + 0.1 && lava < 1e-6 && !fire && rnd() < dt * 0.05) {
      t.stage = STAGE.ALIVE; t.rest = 0; ev.push({ type: 'regrow' });
    }
  }
  return ev;
}

// 画面用：焦树干还剩多高（0–1）。塌之前一直是整根，最后 15% 的寿命里开始断（往下矮）
export const snagHeight = (t) => t.stage !== STAGE.SNAG ? 0 : Math.min(1, 0.35 + t.hp / 0.15 * 0.65);
