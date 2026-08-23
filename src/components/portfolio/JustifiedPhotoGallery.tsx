import type { GalleryImage } from "@/lib/content/types";
import { buildJustifiedRows, type JustifiedBreakpoint, type JustifiedImage } from "@/lib/content/justifiedGallery";
import InteractiveFigure from "./InteractiveFigure";

// Photography's adaptive justified editorial gallery (2026-08-23) —
// replaces the fixed-fraction block engine (FlexiblePhotoGallery) for
// Photography only; Videography and Graphic Design keep using
// FlexiblePhotoGallery entirely unchanged (this file doesn't touch it).
//
// Row membership (which images share a row) is decided once per
// breakpoint tier by buildJustifiedRows (see justifiedGallery.ts) using
// a reference ratio, not real pixels. The actual per-image WIDTH within
// a row needs no JS measurement at all: each image is a flex item with
// `flex-grow: ratio; flex-basis: 0`, and its own box also carries
// `aspect-ratio: ratio` (via InteractiveFigure → ResponsiveImage). Flex
// distributes width proportional to each item's grow factor; since
// every item's own aspect-ratio matches its grow factor, the resulting
// row is self-consistent — every image lands at the exact height the
// row settles on, at its own true (clamped) proportions, filling
// exactly 100% of the real container width, at any real viewport size,
// with zero JS. This is the whole trick that makes rows "fill cleanly
// with no blank holes" without measuring anything.
//
// Three breakpoint tiers are rendered server-side and swapped with
// Tailwind's `md:`/`lg:` display utilities (matching this codebase's
// existing responsive-variant pattern, e.g. NavBar's mobile/desktop
// split) rather than a client-side ResizeObserver — no layout shift on
// load, no extra "use client" boundary for the gallery itself. The
// tradeoff is documented in the redesign report: three copies of the
// gallery markup exist in the DOM at once (two hidden via CSS), which
// evergreen browsers do not fetch images for.
const TIER_VISIBILITY: Record<JustifiedBreakpoint, string> = {
  mobile: "md:hidden",
  tablet: "hidden md:block lg:hidden",
  desktop: "hidden lg:block",
};

function JustifiedTier({
  images,
  breakpoint,
  onImageClick,
}: {
  images: GalleryImage[];
  breakpoint: JustifiedBreakpoint;
  onImageClick?: (index: number) => void;
}) {
  const rows = buildJustifiedRows(images, breakpoint);
  const flatIndexById = new Map(images.map((img, idx) => [img.id, idx]));

  return (
    <div className={`flex flex-col ${TIER_VISIBILITY[breakpoint]}`}>
      {rows.map((row) => (
        <div key={row.images.map((img) => img.id).join("-")} className="flex">
          {row.images.map((image: JustifiedImage) => (
            <div key={image.id} className="min-w-0" style={{ flexGrow: image.ratio, flexShrink: 1, flexBasis: 0 }}>
              <InteractiveFigure
                image={image}
                aspectRatio={String(image.ratio)}
                sizes="(min-width: 1024px) 45vw, 100vw"
                onClick={onImageClick ? () => onImageClick(flatIndexById.get(image.id) ?? 0) : undefined}
                revealOnScroll
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function JustifiedPhotoGallery({
  images,
  onImageClick,
}: {
  images: GalleryImage[];
  onImageClick?: (index: number) => void;
}) {
  if (images.length === 0) return null;
  return (
    <>
      <JustifiedTier images={images} breakpoint="mobile" onImageClick={onImageClick} />
      <JustifiedTier images={images} breakpoint="tablet" onImageClick={onImageClick} />
      <JustifiedTier images={images} breakpoint="desktop" onImageClick={onImageClick} />
    </>
  );
}
