import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK } from './palette.js';

/**
 * 世界单位 = 村子里的 1 米。每米 18 个贴图像素：成年人约 31 像素高，五官放得下。
 * 所有贴图都按这个密度绘制，整个沙盘里"一个像素"的物理尺寸处处相同——像素风成立的核心规则。
 */
export const TPU = 18;

/** 沙盘缩放：村里 1 米 = 现实 9 毫米（1:110）。90 米宽的村子在眼镜里约 0.8 米。 */
export const UNIT = 0.009;

/** 把坐标吸附到像素网格上，让动画也按"一格一格"走。 */
export const snap = (v) => Math.round(v * TPU) / TPU;

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 画布

/**
 * 开一块画布并交给 draw 绘制。draw 拿到的 g 提供逐像素工具；
 * wrap 版本会把坐标环绕到画布内，画出来的贴图可以无缝平铺。
 */
export function paint(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const mod = (v, n) => ((Math.floor(v) % n) + n) % n;
  const g = {
    ctx, w, h,
    px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); },
    rect(x, y, rw, rh, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(rw), Math.floor(rh)); },
    pxw(x, y, c) { ctx.fillStyle = c; ctx.fillRect(mod(x, w), mod(y, h), 1, 1); },
    rectw(x, y, rw, rh, c) {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) g.pxw(x + i, y + j, c);
    },
    clear(x, y) { ctx.clearRect(Math.floor(x), Math.floor(y), 1, 1); },
  };
  draw(g);
  return canvas;
}

/** 用字符画定义精灵：每个字符映射到 keys 里的颜色，'.' 或未定义的字符为透明。 */
export function asciiCanvas(rows, keys) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  return paint(w, h, (g) => {
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (keys[ch]) g.px(x, y, keys[ch]); }));
  });
}

/** 给精灵加 1 像素描边（画布四周各扩 1 像素）。描边让轮廓在眼镜里远看也清楚。 */
export function outline(src, color) {
  const w = src.width + 2;
  const h = src.height + 2;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 1, 1);
  const img = ctx.getImageData(0, 0, w, h);
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
  const edge = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a(x, y) > 0) continue;
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) edge.push([x, y]);
    }
  }
  ctx.fillStyle = color;
  for (const [x, y] of edge) ctx.fillRect(x, y, 1, 1);
  return out;
}

/**
 * 画布转贴图。tile=true 时贴图按 TPU 平铺：几何体的 UV 以"世界单位"计，
 * repeat = TPU / 画布宽，于是任何尺寸的方块上像素密度都一致。
 */
export function toTexture(canvas, { tile = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  // 不用 NearestFilter：配合下面的 texel AA 着色，线性采样只在像素边缘混合一个屏幕像素宽，
  // 既保留硬边，又不会在头动时闪烁。
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 8;
  if (tile) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(TPU / canvas.width, TPU / canvas.height);
  }
  return t;
}

// ---------------------------------------------------------------- 材质

/*
 * 像素风采样（XR 里能用的关键）：
 * 屏幕空间像素化在立体渲染里会闪烁、两眼格子对不上；这里改在材质里做。
 * 把 UV 往最近的贴图像素中心拉，只在像素交界处留出恰好一个屏幕像素宽的过渡。
 * 每只眼睛各自计算，不需要后处理，也就绕开了 EffectComposer 不支持 WebXR 的问题。
 */
const TEXEL_AA = /* glsl */ `
#ifdef USE_MAP
  vec2 texSize = vec2( textureSize( map, 0 ) );
  vec2 texel = vMapUv * texSize;
  vec2 seam = floor( texel + 0.5 );
  vec2 span = max( fwidth( texel ), vec2( 1e-4 ) );
  texel = seam + clamp( ( texel - seam ) / span, -0.5, 0.5 );
  vec4 sampledDiffuseColor = textureGrad( map, texel / texSize, dFdx( vMapUv ), dFdy( vMapUv ) );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

export function pixelize(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', TEXEL_AA);
  };
  material.customProgramCacheKey = () => 'texel-aa';
  return material;
}

let gradient;
/** 三档明暗的卡通光照梯度：光照分级而不是平滑过渡，和像素风一致。 */
function toonGradient() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

/** 受光材质（方块、建筑、地面）。 */
export const toon = (map, opts = {}) =>
  pixelize(new THREE.MeshToonMaterial({ map, gradientMap: toonGradient(), ...opts }));

/** 不受光材质（精灵板、远景剪影）。 */
export const flat = (map, opts = {}) => pixelize(new THREE.MeshBasicMaterial({ map, ...opts }));

// ---------------------------------------------------------------- 几何

/** BoxGeometry 的 UV 按面尺寸放大到"世界单位"，配合 tile 贴图得到统一像素密度。 */
function unitUV(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
    }
  }
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/*
 * 描边：每个方块套一个大一圈、只画背面的深色外壳（inverted hull）。
 * 只在轮廓处露出一个像素宽，和精灵的描边同色同粗——方块和精灵因此看起来是同一种画法。
 * 纯几何做法，不依赖后处理，XR 双目都正确。
 */
const EDGE = 1 / TPU;
const hullMaterial = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

function withHull(mesh, hullGeo) {
  const hull = new THREE.Mesh(hullGeo, hullMaterial);
  mesh.add(hull);
  return mesh;
}

/** 以中心为原点的方块。outline=false 不描边（水面、地面拼缝等）。 */
export function box(w, h, d, mat, { outline = true } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  unitUV(geo, w, h, d);
  const m = shadowed(new THREE.Mesh(geo, mat));
  return outline ? withHull(m, new THREE.BoxGeometry(w + 2 * EDGE, h + 2 * EDGE, d + 2 * EDGE)) : m;
}

/** 用两个对角坐标定义的方块——摆场景时最直观。 */
export function block(x0, y0, z0, x1, y1, z1, mat, opts) {
  const m = box(x1 - x0, y1 - y0, z1 - z0, mat, opts);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

/** 八棱柱，UV 按周长和高度展开。 */
export function prism(rTop, rBottom, h, mat, sides = 8) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, sides);
  const uv = geo.attributes.uv;
  const around = Math.PI * 2 * Math.max(rTop, rBottom);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * h);
  return withHull(shadowed(new THREE.Mesh(geo, mat)), new THREE.CylinderGeometry(rTop + EDGE, rBottom + EDGE, h + 2 * EDGE, sides));
}

/** 发光：叠加混合、不写深度、不参与色调映射。替代 bloom，用在灯笼光晕、萤火虫、光束上。 */
export const glow = (map, opts = {}) => pixelize(new THREE.MeshBasicMaterial({
  map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, ...opts,
}));

/**
 * 贴花 / 精灵用的平面：尺寸直接由贴图像素数 / TPU 决定，保证和场景同一像素密度。
 * anchor='bottom' 时原点在底边中点（站在地上的东西用）。
 */
export function decal(texture, mat, anchor = 'center') {
  const w = texture.image.width / TPU;
  const h = texture.image.height / TPU;
  const geo = new THREE.PlaneGeometry(w, h);
  if (anchor === 'bottom') geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.userData.size = { w, h };
  return m;
}

// ---------------------------------------------------------------- 静态合批

function sliceGeometry(geo, start, count) {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const n = attr.itemSize;
    out.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(start * n, (start + count) * n), n));
  }
  return out;
}

/**
 * 把 root 下所有静态网格按材质合并成少数几个大网格。
 * 村子有上千个方块；XR 里每个网格左右眼各画一次，不合并 draw call 会爆。
 * 带 userData.dynamic 的节点（及其子树）保留原样——会动的东西（灯笼、精灵）。
 */
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const done = [];
  const local = new THREE.Matrix4();
  const visit = (o) => {
    if (o.userData.dynamic) return;
    if (o.isMesh && !o.isSprite) {
      local.multiplyMatrices(inv, o.matrixWorld);
      const base = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(base.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) base.deleteAttribute(name);
      base.applyMatrix4(local);
      const parts = Array.isArray(o.material)
        ? o.geometry.groups.map((gr) => [o.material[gr.materialIndex], sliceGeometry(base, gr.start, gr.count)])
        : [[o.material, base]];
      for (const [mat, geo] of parts) {
        const key = `${mat.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
        if (!buckets.has(key)) buckets.set(key, { mat, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: [] });
        buckets.get(key).geos.push(geo);
      }
      done.push(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  for (const o of done) o.parent?.remove(o);
  let n = 0;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.renderOrder = b.order;
    root.add(m);
    n++;
  }
  return { meshes: done.length, batches: n };
}
