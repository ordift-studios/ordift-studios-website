import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
