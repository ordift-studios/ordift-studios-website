import type { MetadataRoute } from "next";
import { contentRepository } from "@/lib/content";
import type { LegalPageSlug } from "@/lib/content/types";

// robots.ts has always referenced this URL as the sitemap location, but
// no sitemap route ever existed until now — every crawler following
// that reference got a 404. Next.js's file-convention sitemap (this
// file) auto-generates /sitemap.xml with zero extra config.
const LEGAL_SLUGS: LegalPageSlug[] = ["privacy", "terms", "cookies", "booking"];

const STATIC_ROUTES = ["", "/about", "/about/founder", "/services", "/work", "/workshops", "/journal", "/book"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ordiftstudios.com";
  const now = new Date();

  const [services, portfolioProjects, journalPosts, workshops, instructors, authors] = await Promise.all([
    contentRepository.getServices(),
    contentRepository.getPortfolioProjects(),
    contentRepository.getJournalPosts(),
    contentRepository.getWorkshops(),
    contentRepository.getInstructors(),
    contentRepository.getAuthors(),
  ]);

  const entries: MetadataRoute.Sitemap = [
    ...STATIC_ROUTES.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified: now,
    })),
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${siteUrl}/legal/${slug}`,
      lastModified: now,
    })),
    ...services.map((s) => ({ url: `${siteUrl}/services/${s.slug}`, lastModified: now })),
    ...portfolioProjects.map((p) => ({ url: `${siteUrl}/work/${p.slug}`, lastModified: now })),
    ...journalPosts.map((j) => ({ url: `${siteUrl}/journal/${j.slug}`, lastModified: now })),
    ...workshops.map((w) => ({ url: `${siteUrl}/workshops/${w.slug}`, lastModified: now })),
    ...instructors.map((i) => ({
      url: `${siteUrl}/workshops/instructors/${i.slug}`,
      lastModified: now,
    })),
    ...authors.map((a) => ({
      url: `${siteUrl}/journal/authors/${a.slug}`,
      lastModified: now,
    })),
  ];

  return entries;
}
