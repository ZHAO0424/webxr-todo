"""勃克林《死之岛》：区域图 region.png（R=岩石 G=水 B=柏树；都为 0 = 天空），给反应扩散分区用不同的 feed/kill。
用法（bake/ 目录下）：.venv/Scripts/python bake_isle.py
"""
import cv2
import numpy as np

import bake

D = bake.DATA / "isle-of-the-dead"
bgr = cv2.imread(str(D / "color.jpg"))
dep = cv2.imread(str(D / "depth.png"), 0).astype(np.float32) / 255
H, W = bgr.shape[:2]
hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
hue, sat, val = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
y = np.mgrid[0:H, 0:W][0] / H
HOR = 0.765                                  # 地平线
island = (dep > 0.28) & (y < HOR + 0.06)
island = cv2.morphologyEx(island.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)) > 0
warm = (hue > 8) & (hue < 50) & (sat > 0.25) & (val > 0.18)
rock = island & (warm | (val > 0.55))
trees = island & ~rock
# 高出岛体的柏树尖：比天空暗得多、偏冷
trees |= (val < 0.17) & (y < HOR) & (dep > 0.16) & ~rock
trees = cv2.morphologyEx(trees.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
water = (y >= HOR) & ~(island & (y < HOR + 0.03))
water |= (y > HOR + 0.06)
rock &= ~water | (val > 0.4) & warm
out = np.dstack([trees, water & ~rock, rock]).astype(np.float32)     # BGR → 存盘后 R=rock G=water B=trees
out = cv2.GaussianBlur(out, (0, 0), 6)
small = cv2.resize(out, (960, int(960 * H / W)), interpolation=cv2.INTER_AREA)
cv2.imwrite(str(D / "region.png"), (np.clip(small, 0, 1) * 255).astype(np.uint8))
print("ok", small.shape)
