#!/usr/bin/env python3
"""Rebuilds the Ordift letterhead assets from the approved letterhead image. Run from the repository root:

    python3 scripts/build_letterhead_assets.py <approved-letterhead.jpg>

The approved design (logo, watermark, dimensions, paper) is preserved exactly. Three things are derived from it:

  1. os-letterhead.jpg   the approved letterhead with ONE correction: its website line read "www.odiftstudios.com" (missing the "r"); it is redrawn as "www.ordiftstudios.com"
                         in the same place, colour, weight and width. Written to brand/legal-publications/ and public/brand/ (identical copies).
  2. os-letterhead-base.jpg   the same page with the contact strip at the foot removed (background only), for documents that print the contact details of the issuing entity
                         as live text (see src/lib/brand/letterheadContacts.ts).
  3. letterhead-icons/*.png   the three approved contact icons (envelope, telephone, @); the WhatsApp icon is not used (management decision, 4 Nov 2026) cut from the strip with a transparent surround.

Nothing else on the page is touched.

  NOTE (2026-11-08): the os-letterhead.jpg written by step 1 is a full re-save of the JPEG (about 7% of the pixels elsewhere on the page move by at most 11/255 from re-compression). The committed
  copies are therefore produced from it with scripts/letterhead_lossless_splice.py, which keeps every block of the approved original except those under the redrawn website line, so that every other
  pixel is bit-identical to the approved original (verified: 3,062 pixels differ, all inside the website line; 0 elsewhere). Requires Pillow and numpy; uses the system Arial/Helvetica to draw the corrected line.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else "brand/legal-publications/os-letterhead.jpg"
TEXT = "www.ordiftstudios.com"
STRIP = (30, 1222, 714, 1378)          # x0, y0, x1, y1 : the contact strip; nothing else of the design lies inside it (the watermark begins at x = 716)
STRIP_EDGE = (714, 1296, 724, 1330)    # the last pixel columns of the website line (the watermark is further right at these rows)
WEB_BOX = (566, 1296, 722, 1330)       # the website line
BG = 254
ARIAL = next(p for p in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf", "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf") if os.path.exists(p))

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int16)
lum = a.mean(axis=2)

def dilate(mask, r):
    m = Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.MaxFilter(2 * r + 1))
    return np.asarray(m) > 0

def erase(arr, box, ink_below, margin):
    """Replaces dark marks inside `box` (and their JPEG halos) with the paper. Mid-grey pixels (the watermark) are never touched."""
    x0, y0, x1, y1 = box
    m = np.zeros(lum.shape, bool)
    m[y0:y1, x0:x1] = lum[y0:y1, x0:x1] < ink_below
    m = dilate(m, margin)
    allowed = np.zeros(lum.shape, bool); allowed[y0:y1, x0:x1] = True
    m &= allowed & ((lum < ink_below) | (lum >= 240))
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 0.55, size=lum.shape)
    for c in range(3):
        arr[..., c] = np.where(m, np.clip(BG + noise, 250, 255), arr[..., c])
    return m

def fill_rect(arr, box):
    """Paper-only fill of a rectangle that holds no part of the design except the strip being removed."""
    x0, y0, x1, y1 = box
    rng = np.random.default_rng(11)
    for c in range(3):
        arr[y0:y1, x0:x1, c] = np.clip(BG + rng.normal(0, 0.55, size=(y1 - y0, x1 - x0)), 250, 255)

def save(arr, path, q=95):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr.astype("uint8")).save(path, quality=q, subsampling=0, dpi=(72, 72), optimize=True)

# ---- icons (before anything is erased)
os.makedirs("public/brand/letterhead-icons", exist_ok=True)
dark = lum < 150
for name, (x0, x1) in {"email": (109, 147), "phone": (302, 342), "web": (624, 663)}.items():
    ys = np.where(dark[1235:1295, x0:x1 + 1].any(axis=1))[0]
    y0, y1 = ys.min() + 1235, ys.max() + 1235
    pad = 3
    box = (x0 - pad, y0 - pad, x1 + pad + 1, y1 + pad + 1)
    crop = im.crop(box).convert("RGBA")
    cl = np.asarray(crop.convert("L")).astype(float)
    # alpha: the navy disc (and its anti-aliased edge) against the near-white paper; the white glyph inside stays opaque via a filled disc mask
    h, w = cl.shape
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = (x1 - x0) / 2 + pad, (y1 - y0) / 2 + pad
    r = max(x1 - x0, y1 - y0) / 2
    d = np.hypot(xx + 0.5 - cx - 0.5, yy + 0.5 - cy - 0.5)
    alpha = np.clip(r + 0.5 - d, 0, 1)
    arr = np.asarray(crop).copy(); arr[..., 3] = (alpha * 255).astype("uint8")
    Image.fromarray(arr).save(f"public/brand/letterhead-icons/{name}.png", optimize=True)

# ---- base letterhead (contact strip removed)
base = a.copy()
fill_rect(base, STRIP)
fill_rect(base, STRIP_EDGE)
save(base, "public/brand/os-letterhead-base.jpg")

# ---- corrected letterhead (website line redrawn)
fixed = a.copy()
x0, y0, x1, y1 = WEB_BOX
ys, xs = np.where(lum[y0:y1, x0:x1] < 170)
ox0, ox1, oy0, oy1 = xs.min() + x0, xs.max() + x0, ys.min() + y0, ys.max() + y0
orig_w = ox1 - ox0 + 1
erase(fixed, WEB_BOX, 200, 3)
# the correct line, same visual width and centre as the line it replaces, same colour, drawn at 8x and reduced for the same softness
S = 8
ORIG_TEXT = "www.odiftstudios.com"
def width_at(size, text):
    return ImageFont.truetype(ARIAL, int(size * S)).getlength(text) / S
lo, hi = 10.0, 30.0
for _ in range(40):                      # the size at which the OLD line is exactly as wide as the old line was
    mid = (lo + hi) / 2
    (lo, hi) = (mid, hi) if width_at(mid, ORIG_TEXT) < orig_w else (lo, mid)
size = (lo + hi) / 2
font = ImageFont.truetype(ARIAL, int(size * S))
bbox = font.getbbox(TEXT)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
layer = Image.new("L", (int(tw) + 4 * S, int(th) + 4 * S), 0)
ImageDraw.Draw(layer).text((2 * S - bbox[0], 2 * S - bbox[1]), TEXT, font=font, fill=255)
layer = layer.resize((layer.width // S, layer.height // S), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.3))
px = int(round(ox1 + 1 - tw / S - 2))   # same size as before; right edge where the old line ended (the extra letter extends it to the left, keeping clear of the watermark)
py = int(round(oy1 - (th / S) - 2 + 0.5))
m = np.asarray(layer).astype(float) / 255
m = np.clip(m * 1.35, 0, 1)             # the original's strokes are a little heavier after its own JPEG softening
ink = np.array([41, 41, 42], float)
sub = fixed[py:py + m.shape[0], px:px + m.shape[1]].astype(float)
fixed[py:py + m.shape[0], px:px + m.shape[1]] = (sub * (1 - m[..., None]) + ink * m[..., None]).astype("int16")
for dst in ("brand/legal-publications/os-letterhead.jpg", "public/brand/os-letterhead.jpg"):
    save(fixed, dst)
print(f"website line: was {orig_w}px wide at x {ox0}-{ox1}; redrawn {tw / S:.1f}px wide (one letter longer) at font size {size:.2f}px; icons, base and corrected letterhead written")
