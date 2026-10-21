/*
 * 合成器：村里所有声音的音色都在这里（村子 audio.js 和试听页 sounds.html 共用）。
 * 全部用 Web Audio 现场合成——振荡器、噪声、滤波器、包络，不带任何音频文件。
 *   SFX.名字(开始时间, 输出节点)：一次性的声音（打铁、动物叫……）
 *   LOOPS.名字(输出节点)：一直响的底子（风、雨、溪水、磨盘……），音量由外面的 GainNode 控制
 *   operaStep(state, out, singerOut)：唱戏排一拍（板胡 + 梆子 + 锣 + 唱腔），state 记着拍子和音高
 */

export function makeSynth(ctx) {
  const n = ctx.sampleRate * 2;
  const noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const brown = ctx.createBuffer(1, n, ctx.sampleRate);
  {
    const a = noise.getChannelData(0), b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      a[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * a[i]) / 1.02;
      b[i] = last * 3.5;
    }
  }

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

  // ---------------------------------------------------------------- 一次性的声音

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
  // ---------------------------------------------------------------- 一直响的底子

  const lfo = (freq, depth, target, type = 'sine') => { const l = new OscillatorNode(ctx, { type, frequency: freq }); const d = gainNode(depth); l.connect(d).connect(target); l.start(); };
  const LOOPS = {
    wind(out) { const wf = filt('lowpass', 420); chain(src(brown), wf, out); lfo(0.07, 180, wf.frequency); }, // 风一阵大一阵小
    rain(out) { chain(src(), filt('highpass', 900), filt('lowpass', 7000), out); },
    stream(out, i = 0) { const bp = filt('bandpass', 1100, 0.6); lfo(0.3 + i * 0.07, 350, bp.frequency); chain(src(), bp, filt('lowpass', 3000), out); },
    rumble(out) { const g = gainNode(1); lfo(0.6, 0.5, g.gain); chain(src(brown), filt('lowpass', 160), g, out); }, // 磨盘、碾子
    fire(out) { chain(src(brown), filt('lowpass', 300), out); }, // 篝火底下的呼呼声（噼啪另外敲）
    babble(out) { for (const f of [480, 750, 1150]) { const g = gainNode(0.5); lfo(3 + Math.random() * 2, 0.5, g.gain, 'triangle'); chain(src(), filt('bandpass', f, 4), g, out); } }, // 人声嗡嗡
    projector(out) { const g = gainNode(0.6); lfo(24, 0.4, g.gain, 'square'); chain(src(), filt('bandpass', 2400, 2), g, out); },
  };

  // ---------------------------------------------------------------- 唱戏：板胡 + 梆子 + 锣 + 唱腔

  const SCALE = [196, 220, 247, 294, 330, 392, 440, 494, 587, 659]; // G 宫五声音阶两个八度
  const BEAT = 0.42;
  /** 排一拍。state = { next（下一拍的音频时间）, nextNote, beat, note }，第一次传 {} 就行。 */
  function operaStep(st, out, singerOut) {
    const now = ctx.currentTime;
    if (!(st.next >= now - 1)) Object.assign(st, { next: now + 0.05, nextNote: 0, beat: st.beat ?? 0, note: st.note ?? 3 });
    SFX.block(st.next, out); // 梆子每拍一下
    if (st.beat % 16 === 0) SFX.gong(st.next, out, true); // 每 16 拍一声锣
    if (st.next >= st.nextNote - 0.05) { // 板胡：五声音阶上随机走，偶尔一个长音
      st.note = Math.max(1, Math.min(SCALE.length - 2, st.note + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
      const dur = BEAT * (Math.random() < 0.25 ? 2 : 1);
      voice(st.next, [SCALE[st.note], SCALE[st.note] * 1.003], dur * 0.95, out, { form: 1600, Q: 1.2, peak: 0.18, vib: 5 });
      if (singerOut && st.beat % 2 === 0) voice(st.next, [SCALE[st.note], SCALE[st.note] * 1.02], dur * 1.8, singerOut, { form: 900, Q: 2, peak: 0.22, vib: 9 }); // 唱腔：元音"啊"的共振峰、颤音大
      st.nextNote = st.next + dur;
    }
    st.beat++;
    st.next += BEAT;
  }

  return { noise, brown, src, filt, gainNode, chain, osc, burst, voice, SFX, LOOPS, operaStep };
}
