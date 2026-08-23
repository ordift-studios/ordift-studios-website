"use client";

import { useEffect, useRef, useState } from "react";
import ResponsiveImage from "@/components/media/ResponsiveImage";
import type { GalleryImage } from "@/lib/content/types";

// Photography detail redesign (2026-08-23) — the interactive variant of
// FlexiblePhotoGallery's own Figure: click-to-open-lightbox, a subtle
// hover scale, and a one-time fade/rise reveal as the image enters the
// viewport. Kept in its own "use client" file rather than adding
// hooks/browser APIs to FlexiblePhotoGallery.tsx itself, so that file
// stays exactly as safely server-renderable as it is today for
// Videography/Graphic Design, which never import this component and are
// therefore entirely unaffected by its existence.
export default function InteractiveFigure({
  image,
  aspectRatio,
  sizes,
  priority,
  className,
  onClick,
  revealOnScroll,
}: {
  image: GalleryImage;
  aspectRatio: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  onClick?: () => void;
  revealOnScroll?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(!revealOnScroll);

  useEffect(() => {
    if (!revealOnScroll || !ref.current) return;
    // No JS-side prefers-reduced-motion early-exit here: the
    // motion-reduce: CSS override below already forces the element
    // fully visible regardless of `revealed`, so the observer can just
    // run unconditionally — setState only ever happens inside its
    // callback (a subscription to an external system), never
    // synchronously in the effect body.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [revealOnScroll]);

  const revealClass = revealed
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0";

  const image_ = (
    <div className={`transition-transform duration-500 ease-out motion-reduce:transition-none ${onClick ? "group-hover:scale-[1.015]" : ""}`}>
      <ResponsiveImage
        src={image.url}
        alt={image.alt}
        width={image.width}
        height={image.height}
        lqip={image.lqip}
        aspectRatio={aspectRatio}
        sizes={sizes}
        priority={priority}
        className={className}
      />
    </div>
  );

  // No visible <figcaption> here (2026-08-23, "purely visual collage"
  // correction) — the gallery is image-only now, on purpose. Caption
  // data is untouched in Sanity and still reaches the visitor: it's
  // rendered inside PhotoLightbox when the photograph is opened (see
  // that component), and the source image's real alt text is always
  // present in the `<img>` itself for screen readers regardless of
  // whether a caption is ever shown visually.
  if (onClick) {
    return (
      <figure ref={ref} className={`transition-[opacity,transform] duration-700 ease-out ${revealClass}`}>
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open photograph${image.alt ? `: ${image.alt}` : ""} in full screen`}
          className="group block w-full cursor-zoom-in"
        >
          {image_}
        </button>
      </figure>
    );
  }

  return <figure ref={ref} className={`transition-[opacity,transform] duration-700 ease-out ${revealClass}`}>{image_}</figure>;
}
