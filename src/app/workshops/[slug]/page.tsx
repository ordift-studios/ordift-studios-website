import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import CountdownTimer from "@/components/workshops/CountdownTimer";
import FAQAccordion from "@/components/workshops/FAQAccordion";
import TestimonialCard from "@/components/TestimonialCard";
import WorkshopCard from "@/components/workshops/WorkshopCard";
import Avatar from "@/components/media/Avatar";
import Gallery from "@/components/media/Gallery";
import { contentRepository } from "@/lib/content";
import {
  EXPERIENCE_LABEL,
  STATUS_BADGE_CLASSES,
  STATUS_LABEL,
  formatDate,
  formatDateRange,
  getEffectiveWorkshopStatus,
  getRegistrationCloseInstant,
  isMultiDay,
} from "@/lib/content/workshopHelpers";
import { visitorFormsOpen } from "@/lib/shared/env";
import { listTicketTypesForWorkshop } from "@/lib/workshops/ticketTypes";
import RegistrationForm from "./RegistrationForm";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

export async function generateStaticParams() {
  const workshops = await contentRepository.getWorkshops();
  return workshops.map((workshop) => ({ slug: workshop.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const workshop = await contentRepository.getWorkshopBySlug(slug);
  if (!workshop) return {};
  const title = workshop.seo.metaTitle ?? `${workshop.title} — Ordift Studios Workshops`;
  const description = workshop.seo.metaDescription ?? workshop.shortDescription;
  const canonical = workshop.seo.canonicalUrl ?? `${SITE_URL}/workshops/${workshop.slug}`;
  const images = [workshop.seo.ogImageUrl ?? `${SITE_URL}/opengraph-image`];
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function WorkshopDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workshop = await contentRepository.getWorkshopBySlug(slug);
  if (!workshop) notFound();

  // Workshop Management V1, Phase B (2026-08-25) — empty for a workshop
  // with no configured ticket types; RegistrationForm's selector simply
  // doesn't render in that case (registration works exactly as before).
  const activeTicketTypes = (await listTicketTypesForWorkshop(workshop.id, true)).map((t) => ({
    id: t.id,
    name: t.name,
    priceUsd: t.priceUsd,
    description: t.description,
  }));

  // TD-034: reflects the CMS `status` unless it's manually "open" but
  // registrationDeadline has passed, in which case it's treated as
  // "closed" everywhere on this page — badge, countdown, and the
  // register-vs-message panel all read this instead of the raw status.
  const effectiveStatus = getEffectiveWorkshopStatus(workshop);
  // Same instant the effective-status check closes at (end of the
  // deadline day, not its start) — the countdown must expire at exactly
  // the moment registration actually closes, not a day early.
  const registrationClosesAt = getRegistrationCloseInstant(workshop);

  const [categories, instructors, venues, allWorkshops, allTestimonials] = await Promise.all([
    contentRepository.getCategories(),
    contentRepository.getInstructors(),
    contentRepository.getVenues(),
    contentRepository.getWorkshops(),
    contentRepository.getTestimonials(),
  ]);

  const workshopCategories = categories.filter((c) => workshop.categoryIds.includes(c.id));
  const workshopInstructors = instructors.filter((i) => workshop.instructorIds.includes(i.id));
  const venue = workshop.venueId ? venues.find((v) => v.id === workshop.venueId) ?? null : null;
  const testimonials = allTestimonials.filter((t) => workshop.testimonialIds.includes(t.id));
  const relatedWorkshops = allWorkshops.filter(
    (w) => w.id !== workshop.id && workshop.relatedWorkshopIds.includes(w.id),
  );

  const venueById = new Map(venues.map((v) => [v.id, v]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const eventAttendanceMode = !venue
    ? "https://schema.org/MixedEventAttendanceMode"
    : venue.format === "online"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : venue.format === "hybrid"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: workshop.title,
    description: workshop.seo.metaDescription ?? workshop.shortDescription,
    url: `${SITE_URL}/workshops/${workshop.slug}`,
    ...(workshop.startDate ? { startDate: workshop.startDate } : {}),
    ...(workshop.endDate ? { endDate: workshop.endDate } : {}),
    eventAttendanceMode,
    eventStatus: "https://schema.org/EventScheduled",
    organizer: { "@type": "Organization", name: "Ordift Studios", url: SITE_URL },
    location:
      venue && venue.format !== "online"
        ? { "@type": "Place", name: venue.name, ...(venue.addressLine ? { address: venue.addressLine } : {}) }
        : { "@type": "VirtualLocation", url: `${SITE_URL}/workshops/${workshop.slug}` },
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Workshop
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl mb-4">
            {workshop.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] ${STATUS_BADGE_CLASSES[effectiveStatus]}`}
            >
              {STATUS_LABEL[effectiveStatus]}
            </span>
            {venue && (
              <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-white/10 text-white/80">
                {venue.format === "in-person" ? "In Person" : venue.format === "online" ? "Online" : "Hybrid"}
              </span>
            )}
            {isMultiDay(workshop) && (
              <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-white/10 text-white/80">
                Multi-Day
              </span>
            )}
            {workshop.isRecurring && (
              <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-white/10 text-white/80">
                Recurring
              </span>
            )}
            {workshop.isMembersOnly && (
              <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold/20 text-ordift-gold">
                Members Only
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-16">
          <div>
            <p className="font-sans text-body text-ordift-ink mb-8 whitespace-pre-line">
              {workshop.description}
            </p>

            {effectiveStatus === "open" && registrationClosesAt && (
              <div className="mb-8">
                <CountdownTimer targetDate={registrationClosesAt.toISOString()} label="Registration closes in" />
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-black/10 pt-6 mb-8">
              <div>
                <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                  Date
                </dt>
                <dd className="font-sans text-body-small text-ordift-ink">
                  {formatDateRange(workshop)}
                </dd>
              </div>
              <div>
                <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                  Venue
                </dt>
                <dd className="font-sans text-body-small text-ordift-ink">
                  {venue ? venue.addressLine ?? venue.name : "To be announced"}
                </dd>
              </div>
              <div>
                <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                  Registration deadline
                </dt>
                <dd className="font-sans text-body-small text-ordift-ink">
                  {formatDate(workshop.registrationDeadline)}
                </dd>
              </div>
              <div>
                <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                  Experience level
                </dt>
                <dd className="font-sans text-body-small text-ordift-ink">
                  {workshop.experienceLevels.map((level) => EXPERIENCE_LABEL[level]).join(", ")}
                </dd>
              </div>
            </dl>

            {workshopCategories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8">
                {workshopCategories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/workshops?category=${cat.slug}`}
                    className="inline-flex items-center min-h-8 px-3 rounded-full border border-black/15 font-sans text-caption text-ordift-ink hover:border-black/30"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}

            {workshop.learningOutcomes.length > 0 && (
              <div className="mb-8">
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  What you&apos;ll learn
                </p>
                <ul className="flex flex-col gap-2">
                  {workshop.learningOutcomes.map((outcome, i) => (
                    <li key={i} className="font-sans text-body-small text-ordift-ink flex gap-2">
                      <span className="text-ordift-gold-pressed">—</span>
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {workshop.agenda.length > 0 && (
              <div className="mb-8">
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">Agenda</p>
                <ul className="flex flex-col gap-3">
                  {workshop.agenda.map((item) => (
                    <li key={item.id} className="border-l-2 border-ordift-gold/40 pl-4">
                      <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                        {item.time}
                      </p>
                      <p className="font-sans text-body-small font-medium text-ordift-ink">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="font-sans text-body-small text-ordift-ink-muted">
                          {item.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {workshopInstructors.length > 0 && (
              <div className="mb-8">
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  {workshopInstructors.length > 1 ? "Instructors" : "Instructor"}
                </p>
                <div className="flex flex-col gap-4">
                  {workshopInstructors.map((instructor) => (
                    <Link
                      key={instructor.id}
                      href={`/workshops/instructors/${instructor.slug}`}
                      className="flex items-center gap-4 rounded-lg border border-black/10 p-4 hover:border-black/20 transition-colors"
                    >
                      <Avatar src={instructor.photoUrl} alt={instructor.name} size={56} />
                      <div>
                        <p className="font-sans font-medium text-body-small text-ordift-ink">
                          {instructor.name}
                          {instructor.isPlaceholder && (
                            <span className="ml-2 font-sans text-caption text-ordift-gold-pressed">
                              (Placeholder)
                            </span>
                          )}
                        </p>
                        <p className="font-sans text-caption text-ordift-ink-muted">
                          {instructor.title}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {workshop.gallery.length > 0 && (
              <div className="mb-8">
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">Gallery</p>
                <Gallery images={workshop.gallery} columns={3} />
              </div>
            )}

            {workshop.certificate.offered && (
              <div className="mb-8 rounded-lg bg-ordift-offwhite p-5">
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-2">
                  Certificate of Completion
                </p>
                <p className="font-sans text-body-small text-ordift-ink-muted">
                  {workshop.certificate.description ?? "Awarded on completion of this workshop."}
                </p>
              </div>
            )}

            {workshop.faqs.length > 0 && (
              <div className="mb-8">
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  Frequently asked questions
                </p>
                <FAQAccordion faqs={workshop.faqs} />
              </div>
            )}

            {testimonials.length > 0 && (
              <div className="mb-8">
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  What attendees say
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {testimonials.map((t) => (
                    <TestimonialCard key={t.id} testimonial={t} />
                  ))}
                </div>
              </div>
            )}

            {workshop.requiresPayment && (
              <p className="font-sans text-body-small text-ordift-ink-muted">
                This workshop requires payment. Pricing and payment instructions will be
                confirmed with you directly by our team after registration — payment is
                confirmed manually, not collected online.
              </p>
            )}
          </div>

          <div>
            <div className="rounded-xl border border-black/10 bg-ordift-offwhite p-5 sm:p-6 sticky top-6">
              <p className="font-serif font-medium text-card-title text-ordift-ink mb-1">
                Register
              </p>
              {effectiveStatus === "open" && visitorFormsOpen() ? (
                <>
                  <p className="font-sans text-body-small text-ordift-ink-muted mb-5">
                    Spaces are limited. If the workshop is full, you&apos;ll be added to a
                    waiting list automatically.
                  </p>
                  <RegistrationForm workshopSlug={workshop.slug} ticketTypes={activeTicketTypes} />
                </>
              ) : (
                <p className="font-sans text-body-small text-ordift-ink-muted">
                  {effectiveStatus === "open" && !visitorFormsOpen() && "Bookings will open soon."}
                  {effectiveStatus === "coming-soon" &&
                    "Registration isn't open yet for this workshop. Check back soon."}
                  {effectiveStatus === "full" &&
                    "This workshop is currently full and not accepting new registrations."}
                  {effectiveStatus === "closed" &&
                    "Registration for this workshop is closed."}
                  {effectiveStatus === "completed" &&
                    "This workshop has already taken place."}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {relatedWorkshops.length > 0 && (
        <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Related Workshops
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {relatedWorkshops.map((related) => (
                <WorkshopCard
                  key={related.id}
                  workshop={related}
                  categories={related.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  venue={related.venueId ? venueById.get(related.venueId) ?? null : null}
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
