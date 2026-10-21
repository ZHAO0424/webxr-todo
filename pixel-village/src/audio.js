/*
 * 村子的声音：全部用 Web Audio 现场合成，不带任何音频文件。
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

const REF = 28; // 参考距离（米）：这么远的时候是原音量
const AUDIBLE = 160; // 再远的一次性声音就不播了

export function createSound(village, getCamera) {
  let ctx = null, master = null, on = false;
  const V = village.life.people[0].V;
  const loops = [];
  const prevK = new Map();
  const cool = new Map();
  let lp = { x: 0, y: 0, z: 0 };
  let noise = null, brown = null;
  let nextNote = 0, nextBeat = 0, beat = 0, note = 3, nextBird = 0, nextCricket = 0, nextCrackle = 0; // 鸟、蛐蛐、篝火、冷却按村子的秒数（t）算，排声音按音频时钟

  const thing = (k) => village.things.find((t) => t.thing === k);
  const centerOf = (t) => t && [(t.box.min.x + t.box.max.x) / 2, t.box.min.y + 0.8, (t.box.min.z + t.box.max.z) / 2];

  // ---------------------------------------------------------------- 底层

  function buffers() {
    const n = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, n, ctx.sampleRate);
    brown = ctx.createBuffer(1, n, ctx.sampleRate);
    const a = noise.getChannelData(0), b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      a[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * a[i]) / 1.02;
      b[i] = last * 3.5;
    }
  }

  /** 一个声源的位置。life 秒后自动断开（一次性的声音用）。 */
  function panner([x, y, z] = [0, 0, 0], life = 0) {
    const p = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: REF, rolloffFactor: 1.4, maxDistance: 3000 });
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    p.connect(master);
    if (life) setTimeout(() => p.disconnect(), life * 1000);
    return p;
  }
  const near = ([x, y, z]) => Math.hypot(x - lp.x, y - lp.y, z - lp.z) < AUDIBLE;

  const src = (buf = noise) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 1.9); return s; };
  const filt = (type, frequency, Q = 1) => new BiquadFilterNode(ctx, { type, frequency, Q });
  const gainNode = (v = 0) => new GainNode(ctx, { gain: v });
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  /** 包络：attack 秒升到 peak，然后指数衰减 decay 秒。 */
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function osc(type, f, t, dur, out, peak = 0.3, attack = 0.005) {
    const o = new OscillatorNode(ctx, { type, frequency: f });
    const g = gainNode();
    env(g, t, peak, attack, dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }
  function burst(t, dur, out, type = 'lowpass', f = 1000, peak = 0.3, Q = 1) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const g = gainNode();
    env(g, t, peak, 0.002, dur);
    s.connect(filt(type, f, Q)).connect(g).connect(out);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  /** 带共振峰的"嗓子"：锯齿波过一个带通，频率随时间走（叫声、唱腔用）。 */
  function voice(t, freqs, dur, out, { form = 1000, Q = 3, peak = 0.25, vib = 0, type = 'sawtooth' } = {}) {
    const o = new OscillatorNode(ctx, { type, frequency: freqs[0] });
    freqs.forEach((f, i) => o.frequency.linearRampToValueAtTime(f, t + (dur * i) / Math.max(1, freqs.length - 1)));
    if (vib) { const l = new OscillatorNode(ctx, { frequency: 6 }); const d = gainNode(vib); l.connect(d).connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const g = gainNode();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.04, dur / 4));
    g.gain.setValueAtTime(peak, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(filt('bandpass', form, Q)).connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- 一次性的声音（out = 声源的 panner）

  const SFX = {
    clang(t, out) { for (const [f, a] of [[820, 0.35], [1733, 0.22], [2950, 0.14], [4120, 0.08]]) osc('sine', f, t, 0.5 + Math.random() * 0.2, out, a, 0.001); burst(t, 0.02, out, 'highpass', 3000, 0.2); },
    chop(t, out) { burst(t, 0.07, out, 'lowpass', 900, 0.5); osc('sine', 130, t, 0.12, out, 0.4, 0.002); },
    thud(t, out) { burst(t, 0.06, out, 'lowpass', 500, 0.35); osc('sine', 85, t, 0.1, out, 0.25, 0.002); },
    block(t, out) { osc('sine', 1250, t, 0.06, out, 0.35, 0.001); osc('sine', 1870, t, 0.04, out, 0.15, 0.001); }, // 梆子
    gong(t, out, big = false) { const b = big ? 0.6 : 1; for (const [f, a] of [[220, 0.3], [334, 0.2], [472, 0.15], [655, 0.08]]) { const o = osc('sine', f * b, t, big ? 2.6 : 1.2, out, a, 0.003); o.frequency.exponentialRampToValueAtTime(f * b * 0.97, t + 1.5); } },
    bell(t, out) { for (const [f, a] of [[1580, 0.2], [2390, 0.12], [3950, 0.05]]) osc('sine', f, t, 2.2, out, a, 0.002); },
    rooster(t, out) { [[520, 700, 0.18], [650, 760, 0.14], [700, 620, 0.2], [640, 430, 0.55]].reduce((s, [a, b, d]) => { voice(s, [a, b], d, out, { form: 1300, Q: 4, peak: 0.35 }); return s + d + 0.03; }, t); },
    hen(t, out) { for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) voice(t + i * 0.16, [340, 300], 0.07, out, { form: 950, Q: 5, peak: 0.25 }); },
    dog(t, out) { for (let i = 0, n = 1 + Math.floor(Math.random() * 2); i < n; i++) { voice(t + i * 0.28, [380, 520, 260], 0.13, out, { form: 800, Q: 2, peak: 0.45 }); burst(t + i * 0.28, 0.08, out, 'bandpass', 1200, 0.15, 2); } },
    pig(t, out) { for (let i = 0; i < 2; i++) voice(t + i * 0.25, [95, 80], 0.2, out, { form: 420, Q: 2, peak: 0.35, vib: 18 }); },
    sheep(t, out) { voice(t, [430, 470, 380], 0.75, out, { form: 1050, Q: 3, peak: 0.25, vib: 30 }); },
    donkey(t, out) { for (let i = 0; i < 4; i++) voice(t + i * 0.4, i % 2 ? [260, 230] : [640, 700], 0.35, out, { form: i % 2 ? 600 : 1300, Q: 3, peak: 0.3 }); },
    ox(t, out) { voice(t, [125, 135, 108], 1.3, out, { form: 420, Q: 2.5, peak: 0.4 }); },
    duck(t, out) { for (let i = 0; i < 2; i++) voice(t + i * 0.18, [470, 420], 0.11, out, { form: 1500, Q: 6, peak: 0.25 }); },
    goose(t, out) { voice(t, [620, 680, 560], 0.22, out, { form: 1800, Q: 5, peak: 0.25 }); },
    pigeon(t, out) { voice(t, [380, 420, 360], 0.5, out, { form: 500, Q: 2, peak: 0.12, vib: 20, type: 'triangle' }); },
    magpie(t, out) { for (let i = 0; i < 5; i++) burst(t + i * 0.07, 0.03, out, 'bandpass', 2600, 0.25, 4); },
    cat(t, out) { voice(t, [620, 760, 520], 0.6, out, { form: 1400, Q: 4, peak: 0.18 }); },
    chirp(t, out) { for (let i = 0, n = 2 + Math.floor(Math.random() * 4), f = 2800 + Math.random() * 1500; i < n; i++) { const o = osc('sine', f, t + i * 0.09, 0.05, out, 0.06, 0.005); o.frequency.exponentialRampToValueAtTime(f * 1.35, t + i * 0.09 + 0.05); } },
    cricket(t, out) { const o = new OscillatorNode(ctx, { frequency: 4600 }); const am = new OscillatorNode(ctx, { type: 'square', frequency: 38 }); const g = gainNode(0); const d = gainNode(0.025); am.connect(d).connect(g.gain); env(d, t, 0.025, 0.01, 0.22); o.connect(g).connect(out); o.start(t); am.start(t); o.stop(t + 0.3); am.stop(t + 0.3); },
    crackle(t, out) { burst(t, 0.004 + Math.random() * 0.01, out, 'highpass', 1800, 0.15 + Math.random() * 0.25); },
  };
  const ANIMAL = { // 每秒叫一声的概率（白天）；夜里大多不叫
    rooster: 'rooster', hen: 'hen', henBrown: 'hen', dog: 'dog', dogBlack: 'dog', pig: 'pig', sheep: 'sheep', donkey: 'donkey', ox: 'ox', duck: 'duck', goose: 'goose', pigeon: 'pigeon', magpie: 'magpie', cat: 'cat',
  };
  const RATE = { rooster: 0.006, hen: 0.02, dog: 0.004, pig: 0.025, sheep: 0.012, donkey: 0.004, ox: 0.006, duck: 0.025, goose: 0.012, pigeon: 0.01, magpie: 0.012, cat: 0.003 };

  const stats = {}; // 各种声音响了几次（无头检查用）
  function play(name, pos, when = 0, ...a) {
    stats[name] = (stats[name] ?? 0) + 1;
    if (!near(pos)) return;
    SFX[name](ctx.currentTime + 0.02 + when, panner(pos, 5), ...a);
  }

  // ---------------------------------------------------------------- 一直响的

  /** 一个持续的声源：make(out) 接好发声的节点链，返回 { gain }；level 每帧按情况调。 */
  function loop(pos, make) {
    const p = panner(pos);
    const g = gainNode(0);
    g.connect(p);
    make(g);
    const l = { g, p, level: 0, set(v, k = 0.4) { if (Math.abs(v - this.level) > 0.002) { this.level = v; g.gain.setTargetAtTime(v, ctx.currentTime, k); } }, move([x, y, z]) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } };
    loops.push(l);
    return l;
  }

  let wind, rain, stream = [], mill, roller, fire, firePos, crowd, projector, murmur;

  function setup() {
    buffers();
    // 风 / 雨：不分方向，直接进总线
    wind = gainNode(0);
    const wf = filt('lowpass', 420);
    chain(src(brown), wf, wind, master);
    const wl = new OscillatorNode(ctx, { frequency: 0.07 }); const wd = gainNode(180); wl.connect(wd).connect(wf.frequency); wl.start(); // 风一阵大一阵小
    rain = gainNode(0); chain(src(), filt('highpass', 900), filt('lowpass', 7000), rain, master);
    // 溪水：沿着溪取几处
    const nav = village.nav, cells = [];
    for (let k = 0; k < nav.water.length; k++) if (nav.water[k]) cells.push([nav.cx(k % nav.nx), nav.h[k], nav.cz(Math.floor(k / nav.nx))]);
    cells.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < 5 && cells.length; i++) {
      const c = cells[Math.floor(((i + 0.5) / 5) * cells.length)];
      const l = loop(c, (out) => { const bp = filt('bandpass', 1100, 0.6); const lf = new OscillatorNode(ctx, { frequency: 0.3 + i * 0.07 }); const d = gainNode(350); lf.connect(d).connect(bp.frequency); lf.start(); chain(src(), bp, filt('lowpass', 3000), out); });
      l.set(0.5, 0.1);
      stream.push(l);
    }
    // 磨盘、碾子：低沉的隆隆声
    const rumble = (out) => { const g = gainNode(1); const lf = new OscillatorNode(ctx, { frequency: 0.6 }); const d = gainNode(0.5); lf.connect(d).connect(g.gain); lf.start(); chain(src(brown), filt('lowpass', 160), g, out); };
    mill = loop(centerOf(thing('millstone')), rumble);
    roller = loop(centerOf(thing('roller')), rumble);
    // 篝火：底下一层低低的呼呼声，噼啪在 update 里随机敲
    firePos = centerOf(thing('firePit'));
    fire = loop(firePos, (out) => chain(src(brown), filt('lowpass', 300), out));
    // 人声嗡嗡：几路带通噪声按说话的节奏起伏
    const babble = (out) => { for (const f of [480, 750, 1150]) { const g = gainNode(0.5); const lf = new OscillatorNode(ctx, { type: 'triangle', frequency: 3 + Math.random() * 2 }); const d = gainNode(0.5); lf.connect(d).connect(g.gain); lf.start(); chain(src(), filt('bandpass', f, 4), g, out); } };
    crowd = loop([0, 0, 0], babble);
    murmur = loop([0, 0, 0], babble); // 台上讲话、银幕上的对白
    projector = loop(centerOf(thing('movieScreen')), (out) => { const g = gainNode(0.6); const am = new OscillatorNode(ctx, { type: 'square', frequency: 24 }); const d = gainNode(0.4); am.connect(d).connect(g.gain); am.start(); chain(src(), filt('bandpass', 2400, 2), g, out); });
  }

  // ---------------------------------------------------------------- 唱戏：板胡 + 梆子 + 锣 + 唱腔

  const SCALE = [196, 220, 247, 294, 330, 392, 440, 494, 587, 659]; // G 宫五声音阶两个八度
  function opera(t, fiddler, singer) {
    const now = ctx.currentTime;
    if (now < nextBeat) return;
    stats.opera = (stats.opera ?? 0) + 1;
    const BEAT = 0.42;
    if (nextBeat < now - 1) nextBeat = now;
    const at = [fiddler.pos.x, fiddler.pos.y + 1, fiddler.pos.z];
    const out = panner(at, 4);
    // 梆子每拍一下，每 16 拍一声锣
    SFX.block(nextBeat, out);
    if (beat % 16 === 0) SFX.gong(nextBeat, out, true);
    // 板胡：五声音阶上随机走，偶尔一个长音
    if (now >= nextNote - 0.05) {
      note = Math.max(1, Math.min(SCALE.length - 2, note + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
      const dur = BEAT * (Math.random() < 0.25 ? 2 : 1);
      voice(nextBeat, [SCALE[note], SCALE[note] * 1.003], dur * 0.95, out, { form: 1600, Q: 1.2, peak: 0.18, vib: 5 });
      if (singer && beat % 2 === 0) { // 唱腔：低八度、元音"啊"的共振峰、颤音大
        const so = panner([singer.pos.x, singer.pos.y + 1.4, singer.pos.z], 4);
        voice(nextBeat, [SCALE[note] * 1.0, SCALE[note] * 1.02], dur * 1.8, so, { form: 900, Q: 2, peak: 0.22, vib: 9 });
      }
      nextNote = nextBeat + dur;
    }
    beat++;
    nextBeat += BEAT;
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
    if (!night && hour > 5.5 && weather !== 'rain' && t > nextBird) { SFX.chirp(now + 0.02, panner(around(), 3)); nextBird = t + 1.5 + Math.random() * 5; }
    if ((hour >= 19.5 || hour < 4.8) && weather !== 'rain' && t > nextCricket) { const p = panner(around(), 3); for (let i = 0; i < 3; i++) SFX.cricket(now + 0.02 + i * 0.35, p); nextCricket = t + 1 + Math.random() * 2.5; }

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
    if (fiddler) opera(t, fiddler, people.find((v) => v.state === 'sing'));

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
        master = gainNode(0.8);
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
