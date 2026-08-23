import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import VideographyIndexShowcase, {
  type VideographyShowcaseProject,
} from "@/components/portfolio/VideographyIndexShowcase";
import { contentRepository } from "@/lib/content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const PAGE_TITLE = "Videography — Ordift Studios";
const PAGE_DESCRIPTION = "Stories in motion — a cinematic showcase of real Videography work from Ordift Studios.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/work/videography` },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: `${SITE_URL}/work/videography` },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

// Videography's own dedicated index page (2026-08-23) — see
// WorkDisciplineBands' href override and /work/page.tsx's
// workDisciplines construction for how a visitor arrives here from the
// discipline bands on /work. Every other discipline still lands on
// /work's own filtered view; this page is Videography-only, for now.
export default async function VideographyIndexPage() {
  const [allProjects, categories] = await Promise.all([
    contentRepository.getPortfolioProjects(),
    contentRepository.getPortfolioCategories(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const videographyProjects = allProjects.filter((p) => p.disciplines.includes("videography"));
  // Featured-first, otherwise the order already returned by the content
  // repository — same convention as Photography's own index.
  const ordered = [...videographyProjects].sort((a, b) => Number(b.featured) - Number(a.featured));

  const showcaseProjects: VideographyShowcaseProject[] = ordered.map((p) => {
    const cover = p.coverImage;
    const heroIsImage = p.heroMedia.type === "image" && p.heroMedia.url;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      categoryName: categoryById.get(p.categoryIds[0] ?? "")?.name ?? null,
      year: p.year,
      // Poster/Cover Image (2026-08-23) — never the video's own first
      // frame. Prefers the deliberately-chosen Portfolio Cover Image;
      // falls back to a real image-type Hero Media (rare for
      // Videography, but valid); otherwise null, which the showcase
      // renders as an honest branded placeholder rather than a broken
      // black tile.
      poster: cover
        ? { url: cover.url, alt: cover.alt, focalX: cover.focalX, focalY: cover.focalY }
        : heroIsImage
          ? { url: p.heroMedia.url!, alt: p.heroMedia.alt, focalX: 50, focalY: 50 }
          : null,
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
            / Videography
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl mb-4">
            Stories in Motion.
          </h1>
          <p className="font-sans text-body text-white/70 max-w-xl">Real Ordift Studios films, one screening at a time.</p>
        </div>
      </section>

      {showcaseProjects.length > 0 ? (
        <VideographyIndexShowcase projects={showcaseProjects} />
      ) : (
        <section className="bg-ordift-navy-950 px-4 sm:px-8 py-16 sm:py-20 border-t border-white/10">
          <div className="max-w-xl mx-auto text-center">
            <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold mb-2">
              Portfolio Coming Soon
            </p>
            <p className="font-sans text-body text-white/70 mb-6">
              Videography is a service Ordift Studios provides today — we&apos;re still building out this
              discipline&apos;s portfolio showcase. Get in touch to discuss your project directly.
            </p>
            <Button href="/book?service=videography" variant="primary">
              Book Videography
            </Button>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
