"""Делает значок приложения из вашей картинки (icon.jpg или любая картинка в корне репозитория).
Запуск: python make_icons.py <папка res> [--write-xml]
Нет картинки: рисует запасной значок, чтобы сборка не ломалась."""
import os, sys
from PIL import Image, ImageDraw

res = sys.argv[1]
write_xml = "--write-xml" in sys.argv

src = None
for name in ("icon.png", "icon.jpg", "icon.jpeg", "icon.webp"):
    if os.path.exists(name):
        src = name
        break
if not src:                                     # иначе любая картинка в корне репозитория (например images9.jpg)
    for name in sorted(os.listdir(".")):
        if name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            src = name
            break

def square(im):
    w, h = im.size
    if h > w:                                   # портрет: берём квадрат вокруг лица (около трети высоты сверху)
        s = w
        top = max(0, min(h - s, int(h * 0.33) - s // 2))
        return im.crop((0, top, w, top + s))
    s = min(w, h)                               # иначе по центру
    l, t = (w - s) // 2, (h - s) // 2
    return im.crop((l, t, l + s, t + s))

if src:
    base = square(Image.open(src).convert("RGB")).resize((512, 512), Image.LANCZOS)
    print("значок из", src)
else:
    base = Image.new("RGB", (512, 512), (31, 58, 95))
    ImageDraw.Draw(base).ellipse((156, 156, 356, 356), fill=(255, 138, 61))
    print("картинка icon.* не найдена: запасной значок")

def rounded(im, size, radius_frac):
    im = im.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius_frac), fill=255)
    im.putalpha(mask.resize((size, size), Image.LANCZOS))
    return im

legacy = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
fore = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for d, px in legacy.items():
    out = os.path.join(res, "mipmap-" + d); os.makedirs(out, exist_ok=True)
    rounded(base, px, 0.18).save(os.path.join(out, "ic_launcher.png"))
    rounded(base, px, 0.5).save(os.path.join(out, "ic_launcher_round.png"))
for d, px in fore.items():
    out = os.path.join(res, "mipmap-" + d); os.makedirs(out, exist_ok=True)
    base.resize((px, px), Image.LANCZOS).save(os.path.join(out, "ic_launcher_foreground.png"))
if write_xml:
    out = os.path.join(res, "mipmap-anydpi-v26"); os.makedirs(out, exist_ok=True)
    xml = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@android:color/black"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n'
    for n in ("ic_launcher.xml", "ic_launcher_round.xml"):
        open(os.path.join(out, n), "w", encoding="utf-8").write(xml)
