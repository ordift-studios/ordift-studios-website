#!/usr/bin/env python3
"""
Standalone generator for the ORDIFT STUDIOS QR code (https://ordiftstudios.com/connect).

NOT part of the website and NOT installed by it: the website has no QR dependency. Run it on a developer machine, in a throwaway virtual environment:

    python3 -m venv ~/ordift-qr-tool && ~/ordift-qr-tool/bin/pip install segno
    ~/ordift-qr-tool/bin/python scripts/connect-qr/make_connect_qr.py --out-dir ~/Desktop/ordift-qr

What it makes (all encode the SAME permanent URL, so the printed code never needs replacing when the page's photographs or contact details change):
  ordift-connect-qr.svg            vector, for print and presentations (scales without loss)
  ordift-connect-qr-1200.png       1200 px square, navy on white
  ordift-connect-qr-3000.png       3000 px square, navy on white (large print)
  ordift-connect-qr-reversed.svg   white on navy, for dark backgrounds

Safety: it refuses to produce final files unless the landing page is live (the URL answers HTTP 200). Use --draft to make clearly labelled DRAFT files for layout work before that;
draft files are named *-DRAFT-DO-NOT-PRINT and must not be distributed. Navy (#0b1220) on white is far above the contrast scanners need; the quiet zone is 4 modules (the standard
minimum); error correction is level H (about 30% of the code can be damaged or covered).
"""
import argparse, os, sys, urllib.request

URL = "https://ordiftstudios.com/connect"
NAVY, WHITE = "#0b1220", "#ffffff"


def page_is_live(url: str) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ORDIFT STUDIOS QR check)"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except Exception:
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out-dir", required=True, help="where to write the files (outside the repository)")
    ap.add_argument("--draft", action="store_true", help="make DRAFT files without checking that the page is live (never distribute these)")
    a = ap.parse_args()
    try:
        import segno
    except ImportError:
        print("The 'segno' package is not installed. See the instructions at the top of this file.", file=sys.stderr)
        return 2
    if not a.draft and not page_is_live(URL):
        print(f"{URL} does not answer HTTP 200 yet, so no final QR code was made. Publish and check the page first, or use --draft for layout work.", file=sys.stderr)
        return 1
    tag = "-DRAFT-DO-NOT-PRINT" if a.draft else ""
    os.makedirs(a.out_dir, exist_ok=True)
    qr = segno.make(URL, error="h", micro=False)
    out = lambda name: os.path.join(a.out_dir, name)
    qr.save(out(f"ordift-connect-qr{tag}.svg"), scale=10, border=4, dark=NAVY, light=WHITE, xmldecl=True, svgns=True, title="ORDIFT STUDIOS", desc=URL)
    qr.save(out(f"ordift-connect-qr-reversed{tag}.svg"), scale=10, border=4, dark=WHITE, light=NAVY, xmldecl=True, svgns=True, title="ORDIFT STUDIOS", desc=URL)
    modules = qr.symbol_size(border=4)[0]
    for px in (1200, 3000):
        qr.save(out(f"ordift-connect-qr-{px}{tag}.png"), scale=max(1, px // modules), border=4, dark=NAVY, light=WHITE)
    print(f"{'DRAFT ' if a.draft else ''}QR code for {URL} written to {a.out_dir} ({modules}x{modules} modules incl. quiet zone, error correction H)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
