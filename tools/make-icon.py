#!/usr/bin/env python3
"""Draws the Tessera icon (a tilted T piece with two quiet rotation arrows)
and writes assets/icon.png (256px) and assets/icon-512.png. Needs Pillow."""
import math
import os
from PIL import Image, ImageChops, ImageDraw

S = 2048  # working size; downsampled for smooth edges
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')

BG = (17, 17, 27)
BORDER = (112, 72, 190)
TILE_TOP = (206, 138, 255)
TILE_BOTTOM = (160, 72, 240)
GLOSS = (226, 172, 255)
ARROW = (124, 77, 214)

TILT = 14          # degrees, counter-clockwise
TILE = 0.150 * S   # tile edge
GAP = 0.016 * S
ARC_R = 0.365 * S  # arrow radius
ARC_W = 0.017 * S  # arrow thickness at the head
ARROW_ALPHA = 150  # 0..255; keeps the arrows behind the T


def rounded_mask(size, box, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius, fill=255)
    return m


def tile(layer, x, y):
    """One glossy tile with its top-left corner at x, y."""
    n = int(TILE)
    img = Image.new('RGB', (n, n))
    d = ImageDraw.Draw(img)
    for row in range(n):
        t = row / (n - 1)
        d.line([(0, row), (n, row)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TILE_TOP, TILE_BOTTOM)))
    # Diagonal highlight across the top-left corner.
    gloss = Image.new('L', (n, n), 0)
    ImageDraw.Draw(gloss).polygon([(0, 0), (n, 0), (n, n * 0.08), (0, n * 0.52)], fill=110)
    img.paste(Image.new('RGB', (n, n), GLOSS), (0, 0), gloss)
    layer.paste(img, (int(x), int(y)), rounded_mask((n, n), (0, 0, n - 1, n - 1), n * 0.15))


def arrow(draw, start, end):
    """A tapered arc from `start` to `end` degrees (screen angles, clockwise) with a small head."""
    c = S / 2
    steps = 120
    head = math.radians(9)                      # arc length taken by the arrowhead
    a0, a1 = math.radians(start), math.radians(end) - head
    outer, inner = [], []
    for i in range(steps + 1):
        t = i / steps
        a = a0 + (a1 - a0) * t
        half = ARC_W * (0.08 + 0.92 * t) / 2    # thin tail, full width at the head
        outer.append((c + (ARC_R + half) * math.cos(a), c + (ARC_R + half) * math.sin(a)))
        inner.append((c + (ARC_R - half) * math.cos(a), c + (ARC_R - half) * math.sin(a)))
    draw.polygon(outer + inner[::-1], fill=ARROW_ALPHA)
    tip = math.radians(end)
    spread = ARC_W * 1.9
    draw.polygon([
        (c + (ARC_R + spread) * math.cos(a1), c + (ARC_R + spread) * math.sin(a1)),
        (c + (ARC_R - spread) * math.cos(a1), c + (ARC_R - spread) * math.sin(a1)),
        (c + ARC_R * math.cos(tip), c + ARC_R * math.sin(tip)),
    ], fill=ARROW_ALPHA)


def main():
    icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    edge = 0.035 * S
    box = (edge, edge, S - edge, S - edge)
    radius = 0.21 * S
    d = ImageDraw.Draw(icon)
    d.rounded_rectangle(box, radius, fill=BORDER + (255,))
    b = 0.011 * S
    d.rounded_rectangle((box[0] + b, box[1] + b, box[2] - b, box[3] - b), radius - b, fill=BG + (255,))

    arrows = Image.new('L', (S, S), 0)
    ad = ImageDraw.Draw(arrows)
    arrow(ad, 205, 318)
    arrow(ad, 25, 138)
    icon.paste(Image.new('RGBA', (S, S), ARROW + (255,)), (0, 0), arrows)

    # The T: three tiles across, one below the middle, then tilted as a whole.
    t = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    pitch = TILE + GAP
    left = S / 2 - (3 * TILE + 2 * GAP) / 2
    top = S / 2 - (2 * TILE + GAP) / 2
    for col in range(3):
        tile(t, left + col * pitch, top)
    tile(t, left + pitch, top + pitch)
    t = t.rotate(TILT, resample=Image.BICUBIC, center=(S / 2, S / 2))
    icon = Image.alpha_composite(icon, t)

    # Keep everything inside the rounded square.
    alpha = ImageChops.multiply(icon.getchannel('A'), rounded_mask((S, S), box, radius))
    icon.putalpha(alpha)

    os.makedirs(OUT, exist_ok=True)
    icon.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-512.png'))
    icon.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'icon.png'))


if __name__ == '__main__':
    main()
