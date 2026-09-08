import Link from "next/link";
import ResponsiveImage from "@/components/media/ResponsiveImage";
import type { TalentProfile } from "@/lib/content/types";

// Ordift Talent — TALENT-SYS-2B, Phase 3 (2026-09-08). "Our Roster"
// card — The Grid's discipline (consistent portraits, strong
// repetition, name attached clearly to the face, restrained supporting
// information) as the primary architecture, per the approved
// consolidated direction. No literal casting-wall/Polaroid gimmicks —
// just a disciplined, repeated grid.
export default function TalentRosterCard({ talent }: { talent: TalentProfile }) {
  return (
    <Link href={`/talent/${talent.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-lg bg-ordift-navy-950">
        <ResponsiveImage
          src={talent.heroImage?.url ?? null}
          alt={talent.heroImage?.alt || talent.name}
          width={talent.heroImage?.width}
          height={talent.heroImage?.height}
          lqip={talent.heroImage?.lqip}
          aspectRatio="3/4"
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {talent.availabilityNote ? (
          <span className="absolute top-3 left-3 inline-block rounded-full px-2.5 py-1 font-sans text-caption font-semibold uppercase tracking-[0.08em] bg-white/90 text-ordift-ink">
            {talent.availabilityNote}
          </span>
        ) : null}
      </div>
      <div className="pt-3">
        <p className="font-serif font-medium text-body text-ordift-ink">{talent.name}</p>
        <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">
          {[talent.category, talent.location].filter(Boolean).join(" — ")}
        </p>
      </div>
    </Link>
  );
}
