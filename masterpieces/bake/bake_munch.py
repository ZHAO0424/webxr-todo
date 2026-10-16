"""蒙克"桥上三联"：《绝望》1892 /《呐喊》1893 /《焦虑》1894。

每幅产出 ../data/<slug>/：
    color.jpg    原图（1280 宽）
    depth.png    深度（亮 = 近），复用 bake.py 的 Depth Anything V2 Large
    orient.png   笔触走向场：R,G = cos2θ, sin2θ（θ = 线条方向），B = 方向一致度
用法（bake/ 目录下）：.venv/Scripts/python bake_munch.py
"""
from pathlib import Path

import cv2
import numpy as np

import bake  # 复用下载与深度估计

WM = "https://upload.wikimedia.org/wikipedia/commons/thumb/"
MUNCH = [
    ("despair", WM + "d/d7/Fortvivlan.jpg/1280px-Fortvivlan.jpg"),
    ("scream", None),   # bake.py 已经下载过
    ("anxiety", WM + "a/ae/Edvard_Munch_-_Anxiety_-_Google_Art_Project.jpg/1280px-Edvard_Munch_-_Anxiety_-_Google_Art_Project.jpg"),
    ("karl-johan", None),   # 《卡尔约翰街的夜晚》1892，已下载
    ("melancholy", None),   # 《忧郁》1894–96，已下载
]


def orientation(bgr):
    """结构张量：沿着画里线条的方向（梯度方向转 90°），以及方向一致度。"""
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    g = cv2.GaussianBlur(g, (0, 0), 1.2)
    ix = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    iy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    s = 7
    jxx = cv2.GaussianBlur(ix * ix, (0, 0), s)
    jyy = cv2.GaussianBlur(iy * iy, (0, 0), s)
    jxy = cv2.GaussianBlur(ix * iy, (0, 0), s)
    grad = 0.5 * np.arctan2(2 * jxy, jxx - jyy)
    line = grad + np.pi / 2
    coh = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / (jxx + jyy + 1e-6)
    out = np.dstack([
        (np.sin(2 * line) * 0.5 + 0.5) * 255,   # B 通道写 sin（OpenCV 是 BGR，存盘后读出来的 R/G 见下）
        (np.cos(2 * line) * 0.5 + 0.5) * 255,
        np.clip(coh, 0, 1) * 255,
    ])
    # 存成 PNG 后浏览器读到的是 R=coh, G=cos2θ, B=sin2θ
    return out.astype(np.uint8)


if __name__ == "__main__":
    for slug, url in MUNCH:
        d = bake.DATA / slug
        d.mkdir(parents=True, exist_ok=True)
        cpath = d / "color.jpg"
        if cpath.exists():
            bgr = cv2.imread(str(cpath))
        else:
            bgr = bake.download(url)
            cv2.imwrite(str(cpath), bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not (d / "depth.png").exists():
            dep = bake.estimate_depth(bgr)
            cv2.imwrite(str(d / "depth.png"), (dep * 255).astype(np.uint8))
        cv2.imwrite(str(d / "orient.png"), orientation(bgr))
        print("[ok]", slug, bgr.shape[1], "x", bgr.shape[0], flush=True)
