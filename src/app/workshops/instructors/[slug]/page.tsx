import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import WorkshopCard from "@/components/workshops/WorkshopCard";
import { contentRepository } from "@/lib/content";

export async function generateStaticParams() {
  const instructors = await contentRepository.getInstructors();
  return instructors.map((instructor) => ({ slug: instructor.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const instructor = await contentRepository.getInstructorBySlug(slug);
  if (!instructor) return {};
  return {
    title: `${instructor.name} — Ordift Studios Workshops`,
    description: instructor.title,
  };
}

export default async function InstructorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const instructor = await contentRepository.getInstructorBySlug(slug);
  if (!instructor) notFound();

  const [allWorkshops, categories, venues] = await Promise.all([
    contentRepository.getWorkshops(),
    contentRepository.getCategories(),
    contentRepository.getVenues(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const workshops = allWorkshops.filter((w) => w.instructorIds.includes(instructor.id));

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto flex items-center gap-6">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 shrink-0" />
          <div>
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-3">
              Instructor
              {instructor.isPlaceholder && " · Placeholder"}
            </p>
            <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop">
              {instructor.name}
            </h1>
            <p className="font-sans text-body text-white/70 mt-2">{instructor.title}</p>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <p className="font-sans text-body text-ordift-ink mb-8 max-w-2xl">{instructor.bio}</p>

          {instructor.credentials.length > 0 && (
            <div className="mb-10">
              <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                Credentials
              </p>
              <ul className="flex flex-col gap-2">
                {instructor.credentials.map((credential, i) => (
                  <li key={i} className="font-sans text-body-small text-ordift-ink flex gap-2">
                    <span className="text-ordift-gold-pressed">—</span>
                    <span>{credential}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {workshops.length > 0 && (
            <div>
              <p className="font-serif font-medium text-card-title text-ordift-ink mb-4">
                Workshops taught by {instructor.name}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {workshops.map((workshop) => (
                  <WorkshopCard
                    key={workshop.id}
                    workshop={workshop}
                    categories={workshop.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                    venue={workshop.venueId ? venueById.get(workshop.venueId) ?? null : null}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
