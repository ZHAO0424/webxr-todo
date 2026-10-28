"""
把像素字体裁成只含项目里用到的字（界面、名册、标签……），体积从 2.5 MB 降到几十 KB。
用法：python tools/subset-font.py        （加了新文字以后重跑一次）
源字体：fonts/src/VonwaonBitmap-12px.ttf / -16px.ttf（凤凰点阵体，作者 Haoyu Qiu，CC0 1.0 公有领域，见 fonts/LICENSE-vonwaon.txt）
输出：  fonts/pixel-zh-12.woff2（正文）、fonts/pixel-zh.woff2（16px，标题）
        woff2（Brotli 压缩）比 woff 小，国内连 GitHub Pages 慢，字体少下几十 KB。要装 brotli：pip install brotli

源字体缺几个符号（· — – − ▸ ✓ ♪ 等），借字体里长得像的字形顶上，不然这几个字会掉到系统字体，混在像素字里很扎眼。
"""
import pathlib, re
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
chars = set(chr(c) for c in range(0x20, 0x7F))           # 全部 ASCII
chars |= set('·、，。：；！？（）《》「」【】“”‘’…—～×→←↑↓▶▼●○★☆♪')
for f in list(ROOT.glob('src/**/*.js')) + list(ROOT.glob('*.html')):
    chars |= set(re.findall(r'[^\x00-\x7f]', f.read_text(encoding='utf-8')))

# 缺的符号 → 借用的字
ALIAS = {'·': '・', '—': '─', '–': '-', '−': '-', '▸': '→', '▶': '→', '✓': '√', '♪': '★'}

def build(src, out):
    font = TTFont(str(src))
    for t in font['cmap'].tables:
        if not t.isUnicode():
            continue
        for a, b in ALIAS.items():
            if ord(a) not in t.cmap and ord(b) in t.cmap:
                t.cmap[ord(a)] = t.cmap[ord(b)]
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(text=''.join(sorted(chars)))
    s.subset(font)
    subset.save_font(font, str(out), opts)
    miss = sorted(c for c in chars if ord(c) not in font.getBestCmap())
    print(f'{len(chars)} 个字 → {out.name} {out.stat().st_size // 1024} KB；缺 {len(miss)} 个' + (f'：{"".join(miss)}' if miss else ''))


build(ROOT / 'fonts/src/VonwaonBitmap-12px.ttf', ROOT / 'fonts/pixel-zh-12.woff2')
build(ROOT / 'fonts/src/VonwaonBitmap-16px.ttf', ROOT / 'fonts/pixel-zh.woff2')
