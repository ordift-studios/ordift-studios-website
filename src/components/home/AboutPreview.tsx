import Link from "next/link";

// Homepage short About introduction (2026-08-24) — replaces the
// standalone "Who We Are" band and the homepage's Featured Work
// section with one coherent editorial intro: Who We Are leads (full
// width, most visual weight), Mission/Vision/Values follow as a
// numbered triptych rather than three identical cards, closing with a
// quiet lower-right CTA into the dedicated Team page. Every string here
// reuses already-approved Sanity copy (home.whoWeAreEyebrow/Body,
// about.mission/vision, and the Values section's own established
// tagline) — nothing new was invented for this preview.
export default function AboutPreview({
  whoWeAreEyebrow,
  whoWeAreBody,
  mission,
  vision,
  valuesStatement,
}: {
  whoWeAreEyebrow: string;
  whoWeAreBody: string;
  mission: string;
  vision: string;
  valuesStatement: string;
}) {
  const columns = [
    { index: "01", label: "Our Mission", copy: mission },
    { index: "02", label: "Our Vision", copy: vision },
    { index: "03", label: "Our Values", copy: valuesStatement },
  ];

  return (
    <section className="bg-white px-4 sm:px-8 py-16 sm:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-12 sm:mb-16">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            {whoWeAreEyebrow}
          </p>
          <p className="font-serif font-medium text-card-title sm:text-card-title-desktop text-ordift-ink leading-snug">
            {whoWeAreBody}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6 border-t border-black/10 pt-10 sm:pt-12">
          {columns.map((c) => (
            <div key={c.index}>
              <p className="font-serif font-light text-eyebrow text-ordift-ink/25 mb-2 tabular-nums">{c.index}</p>
              <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold-pressed mb-2">
                {c.label}
              </p>
              <p className="font-sans text-body-small text-ordift-ink-muted">{c.copy}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-10 sm:mt-14">
          <Link
            href="/team"
            className="font-sans text-body-small font-semibold text-ordift-ink hover:text-ordift-gold-pressed transition-colors underline underline-offset-4"
          >
            Meet the Minds Behind the Scenes →
          </Link>
        </div>
      </div>
    </section>
  );
}
