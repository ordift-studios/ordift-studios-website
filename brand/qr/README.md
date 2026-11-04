# ORDIFT STUDIOS: permanent master QR code (digital business card)

**Destination (encoded exactly, nothing else):** `https://ordiftstudios.com/connect`

Status: MASTER FILES. Generated 2026-11-04 after `/connect` went live. **Not yet printed or distributed.**

| File | What it is |
|---|---|
| `ordift-studios-connect-qr.png` | Print/digital master. 3280 x 3280 px, 1-bit black and white, 80 px per module, tagged 600 dpi. |
| `ordift-studios-connect-qr.svg` | Vector master for professional printing. Filled shapes only (no strokes), viewBox 41 x 41, black #000000 on white #ffffff. |

## Specification

- QR Code Model 2, **version 4** (33 x 33 modules), byte mode, **error correction level H** (about 30% of the code can be damaged or covered).
- **Quiet zone: 4 modules on every side** (the standard's minimum), included in both files. Do not crop it, and keep other artwork out of it.
- Black on white, 21:1 contrast. Static code: no tracking service, shortener, subscription or redirect. It does not contain contact details or photographs, so it stays valid when the page's photographs, design or contact details change.
- Both files hold the identical module matrix (561 dark modules; verified module by module).

## Using it

- Print the symbol (the 33 x 33 area, without the quiet zone) at **20 mm to 25 mm** on a business card (minimum 15 mm). Keep the quiet zone clear around it, at least 4 modules (about 3 mm at 25 mm).
- Keep it black on white (or very dark on very light). Do not invert, recolour, stretch, add a logo over it, round the modules or add effects.
- Scale the SVG for print; use the PNG for screens and documents.
- **The destination must keep working:** never remove or rename `/connect`. The page itself can change freely.
- Test a printed proof with real phones before any print run.

## Integrity (SHA-256)

```
ba8346b6c722b2f3fdfb424ebac7c8c637c89c42b6ff8fa2e25f59b8f2905fcc  ordift-studios-connect-qr.png
028172c9b4753c7da76905d94185553180cdb81f72cacd53bef3f39895e6cec2  ordift-studios-connect-qr.svg
```

## How it was made (reproducible)

Python segno 1.6.6: `segno.make("https://ordiftstudios.com/connect", error="h", micro=False, boost_error=False)`; PNG `scale=80, border=4, dark="#000000", light="#ffffff", dpi=600`; the SVG is written from the same matrix as one white rectangle plus one black filled path. Generated outside the website build; nothing here is served by the website (this folder is not under `public/`).
