import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import GraphicDesignIndexShowcase, {
  type GraphicDesignShowcaseProject,
} from "@/components/portfolio/GraphicDesignIndexShowcase";
import { contentRepository } from "@/lib/content";
import { resolveDesignTreatment, DESIGN_TREATMENT_LABEL } from "@/lib/content/portfolioTreatment";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const PAGE_TITLE = "Graphic Design — Ordift Studios";
const PAGE_DESCRIPTION = "Brand identity, campaigns and visual design case studies from Ordift Studios.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/work/graphic-design` },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: `${SITE_URL}/work/graphic-design` },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

// Graphic Design's own dedicated index page (2026-08-24) — see
// WorkDisciplineBands' href override and /work/page.tsx's
// workDisciplines construction for how a visitor arrives here from the
// discipline bands on /work. Every other discipline still lands on
// /work's own filtered view; this page is Graphic Design-only, for now.
export default async function GraphicDesignIndexPage() {
  const [allProjects, categories] = await Promise.all([
    contentRepository.getPortfolioProjects(),
    contentRepository.getPortfolioCategories(),
  ]);

  const designProjects = allProjects.filter((p) => p.disciplines.includes("graphic-design"));
  const ordered = [...designProjects].sort((a, b) => Number(b.featured) - Number(a.featured));

  const showcaseProjects: GraphicDesignShowcaseProject[] = ordered.map((p) => {
    const cover = p.coverImage;
    const heroIsImage = p.heroMedia.type === "image" && p.heroMedia.url;
    const projectCategories = categories.filter((c) => p.categoryIds.includes(c.id));
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      treatmentLabel: DESIGN_TREATMENT_LABEL[resolveDesignTreatment(projectCategories)],
      year: p.year,
      client: p.client,
      featured: p.featured,
      cover: cover
        ? { url: cover.url, alt: cover.alt, width: cover.width, height: cover.height, lqip: cover.lqip }
        : heroIsImage
          ? {
              url: p.heroMedia.url!,
              alt: p.heroMedia.alt,
              width: p.heroMedia.width ?? null,
              height: p.heroMedia.height ?? null,
              lqip: p.heroMedia.lqip ?? null,
            }
          : null,
    };
  });

  return (
    <main>
      <NavBar />

      <section className="px-4 sm:px-8 pt-16 sm:pt-20 pb-10 sm:pb-12 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            <Link href="/work" className="hover:underline">
              Work
            </Link>{" "}
            / Graphic Design
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-ordift-ink mb-4">
            Design, considered.
          </h1>
          <p className="font-sans text-body text-ordift-ink-muted max-w-xl mx-auto">
            Brand identity, campaigns and visual design case studies from Ordift Studios.
          </p>
        </div>
      </section>

      {showcaseProjects.length > 0 ? (
        <GraphicDesignIndexShowcase projects={showcaseProjects} />
      ) : (
        <section className="px-4 sm:px-8 py-16 sm:py-20 border-t border-black/5">
          <div className="max-w-xl mx-auto text-center">
            <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold mb-2">
              Portfolio Coming Soon
            </p>
            <p className="font-sans text-body text-ordift-ink-muted mb-6">
              Graphic Design is a service Ordift Studios provides today — we&apos;re still building out this
              discipline&apos;s portfolio showcase. Get in touch to discuss your project directly.
            </p>
            <Button href="/book?service=graphic-design" variant="primary">
              Book Graphic Design
            </Button>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
