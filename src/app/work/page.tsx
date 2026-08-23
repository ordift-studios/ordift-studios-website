import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import PortfolioCard from "@/components/portfolio/PortfolioCard";
import WorkDisciplineBands from "@/components/portfolio/WorkDisciplineBands";
import { contentRepository } from "@/lib/content";
import { DISCIPLINE_LABEL, matchesSearch } from "@/lib/content/portfolioHelpers";
import type { PortfolioDiscipline, PortfolioProject } from "@/lib/content/types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const PAGE_TITLE = "Portfolio — Ordift Studios";
const PAGE_DESCRIPTION =
  "Selected work from Ordift Studios across photography, videography, branding, design and content.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  // Previously missing entirely — found live during the 2026-08-05
  // review: this page had no canonical tag and its Open Graph fields
  // silently fell back to the root layout's homepage URL/copy instead of
  // its own.
  alternates: { canonical: `${SITE_URL}/work` },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: `${SITE_URL}/work` },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

const DISCIPLINE_ORDER: PortfolioDiscipline[] = [
  "photography",
  "videography",
  "graphic-design",
  "branding",
  "content-creation",
];

// One representative real image per discipline for WorkDisciplineBands —
// deliberately not a new CMS field: `service` has no hero-image field
// today (confirmed by inspection before building this), and the
// instruction is to reuse genuine Portfolio imagery already in the
// system wherever possible rather than invent schema. Prefers a
// Featured project in that discipline, falls back to the first
// published project in that discipline, falls back to null (renders
// the existing branded MediaPlaceholder, same fallback used sitewide).
function pickDisciplineHeroImage(discipline: PortfolioDiscipline, projects: PortfolioProject[]) {
  const matching = projects.filter((p) => p.disciplines.includes(discipline) && p.heroMedia.type === "image" && p.heroMedia.url);
  const chosen = matching.find((p) => p.featured) ?? matching[0];
  if (!chosen) return null;
  return {
    url: chosen.heroMedia.url!,
    alt: chosen.heroMedia.alt,
    width: chosen.heroMedia.width,
    height: chosen.heroMedia.height,
    lqip: chosen.heroMedia.lqip,
  };
}

function buildHref(params: { discipline?: string; category?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.discipline) search.set("discipline", params.discipline);
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return qs ? `/work?${qs}` : "/work";
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ discipline?: string; category?: string; q?: string }>;
}) {
  const { discipline, category: categorySlug, q } = await searchParams;

  const [allProjects, categories, services] = await Promise.all([
    contentRepository.getPortfolioProjects(),
    contentRepository.getPortfolioCategories(),
    contentRepository.getServices(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // All 7 real disciplines (the service list, not the narrower 5-item
  // DISCIPLINE_ORDER below which only drives the existing filter chips) —
  // current, approved naming and order (displayOrder), nothing invented.
  const workDisciplines = [...services]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((service) => ({
      slug: service.slug,
      name: service.name,
      heroImage: pickDisciplineHeroImage(service.slug, allProjects),
      hasProjects: allProjects.some((p) => p.disciplines.includes(service.slug)),
      // Photography now has its own dedicated cinematic index page
      // (2026-08-23) — every other discipline still falls through to
      // this page's own filtered view (WorkDisciplineBands' default),
      // unchanged, until it gets its own dedicated page too.
      ...(service.slug === "photography" ? { href: "/work/photography" } : {}),
    }));
  const activeService = discipline ? services.find((s) => s.slug === discipline) : undefined;

  const hasFilters = Boolean(discipline || categorySlug || q);

  const filtered = allProjects.filter((p) => {
    if (discipline && !p.disciplines.includes(discipline as PortfolioDiscipline)) return false;
    if (categorySlug && !p.categoryIds.some((id) => categoryById.get(id)?.slug === categorySlug))
      return false;
    if (q && !matchesSearch(p, q)) return false;
    return true;
  });

  // "Featured Work" presentation was removed from this page (2026-08-23)
  // — see the removed-section note further down for exactly where it's
  // intended to move. The underlying capability is untouched: `featured`
  // remains a real field on `portfolioProject` (Sanity), PortfolioCard
  // (imported below, still used by the All Work/Results grid) already
  // knows how to render a featured badge, and the homepage's own
  // Featured Work section (src/app/page.tsx) is completely separate and
  // unaffected by this file.

  // Only offer category chips that can actually return a result under the
  // current discipline filter — a chip with a guaranteed-empty result is a
  // dead end, not a useful filter option.
  const projectsForDiscipline = discipline
    ? allProjects.filter((p) => p.disciplines.includes(discipline as PortfolioDiscipline))
    : allProjects;
  const visibleCategories = categories.filter((cat) =>
    projectsForDiscipline.some((p) => p.categoryIds.includes(cat.id)),
  );

  return (
    <main>
      <NavBar />

      {/* Primary discipline-selection experience (2026-08-23) — the very
          first content on /work, with no slideshow above it. The hero
          slideshow lives on the homepage only (src/app/page.tsx) — the
          shared PortfolioHeroSlideshow component is untouched, still used
          there, just no longer imported/rendered on this page. The
          filter/search system below is retained, not removed, just no
          longer the dominant first thing a visitor sees. */}
      <WorkDisciplineBands disciplines={workDisciplines} />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Portfolio
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl mb-4">
            Selected work.
          </h1>
          <p className="font-sans text-body text-white/70 max-w-xl">
            Photography, film, design, branding and content — a system of
            work rather than a single specialty.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 pt-10 sm:pt-12">
        <div className="max-w-6xl mx-auto">
          <form action="/work" method="get" className="flex gap-2 mb-6">
            {discipline && <input type="hidden" name="discipline" value={discipline} />}
            {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="w-full max-w-sm min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body-small text-ordift-ink placeholder:text-ordift-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent"
            />
            <button
              type="submit"
              className="inline-flex items-center min-h-11 px-5 rounded-lg bg-ordift-navy-950 text-white font-sans text-body-small"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap gap-3 mb-4">
            <Link
              href={buildHref({ category: categorySlug, q })}
              className={`inline-flex items-center min-h-11 px-4 rounded-full font-sans text-body-small transition-colors ${
                !discipline
                  ? "bg-ordift-navy-950 text-white"
                  : "border border-black/15 text-ordift-ink hover:border-black/30"
              }`}
            >
              All Disciplines
            </Link>
            {DISCIPLINE_ORDER.map((d) => (
              <Link
                key={d}
                href={buildHref({ discipline: d, category: categorySlug, q })}
                className={`inline-flex items-center min-h-11 px-4 rounded-full font-sans text-body-small transition-colors ${
                  discipline === d
                    ? "bg-ordift-navy-950 text-white"
                    : "border border-black/15 text-ordift-ink hover:border-black/30"
                }`}
              >
                {DISCIPLINE_LABEL[d]}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pb-6 border-b border-black/10">
            <Link
              href={buildHref({ discipline, q })}
              className={`inline-flex items-center min-h-8 px-3 rounded-full font-sans text-caption transition-colors ${
                !categorySlug
                  ? "bg-ordift-gold/15 text-ordift-gold-pressed"
                  : "border border-black/10 text-ordift-ink-muted hover:border-black/25"
              }`}
            >
              All Categories
            </Link>
            {visibleCategories.map((cat) => (
              <Link
                key={cat.id}
                href={buildHref({ discipline, category: cat.slug, q })}
                className={`inline-flex items-center min-h-8 px-3 rounded-full font-sans text-caption transition-colors ${
                  categorySlug === cat.slug
                    ? "bg-ordift-gold/15 text-ordift-gold-pressed"
                    : "border border-black/10 text-ordift-ink-muted hover:border-black/25"
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* "Featured Work" section removed from /work (2026-08-23) — this
          page now focuses on discipline navigation and the full project
          catalog below, not a curated highlight reel. The intended future
          home is the Stories/Journal editorial experience (not yet
          redesigned) alongside project stories, behind-the-scenes, and
          other editorial content — deferred rather than forced into a
          Journal page not yet designed to hold it. Nothing about the
          underlying capability was touched: `project.featured` is
          untouched Sanity data, and PortfolioCard (still imported/used
          just below) already renders a "Featured" badge on any card
          whose project has it set — reusable as-is once Stories has a
          real section to place it in. The homepage's own, separate
          Featured Work section is unaffected by this removal. */}

      <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
            {hasFilters ? "Results" : "All Work"}
          </h2>
          {filtered.length === 0 && activeService ? (
            // Distinguishes "the service isn't available" from "the
            // service's portfolio showcase isn't populated yet" — the
            // service itself is real and bookable either way.
            <div className="max-w-xl">
              <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold-pressed mb-2">
                Portfolio Coming Soon
              </p>
              <p className="font-sans text-body text-ordift-ink-muted mb-6">
                {activeService.name} is a service Ordift Studios provides today — we&apos;re still building out this
                discipline&apos;s portfolio showcase. Get in touch to discuss your project directly.
              </p>
              <Button href={`/book?service=${activeService.slug}`} variant="primary">
                Book {activeService.name}
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="font-sans text-body text-ordift-ink-muted">
              No projects match these filters yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {filtered.map((project) => (
                <PortfolioCard
                  key={project.id}
                  project={project}
                  categories={project.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
