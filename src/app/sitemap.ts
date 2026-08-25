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

  const [services, portfolioProjects, journalPosts, workshops, instructors, authors, pulseArticles] = await Promise.all([
    contentRepository.getServices(),
    contentRepository.getPortfolioProjects(),
    contentRepository.getJournalPosts(),
    contentRepository.getWorkshops(),
    contentRepository.getInstructors(),
    contentRepository.getAuthors(),
    // Closure refinement (2026-08-25) — published-only (never draft/
    // inReview/archived; see pulseArticlesForSitemapQuery's own
    // comment). journalPost and pulseArticle share the /journal/[slug]
    // route, so entries are deduped against journalPost slugs below
    // rather than assuming the two document types' slugs never collide.
    contentRepository.getPulseArticleSlugsForSitemap(),
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
    ...pulseArticles
      .filter((a) => !journalPosts.some((j) => j.slug === a.slug)) // avoid a duplicate URL if a slug ever collides
      .map((a) => ({ url: `${siteUrl}/journal/${a.slug}`, lastModified: a.lastModified ? new Date(a.lastModified) : now })),
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
