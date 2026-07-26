"use client";

import type { ImageLoaderProps } from "next/image";

// Configured as images.loaderFile in next.config.ts rather than passed
// as a per-instance `loader` prop — this version of Next.js requires a
// custom loader function to be serialized from a Client Component
// boundary (see node_modules/next/dist/docs .../images.md#loaderfile),
// and ResponsiveImage itself stays a Server Component. The `"use client"`
// directive here is what satisfies that requirement.
//
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
//
// Configuring this as images.loaderFile makes it the loader for every
// next/image on the site, not just Sanity-hosted ones — local static
// assets (e.g. Logo.tsx's /brand/*.png) are also routed through here.
// Those aren't absolute URLs, so `new URL()` would throw; pass them
// through unchanged and let Next.js serve them as-is.
export default function sanityImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!/^https?:\/\//.test(src)) return src;
  const url = new URL(src);
  url.searchParams.set("w", width.toString());
  url.searchParams.set("q", (quality ?? 75).toString());
  url.searchParams.set("auto", "format");
  url.searchParams.set("fit", "max");
  return url.toString();
}
