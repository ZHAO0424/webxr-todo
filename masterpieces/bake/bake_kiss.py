"""克里姆特《吻》→ 金箔马赛克（四叉树）。

产出 ../data/kiss/：
    color.jpg   原图（1280 宽）
    depth.png   深度（亮 = 近）
    tiles.bin   每块马赛克 8 个 float32：u, v, size, r, g, b, shape, group
                shape: 0 金箔方块 / 1 黑白矩形（男人的袍）/ 2 彩色圆片（女人的袍、花）/ 3 螺旋 / 4 皮肤（细小方块）
                group: -1 男人一侧 / +1 女人一侧 / 0 背景与花地（不动）
用法（bake/ 目录下）：.venv/Scripts/python bake_kiss.py
"""
import struct

import cv2
import numpy as np

import bake

URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg/1280px-The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg"
OUT = bake.DATA / "kiss"


def classify(patch_bgr):
    hsv = cv2.cvtColor(patch_bgr.reshape(-1, 1, 3), cv2.COLOR_BGR2HSV).reshape(-1, 3).astype(np.float32)
    h, s, v = hsv[:, 0].mean() * 2, hsv[:, 1].mean() / 255, hsv[:, 2].mean() / 255
    sstd = hsv[:, 2].std() / 255
    if s < 0.25 and (v < 0.35 or v > 0.7):
        return 1                      # 黑白灰：男人袍子上的矩形
    if 35 <= h <= 60 and s > 0.35:
        return 0 if sstd < 0.12 else 3   # 金：平的是金箔，有纹理的是螺旋
    if 15 <= h < 35 and s < 0.55 and v > 0.55:
        return 4                      # 偏肉色：脸、手、脚
    return 2                          # 其余彩色：花、女人袍上的圆


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    cpath = OUT / "color.jpg"
    if cpath.exists():
        bgr = cv2.imread(str(cpath))
    else:
        bgr = bake.download(URL)
        cv2.imwrite(str(cpath), bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
    H, W = bgr.shape[:2]
    if not (OUT / "depth.png").exists():
        dep = bake.estimate_depth(bgr)
        cv2.imwrite(str(OUT / "depth.png"), (dep * 255).astype(np.uint8))
    dep = cv2.imread(str(OUT / "depth.png"), 0).astype(np.float32) / 255
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)

    # 恋人的范围：深度明显靠前的那一大块（背景金色平面在后）
    fg = cv2.GaussianBlur((dep > np.percentile(dep, 55)).astype(np.float32), (0, 0), 6) > 0.5

    tiles = []
    def split(x, y, s, depth):
        patch = lab[y:y + s, x:x + s].reshape(-1, 3)
        std = patch.std(0).mean()
        detail = std > (9 if depth < 2 else 6)
        if depth < 3 and s >= 4 and detail:
            h2 = s // 2
            for dx in (0, h2):
                for dy in (0, h2):
                    split(x + dx, y + dy, h2, depth + 1)
            return
        pb = bgr[y:y + s, x:x + s]
        b, g, r = pb.reshape(-1, 3).mean(0) / 255
        shape = classify(pb)
        cx, cy = x + s / 2, y + s / 2
        u, v = cx / W, 1 - cy / H
        inFg = fg[min(H - 1, int(cy)), min(W - 1, int(cx))]
        # 男人在左、女人在右：分界线从两人头部之间（u≈0.57）斜着往下到袍子底部（u≈0.47）；
        # 黑白矩形一律算男人的袍子
        # 头部一带要分细：他的头发在最上面（u 到 0.62 都算他），她的脸和肩在其下、偏右（u > 0.5 算她）
        boundary = 0.62 if v > 0.87 else 0.5 if v > 0.68 else 0.55 - 0.08 * (0.68 - v) / 0.46
        man = u < boundary or (shape == 1 and u < boundary + 0.05)
        group = (-1.0 if man else 1.0) if inFg and v > 0.22 else 0.0
        tiles.append((u, v, s / W, r, g, b, float(shape), group))

    S0 = 16
    for y in range(0, H - S0 + 1, S0):
        for x in range(0, W - S0 + 1, S0):
            split(x, y, S0, 0)
    with open(OUT / "tiles.bin", "wb") as f:
        for t in tiles:
            f.write(struct.pack("<8f", *t))
    arr = np.array(tiles)
    print("tiles", len(tiles), "shapes", np.bincount(arr[:, 6].astype(int)), "groups", {g: int((arr[:, 7] == g).sum()) for g in (-1, 0, 1)})
