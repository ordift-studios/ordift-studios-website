import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isStaging = process.env.SITE_ENV === "staging";

  if (isStaging) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // These already redirect unauthenticated visitors, but excluding
      // them outright stops crawlers from ever indexing a login/redirect
      // variant of an internal route.
      disallow: ["/admin", "/portal", "/studio", "/style-preview"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/sitemap.xml`,
  };
}
