import Link from "next/link";
import Image from "next/image";

// Homepage About Preview (2026-08-24, revised to horizontal editorial
// bands per the reference) — ONE Homepage chapter (a single wrapping
// <section>, not four separate ones), composed as: a contained Who We
// Are title, then Our Mission/Our Vision as full-bleed horizontal rows
// (label on one side, copy occupying the larger area beside it,
// content-driven height rather than a fixed card aspect ratio, so
// there's no leftover empty space the way the earlier card-grid
// version had), then a contained plain Our Values row. Mission/Vision
// use admin-assigned background photography (Admin -> Portfolio ->
// Homepage About Visuals) with the existing focal-point system,
// degrading to the approved solid-navy fallback when unset — never
// auto-selected Portfolio content. Full-bleed only for Mission/Vision
// (the same edge-to-edge rhythm the reference itself uses for its
// colour/photo rows); Who We Are and Our Values stay within the
// page's normal contained width, matching the reference's own plain
// title/list sections.
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
    <section className="bg-white">
      {/* Who We Are — contained, compact title, not a full-viewport band.
          Top padding tightened considerably (2026-08-24 follow-up) —
          the goal is the whole section reading as one composed frame,
          not several loosely stacked pieces; text size is unchanged. */}
      <div className="px-4 sm:px-8 pt-8 sm:pt-10 pb-6 sm:pb-8">
        <div className="max-w-2xl mx-auto text-center">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            {whoWeAreEyebrow}
          </p>
          <p className="font-serif font-medium text-card-title sm:text-card-title-desktop text-ordift-ink leading-snug">
            {whoWeAreBody}
          </p>
        </div>
      </div>

      {/* Our Mission / Our Vision — full-bleed horizontal rows, height
          driven by padding + content, never a forced card shape.
          Padding tightened alongside Who We Are's, same reasoning. */}
      <Band label="Our Mission" copy={mission} image={missionImage} />
      <Band label="Our Vision" copy={vision} image={visionImage} />

      {/* Our Values — contained, plain (no image by design), same
          label-beside-copy rhythm as the two rows above it. */}
      <div className="px-4 sm:px-8 py-8 sm:py-10 bg-ordift-offwhite">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-8 items-center">
          <div className="md:col-span-3">
            <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold-pressed">
              Our Values
            </p>
          </div>
          <div className="md:col-span-8 md:col-start-5">
            <p className="font-serif font-medium text-card-title text-ordift-ink leading-snug">{valuesStatement}</p>
          </div>
        </div>
      </div>

      {/* Meet the Minds CTA — deliberately restrained on mobile (a
          plain small link), a touch more editorial from sm: up. */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 flex justify-end">
        <Link
          href="/team"
          className="font-sans text-caption sm:text-body-small font-semibold text-ordift-ink hover:text-ordift-gold-pressed transition-colors underline underline-offset-4"
        >
          Meet the Minds Behind the Scenes →
        </Link>
      </div>
    </section>
  );
}

function Band({ label, copy, image }: { label: string; copy: string; image: BandImage }) {
  return (
    <div className="relative bg-ordift-navy-950 px-4 sm:px-8 py-8 sm:py-10 overflow-hidden">
      {/* Background blur (2026-08-24) — presentation-only: a CSS filter
          applied to this <Image> element alone, never touching the
          uploaded Sanity/Storage asset itself (still full-resolution
          and sharp everywhere else it's used, e.g. the Admin picker's
          own preview). blur-md (12px) is Tailwind's established scale
          step for "clearly softened, still recognizable" rather than
          blur-lg+ which starts reading as a flat colour wash. scale-110
          expands the blurred image slightly beyond the (overflow-hidden)
          container so the blur's own soft edge is cropped away rather
          than showing as a faint halo at the frame's boundary — a
          standard technique for blurred background images. The label/
          copy text below lives in a separate sibling element and is
          completely unaffected by this filter. */}
      {image && (
        <Image
          src={image.url}
          alt=""
          fill
          sizes="100vw"
          className="object-cover blur-md"
          // scale via inline style, not a Tailwind transform utility —
          // found live (2026-08-24) that next/image's own `fill` styles
          // took precedence over the scale-110 class, leaving it
          // computing as no-op. An inline transform has higher
          // specificity and isn't subject to that conflict.
          style={{ objectPosition: `${image.focalX}% ${image.focalY}%`, transform: "scale(1.1)" }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/20" />
      <div className="relative max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-8 items-center">
        <div className="md:col-span-3">
          <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-white">{label}</p>
        </div>
        <div className="md:col-span-8 md:col-start-5">
          <p className="font-serif font-medium text-card-title sm:text-card-title-desktop text-white leading-snug">
            {copy}
          </p>
        </div>
      </div>
    </div>
  );
}
