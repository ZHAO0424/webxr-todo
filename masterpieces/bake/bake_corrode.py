"""勃克林《死之岛》：烘一张"腐蚀过后"的底图 corroded.jpg，垫在原画后面；
页面里目光停留处把前面的原画腐蚀掉，露出这一层。

只依赖 numpy + Pillow（不需要 cv2）。
用法（bake/ 目录下）：python bake_corrode.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

D = Path(__file__).parent.parent / "data" / "isle-of-the-dead"
rng = np.random.default_rng(7)


def vnoise(h, w, cells_y, cells_x):
    """值噪声：随机格点 + 双三次放大到 (h, w)。"""
    g = rng.random((cells_y + 1, cells_x + 1)).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255


def fbm(h, w, base_cells, octaves=5, gain=0.5, aspect=1.0):
    s = np.zeros((h, w), np.float32)
    a, c, tot = 1.0, base_cells, 0.0
    for _ in range(octaves):
        s += a * vnoise(h, w, max(2, int(c)), max(2, int(c * aspect)))
        tot += a
        a *= gain
        c *= 2
    return s / tot


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def main():
    col = np.asarray(Image.open(D / "color.jpg").convert("RGB")).astype(np.float32) / 255
    H, W = col.shape[:2]
    asp = W / H
    reg = np.asarray(Image.open(D / "region.png").convert("RGB").resize((W, H), Image.BILINEAR)).astype(np.float32) / 255
    rock, water, trees = reg[..., 0], reg[..., 1], reg[..., 2]
    sky = np.clip(1 - rock - water - trees, 0, 1)
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None] * np.ones((1, W), np.float32)   # 0 = 顶

    lum = col @ np.array([0.3, 0.59, 0.11], np.float32)

    # ---- 1. 底色：褪色、发灰、发冷，像在潮湿的墙上挂了一百年 ----
    grey = lum[..., None] * np.array([0.92, 0.90, 0.86], np.float32)
    base = lerp(col, grey, 0.62) * 0.74
    # 大块的水渍：低频噪声，偏暖的茶色和偏冷的灰绿交替
    stain = fbm(H, W, 3, 4, aspect=asp)
    warm = np.array([0.42, 0.33, 0.20], np.float32)
    cold = np.array([0.22, 0.26, 0.24], np.float32)
    stainCol = lerp(cold[None, None], warm[None, None], smoothstep(0.4, 0.65, stain)[..., None])
    base = lerp(base, base * 0.55 + stainCol * 0.7, 0.45 * smoothstep(0.35, 0.75, stain)[..., None])

    # ---- 2. 往下流的水痕：横向低频、纵向拉长，从上往下越来越淡 ----
    drip = fbm(H, W, 2, 5, aspect=asp * 14)        # 横向细、纵向长
    breakup = smoothstep(0.3, 0.65, fbm(H, W, 4, 3, aspect=asp))   # 不是每一道都贯穿到底
    dripMask = smoothstep(0.6, 0.85, drip) * (1 - yy) ** 0.8 * breakup
    base = lerp(base, base * np.array([0.80, 0.77, 0.70], np.float32), (0.4 * dripMask)[..., None])
    # 水痕边上一道很淡的亮边（矿物析出）
    rim = smoothstep(0.56, 0.6, drip) * (1 - smoothstep(0.6, 0.65, drip)) * (1 - yy) ** 0.8 * breakup
    base = lerp(base, np.array([0.62, 0.60, 0.54], np.float32)[None, None], (0.18 * rim)[..., None])

    # ---- 3. 地衣 / 苔藓 / 盐斑：分区域长，边缘参差 ----
    patch = fbm(H, W, 10, 5, aspect=asp)
    fine = fbm(H, W, 60, 3, aspect=asp)
    tint = fbm(H, W, 6, 3, aspect=asp)
    # 岩石：黄地衣、橙锈、灰绿地衣三色
    lichenTip = lerp(lerp(np.array([0.82, 0.64, 0.28]), np.array([0.70, 0.38, 0.16]), smoothstep(0.35, 0.65, tint)[..., None]),
                     np.array([0.62, 0.64, 0.50]), smoothstep(0.75, 0.95, tint)[..., None]).astype(np.float32)
    speck = fbm(H, W, 220, 2, aspect=asp)
    lichenMask = smoothstep(0.54, 0.64, patch + 0.25 * (fine - 0.5)) * rock * (0.25 + 0.75 * smoothstep(0.42, 0.7, speck))
    crust = 0.7 + 0.6 * fine
    lichenTip = lerp(lichenTip, lum[..., None] * np.ones(3, np.float32), 0.3)   # 带一点原画的明暗，别太"贴纸"
    base = lerp(base, lichenTip * crust[..., None], (0.62 * lichenMask)[..., None])
    # 地衣边一圈深色
    edge = smoothstep(0.46, 0.52, patch + 0.25 * (fine - 0.5)) * (1 - smoothstep(0.52, 0.56, patch + 0.25 * (fine - 0.5))) * rock
    base *= (1 - 0.35 * edge)[..., None]
    # 柏树：苔藓，暗绿到黄绿
    moss = lerp(np.array([0.09, 0.12, 0.06]), np.array([0.30, 0.36, 0.17]), fine[..., None]).astype(np.float32)
    mossMask = smoothstep(0.47, 0.62, patch * 0.7 + fine * 0.3) * trees * (0.3 + 0.7 * smoothstep(0.4, 0.7, speck))
    base = lerp(base, moss, (0.6 * mossMask)[..., None])
    # 水面：盐与骨色的斑，压暗不发亮
    salt = lerp(np.array([0.30, 0.32, 0.33]), np.array([0.62, 0.63, 0.58]), fine[..., None]).astype(np.float32)
    saltMask = smoothstep(0.57, 0.7, patch + 0.3 * (fine - 0.5)) * water * (0.3 + 0.7 * smoothstep(0.4, 0.7, speck))
    base = lerp(base, salt, (0.5 * saltMask)[..., None])
    # 天空：霉斑，灰黑的小点簇
    mould = fbm(H, W, 90, 2, aspect=asp)
    mouldMask = smoothstep(0.62, 0.75, mould) * smoothstep(0.45, 0.6, patch) * sky
    base = lerp(base, np.array([0.16, 0.16, 0.17], np.float32)[None, None], (0.6 * mouldMask)[..., None])

    # ---- 4. 龟裂：多层噪声的等高线 = 细裂纹网 ----
    crack = np.zeros((H, W), np.float32)
    for cells, levels, wdt in ((14, 7, 0.006), (34, 9, 0.004)):
        n = fbm(H, W, cells, 3, aspect=asp)
        for k in range(1, levels):
            lv = k / levels
            crack = np.maximum(crack, 1 - smoothstep(0, wdt, np.abs(n - lv)))
    crack *= 0.5 + 0.5 * smoothstep(0.3, 0.7, fbm(H, W, 5, 3, aspect=asp))   # 不是处处都裂
    base *= (1 - 0.4 * crack)[..., None]

    # ---- 5. 剥落：成片的颜料掉了，露出底下深色的底子 ----
    cellN = fbm(H, W, 90, 2, aspect=asp)
    flakeN = cellN + 0.2 * (fbm(H, W, 260, 2, aspect=asp) - 0.5)
    flake = smoothstep(0.70, 0.75, flakeN) * smoothstep(0.45, 0.7, patch)
    ground = np.array([0.16, 0.13, 0.10], np.float32) * (0.7 + 0.6 * fine)[..., None]
    base = lerp(base, ground, (0.85 * flake)[..., None])
    # 剥落边缘：颜料断口的一道暗影
    flakeEdge = smoothstep(0.67, 0.70, flakeN) * (1 - smoothstep(0.70, 0.72, flakeN)) * smoothstep(0.45, 0.7, patch)
    base *= (1 - 0.3 * flakeEdge)[..., None]

    # ---- 6. 颗粒 + 边角积垢 ----
    grain = rng.random((H, W)).astype(np.float32)
    base *= (0.9 + 0.2 * grain)[..., None]
    xx = np.linspace(-1, 1, W, dtype=np.float32)[None, :]
    vig = 1 - 0.35 * np.clip(((xx * 1.05) ** 2 + ((yy * 2 - 1) * 1.1) ** 2) - 0.5, 0, 1)
    base *= vig[..., None]

    out = np.clip(base, 0, 1)
    img = Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4))
    img.save(D / "corroded.jpg", quality=88)
    print("ok", out.shape)


if __name__ == "__main__":
    main()
