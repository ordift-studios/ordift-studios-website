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
};

const COLUMN_CLASSES: Record<2 | 3 | 4, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export default function Gallery({ images, columns = 3, aspectRatio = "1/1", className = "" }: GalleryProps) {
  if (images.length === 0) return null;

  return (
    <div className={`grid ${COLUMN_CLASSES[columns]} gap-4 ${className}`}>
      {images.map((image) => (
        <figure key={image.id}>
          <ResponsiveImage
            src={image.url}
            alt={image.alt}
            width={image.width}
            height={image.height}
            lqip={image.lqip}
            aspectRatio={aspectRatio}
            sizes={`(min-width: 640px) ${Math.round(100 / columns)}vw, 50vw`}
            className="rounded-lg"
          />
          {image.caption && (
            <figcaption className="mt-2 font-sans text-caption text-ordift-ink-muted">{image.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
