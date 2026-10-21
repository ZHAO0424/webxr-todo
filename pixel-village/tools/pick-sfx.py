"""
把挑定的候选（sfx/cand/ 里的 A/B/C）做成最终用的 sfx/<名字>.mp3，并写 sfx/CREDITS.md（来源、作者、授权）。
挑选原则：短、不尖。太尖的再压掉高频；公鸡截短、放小声。
用法：先 python tools/fetch-sfx.py 抓候选到 sfx/cand/，再 python tools/pick-sfx.py（做完可以删掉 sfx/cand/）
"""
import json, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
CAND = ROOT / 'sfx' / 'cand'
OUT = ROOT / 'sfx'
# 名字: (候选, 最长秒数, 额外滤镜, 响度 LUFS)
PICK = {
    'rooster': ('B', 1.4, 'lowpass=f=5000', -26), 'hen': ('C', 1.2, '', -22), 'dog': ('A', 0.6, '', -20), 'pig': ('A', 1.3, '', -20),
    'sheep': ('B', 1.0, '', -21), 'donkey': ('B', 1.2, 'lowpass=f=5000', -22), 'ox': ('C', 1.6, '', -19), 'duck': ('A', 0.5, '', -21),
    'goose': ('B', 0.5, '', -22), 'pigeon': ('C', 1.4, '', -22), 'magpie': ('A', 1.5, 'lowpass=f=6000', -24), 'cat': ('C', 0.9, '', -22),
    'clang': ('C', 0.6, 'lowpass=f=3500', -22), 'chop': ('B', 0.4, '', -20), 'thud': ('B', 0.6, 'lowpass=f=4000', -22), 'chirp': ('C', 1.5, 'lowpass=f=6500', -28),
    'crickets': ('C', 0, '', -28), 'fire': ('B', 0, '', -22), 'mill': ('B', 0, '', -22), 'crowd': ('B', 0, '', -24), 'projector': ('C', 0, '', -26),
}

index = json.loads((CAND / 'index.json').read_text(encoding='utf-8'))
credits = ['# 音效来源', '', '都来自 Freesound，CC0 1.0（公有领域，可商用、不需署名）。这里记一下来源，方便以后查。', '', '| 文件 | 原名 | 作者 | 链接 |', '|---|---|---|---|']
for key, (letter, maxlen, extra, lufs) in PICK.items():
    c = next(x for x in index[key] if x['file'] == f'{key}_{letter}.mp3')
    af = ([f'atrim=duration={maxlen}', f'afade=t=out:st={maxlen - 0.12}:d=0.12'] if maxlen else []) + ([extra] if extra else []) + [f'loudnorm=I={lufs}:TP=-3']
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(CAND / c['file']), '-ac', '1', '-ar', '44100', '-af', ','.join(af), '-b:a', '64k', str(OUT / f'{key}.mp3')], check=True)
    credits.append(f"| {key}.mp3 | {c['title']} | {c['user']} | {c['url']} |")
(OUT / 'CREDITS.md').write_text('\n'.join(credits) + '\n', encoding='utf-8')
print('done', len(PICK))
