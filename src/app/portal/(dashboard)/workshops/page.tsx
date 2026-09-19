import type { Metadata } from "next";
import Link from "next/link";
import Button from "@/components/Button";
import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkshopRegistrationsForUser, type PortalWorkshopRegistration } from "@/lib/portal/data";
import { contentRepository } from "@/lib/content";

export const metadata: Metadata = {
  title: "My Workshops — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Classified = { reg: PortalWorkshopRegistration; startDate: string | null; endDate: string | null };

// Workshop Learning Infrastructure V1 (2026-09-19) — Upcoming/In
// Progress/Completed derived from the workshop's own real status/dates
// (never a fabricated 4th status). Cancelled registrations are shown
// separately, outside all three groups, since "cancelled" isn't a
// lifecycle stage a participant is currently progressing through.
function classify(items: Classified[], today: string) {
  const upcoming: Classified[] = [];
  const inProgress: Classified[] = [];
  const completed: Classified[] = [];
  const other: Classified[] = [];

  for (const item of items) {
    if (item.reg.registrationStatus === "Cancelled") {
      other.push(item);
    } else if (item.startDate && item.startDate <= today && (!item.endDate || item.endDate >= today)) {
      inProgress.push(item);
    } else if (item.endDate ? item.endDate < today : item.startDate && item.startDate < today) {
      completed.push(item);
    } else {
      upcoming.push(item);
    }
  }
  return { upcoming, inProgress, completed, other };
}

function RegistrationCard({ reg }: { reg: PortalWorkshopRegistration }) {
  return (
    <div className="bg-white border border-black/10 rounded-2xl p-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-sans text-caption text-ordift-ink-muted uppercase tracking-wide mb-1">{reg.registrationReference}</p>
        <Link
          href={`/portal/client/projects/workshop/${reg.id}`}
          className="font-serif text-body text-ordift-ink mb-1 hover:text-ordift-gold-pressed underline-offset-4 hover:underline block"
        >
          {reg.workshopTitle}
        </Link>
        <p className="font-sans text-body-small text-ordift-ink-muted">Registered {formatDate(reg.registrationDate)}</p>
        <Link href={`/workshops/${reg.workshopSlug}`} className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4">
          View public workshop page →
        </Link>
      </div>
      <div className="text-right">
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ordift-offwhite font-sans text-body-small font-medium text-ordift-ink">
          {reg.registrationStatus}
          {reg.registrationStatus === "Waitlisted" && reg.waitingListPosition ? ` (position ${reg.waitingListPosition})` : ""}
        </span>
        <p className="font-sans text-caption text-ordift-ink-muted mt-2">Payment: {reg.paymentStatus}</p>
        {reg.certificateIssued && reg.certificateUrl && (
          <a href={reg.certificateUrl} target="_blank" rel="noopener noreferrer" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 mt-2 inline-block">
            View Certificate
          </a>
        )}
      </div>
    </div>
  );
}

function Group({ title, items }: { title: string; items: Classified[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="font-serif font-medium text-body text-ordift-ink">{title}</h2>
      <div className="grid grid-cols-1 gap-4">
        {items.map(({ reg }) => (
          <RegistrationCard key={reg.id} reg={reg} />
        ))}
      </div>
    </div>
  );
}

export default async function WorkshopParticipantPortalPage() {
  const user = await getCurrentUser();
  const registrations = user ? await getWorkshopRegistrationsForUser(user.id) : [];

  const withDates: Classified[] = await Promise.all(
    registrations.map(async (reg) => {
      const workshop = await contentRepository.getWorkshopBySlug(reg.workshopSlug);
      return { reg, startDate: workshop?.startDate ?? null, endDate: workshop?.endDate ?? null };
    })
  );
  const today = new Date().toISOString().slice(0, 10);
  const { upcoming, inProgress, completed, other } = classify(withDates, today);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
            OS Academy
          </p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
            My Workshops
          </h1>
        </div>
        <Button href="/workshops" variant="dark">
          Browse Workshops
        </Button>
      </div>

      {registrations.length === 0 ? (
        <div className="bg-white border border-black/10 rounded-2xl p-10 text-center">
          <p className="font-sans text-body text-ordift-ink-muted max-w-md mx-auto mb-6">
            You haven&apos;t registered for a workshop with this account yet.
            Once you do, your registrations and certificates will appear
            here.
          </p>
          <Button href="/workshops" variant="primary">
            Explore Workshops
          </Button>
        </div>
      ) : (
        <div className="space-y-10">
          <Group title="In Progress" items={inProgress} />
          <Group title="Upcoming" items={upcoming} />
          <Group title="Completed" items={completed} />
          <Group title="Other" items={other} />
        </div>
      )}
    </div>
  );
}
