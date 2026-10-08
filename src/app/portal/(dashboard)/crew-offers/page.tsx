import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { listMyCrewJobs } from "@/lib/crewSupport/crewOffers";

export const metadata: Metadata = { title: "Crew Jobs — Ordift Studios Portal", robots: { index: false, follow: false } };

// The signed-in crew member's own Creative Crew Support offers and jobs —
// nothing about the client or anyone else's assignments.
export default async function CrewOffersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/portal/crew-offers");
  const jobs = await listMyCrewJobs(user.id);
  const offered = jobs.filter((j) => j.state === "offered");
  const accepted = jobs.filter((j) => j.state === "accepted");

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Creative Crew Support</p>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">My crew jobs</h1>
      </div>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Waiting for your response</h2>
        {offered.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No offers are waiting.</p> : (
          <ul className="space-y-3">{offered.map((j) => (
            <li key={j.slotId}><Link href={`/portal/crew-offers/${j.slotId}`} className="block bg-white border border-black/10 rounded-2xl p-5 hover:border-ordift-gold transition-colors">
              <p className="font-sans text-body-small font-medium text-ordift-ink">{j.role} · {j.startDate === j.endDate ? j.startDate : `${j.startDate} → ${j.endDate}`}</p>
              <p className="font-sans text-caption text-ordift-ink-muted mt-1">{j.location}{j.offer ? ` · offered ${j.offer.currency} ${j.offer.amount.toFixed(2)}` : ""}</p>
            </Link></li>
          ))}</ul>
        )}
      </section>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Jobs you&apos;ve accepted</h2>
        {accepted.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">None yet.</p> : (
          <ul className="space-y-3">{accepted.map((j) => (
            <li key={j.slotId}><Link href={`/portal/crew-offers/${j.slotId}`} className="block bg-white border border-black/10 rounded-2xl p-5 hover:border-ordift-gold transition-colors">
              <p className="font-sans text-body-small font-medium text-ordift-ink">{j.role} · {j.startDate === j.endDate ? j.startDate : `${j.startDate} → ${j.endDate}`}{j.jobClosed ? " · closed" : ""}</p>
              <p className="font-sans text-caption text-ordift-ink-muted mt-1">{j.projectName} · {j.location}</p>
            </Link></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
