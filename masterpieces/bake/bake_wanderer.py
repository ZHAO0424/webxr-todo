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
# 只留和大衣、头发连在一起的那几块（背景里漏进来的暗点都扔掉）
n, lab = cv2.connectedComponents(alpha)
core = lab[int(250 - oy), int(140 - ox)]
keep = {core} | {int(k) for k in np.unique(lab[head | collar]) if k != 0 and (lab == k).sum() > 150}
hard = np.isin(lab, list(keep))
# 头发里被当成背景的小洞填上（只在头部范围里填，手叉腰围出来的那块背景要留着）
n2, lab2 = cv2.connectedComponents((~hard).astype(np.uint8))
border = set(np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]])))
for k in np.unique(lab2[head]):
    if k not in border: hard[lab2 == k] = True

# 大衣下摆以下（画里 y > 960）：腿和手杖按手工描的轮廓（腿后面是同样暗的岩石，颜色分不开）
def polyI(points):   # 画面绝对坐标
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).polygon([(x - X0, y - Y0) for x, y in points], fill=255)
    return np.asarray(im) > 127
lower = yy > 960 - Y0
legL = polyI([(519, 955), (580, 955), (584, 1000), (572, 1060), (567, 1105), (562, 1127), (536, 1131), (497, 1127), (493, 1113), (518, 1096), (521, 1040), (516, 998)])
legR = polyI([(638, 985), (702, 985), (706, 1022), (700, 1082), (691, 1140), (685, 1198), (681, 1236), (629, 1236), (626, 1180), (631, 1120), (635, 1060)])
coatHem = polyI([(505, 955), (745, 955), (745, 990), (505, 990)]) & hard          # 下摆本身照旧
legs2 = (legL | legR) & (((g - r) > -0.025) | (lum < 0.12)) & (lum < 0.42)          # 轮廓里再按颜色：只要偏绿的暗色（裤子），褐色的岩石和亮的天都不要
legs2 = cv2.morphologyEx(cv2.morphologyEx(legs2.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
# 右小腿下半截衬着同样暗的岩石，颜色分不开：这一截直接用一条收窄、平滑的轮廓（最底下会被 3D 岩石挡住）
shin = polyI([(634, 1140), (690, 1140), (686, 1180), (682, 1228), (632, 1228), (629, 1180)])
legs2 = np.where(yy > 1140 - Y0, shin | (legs2 & legL), legs2)
legs2 &= yy < 1229 - Y0
hard = np.where(lower, legs2 | coatHem, hard)
hard &= ~(lower & ~legL & ~legR & (lum > 0.5))                                    # 两腿之间那块灰色的天
# 手杖：沿画里的手杖描一条折线，宽 4 像素；上半截衬着天，下半截衬着岩石
stickPts = [(733, 935), (740, 960), (772, 1060), (790, 1110), (802, 1170), (808, 1215)]
st = Image.new('L', (w, h), 0); ImageDraw.Draw(st).line([(x - X0, y - Y0) for x, y in stickPts], fill=255, width=4)
stick = np.asarray(st) > 127
hard |= stick

# ---------- 边缘：软的 alpha 抠图 ----------
# 已知前景 = 硬遮罩往里缩 2 像素，已知背景 = 往外扩 2 像素；中间一圈按"像前景色还是像背景色"算透明度，
# 前景色 / 背景色都取附近已知像素的局部平均；对比太弱的地方（衬着暗岩石）退回到模糊过的硬边
k5 = np.ones((5, 5), np.uint8)
H8 = hard.astype(np.uint8)
FG = cv2.erode(H8, k5) > 0
BG = cv2.dilate(H8, k5) == 0
def local_mean(mask, sig):
    m = mask.astype(np.float32)
    num = cv2.GaussianBlur(c * m[..., None], (0, 0), sig)
    den = cv2.GaussianBlur(m, (0, 0), sig)[..., None]
    return num / np.maximum(den, 1e-4), den[..., 0]
Fm, fd = local_mean(FG, 3.0)
Bm, bd = local_mean(BG, 3.0)
FB = Fm - Bm
a_proj = np.clip(((c - Bm) * FB).sum(-1) / np.maximum((FB * FB).sum(-1), 1e-4), 0, 1)
contrast = np.sqrt((FB * FB).sum(-1))
soft = cv2.GaussianBlur(H8.astype(np.float32), (0, 0), 0.9)
band = ~FG & ~BG
use_proj = band & (contrast > 0.12) & (fd > 0.05) & (bd > 0.05)
a = np.where(FG, 1.0, np.where(BG, 0.0, np.where(use_proj, a_proj, soft))).astype(np.float32)
a[stick] = np.maximum(a[stick], np.where(lum[stick] < 0.62, 1.0, a_proj[stick]))
# 导向滤波：以亮度为导向把透明度再顺一遍，边缘贴着画里的笔触走，锯齿就没了
def guided(I, p, r, eps):
    box = lambda x: cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1))
    mI, mp = box(I), box(p)
    A = (box(I * p) - mI * mp) / (box(I * I) - mI * mI + eps)
    B = mp - A * mI
    return box(A) * I + box(B)
a = np.clip(guided(lum.astype(np.float32), a, 2, 2e-3), 0, 1)
a[FG] = 1.0; a[BG] = 0.0
a = np.clip((a - 0.15) / 0.85, 0, 1)   # 边缘往里收一点点：衬在暗处时不会有一圈亮边
# 去掉边缘上混进来的天色：半透明处的颜色换成附近前景色
rgb = np.where((band & (a < 0.98))[..., None], Fm, c)
# 放大两倍输出，边缘更细
out_rgba = np.dstack([np.clip(rgb, 0, 1), a])
big = cv2.resize(out_rgba, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
big = np.clip(big, 0, 1)
fig = Image.fromarray((big * 255 + 0.5).astype(np.uint8), 'RGBA')
fig.save(out / 'figure.png', optimize=True)
print('figure.png', fig.size, 'box', (X0, Y0, X1, Y1))

# ---------- 2. 岩石笔触 ----------
rk = src.crop((330, 1300, 1080, 1560))
rk = rk.resize((1024, int(1024 * rk.height / rk.width)), Image.LANCZOS)
rk.save(out / 'rock.jpg', quality=88)
print('rock.jpg', rk.size)
