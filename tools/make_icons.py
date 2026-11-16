import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
# vertical gradient rounded square
grad = Image.new("RGBA", (S, S))
gd = ImageDraw.Draw(grad)
top, bot = (45, 212, 167), (14, 116, 144)
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
    gd.line([(0, y), (S, y)], fill=c)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=118, fill=255)
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)
white = (255, 255, 255, 255)
# "skip forward" glyph: two triangles and a bar
cy = S // 2
h = 170
d.polygon([(118, cy - h // 2), (118, cy + h // 2), (238, cy)], fill=white)
d.polygon([(232, cy - h // 2), (232, cy + h // 2), (352, cy)], fill=white)
d.rounded_rectangle([362, cy - h // 2, 400, cy + h // 2], radius=10, fill=white)
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(f"{out}/icon{size}.png")
img.save(f"{out}/icon512.png")
print("ok")
