import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import WorkshopCard from "@/components/workshops/WorkshopCard";
import { contentRepository } from "@/lib/content";
import { isPastWorkshop } from "@/lib/content/workshopHelpers";

export const metadata: Metadata = {
  title: "Workshops — Ordift Studios",
  description:
    "Hands-on workshops from Ordift Studios — photography, filmmaking, branding and the business of creativity.",
};

export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: categorySlug } = await searchParams;

  const [allWorkshops, categories, venues] = await Promise.all([
    contentRepository.getWorkshops(),
    contentRepository.getCategories(),
    contentRepository.getVenues(),
  ]);

  const venueById = new Map(venues.map((v) => [v.id, v]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const filtered = categorySlug
    ? allWorkshops.filter((w) =>
        w.categoryIds.some((id) => categoryById.get(id)?.slug === categorySlug)
      )
    : allWorkshops;

  const upcoming = filtered.filter((w) => !isPastWorkshop(w));
  const past = filtered.filter(isPastWorkshop);

  const activeCategory = categorySlug ? categories.find((c) => c.slug === categorySlug) : null;

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Ordift Academy · Workshops
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl mb-4">
            Learn directly from the studio.
          </h1>
          <p className="font-sans text-body text-white/70 max-w-xl">
            Hands-on sessions in photography, filmmaking, branding and the
            business of creativity — taught by the people building Ordift
            Studios.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 pt-10 sm:pt-12">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-3">
          <Link
            href="/workshops"
            className={`inline-flex items-center min-h-11 px-4 rounded-full font-sans text-body-small transition-colors ${
              !activeCategory
                ? "bg-ordift-navy-950 text-white"
                : "border border-black/15 text-ordift-ink hover:border-black/30"
            }`}
          >
            All Categories
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/workshops?category=${cat.slug}`}
              className={`inline-flex items-center min-h-11 px-4 rounded-full font-sans text-body-small transition-colors ${
                activeCategory?.id === cat.id
                  ? "bg-ordift-navy-950 text-white"
                  : "border border-black/15 text-ordift-ink hover:border-black/30"
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
            Upcoming Workshops
          </h2>
          {upcoming.length === 0 ? (
            <p className="font-sans text-body text-ordift-ink-muted mb-4">
              No upcoming workshops{activeCategory ? ` in ${activeCategory.name}` : ""} right now. Check back soon.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {upcoming.map((workshop) => (
                <WorkshopCard
                  key={workshop.id}
                  workshop={workshop}
                  categories={workshop.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  venue={workshop.venueId ? venueById.get(workshop.venueId) ?? null : null}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Past Workshops
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {past.map((workshop) => (
                <WorkshopCard
                  key={workshop.id}
                  workshop={workshop}
                  categories={workshop.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  venue={workshop.venueId ? venueById.get(workshop.venueId) ?? null : null}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
