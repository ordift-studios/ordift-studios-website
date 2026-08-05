// Server-safe Sanity image resize helper for social-share metadata
// (generateMetadata() runs in a Server Component context, which can't
// import sanityLoader.ts — that file is "use client" per its own header
// comment). Not a general-purpose image loader: this exists solely to
// stop og:image/twitter:image from being handed the raw, full-resolution
// original Sanity asset (found live during the 2026-08-05 review — a
// 4155x6232 source file with no resize params at all), which risks a
// slow or failed preview on WhatsApp/Facebook/LinkedIn crawlers.
//
// 1200x630 is the standard recommended Open Graph image size; `fit=crop`
// (rather than `max`) guarantees that exact aspect ratio regardless of
// the source photo's own crop, since social platforms render OG images
// at a fixed frame.
export function ogImageUrl(url: string, width = 1200, height = 630): string {
  if (!/^https?:\/\//.test(url) || !url.includes("cdn.sanity.io")) return url;
  const u = new URL(url);
  u.searchParams.set("w", String(width));
  u.searchParams.set("h", String(height));
  u.searchParams.set("fit", "crop");
  u.searchParams.set("q", "80");
  u.searchParams.set("auto", "format");
  return u.toString();
}
