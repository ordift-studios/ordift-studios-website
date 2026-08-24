import Link from "next/link";
import Image from "next/image";

// Homepage About Preview (2026-08-24, consolidated per direction) — ONE
// coherent Homepage chapter, not four separate full-screen sections.
// Who We Are leads as a compact intro; Our Mission/Our Vision/Our
// Values follow immediately below as a tight grid of modest, fixed-
// aspect-ratio panels within the SAME <section>, so the whole
// composition reads as a single editorial "About preview" as the
// visitor scrolls past it, matching the reference image's layout
// hierarchy without literally becoming a sequence of full-height
// screens. Mission/Vision panels use admin-assigned background
// photography (Admin -> Portfolio -> Homepage About Visuals) with
// their own focal point — reused from the existing image-repositioning
// system, not a new one — and degrade to a clean solid-colour panel
// when unset; Values stays a plain text panel by design (no background
// image case in this design). "Meet the Minds Behind the Scenes" sizes
// down considerably on mobile per direction, rather than sharing the
// desktop treatment's scale.
type BandImage = { url: string; alt: string; focalX: number; focalY: number } | null;

export default function AboutPreview({
  whoWeAreEyebrow,
  whoWeAreBody,
  mission,
  vision,
  valuesStatement,
  missionImage,
  visionImage,
}: {
  whoWeAreEyebrow: string;
  whoWeAreBody: string;
  mission: string;
  vision: string;
  valuesStatement: string;
  missionImage: BandImage;
  visionImage: BandImage;
}) {
  return (
    <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
      <div className="max-w-6xl mx-auto">
        {/* Who We Are — compact intro, not a full-viewport title band. */}
        <div className="max-w-2xl mx-auto text-center mb-8 sm:mb-10">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            {whoWeAreEyebrow}
          </p>
          <p className="font-serif font-medium text-card-title sm:text-card-title-desktop text-ordift-ink leading-snug">
            {whoWeAreBody}
          </p>
        </div>

        {/* Mission / Vision / Values — one tight grid, fixed modest
            height per panel (not min-h screens), stacking to a single
            column on mobile without becoming excessively tall. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Panel label="Our Mission" copy={mission} image={missionImage} />
          <Panel label="Our Vision" copy={vision} image={visionImage} />
          <ValuesPanel copy={valuesStatement} />
        </div>

        {/* Meet the Minds CTA — deliberately restrained on mobile (a
            plain small link), a touch more editorial from sm: up. */}
        <div className="flex justify-end mt-6 sm:mt-8">
          <Link
            href="/team"
            className="font-sans text-caption sm:text-body-small font-semibold text-ordift-ink hover:text-ordift-gold-pressed transition-colors underline underline-offset-4"
          >
            Meet the Minds Behind the Scenes →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Panel({ label, copy, image }: { label: string; copy: string; image: BandImage }) {
  return (
    <div className="relative aspect-[4/5] sm:aspect-[3/4] rounded-lg overflow-hidden bg-ordift-navy-950 flex items-end p-5 sm:p-6">
      {image && (
        <Image
          src={image.url}
          alt=""
          fill
          sizes="(min-width: 640px) 33vw, 100vw"
          className="object-cover"
          style={{ objectPosition: `${image.focalX}% ${image.focalY}%` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      <div className="relative">
        <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-white mb-2">{label}</p>
        <p className="font-serif font-medium text-body-small sm:text-body text-white leading-snug">{copy}</p>
      </div>
    </div>
  );
}

function ValuesPanel({ copy }: { copy: string }) {
  return (
    <div className="aspect-[4/5] sm:aspect-[3/4] rounded-lg bg-ordift-offwhite flex flex-col justify-end p-5 sm:p-6">
      <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold-pressed mb-2">
        Our Values
      </p>
      <p className="font-serif font-medium text-body-small sm:text-body text-ordift-ink leading-snug">{copy}</p>
    </div>
  );
}
