import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { listMyCrewJobs } from "@/lib/crewSupport/crewOffers";

import { getReadinessChips } from "@/lib/crewSupport/readiness";
import MyAssignmentsList from "@/components/portal/MyAssignmentsList";

export const metadata: Metadata = { title: "My Assignments — Ordift Studios Portal", robots: { index: false, follow: false } };

// The signed-in professional's own Creative Crew Support offers and assignments —
// nothing about anyone else's jobs. (Route kept as /portal/crew-offers so existing links and emails work.)
export default async function CrewOffersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/portal/crew-offers");
  const jobs = await listMyCrewJobs(user.id);
  const chips = await getReadinessChips(user.id, jobs.map((j) => ({ slotId: j.slotId, engagementId: j.engagementId, state: j.state })));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">My Assignments</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted max-w-2xl">Offers and jobs assigned to you. Open one for the brief, dates, instructions and your assignment workspace.</p>
      </div>
      <MyAssignmentsList jobs={jobs} today={today} hrefFor={(j) => `/portal/crew-offers/${j.slotId}`} chips={chips} />
    </div>
  );
}
