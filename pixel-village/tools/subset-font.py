"""
把像素字体裁成只含项目里用到的字（界面、名册、标签……），体积从 1 MB 降到几十 KB。
用法：python tools/subset-font.py        （加了新文字以后重跑一次）
源字体：fonts/src/fusion-pixel-12px-proportional-zh_hans.otf.woff（Fusion Pixel Font 12px，OFL-1.1，见 fonts/OFL.txt）
输出：  fonts/pixel-zh.woff
"""
import pathlib, re
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
chars = set(chr(c) for c in range(0x20, 0x7F))           # 全部 ASCII
chars |= set('·、，。：；！？（）《》「」【】“”‘’…—～×→←↑↓▶▼●○★☆♪')
for f in list(ROOT.glob('src/**/*.js')) + list(ROOT.glob('*.html')):
    chars |= set(re.findall(r'[^\x00-\x7f]', f.read_text(encoding='utf-8')))

src = ROOT / 'fonts/src/fusion-pixel-12px-proportional-zh_hans.otf.woff'
out = ROOT / 'fonts/pixel-zh.woff'
opts = subset.Options()
opts.flavor = 'woff'
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.notdef_outline = True
font = subset.load_font(str(src), opts)
s = subset.Subsetter(opts)
s.populate(text=''.join(sorted(chars)))
s.subset(font)
subset.save_font(font, str(out), opts)
print(f'{len(chars)} 个字 → {out.name} {out.stat().st_size // 1024} KB')
