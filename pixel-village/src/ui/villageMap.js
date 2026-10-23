/*
 * 档案里的小地图：把导航网格（0.25 米一格）直接画成一张像素俯视图。
 *   地面按类型上色（草、庄稼地、路、场院、溪、石、林子），房子 / 墙 / 树干这些挡路的格子画成深色屋顶色；
 *   按高差加明暗：比北边一格高就亮一点、低就暗一点，梯田的坎、院墙就有了立体感。
 * 只在打开档案时画一次（季节换了重画）。
 */

const COLORS = {
  grass: [92, 124, 60], field: [150, 118, 64], path: [184, 154, 106], pad: [200, 170, 120],
  stream: [64, 112, 168], rock: [124, 114, 104], forest: [62, 92, 48],
};
const WINTER = { grass: [208, 214, 220], field: [196, 200, 206], forest: [150, 166, 160], path: [176, 160, 136], pad: [190, 176, 150], rock: [150, 146, 146], stream: [150, 186, 214] };
const ROOF = [52, 46, 70];

/** bounds：只画这一块（导航网格连西沟一起覆盖，档案里只画村子）。 */
export function drawMap(nav, terrain, bounds, { winter = false } = {}) {
  const i0 = Math.max(0, Math.round((bounds.x0 - nav.x0) / 0.25)), i1 = Math.min(nav.nx, Math.round((bounds.x1 - nav.x0) / 0.25));
  const j0 = Math.max(0, Math.round((bounds.z0 - nav.z0) / 0.25)), j1 = Math.min(nav.nz, Math.round((bounds.z1 - nav.z0) / 0.25));
  const c = document.createElement('canvas');
  c.width = i1 - i0;
  c.height = j1 - j0;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const pal = winter ? { ...COLORS, ...WINTER } : COLORS;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const k = j * nav.nx + i;
    let col;
    if (nav.water[k]) col = pal.stream;
    else if (nav.blocked[k]) col = ROOF;
    else col = pal[terrain.typeAt(nav.cx(i), nav.cz(j))] ?? pal.grass;
    const up = j > 0 ? nav.h[k - nav.nx] : nav.h[k];
    const d = nav.h[k] - up; // 比北边那格高：朝南的坎面亮；低：坎下的阴影
    const shade = d < -0.2 ? 0.62 : d > 0.2 ? 1.18 : 1 + nav.h[k] * 0.012; // 越高越亮一点点
    const o = ((j - j0) * c.width + (i - i0)) * 4;
    img.data[o] = Math.min(255, col[0] * shade);
    img.data[o + 1] = Math.min(255, col[1] * shade);
    img.data[o + 2] = Math.min(255, col[2] * shade);
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
