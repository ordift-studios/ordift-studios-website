import Link from "next/link";
import Image from "next/image";

// Homepage short About introduction (2026-08-24, revised per approved
// reference layout) — a stacked editorial sequence as the visitor
// scrolls (Who We Are -> Our Mission -> Our Vision -> Our Values), not
// a horizontal triptych. The reference image's own structure is
// mirrored (a plain title band, then full-bleed color/photo bands with
// a label-left/copy-right split, then a plain list band at the end) —
// its literal blue color block is replaced with real Ordift photography
// (existing published portfolio hero images, passed in as props) per
// direction, since inventing new imagery isn't appropriate here. Every
// piece of text reuses already-approved Sanity copy — nothing new was
// written for this preview, and content stays to 1-2 lines per section
// so the deeper detail stays exclusive to the full About page.
type BandImage = { url: string; alt: string } | null;

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
    <>
      {/* Who We Are — plain, title-scale, mirrors the reference's own
          plain white "About us" opening band. */}
      <section className="bg-white px-4 sm:px-8 pt-16 sm:pt-24 pb-14 sm:pb-20 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.25em] text-eyebrow text-ordift-gold-pressed mb-4">
            {whoWeAreEyebrow}
          </p>
          <p className="font-serif font-medium text-page-title sm:text-page-title-tablet text-ordift-ink leading-snug">
            {whoWeAreBody}
          </p>
        </div>
      </section>

      <PhotoBand label="Our Mission" copy={mission} image={missionImage} />
      <PhotoBand label="Our Vision" copy={vision} image={visionImage} />

      {/* Our Values — plain band closing the sequence, matching the
          reference's own plain list treatment; kept to one concise
          studio-wide statement rather than the full 5-value breakdown,
          which stays exclusive to the full About page. */}
      <section className="bg-ordift-offwhite px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-4">
              Our Values
            </p>
            <p className="font-serif font-medium text-card-title sm:text-card-title-desktop text-ordift-ink leading-snug">
              {valuesStatement}
            </p>
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
    </>
  );
}

function PhotoBand({ label, copy, image }: { label: string; copy: string; image: BandImage }) {
  return (
    <section className="relative min-h-[420px] sm:min-h-[520px] flex items-center px-4 sm:px-8 py-16 sm:py-20 overflow-hidden bg-ordift-navy-950">
      {image && (
        <Image
          src={image.url}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
      )}
      {/* Darkening overlay so white type stays legible over any photo —
          a plain gradient rather than a flat scrim, so the image still
          reads through. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
      <div className="relative max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-10">
        <div className="md:col-span-4">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-white">{label}</p>
        </div>
        <div className="md:col-span-7 md:col-start-6">
          <p className="font-serif font-medium text-card-title sm:text-card-title-desktop text-white leading-snug">
            {copy}
          </p>
        </div>
      </div>
    </section>
  );
}
