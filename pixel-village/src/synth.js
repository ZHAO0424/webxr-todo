/*
 * 合成器：用 Web Audio 现场合成的那部分声音（振荡器、噪声、滤波器、包络）——响器、雨声、唱戏。
 * 动物、干活等用的是真实录音（sfx/），见 audio.js。
 *   SFX.名字(开始时间, 输出节点)：梆子、锣、铃
 *   LOOPS.名字(输出节点)：雨声，音量由外面的 GainNode 控制
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
    // 界面按钮：很轻的一下木头声（一小截噪声过带通 + 一点低音），不抢环境声；ok = 确认类按钮，高一点、两下
    tap(t, out, ok = false) {
      const hit = (t0, f, peak) => { const n = ctx.createBufferSource(); n.buffer = noise; const g = gainNode(); env(g, t0, peak, 0.001, 0.035); n.connect(filt('bandpass', f, 6)).connect(g).connect(out); n.start(t0, Math.random() * 1.5); n.stop(t0 + 0.08); osc('sine', f * 0.42, t0, 0.03, out, peak * 0.5, 0.001); };
      hit(t, ok ? 2400 : 1900, 0.16);
      if (ok) hit(t + 0.055, 3000, 0.11);
    },
    block(t, out) { osc('sine', 1250, t, 0.06, out, 0.35, 0.001); osc('sine', 1870, t, 0.04, out, 0.15, 0.001); }, // 梆子
    gong(t, out, big = false) { const b = big ? 0.6 : 1; for (const [f, a] of [[220, 0.3], [334, 0.2], [472, 0.15], [655, 0.08]]) { const o = osc('sine', f * b, t, big ? 2.6 : 1.2, out, a, 0.003); o.frequency.exponentialRampToValueAtTime(f * b * 0.97, t + 1.5); } },
    bell(t, out) { for (const [f, a] of [[1580, 0.2], [2390, 0.12], [3950, 0.05]]) osc('sine', f, t, 2.2, out, a, 0.002); },
  };
  // ---------------------------------------------------------------- 一直响的底子

  const LOOPS = {
    rain(out) { chain(src(), filt('highpass', 900), filt('lowpass', 7000), out); },
  };

  // ---------------------------------------------------------------- 唱戏：板胡 + 梆子 + 锣 + 唱腔

  const BEAT = 0.42;
  /** 排一拍。state = { next（下一拍的音频时间）, nextNote, beat, note }，第一次传 {} 就行。 */
  function operaStep(st, out, singerOut) {
    const now = ctx.currentTime;
    if (!(st.next >= now - 1)) Object.assign(st, { next: now + 0.05, nextNote: 0, beat: st.beat ?? 0, note: st.note ?? 3 });
    if (st.beat % 2 === 0) SFX.block(st.next, out); // 梆子隔一拍一下
    if (st.beat % 32 === 0) SFX.gong(st.next, out, true); // 隔一阵一声锣
    // 板胡和唱腔原来是合成的（锯齿波在五声音阶上随机走），听着像一段怪调子一直响，去掉了：只留梆子和锣
    st.beat++;
    st.next += BEAT;
  }

  return { noise, brown, src, filt, gainNode, chain, osc, voice, SFX, LOOPS, operaStep };
}
