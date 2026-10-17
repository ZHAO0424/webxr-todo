"""雾海之上的离线烘焙：
1. figure.png —— 从画里抠出旅人（含头发、手杖），带透明通道；在场景里作为一块单独的剪影立在 3D 岩顶上。
2. rock.jpg —— 从画底部裁下的一块岩石笔触，给所有 3D 岩体（脚下的岩脊、旅人脚下的岩堆、雾里的砂岩柱）做三向投影贴图。
用法：python -I bake_wanderer.py <masterpieces 目录>
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

root = Path(sys.argv[1])
out = root / 'data' / 'wanderer'
src = Image.open(out / 'color.jpg').convert('RGB')
W, H = src.size


def morph(mask, size, op):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MaxFilter(size) if op == 'dilate' else ImageFilter.MinFilter(size))
    return np.asarray(im) > 127


# ---------- 1. 旅人剪影 ----------
X0, Y0, X1, Y1 = 500, 560, 820, 1232          # 画里旅人的外框（像素），脚底在 Y1 附近
crop = src.crop((X0, Y0, X1, Y1))
c = np.asarray(crop, np.float32) / 255
lum = c @ np.array([0.3, 0.59, 0.11], np.float32)
mx, mn = c.max(-1), c.min(-1)
sat = (mx - mn) / (mx + 1e-3)
yy, xx = np.mgrid[0:crop.height, 0:crop.width]
r, g = c[..., 0], c[..., 1]
# 大衣、裤子都是偏绿的暗色；腿后面那堆岩石是偏红褐的暗色——腿部那一段按色相把岩石去掉
# 膝盖以下：只在两条腿的轮廓（手工给的多边形）里取暗色，腿后面的岩石一律不要
from PIL import ImageDraw
legs = Image.new('L', crop.size, 0); dl = ImageDraw.Draw(legs)
dl.polygon([(28, 425), (102, 425), (88, 520), (66, 572), (0, 572), (0, 540), (22, 520)], fill=255)    # 左腿，踩在高一点的石头上
dl.polygon([(150, 425), (206, 425), (200, 560), (196, 652), (160, 652), (156, 560)], fill=255)        # 右腿
legs = np.asarray(legs) > 127
body = (lum < 0.36) & ((yy < 425) | (legs & ((g - r > -0.02) | (lum < 0.13))))
body &= ~((xx < 30) & (yy < 520))                          # 左边缘露进来的远处岩柱
hair = (sat > 0.22) & (lum < 0.8) & (yy < 110)            # 被风吹乱的红褐色头发
collar = (yy > 55) & (yy < 82) & (xx > 108) & (xx < 172) & (lum > 0.5)   # 白领子
# 手杖：从手到地面的一条细线，沿线 3 像素内的暗色都留下
ax, ay, bx, by = 236, 292, 292, 655
t = np.clip(((xx - ax) * (bx - ax) + (yy - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), 0, 1)
dist = np.hypot(xx - (ax + t * (bx - ax)), yy - (ay + t * (by - ay)))
stick = (dist < 3.5) & (lum < 0.62)
alpha = body | hair | collar | stick
alpha = morph(morph(alpha, 5, 'dilate'), 5, 'erode')      # 闭运算：衣服上的亮笔触不变成洞
alpha = morph(morph(alpha, 3, 'erode'), 3, 'dilate')      # 开运算：背景里的暗点去掉
a = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
fig = crop.convert('RGBA'); fig.putalpha(a)
fig.save(out / 'figure.png', optimize=True)
print('figure.png', fig.size)

# ---------- 2. 岩石笔触 ----------
rock = src.crop((330, 1300, 1080, 1560))
rock = rock.resize((1024, int(1024 * rock.height / rock.width)), Image.LANCZOS)
rock.save(out / 'rock.jpg', quality=88)
print('rock.jpg', rock.size)
