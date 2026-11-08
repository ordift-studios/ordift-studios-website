#!/usr/bin/env python3
"""Corrects the website line of the approved Ordift letterhead WITHOUT re-encoding the rest of the picture.

The approved letterhead's website line read "www.odiftstudios.com" (missing the "r"). A normal save would re-compress the whole JPEG and nudge ~7% of the pixels everywhere. This script instead decodes the
JPEG to its quantised DCT blocks, replaces ONLY the blocks under the corrected website line with blocks computed from the corrected pixels, and writes everything else back coefficient-for-coefficient, so every
pixel outside those blocks is bit-identical to the approved original.

    python3 scripts/letterhead_lossless_splice.py <approved-original.jpg> <redrawn-letterhead.jpg> <output.jpg>

  approved-original.jpg   the letterhead exactly as approved (sha256 bc9324df...eefab)
  redrawn-letterhead.jpg  the same page with the website line redrawn as www.ordiftstudios.com (scripts/build_letterhead_assets.py writes it)
  output.jpg              the corrected letterhead: original blocks everywhere except under the redrawn line

Requires numpy and Pillow. The first half of this file is a small baseline-JPEG coefficient codec (Huffman, 8-bit, sequential, restart intervals); it was verified by a decode -> encode round trip that
reproduces the original file byte for byte before it is used.
"""
# A small, self-contained baseline-JPEG coefficient codec (Huffman, 8-bit, sequential, with restart intervals), written for one purpose: to replace the DCT blocks under two overlays and leave every
# other block's coefficients EXACTLY as they were (no decode / re-encode of the rest of the picture, so no generation loss). Verified by a round trip (decode -> encode -> compare) before it is used.
import numpy as np

ZZ = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63]

class Huff:
    def __init__(self, bits, vals):
        self.bits, self.vals = bits, vals
        self.dec = {}; self.enc = {}
        code = 0; k = 0
        for length in range(1, 17):
            for _ in range(bits[length - 1]):
                self.dec[(length, code)] = vals[k]; self.enc[vals[k]] = (code, length); code += 1; k += 1
            code <<= 1

def parse(b):
    """Splits the file into: header bytes (everything before the scan data), the parsed tables, and the entropy-coded data."""
    assert b[:2] == b"\xff\xd8"
    i = 2; info = {"dqt": {}, "dht": {}, "dri": 0}
    while True:
        assert b[i] == 0xFF
        m = b[i + 1]; ln = int.from_bytes(b[i + 2:i + 4], "big"); body = b[i + 4:i + 2 + ln]
        if m == 0xDB:
            p = 0
            while p < len(body):
                pq, tid = body[p] >> 4, body[p] & 15; p += 1
                assert pq == 0
                info["dqt"][tid] = list(body[p:p + 64]); p += 64
        elif m == 0xC0:
            info["h"], info["w"], nc = int.from_bytes(body[1:3], "big"), int.from_bytes(body[3:5], "big"), body[5]
            info["comps"] = [(body[6 + 3 * k], body[7 + 3 * k] >> 4, body[7 + 3 * k] & 15, body[8 + 3 * k]) for k in range(nc)]   # (id, h, v, quant table)
        elif m in (0xC1, 0xC2, 0xC3):
            raise ValueError("not a baseline JPEG")
        elif m == 0xC4:
            p = 0
            while p < len(body):
                tc, th = body[p] >> 4, body[p] & 15; bits = list(body[p + 1:p + 17]); n = sum(bits)
                info["dht"][(tc, th)] = Huff(bits, list(body[p + 17:p + 17 + n])); p += 17 + n
        elif m == 0xDD:
            info["dri"] = int.from_bytes(body[:2], "big")
        elif m == 0xDA:
            ns = body[0]; info["scan"] = [(body[1 + 2 * k], body[2 + 2 * k] >> 4, body[2 + 2 * k] & 15) for k in range(ns)]   # (comp id, dc table, ac table)
            header = b[:i + 2 + ln]; data = b[i + 2 + ln:]
            return header, info, data
        i += 2 + ln

def split_segments(data):
    """Entropy data -> list of (unstuffed bytes) per restart interval; returns also the trailing bytes after EOI."""
    segs = []; cur = bytearray(); i = 0
    while i < len(data):
        c = data[i]
        if c == 0xFF:
            n = data[i + 1]
            if n == 0x00: cur.append(0xFF); i += 2; continue
            if 0xD0 <= n <= 0xD7: segs.append(bytes(cur)); cur = bytearray(); i += 2; continue
            if n == 0xD9: segs.append(bytes(cur)); return segs, data[i:]
            raise ValueError("unexpected marker in scan")
        cur.append(c); i += 1
    segs.append(bytes(cur)); return segs, b""

def decode(b):
    header, info, data = parse(b)
    W, H = info["w"], info["h"]
    comps = info["comps"]; hmax = max(c[1] for c in comps); vmax = max(c[2] for c in comps)
    mcux = -(-W // (8 * hmax)); mcuy = -(-H // (8 * vmax))
    scan = {c[0]: c for c in info["scan"]}
    blocks = {}                                         # comp id -> array (rows, cols, 64) in natural (not zig-zag) order, quantized
    for cid, h, v, tq in comps: blocks[cid] = np.zeros((mcuy * v, mcux * h, 64), np.int16)
    segs, tail = split_segments(data)
    ri = info["dri"] or mcux * mcuy
    assert len(segs) == -(-mcux * mcuy // ri), (len(segs), mcux * mcuy, ri)
    mcu = 0
    for seg in segs:
        bits = np.unpackbits(np.frombuffer(seg, np.uint8)).tolist(); pos = 0; pred = {c[0]: 0 for c in comps}
        for _ in range(min(ri, mcux * mcuy - mcu)):
            my, mx = divmod(mcu, mcux)
            for cid, h, v, tq in comps:
                _, tdc, tac = scan[cid]; hd = info["dht"][(0, tdc)].dec; ha = info["dht"][(1, tac)].dec
                for by in range(v):
                    for bx in range(h):
                        blk = blocks[cid][my * v + by, mx * h + bx]
                        # DC
                        code = 0; length = 0
                        while True:
                            code = (code << 1) | bits[pos]; pos += 1; length += 1
                            s = hd.get((length, code))
                            if s is not None: break
                            assert length < 16
                        if s:
                            val = int("".join(map(str, bits[pos:pos + s])), 2); pos += s
                            if val < (1 << (s - 1)): val -= (1 << s) - 1
                        else: val = 0
                        pred[cid] += val; blk[0] = pred[cid]
                        k = 1
                        while k < 64:
                            code = 0; length = 0
                            while True:
                                code = (code << 1) | bits[pos]; pos += 1; length += 1
                                rs = ha.get((length, code))
                                if rs is not None: break
                                assert length < 16
                            r, s = rs >> 4, rs & 15
                            if s == 0:
                                if r == 15: k += 16; continue
                                break
                            k += r
                            val = int("".join(map(str, bits[pos:pos + s])), 2); pos += s
                            if val < (1 << (s - 1)): val -= (1 << s) - 1
                            blk[ZZ[k]] = val; k += 1
            mcu += 1
    return header, info, blocks, tail

def encode(header, info, blocks, tail):
    W, H = info["w"], info["h"]; comps = info["comps"]; hmax = max(c[1] for c in comps); vmax = max(c[2] for c in comps)
    mcux = -(-W // (8 * hmax)); mcuy = -(-H // (8 * vmax)); scan = {c[0]: c for c in info["scan"]}
    ri = info["dri"] or mcux * mcuy
    out = bytearray(); mcu = 0; rst = 0
    total = mcux * mcuy
    while mcu < total:
        acc = 0; nb = 0; buf = bytearray(); pred = {c[0]: 0 for c in comps}
        def put(code, length):
            nonlocal acc, nb
            acc = (acc << length) | code; nb += length
            while nb >= 8:
                nb -= 8; byte = (acc >> nb) & 0xFF; buf.append(byte)
                if byte == 0xFF: buf.append(0)
            acc &= (1 << nb) - 1
        for _ in range(min(ri, total - mcu)):
            my, mx = divmod(mcu, mcux)
            for cid, h, v, tq in comps:
                _, tdc, tac = scan[cid]; ed = info["dht"][(0, tdc)].enc; ea = info["dht"][(1, tac)].enc
                for by in range(v):
                    for bx in range(h):
                        blk = blocks[cid][my * v + by, mx * h + bx]
                        diff = int(blk[0]) - pred[cid]; pred[cid] = int(blk[0])
                        s = abs(diff).bit_length(); put(*ed[s])
                        if s: put(diff if diff > 0 else diff + (1 << s) - 1, s)
                        run = 0
                        for k in range(1, 64):
                            c = int(blk[ZZ[k]])
                            if c == 0: run += 1; continue
                            while run > 15: put(*ea[0xF0]); run -= 16
                            s = abs(c).bit_length(); put(*ea[(run << 4) | s]); put(c if c > 0 else c + (1 << s) - 1, s); run = 0
                        if run: put(*ea[0x00])
            mcu += 1
        if nb: put((1 << (8 - nb)) - 1, 8 - nb)                      # pad the last byte with 1-bits
        out += buf
        if mcu < total: out += bytes([0xFF, 0xD0 + rst]); rst = (rst + 1) & 7
    return header + bytes(out) + tail


import sys
from PIL import Image

def dct_matrix():
    n = 8; m = np.zeros((n, n))
    for k in range(n):
        for i in range(n): m[k, i] = (np.sqrt(1 / n) if k == 0 else np.sqrt(2 / n)) * np.cos((2 * i + 1) * k * np.pi / (2 * n))
    return m
DM = dct_matrix()
def fdct_quant(block_pixels, qtable_zz):
    q = np.zeros(64, np.float64)
    for k, idx in enumerate(ZZ): q[idx] = qtable_zz[k]
    d = (DM @ (block_pixels.astype(np.float64) - 128.0) @ DM.T).reshape(64)
    return np.rint(d / q).astype(np.int16)

def to_ycc(rgb):
    r, g, b = (rgb[..., i].astype(np.float64) for i in range(3))
    return np.stack([0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b], axis=-1)

def main(orig_path, redrawn_path, out_path):
    raw = open(orig_path, "rb").read()
    header, info, blocks, tail = decode(raw)
    assert encode(header, info, blocks, tail) == raw, "codec round trip does not reproduce the original: refusing to continue"
    o = np.asarray(Image.open(orig_path).convert("RGB")).astype(int); c = np.asarray(Image.open(redrawn_path).convert("RGB")).astype(int)
    assert o.shape == c.shape
    changed = np.abs(o - c).max(axis=2) > 12                     # the redrawn text; smaller differences are only re-compression noise and are ignored
    ys, xs = np.where(changed)
    pad = 3
    y0, y1, x0, x1 = max(ys.min() - pad, 0), ys.max() + pad + 1, max(xs.min() - pad, 0), xs.max() + pad + 1
    box = np.zeros(changed.shape, bool); box[y0:y1, x0:x1] = True
    q = np.where(box[..., None], np.where((np.abs(o - c).max(axis=2) > 0)[..., None], c, o), o)   # redrawn pixels inside the box, original pixels everywhere else
    ycc = to_ycc(q)
    comps = info["comps"]; hmax = max(cc[1] for cc in comps); vmax = max(cc[2] for cc in comps)
    touched = 0
    for idx, (cid, h, v, tq) in enumerate(comps):
        plane = ycc[..., idx]; sx, sy = hmax // h, vmax // v
        if sx > 1 or sy > 1:
            H, W = plane.shape; Hc, Wc = -(-H // sy), -(-W // sx)
            pad_plane = np.pad(plane, ((0, Hc * sy - H), (0, Wc * sx - W)), mode="edge")
            plane = pad_plane.reshape(Hc, sy, Wc, sx).mean(axis=(1, 3))
        qt = info["dqt"][tq]; rows, cols = blocks[cid].shape[:2]
        by0, by1 = (y0 // sy) // 8, ((y1 - 1) // sy) // 8; bx0, bx1 = (x0 // sx) // 8, ((x1 - 1) // sx) // 8
        for by in range(by0, by1 + 1):
            for bx in range(bx0, bx1 + 1):
                blk = plane[by * 8:by * 8 + 8, bx * 8:bx * 8 + 8]
                if blk.shape != (8, 8): continue
                blocks[cid][by, bx] = fdct_quant(blk, qt); touched += 1
    open(out_path, "wb").write(encode(header, info, blocks, tail))
    print(f"replaced {touched} DCT blocks under the redrawn line (pixels x {x0}-{x1}, y {y0}-{y1}); all other blocks are unchanged")

if __name__ == "__main__":
    if len(sys.argv) != 4: sys.exit(__doc__)
    main(*sys.argv[1:])
