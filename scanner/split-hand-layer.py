"""Split shadow-bg-clean.png into a background with both hands removed and one
transparent layer per hand, so the hands can be animated in CSS.

usage (from the repo root; needs Pillow: pip install pillow):
  python scanner/split-hand-layer.py frontend/public/assets/shadow-bg-clean.png frontend/public/assets [preview_dir]

Writes shadow-bg-base.png, shadow-hand.png (right hand + blade) and
shadow-hand-left.png, and prints each layer's placement on the 800x600 art
(the numbers used in seismic-hud.component.html/.scss).
With a preview_dir it also writes <name>_preview.png: each layer on magenta,
2x size, so any background pixel that came along is easy to spot.
See HOW-IT-WORKS.md: section 5 explains the ideas, section 7 is the
reference for every setting (roi, solid, cut, pad, fill).
"""
import sys
from PIL import Image, ImageFilter, ImageDraw, ImageChops

src, out_dir = sys.argv[1], sys.argv[2]
prev_dir = sys.argv[3] if len(sys.argv) > 3 else None
im = Image.open(src).convert('RGBA')
W, H = im.size
blur = im.convert('L').filter(ImageFilter.BoxBlur(3))
PAD = 24  # pixels of mirrored hand past each art edge the hand touches

HANDS = {
    'shadow-hand': dict(
        # Region the hand + blade can live in (keeps the wall, belt, body out).
        roi=[(546, 260), (564, 260), (612, 410), (640, 412), (740, 462), (800, 485),
             (800, 600), (609, 600), (604, 556), (592, 528), (552, 480), (553, 440),
             (572, 425), (558, 360), (541, 272)],
        # The blade's dark outline is thin, so it is drawn in solid.
        solid=[[(546, 272), (553, 266), (561, 272), (579, 330), (604, 416), (588, 419),
                (568, 350), (550, 295)]],
        pad=dict(right=True, bottom=True)),
    'shadow-hand-left': dict(
        # The hand grips a handle. Fingers, knuckle, thumb (250-285, 580-600)
        # and the finger curled around the handle (210-254 x 523-553) move;
        # the dark object above (215-245, 470-496) stays out of the outline;
        # the handle is removed by `cut` below and stays on the background.
        # The CSS pivots this layer AT the grip, so the curled finger turns
        # in place (< 1 px) and never slides off the still handle.
        roi=[(0, 600), (0, 575), (60, 548), (110, 522), (170, 506), (220, 496),
             (252, 496), (270, 506), (262, 518), (256, 530), (256, 560), (262, 575),
             (285, 578), (292, 590), (292, 600)],
        solid=[],
        # The handle itself (gray bands 206-252 x 553-575 and the post
        # 211-256 x 575-600) stays on the background: the fingers move over it.
        cut=[[(213, 553), (250, 553), (253, 560), (251, 572), (255, 575), (255, 585),
              (241, 596), (238, 600), (211, 600), (211, 575), (209, 566), (211, 557)]],
        pad=dict(left=True, bottom=True),
        # Everything behind this hand and its handle is black; smearing
        # would drag the handle's grays into streaks.
        fill='black'),
}


def hand_mask(roi_pts, solid, cut=()):
    roi = Image.new('L', im.size, 0)
    ImageDraw.Draw(roi).polygon(roi_pts, fill=255)
    m = ImageChops.multiply(blur.point(lambda v: 255 if v > 50 else 0), roi)
    # Opening drops thin specks of background; closing fills dither holes.
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    for poly in solid:
        ImageDraw.Draw(m).polygon(poly, fill=255)
    m = ImageChops.multiply(m.filter(ImageFilter.MaxFilter(3)), roi)
    # Fill enclosed holes (shadows between fingers belong to the hand).
    # "Outside" is whatever connects to the top of the art; the side and
    # bottom edges count as hand, so finger gaps that run off an edge fill too.
    f = Image.new('L', (W + 2, H + 2), 255)
    f.paste(m, (1, 1))
    ImageDraw.Draw(f).line([(0, 0), (W + 1, 0)], fill=0)
    ImageDraw.floodfill(f, (0, 0), 128)
    holes = f.crop((1, 1, W + 1, H + 1)).point(lambda v: 255 if v == 0 else 0)
    m = ImageChops.lighter(m, ImageChops.multiply(holes, roi))
    # Last: remove areas that must stay on the background (e.g. a held
    # object), after everything else so nothing can add them back.
    for poly in cut:
        ImageDraw.Draw(m).polygon(poly, fill=0)
    return m


def mirror(i, n):
    """Index i in [-n, 2n) reflected into [0, n)."""
    if i < 0:
        return -i - 1
    if i >= n:
        return 2 * n - 1 - i
    return i


masks = {}
src_px = im.load()
for name, cfg in HANDS.items():
    m = hand_mask(cfg['roi'], cfg['solid'], cfg.get('cut', ()))
    masks[name] = m
    x0, y0, x1, y1 = m.getbbox()
    p = cfg['pad']
    if p.get('right'):
        x1 = W
    if p.get('bottom'):
        y1 = H
    if p.get('left'):
        x0 = 0
    lx = x0 - (PAD if p.get('left') else 0)
    rx = x1 + (PAD if p.get('right') else 0)
    by = y1 + (PAD if p.get('bottom') else 0)
    layer = Image.new('RGBA', (rx - lx, by - y0), (0, 0, 0, 0))
    lp, mp = layer.load(), m.load()
    for y in range(y0, by):
        for x in range(lx, rx):
            sx, sy = mirror(x, W), mirror(y, H)  # past the art edge: mirror
            if mp[sx, sy]:
                lp[x - lx, y - y0] = src_px[sx, sy]
    layer.save(f'{out_dir}/{name}.png', optimize=True)
    print(f'{name}: left={lx} top={y0} width={layer.width} height={layer.height}')
    if prev_dir:
        c = Image.new('RGBA', layer.size, (255, 0, 255, 255))
        c.alpha_composite(layer)
        c.resize((layer.width * 2, layer.height * 2), Image.NEAREST).save(f'{prev_dir}/{name}_preview.png')

# --- Background: where each hand was cut out, the hole must be filled.
# fill='black' hands get flat black. The others get an "onion-peel" fill:
# 14 rings, each copying the nearest known pixel inward, which keeps the
# dither texture near the edge (the only part motion ever exposes).
# Seam: next to a `cut` area (something still that the moving part touches)
# the original pixels are KEPT in the background for SEAM px. At rest the
# moving layer covers them; when it moves, they show the same texture
# instead of a black gap between the moving part and the still piece.
SEAM = 6
erase = {}
for name, cfg in HANDS.items():
    keep = Image.new('L', im.size, 0)
    for poly in cfg.get('cut', ()):
        ImageDraw.Draw(keep).polygon(poly, fill=255)
    keep = keep.filter(ImageFilter.MaxFilter(2 * SEAM + 1))
    erase[name] = ImageChops.subtract(masks[name], keep)

base = im.copy()
for name, cfg in HANDS.items():
    if cfg.get('fill') == 'black':
        base.paste((0, 0, 0, 255), (0, 0), erase[name])
hole = Image.new('L', im.size, 0)
for n, c in HANDS.items():
    if c.get('fill') != 'black':
        hole = ImageChops.lighter(hole, erase[n])
hp = hole.load()
bp = base.load()
known = [[not hp[x, y] for x in range(W)] for y in range(H)]
frontier = [(x, y) for y in range(H) for x in range(W) if not known[y][x]]
for _ in range(14):
    newly = []
    for x, y in frontier:
        for dx, dy in ((-1, 0), (0, -1), (1, 0), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and known[ny][nx]:
                newly.append((x, y, bp[nx, ny]))
                break
    for x, y, c in newly:
        bp[x, y] = c
        known[y][x] = True
    frontier = [(x, y) for x, y in frontier if not known[y][x]]
for x, y in frontier:  # deep interior is never exposed
    bp[x, y] = (0, 0, 0, 255)
base.save(f'{out_dir}/shadow-bg-base.png', optimize=True)
