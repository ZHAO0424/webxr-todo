"""
把像素字体裁成只含本作品用到的字（做法同 pixel-village/tools/subset-font.py）。
用法（在 weather-palm 目录下）：python tools/subset-font.py      （界面文字改了以后重跑）
源字体：../pixel-village/fonts/src/VonwaonBitmap-16px.ttf（凤凰点阵体，Haoyu Qiu，CC0 1.0，见 fonts/LICENSE-vonwaon.txt）
输出：  fonts/pixel-zh.woff2
"""
import pathlib, re
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT.parent / 'pixel-village' / 'fonts' / 'src' / 'VonwaonBitmap-16px.ttf'
chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set('·、，。：；！？（）《》「」【】“”‘’…—～×→←↑↓▶▼●○★☆%')
for f in [ROOT / 'index.html']:
    chars |= set(re.findall(r'[^\x00-\x7f]', f.read_text(encoding='utf-8')))
ALIAS = {'·': '・', '—': '─', '–': '-', '▸': '→', '▶': '→'}

font = TTFont(str(SRC))
for t in font['cmap'].tables:
    if not t.isUnicode():
        continue
    for a, b in ALIAS.items():
        if ord(a) not in t.cmap and ord(b) in t.cmap:
            t.cmap[ord(a)] = t.cmap[ord(b)]
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']
sub = subset.Subsetter(opts); sub.populate(text=''.join(sorted(chars))); sub.subset(font)
out = ROOT / 'fonts' / 'pixel-zh.woff2'
font.flavor = 'woff2'; font.save(str(out))
print(out, out.stat().st_size, 'bytes,', len(chars), 'chars')
