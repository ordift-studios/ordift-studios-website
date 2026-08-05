import type { GalleryImage } from "@/lib/content/types";
import ResponsiveImage from "./ResponsiveImage";

// Reusable grid gallery — used today by Portfolio's Final Gallery and
// Behind the Scenes gallery, and Workshop's Gallery (they all share the
// same GalleryImage shape). Same component will serve Team Members,
// Talent portfolios, Vendor galleries, etc. as those get built.
export type GalleryProps = {
  images: GalleryImage[];
  columns?: 2 | 3 | 4;
  aspectRatio?: string;
  className?: string;
  /** Override the responsive sizes hint — needed wherever the gallery
   * doesn't span the full viewport width (see call site comments). Falls
   * back to a full-bleed-grid guess based on `columns`. */
  sizes?: string;
};

const COLUMN_CLASSES: Record<2 | 3 | 4, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export default function Gallery({ images, columns = 3, aspectRatio = "1/1", className = "", sizes }: GalleryProps) {
  if (images.length === 0) return null;

  // Repeated identical captions (the same sentence on 5-7 photos in a row)
  // read as unfinished rather than curated — a real content pattern found
  // during the 2026-08-05 presentation review, not a one-off typo. Rather
  // than editing an editor's authored text, only the *first* photo bearing
  // a given caption shows it; later photos with the exact same caption
  // stay silently uncaptioned. Unique/one-off captions are unaffected.
  const seenCaptions = new Set<string>();

  return (
    <div className={`grid ${COLUMN_CLASSES[columns]} gap-4 ${className}`}>
      {images.map((image) => {
        const trimmedCaption = image.caption?.trim();
        const showCaption = Boolean(trimmedCaption) && !seenCaptions.has(trimmedCaption!);
        if (trimmedCaption) seenCaptions.add(trimmedCaption);

        return (
          <figure key={image.id}>
            <ResponsiveImage
              src={image.url}
              alt={image.alt}
              width={image.width}
              height={image.height}
              lqip={image.lqip}
              aspectRatio={aspectRatio}
              sizes={sizes ?? `(min-width: 640px) ${Math.round(100 / columns)}vw, 50vw`}
              className="rounded-lg"
            />
            {showCaption && (
              <figcaption className="mt-2 font-sans text-caption text-ordift-ink-muted">{trimmedCaption}</figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}
