/*
 * 村子的声音：全部用 Web Audio 现场合成，不带任何音频文件。
 *
 * 音色在 synth.js（试听页 sounds.html 也用它），这里只管"什么时候、在哪儿响"。
 *
 * - 位置：每个声源放在村子坐标（米）里，听者 = 相机（换算到村子坐标），用 HRTF 声像，离得越远越小、左右分得出。
 *   沙盘是缩小的，整村看过去大约一百多米远，所以参考距离取得大（REF）。
 * - 底噪（不分方向）：风；白天的鸟叫、夜里的蛐蛐；下雨。
 * - 一直响的：溪水（沿溪几处）、磨盘 / 碾子（驴、牛拉着转的时候）、篝火噼啪、人多的地方人声嗡嗡、放电影的放映机。
 * - 跟着动作响的：打铁（锤子落下那一刻"当"）、劈柴、锄地；跟人物动画用同一个时间算，砸下去才响。
 * - 唱戏：板胡拉一段五声音阶的曲子、梆子打板、锣；台上的人"唱"出带颤音的元音。
 * - 打更：梆子"梆、梆"+ 一声小锣。
 * - 动物：鸡打鸣（天亮前后）、母鸡咯咯、狗见了生人叫、猪哼哼、羊咩咩、驴叫、牛哞、鸭子嘎嘎、鹅、鸽子咕咕、喜鹊喳喳、猫叫。
 * 浏览器要求先有一次点击才能出声，所以默认关着，点"声音"按钮打开。
 */

import * as THREE from 'three';
import { makeSynth } from './synth.js';

const REF = 28; // 参考距离（米）：这么远的时候是原音量
const AUDIBLE = 160; // 再远的一次性声音就不播了

export function createSound(village, getCamera) {
  let ctx = null, master = null, on = false, S = null;
  const V = village.life.people[0].V;
  const prevK = new Map();
  const cool = new Map();
  let lp = { x: 0, y: 0, z: 0 };
  const op = {}; // 唱戏的拍子
  let nextBird = 0, nextCricket = 0, nextCrackle = 0; // 鸟、蛐蛐、篝火、冷却按村子的秒数（t）算，排声音按音频时钟

  const thing = (k) => village.things.find((t) => t.thing === k);
  const centerOf = (t) => t && [(t.box.min.x + t.box.max.x) / 2, t.box.min.y + 0.8, (t.box.min.z + t.box.max.z) / 2];

  /** 一个声源的位置。life 秒后自动断开（一次性的声音用）。 */
  function panner([x, y, z] = [0, 0, 0], life = 0) {
    const p = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: REF, rolloffFactor: 1.4, maxDistance: 3000 });
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    p.connect(master);
    if (life) setTimeout(() => p.disconnect(), life * 1000);
    return p;
  }
  const near = ([x, y, z]) => Math.hypot(x - lp.x, y - lp.y, z - lp.z) < AUDIBLE;

  const ANIMAL = { // 每秒叫一声的概率（白天）；夜里大多不叫
    rooster: 'rooster', hen: 'hen', henBrown: 'hen', dog: 'dog', dogBlack: 'dog', pig: 'pig', sheep: 'sheep', donkey: 'donkey', ox: 'ox', duck: 'duck', goose: 'goose', pigeon: 'pigeon', magpie: 'magpie', cat: 'cat',
  };
  const RATE = { rooster: 0.006, hen: 0.02, dog: 0.004, pig: 0.025, sheep: 0.012, donkey: 0.004, ox: 0.006, duck: 0.025, goose: 0.012, pigeon: 0.01, magpie: 0.012, cat: 0.003 };

  const stats = {}; // 各种声音响了几次（无头检查用）
  function play(name, pos, when = 0, ...a) {
    stats[name] = (stats[name] ?? 0) + 1;
    if (!near(pos)) return;
    S.SFX[name](ctx.currentTime + 0.02 + when, panner(pos, 5), ...a);
  }

  // ---------------------------------------------------------------- 一直响的

  /** 一个持续的声源：make(out) 接好发声的节点链；set(音量) 每帧按情况调。 */
  function loop(pos, make) {
    const p = panner(pos);
    const g = new GainNode(ctx, { gain: 0 });
    g.connect(p);
    make(g);
    return { g, p, level: 0, set(v, k = 0.4) { if (Math.abs(v - this.level) > 0.002) { this.level = v; g.gain.setTargetAtTime(v, ctx.currentTime, k); } }, move([x, y, z]) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } };
  }

  let wind, rain, mill, roller, fire, firePos, crowd, projector, murmur;

  function setup() {
    const L = S.LOOPS;
    // 风 / 雨：不分方向，直接进总线
    wind = new GainNode(ctx, { gain: 0 }); L.wind(wind); wind.connect(master);
    rain = new GainNode(ctx, { gain: 0 }); L.rain(rain); rain.connect(master);
    // 溪水：沿着溪取几处
    const nav = village.nav, cells = [];
    for (let k = 0; k < nav.water.length; k++) if (nav.water[k]) cells.push([nav.cx(k % nav.nx), nav.h[k], nav.cz(Math.floor(k / nav.nx))]);
    cells.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < 5 && cells.length; i++) loop(cells[Math.floor(((i + 0.5) / 5) * cells.length)], (out) => L.stream(out, i)).set(0.5, 0.1);
    mill = loop(centerOf(thing('millstone')), L.rumble);
    roller = loop(centerOf(thing('roller')), L.rumble);
    firePos = centerOf(thing('firePit'));
    fire = loop(firePos, L.fire);
    crowd = loop([0, 0, 0], L.babble);
    murmur = loop([0, 0, 0], L.babble); // 台上讲话、银幕上的对白
    projector = loop(centerOf(thing('movieScreen')), L.projector);
  }

  /** 唱戏：每一拍排一次。 */
  function opera(fiddler, singer) {
    if (ctx.currentTime < (op.next ?? 0) - 0.1) return;
    stats.opera = (stats.opera ?? 0) + 1;
    const out = panner([fiddler.pos.x, fiddler.pos.y + 1, fiddler.pos.z], 4);
    S.operaStep(op, out, singer && panner([singer.pos.x, singer.pos.y + 1.4, singer.pos.z], 4));
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
    if (!on || !ctx) return;
    stats.frames = (stats.frames ?? 0) + 1;
    listener();
    const now = ctx.currentTime;
    const hour = village.life.clock.hour, night = hour >= 20 || hour < 5;
    const weather = V.weather();
    const people = village.life.people, beasts = village.life.beasts;

    wind.gain.setTargetAtTime(weather === 'rain' ? 0.12 : weather === 'cloudy' ? 0.09 : 0.05, now, 1);
    rain.gain.setTargetAtTime(weather === 'rain' ? 0.16 : 0, now, 1);

    // 鸟叫（白天，不下雨）/ 蛐蛐（夜里）：在听者周围随机一处
    const around = () => [lp.x + (Math.random() - 0.5) * 60, lp.y - 30, lp.z + (Math.random() - 0.5) * 60];
    if (!night && hour > 5.5 && weather !== 'rain' && t > nextBird) { S.SFX.chirp(now + 0.02, panner(around(), 3)); nextBird = t + 1.5 + Math.random() * 5; }
    if ((hour >= 19.5 || hour < 4.8) && weather !== 'rain' && t > nextCricket) { const p = panner(around(), 3); for (let i = 0; i < 3; i++) S.SFX.cricket(now + 0.02 + i * 0.35, p); nextCricket = t + 1 + Math.random() * 2.5; }

    // 磨盘、碾子：有牲口拉着转才响
    mill.set(beasts.some((b) => b.circling && b.s.role !== 'ox') ? 0.5 : 0);
    roller.set(beasts.some((b) => b.circling && b.s.role === 'ox') ? 0.6 : 0);
    // 篝火
    fire.set(V.bonfire?.lit ? 0.25 : 0);
    if (V.bonfire?.lit && t > nextCrackle) { if (firePos) play('crackle', firePos); nextCrackle = t + 0.05 + Math.random() * 0.4; }
    // 放电影：放映机 + 银幕对白
    const movie = V.eventOn('movie') && hour >= 19.2;
    projector.set(movie ? 0.08 : 0);

    // 人声：找人最多的一堆（户外、站着或坐着的），放在他们中间
    let best = null, bestN = 0;
    for (const v of people) {
      if (v.inside || v.state === 'walk') continue;
      let n = 0, sx = 0, sz = 0;
      for (const o of people) if (!o.inside && Math.abs(o.pos.x - v.pos.x) < 5 && Math.abs(o.pos.z - v.pos.z) < 5) { n++; sx += o.pos.x; sz += o.pos.z; }
      if (n > bestN) { bestN = n; best = [sx / n, v.pos.y + 1, sz / n]; }
    }
    if (best && bestN >= 3) { crowd.move(best); crowd.set(Math.min(0.35, 0.05 * bestN)); } else crowd.set(0);
    const speaker = people.find((v) => v.state === 'speech');
    if (speaker) { murmur.move([speaker.pos.x, speaker.pos.y + 1.5, speaker.pos.z]); murmur.set(0.3); }
    else if (movie) { const s = centerOf(thing('movieScreen')); if (s) murmur.move(s); murmur.set(0.15); }
    else murmur.set(0);

    // 唱戏
    const fiddler = people.find((v) => v.state === 'fiddle');
    if (fiddler) opera(fiddler, people.find((v) => v.state === 'sing'));

    // 干活的声音：锤子 / 斧子 / 锄头落下的那一刻（和 voxel.js 的动作同一个节奏）
    for (const v of people) {
      if (v.inside || v.state !== 'work') { prevK.delete(v); continue; }
      const item = v.char.item;
      const rate = item === 'hammer' ? 1.2 : item === 'axe' ? 1.08 : item === 'hoe' ? 0.9 : 0;
      if (!rate) continue;
      const k = ((t + v.phase) * rate) % 1;
      const pk = prevK.get(v);
      prevK.set(v, k);
      if (pk !== undefined && k < pk) play(item === 'hammer' ? 'clang' : item === 'axe' ? 'chop' : 'thud', [v.pos.x, v.pos.y + 0.6, v.pos.z]);
    }

    // 打更：边走边敲梆子，每隔一会儿一声小锣
    const watch = people.find((v) => v.doing === 'nightWatch' && !v.inside);
    if (watch && t > (cool.get(watch) ?? 0)) {
      const p = [watch.pos.x, watch.pos.y + 1, watch.pos.z];
      play('block', p); play('block', p, 0.35);
      if (Math.random() < 0.4) play('gong', p, 0.8);
      cool.set(watch, t + 5 + Math.random() * 3);
    }
    // 祭土地：庙前摇铃
    if (V.eventOn('shrine') && t > (cool.get('shrine') ?? 0)) { const s = centerOf(thing('shrine')); if (s) play('bell', s); cool.set('shrine', t + 6 + Math.random() * 6); }

    // 动物叫
    for (const b of beasts) {
      const kind = ANIMAL[b.s.kind];
      if (!kind || (b.home && kind !== 'rooster')) continue;
      if (t < (cool.get(b) ?? 0)) continue;
      let p = RATE[kind];
      if (kind === 'rooster') p = hour > 4.8 && hour < 7.5 ? 0.06 : night ? 0 : p;
      else if (night) p *= kind === 'dog' ? 0.5 : 0.05;
      if (kind === 'dog') { // 生人走近就叫（主人不算）
        const stranger = people.find((v) => !v.inside && v.state === 'walk' && v.p.id !== b.s.owner && Math.abs(v.pos.x - b.pos.x) < 2.5 && Math.abs(v.pos.z - b.pos.z) < 2.5);
        if (stranger) p = 0.5;
      }
      if (Math.random() < p * dt) {
        play(kind, [b.pos.x, b.pos.y + 0.5, b.pos.z]);
        cool.set(b, t + (kind === 'dog' ? 6 : 3) + Math.random() * 4);
      }
    }
  }

  return {
    stats,
    get on() { return on; },
    /** 打开 / 关上（第一次打开时才建 AudioContext，必须在点击事件里调用）。 */
    toggle() {
      if (!ctx) {
        ctx = new AudioContext();
        S = makeSynth(ctx);
        master = new GainNode(ctx, { gain: 0.8 });
        const comp = new DynamicsCompressorNode(ctx, { threshold: -18, ratio: 4 });
        master.connect(comp).connect(ctx.destination);
        setup();
      }
      on = !on;
      if (on) ctx.resume(); else ctx.suspend();
      return on;
    },
    update,
  };
}
