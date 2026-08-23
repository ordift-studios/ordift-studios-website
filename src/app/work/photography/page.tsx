import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import PhotographyIndexStrip, {
  type PhotographyStripProject,
} from "@/components/portfolio/PhotographyIndexStrip";
import { contentRepository } from "@/lib/content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const PAGE_TITLE = "Photography — Ordift Studios";
const PAGE_DESCRIPTION =
  "Selected photography work from Ordift Studios — a cinematic look at real projects across the discipline.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/work/photography` },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: `${SITE_URL}/work/photography` },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

// Photography's own dedicated index page (2026-08-23) — see
// WorkDisciplineBands' href override and /work/page.tsx's
// workDisciplines construction for how a visitor arrives here from the
// discipline bands on /work. Every other discipline still lands on
// /work's own filtered view; this page is Photography-only, by design,
// for now.
//
// No filter/category picker here deliberately — with a genuine
// Photography project count this small, a filter UI would be visual
// clutter, not a useful tool (per the brief: "avoid ... cluttered
// filter controls"). The category/search system on /work itself is
// completely untouched and still fully reachable there — this page
// doesn't remove or replace it, it's a separate, simpler entry point.
export default async function PhotographyIndexPage() {
  const [allProjects, categories] = await Promise.all([
    contentRepository.getPortfolioProjects(),
    contentRepository.getPortfolioCategories(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const photographyProjects = allProjects.filter((p) => p.disciplines.includes("photography"));
  // Featured-first, otherwise the order already returned by the content
  // repository — the same convention used sitewide (e.g. /work's own
  // discipline hero-image selection), not a newly invented ranking.
  const ordered = [...photographyProjects].sort((a, b) => Number(b.featured) - Number(a.featured));

  const stripProjects: PhotographyStripProject[] = ordered
    // An admin-chosen Portfolio Cover/Index Image (Admin → Portfolio →
    // project → "Portfolio Cover / Index Image") always has a usable
    // image already; otherwise fall back to a real image-type Hero
    // Media, same as before this field existed.
    .filter((p) => Boolean(p.coverImage) || (p.heroMedia.type === "image" && p.heroMedia.url))
    .map((p) => {
      const cover = p.coverImage;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        categoryName: categoryById.get(p.categoryIds[0] ?? "")?.name ?? null,
        heroImage: cover
          ? { url: cover.url, alt: cover.alt, width: cover.width, height: cover.height, lqip: cover.lqip }
          : {
              url: p.heroMedia.url!,
              alt: p.heroMedia.alt,
              width: p.heroMedia.width ?? null,
              height: p.heroMedia.height ?? null,
              lqip: p.heroMedia.lqip ?? null,
            },
      };
    });

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            <Link href="/work" className="hover:underline">
              Work
            </Link>{" "}
            / Photography
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl mb-4">
            Photography.
          </h1>
          <p className="font-sans text-body text-white/70 max-w-xl">
            A selection of real projects — each one its own chapter.
          </p>
        </div>
      </section>

      {stripProjects.length > 0 ? (
        <PhotographyIndexStrip projects={stripProjects} />
      ) : (
        <section className="bg-ordift-offwhite px-4 sm:px-8 py-16 sm:py-20">
          <div className="max-w-xl mx-auto text-center">
            <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold-pressed mb-2">
              Portfolio Coming Soon
            </p>
            <p className="font-sans text-body text-ordift-ink-muted mb-6">
              Photography is a service Ordift Studios provides today — we&apos;re still building out this
              discipline&apos;s portfolio showcase. Get in touch to discuss your project directly.
            </p>
            <Button href="/book?service=photography" variant="primary">
              Book Photography
            </Button>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
