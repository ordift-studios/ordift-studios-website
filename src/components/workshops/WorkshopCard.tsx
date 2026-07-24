import Link from "next/link";
import type { Category, Venue, Workshop } from "@/lib/content/types";
import { STATUS_BADGE_CLASSES, STATUS_LABEL, formatDateRange } from "@/lib/content/workshopHelpers";

type WorkshopCardProps = {
  workshop: Workshop;
  categories: Category[];
  venue: Venue | null;
};

export default function WorkshopCard({ workshop, categories, venue }: WorkshopCardProps) {
  return (
    <Link
      href={`/workshops/${workshop.slug}`}
      className="block rounded-xl border border-black/10 bg-ordift-offwhite p-5 sm:p-6 transition-colors hover:border-black/20"
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span
          className={`inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] ${STATUS_BADGE_CLASSES[workshop.status]}`}
        >
          {STATUS_LABEL[workshop.status]}
        </span>
        {venue && (
          <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-navy-950/5 text-ordift-ink-muted">
            {venue.format === "in-person" ? "In Person" : venue.format === "online" ? "Online" : "Hybrid"}
          </span>
        )}
        {workshop.isMembersOnly && (
          <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold/15 text-ordift-gold-pressed">
            Members Only
          </span>
        )}
      </div>

      <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-2">
        {workshop.title}
      </p>
      <p className="font-sans text-body-small text-ordift-ink-muted mb-4">
        {workshop.shortDescription}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-sans text-caption text-ordift-ink-muted">{formatDateRange(workshop)}</p>
        {categories.length > 0 && (
          <p className="font-sans text-caption text-ordift-gold-pressed">
            {categories.map((c) => c.name).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}
