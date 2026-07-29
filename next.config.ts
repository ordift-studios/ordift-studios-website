import type { NextConfig } from "next";

// Baseline security headers — Next.js and Vercel don't set these by
// default. Deliberately excludes Content-Security-Policy: this app
// loads third-party scripts (Cloudflare Turnstile, Sanity Studio's own
// asset pipeline) that a CSP would need careful, tested scoping to not
// break — safer to add that separately once each script/frame source
// is enumerated and verified, rather than guess a policy here.
const SECURITY_HEADERS = [
  // Blocks this site from being framed by another origin (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stops browsers from MIME-sniffing a response away from its declared Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Sends only the origin (not the full URL/path) as a Referer header on cross-origin requests.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disables browser features this site never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  images: {
    // Every real image on the site is Sanity-hosted (see
    // src/components/media/ResponsiveImage.tsx). Resizing is configured
    // here as a global custom loader — rather than a per-instance
    // `loader` prop — because ResponsiveImage is a Server Component and
    // this Next.js version requires custom loader functions to cross
    // the Client Component boundary (loaderFile itself is `"use
    // client"`; see src/lib/media/sanityLoader.ts). Swapping CDNs later
    // still means replacing that one file, not touching any page.
    loader: "custom",
    loaderFile: "./src/lib/media/sanityLoader.ts",
    remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io" }],
  },
};

export default nextConfig;
