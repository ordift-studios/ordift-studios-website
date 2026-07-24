import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isStaging = process.env.SITE_ENV === "staging";

  if (isStaging) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/sitemap.xml`,
  };
}
