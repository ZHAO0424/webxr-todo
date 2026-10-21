"""
从 Freesound 找声音素材（只要 CC0 公有领域的），每种取下载最多的几个当候选，剪好放进 sfx/cand/，供 sounds.html 试听挑选。
用法：python tools/fetch-sfx.py            （全部）
      python tools/fetch-sfx.py dog pig    （只重抓这几种）
处理：下载 Freesound 的高质量预览 mp3 → ffmpeg 去掉开头静音、截到合适长度、单声道、统一响度 → 64 kbps mp3。
清单写在 sfx/cand/index.json（来源、作者、链接、授权），挑定之后由 tools/pick-sfx.py 拷到 sfx/。
"""
import json, re, subprocess, sys, urllib.parse, urllib.request, html, pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'sfx' / 'cand'
OUT.mkdir(parents=True, exist_ok=True)
FFMPEG = shutil.which('ffmpeg') or 'ffmpeg'
UA = {'User-Agent': 'Mozilla/5.0'}

# 键: (搜索词, 最长秒数（搜索时过滤）, 剪成多长, 是否循环底子)
WANT = {
    'rooster': ('rooster crow', 8, 4.0, False),
    'hen': ('chicken hen cluck', 8, 2.5, False),
    'dog': ('dog bark', 5, 1.5, False),
    'pig': ('pig grunt', 6, 2.0, False),
    'sheep': ('sheep baa', 5, 2.0, False),
    'donkey': ('donkey bray', 10, 4.0, False),
    'ox': ('cow moo', 6, 3.0, False),
    'duck': ('duck quack', 5, 1.5, False),
    'goose': ('goose honk', 6, 2.0, False),
    'pigeon': ('pigeon coo', 8, 3.0, False),
    'magpie': (['magpie', 'magpie chatter', 'pica pica'], 30, 2.5, False),
    'cat': ('cat meow', 4, 1.5, False),
    'clang': ('anvil hammer hit', 3, 1.2, False),
    'chop': ('axe chop wood', 3, 1.0, False),
    'thud': ('shovel dig dirt', 3, 0.8, False),
    'chirp': ('sparrow chirp', 6, 2.5, False),
    'crickets': (['crickets night', 'crickets', 'cricket chirping field'], 180, 20.0, True),
    'fire': ('campfire crackling', 120, 20.0, True),
    'mill': (['millstone', 'quern', 'hand mill grinding', 'grinding grain', 'stone mill', 'mortar grinding'], 120, 12.0, True),
    'crowd': (['crowd murmur outdoor', 'crowd talking', 'people talking ambience', 'market crowd'], 180, 20.0, True),
    'projector': ('film projector', 60, 12.0, True),
}
N = 3
# 标题里有这些字的不要（城市、车、音乐）
EXCLUDE = re.compile(r'traffic|car|city|music|song|siren|engine|tv', re.I)
# 标题里得有这些字才算（搜索结果常混进不相干的：搜鸭子出来脚步声、搜喜鹊出来乌鸦）
MUST = {
    'rooster': 'rooster|cock', 'hen': 'chicken|hen|cluck', 'dog': 'dog|bark', 'pig': 'pig|grunt|snort|oink', 'sheep': 'sheep|lamb|baa',
    'donkey': 'donkey|bray', 'ox': 'cow|moo|cattle', 'duck': 'duck|quack', 'goose': 'goose|geese', 'pigeon': 'pigeon|dove|coo',
    'magpie': 'magpie', 'cat': 'cat|meow', 'clang': 'anvil|hammer|smith', 'chop': 'axe|chop', 'thud': 'dig|shovel|hoe|dirt',
    'chirp': 'sparrow|chirp|bird', 'crickets': 'cricket', 'fire': 'fire|crackl', 'mill': 'grind|mill|quern', 'crowd': 'crowd|murmur|people|chatter', 'projector': 'projector',
}


def get(url, tries=4):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
        except Exception as e:  # Freesound 偶尔超时，重试
            if i == tries - 1:
                raise
            print(f'  重试 {url[:60]}… ({e})')


def search(q, maxdur):
    f = f'license:"Creative Commons 0" duration:[0.3 TO {maxdur}]'
    url = 'https://freesound.org/search/?' + urllib.parse.urlencode({'q': q, 'f': f})  # 按相关度排，再在相关的里面挑下载多的
    s = get(url).decode('utf-8')
    out = []
    for m in re.finditer(r'<div\s+class="bw-player"(.*?)tabindex', s, re.S):
        a = dict(re.findall(r'data-([\w-]+)="([^"]*)"', m.group(1)))
        if 'mp3' not in a:
            continue
        out.append({
            'id': int(a['sound-id']), 'user': a.get('username'), 'title': html.unescape(a.get('title', '')),
            'duration': float(a.get('duration', 0)), 'downloads': int(a.get('num-downloads', 0) or 0),
            'mp3': a['mp3'].replace('-lq.mp3', '-hq.mp3'),
            'url': f"https://freesound.org/people/{a.get('username')}/sounds/{a['sound-id']}/", 'license': 'CC0 1.0',
        })
    return out


def process(src, dst, length, loop):
    # 一次性的声音：去掉开头静音 → 截长 → 尾部 80 ms 淡出；底子：从 1 秒处截一段，首尾淡入淡出（循环接缝不突兀）
    if loop:
        af = f'atrim=start=1:duration={length},afade=t=in:d=0.5,afade=t=out:st={length - 0.6}:d=0.6,loudnorm=I=-20:TP=-2'
    else:
        af = f'silenceremove=start_periods=1:start_threshold=-45dB,atrim=duration={length},afade=t=out:st={max(0, length - 0.08)}:d=0.08,loudnorm=I=-16:TP=-1.5'
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', str(src), '-ac', '1', '-ar', '44100', '-af', af, '-b:a', '64k', str(dst)], check=True)


def main():
    keys = sys.argv[1:] or list(WANT)
    idx_path = OUT / 'index.json'
    index = json.loads(idx_path.read_text(encoding='utf-8')) if idx_path.exists() else {}
    tmp = OUT / '_raw.mp3'
    for k in keys:
        q, maxdur, length, loop = WANT[k]
        must = re.compile(MUST.get(k, '.'), re.I)
        seen, pool = set(), []
        for qq in ([q] if isinstance(q, str) else q):  # 几个搜索词合在一起挑
            for c in search(qq, maxdur):
                if c['id'] not in seen and must.search(c['title']) and not EXCLUDE.search(c['title']):
                    seen.add(c['id']); pool.append(c)
        found = sorted(pool, key=lambda c: -c['downloads'])[:N]
        index[k] = []
        for i, c in enumerate(found):
            name = f'{k}_{"ABC"[i]}.mp3'
            tmp.write_bytes(get(c['mp3']))
            process(tmp, OUT / name, min(length, c['duration']) if not loop else min(length, max(4, c['duration'] - 1.5)), loop)
            index[k].append({**c, 'file': name, 'loop': loop})
            print(f'{k} {"ABC"[i]}: {c["title"]} ({c["duration"]:.1f}s, {c["downloads"]} 次下载) {c["url"]}')
        if not found:
            print(f'{k}: 没搜到')
        idx_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')  # 每抓完一种存一次
    tmp.unlink(missing_ok=True)
    idx_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
