// 画廊里所有作品的唯一清单：主页的环形画廊和每件作品里的"上一幅 / 下一幅"都读这里
// xr.eye：头显里人头放在场景的哪一点（米，面朝 -Z）。runtime 给的地板高度不可靠，xr-hop.js 进场景时按这个重新定位
window.WORKS = [
  { slug: 'to-reach-a-star', xr: { eye: [0, 1.5, 2.8] }, zh: '去往星星', en: 'To Reach a Star', after: 'van Gogh', year: '1889',
    blurb: '一万五千道流动的笔触组成翻卷的天空。挥手搅动风暴，指向一颗星，一束金色笔触沿柏树升起去往那里。', tags: ['流场笔触', '手'] },
  { slug: 'seeing-takes-time', xr: { eye: [0, 1.5, 2.2] }, zh: '看见需要时间', en: 'Seeing Takes Time', after: 'Seurat', year: '1884–86',
    blurb: '十五万颗纯色点漂成一团色雾，只有你的目光停留之处，它们才聚成点彩画。', tags: ['视觉混合', '视线'] },
  { slug: 'scream-through-nature', xr: { eye: [0, 1.5, 1.5] }, zh: '穿过自然的尖叫', en: 'A Scream Through Nature', after: 'Munch', year: '1892–96',
    blurb: '几十万条笔触鱼群沿河道绕着你游。只有发出声音，它们才游回来，在你眼前聚成蒙克五幅画中的一幅。', tags: ['GPU 鱼群', '声音'] },
  { slug: 'lashed-to-the-mast', xr: { eye: [0, 1.5, 1.6] }, zh: '被绑在桅杆上', en: 'Lashed to the Mast', after: 'Turner', year: '1842',
    blurb: '整幅《暴风雪》是一片真正在流动的流体，包住你前方的半个球。伸手搅动，画被卷成漩涡；停手，它慢慢记起自己。', tags: ['Stable Fluids', '手'] },
  { slug: 'water-lilies', xr: { eye: [0, 1.6, 0] }, zh: '睡莲', en: 'Water Lilies', after: 'Monet', year: 'after 1916',
    blurb: '你站在池塘中央，整幅睡莲铺满一圈水面。点水起涟漪；阵风一块一块掠过水面，风到之处倒影碎开。', tags: ['波动方程', '阵风', '手 / 射线'] },
  { slug: 'this-kiss', xr: { eye: [0, 1.35, 1.4] }, zh: '这一吻', en: 'This Kiss', after: 'Klimt', year: '1907–08',
    blurb: '画里的花地在恋人脚边戛然而止。这里把它补成一座浮在金色虚空里的花甸岛；两万多个小立方体在你双手合拢时滑到画中相拥的姿势。', tags: ['3D 花甸岛', '立方体', '双手距离'] },
  { slug: 'isle-of-the-dead', xr: { eye: [0, 1.5, 1.8] }, zh: '目光停留之处', en: 'Where the Gaze Rests', after: 'Böcklin', year: '1880',
    blurb: '画铺成环绕你一整圈的弧幕。你注视哪里，哪里就被点燃，火线自己向四周蔓延，烧出后面那层腐蚀一百年后的画。', tags: ['火烧溶解', '视线'] },
  { slug: 'above-the-fog', xr: { eye: [0, 1.6, 1.2] }, zh: '雾海之上', en: 'Above the Sea of Fog', after: 'Friedrich', year: 'c. 1818',
    blurb: '你站在旅人身后，雾漫过头顶。看住一处，雾就一层层退下去，露出一堆堆砂岩；站得越静，太阳升得越快。', tags: ['体积雾', '视线 · 静止', '手'] },
  { slug: 'wheatfield-paths', xr: { eye: [0, 1.5, 2.4] }, zh: '通向不知何处的路', en: 'Paths to Nowhere', after: 'van Gogh', year: '1890',
    blurb: '一百万个黏菌"行者"在《麦田群鸦》上长出发光的路网，但只在你目光所及的一圈里显形，像提灯照进夜里的麦田。', tags: ['Physarum 黏菌', '视线'] },
];
