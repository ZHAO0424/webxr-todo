// 龙舟鼓手 · 画面（笔墨描金：《大神》式毛笔描边 + 平涂填色 + 描金点缀，借《妙笔千山》的青绿远山分层）
// 只管"怎么画"：index.html 每帧把游戏状态装进 ctx 交给 frame(ctx)，这里不改任何游戏状态。
// 三个批次，各一个 draw call，都过 AR_GLOW（颜色相加，alpha = 亮度）：
//   笔触：每段一个实例，宽度沿笔画渐变（起笔尖、中段饱满、收笔尖），尾段带飞白
//   填色：动态三角形，中低亮度平涂（光学透视眼镜里暗 = 透明，平涂像宣纸留白）
//   点：灯笼、头、溅水、烟花
// 坐标：沙盘局部（米），x 沿河，y 向上，z 朝观者；船用毫米画（s = 0.001）。

export function createArt(THREE, AR_GLOW, parent, GAIN) {
  const V3 = THREE.Vector3, clamp = THREE.MathUtils.clamp, TAU = Math.PI * 2;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mixc = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // ---------- 笔触 ----------
  const SMAX = 14000;
  const sA = new Float32Array(SMAX * 3), sB = new Float32Array(SMAX * 3), sC = new Float32Array(SMAX * 4), sW = new Float32Array(SMAX * 4), sU = new Float32Array(SMAX * 3);
  const sGeo = new THREE.InstancedBufferGeometry();
  sGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3));
  sGeo.setIndex([0, 1, 2, 2, 1, 3]);
  const sAttr = [['iA', sA, 3], ['iB', sB, 3], ['iC', sC, 4], ['iW', sW, 4], ['iU', sU, 3]].map(([n, arr, k]) => { const a = new THREE.InstancedBufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); sGeo.setAttribute(n, a); return a; });
  const sMat = new THREE.ShaderMaterial({
    uniforms: { uHalfH: { value: 400 }, uGain: GAIN },
    vertexShader: `
      attribute vec3 iA, iB, iU; attribute vec4 iC, iW;
      uniform float uHalfH;
      varying float vS, vY, vLen, vWA, vWB, vSeed; varying vec2 vU, vCap; varying vec4 vC;
      const float GLOW = 2.4;
      void main() {
        vec3 A = (modelViewMatrix * vec4(iA, 1.0)).xyz, B = (modelViewMatrix * vec4(iB, 1.0)).xyz;
        vec3 d = B - A; float len = length(d); vec3 dir = len > 1e-7 ? d / len : vec3(1.0, 0.0, 0.0);
        vec3 mid = (A + B) * 0.5;
        vec3 side = cross(dir, normalize(-mid)); float sl = length(side); side = sl > 1e-5 ? side / sl : vec3(0.0, 1.0, 0.0);
        float px = projectionMatrix[1][1] * uHalfH / max(1e-3, -mid.z);
        float mn = 0.6 / px;
        float wa = max(iW.x * 0.5, mn), wb = max(iW.y * 0.5, mn);
        float hw = max(wa, wb) * GLOW;
        float s0 = iW.z > 0.5 ? -hw : 0.0, s1 = iW.w > 0.5 ? len + hw : len;
        float s = mix(s0, s1, position.x);
        vec3 P = A + dir * s + side * position.y * hw;
        vS = s; vY = position.y * hw; vLen = max(len, 1e-6); vWA = wa; vWB = wb; vCap = iW.zw; vU = iU.xy; vSeed = iU.z;
        // 细到不足最小像素宽度时按比例减亮，保持能量
        vC = vec4(iC.rgb, iC.a * clamp((iW.x + iW.y) * 0.5 / (wa + wb), 0.0, 1.0));
        gl_Position = projectionMatrix * vec4(P, 1.0);
      }`,
    fragmentShader: `
      uniform float uGain;
      varying float vS, vY, vLen, vWA, vWB, vSeed; varying vec2 vU, vCap; varying vec4 vC;
      float h1(float n) { return fract(sin(n * 127.1 + vSeed * 311.7) * 43758.5453); }
      void main() {
        float f = clamp(vS / vLen, 0.0, 1.0), cw = mix(vWA, vWB, f);
        float dx = vS < 0.0 ? vS : (vS > vLen ? vS - vLen : 0.0);
        float d = length(vec2(dx, vY)) / cw;
        float core = 1.0 - smoothstep(0.62, 1.0, d);
        float halo = exp(-d * d * 0.9) * 0.26;
        // 飞白：笔画后段出现几道沿笔走向的空隙
        float u = mix(vU.x, vU.y, f);
        float lane = floor((vY / cw) * 2.5 + 3.0);
        float dry = smoothstep(0.62, 1.0, u) * step(h1(lane), 0.42) * (0.6 + 0.4 * sin(u * 70.0 + vSeed * 9.0));
        core *= 1.0 - dry * 0.85;
        vec3 col = (vC.rgb * (core * 0.95 + halo) + vec3(core * 0.12)) * vC.a * uGain;
        if (max(col.r, max(col.g, col.b)) < 0.003) discard;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, ...AR_GLOW,
  });
  const sMesh = new THREE.Mesh(sGeo, sMat); sMesh.frustumCulled = false; sMesh.renderOrder = 6; parent.add(sMesh);
  let sN = 0, seedK = 0;
  function seg(ax, ay, az, bx, by, bz, col, a, wa, wb, capA, capB, ua, ub, seed) {
    if (sN >= SMAX || a < 0.004) return;
    const i = sN++, j = i * 3, k = i * 4;
    sA[j] = ax; sA[j + 1] = ay; sA[j + 2] = az; sB[j] = bx; sB[j + 1] = by; sB[j + 2] = bz;
    sC[k] = col[0]; sC[k + 1] = col[1]; sC[k + 2] = col[2]; sC[k + 3] = a;
    sW[k] = wa; sW[k + 1] = wb; sW[k + 2] = capA; sW[k + 3] = capB;
    sU[j] = ua; sU[j + 1] = ub; sU[j + 2] = seed;
  }
  // 一笔：pts = [[x,y,z],...]；w = 最粗处宽度；tin / tout = 起笔、收笔渐细所占比例；tip = 笔尖宽度比例
  function stroke(pts, col, a, w, o = {}) {
    const n = pts.length; if (n < 2 || a < 0.004) return;
    const tin = o.tin ?? 0.18, tout = o.tout ?? 0.3, tip = o.tip ?? 0.15, dry = o.dry ?? 1, seed = o.seed ?? (seedK++ * 0.618) % 1;
    let L = 0; const cum = [0];
    for (let k = 1; k < n; k++) { L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]); cum.push(L); }
    if (L < 1e-7) return;
    const wAt = u => w * (tip + (1 - tip) * Math.min(smooth(0, tin, u), 1 - smooth(1 - tout, 1, u)) ) * (1 + 0.12 * Math.sin(u * Math.PI));
    for (let k = 1; k < n; k++) {
      const ua = cum[k - 1] / L, ub = cum[k] / L, p = pts[k - 1], q = pts[k];
      seg(p[0], p[1], p[2], q[0], q[1], q[2], col, a, wAt(ua), wAt(ub), k === 1 ? 1 : 0, k === n - 1 ? 1 : 0, ua * dry, ub * dry, seed);
    }
  }
  // 侧面画法：pts2 = [[u,v],...]（毫米），放到 (ox, oy, z)
  const S2 = (pts2, ox, oy, z, s = 0.001) => pts2.map(p => [ox + p[0] * s, oy + p[1] * s, z]);
  // 平滑曲线：Catmull-Rom 把控制点插成 k 倍细分
  function curve(ctrl, k = 4) {
    const out = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t; out.push(p1.map((_, c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))); }
    }
    out.push(ctrl[ctrl.length - 1]); return out;
  }

  // ---------- 填色 ----------
  const FMAX = 60000;
  const fPos = new Float32Array(FMAX * 3), fCol = new Float32Array(FMAX * 4);
  const fGeo = new THREE.BufferGeometry();
  const fP = new THREE.BufferAttribute(fPos, 3), fC = new THREE.BufferAttribute(fCol, 4);
  fP.setUsage(THREE.DynamicDrawUsage); fC.setUsage(THREE.DynamicDrawUsage);
  fGeo.setAttribute('position', fP); fGeo.setAttribute('aCol', fC);
  const fMat = new THREE.ShaderMaterial({
    uniforms: { uGain: GAIN },
    vertexShader: `attribute vec4 aCol; varying vec4 vC; void main() { vC = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uGain; varying vec4 vC; void main() { vec3 col = vC.rgb * vC.a * uGain; if (max(col.r, max(col.g, col.b)) < 0.002) discard; gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, ...AR_GLOW,
  });
  const fMesh = new THREE.Mesh(fGeo, fMat); fMesh.frustumCulled = false; fMesh.renderOrder = 4; parent.add(fMesh);
  let fN = 0;
  function vtx(p, c, a) { if (fN >= FMAX) return; const i = fN++; fPos[i * 3] = p[0]; fPos[i * 3 + 1] = p[1]; fPos[i * 3 + 2] = p[2]; fCol[i * 4] = c[0]; fCol[i * 4 + 1] = c[1]; fCol[i * 4 + 2] = c[2]; fCol[i * 4 + 3] = a; }
  function tri(p, q, r, c, a, c2 = c, a2 = a, c3 = c2, a3 = a2) { if (fN + 3 > FMAX || (a < 0.004 && a2 < 0.004 && a3 < 0.004)) return; vtx(p, c, a); vtx(q, c2, a2); vtx(r, c3, a3); }
  // 扇形填充（星形多边形）：中心稍亮
  function poly(pts, c, a, center = null, aEdge = a) {
    if (a < 0.004 && aEdge < 0.004) return;
    const ctr = center || pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
    for (let k = 0; k < pts.length; k++) tri(ctr, pts[k], pts[(k + 1) % pts.length], c, a, c, aEdge, c, aEdge);
  }
  // 两条边之间铺带（上下渐变）
  function ribbon(top, bot, cT, aT, cB, aB) { for (let k = 1; k < Math.min(top.length, bot.length); k++) { tri(top[k - 1], top[k], bot[k - 1], cT, aT, cT, aT, cB, aB); tri(top[k], bot[k], bot[k - 1], cT, aT, cB, aB, cB, aB); } }

  // ---------- 点 ----------
  const PMAX = 6000;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pSize = new Float32Array(PMAX), pShape = new Float32Array(PMAX), pDir = new Float32Array(PMAX * 3), pA = new Float32Array(PMAX);
  const pGeo = new THREE.BufferGeometry();
  const pAttr = [['position', pPos, 3], ['aColor', pCol, 3], ['aSize', pSize, 1], ['aShape', pShape, 1], ['aDir', pDir, 3], ['aA', pA, 1]].map(([n, arr, k]) => { const a = new THREE.BufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); pGeo.setAttribute(n, a); return a; });
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uGain: GAIN },
    vertexShader: `
      attribute vec3 aColor, aDir; attribute float aSize, aShape, aA;
      uniform float uScale;
      varying vec3 vColor; varying float vShape, vA, vAng, vStretch;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec4 p = projectionMatrix * mv;
        vec4 p2 = projectionMatrix * modelViewMatrix * vec4(position + aDir * 0.02, 1.0);
        vec2 d = p2.xy / p2.w - p.xy / p.w;
        d.x *= projectionMatrix[1][1] / projectionMatrix[0][0];
        vAng = atan(d.y, d.x); vStretch = clamp(length(d) * 60.0, 0.0, 1.0);
        gl_Position = p;
        gl_PointSize = max(1.5, aSize * uScale * projectionMatrix[1][1] / -mv.z);
        vColor = aColor; vShape = aShape; vA = aA;
      }`,
    fragmentShader: `
      uniform float uGain;
      varying vec3 vColor; varying float vShape, vA, vAng, vStretch;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0; c.y = -c.y;
        float ca = cos(vAng), sa = sin(vAng);
        vec2 q = vec2(ca * c.x + sa * c.y, -sa * c.x + ca * c.y);
        vec3 col; float r;
        if (vShape < 0.5) { r = length(c); float core = smoothstep(0.42, 0.25, r), glow = exp(-r * r * 5.0) * 0.4; col = vColor * glow + vColor * core * 0.9 + vec3(core) * 0.18; }
        else if (vShape < 4.5) { r = length(c); float a = exp(-r * r * 4.5); col = vColor * a * 1.2 + vec3(a * a * a * 0.35); }
        else { vec2 e = q * vec2(1.0, 1.0 + 5.0 * vStretch); r = length(e); float core = smoothstep(0.5, 0.2, r), glow = exp(-dot(e, e) * 1.2) * 0.6; col = vColor * glow * 1.2 + vColor * core * 0.8 + vec3(core) * 0.3; }
        col *= vA * uGain;
        if (max(col.r, max(col.g, col.b)) < 0.004) discard;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: false, ...AR_GLOW,
  });
  const pMesh = new THREE.Points(pGeo, pMat); pMesh.frustumCulled = false; pMesh.renderOrder = 7; parent.add(pMesh);
  let pN = 0;
  function P(x, y, z, c, size, shape = 0, a = 1, dx = 0, dy = 0, dz = 0) {
    if (pN >= PMAX || a < 0.004) return;
    const i = pN++;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pCol[i * 3] = c[0]; pCol[i * 3 + 1] = c[1]; pCol[i * 3 + 2] = c[2];
    pDir[i * 3] = dx; pDir[i * 3 + 1] = dy; pDir[i * 3 + 2] = dz; pSize[i] = size; pShape[i] = shape; pA[i] = a;
  }

  // ---------- 色板 ----------
  const C = {
    gold: [1.0, 0.76, 0.36], goldHi: [1.0, 0.9, 0.62], verm: [1.0, 0.3, 0.18], qing: [0.32, 0.72, 1.0], lv: [0.36, 0.95, 0.62], zi: [0.8, 0.6, 1.0],
    white: [1, 1, 1], ivory: [1.0, 0.95, 0.85], water: [0.55, 0.85, 1.0], cloud: [1.0, 0.86, 0.58], warm: [1.0, 0.62, 0.28], willow: [0.6, 0.92, 0.45],
    mtn: [[0.3, 0.9, 0.7], [0.32, 0.66, 1.0], [0.55, 0.55, 1.0]], dim: [0.55, 0.48, 0.7],
  };
  // 每条船一套：船漆、描金、衣、桨叶 / 头带
  const TEAM = [
    { hull: C.verm, trim: C.goldHi, cloth: [1.0, 0.82, 0.5], band: C.verm },
    { hull: C.qing, trim: [0.85, 0.94, 1.0], cloth: [0.75, 0.9, 1.0], band: C.qing },
    { hull: C.lv, trim: C.gold, cloth: [0.85, 1.0, 0.75], band: C.lv },
    { hull: C.zi, trim: [0.98, 0.9, 1.0], cloth: [1.0, 0.82, 0.98], band: C.zi },
  ];

  // ---------- 预计算的形 ----------
  const HULL_TOP = [], HULL_BOT = [];
  for (let k = 0; k <= 16; k++) { const u = -34 + k * 68 / 16, f = u / 34; HULL_TOP.push([u, 4 + f * f * 1.8]); HULL_BOT.push([u, -2.8 * (1 - Math.pow(Math.abs(f), 3.4)) + 1.6 * Math.pow(Math.abs(f), 3)]); }
  const UPPER = [[36.5, 11], [38.5, 14.6], [41, 16.8], [44.5, 17.6], [48, 16.9], [50.6, 15.5], [48.4, 14.7], [44.5, 14.7], [41.2, 14.3], [38.4, 12.4]];
  const LOWER = [[41.2, 14.1], [45, 13.6], [49.6, 13.3], [47.4, 12.1], [43.6, 12.0], [40.6, 12.8]];
  const rowerU = i => 18.5 - i * 5.3;
  const R = (seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; })(91);
  // 河面卷浪：沿河每 2.4 m 一组，落在车道之间的缝里
  const CREST_Z = [0.0, 0.052, -0.052, 0.1, -0.1];   // 车道之间的缝
  const crests = []; for (let m = -60; m < 260; m += 1.2) crests.push({ m: m + R() * 0.8, z: CREST_Z[Math.floor(R() * CREST_Z.length)] + (R() - 0.5) * 0.01, s: 0.7 + R() * 0.6, ph: R() * TAU });
  const currents = []; for (let m = -60; m < 260; m += 2.6) currents.push({ m: m + R() * 1.5, z: (R() * 2 - 1) * 0.08, len: 2.5 + R() * 3.5, seed: R() });
  // 观众：远岸三层 + 近岸一排（位置用河岸米，60 m 循环）
  const CROWD_SPAN = 84, crowd = [];
  const robes = [C.verm, C.gold, C.qing, C.lv, C.zi, C.ivory];
  for (let tier = 0; tier < 3; tier++) for (let m = 0; m < CROWD_SPAN; m += 1.15) crowd.push({ m: m + R() * 0.5 + tier * 0.4, z: -0.112 - tier * 0.009, y: 0.008 + tier * 0.006, ph: R() * TAU, robe: robes[Math.floor(R() * robes.length)], prop: R() < 0.12 ? 'umbrella' : R() < 0.12 ? 'flag' : '', near: false });
  for (let m = 0; m < CROWD_SPAN; m += 2.3) crowd.push({ m: m + R(), z: 0.108, y: 0.002, ph: R() * TAU, robe: robes[Math.floor(R() * robes.length)], prop: R() < 0.2 ? 'umbrella' : '', near: true });
  const clouds = [{ x: -0.12, y: 0.125, z: -0.22, s: 1.1, v: 0.0016 }, { x: 0.06, y: 0.145, z: -0.24, s: 0.8, v: 0.0011 }, { x: 0.17, y: 0.112, z: -0.2, s: 0.9, v: 0.0014 }];

  // ---------- 通用小件 ----------
  let WX = 0.2, HM = 26; const SCALE = 0.01;   // 河道半宽（头显里 0.34，见 setWidth）
  let cx = 0;
  const toX = m => (m - cx) * SCALE;
  const edge = x => smooth(WX, WX - 0.035, Math.abs(x));
  const wrapM = (m, span) => { let k = ((m - cx) % span + span * 1.5) % span - span / 2; return cx + k; };
  // 祥云：一道底线 + 两三个卷
  function cloud(x, y, z, s, a, col = C.cloud) {
    const base = curve([[x - 0.028 * s, y, z], [x - 0.01 * s, y + 0.0015 * s, z], [x + 0.012 * s, y - 0.001 * s, z], [x + 0.03 * s, y + 0.001 * s, z]]);
    stroke(base, col, a * 0.8, 0.0011 * s, { tin: 0.25, tout: 0.35 });
    for (const [cx0, cy0, r0, dirn] of [[-0.012, 0.006, 0.0075, 1], [0.006, 0.009, 0.0095, -1], [0.02, 0.004, 0.006, 1]]) {
      const pts = []; for (let k = 0; k <= 22; k++) { const th = k / 22 * TAU * 1.15, r = r0 * s * (1 - k / 30); pts.push([x + cx0 * s + Math.cos(th * dirn + 3.6) * r, y + cy0 * s + Math.sin(th * dirn + 3.6) * r * 0.85, z]); }
      stroke(pts, col, a, 0.0012 * s, { tin: 0.1, tout: 0.5, tip: 0.1 });
    }
  }
  // 填色小人（侧面，宽约 1.6 mm）：袍子 + 头 + 两臂；up = 举手程度
  function person(x, y, z, robe, a, up, sway, s = 1, prop = '', t = 0) {
    const w = 0.0009 * s, h = 0.0042 * s;
    poly([[x - w, y, z], [x + w, y, z], [x + w * 0.6, y + h, z], [x - w * 0.6, y + h, z]], robe, a * 0.42);
    stroke([[x - w * 0.6, y + h, z], [x - w, y, z]], robe, a * 0.7, 0.0004 * s, { tin: 0, tout: 0.5 });
    P(x, y + h + 0.0013 * s, z, mixc(robe, C.ivory, 0.6), 0.0017 * s, 0, a);
    for (const sd of [-1, 1]) stroke([[x + sd * w * 0.5, y + h * 0.9, z], [x + sd * (0.0016 - up * 0.0006) * s + sway, y + h * (0.55 + up * 0.75), z]], robe, a * 0.75, 0.00045 * s, { tin: 0.1, tout: 0.4 });
    if (prop === 'umbrella') { const uy = y + h + 0.004 * s, ur = 0.0034 * s; const arc = []; for (let k = 0; k <= 8; k++) { const th = Math.PI * k / 8; arc.push([x + Math.cos(th) * ur, uy + Math.sin(th) * ur * 0.55, z]); } poly(arc.concat([[x, uy, z]]), robe, a * 0.35); stroke(arc, mixc(robe, C.white, 0.4), a * 0.8, 0.0004 * s); stroke([[x, uy, z], [x, y + h * 0.7, z]], C.gold, a * 0.5, 0.0003 * s); }
    if (prop === 'flag') { const fy = y + h + 0.007 * s + up * 0.002, fw = Math.sin(t * 7 + x * 300) * 0.0008; stroke([[x + 0.001 * s, y + h * 0.8, z], [x + 0.001 * s, fy, z]], C.gold, a * 0.6, 0.0003 * s); poly([[x + 0.001 * s, fy, z], [x + 0.0055 * s, fy - 0.0012 * s + fw, z], [x + 0.001 * s, fy - 0.0026 * s, z]], robe, a * 0.6); }
  }

  // ---------- 远景：青绿山（三层视差）+ 祥云 ----------
  // 山形：一串高窄的峰（青绿山水的尖峰），峰距随层变大；伪随机但确定
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const ridge = (m, layer) => {
    const gap = 9 + layer * 4, k0 = Math.floor(m / gap); let y = 0.12;
    for (let k = k0 - 2; k <= k0 + 2; k++) { const c = (k + 0.3 + 0.4 * hash(k * 3 + layer)) * gap, h = 0.35 + 0.65 * hash(k * 7 + layer * 13), w = gap * (0.45 + 0.25 * hash(k * 11 + layer)); y = Math.max(y, h * Math.pow(Math.max(0, 1 - Math.pow((m - c) / (w * 1.6), 2)), 1.6)); }
    return y + 0.03 * Math.sin(m * 0.9 + layer);
  };
  function drawFar(ctx) {
    for (let L = 2; L >= 0; L--) {
      const par = [0.55, 0.38, 0.22][L], z = [-0.2, -0.235, -0.27][L], base = 0.006, amp = [0.05, 0.075, 0.095][L], col = C.mtn[L];
      const top = [], bot = [];
      for (let k = 0; k <= 40; k++) { const x = -WX - 0.03 + k * (2 * WX + 0.06) / 40, m = cx * par + x / SCALE, e = smooth(WX + 0.03, WX - 0.05, Math.abs(x)); const y = base + amp * ridge(m, L) * (0.55 + 0.45 * e); top.push([x, y, z]); bot.push([x, base, z]); top[k].e = e; }
      // 平涂：山顶亮、山脚淡到透明（"留白"），两端淡出
      for (let k = 1; k <= 40; k++) {
        const a0 = top[k - 1].e, a1 = top[k].e, at = [0.05, 0.04, 0.032][L];
        tri(top[k - 1], top[k], bot[k - 1], col, at * a0, col, at * a1, col, 0);
        tri(top[k], bot[k], bot[k - 1], col, at * a1, col, 0, col, 0);
      }
      // 山脊一笔（分三段，两端淡出），亮度按层递减
      for (let sgm = 0; sgm < 3; sgm++) { const pts = top.slice(sgm * 13, sgm * 13 + 15); const e = Math.min(...pts.map(p => p.e)); stroke(pts, mixc(col, C.white, 0.15), [0.5, 0.36, 0.26][L] * (0.3 + 0.7 * e), [0.0012, 0.0011, 0.001][L], { tin: 0.15, tout: 0.3, seed: L * 0.3 + sgm * 0.1 }); }
      // 层间雾带：几道长而淡的横笔，压在山脚
      for (let q = 0; q < 2; q++) { const y = base + amp * (0.18 + q * 0.12), x0 = -WX + 0.02 + ((q * 0.13 + L * 0.07 + cx * par * 0.002) % 0.12), len = 0.12 + q * 0.05; stroke(curve([[x0, y, z + 0.003], [x0 + len * 0.5, y + 0.002, z + 0.003], [x0 + len, y, z + 0.003]]), C.cloud, 0.07, 0.003, { tin: 0.4, tout: 0.45, tip: 0.05, dry: 0 }); }
      // 皴：峰顶往下的几道短笔
      for (let k = 2; k < 39; k += 3) {
        const p = top[k]; if (p[1] < top[k - 2][1] || p[1] < top[k + 2][1] || p.e < 0.3) continue;
        for (let j = 0; j < 3; j++) { const dx = (j - 1) * 0.0035, h = Math.min(0.012, (p[1] - base) * (0.14 + 0.06 * j)); stroke([[p[0] + dx * 0.3, p[1] - 0.0015, z], [p[0] + dx + 0.0015, p[1] - h * 0.5, z], [p[0] + dx * 1.5 + 0.003, p[1] - h, z]], col, 0.3 * p.e, 0.0006, { tin: 0.05, tout: 0.6 }); }
      }
    }
    for (const c of clouds) { c.x += c.v * ctx.dt; if (c.x > WX + 0.04) c.x = -WX - 0.04; cloud(c.x - (cx * 0.12 * SCALE) % 0.0001, c.y, c.z, c.s, 0.45 * edge(c.x)); }
  }

  // ---------- 河面：卷浪 + 水流线 + 两岸 ----------
  function drawWater(ctx) {
    const t = ctx.t;
    for (const c of crests) {
      const x = toX(c.m); if (Math.abs(x) > WX) continue; const e = edge(x), s = c.s * 0.001, bob = Math.sin(t * 1.6 + c.ph) * 0.3;
      // 浮世绘式浪头：一笔上扬再卷回
      const pts = curve([[-5, 0], [-2, 0.5 + bob * 0.2], [0.6, 1.9 + bob * 0.3], [1.4, 3.0 + bob * 0.4], [0.4, 3.5 + bob * 0.4], [-0.4, 2.8 + bob * 0.3]].map(p => [x + p[0] * s, p[1] * s, c.z]), 3);
      stroke(pts, C.water, 0.55 * e, 0.0007 * c.s, { tin: 0.05, tout: 0.4, tip: 0.2 });
      P(x + 0.4 * s, 3.4 * s, c.z, C.white, 0.0012, 0, 0.35 * e);
    }
    for (const c of currents) {
      const x0 = toX(c.m), x1 = toX(c.m + c.len); if (x1 < -WX || x0 > WX) continue;
      const e = Math.min(edge(x0), edge(x1)) * 0.6 + 0.4 * edge((x0 + x1) / 2);
      stroke(curve([[x0, 0, c.z], [(x0 * 2 + x1) / 3, 0, c.z + 0.002], [(x0 + x1 * 2) / 3, 0, c.z - 0.001], [x1, 0, c.z + 0.001]], 3), C.water, 0.22 * e, 0.0008, { tin: 0.2, tout: 0.5, seed: c.seed });
    }
    // 两岸：石堤（填色 + 顶边一笔）
    for (const [z, y1] of [[-0.092, 0.007], [0.094, 0.004]]) {
      const top = [], bot = []; for (let k = 0; k <= 20; k++) { const x = -WX + k * 2 * WX / 20; top.push([x, y1, z]); bot.push([x, 0, z]); }
      for (let k = 1; k <= 20; k++) { const e0 = edge(top[k - 1][0]), e1 = edge(top[k][0]); tri(top[k - 1], top[k], bot[k - 1], C.gold, 0.035 * e0, C.gold, 0.035 * e1, C.gold, 0.008 * e0); tri(top[k], bot[k], bot[k - 1], C.gold, 0.035 * e1, C.gold, 0.008 * e1, C.gold, 0.008 * e0); }
      stroke(top.slice(1, 20), C.gold, 0.45, 0.0009, { tin: 0.08, tout: 0.08 });
    }
    // 远岸栏杆：每 2 米一根望柱
    const pm0 = Math.floor((cx - HM) / 2) * 2;
    for (let m = pm0; m < cx + HM; m += 2) { const x = toX(m), e = edge(x); if (e <= 0) continue; stroke([[x, 0.007, -0.093], [x, 0.0125, -0.093]], C.gold, 0.4 * e, 0.0007, { tin: 0, tout: 0.2 }); P(x, 0.013, -0.093, C.goldHi, 0.0012, 0, 0.5 * e); }
    stroke([[-WX + 0.01, 0.0115, -0.093], [WX - 0.01, 0.0115, -0.093]], C.gold, 0.25, 0.0005, { tin: 0.1, tout: 0.1 });
  }

  function drawWaterAccents(ctx) {
    const t = ctx.t;
    for (const c of crests) {
      const x = toX(c.m); if (Math.abs(x) > WX) continue; const e = edge(x), s = c.s * 0.0013, bob = Math.sin(t * 1.6 + c.ph) * 0.3;
      const pts = curve([[-5, 0], [-2, 0.5 + bob * 0.2], [0.6, 1.9 + bob * 0.3], [1.4, 3.0 + bob * 0.4], [0.4, 3.5 + bob * 0.4], [-0.4, 2.8 + bob * 0.3]].map(p => [x + p[0] * s, p[1] * s, c.z]), 3);
      stroke(pts, C.water, 0.5 * e, 0.0008 * c.s, { tin: 0.05, tout: 0.4, tip: 0.2 });
      P(x + 0.4 * s, 3.4 * s, c.z, C.white, 0.0013, 0, 0.4 * e);
    }
  }
  // 终点线（朱砂一笔 + 灯）和各道标旗；牌坊在 3D 层
  function drawFinishLine(ctx) {
    const t = ctx.t, x = toX(ctx.raceLen); if (Math.abs(x) > WX + 0.07) return;
    const e = edge(x);
    // 终点：横跨河面的一道灯绳（金线微垂 + 一串小灯），不是一条红色激光线
    const rope = []; for (let q = 0; q <= 16; q++) { const u = q / 16, zz = -0.106 + u * 0.212; rope.push([x, 0.016 - Math.sin(Math.PI * u) * 0.006, zz]); }
    // 你过线后灯绳淡出：它横跨四条车道，透视里是一条竖线，结算时会被看成"一道白痕穿过所有船"（审查 #9-1）
    const ropeK = 1 - Math.min(1, ctx.archReveal * 2.5); if (ropeK <= 0.01) return;
    stroke(rope, C.goldHi, 0.7 * e * ropeK, 0.0008, { tin: 0.02, tout: 0.02, dry: 0 });
    for (let q = 1; q < 16; q++) { const p = rope[q]; P(p[0], p[1] - 0.002, p[2], q % 2 ? C.warm : C.goldHi, 0.0042, 4, ropeK * (0.65 + 0.3 * Math.sin(t * 4 + q)) * e); }
    for (const zz of [-0.106, 0.106]) stroke([[x, 0, zz], [x, 0.019, zz]], C.verm, 0.8 * e * ropeK, 0.0014, { tin: 0, tout: 0.1 });
    if (ctx.archReveal > 0.05) for (const s of [-1, 1]) cloud(x + s * (0.06 + 0.01 * ctx.archReveal), 0.08 + 0.01 * Math.sin(t), -0.146, 0.8 * ctx.archReveal, 0.6 * ctx.archReveal * e, s < 0 ? C.goldHi : C.cloud);
  }
  // ---------- 两岸：观众、旗、亭、柳、灯笼串 ----------
  function drawBanks(ctx) {
    const t = ctx.t, ex0 = ctx.excite, wave = ctx.wave;
    // 看台的廊顶：一条起翘的长檐
    const ry = 0.032, rz = -0.128, eaves = [];
    for (let k = 0; k <= 24; k++) { const x = -WX + k * 2 * WX / 24; eaves.push([x, ry + 0.002 * Math.pow(Math.abs(k / 12 - 1), 3) + 0.0015 * Math.sin(k * 0.8 + cx * 0.3) * 0, rz]); }
    stroke(eaves.slice(1, 24), C.verm, 0.4, 0.0011, { tin: 0.1, tout: 0.1 });
    for (let m = Math.floor((cx - HM) / 4) * 4; m < cx + HM; m += 4) { const x = toX(m), e = edge(x); if (e > 0) stroke([[x, 0.006, rz], [x, ry, rz]], C.verm, 0.3 * e, 0.0007, { tin: 0, tout: 0.1 }); }
    for (const p of crowd) {
      const m = wrapM(p.m, CROWD_SPAN), x = toX(m), e = edge(x); if (e <= 0) continue;
      const wv = Math.exp(-Math.pow((x - wave.x) / 0.03, 2)) * Math.max(0, 1 - wave.t / 1.4);
      const ex = clamp(ex0 + wv, 0, 1.2);
      const jump = Math.max(0, Math.sin(t * (5 + p.ph) + p.ph)) * 0.0028 * ex;
      const up = clamp(ex * 1.3 - 0.3 + 0.3 * Math.sin(t * 3 + p.ph), 0, 1), sway = Math.sin(t * 7 + p.ph * 3) * 0.001 * up;
      person(x, p.y + jump, p.z, p.robe, (p.near ? 0.6 : 0.5) * e * (0.75 + 0.35 * ex), up, sway, p.near ? 1.15 : 1, p.prop, t);
    }
    // 远岸旗：每 6 米一面，大三角旗 + 火焰边
    const fm0 = Math.floor((cx - HM) / 6) * 6;
    for (let m = fm0; m < cx + HM; m += 6) {
      const x = toX(m), e = edge(x); if (e <= 0) continue;
      const z = -0.098, top = 0.04, col = [C.verm, C.qing, C.lv, C.gold][((m / 6) % 4 + 4) % 4], f = 0.5 + ex0;
      stroke([[x, 0.004, z], [x, top + 0.002, z]], C.gold, 0.5 * e, 0.0007, { tin: 0, tout: 0.1 });
      P(x, top + 0.0025, z, C.goldHi, 0.0015, 0, 0.7 * e);
      const up = [], dn = [];
      for (let k = 0; k <= 6; k++) { const u = k / 6, w = Math.sin(t * 6 * f - u * 4 + m) * 0.0024 * u * f, xx = x - u * 0.016; up.push([xx, top + w, z]); dn.push([xx, top - 0.011 * (1 - u * 0.85) + w, z]); }
      ribbon(up, dn, col, 0.32 * e, col, 0.18 * e);
      stroke(up, mixc(col, C.white, 0.3), 0.7 * e, 0.0008, { tin: 0.02, tout: 0.4 }); stroke(dn, col, 0.55 * e, 0.0007, { tin: 0.02, tout: 0.4 });
      // 火焰边（锯齿）
      for (let k = 1; k < 6; k += 2) { const a = dn[k], b = dn[k + 1]; stroke([a, [(a[0] + b[0]) / 2, a[1] - 0.002, z], b], col, 0.5 * e, 0.0005); }
    }
    // 远岸亭子：每 50 米一座
    for (let m = 25; m < ctx.raceLen; m += 50) { const x = toX(m); if (Math.abs(x) < WX + 0.03) pavilion(x, -0.14, edge(x)); }
    // 近岸：柳树（每 14 米）+ 柳间灯笼串
    const wm0 = Math.floor((cx - HM) / 20) * 20;
    for (let m = wm0 + 7; m < cx + HM; m += 20) {
      const x = toX(m), e = edge(x); if (e <= 0) continue;
      const z = 0.118, h = 0.03;
      stroke(curve([[x + 0.001, 0, z], [x - 0.001, h * 0.4, z], [x + 0.002, h * 0.75, z], [x, h, z]]), [0.95, 0.72, 0.4], 0.5 * e, 0.0018, { tin: 0, tout: 0.5, tip: 0.3 });
      for (let k = 0; k < 9; k++) {
        const a0 = -1 + k * 0.25, sx = x + Math.sin(a0) * 0.004, sy = h + Math.cos(a0) * 0.002, len = h * (0.55 + (k % 3) * 0.12), sw = Math.sin(t * 1.4 + k + m) * 0.002;
        stroke(curve([[sx, sy, z], [sx + a0 * 0.008, sy + 0.003, z], [sx + a0 * 0.012 + sw * 0.5, sy - len * 0.4, z], [sx + a0 * 0.013 + sw, sy - len, z]]), C.willow, 0.32 * e, 0.0006, { tin: 0.05, tout: 0.6, tip: 0.1 });
      }
      // 灯笼串到下一棵柳
      const x2 = toX(m + 20), e2 = edge(x2); if (e2 <= 0 && e <= 0) continue;
      const str = []; for (let k = 0; k <= 12; k++) { const u = k / 12; str.push([x + (x2 - x) * u, h * 0.82 - Math.sin(Math.PI * u) * 0.01, z]); }
      stroke(str, C.gold, 0.25 * Math.min(e, e2 + 0.3), 0.0004, { tin: 0.05, tout: 0.05 });
      for (let k = 2; k <= 10; k += 2) { const p = str[k], ee = edge(p[0]); P(p[0], p[1] - 0.003, z, C.warm, 0.0045, 4, (0.6 + 0.25 * Math.sin(t * 2 + k + m)) * ee * (0.8 + 0.4 * ex0)); stroke([[p[0], p[1], z], [p[0], p[1] - 0.0018, z]], C.gold, 0.4 * ee, 0.0003); }
    }
  }
  function pavilion(x, z, e) {
    if (e <= 0) return; const g = C.gold, w = 0.016, h = 0.034, a = 0.55 * e;
    for (const s of [-1, 1]) { stroke([[x + s * w, 0.007, z], [x + s * w, h, z]], C.verm, a, 0.0012, { tin: 0, tout: 0.1 }); poly([[x + s * w - 0.0008, 0.007, z], [x + s * w + 0.0008, 0.007, z], [x + s * w + 0.0008, h, z], [x + s * w - 0.0008, h, z]], C.verm, 0.25 * e); }
    stroke([[x - w, h - 0.004, z], [x + w, h - 0.004, z]], g, a, 0.0008);
    for (const [yy, ww, k] of [[h, w * 1.8, 1], [h + 0.013, w * 1.15, 0.9]]) {
      const top = [], bot = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10, v = Math.abs(u * 2 - 1); top.push([x - ww + u * 2 * ww, yy + 0.006 - 0.002 * v + 0.005 * Math.pow(v, 4), z]); bot.push([x - ww + u * 2 * ww, yy + 0.0012 * (1 - v) + 0.005 * Math.pow(v, 4), z]); }
      ribbon(top, bot, C.verm, 0.3 * e * k, C.verm, 0.15 * e * k);
      stroke(bot, C.goldHi, a * k, 0.0011, { tin: 0.05, tout: 0.05 }); stroke(top, g, a * 0.7 * k, 0.0008, { tin: 0.1, tout: 0.1 });
      P(x - ww, bot[0][1] + 0.0008, z, C.goldHi, 0.002, 0, a); P(x + ww, bot[10][1] + 0.0008, z, C.goldHi, 0.002, 0, a);
    }
    stroke([[x, h + 0.019, z], [x, h + 0.027, z]], g, a, 0.0009, { tin: 0, tout: 0.6 }); P(x, h + 0.028, z, C.goldHi, 0.0035, 0, a);
    for (const s of [-1, 1]) P(x + s * w * 0.6, h - 0.008, z + 0.001, C.warm, 0.004, 4, 0.7 * e);
  }

  // ---------- 终点：牌坊 + 灯线 + 各道标旗 ----------
  function drawFinish(ctx) {
    const t = ctx.t, x = toX(ctx.raceLen); if (Math.abs(x) > WX + 0.07) return;
    const e = edge(x), rv = Math.max(ctx.archReveal, 0.55);
    // 终点线：朱砂一笔横贯河面 + 一串灯
    stroke(curve([[x, 0.0006, -0.088], [x + 0.001, 0.0006, -0.03], [x - 0.001, 0.0006, 0.03], [x, 0.0006, 0.088]], 3), C.verm, 0.75 * e, 0.0016, { tin: 0.06, tout: 0.2 });
    for (let k = 0; k <= 10; k++) { const z = -0.085 + k * 0.017; P(x, 0.004, z, k % 2 ? C.warm : C.goldHi, 0.0045, 4, (0.6 + 0.3 * Math.sin(t * 4 + k)) * e); }
    // 标旗
    ctx.boats.forEach((b, i) => {
      if (b.finishT !== null) return; const z = ctx.laneZ[i] - 0.014, tm = TEAM[i];
      stroke([[x + 0.002, 0, z], [x + 0.002, 0.034, z]], C.gold, 0.7 * e, 0.0008, { tin: 0, tout: 0.1 });
      const f = Math.sin(t * 5 + i) * 0.0015; poly([[x + 0.002, 0.034, z], [x - 0.011, 0.03 + f, z], [x + 0.002, 0.025, z]], tm.hull, 0.5 * e);
      stroke([[x + 0.002, 0.034, z], [x - 0.011, 0.03 + f, z], [x + 0.002, 0.025, z]], tm.trim, 0.8 * e, 0.0007);
    });
    // 牌坊：四柱三间，两层檐，朱漆 + 描金，中匾
    const z = -0.15, g = C.gold, rk = i => clamp(ctx.archReveal * 4 - i, 0, 1) * 0.5 + 0.5 * rv;
    [-0.034, -0.013, 0.013, 0.034].forEach((c, i) => { const hh = (i === 1 || i === 2) ? 0.066 : 0.052; poly([[x + c - 0.0016, 0.006, z], [x + c + 0.0016, 0.006, z], [x + c + 0.0016, hh, z], [x + c - 0.0016, hh, z]], C.verm, 0.3 * e * rv); stroke([[x + c, 0.006, z], [x + c, hh, z]], C.goldHi, 0.5 * e * rv, 0.0009, { tin: 0, tout: 0.05 }); });
    const eave = (x0, x1, y, k) => {
      const top = [], bot = []; for (let i = 0; i <= 12; i++) { const u = i / 12, v = Math.abs(u * 2 - 1); top.push([x + x0 + u * (x1 - x0), y + 0.0075 - 0.0025 * v + 0.006 * Math.pow(v, 4), z]); bot.push([x + x0 + u * (x1 - x0), y + 0.001 + 0.006 * Math.pow(v, 4), z]); }
      ribbon(top, bot, C.verm, 0.4 * e * k, C.verm, 0.2 * e * k); stroke(bot, C.goldHi, 0.85 * e * k, 0.0013, { tin: 0.04, tout: 0.04 }); stroke(top, g, 0.6 * e * k, 0.001, { tin: 0.06, tout: 0.06 });
      P(top[0][0], bot[0][1] + 0.001, z, C.goldHi, 0.0028, 0, e * k); P(top[12][0], bot[12][1] + 0.001, z, C.goldHi, 0.0028, 0, e * k);
    };
    eave(-0.05, -0.008, 0.052, rk(0)); eave(0.008, 0.05, 0.052, rk(1)); eave(-0.026, 0.026, 0.068, rk(2));
    const py = 0.058, pw = 0.0105, ph = 0.0055;
    poly([[x - pw, py - ph, z], [x + pw, py - ph, z], [x + pw, py + ph, z], [x - pw, py + ph, z]], C.verm, 0.45 * e * rk(3));
    stroke([[x - pw, py - ph, z], [x + pw, py - ph, z], [x + pw, py + ph, z], [x - pw, py + ph, z], [x - pw, py - ph, z]], C.goldHi, 0.8 * e * rk(3), 0.0008, { tin: 0, tout: 0 });
    // 匾上两个"字"：几笔描金（示意，不是真字）
    for (const s of [-1, 1]) { const cx0 = x + s * 0.0048; stroke([[cx0 - 0.0028, py + 0.003, z], [cx0 + 0.0028, py + 0.003, z]], C.goldHi, 0.9 * e * rk(3), 0.0007); stroke([[cx0, py + 0.004, z], [cx0, py - 0.004, z]], C.goldHi, 0.9 * e * rk(3), 0.0007); stroke([[cx0 - 0.0025, py - 0.0005, z], [cx0 + 0.0025, py - 0.0025, z]], C.goldHi, 0.8 * e * rk(3), 0.0006); }
    for (let k = 0; k < 5; k++) { const yy = 0.045 - k * 0.008; for (const s of [-1, 1]) P(x + s * 0.0235, yy, z + 0.002, C.warm, 0.0045, 4, 0.65 * e * rk(3)); }
    // 夺冠后：牌坊两侧涌出祥云
    if (ctx.archReveal > 0.05) for (const s of [-1, 1]) cloud(x + s * (0.06 + 0.01 * ctx.archReveal), 0.07 + 0.01 * Math.sin(t), z + 0.004, 0.8 * ctx.archReveal, 0.6 * ctx.archReveal * e, s < 0 ? C.goldHi : C.cloud);
  }

  // ---------- 龙舟 ----------
  const prevTh = [];
  const splashCount = [0, 0, 0, 0];
  function drawBoat(ctx, b, i) {
    const t = ctx.t, bow = toX(b.pos), x0 = bow - 0.035, z = ctx.laneZ[i];
    const e = edge(x0) * 0.6 + edge(bow + 0.015) * 0.4; if (e <= 0.01) return;
    const mine = i === 0, tm = TEAM[i], k = (mine ? 0.92 : 0.75) * e, s = 0.001;
    const bob = Math.sin(t * 2.2 + i) * 0.0003 - (b.force > 0 ? 0.0003 * Math.min(1, b.force / 12) : 0), oy = 0.0006 + bob;
    const X = u => x0 + u * s, Y = v => oy + v * s, Pt = (u, v) => [X(u), Y(v), z], PL = arr => arr.map(p => Pt(p[0], p[1]));
    // 船身：朱漆平涂（舷边亮、船底淡）+ 舷边描金粗笔 + 龙骨细笔 + 两排金鳞
    ribbon(PL(HULL_TOP), PL(HULL_BOT), tm.hull, 0.34 * k, tm.hull, 0.1 * k);
    stroke(PL(HULL_TOP), tm.trim, 0.95 * k, 0.0014, { tin: 0.06, tout: 0.1, tip: 0.3 });
    stroke(PL(HULL_BOT), tm.hull, 0.8 * k, 0.0009, { tin: 0.1, tout: 0.1 });
    for (let u = -28; u < 29; u += 3) for (const [yy, off] of [[2.6, 0], [0.4, 1.5]]) {
      const uu = u + off; if (Math.abs(uu) > 29) continue;
      stroke([Pt(uu - 1.3, yy), Pt(uu - 0.7, yy - 0.9), Pt(uu, yy - 1.2), Pt(uu + 0.7, yy - 0.9), Pt(uu + 1.3, yy)], tm.trim, 0.42 * k, 0.00045, { tin: 0.1, tout: 0.3 });
    }
    // 龙头：脖子 + 上颚 + 下颚（张口）+ 眼 + 角 + 鬃 + 须 + 牙
    const roar = mine ? Math.max(0, 1 - (t - ctx.roarT) / 1.2) : 0, hitOpen = Math.max(0, 1 - (t - b.lastHit) / 0.25);
    const open = Math.max(roar, hitOpen * 0.5) * 22 * Math.PI / 180;
    const neckF = curve([[33.5, 4.8], [35.6, 7.6], [37, 11]]), neckB = curve([[31.5, 5.2], [33.2, 8.6], [36.4, 12.4]]);
    ribbon(PL(neckF), PL(neckB), tm.hull, 0.4 * k, tm.hull, 0.3 * k);
    stroke(PL(neckF), tm.trim, 0.85 * k, 0.0011, { tin: 0.05, tout: 0.2 }); stroke(PL(neckB), tm.trim, 0.6 * k, 0.0008);
    poly(PL(UPPER), tm.hull, 0.48 * k, Pt(43, 15.6), 0.3 * k);
    stroke(PL(curve(UPPER.slice(0, 7))), tm.trim, 1 * k, 0.0012, { tin: 0.05, tout: 0.15, tip: 0.3 });
    stroke(PL(UPPER.slice(5).concat([UPPER[0]])), tm.trim, 0.65 * k, 0.0008, { tin: 0.05, tout: 0.3 });
    const piv = [41.2, 14], rot = p => { const dx = p[0] - piv[0], dy = p[1] - piv[1], c = Math.cos(-open), sn = Math.sin(-open); return [piv[0] + dx * c - dy * sn, piv[1] + dx * sn + dy * c]; };
    const low = LOWER.map(rot);
    poly(PL(low), tm.hull, 0.4 * k); stroke(PL(low.concat([low[0]])), tm.trim, 0.7 * k, 0.0008, { tin: 0.05, tout: 0.1 });
    // 牙：上颚下沿一排小齿
    const teeth = []; for (let q = 0; q <= 8; q++) { const u = 44.5 + q * 0.6; teeth.push([u, 14.6 - (q % 2) * 0.7]); }
    stroke(PL(teeth), C.white, 0.75 * k, 0.00035, { tin: 0, tout: 0.2 });
    if (open > 0.05) P(X(49), Y(13.8), z, C.goldHi, 0.004 + 0.008 * roar, 4, (roar + hitOpen * 0.3) * k);
    // 眼：白点 + 朱瞳 + 眉
    P(X(44.6), Y(16.3), z, C.white, 0.0024, 0, k); P(X(44.9), Y(16.3), z, C.verm, 0.0012, 0, k);
    stroke(PL(curve([[42.6, 17.1], [44.4, 17.9], [46.2, 17.6]])), tm.trim, 0.9 * k, 0.0008, { tin: 0.1, tout: 0.5 });
    // 角：鹿角式，两叉
    stroke(PL(curve([[41.6, 17.2], [40, 20.2], [37.6, 22.6], [35.4, 22.8]])), C.goldHi, 0.95 * k, 0.0011, { tin: 0.02, tout: 0.5, tip: 0.1 });
    stroke(PL(curve([[39.5, 20.9], [40.4, 23], [41.6, 23.9]])), C.goldHi, 0.85 * k, 0.0008, { tin: 0.02, tout: 0.6, tip: 0.1 });
    // 鬃：四道火焰笔触往后飘
    for (let q = 0; q < 4; q++) {
      const sw = Math.sin(t * 3.2 + q * 0.9 + i) * 0.8, bx = 39.8 - q * 1.0, by = 16.6 - q * 1.4;
      stroke(PL(curve([[bx, by], [bx - 2.4, by + 1.6 + sw * 0.3], [bx - 4.6, by + 1.2 + sw], [bx - 6.4, by + 2.4 + sw * 1.4]])), q % 2 ? tm.hull : C.goldHi, 0.85 * k, 0.0012, { tin: 0.05, tout: 0.7, tip: 0.08 });
    }
    // 须：两道长须，随风摆
    for (const [bx, by, d] of [[50.4, 15.6, 1], [48.6, 13.2, -1]]) {
      const sw = Math.sin(t * 2.6 + bx + i) * 1.2;
      stroke(PL(curve([[bx, by], [bx + 2.6, by + 1.6 * d + sw * 0.4], [bx + 4.8, by + 0.6 * d + sw], [bx + 5.4, by - 1.2 * d + sw], [bx + 4.4, by - 1.8 * d + sw]])), C.goldHi, 0.8 * k, 0.0008, { tin: 0.05, tout: 0.6, tip: 0.08 });
    }
    // 龙尾：三道卷火
    for (let q = 0; q < 3; q++) {
      const sw = Math.sin(t * 3 + q + i) * 0.8;
      stroke(PL(curve([[-33.6, 5 + q * 0.6], [-37 - q, 8 + q * 0.8], [-39.6 - q * 0.6, 12.6 + q * 0.9 + sw * 0.4], [-38.2 - q * 0.4, 16 + q * 0.6 + sw], [-36.4 - q * 0.2, 15 + q * 0.5 + sw]])), q === 1 ? C.goldHi : tm.hull, 0.85 * k, 0.0012 - q * 0.0002, { tin: 0.05, tout: 0.6, tip: 0.1 });
    }
    // 鼓：鼓身朱漆 + 上下鼓圈（水平椭圆）+ 鼓面（落槌时泛金）
    const flash = Math.max(0, 1 - (t - b.lastHit) / 0.2), du = 25.5, dr = 2.8;
    poly([Pt(du - dr, 4.6), Pt(du + dr, 4.6), Pt(du + dr * 1.08, 7), Pt(du + dr, 9.2), Pt(du - dr, 9.2), Pt(du - dr * 1.08, 7)], C.verm, 0.4 * k);
    for (const [yy, a0] of [[9.2, 1], [4.6, 0.5]]) { const ring = []; for (let q = 0; q <= 16; q++) { const th = TAU * q / 16; ring.push([X(du + Math.cos(th) * dr), Y(yy), z + Math.sin(th) * dr * s]); } stroke(ring, mixc(C.goldHi, C.white, flash), (0.8 + flash) * a0 * k, 0.0008 + flash * 0.0005, { tin: 0, tout: 0, dry: 0 }); if (yy > 9) { const head = ring.slice(0, 16); poly(head, mixc(C.gold, C.white, flash * 0.5), (0.1 + 0.28 * flash) * k, [X(du), Y(yy), z]); } }
    for (const sx of [-1, 1]) stroke([Pt(du + sx * dr * 1.04, 5.2), Pt(du + sx * dr * 1.08, 7), Pt(du + sx * dr * 1.04, 8.6)], C.gold, 0.6 * k, 0.0006);
    // 鼓手：面朝桨手坐着；头带飘带；两臂按左右手落槌
    const hx = 31.5, hip = 5.4, sh = 10.4;
    poly([Pt(hx - 1.2, hip), Pt(hx + 1.2, hip), Pt(hx + 0.9, sh), Pt(hx - 0.7, sh)], tm.cloth, 0.45 * k);
    stroke([Pt(hx + 1.1, hip), Pt(hx + 0.9, sh)], tm.trim, 0.7 * k, 0.0007);
    P(X(hx + 0.2), Y(sh + 1.9), z, mixc(tm.cloth, C.ivory, 0.5), 0.0034, 0, 0.95 * k);
    stroke(PL(curve([[hx - 1, sh + 2.3], [hx + 1.4, sh + 2.6], [hx + 3 + Math.sin(t * 6) * 0.5, sh + 2.2], [hx + 4.6, sh + 2.9 + Math.sin(t * 7) * 0.6]])), tm.band, 0.9 * k, 0.0008, { tin: 0.1, tout: 0.6 });
    for (const hd of [0, 1]) {
      const since = mine ? t - ctx.lastHand[hd].t : t - b.lastHit + (b.hits % 2 === hd ? 0 : 0.35);
      const up = smooth(0.06, 0.3, since), ex = du + 1.3 - hd * 1.3, ey = 9.4 + up * 5.6;
      stroke(PL([[hx - 0.3, sh - 0.6], [hx - 2.2, sh - 1.4 + up * 2], [ex + 1.4 - up * 0.8, ey + 1.2]]), tm.cloth, 0.75 * k, 0.0007, { tin: 0.1, tout: 0.2 });
      stroke(PL([[ex + 1.4 - up * 0.8, ey + 1.2], [ex, ey]]), C.goldHi, 0.9 * k, 0.0006, { tin: 0, tout: 0.3 });
      P(X(ex), Y(ey), z, hd ? C.goldHi : tm.band, 0.0017, 0, k);
    }
    // 舵手：斗笠 + 长舵桨
    const sx0 = -31;
    poly([Pt(sx0 - 1, 4.6), Pt(sx0 + 1, 4.6), Pt(sx0 + 0.8, 14.4), Pt(sx0 - 0.8, 14.4)], tm.cloth, 0.4 * k);
    poly([Pt(sx0 - 3.4, 16.4), Pt(sx0 + 3.4, 16.4), Pt(sx0, 19.2)], C.gold, 0.35 * k);
    stroke([Pt(sx0 - 3.6, 16.3), Pt(sx0, 19.3), Pt(sx0 + 3.6, 16.3)], C.goldHi, 0.85 * k, 0.0008, { tin: 0.1, tout: 0.1 });
    stroke([Pt(sx0 + 1.6, 13.6), Pt(sx0 - 11, -3.4)], C.gold, 0.7 * k, 0.0008, { tin: 0.05, tout: 0.1 });
    poly([Pt(sx0 - 8.6, 0.2), Pt(sx0 - 9.6, -0.6), Pt(sx0 - 11.6, -3.8), Pt(sx0 - 10.6, -3)], tm.hull, 0.5 * k);
    // 桨手：填色上身 + 头 + 头带 + 两臂 + 金色桨杆（二十道平行金线）+ 填色桨叶
    const pt = prevTh[i] || (prevTh[i] = new Float32Array(10).fill(0.85));
    b.crew.r.forEach((r, j) => {
      const th = r.th; let phi, lift;
      if (th < 0.35) { const u = th / 0.35; phi = 45 - 70 * (u * u * (3 - 2 * u)); lift = 0; }
      else { const u = (th - 0.35) / 0.65; phi = -25 + 70 * (u * u * (3 - 2 * u)); lift = Math.sin(Math.PI * u) * 3; }
      const pr = phi * Math.PI / 180, sn = Math.sin(pr), cs = Math.cos(pr);
      const ru = rowerU(j), px = ru + 1.6, py = 6 + lift;
      const tx = px + sn * 10, ty = py - cs * 10, gx = px - sn * 6, gy = py + cs * 6;
      const lean = pr * 0.45, shx = ru + Math.sin(lean) * 4.8, shy = 5.4 + Math.cos(lean) * 4.8;
      poly([Pt(ru - 1.1, 5.2), Pt(ru + 1.1, 5.2), Pt(shx + 0.9, shy), Pt(shx - 0.9, shy)], tm.cloth, 0.26 * k);
      stroke([Pt(ru - 1.1, 5.2), Pt(shx - 0.9, shy)], tm.trim, 0.5 * k, 0.0005, { tin: 0.1, tout: 0.3 });
      const hdx = shx + Math.sin(lean) * 1.9, hdy = shy + Math.cos(lean) * 1.9;
      P(X(hdx), Y(hdy), z, mixc(tm.cloth, C.ivory, 0.5), 0.0028, 0, 0.9 * k);
      stroke([Pt(hdx - 1.1, hdy + 0.5), Pt(hdx + 1.1, hdy + 0.5), Pt(hdx - 1.6, hdy + 0.9 + Math.sin(t * 6 + j) * 0.3)], tm.band, 0.8 * k, 0.0005, { tin: 0.1, tout: 0.5 });
      stroke([Pt(shx, shy - 0.4), Pt((shx + gx) / 2 - 0.6, (shy + gy) / 2), Pt(gx, gy)], tm.cloth, 0.55 * k, 0.0005, { tin: 0.1, tout: 0.2 });
      stroke([Pt(shx, shy - 0.8), Pt(px - sn * 1.2, py + cs * 1.2)], tm.cloth, 0.55 * k, 0.0005, { tin: 0.1, tout: 0.2 });
      stroke([Pt(gx, gy), Pt(tx, ty)], mine ? C.goldHi : C.gold, 0.8 * k, 0.0007, { tin: 0, tout: 0.05, tip: 0.6, dry: 0 });
      // 桨叶：叶形平涂 + 描边
      const b0x = tx - sn * 3.6, b0y = ty + cs * 3.6, nx = cs * 0.9, ny = sn * 0.9;
      const blade = [Pt(b0x, b0y), Pt((b0x + tx) / 2 + nx, (b0y + ty) / 2 + ny), Pt(tx, ty), Pt((b0x + tx) / 2 - nx, (b0y + ty) / 2 - ny)];
      poly(blade, tm.hull, 0.35 * k); stroke(blade.concat([blade[0]]), tm.trim, 0.6 * k, 0.0004, { tin: 0, tout: 0 });
      // 入水：笔触水花
      if (pt[j] > 0.8 && th < 0.2 && !r.hold) { splash(X(tx), z, mine ? 1 : 0.6); splashCount[i]++; }
      pt[j] = th;
    });
    // 船头卷浪（白）+ 尾迹（水面两笔）
    const sp = Math.min(1, b.v / 3.2);
    if (sp > 0.05) {
      const cr = PL(curve([[34, 0], [37 + sp * 2, 0.8], [39 + sp * 3, 2.4 + sp], [38.6 + sp * 3, 4 + sp * 1.3], [37.4 + sp * 2.6, 3.6 + sp], [37.8 + sp * 2.4, 2.7 + sp * 0.8]]));
      stroke(cr, C.white, 0.5 * sp * e, 0.0008, { tin: 0.05, tout: 0.5 });
      for (const sd of [-1, 1]) stroke(curve([[bow - 0.004, 0.0004, z], [bow - 0.03, 0.0004, z + sd * 0.004 * (0.6 + sp)], [bow - 0.07 - 0.03 * sp, 0.0004, z + sd * 0.011 * (0.6 + sp)]]), C.water, 0.45 * sp * e, 0.0011, { tin: 0.02, tout: 0.8 });
      // 冲刺且整齐：船身两侧拉出风纹
      if (mine && ctx.sprint && b.crew.sync > 0.8) for (let q = 0; q < 3; q++) { const ph = (t * 1.8 + q / 3) % 1, wx = x0 + 0.02 - ph * 0.09, wy = 0.012 + q * 0.006; stroke([[wx, wy, z + 0.006], [wx - 0.02, wy + 0.001, z + 0.006]], C.gold, 0.22 * Math.sin(Math.PI * ph) * e, 0.0005, { tin: 0.1, tout: 0.7 }); }
    }
    // 夺到的标旗插在船头
    if (b.finishT !== null) { stroke([Pt(33, 4), Pt(33, 30)], C.gold, 0.8 * k, 0.0007, { tin: 0, tout: 0.1 }); const f = Math.sin(t * 5) * 1; poly([Pt(33, 30), Pt(22, 27 + f), Pt(33, 24)], tm.hull, 0.6 * k); stroke([Pt(33, 30), Pt(22, 27 + f), Pt(33, 24)], tm.trim, 0.9 * k, 0.0008); }
  }

  // ---------- 特效 ----------
  const fx = [];   // 笔触特效：水花、墨花
  const parts = [];
  function burst(x, y, z, c, n, sp, size, life, grav = 0, shape = 5) {
    for (let q = 0; q < n; q++) {
      const d = new V3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(sp * (0.6 + 0.4 * Math.random()));
      const l = life * (0.6 + 0.6 * Math.random());
      parts.push({ x, y, z, vx: d.x, vy: d.y, vz: d.z, life: l, max: l, size: size * (0.7 + 0.6 * Math.random()), c, grav, shape, drag: 1.5 });
    }
  }
  function splash(x, z, k) { if (fx.length < 400) fx.push({ type: 'splash', x, z, t: 0, k: k * (k >= 1 ? 2.0 : 1.5), gold: k >= 1, d: Math.random() < 0.5 ? -1 : 1 }); burst(x, 0.001, z, C.water, k > 0.8 ? 2 : 1, 0.04, 0.0014, 0.3, -0.35, 0); }
  // 墨花：一圈放射的短笔触 + 外圈一笔；k = 尺寸（头显里大，桌面上画在你的鼓面、小）
  function inkBloom(x, y, z, col, k, big) { fx.push({ type: 'bloom', x, y, z, col, k, big, t: 0, seed: Math.random() * TAU }); burst(x, y, z, C.goldHi, big ? 10 : 6, 0.12 * k, 0.002 * Math.sqrt(k), 0.35, 0, 5); }
  // 主角鼓手背后一圈金光轮（竖直，朝观者），鼓点时一亮
  function halo(ctx) {
    const b = ctx.boats[0], S = 0.00135, x = toX(b.pos) - 36 * S + 32.4 * S, y = 0.0008 + 14 * S, z = ctx.laneZ[0] - 0.002, e = edge(x);
    // 平面金盘，永远朝向观者（审查 #7-4：之前竖在船上的圆，从斜上方看像一个玻璃泡）；放在鼓手身后
    const hit = Math.exp(-Math.max(0, ctx.t - b.lastHit) * 6), r = 0.0095 + 0.002 * hit, cam = ctx.cam;
    const vx = cam.x - x, vy = cam.y - y, vz = cam.z - z, vl = Math.hypot(vx, vy, vz) || 1, n = [vx / vl, vy / vl, vz / vl];
    let ux = n[2], uz = -n[0]; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;                   // 水平方向
    const v = [n[1] * uz, n[2] * ux - n[0] * uz, -n[1] * ux];                                           // 与视线垂直的"上"
    const cx0 = x - n[0] * 0.006, cy0 = y - n[1] * 0.006, cz0 = z - n[2] * 0.006, P2 = (a, rr) => [cx0 + (ux * Math.cos(a) + v[0] * Math.sin(a)) * rr, cy0 + v[1] * Math.sin(a) * rr, cz0 + (uz * Math.cos(a) + v[2] * Math.sin(a)) * rr];
    const ring = []; for (let q = 0; q <= 32; q++) ring.push(P2(q / 32 * TAU, r));
    stroke(ring, C.goldHi, (0.6 + 0.6 * hit) * e, 0.0011 + 0.0006 * hit, { tin: 0, tout: 0, dry: 0 });
    for (let q = 0; q < 24; q++) { const a = q / 24 * TAU + ctx.t * 0.3, L = q % 2 ? 1.25 : 1.45; stroke([P2(a, r * 1.1), P2(a, r * (L + 0.15 * hit))], q % 2 ? C.gold : C.goldHi, (0.45 + 0.5 * hit) * e, q % 2 ? 0.0005 : 0.0008, { tin: 0, tout: 0.6, dry: 0 }); }
  }
  // 看台分间柱上的幡（每 6 米一面，四队轮换）
  function banners(ctx) {
    if (ctx.state === 'title' || ctx.state === 'result') return;
    const cols = [C.verm, C.qing, C.lv, C.zi], z = -0.1365;
    for (let m = Math.floor((cx - HM) / 6) * 6; m < cx + HM; m += 6) {
      const x = toX(m) + 0.0012, e = edge(x); if (e < 0.2) continue;
      const fc = cols[((Math.round(m / 6) % 4) + 4) % 4], sw = Math.sin(ctx.t * 2 + m) * 0.0006, w = 0.0055, top = 0.031, bot = 0.014;
      const q = [[x, top, z], [x + w, top, z], [x + w + sw, bot, z], [x + sw, bot, z]];
      poly(q, fc, 0.42 * e);
      stroke(q.concat([q[0]]), C.goldHi, 0.85 * e, 0.0005, { tin: 0, tout: 0, dry: 0 });
      stroke([[x - 0.001, top, z], [x + w + 0.001, top, z]], C.goldHi, 0.9 * e, 0.0009, { tin: 0, tout: 0, dry: 0 });   // 顶杆
      for (const f of [0.25, 0.75]) stroke([[x + sw + w * f, bot, z], [x + sw * 1.5 + w * f, bot - 0.004, z]], C.gold, 0.7 * e, 0.0004, { tin: 0, tout: 0.5 });   // 流苏
      stroke([[x + w * 0.5, top - 0.003, z], [x + w * 0.5 + sw * 0.5, bot + 0.004, z]], C.goldHi, 0.5 * e, 0.0004, { tin: 0.2, tout: 0.2 });   // 幡面中线（示意字）
    }
  }
  // 尾迹：船尾两道渐细的描金线，向后张开，速度越快越长越亮（审查 #9）
  function wakes(ctx) {
    ctx.boats.forEach((b, i) => {
      const sp = Math.min(1, b.v / 3.2); if (sp < 0.08) return;
      const stern = toX(b.pos) - 72 * 0.00135, e = edge(stern), z = ctx.laneZ[i], L = 0.02 + 0.04 * sp, k = (i === 0 ? 1 : 0.6) * sp * e;
      // 尾迹：两道带波纹的渐细线，向后张开，波纹随时间往后流（审查 #3-3：不能是直线）
      for (const sd of [-1, 1]) { const pts = []; for (let q = 0; q <= 10; q++) { const u = q / 10; pts.push([stern + 0.004 - L * u, 0.0004, z + sd * (0.004 + u * (0.004 + L * 0.16)) + Math.sin(u * 14 - ctx.t * 8 + i) * 0.0012 * u]); } stroke(pts, i === 0 ? C.goldHi : C.white, 0.75 * k, 0.0011, { tin: 0.02, tout: 0.85, tip: 0.1 }); }   // 亮白 / 金细线，只用透明度淡出（审查 #10-2：低亮度的水色在眼镜里像脏烟）
      // 吃水线：沿船身两侧一圈断续的白浪线，向船尾流动（审查 #2-3：船要"坐"在水里）
      const S = 0.00135, x0 = toX(b.pos) - 36 * S, flow = (ctx.t * (0.6 + 2.4 * sp)) % 1;
      for (const sd of [-1, 1]) for (let q = 0; q < 9; q++) {
        const u0 = (q + flow) / 9, u1 = u0 + 0.06, X = u => x0 + (36 - u * 72) * S, Wz = u => { const f = (36 - u * 72) / 36; return z + sd * (5.4 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(f), 3.2)), 0.55) + 0.6) * S; };
        if (u1 > 1) continue;
        stroke([[X(u0), 0.0006, Wz(u0)], [X((u0 + u1) / 2), 0.0006, Wz((u0 + u1) / 2)], [X(u1), 0.0006, Wz(u1)]], C.white, (0.25 + 0.35 * sp) * e * (i === 0 ? 1 : 0.7), 0.0007, { tin: 0.3, tout: 0.3, dry: 0 });
      }
      // 船身两侧的白浪线
      const bow = toX(b.pos);
      for (const sd of [-1, 1]) stroke(curve([[bow + 0.004, 0.0005, z + sd * 0.003], [bow - 0.012, 0.0005, z + sd * 0.0095], [bow - 0.028, 0.0005, z + sd * 0.0105]]), C.white, 0.3 * k, 0.0007, { tin: 0.05, tout: 0.6 });
    });
  }
  // 鼓面冲击环：在鼓面高度的水平面上，一圈金环快速扩开 + 往上溅几粒金火星
  // 水面金环：从你的船头在水面上扩开到 8 cm，一眼能看出"敲中了"
  // k：环的大小 / 亮度系数（稳 1.0、可 0.7、夺冠 2.0）；off：乱拍（断开的暗朱环）
  function waterRing(x, z, col, off, k = 1) { if (fx.length < 400) fx.push({ type: 'wring', x, z, col, off, k, t: 0 }); }
  function drumPulse(x, y, z, col, heavy, off = false) { if (fx.length < 400) fx.push({ type: 'pulse', x, y, z, col, heavy, off, t: 0 }); burst(x, y, z, C.goldHi, heavy ? 8 : 4, 0.05, 0.0016, 0.35, -0.2, 5); }
  // 船头浪花：速度越快越多
  const sprayAcc = [0, 0, 0, 0];
  function spray(ctx) {
    ctx.boats.forEach((b, i) => {
      const sp = b.v / 3.2; if (sp < 0.35) return; const x = toX(b.pos), e = edge(x); if (e < 0.2) return;
      sprayAcc[i] += ctx.dt * sp * (i === 0 ? 40 : 22);
      while (sprayAcc[i] >= 1) { sprayAcc[i]--; const sd = Math.random() < 0.5 ? -1 : 1; parts.push({ x: x + 0.002, y: 0.001, z: ctx.laneZ[i] + sd * 0.004, vx: -0.02 - Math.random() * 0.02, vy: 0.03 + Math.random() * 0.04 * sp, vz: sd * (0.01 + Math.random() * 0.02), life: 0.35, max: 0.35, size: 0.0014 + Math.random() * 0.001, c: Math.random() < 0.5 ? C.white : C.water, grav: -0.35, shape: 0, drag: 1 }); }
    });
  }
  function drawFx(ctx) {
    const dt = ctx.dt;
    for (let q = fx.length - 1; q >= 0; q--) {
      const f = fx[q]; f.t += dt;
      if (f.type === 'splash') {
        const u = f.t / 0.35; if (u >= 1) { fx.splice(q, 1); continue; }
        const h = 0.006 * f.k * Math.sin(Math.PI * Math.min(1, u * 1.4)), w = 0.005 * f.k * (0.5 + u);
        // 水冠：五道放射的小笔触，像溅起的一圈水
        for (let n = 0; n < 5; n++) { const th = (n / 4 - 0.5) * 2.2 + Math.PI / 2, dx = Math.cos(th), dz = Math.sin(th) * 0.4 * f.d; stroke([[f.x, 0.0003, f.z], [f.x + dx * w * 0.5, h * (0.9 - Math.abs(n - 2) * 0.12), f.z + dz * w * 0.5], [f.x + dx * w, h * 0.35, f.z + dz * w]], n % 2 ? C.white : (f.gold ? C.goldHi : C.water), 0.85 * (1 - u), 0.0006 * f.k, { tin: 0.05, tout: 0.6, dry: 0 }); }
      } else if (f.type === 'rocket' || f.type === 'chrys') { drawFirework(f, dt, q);
      } else if (f.type === 'wring') {
        const u = f.t / 0.7; if (u >= 1) { fx.splice(q, 1); continue; }
        const kk = f.k || 1, r = 0.01 + 0.05 * kk * (1 - Math.pow(1 - u, 2.2)), a = Math.pow(1 - u, 1.4) * (f.off ? 0.5 : 0.75 + 0.35 * Math.min(1, kk)), ring = [];
        for (let n = 0; n <= 48; n++) { const th = n / 48 * TAU; ring.push([f.x + Math.cos(th) * r, 0.0007, f.z + Math.sin(th) * r * 0.55]); }
        const inRiver = pts => { const out = []; let cur = []; for (const p of pts) { if (Math.abs(p[2]) < 0.1 && Math.abs(p[0]) < WX) cur.push(p); else if (cur.length) { out.push(cur); cur = []; } } if (cur.length) out.push(cur); return out.filter(c => c.length > 1); };
        if (f.off) for (let n = 0; n < 48; n += 6) stroke(ring.slice(n, n + 4), C.verm, a, 0.0012, { tin: 0.2, tout: 0.2, dry: 0 });
        else {
          // 金色双环：外环宽金带，内环晚 70 ms 跟上（审查 #5-3：要读成"金色的敲中"，不是尾迹）
          for (const seg of inRiver(ring)) { stroke(seg, [1.0, 0.82, 0.36], a * 1.15, 0.0042 * (1 - u * 0.4), { tin: 0.02, tout: 0.02, dry: 0 }); stroke(seg, C.white, a * 0.55, 0.0014, { tin: 0.02, tout: 0.02, dry: 0 }); }
          const u2 = Math.max(0, (f.t - 0.12) / 0.7);
          if (u2 > 0 && u2 < 1 && kk >= 0.9) { const r2 = 0.01 + 0.05 * kk * (1 - Math.pow(1 - u2, 2.2)), ring2 = []; for (let n = 0; n <= 48; n++) { const th = n / 48 * TAU; ring2.push([f.x + Math.cos(th) * r2, 0.0007, f.z + Math.sin(th) * r2 * 0.55]); } for (const seg of inRiver(ring2)) stroke(seg, C.gold, Math.pow(1 - u2, 1.6) * 0.9, 0.0022, { tin: 0.02, tout: 0.02, dry: 0 }); }
        }
      } else if (f.type === 'pulse') {
        const dur = f.heavy ? 0.5 : 0.35, u = f.t / dur; if (u >= 1) { fx.splice(q, 1); continue; }
        const r = 0.006 + (f.heavy ? 0.05 : 0.034) * Math.pow(u, 0.5), a = (1 - u) * (1 - u) * 1.3, ring = [];
        for (let n = 0; n <= 28; n++) { const th = n / 28 * TAU; ring.push([f.x + Math.cos(th) * r, f.y + u * 0.002, f.z + Math.sin(th) * r]); }
        // 稳拍：完整金环；乱拍：断成几截的暗朱环
        if (f.off) { for (let n = 0; n < 28; n += 4) stroke(ring.slice(n, n + 3), C.verm, a * 0.7, 0.0009, { tin: 0.2, tout: 0.2, dry: 0 }); }
        else stroke(ring, f.col, a * 1.2, 0.0016 * (1 - u * 0.5), { tin: 0, tout: 0, dry: 0 });
        if (f.heavy) { const ring2 = ring.map(p => [f.x + (p[0] - f.x) * 0.6, p[1], f.z + (p[2] - f.z) * 0.6]); stroke(ring2, C.white, a * 0.7, 0.0008, { tin: 0, tout: 0, dry: 0 }); }
      } else if (f.type === 'bloom') {
        const dur = f.big ? 0.55 : 0.42, u = f.t / dur; if (u >= 1) { fx.splice(q, 1); continue; }
        const r0 = 0.012 * f.k, r1 = r0 + (f.big ? 0.05 : 0.035) * f.k * Math.pow(u, 0.6), a = (1 - u) * (1 - u) * 1.1;
        for (let n = 0; n < 12; n++) {
          const th = f.seed + n * TAU / 12 + Math.sin(n * 7.1) * 0.15, l0 = r0 + (r1 - r0) * 0.35, l1 = r1 * (0.8 + 0.3 * Math.abs(Math.sin(n * 3.7)));
          stroke([[f.x + Math.cos(th) * l0, f.y, f.z + Math.sin(th) * l0], [f.x + Math.cos(th + 0.08) * (l0 + l1) / 2, f.y, f.z + Math.sin(th + 0.08) * (l0 + l1) / 2], [f.x + Math.cos(th + 0.12) * l1, f.y, f.z + Math.sin(th + 0.12) * l1]], f.col, a, 0.0026 * f.k, { tin: 0.05, tout: 0.8, tip: 0.1 });
        }
        const ring = []; for (let n = 0; n <= 24; n++) { const th = f.seed + n * TAU / 24; ring.push([f.x + Math.cos(th) * r1, f.y, f.z + Math.sin(th) * r1]); }
        stroke(ring, f.col, a * 0.6, 0.0012 * f.k, { tin: 0.3, tout: 0.4, tip: 0.05 });
      }
    }
    for (let q = parts.length - 1; q >= 0; q--) {
      const p = parts[q]; p.life -= dt; if (p.life <= 0) { parts.splice(q, 1); continue; }
      const fr = 1 - dt * p.drag; p.vx *= fr; p.vy = p.vy * fr + p.grav * dt; p.vz *= fr; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const a = p.life / p.max; P(p.x, p.y, p.z, p.c, p.size * (0.5 + 0.5 * a), p.shape, a, p.vx, p.vy, p.vz);
    }
  }
  // 金菊烟花：先一颗火种拖着尾巴升空，到顶炸成一朵放射笔触的菊花，花瓣带重力下垂、尾端飞白
  function firework() {
    const x = (Math.random() - 0.5) * 0.28, y = 0.085 + Math.random() * 0.05, z = -0.13 - Math.random() * 0.04;
    const col = [C.goldHi, C.gold, C.verm, C.warm, C.qing][Math.floor(Math.random() * 5)];
    fx.push({ type: 'rocket', x, y0: 0.045, y: y + 0.02, z: z - 0.03, col, t: 0 });   // 从看台后面升起：尾巴不再竖穿过河上的船
  }
  function drawFirework(f, dt, q) {
    if (f.type === 'rocket') {
      const u = f.t / 0.55; if (u >= 1) { fx.splice(q, 1); fx.push({ type: 'chrys', x: f.x, y: f.y, z: f.z, col: f.col, t: 0, n: 32 + Math.floor(Math.random() * 12), seed: Math.random() * TAU }); burst(f.x, f.y, f.z, C.white, 14, 0.04, 0.0024, 0.5, 0, 0); burst(f.x, f.y, f.z, f.col, 40, 0.07, 0.002, 1.2, -0.04, 5); return; }
      const yy = f.y0 + (f.y - f.y0) * (1 - (1 - u) * (1 - u));
      stroke([[f.x, Math.max(f.y0, yy - 0.02), f.z], [f.x + Math.sin(u * 9) * 0.0008, yy, f.z]], C.goldHi, 0.8, 0.0007, { tin: 0.6, tout: 0.05 });
      P(f.x, yy, f.z, C.white, 0.0025, 4, 1); return;
    }
    const dur = 1.7, u = f.t / dur; if (u >= 1) { fx.splice(q, 1); return; }
    const R0 = 0.05 * (1 - Math.pow(1 - Math.min(1, u * 1.6), 3)), a = Math.pow(1 - u, 1.5) * 1.1;
    for (let k = 0; k < f.n; k++) {
      const th = f.seed + k / f.n * TAU, ph = Math.cos(th * 3 + f.seed) * 0.25;
      const pts = []; for (let j = 0; j <= 4; j++) { const r = R0 * j / 4; pts.push([f.x + Math.cos(th) * r, f.y + Math.sin(th) * r * 0.9 - u * u * 0.02 * (j / 4) - ph * 0.002, f.z + Math.sin(th + ph) * r * 0.25]); }
      stroke(pts, k % 2 ? f.col : C.goldHi, a, 0.0011 * (1 - u * 0.5), { tin: 0.5, tout: 0.15, tip: 0.2 });
      const tip = pts[4]; P(tip[0], tip[1], tip[2], f.col, 0.0022, 4, a);
    }
  }
  // 进度条：一笔横卷，四条船的位置是四个彩点
  function drawProgress(ctx) {
    const y = 0.098, z = -0.17, x0 = -0.12, x1 = 0.12;
    stroke(curve([[x0, y, z], [0, y + 0.001, z], [x1, y, z]]), C.gold, 0.35, 0.0008, { tin: 0.1, tout: 0.2 });
    for (let q = 0; q <= 4; q++) { const x = x0 + (x1 - x0) * q / 4; stroke([[x, y - 0.002, z], [x, y + 0.002, z]], C.gold, 0.35, 0.0006, { tin: 0, tout: 0 }); }
    ctx.boats.forEach((b, q) => { const x = x0 + (x1 - x0) * clamp(b.pos / ctx.raceLen, 0, 1); P(x, y + (q - 1.5) * 0.0028, z, TEAM[q].hull, q ? 0.003 : 0.0048, 0, q ? 0.8 : 1); });
  }
  // 夺标旗
  function drawFlag(ctx) {
    const f = ctx.flag; if (!f) return; const t = ctx.t;
    const rise = f.stage === 'up' ? smooth(0, 0.6, f.t) * 0.06 : Math.sin(t * 2) * 0.003;
    const fx0 = f.p.x, fy = f.p.y + rise * 0.6, fz = f.p.z, k = 0.55;
    stroke([[fx0, fy - 0.05 * k, fz], [fx0, fy + 0.032 * k, fz]], C.goldHi, 0.9, 0.0012, { tin: 0, tout: 0.1 });
    const up = [], dn = []; for (let q = 0; q <= 8; q++) { const u = q / 8, w = Math.sin(t * 5 - u * 3) * 0.004 * u * k, xx = fx0 - u * 0.048 * k; up.push([xx, fy + 0.03 * k + w, fz]); dn.push([xx, fy + (0.03 - 0.026 * (1 - u * 0.65)) * k + w, fz]); }
    ribbon(up, dn, C.verm, 0.5, C.verm, 0.3); stroke(up, C.goldHi, 0.9, 0.0012, { tin: 0.02, tout: 0.3 }); stroke(dn, C.verm, 0.9, 0.0011, { tin: 0.02, tout: 0.3 });
    for (let q = 1; q < 8; q += 2) { const a = dn[q], b = dn[q + 1]; stroke([a, [(a[0] + b[0]) / 2, a[1] - 0.003, fz], b], C.goldHi, 0.7, 0.0007); }
    P(fx0, fy + 0.034 * k, fz, C.goldHi, 0.005, 4, 0.9);
  }
  function drawPalms(ctx) {
    for (const p of ctx.palms) { if (!p) continue; const ring = []; for (let q = 0; q <= 16; q++) { const th = TAU * q / 16; ring.push([p.x + Math.cos(th) * 0.012, p.y - 0.01, p.z + Math.sin(th) * 0.012]); } stroke(ring, C.gold, 0.35, 0.0008, { tin: 0.2, tout: 0.2, tip: 0.1 }); }
  }

  function upload() {
    sGeo.instanceCount = sN;
    for (const a of sAttr) { a.clearUpdateRanges(); a.addUpdateRange(0, sN * a.itemSize); a.needsUpdate = true; }
    for (const a of [fP, fC]) { a.clearUpdateRanges(); a.addUpdateRange(0, fN * a.itemSize); a.needsUpdate = true; }
    fGeo.setDrawRange(0, fN);
    for (const a of pAttr) { a.clearUpdateRanges(); a.addUpdateRange(0, pN * a.itemSize); a.needsUpdate = true; }
    pGeo.setDrawRange(0, pN);
  }

  return {
    C, TEAM, splashCount, inkBloom, drumPulse, waterRing, burst, firework,
    clearFx() { fx.length = 0; parts.length = 0; },
    splash(x, z, i) { splash(x, z, i === 0 ? 1 : 0.6); splashCount[i]++; },   // 快进（?ff）后清掉没逐帧过期的特效
    get counts() { return { strokes: sN, fillVerts: fN, points: pN }; },
    setWidth(w) { WX = w; HM = w / SCALE + 6; },
    setScale(halfH) { sMat.uniforms.uHalfH.value = halfH; pMat.uniforms.uScale.value = halfH; },
    frame(ctx) {
      sN = 0; fN = 0; pN = 0; seedK = 0; cx = ctx.cx;
      // 3D 层（world3d.js）画船、人、堤、亭、牌坊、柳、灯笼和水面；这里只画远景、水面笔触点缀、终点线和特效
      drawFar(ctx); drawFinishLine(ctx); halo(ctx); banners(ctx);   // 散落的浪头笔触撤掉（审查 #3：像贴纸），河面图案交给水面着色器
      if (ctx.state === 'title' || ctx.state === 'ready') { const x = toX(0) + 0.002; stroke(curve([[x, 0.0006, -0.088], [x, 0.0006, 0], [x, 0.0006, 0.088]]), C.verm, 0.6, 0.0013, { tin: 0.1, tout: 0.2 }); for (let q = 0; q <= 10; q++) P(x, 0.004, -0.085 + q * 0.017, C.verm, 0.0035, 4, 0.5 + 0.3 * Math.sin(ctx.t * 3 + q)); }
      drawPalms(ctx); spray(ctx); wakes(ctx); drawFx(ctx);
      upload();
    },
  };
}
