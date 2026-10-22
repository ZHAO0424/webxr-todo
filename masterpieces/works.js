// 画廊里所有作品的唯一清单：主页的环形画廊和每件作品里的"上一幅 / 下一幅"都读这里
// music：配乐（data/music/<slug>.mp3）。vol：音量（默认很小声垫着；作品自己没有底子的放大一些）。key / minor 是曲子的调（按音级统计测的；关系大小调取和作品原有和弦一致的那个），
//   作品自己合成的和弦垫底按它移调，交互音效用它的五声音阶（xr-hop.js 的 hop.sfx / hop.ratio）
// xr.eye：头显里人头放在场景的哪一点（米，面朝 -Z）。runtime 给的地板高度不可靠，xr-hop.js 进场景时按这个重新定位
// 中 / 英：zh / blurb / tags 是中文，en / blurbEn / tagsEn 是英文；显示时用下面的 workText(w) 按当前语言取
window.WORKS = [
  { slug: 'to-reach-a-star', music: { key: 'D', title: 'Starry Night', by: 'Ovani Sound · Keys Music Pack', lic: 'Royalty-Free' }, xr: { eye: [0, 1.5, 0] }, zh: '去往星星', en: 'To Reach a Star', after: 'van Gogh', year: '1889',
    blurb: '一万五千道流动的笔触组成翻卷的天空。挥手搅动风暴，指向一颗星，一束金色笔触沿柏树升起去往那里。', tags: ['流场笔触', '手'],
    blurbEn: 'Fifteen thousand flowing brushstrokes make up a churning sky. Sweep your hand to stir the storm; point at a star, and a ribbon of gold climbs the cypress to reach it.', tagsEn: ['Flow-field strokes', 'Hands'] },
  { slug: 'seeing-takes-time', music: { key: 'C', minor: true, title: 'Peaceful Meadow', by: 'Monument Studios · Fantasy Music Vol 2', lic: 'CC BY 4.0' }, xr: { eye: [0, 1.5, 0] }, zh: '看见需要时间', en: 'Seeing Takes Time', after: 'Seurat', year: '1884–86',
    blurb: '十五万颗纯色点漂成一团色雾，只有你的目光停留之处，它们才聚成点彩画。', tags: ['视觉混合', '视线'],
    blurbEn: '150,000 dots of pure color drift as a haze. Only where your gaze lingers do they settle into a pointillist painting.', tagsEn: ['Optical mixing', 'Gaze'] },
  { slug: 'scream-through-nature', music: { key: 'A', title: 'Plains', by: 'Ovani Sound · Keys Music Pack', lic: 'Royalty-Free' }, xr: { eye: [0, 1.5, 1.5] }, zh: '穿过自然的尖叫', en: 'A Scream Through Nature', after: 'Munch', year: '1892–96',
    blurb: '几十万条笔触鱼群沿河道绕着你游。只有发出声音，它们才游回来，在你眼前聚成蒙克五幅画中的一幅。', tags: ['GPU 鱼群', '声音'],
    blurbEn: 'Hundreds of thousands of brushstrokes school like fish along a river that circles you. Only when you make a sound do they swim back, gathering into one of five paintings by Munch.', tagsEn: ['GPU schooling', 'Sound'] },
  { slug: 'lashed-to-the-mast', music: { vol: 0.4, key: 'D', minor: true, title: 'Cinematic', by: 'Monument Studios · Hollywood Horror Vol 1', lic: 'CC BY 4.0' }, xr: { eye: [0, 1.5, 0] }, zh: '被绑在桅杆上', en: 'Lashed to the Mast', after: 'Turner', year: '1842',
    blurb: '整幅《暴风雪》是一片真正在流动的流体，包住你前方的半个球。伸手搅动，画被卷成漩涡；停手，它慢慢记起自己。', tags: ['Stable Fluids', '手'],
    blurbEn: 'All of Snow Storm becomes a living fluid, wrapped around the half-sphere before you. Reach in and the painting spins into a vortex; stop, and it slowly remembers itself.', tagsEn: ['Stable Fluids', 'Hands'] },
  { slug: 'water-lilies', music: { vol: 0.45, key: 'B', title: 'Soft Harp', by: 'Monument Studios · Fantasy Music Vol 2', lic: 'CC BY 4.0' }, xr: { eye: [0, 1.6, 0] }, zh: '睡莲', en: 'Water Lilies', after: 'Monet', year: 'after 1916',
    blurb: '你站在池塘中央，整幅睡莲铺满一圈水面。点水起涟漪；阵风一块一块掠过水面，风到之处倒影碎开。', tags: ['波动方程', '阵风', '手 / 射线'],
    blurbEn: 'You stand in the middle of the pond, the Water Lilies spread on the water all around. Touch it to send out ripples; gusts sweep across patch by patch, breaking the reflections as they pass.', tagsEn: ['Wave equation', 'Gusts', 'Hand / ray'] },
  { slug: 'this-kiss', music: { key: 'C', minor: true, title: 'Emotive Piano', by: 'Monument Studios · Fantasy Music Vol 2', lic: 'CC BY 4.0' }, xr: { eye: [0, 1.6, 9.8] /* 实际观看点由作品按地形算（hop.eye） */ }, zh: '这一吻', en: 'This Kiss', after: 'Klimt', year: '1907–08',
    blurb: '画里的花地在恋人脚边戛然而止。这里把它补成一座浮在金色虚空里的花甸岛；两万多个小立方体在你双手合拢时滑到画中相拥的姿势。', tags: ['3D 花甸岛', '立方体', '双手距离'],
    blurbEn: 'In the painting, the flower meadow stops short at the lovers’ feet. Here it becomes an island adrift in a golden void; bring your hands together and twenty thousand tiny cubes slide into the embrace.', tagsEn: ['3D meadow island', 'Cubes', 'Hand distance'] },
  { slug: 'isle-of-the-dead', music: { vol: 0.4, key: 'A', minor: true, title: 'Choir Ambience', by: 'Monument Studios · Fantasy Music Vol 1', lic: 'CC BY 4.0' }, xr: { eye: [0, 1.5, 1.8] }, zh: '目光停留之处', en: 'Where the Gaze Rests', after: 'Böcklin', year: '1880',
    blurb: '画铺成环绕你一整圈的弧幕。你注视哪里，哪里就被点燃，火线自己向四周蔓延，烧出后面那层腐蚀一百年后的画。', tags: ['火烧溶解', '视线'],
    blurbEn: 'The painting curves all the way around you. Wherever you look catches fire, and the flame line spreads on its own, burning through to the layer beneath: the painting as a century of decay has left it.', tagsEn: ['Burn dissolve', 'Gaze'] },
  { slug: 'above-the-fog', music: { key: 'A', minor: true, title: 'Mountains', by: 'Monument Studios · Fantasy Music Vol 2', lic: 'CC BY 4.0' }, xr: { eye: [0, 1.6, 1.2] }, zh: '雾海之上', en: 'Above the Sea of Fog', after: 'Friedrich', year: 'c. 1818',
    blurb: '你站在旅人身后，雾漫过头顶。看住一处，雾就一层层退下去，露出一堆堆砂岩；站得越静，太阳升得越快。', tags: ['体积雾', '视线 · 静止', '手'],
    blurbEn: 'You stand behind the wanderer as fog rolls over your head. Hold your gaze on one spot and the fog falls away layer by layer, baring the sandstone crags; the stiller you stand, the faster the sun rises.', tagsEn: ['Volumetric fog', 'Gaze · stillness', 'Hands'] },
  { slug: 'wheatfield-paths', music: { vol: 0.4, key: 'B', minor: true, title: 'Lone Rider', by: 'Monument Studios · Fantasy Music Vol 2', lic: 'CC BY 4.0' }, xr: { eye: [0, 1.5, 0] }, zh: '通向不知何处的路', en: 'Paths to Nowhere', after: 'van Gogh', year: '1890',
    blurb: '一百万个黏菌"行者"在《麦田群鸦》上长出发光的路网，但只在你目光所及的一圈里显形，像提灯照进夜里的麦田。', tags: ['Physarum 黏菌', '视线'],
    blurbEn: 'A million slime-mold “walkers” grow a glowing web of paths across Wheatfield with Crows, showing only within the circle of your gaze, like a lantern carried into a field at night.', tagsEn: ['Physarum slime mold', 'Gaze'] },
];
// 按当前语言取一件作品的文字：title 大标题，sub 标题下面那行斜体（中文时是英文名，英文时是中文原名），blurb 介绍，tags 标签
// lang 可省，省了就用 MP_I18N 当前的语言；没加载 i18n.js 时一律中文
window.workText = (w, lang) => {
  const I = window.MP_I18N;
  const en = (lang || (I && I.lang)) === 'en';
  return en ? { title: w.en, sub: w.zh, blurb: w.blurbEn || w.blurb, tags: w.tagsEn || w.tags }
            : { title: w.zh, sub: w.en, blurb: w.blurb, tags: w.tags };
};
