// 进 XR 后网页不再黑屏：每帧眼镜画完，把左眼那张图复制到网页画布上（旁观者 / 投屏用）
//
// 为什么会黑：进了 XR，three.js / 自己写的 WebGL 只往头显的帧缓冲画，网页上的画布停在最后一帧（或全黑），
// 看上去像卡死了，其实页面一直在跑。
// 做法：在 XR 帧回调里排在作品后面（会话开始后才登记 → 每帧都在作品的回调之后跑），
//   1. blitFramebuffer 把左眼那块拷进一张同尺寸的普通纹理（源是多重采样时，blit 要求源和目标矩形一模一样，所以纹理和整块帧缓冲一样大）
//   2. 用一个最小的着色器把这张纹理铺到网页画布上（按画布比例裁切，不拉伸）
// 不再画一遍场景：只多两次全屏拷贝，眼镜里的帧率基本不受影响。
// 出错（某些运行时不让读头显的帧缓冲）就关掉镜像、打印一次，不影响眼镜里的画面。
//
// 用法：
//   three.js：mirrorThree(renderer)            —— 建好渲染器后调一次即可，换会话、重进都自动跟上
//   裸 WebGL2：mirrorSession(gl, session, () => ({ fb, rect: [x, y, w, h] }))   —— 每次进会话调一次
// 关掉：网址加 ?nomirror

const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nomirror');

const VS = `#version 300 es
in vec2 p; out vec2 uv;
uniform vec4 uRect;   // 左眼在纹理里的 uv 范围：xy 起点、zw 大小（已按画布比例裁切）
void main() { uv = uRect.xy + (p * 0.5 + 0.5) * uRect.zw; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision mediump float;
in vec2 uv; out vec4 o; uniform sampler2D t;
void main() { o = vec4(texture(t, uv).rgb, 1.0); }`;

const kits = new WeakMap();   // 每个 gl 一套：程序、顶点、拷贝用的纹理和帧缓冲

function kit(gl) {
  let k = kits.get(gl);
  if (k) return k;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('xr-mirror: ' + gl.getProgramInfoLog(prog));
  const vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // 一个盖满屏的大三角形
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  k = { prog, vao, uRect: gl.getUniformLocation(prog, 'uRect'), uT: gl.getUniformLocation(prog, 't'), tex: gl.createTexture(), fbo: gl.createFramebuffer(), w: 0, h: 0, dead: false };
  kits.set(gl, k);
  return k;
}

// 拷一帧。src = { fb, rect: [x, y, w, h] }（fb 为头显帧缓冲，rect 是左眼在里面的像素范围）
function copyFrame(gl, src) {
  const k = kit(gl);
  if (k.dead || !src || !src.rect) return;
  const [x, y, w, h] = src.rect, W = x + w, H = y + h;
  // 存下会被改动的状态，拷完原样放回（作品可能有自己的状态缓存）
  const S = {
    read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
    prog: gl.getParameter(gl.CURRENT_PROGRAM), vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    unit: gl.getParameter(gl.ACTIVE_TEXTURE), vp: gl.getParameter(gl.VIEWPORT),
    blend: gl.isEnabled(gl.BLEND), depth: gl.isEnabled(gl.DEPTH_TEST), cull: gl.isEnabled(gl.CULL_FACE),
    scissor: gl.isEnabled(gl.SCISSOR_TEST), stencil: gl.isEnabled(gl.STENCIL_TEST), mask: gl.getParameter(gl.COLOR_WRITEMASK),
  };
  gl.activeTexture(gl.TEXTURE0);
  const tex0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
  try {
    gl.bindTexture(gl.TEXTURE_2D, k.tex);
    if (k.w !== W || k.h !== H) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, k.fbo);
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, k.tex, 0);
      k.w = W; k.h = H;
    }
    gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true);
    // 1) 头显帧缓冲的左眼 → 纹理（同坐标，多重采样时顺便解析）
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, k.fbo);
    gl.blitFramebuffer(x, y, W, H, x, y, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    const err = gl.getError();
    if (err) { k.dead = true; console.warn('xr-mirror: 读不到头显帧缓冲，网页不再同步眼镜画面（GL 错误 ' + err + '）'); return; }
    // 2) 纹理 → 网页画布：按画布显示比例从左眼图里裁一块（cover），不拉伸
    const cv = gl.canvas, cw = cv.width, ch = cv.height;
    const aspC = (cv.clientWidth || cw) / (cv.clientHeight || ch), aspE = w / h;
    let su = 1, sv = 1;
    if (aspC > aspE) sv = aspE / aspC; else su = aspC / aspE;
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.STENCIL_TEST);
    gl.useProgram(k.prog); gl.bindVertexArray(k.vao);
    gl.uniform1i(k.uT, 0);
    gl.uniform4f(k.uRect, (x + w * (1 - su) / 2) / W, (y + h * (1 - sv) / 2) / H, w * su / W, h * sv / H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, tex0); gl.activeTexture(S.unit);
    gl.bindVertexArray(S.vao); gl.useProgram(S.prog);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, S.read); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, S.draw);
    gl.viewport(S.vp[0], S.vp[1], S.vp[2], S.vp[3]);
    gl[S.blend ? 'enable' : 'disable'](gl.BLEND); gl[S.depth ? 'enable' : 'disable'](gl.DEPTH_TEST);
    gl[S.cull ? 'enable' : 'disable'](gl.CULL_FACE); gl[S.scissor ? 'enable' : 'disable'](gl.SCISSOR_TEST);
    gl[S.stencil ? 'enable' : 'disable'](gl.STENCIL_TEST); gl.colorMask(S.mask[0], S.mask[1], S.mask[2], S.mask[3]);
  }
}

// 裸 WebGL2：会话开始后调一次。source(frame) 返回 { fb, rect } 或 null（这帧不拷）
export function mirrorSession(gl, session, source) {
  if (OFF || !session || !(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) return;
  if (session.__xrMirror) return;
  session.__xrMirror = true;
  let ended = false;
  session.addEventListener('end', () => { ended = true; });
  const tick = (t, frame) => {
    if (ended) return;
    try { copyFrame(gl, source(frame)); } catch (e) { console.warn('xr-mirror', e); }
    session.requestAnimationFrame(tick);   // 先跑作品再登记自己：下一帧仍排在作品后面
  };
  session.requestAnimationFrame(tick);
}

// three.js：建好渲染器后调一次。头显的帧缓冲从 three 自己的 XR 渲染目标里取（两种输出方式——XRWebGLLayer
// 和 Layers API——three 都包成了 isXRRenderTarget 的渲染目标），左眼范围取 XR 相机的第一个子相机
export function mirrorThree(renderer) {
  if (OFF || renderer.__xrMirror) return;
  renderer.__xrMirror = true;
  let xrRT = null;
  const srt = renderer.setRenderTarget.bind(renderer);
  renderer.setRenderTarget = function (rt, ...a) { if (rt && rt.isXRRenderTarget) xrRT = rt; return srt(rt, ...a); };
  const gl = renderer.getContext();
  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    mirrorSession(gl, session, () => {
      if (!xrRT || !renderer.xr.isPresenting) return null;
      const fb = renderer.properties.get(xrRT).__webglFramebuffer;
      const cam = renderer.xr.getCamera().cameras[0];
      if (!fb || !cam || !cam.viewport) return null;
      const v = cam.viewport;
      return { fb, rect: [v.x, v.y, v.z, v.w] };
    });
  });
  renderer.xr.addEventListener('sessionend', () => { xrRT = null; });
}
