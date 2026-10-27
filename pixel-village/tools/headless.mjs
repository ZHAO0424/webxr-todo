// 在 Node 里跑村子用的最小浏览器环境：没有屏幕、不画画面。
// 村子的模拟（谁在干什么、钱、交情、修房子）和画面（3D 模型、贴图）现在还写在一起：建村时会顺手画贴图、搭模型。
// 这里把要用到的浏览器东西换成空壳——画布什么都不画，读回来是全透明；模型照样搭（导航的墙、房子要用到形状），只是不画到屏幕上。

const ctx2d = (canvas) => new Proxy({
  canvas,
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
  createImageData: (w, h) => (typeof w === 'object' ? { data: new Uint8ClampedArray(w.width * w.height * 4), width: w.width, height: w.height } : { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  measureText: (s) => ({ width: String(s).length * 8 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  createPattern: () => ({}),
}, {
  get: (t, k) => (k in t ? t[k] : () => {}), // 别的画图方法：什么都不做
  set: (t, k, v) => { t[k] = v; return true; },
});

class FakeCanvas {
  constructor(w = 1, h = 1) { this.width = w; this.height = h; this.style = {}; }
  getContext() { return (this._ctx ??= ctx2d(this)); }
  toDataURL() { return 'data:,'; }
  addEventListener() {}
}

const store = new Map();
globalThis.window ??= globalThis;
globalThis.self ??= globalThis;
globalThis.document ??= {
  createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : { style: {}, append() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } }),
  createElementNS: () => new FakeCanvas(),
  documentElement: { dataset: {}, style: {} },
  body: { append() {}, classList: { add() {}, remove() {} } },
  addEventListener() {},
  querySelector: () => null,
  getElementById: () => null,
};
globalThis.OffscreenCanvas ??= FakeCanvas;
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.requestAnimationFrame ??= () => 0;
globalThis.requestIdleCallback ??= (fn) => setTimeout(fn, 0);
globalThis.innerWidth ??= 1280;
globalThis.innerHeight ??= 800;
globalThis.devicePixelRatio ??= 1;
globalThis.addEventListener ??= () => {};
globalThis.location ??= { search: '', href: 'http://localhost/' };
