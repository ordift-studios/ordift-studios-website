import Image from "next/image";

// The one component every real image on the site should render through
// (see MEDIA_ARCHITECTURE.md). Wraps next/image with:
// - automatic aspect-ratio handling: a wrapper div sized from the
//   image's own Sanity-reported dimensions unless `aspectRatio` is
//   given explicitly, so layout never shifts once the image loads
// - a CDN-swappable loader (configured globally as images.loaderFile in
//   next.config.ts — see src/lib/media/sanityLoader.ts) instead of
//   Next's default optimizer, so responsive `sizes`/lazy-loading/blur-up
//   all still work but the actual resizing happens at the image host
// - a blur-up placeholder from Sanity's generated LQIP when available —
//   this is the "loading state": no spinner, no extra client JS, just a
//   soft preview of the real image that sharpens in place
// - lazy loading by default (native, via next/image); pass `priority`
//   for the one or two images that are above the fold on first paint
export type ResponsiveImageProps = {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  lqip?: string | null;
  /** CSS aspect-ratio value, e.g. "4/3", "1/1", "21/9". Overrides the ratio derived from width/height. */
  aspectRatio?: string;
  /** Responsive sizes attribute — defaults to a sensible full-bleed-to-grid-tile guess. */
  sizes?: string;
  /** Set for the one or two images visible without scrolling; skips lazy-loading. */
  priority?: boolean;
  className?: string;
  objectFit?: "cover" | "contain";
  /** Extra wrapper styles — e.g. a fixed pixel width/height for a small avatar, where aspect-ratio alone isn't enough to constrain size. */
  style?: React.CSSProperties;
};

const DEFAULT_SIZES = "(min-width: 1024px) 50vw, 100vw";
const FALLBACK_ASPECT_RATIO = "4/3";

export default function ResponsiveImage({
  src,
  alt,
  width,
  height,
  lqip,
  aspectRatio,
  sizes = DEFAULT_SIZES,
  priority = false,
  className = "",
  objectFit = "cover",
  style,
}: ResponsiveImageProps) {
  const ratio = aspectRatio ?? (width && height ? `${width}/${height}` : FALLBACK_ASPECT_RATIO);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: ratio, ...style }}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        placeholder={lqip ? "blur" : "empty"}
        blurDataURL={lqip ?? undefined}
        className={objectFit === "contain" ? "object-contain" : "object-cover"}
      />
    </div>
  );
}
