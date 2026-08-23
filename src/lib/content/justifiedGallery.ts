import type { GalleryImage } from "./types";

// Adaptive justified editorial gallery (2026-08-23) — replaces the
// fixed-fraction block system (full/pair/triple/asymmetric equal
// columns) for Photography specifically. The old system squeezed every
// image in a multi-image block into an equal-width column regardless of
// its own shape, which is exactly what produced the empty/blank areas
// this redesign fixes — a tall portrait next to a wide landscape in an
// equal 50/50 split leaves one of them visually "floating" in unused
// space. Here, row membership is decided here (this file); the actual
// per-image WIDTH within a row is left entirely to CSS (flex-grow
// proportional to each image's own clamped aspect ratio, flex-basis 0)
// in JustifiedPhotoGallery.tsx — no pixel measurement, no client JS, no
// third-party layout library. See that component for the CSS technique
// and why it doesn't need to know real container pixel widths.

// Real aspect ratio clamped so a mis-tagged/extreme outlier can't
// distort a whole row's math — same purpose as FlexiblePhotoGallery's
// own MIN_RATIO/MAX_RATIO, widened slightly (0.5–2.8 vs 0.55–2.4) since
// a justified row absorbs a wide panorama more gracefully than a fixed
// column ever could. This is also the ratio actually applied to the
// image's own display box, so a genuinely extreme original (rare) is
// the one case where this layout very slightly crops rather than
// showing the true ratio — the same accepted tradeoff already made by
// FlexiblePhotoGallery.
const MIN_RATIO = 0.5;
const MAX_RATIO = 2.8;
const MOBILE_SOLO_RATIO = 1.1; // a landscape/square-ish image reads best alone on a narrow screen
const WIDE_BOOST = 1.3; // "wide" hint: this image counts for more of the row's width budget, closing the row sooner
const PORTRAIT_PAIR_TARGET_FACTOR = 0.75; // "portrait-pair" hint: lower the row's width budget so it's more likely to close at just two images

export function clampedAspectRatio(image: GalleryImage): number {
  if (!image.width || !image.height) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, image.width / image.height));
}

export type JustifiedBreakpoint = "mobile" | "tablet" | "desktop";

type BreakpointConfig = {
  // A pure ratio (reference row width ÷ reference row height) — not a
  // pixel value. Used only to decide how many aspect-ratio-units make a
  // "full" row at this breakpoint; the actual rendered width is
  // whatever the real container is, handled by CSS.
  rowRatioTarget: number;
  maxPerRow: number;
};

const BREAKPOINT_CONFIG: Record<JustifiedBreakpoint, BreakpointConfig> = {
  mobile: { rowRatioTarget: 1200 / 460, maxPerRow: 2 },
  tablet: { rowRatioTarget: 760 / 420, maxPerRow: 3 },
  desktop: { rowRatioTarget: 1200 / 480, maxPerRow: 3 },
};

export type JustifiedImage = GalleryImage & { ratio: number };
export type JustifiedRow = { images: JustifiedImage[] };

// Single pass, no reordering, no lookahead mutation — deliberately
// simple (per "avoid an overly complicated page builder"). Every hint
// is a soft nudge to the row-closing threshold, never a hard
// re-sequencing of the admin-authored image order.
export function buildJustifiedRows(images: GalleryImage[], breakpoint: JustifiedBreakpoint): JustifiedRow[] {
  const config = BREAKPOINT_CONFIG[breakpoint];
  const withRatio: JustifiedImage[] = images.map((img) => ({ ...img, ratio: clampedAspectRatio(img) }));
  const rows: JustifiedRow[] = [];
  let i = 0;

  while (i < withRatio.length) {
    const first = withRatio[i];

    if (first.presentation === "featured") {
      rows.push({ images: [first] });
      i += 1;
      continue;
    }

    if (breakpoint === "mobile" && first.ratio >= MOBILE_SOLO_RATIO) {
      rows.push({ images: [first] });
      i += 1;
      continue;
    }

    const rowTarget = first.presentation === "portrait-pair" ? config.rowRatioTarget * PORTRAIT_PAIR_TARGET_FACTOR : config.rowRatioTarget;
    const rowImages: JustifiedImage[] = [first];
    let widthBudget = first.ratio * (first.presentation === "wide" ? WIDE_BOOST : 1);
    let j = i + 1;

    while (j < withRatio.length && rowImages.length < config.maxPerRow && widthBudget < rowTarget) {
      const next = withRatio[j];
      if (next.presentation === "featured") break;
      rowImages.push(next);
      widthBudget += next.ratio * (next.presentation === "wide" ? WIDE_BOOST : 1);
      j += 1;
    }

    rows.push({ images: rowImages });
    i = j;
  }

  return rows;
}
