"""离线烘焙：名画 → 深度（Depth Anything V2 Large）+ 分层深度图 LDI（LaMa 补全被遮挡区域）。

用法（在 bake/ 目录下）：
    .venv/Scripts/python bake.py            # 烘焙全部
    .venv/Scripts/python bake.py wanderer   # 只烘焙某一幅

产出 ../data/<slug>/：
    color.jpg     原图（本地化，页面不再依赖 Wikimedia）
    thumb.jpg     XR 选画面板用的缩略图
    depth.png     平滑后的整图深度（浮雕/分层/点云模式用），亮 = 近
    l{i}.webp     第 i 层颜色 + alpha（0 = 最远层，是完整的背景板）
    l{i}d.png     第 i 层深度（向被遮挡区延展过）
    meta.json
"""
import json, sys, urllib.request
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

HERE = Path(__file__).parent
MODELS = HERE / "models"
DATA = HERE.parent / "data"
UA = "masterpieces-bake/0.1 (personal research script; python-urllib)"

K = 4               # 层数
EXTEND = 0.06       # 中间层向前景背后延展的半径（占图宽比例）
WM = "https://upload.wikimedia.org/wikipedia/commons/thumb/"

PAINTINGS = [
    # slug, 中文名, 作者年代, 文件路径, 预设纵深(m), 预设模式
    ("starry-night", "星月夜", "Vincent van Gogh, 1889", "e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg", 0.22, "ldi"),
    ("great-wave", "神奈川冲浪里", "葛饰北斋, c.1831", "a/a5/Tsunami_by_hokusai_19th_century.jpg", 0.16, "layers"),
    ("wanderer", "雾海上的旅人", "Caspar David Friedrich, 1818", "b/b9/Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg", 0.35, "ldi"),
    ("pearl-earring", "戴珍珠耳环的少女", "Johannes Vermeer, c.1665", "0/0f/1665_Girl_with_a_Pearl_Earring.jpg", 0.15, "relief"),
    ("grande-jatte", "大碗岛的星期天下午", "Georges Seurat, 1884", "7/7d/A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg", 0.30, "ldi"),
    ("impression-sunrise", "印象·日出", "Claude Monet, 1872", "5/59/Monet_-_Impression,_Sunrise.jpg", 0.20, "points"),
    ("mona-lisa", "蒙娜丽莎", "Leonardo da Vinci, c.1503", "e/ec/Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg", 0.22, "ldi"),
    ("scream", "呐喊", "Edvard Munch, 1893", "f/f4/The_Scream.jpg", 0.18, "layers"),
]


def wm_url(path):
    name = path.split("/")[-1]
    return f"{WM}{path}/1280px-{name}"


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        buf = np.frombuffer(r.read(), np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


# ---------- 深度 ----------
_depth_sess = None


def estimate_depth(bgr):
    """返回 0–1 的相对逆深度（1 = 最近），与原图同尺寸，已做保边平滑。"""
    global _depth_sess
    if _depth_sess is None:
        _depth_sess = ort.InferenceSession(str(MODELS / "da2l_int8.onnx"), providers=["CPUExecutionProvider"])
    h, w = bgr.shape[:2]
    # DPT 预处理：短边 518、保持比例、边长取 14 的倍数
    s = 518 / min(h, w)
    nh, nw = int(round(h * s / 14)) * 14, int(round(w * s / 14)) * 14
    rgb = cv2.cvtColor(cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_CUBIC), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    x = ((rgb - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).astype(np.float32).transpose(2, 0, 1)[None]
    inp = _depth_sess.get_inputs()[0].name
    d = _depth_sess.run(None, {inp: x})[0].squeeze().astype(np.float32)
    d = cv2.resize(d, (w, h), interpolation=cv2.INTER_CUBIC)
    lo, hi = np.percentile(d, [1, 99])
    d = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1).astype(np.float32)
    # 保边平滑：压掉笔触纹理被误读成的几何噪声，但保留前后景的断层
    d = cv2.bilateralFilter(d, 9, 0.06, 7)
    return d


# ---------- 补全 ----------
_lama = None


def lama_inpaint(bgr, mask):
    """OpenCV Zoo 的 LaMa（512×512 固定输入），结果缩放回原尺寸。"""
    global _lama
    if _lama is None:
        _lama = cv2.dnn.readNetFromONNX(str(MODELS / "lama.onnx"))
    h, w = bgr.shape[:2]
    img_blob = cv2.dnn.blobFromImage(bgr, 1 / 255, (512, 512), (0, 0, 0), False, False)
    m_blob = (cv2.dnn.blobFromImage(mask, 1.0, (512, 512), (0,), False, False) > 0).astype(np.float32)
    _lama.setInput(img_blob, "image")
    _lama.setInput(m_blob, "mask")
    out = _lama.forward()[0].transpose(1, 2, 0)
    out = np.clip(out, 0, 255).astype(np.uint8)
    return cv2.resize(out, (w, h), interpolation=cv2.INTER_CUBIC)


def lama_inpaint_crop(bgr, hole, need):
    """只在需要补的区域（need）外扩一圈的包围盒里跑 LaMa：512 输入覆盖的面积越小，补出来越清晰。"""
    ys, xs = np.nonzero(need)
    if len(ys) == 0:
        return bgr
    h, w = bgr.shape[:2]
    m = 96
    y0, y1 = max(0, ys.min() - m), min(h, ys.max() + m + 1)
    x0, x1 = max(0, xs.min() - m), min(w, xs.max() + m + 1)
    out = bgr.copy()
    out[y0:y1, x0:x1] = lama_inpaint(bgr[y0:y1, x0:x1], hole[y0:y1, x0:x1])
    return out


def extend_depth(depth, own, cap):
    """把本层深度向外延展到整图（半分辨率 Telea），并限制不超过 cap，保证留在更近层的后面。"""
    h, w = depth.shape
    sh, sw = h // 2, w // 2
    d8 = (cv2.resize(depth, (sw, sh)) * 255).astype(np.uint8)
    hole = (cv2.resize(own.astype(np.uint8), (sw, sh), interpolation=cv2.INTER_NEAREST) == 0).astype(np.uint8)
    filled = cv2.inpaint(d8, hole, 5, cv2.INPAINT_TELEA).astype(np.float32) / 255
    filled = cv2.resize(filled, (w, h), interpolation=cv2.INTER_LINEAR)
    out = np.where(own, depth, np.minimum(filled, cap))
    return out


def layer_split(depth):
    """一维 k-means 切 K 层，返回 labels（0 = 最远）和每层深度上界。"""
    samples = depth.reshape(-1, 1)[:: 7].astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 1e-4)
    _, _, centers = cv2.kmeans(samples, K, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    c = np.sort(centers.ravel())
    bounds = (c[:-1] + c[1:]) / 2
    labels = np.digitize(depth, bounds)  # 0..K-1，越大越近
    # 去掉碎屑：每层做一次开运算后按众数回填
    clean = np.zeros_like(labels)
    for i in range(K):
        m = cv2.morphologyEx((labels == i).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        clean[m > 0] = i
    unassigned = np.ones_like(labels, bool)
    for i in range(K):
        unassigned &= ~((clean == i) & (labels == i))
    clean[unassigned] = labels[unassigned]
    upper = np.append(bounds, 1.0)
    return clean, upper


def bake(slug, name, by, path, scale, mode):
    out = DATA / slug
    out.mkdir(parents=True, exist_ok=True)
    src = out / "color.jpg"
    if src.exists():
        bgr = cv2.imread(str(src))
    else:
        bgr = download(wm_url(path))
        cv2.imwrite(str(src), bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
    h, w = bgr.shape[:2]
    th = cv2.resize(bgr, (256, int(256 * h / w)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(out / "thumb.jpg"), th, [cv2.IMWRITE_JPEG_QUALITY, 85])

    depth = estimate_depth(bgr)
    cv2.imwrite(str(out / "depth.png"), (depth * 255).astype(np.uint8))

    labels, upper = layer_split(depth)
    r = max(3, int(EXTEND * w))
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    for i in range(K):
        own = labels == i
        nearer = labels > i
        if i == K - 1:
            color, alpha, dep = bgr, own, depth
        else:
            # 被更近层挡住的地方：最远层整块补满（背景板），中间层只在自身周围 r 范围内延展
            fill = nearer if i == 0 else nearer & (cv2.dilate(own.astype(np.uint8), ker) > 0)
            hole = (nearer.astype(np.uint8) * 255)
            hole = cv2.dilate(hole, np.ones((11, 11), np.uint8))  # 把前景边缘的混色像素也挖掉，不然会补出一圈前景色
            painted = lama_inpaint_crop(bgr, hole, fill)
            color = np.where(fill[..., None], painted, bgr)
            alpha = own | fill
            dep = extend_depth(depth, own, upper[i])
        a = (alpha.astype(np.float32))
        a = cv2.GaussianBlur(a, (5, 5), 0)  # 边缘羽化 2px
        rgba = np.dstack([color, (a * 255).astype(np.uint8)])
        cv2.imwrite(str(out / f"l{i}.webp"), rgba, [cv2.IMWRITE_WEBP_QUALITY, 88])
        dh, dw = h // 2, w // 2
        cv2.imwrite(str(out / f"l{i}d.png"), (cv2.resize(dep, (dw, dh), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8))

    meta = dict(slug=slug, name=name, by=by, width=w, height=h, layers=K, scale=scale, mode=mode,
                credit=f"{name} · {by} · Public domain, via Wikimedia Commons", source=wm_url(path))
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[ok] {slug} {w}x{h} layers upper={np.round(upper, 3).tolist()}", flush=True)
    return meta


if __name__ == "__main__":
    only = set(sys.argv[1:])
    metas = []
    for p in PAINTINGS:
        if only and p[0] not in only:
            meta_file = DATA / p[0] / "meta.json"
            if meta_file.exists():
                metas.append(json.loads(meta_file.read_text(encoding="utf-8")))
            continue
        metas.append(bake(*p))
    (DATA / "paintings.json").write_text(json.dumps(metas, ensure_ascii=False, indent=1), encoding="utf-8")
    print("paintings.json:", len(metas))
