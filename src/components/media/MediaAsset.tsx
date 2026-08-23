import type { MediaAsset as MediaAssetType } from "@/lib/content/types";
import ResponsiveImage from "./ResponsiveImage";
import MediaPlaceholder from "./MediaPlaceholder";

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
  // Videography's VideoPlayer (2026-08-23) — only ever passed true right
  // after a visitor's own click reveals this component in place of a
  // poster, never on initial page load. Optional/undefined everywhere
  // else, so every existing caller's behavior is unchanged.
  autoPlay?: boolean;
  // Graphic Design case study (2026-08-24) — both optional/additive,
  // passed straight through to ResponsiveImage; every other caller is
  // unaffected. objectFit lets a GD hero show its own true proportions
  // instead of being cropped; quality raises fidelity for fine
  // typography/logo/line-work artwork. Only meaningful for type "image".
  objectFit?: "cover" | "contain";
  quality?: number;
};

const FALLBACK_ASPECT_RATIO = "16/9";

// Best-effort autoplay param for known embed hosts only — never throws
// (mirrors the defensive try/catch pattern in sanityLoader.ts, root-
// caused earlier this session): any URL that isn't a recognized host,
// or that fails to parse, is returned completely unmodified.
function withAutoplayParam(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      u.searchParams.set("autoplay", "1");
    } else if (u.hostname.includes("vimeo.com")) {
      u.searchParams.set("autoplay", "1");
    }
    return u.toString();
  } catch {
    return url;
  }
}

export default function MediaAsset({
  media,
  aspectRatio,
  sizes,
  priority,
  className = "",
  autoPlay = false,
  objectFit,
  quality,
}: MediaAssetProps) {
  const ratio = aspectRatio ?? FALLBACK_ASPECT_RATIO;

  // Content gap (field exists, no asset uploaded yet) rather than a
  // loading/network state — same distinction Avatar makes for a missing
  // photo. Applies to all three media types since the schema allows any
  // of them to reference an unset asset.
  if (!media.url) {
    return <MediaPlaceholder alt={media.alt} aspectRatio={ratio} tone="light" className={className} />;
  }

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
        objectFit={objectFit}
        quality={quality}
      />
    );
  }

  if (media.type === "video") {
    return (
      <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: ratio }}>
        <video
          src={media.url}
          aria-label={media.alt}
          controls
          playsInline
          preload="none"
          autoPlay={autoPlay}
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
        src={autoPlay ? withAutoplayParam(media.url) : media.url}
        title={media.alt}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
