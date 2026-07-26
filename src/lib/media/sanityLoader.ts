import type { ImageLoaderProps } from "next/image";

// The one place that knows how to ask the current image host for a
// specific size. Every real image on the site goes through
// ResponsiveImage (src/components/media/ResponsiveImage.tsx), which
// always passes this loader to next/image — so swapping CDNs later
// (Cloudinary, imgix, a self-hosted asset pipeline, etc.) means
// replacing this one function, not touching any page or component that
// renders an image.
//
// Resizing happens at Sanity's CDN (free, already paid for via the
// Sanity plan) rather than re-processing through Vercel's image
// optimizer — avoids a redundant second resize hop. `fit=max` never
// upscales past the source image's native size; `auto=format` lets
// Sanity negotiate WebP/AVIF per-browser automatically.
export default function sanityImageLoader({ src, width, quality }: ImageLoaderProps): string {
  const url = new URL(src);
  url.searchParams.set("w", width.toString());
  url.searchParams.set("q", (quality ?? 75).toString());
  url.searchParams.set("auto", "format");
  url.searchParams.set("fit", "max");
  return url.toString();
}
