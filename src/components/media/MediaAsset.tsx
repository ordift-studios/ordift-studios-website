import type { MediaAsset as MediaAssetType } from "@/lib/content/types";
import ResponsiveImage from "./ResponsiveImage";

// Renders whichever of image / uploaded video / embedded video a
// MediaAsset actually is, so every call site (Portfolio hero, Portfolio
// Videos, Journal video posts, future Talent/Vendor media) can pass a
// MediaAsset straight through without its own type === "..." branching.
export type MediaAssetProps = {
  media: MediaAssetType;
  aspectRatio?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
};

const FALLBACK_ASPECT_RATIO = "16/9";

export default function MediaAsset({ media, aspectRatio, sizes, priority, className = "" }: MediaAssetProps) {
  if (media.type === "image") {
    return (
      <ResponsiveImage
        src={media.url}
        alt={media.alt}
        width={media.width}
        height={media.height}
        lqip={media.lqip}
        aspectRatio={aspectRatio}
        sizes={sizes}
        priority={priority}
        className={className}
      />
    );
  }

  const ratio = aspectRatio ?? FALLBACK_ASPECT_RATIO;

  if (media.type === "video") {
    return (
      <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: ratio }}>
        <video
          src={media.url}
          aria-label={media.alt}
          controls
          playsInline
          preload="none"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }

  // "embed" — url is already the embeddable link (YouTube/Vimeo "embed/"
  // form etc.), per the schema's own contract (see mediaAsset.ts).
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: ratio }}>
      <iframe
        src={media.url}
        title={media.alt}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
