"""雾海之上的离线烘焙：
1. fogmask.png —— 画里哪里是雾（白 = 雾）。在模糊后的画上判断，再做闭运算填掉实体里的小洞、开运算去掉雾里的碎点，
   并把旅人和他脚下的岩石保护成实体。运行时就不会在头发、岩石上抠出一个个小洞。
2. rock.jpg —— 从画底部裁下的一块岩石笔触，给脚下的 3D 岩柱做三向投影贴图。
3. valley.jpg —— 雾下的山谷俯视图（1024 m × 1024 m，以岩柱为中心，谷底在脚下约 60 m）：田块、松林、河、路、村庄、教堂、桥。
   村庄中心写进 valley.json，着色器只在村子里点灯。
用法：python -I bake_wanderer.py <masterpieces 目录>
"""
import json, math, random, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

root = Path(sys.argv[1])
out = root / 'data' / 'wanderer'
src = Image.open(out / 'color.jpg').convert('RGB')
W, H = src.size
rng = random.Random(1818)
nrng = np.random.default_rng(1818)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def morph(mask, size, op):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MaxFilter(size) if op == 'dilate' else ImageFilter.MinFilter(size))
    return np.asarray(im) > 127


# ---------- 1. 雾的遮罩 ----------
blur = np.asarray(src.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255
sharp = np.asarray(src, dtype=np.float32) / 255
def fogness(c):
    lum = c @ np.array([0.3, 0.59, 0.11], np.float32)
    mx, mn = c.max(-1), c.min(-1)
    sat = (mx - mn) / (mx + 1e-3)
    return smooth(0.30, 0.48, lum) * smooth(0.26, 0.12, sat), lum, sat
fog, lum, sat = fogness(blur)
v = 1 - (np.arange(H)[:, None] + 0.5) / H
fog = fog * smooth(0.70, 0.62, v)
fogB = fog > 0.5
solid = ~fogB
solid = morph(morph(solid, 7, 'dilate'), 7, 'erode')     # 闭运算：实体里的小洞填上
solid = morph(morph(solid, 5, 'erode'), 5, 'dilate')     # 开运算：雾里的碎点去掉
# 旅人（含头发）和脚下的主岩：只要不是亮灰的雾色，就当实体
_, lumS, satS = fogness(sharp)
yy, xx = np.mgrid[0:H, 0:W]
figure = (xx > 590) & (xx < 800) & (yy > 560) & (yy < 1260)
rock = (yy > 1150) & (xx > 280) & (xx < 1160)
protect = (figure | rock) & ((lumS < 0.55) | (satS > 0.16))
solid |= morph(morph(protect, 9, 'dilate'), 9, 'erode')
# 天空（地平线以上）永远不是雾
solid |= v > 0.70
mask = Image.fromarray(((~solid) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))
mask.resize((W // 2, H // 2), Image.LANCZOS).save(out / 'fogmask.png', optimize=True)
print('fogmask.png', mask.size)

# ---------- 2. 岩石笔触 ----------
crop = src.crop((330, 1300, 1080, 1560))
crop = crop.resize((1024, int(1024 * crop.height / crop.width)), Image.LANCZOS)
crop.save(out / 'rock.jpg', quality=88)
print('rock.jpg', crop.size)

# ---------- 3. 山谷 ----------
N, S = 2048, 1024.0         # 像素、米（0.5 m / 像素）
K = S / 256.0               # 相对最初 256 m 版本的放大倍数
px = S / N
def coords():
    i = (np.arange(N) + 0.5) / N
    x = (i - 0.5) * S
    z = (0.5 - i) * S        # 第 0 行是 +z（three 的贴图默认上下翻转，着色器里 uv = xz / S + 0.5）
    return np.meshgrid(x, z)
X, Z = coords()

def vnoise(res, seed):
    r = np.random.default_rng(seed).random((res, res)).astype(np.float32)
    return np.asarray(Image.fromarray((r * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC), np.float32) / 255
def fbm(base, seed, oct=4):
    s, a, tot = 0, 0.5, 0
    for o in range(oct):
        s = s + a * vnoise(base * 2 ** o, seed + o); tot += a; a *= 0.5
    return s / tot

# 河：和着色器里同一条公式
river_c = K * (6.0 + 9.0 * np.sin(Z / K * 0.045 + 1.0) + 3.0 * np.sin(Z / K * 0.13))
rdist = np.abs(X - river_c)
# 地形：离河越远越高、越是林子
hills = fbm(6, 11)
wild = smooth(26 * K * 0.8, 60 * K * 0.8, rdist + 18 * K * (hills - 0.5))         # 0 = 河谷平地，1 = 山坡林地

img = np.zeros((N, N, 3), np.float32)
meadow = np.stack([0.36, 0.42, 0.22], -1)
img[:] = meadow * (0.8 + 0.4 * fbm(24, 3))[..., None]

# 田块：抖动网格的 Voronoi，每块一种颜色、一种犁沟方向
cell = 34.0
gx, gz = np.floor(X / cell), np.floor(Z / cell)
best = np.full(X.shape, 1e9, np.float32); fid = np.zeros(X.shape, np.int64)
for dx in (-1, 0, 1):
    for dz in (-1, 0, 1):
        cx, cz = gx + dx, gz + dz
        h = np.sin(cx * 127.1 + cz * 311.7) * 43758.5453; h -= np.floor(h)
        h2 = np.sin(cx * 269.5 + cz * 183.3) * 43758.5453; h2 -= np.floor(h2)
        px_, pz_ = (cx + 0.15 + 0.7 * h) * cell, (cz + 0.15 + 0.7 * h2) * cell
        d = np.maximum(np.abs(X - px_) * 1.25, np.abs(Z - pz_))     # 方一点，像田
        upd = d < best
        best = np.where(upd, d, best); fid = np.where(upd, (cx * 7919 + cz * 104729).astype(np.int64), fid)
palette = np.array([[0.62, 0.55, 0.30], [0.50, 0.46, 0.24], [0.40, 0.47, 0.24], [0.45, 0.36, 0.24], [0.56, 0.52, 0.36], [0.34, 0.42, 0.20]], np.float32)
fh = (np.sin(fid * 0.7131) * 43758.5453) % 1.0
fcol = palette[(fh * len(palette)).astype(int) % len(palette)]
ang = fh * math.pi
furrow = 0.88 + 0.12 * np.sin((X * np.cos(ang) + Z * np.sin(ang)) * 4.0)
fields = fcol * furrow[..., None] * (0.9 + 0.2 * fbm(64, 5))[..., None]
# 田埂：Voronoi 边上一圈暗线
edge = np.zeros(X.shape, np.float32)
fieldZone = (1 - wild) * smooth(12.0, 20.0, rdist)
img = img * (1 - fieldZone[..., None]) + fields * fieldZone[..., None]

# 松林：山坡上 + 河谷里零星几片
forestN = fbm(10, 21)
forest = np.clip(smooth(0.35, 0.7, wild + 0.6 * (forestN - 0.5)) + smooth(0.68, 0.75, forestN) * 0.9, 0, 1)
forest *= smooth(11.0, 18.0, rdist)
pine = np.stack([0.10, 0.17, 0.11], -1) * (0.7 + 0.6 * fbm(40, 31))[..., None]
img = img * (1 - forest[..., None]) + pine * forest[..., None]

# 河岸、河床
bank = smooth(12.0, 7.6, rdist)
img = img * (1 - bank[..., None]) + np.array([0.42, 0.40, 0.33], np.float32) * bank[..., None]
bed = smooth(8.0, 6.0, rdist)
img = img * (1 - bed[..., None]) + np.array([0.20, 0.24, 0.26], np.float32) * bed[..., None]

base = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
draw = ImageDraw.Draw(base, 'RGBA')
def P(x, z):  # 米 → 像素
    return ((x / S + 0.5) * N, (0.5 - z / S) * N)

# 树冠：林子里一棵棵（带朝光的亮边和背光的影子）
fmask = forest
for _ in range(110000):
    i, j = rng.randrange(N), rng.randrange(N)
    if fmask[j, i] < 0.5 or rng.random() > fmask[j, i]:
        continue
    r = rng.uniform(2.6, 5.0) / px
    x, y = i, j
    draw.ellipse((x - r + r * 0.35, y - r + r * 0.35, x + r + r * 0.35, y + r + r * 0.35), fill=(10, 16, 10, 120))
    g = rng.randint(28, 52)
    draw.ellipse((x - r, y - r, x + r, y + r), fill=(g - 8, g + 14, g - 6, 255))
    draw.ellipse((x - r * 0.75, y - r * 0.85, x + r * 0.2, y), fill=(g + 18, g + 40, g + 10, 140))

# 村庄：几簇房子靠在河边，路把它们连起来，过河有桥
villages = []
for (vx, vz, n) in [(-18, -34, 22), (28, -64, 16), (-44, 14, 18), (34, 22, 20), (2, 66, 14), (-70, -76, 12), (78, -18, 12), (-20, 110, 14)]:
    villages.append((vx * K, vz * K, (9.0 + n * 0.45) * 2.6))
roads = []
order = [5, 0, 1, 6, 3, 4, 2, 0]
for a, b in zip(order, order[1:]):
    roads.append((villages[a][:2], villages[b][:2]))
for (ax, az), (bx, bz) in roads:
    pts = []
    for k in range(41):
        t = k / 40
        x = ax + (bx - ax) * t + 20 * math.sin(t * math.pi * 2 + ax) * math.sin(t * math.pi)
        z = az + (bz - az) * t + 20 * math.cos(t * math.pi * 2 + bz) * math.sin(t * math.pi)
        pts.append(P(x, z))
    draw.line(pts, fill=(150, 132, 96, 255), width=int(4.5 / px), joint='curve')
    draw.line(pts, fill=(170, 152, 112, 255), width=int(2.8 / px), joint='curve')
# 桥：路跨过河的地方
for (ax, az), (bx, bz) in roads:
    for k in range(400):
        t = k / 400
        x, z = ax + (bx - ax) * t, az + (bz - az) * t
        rc = K * (6 + 9 * math.sin(z / K * 0.045 + 1) + 3 * math.sin(z / K * 0.13))
        if abs(x - rc) < 1.0:
            dirx, dirz = bx - ax, bz - az; L = math.hypot(dirx, dirz); dirx /= L; dirz /= L
            p0, p1 = P(x - dirx * 13, z - dirz * 13), P(x + dirx * 13, z + dirz * 13)
            draw.line([p0, p1], fill=(120, 110, 96, 255), width=int(5.0 / px))
            draw.line([p0, p1], fill=(160, 150, 130, 255), width=int(3.4 / px))
            break
roofs = [(140, 70, 52), (122, 60, 46), (108, 92, 80), (150, 88, 60), (96, 84, 76)]
for vi, (vx, vz, vr) in enumerate(villages):
    count = int(vr * 1.1)
    for k in range(count):
        a = rng.uniform(0, 2 * math.pi); d = vr * math.sqrt(rng.random())
        x, z = vx + math.cos(a) * d, vz + math.sin(a) * d
        rc = K * (6 + 9 * math.sin(z / K * 0.045 + 1) + 3 * math.sin(z / K * 0.13))
        if abs(x - rc) < 14:
            continue
        w, l = rng.uniform(6, 9), rng.uniform(10, 16)
        rot = rng.uniform(0, math.pi)
        c, s = math.cos(rot), math.sin(rot)
        def corners(w, l, ox=0.0, oz=0.0):
            return [P(x + ox + c * dx - s * dz, z + oz + s * dx + c * dz) for dx, dz in ((-l / 2, -w / 2), (l / 2, -w / 2), (l / 2, w / 2), (-l / 2, w / 2))]
        # 院子、影子、两坡屋顶（一坡亮一坡暗）、屋脊
        draw.polygon(corners(w + 8, l + 8), fill=(92, 104, 60, 150))
        draw.polygon(corners(w, l, 1.6, -1.6), fill=(20, 22, 16, 150))
        col = roofs[rng.randrange(len(roofs))]
        draw.polygon(corners(w, l), fill=col + (255,))
        half = [P(x + c * dx - s * dz, z + s * dx + c * dz) for dx, dz in ((-l / 2, 0), (l / 2, 0), (l / 2, w / 2), (-l / 2, w / 2))]
        draw.polygon(half, fill=tuple(int(v * 0.72) for v in col) + (255,))
        draw.line([P(x - c * l / 2, z - s * l / 2), P(x + c * l / 2, z + s * l / 2)], fill=(60, 40, 32, 255), width=2)
    # 教堂：村子中间一座长条大屋 + 方塔
    x, z = vx, vz
    draw.rectangle((*P(x - 14, z + 6), *P(x + 14, z - 6)), fill=(118, 112, 104, 255))
    draw.rectangle((*P(x - 14, z + 0.2), *P(x + 14, z - 6)), fill=(88, 84, 78, 255))
    draw.rectangle((*P(x + 14, z + 5), *P(x + 22, z - 5)), fill=(70, 66, 62, 255))
    draw.rectangle((*P(x + 15.2, z + 3.8), *P(x + 20.8, z - 3.8)), fill=(140, 134, 124, 255))

valley = base.filter(ImageFilter.GaussianBlur(0.8))
# 一层很淡的笔触噪声，统一到画的调子（灰绿、略带暖）
arr = np.asarray(valley, np.float32) / 255
arr *= (0.92 + 0.16 * fbm(256, 77, 2))[..., None]
gray = arr @ np.array([0.3, 0.59, 0.11], np.float32)
arr = gray[..., None] + (arr - gray[..., None]) * 0.62           # 降饱和，贴近画的灰绿调子
arr = arr * np.array([0.97, 1.0, 0.93], np.float32) + 0.03
Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(out / 'valley.jpg', quality=86)
json.dump({'size': S, 'villages': villages}, open(out / 'valley.json', 'w'))
print('valley.jpg', N, 'villages', len(villages))
