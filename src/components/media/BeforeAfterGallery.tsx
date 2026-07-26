import type { BeforeAfterPair } from "@/lib/content/types";
import MediaAsset from "./MediaAsset";

// Reusable paired-image grid — currently only Portfolio's Before & After
// gallery, but built generically (a list of {before, after, caption}
// pairs) so any future comparison use case (Talent transformation
// shoots, retouching case studies) can reuse it.
export type BeforeAfterGalleryProps = {
  pairs: BeforeAfterPair[];
  className?: string;
};

export default function BeforeAfterGallery({ pairs, className = "" }: BeforeAfterGalleryProps) {
  if (pairs.length === 0) return null;

  return (
    <div className={`space-y-8 ${className}`}>
      {pairs.map((pair) => (
        <figure key={pair.id}>
          <div className="grid grid-cols-2 gap-2">
            <MediaAsset media={pair.before} aspectRatio="1/1" className="rounded-lg" />
            <MediaAsset media={pair.after} aspectRatio="1/1" className="rounded-lg" />
          </div>
          {pair.caption && (
            <figcaption className="mt-2 font-sans text-caption text-ordift-ink-muted text-center">
              {pair.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
