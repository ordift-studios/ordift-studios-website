import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Every real image on the site is Sanity-hosted (see
    // src/components/media/ResponsiveImage.tsx, which always resizes
    // through src/lib/media/sanityLoader.ts rather than Next's built-in
    // optimizer). A custom `loader` bypasses this domain check at
    // runtime, but declaring it here too keeps the config correct and
    // self-documenting if a component ever falls back to next/image's
    // default loader.
    remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io" }],
  },
};

export default nextConfig;
