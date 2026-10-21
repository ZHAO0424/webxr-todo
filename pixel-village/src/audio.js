import * as THREE from 'three';
import { makeSynth } from './synth.js';

/*
 * 村子的声音：什么时候、在哪儿响。原则是"安静为主，有事才响"：
 *
 * - 没有一直响的底子（风声、溪水是噪声合成的，听着像收音机杂音，去掉了）；下雨天才有雨声。
 * - 时不时来一下：白天偶尔一声鸟叫，夜里偶尔一阵蛐蛐（真实录音，在听者周围随机一处）。
 * - 点了才响：点动物 → 它叫一声；点打铁炉、石磨、火塘、鸡窝、猪圈、戏台、土地庙……→ 对应的声音。
 * - 凑近了才响：镜头 / XR 里的头凑到动物跟前（NEAR 米以内），它偶尔叫；凑近干活的人，锤子落下"当"、斧子劈下去、锄头落地；
 *   凑近石磨、碾子，牲口拉着转就有隆隆声。离远了这些都听不见。
 * - 特定时候：清早公鸡各打两三声鸣（小声）；办活动时人群嗡嗡、唱戏（板胡梆子锣，合成）、篝火、放电影的放映机、祭土地摇铃；
 *   深夜打更的梆子和小锣。
 *
 * 声源都放在村子坐标（米）里，听者 = 相机（换算到村子坐标），HRTF 声像：分得出左右，离得越远越小。
 * 录音素材在 sfx/（Freesound，CC0，来源见 sfx/CREDITS.md），合成的音色在 synth.js。
 * 浏览器要先有一次点击才能出声：第一次点页面时自动打开（除非点过"声音"按钮关掉）。
 */

const REF = 28; // 参考距离（米）：这么远的时候是原音量
const NEAR = 14; // 凑到这么近，动物才会自己叫
const WORK_NEAR = 45; // 干活的声音在这个距离以内才放
const AUDIBLE = 160; // 再远的一次性声音就不播了

const SAMPLES = ['rooster', 'hen', 'dog', 'pig', 'sheep', 'donkey', 'ox', 'duck', 'goose', 'pigeon', 'magpie', 'cat', 'clang', 'chop', 'thud', 'chirp', 'crickets', 'fire', 'mill', 'crowd', 'projector'];
const LONG = new Set(['crickets', 'fire', 'mill', 'crowd', 'projector']); // 长录音（循环用），不等它们
const ANIMAL = { rooster: 'rooster', hen: 'hen', henBrown: 'hen', dog: 'dog', dogBlack: 'dog', pig: 'pig', sheep: 'sheep', donkey: 'donkey', ox: 'ox', duck: 'duck', goose: 'goose', pigeon: 'pigeon', magpie: 'magpie', cat: 'cat' };
// 点物件时放什么：录音名，或 synth:合成音色
const THING_SOUND = { forge: 'clang', millstone: 'mill', roller: 'mill', firePit: 'fire', coop: 'hen', pigsty: 'pig', shed: 'ox', duckHouse: 'duck', movieScreen: 'projector', stage: 'synth:gong', shrine: 'synth:bell', well: 'synth:block', lumber: 'chop', firewood: 'chop', workbench: 'chop' };

export function createSound(village, getCamera) {
  let ctx = null, master = null, on = false, S = null, ready = false, muted = false;
  const V = village.life.people[0].V;
  const BUF = {};
  const prevK = new Map();
  const cool = new Map();
  const crowed = new Map(); // 公鸡今天早上叫了几声
  let lp = new THREE.Vector3();
  const op = {}; // 唱戏的拍子
  let nextBird = 3, nextCricket = 5; // 按村子的秒数（t）算

  const thing = (k) => village.things.find((t) => t.thing === k);
  const centerOf = (t) => t && [(t.box.min.x + t.box.max.x) / 2, t.box.min.y + 0.8, (t.box.min.z + t.box.max.z) / 2];
  const dist = ([x, y, z]) => Math.hypot(x - lp.x, y - lp.y, z - lp.z);
  const posOf = (o, h = 0.6) => [o.pos.x, o.pos.y + h, o.pos.z];

  /** 一个声源的位置。life 秒后自动断开（一次性的声音用）。 */
  function panner([x, y, z] = [0, 0, 0], life = 0) {
    const p = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: REF, rolloffFactor: 1.4, maxDistance: 3000 });
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    p.connect(master);
    if (life) setTimeout(() => p.disconnect(), life * 1000);
    return p;
  }

  const stats = {}; // 各种声音响了几次（无头检查用）
  const count = (k) => { stats[k] = (stats[k] ?? 0) + 1; };

  /** 放一段录音。pos = null：不分方向（点击时用，保证听得见）。dur：只放一段（长录音截一截，带淡入淡出）。 */
  function sample(key, pos, { gain = 1, dur = 0, offset = 0, jitter = 0.06 } = {}) {
    count(key);
    const b = BUF[key];
    if (!b || (pos && dist(pos) > AUDIBLE)) return;
    const s = new AudioBufferSourceNode(ctx, { buffer: b, playbackRate: 1 + (Math.random() * 2 - 1) * jitter });
    const g = new GainNode(ctx, { gain: 0 });
    const t = ctx.currentTime + 0.02, len = Math.min(dur || b.duration, b.duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + (dur ? 0.25 : 0.005));
    g.gain.setValueAtTime(gain, t + Math.max(0.01, len - (dur ? 0.4 : 0.02)));
    g.gain.linearRampToValueAtTime(0, t + len);
    s.connect(g).connect(pos ? panner(pos, len + 1) : master);
    if (!pos) setTimeout(() => g.disconnect(), (len + 1) * 1000);
    s.start(t, offset ? offset % Math.max(0.1, b.duration - len) : 0, len + 0.05);
  }
  function synth(name, pos, when = 0, ...a) {
    count(name);
    if (pos && dist(pos) > AUDIBLE) return;
    S.SFX[name](ctx.currentTime + 0.02 + when, pos ? panner(pos, 5) : master, ...a);
  }

  // ---------------------------------------------------------------- 持续的声源（音量按情况调，大多数时候是 0）

  function loop(pos, make) {
    const p = panner(pos);
    const g = new GainNode(ctx, { gain: 0 });
    g.connect(p);
    make(g);
    return { g, p, level: 0, set(v, k = 0.6) { if (Math.abs(v - this.level) > 0.002) { this.level = v; g.gain.setTargetAtTime(v, ctx.currentTime, k); } }, move([x, y, z]) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } };
  }
  // 长录音循环：加载完了再接上（短的音效先能用）
  const bufLoop = (key) => (out) => LOAD[key].then((b) => { if (!b) return; const s = new AudioBufferSourceNode(ctx, { buffer: b, loop: true }); s.connect(out); s.start(0, Math.random() * b.duration); });

  let rain, mill, roller, fire, firePos, crowd, projector;

  function setup() {
    const L = S.LOOPS;
    rain = new GainNode(ctx, { gain: 0 }); L.rain(rain); rain.connect(master);
    mill = loop(centerOf(thing('millstone')), bufLoop('mill'));
    roller = loop(centerOf(thing('roller')), bufLoop('mill'));
    firePos = centerOf(thing('firePit'));
    fire = loop(firePos, bufLoop('fire'));
    crowd = loop([0, 0, 0], bufLoop('crowd'));
    projector = loop(centerOf(thing('movieScreen')), bufLoop('projector'));
    ready = true;
  }

  const LOAD = {};
  async function loadAll() {
    for (const k of SAMPLES) LOAD[k] = (async () => {
      try { BUF[k] = await ctx.decodeAudioData(await (await fetch(`sfx/${k}.mp3`)).arrayBuffer()); count('loaded'); } catch (e) { console.warn('音效加载失败', k, e); count('failed'); }
      return BUF[k];
    })();
    await Promise.all(SAMPLES.filter((k) => !LONG.has(k)).map((k) => LOAD[k]));
    setup();
  }

  /** 唱戏：每一拍排一次（合成）。 */
  function opera(fiddler, singer) {
    if (ctx.currentTime < (op.next ?? 0) - 0.1) return;
    count('opera');
    S.operaStep(op, panner(posOf(fiddler, 1), 4), singer && panner(posOf(singer, 1.4), 4));
  }

  // ---------------------------------------------------------------- 每帧

  function listener() {
    const cam = getCamera();
    const root = village.object;
    const p = cam.getWorldPosition(new THREE.Vector3());
    const f = cam.getWorldDirection(new THREE.Vector3()).add(p);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())).add(p);
    root.worldToLocal(p); root.worldToLocal(f); root.worldToLocal(u);
    f.sub(p).normalize(); u.sub(p).normalize();
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    lp = p;
  }

  function update(t, dt) {
    if (!on || !ready) return;
    count('frames');
    listener();
    const now = ctx.currentTime;
    const clock = village.life.clock, hour = clock.hour, night = hour >= 20 || hour < 5;
    const weather = V.weather();
    const people = village.life.people, beasts = village.life.beasts;
    const near = (pos, r) => pos && dist(pos) < r;

    // 下雨天才有雨声（风声、溪水这类一直响的噪声底子听着像收音机杂音，去掉了）
    rain.gain.setTargetAtTime(weather === 'rain' ? 0.14 : 0, now, 1);

    // 时不时：白天鸟叫、夜里蛐蛐（在听者周围随机一处）
    const around = () => [lp.x + (Math.random() - 0.5) * 50, lp.y - 20, lp.z + (Math.random() - 0.5) * 50];
    if (!night && hour > 5.5 && weather !== 'rain' && t > nextBird) { sample('chirp', around(), { gain: 0.7 }); nextBird = t + 10 + Math.random() * 18; }
    if ((hour >= 19.5 || hour < 4.8) && weather !== 'rain' && t > nextCricket) { sample('crickets', around(), { dur: 3 + Math.random() * 3, offset: Math.random() * 30, jitter: 0, gain: 0.8 }); nextCricket = t + 12 + Math.random() * 20; }

    // 清早：每只公鸡叫两三声
    if (hour > 4.9 && hour < 6.6) {
      for (const b of beasts) {
        if (b.s.kind !== 'rooster') continue;
        const c = crowed.get(b), n = c?.day === clock.day ? c.n : 0;
        if (n >= 3 || t < (cool.get(b) ?? 0) || Math.random() > 0.08 * dt) continue;
        sample('rooster', posOf(b, 0.5));
        crowed.set(b, { day: clock.day, n: n + 1 });
        cool.set(b, t + 12 + Math.random() * 20);
      }
    }

    // 磨盘、碾子：牲口拉着转、而且凑近了才听得见
    mill.set(beasts.some((b) => b.circling && b.s.role !== 'ox') && near(centerOf(thing('millstone')), 40) ? 0.6 : 0);
    roller.set(beasts.some((b) => b.circling && b.s.role === 'ox') && near(centerOf(thing('roller')), 40) ? 0.6 : 0);

    // 活动：篝火、放电影、人群
    fire.set(V.bonfire?.lit ? 0.5 : 0);
    projector.set(V.eventOn('movie') && hour >= 19.2 ? 0.35 : 0);
    let best = null, bestN = 0;
    if (V.eventOn(V.today())) { // 办活动的时候，人最多的那一堆有人声
      for (const v of people) {
        if (v.inside || v.state === 'walk') continue;
        let n = 0, sx = 0, sz = 0;
        for (const o of people) if (!o.inside && Math.abs(o.pos.x - v.pos.x) < 5 && Math.abs(o.pos.z - v.pos.z) < 5) { n++; sx += o.pos.x; sz += o.pos.z; }
        if (n > bestN) { bestN = n; best = [sx / n, v.pos.y + 1, sz / n]; }
      }
    }
    if (best && bestN >= 4) { crowd.move(best); crowd.set(Math.min(0.6, 0.08 * bestN)); } else crowd.set(0);
    const fiddler = people.find((v) => v.state === 'fiddle');
    if (fiddler) opera(fiddler, people.find((v) => v.state === 'sing'));
    if (V.eventOn('shrine') && t > (cool.get('shrine') ?? 0)) { const s = centerOf(thing('shrine')); if (s) synth('bell', s); cool.set('shrine', t + 8 + Math.random() * 8); }

    // 打更：边走边敲梆子，每隔一会儿一声小锣
    const watch = people.find((v) => v.doing === 'nightWatch' && !v.inside);
    if (watch && t > (cool.get(watch) ?? 0)) {
      const p = posOf(watch, 1);
      synth('block', p); synth('block', p, 0.35);
      if (Math.random() < 0.4) synth('gong', p, 0.8);
      cool.set(watch, t + 6 + Math.random() * 4);
    }

    // 干活：锤子 / 斧子 / 锄头落下的那一刻（和 voxel.js 的动作同一个节奏），凑近了才听得见
    for (const v of people) {
      if (v.inside || v.state !== 'work') { prevK.delete(v); continue; }
      const item = v.char.item;
      const rate = item === 'hammer' ? 1.2 : item === 'axe' ? 1.08 : item === 'hoe' ? 0.9 : 0;
      if (!rate) continue;
      const k = ((t + v.phase) * rate) % 1;
      const pk = prevK.get(v);
      prevK.set(v, k);
      if (pk !== undefined && k < pk && near(posOf(v), WORK_NEAR)) sample(item === 'hammer' ? 'clang' : item === 'axe' ? 'chop' : 'thud', posOf(v), { gain: 0.8 });
    }

    // 动物：凑到跟前才偶尔叫一声；狗看见生人走近会叫（也得离得不远）
    for (const b of beasts) {
      const key = ANIMAL[b.s.kind];
      if (!key || b.home || key === 'rooster' || t < (cool.get(b) ?? 0)) continue;
      const d = dist(posOf(b, 0.5));
      let p = d < NEAR ? 0.06 : 0;
      if (key === 'dog' && d < 30 && people.some((v) => !v.inside && v.state === 'walk' && v.p.id !== b.s.owner && Math.abs(v.pos.x - b.pos.x) < 2 && Math.abs(v.pos.z - b.pos.z) < 2)) p = 0.4;
      if (night) p *= 0.2;
      if (p && Math.random() < p * dt) { sample(key, posOf(b, 0.5)); cool.set(b, t + 8 + Math.random() * 8); }
    }
  }

  function enable() {
    if (!ctx) {
      ctx = new AudioContext();
      S = makeSynth(ctx);
      master = new GainNode(ctx, { gain: 0.9 });
      master.connect(new DynamicsCompressorNode(ctx, { threshold: -18, ratio: 4 })).connect(ctx.destination);
      loadAll();
    }
    on = true;
    ctx.resume();
  }

  return {
    stats,
    get on() { return on; },
    get ready() { return ready; },
    /** "声音"按钮：开 / 关。 */
    toggle() {
      if (on) { on = false; muted = true; ctx.suspend(); } else { muted = false; enable(); }
      return on;
    },
    /** 页面上第一次点击：自动打开声音（除非用户关过）。 */
    wake() { if (!on && !muted) enable(); return on; },
    /** 点了动物：叫一声（不分方向，保证听得见）。 */
    clickBeast(b) { const k = ANIMAL[b.s.kind]; if (on && ready && k) sample(k, null, { gain: 0.9 }); },
    /** 点了物件：放对应的声音。 */
    clickThing(t) {
      const k = THING_SOUND[t.thing];
      if (!on || !ready || !k) return;
      if (k.startsWith('synth:')) synth(k.slice(6), null);
      else sample(k, null, { gain: 0.9, dur: ['mill', 'fire', 'projector'].includes(k) ? 2.5 : 0, offset: Math.random() * 8 });
    },
    update,
  };
}
