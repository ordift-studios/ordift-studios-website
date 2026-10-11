import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { listMyCrewJobs } from "@/lib/crewSupport/crewOffers";
import { getReadinessChips } from "@/lib/crewSupport/readiness";
import MyAssignmentsList from "@/components/portal/MyAssignmentsList";

export const metadata: Metadata = { title: "My Assignments — Ordift Studios Admin", robots: { index: false, follow: false } };

// My Workspace → My Assignments. The signed-in person's OWN Creative Crew Support offers and
// assignments, resolved from their user id (the assignee) — not from their role. Being a Super Admin
// neither adds nor hides anything here: you see the jobs you personally hold, which keeps the
// professional role separate from management oversight (that lives under Crew Support).
// Reuses the existing job data and detail pages; nothing is duplicated.
export default async function MyAssignmentsPage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/portal");
  const jobs = await listMyCrewJobs(user.id);
  const chips = await getReadinessChips(user.id, jobs.map((j) => ({ slotId: j.slotId, engagementId: j.engagementId, state: j.state })));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">My Assignments</h1>
        <p className="mt-2 max-w-2xl font-sans text-body-small text-ordift-ink-muted">Offers and jobs assigned to you. Open one for the brief, dates, instructions and your assignment workspace.</p>
      </div>
      <MyAssignmentsList jobs={jobs} today={today} hrefFor={(j) => `/portal/crew-offers/${j.slotId}`} chips={chips} />
    </div>
  );
}
