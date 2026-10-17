"""雾海之上的离线烘焙：
1. figure.png —— 从画里抠出旅人（含头发、领子、手杖），带透明通道；在场景里作为一块单独的剪影立在 3D 岩堆上。
   先用颜色 + 手工的身体轮廓给出"肯定是人 / 可能是人 / 肯定是背景"几档，再交给 OpenCV 的 GrabCut 按颜色分布细分边缘，
   最后羽化一像素。外框比人大一圈，头发不会被削平。
2. rock.jpg —— 从画底部裁下的一块岩石笔触，给所有 3D 岩体做三向投影贴图。
用法（需要 opencv-python-headless）：python -I bake_wanderer.py <masterpieces 目录>
"""
import sys
from pathlib import Path
import numpy as np
import cv2
from PIL import Image, ImageDraw

root = Path(sys.argv[1])
out = root / 'data' / 'wanderer'
src = Image.open(out / 'color.jpg').convert('RGB')
W, H = src.size

# ---------- 1. 旅人剪影 ----------
X0, Y0, X1, Y1 = 480, 515, 840, 1250          # 外框（像素）：比人大一圈；底边在脚下
crop = src.crop((X0, Y0, X1, Y1))
c = np.asarray(crop, np.float32) / 255
h, w = c.shape[:2]
lum = c @ np.array([0.3, 0.59, 0.11], np.float32)
r, g = c[..., 0], c[..., 1]
mx, mn = c.max(-1), c.min(-1)
sat = (mx - mn) / (mx + 1e-3)
yy, xx = np.mgrid[0:h, 0:w]
ox, oy = X0 - 500, Y0 - 560                    # 下面的手工坐标是按旧外框 (500, 560) 量的

def poly(points):
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).polygon([(x - ox, y - oy) for x, y in points], fill=255)
    return np.asarray(im) > 127

legs = poly([(28, 425), (102, 425), (88, 520), (66, 572), (0, 572), (0, 540), (22, 520)]) | \
       poly([(150, 425), (206, 425), (200, 560), (196, 652), (160, 652), (156, 560)])
torso = poly([(40, 60), (230, 60), (275, 230), (250, 420), (30, 430), (25, 250)])            # 大衣（肯定是人）
head = poly([(95, -40), (190, -40), (185, 70), (105, 75)])                                    # 头发和头（可能是人）
stick = np.zeros((h, w), bool)
for t in np.linspace(0, 1, 400):
    x, y = 236 + t * (292 - 236) - ox, 292 + t * (655 - 292) - oy
    stick[max(0, int(y) - 2):int(y) + 3, max(0, int(x) - 2):int(x) + 3] = True

GC_BGD, GC_FGD, GC_PR_BGD, GC_PR_FGD = cv2.GC_BGD, cv2.GC_FGD, cv2.GC_PR_BGD, cv2.GC_PR_FGD
m = np.full((h, w), GC_BGD, np.uint8)
near = cv2.dilate(((torso | legs | head | stick) * 255).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
m[near] = GC_PR_BGD
m[(torso | head | legs) & (lum < 0.45)] = GC_PR_FGD
m[head & (sat > 0.2)] = GC_PR_FGD                       # 被风吹乱的红褐色头发
dark = (lum < 0.38) & ((g - r > -0.02) | (lum < 0.14))           # 大衣、裤子：偏绿的暗色
m[(cv2.erode(((torso & dark) * 255).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)] = GC_FGD
m[legs & dark] = GC_FGD
m[stick & (lum < 0.6)] = GC_FGD
collar = poly([(108, 55), (172, 55), (172, 82), (108, 82)])
# 雾和天：亮、灰——肯定是背景（领子除外）
m[(lum > 0.52) & (sat < 0.22) & ~collar] = GC_BGD
m[collar & (lum > 0.5)] = GC_PR_FGD
m[cv2.erode(((head & (sat > 0.2) & (lum < 0.8)) * 255).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = GC_FGD   # 头发的芯：肯定是人（GrabCut 只去细分发梢）
# 脚下和腿后面那堆偏红褐的岩石：肯定是背景
rock = (yy > 425 - oy) & ~legs & ~stick & (r - g > 0.02)
m[rock] = GC_BGD
img = cv2.cvtColor((c * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(img, m, None, bgd, fgd, 10, cv2.GC_INIT_WITH_MASK)
alpha = np.isin(m, (GC_FGD, GC_PR_FGD)).astype(np.uint8) * 255
# 只留和大衣连在一起的那一块（背景里漏进来的暗点都扔掉），再补上手杖
n, lab = cv2.connectedComponents(alpha)
core = lab[int(250 - oy), int(140 - ox)]
keep = {core} | {int(k) for k in np.unique(lab[head | collar]) if k != 0 and (lab == k).sum() > 150}   # 头发、领子和大衣之间隔着一道亮领口，也要留下
alpha = np.where(np.isin(lab, list(keep)), 255, 0).astype(np.uint8)
alpha[stick & (lum < 0.6)] = 255
# 头发里被当成背景的小洞（头顶那块暗发）填上——只在头部范围里填，手叉腰围出来的那块背景要留着
n2, lab2 = cv2.connectedComponents((alpha == 0).astype(np.uint8))
border = set(np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]])))
for k in np.unique(lab2[head]):
    if k not in border: alpha[lab2 == k] = 255
alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
alpha = cv2.GaussianBlur(alpha, (3, 3), 0.8)
fig = crop.convert('RGBA'); fig.putalpha(Image.fromarray(alpha))
fig.save(out / 'figure.png', optimize=True)
print('figure.png', fig.size, 'box', (X0, Y0, X1, Y1))

# ---------- 2. 岩石笔触 ----------
rk = src.crop((330, 1300, 1080, 1560))
rk = rk.resize((1024, int(1024 * rk.height / rk.width)), Image.LANCZOS)
rk.save(out / 'rock.jpg', quality=88)
print('rock.jpg', rk.size)
