import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { listGrievancesForProfile } from "@/lib/organization/grievances";
import { listAppealsForProfile } from "@/lib/organization/appeals";
import { MyGrievancesWorkspace } from "./MyGrievancesWorkspace";

export const metadata: Metadata = {
  title: "My Grievances — Ordift Studios",
  robots: { index: false, follow: false },
};

// Employee Self-Service — My Grievances, Speak-Up & Appeals (Phase B6
// Step 6, 2026-09-15). Grievances and Speak-Up stay genuinely separate
// workflows even on one page — different forms, different backend
// functions, different tables. Every read/write is always scoped to
// the CURRENT user's own id.
export default async function MyGrievancesPage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const [grievances, appeals] = await Promise.all([listGrievancesForProfile(user.id), listAppealsForProfile(user.id)]);

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Grievances</h1>
      </div>

      <MyGrievancesWorkspace
        grievances={grievances.map((g) => ({ id: g.id, grievanceType: g.grievanceType, description: g.description, status: g.status, submittedAt: g.submittedAt, resolutionNotes: g.resolutionNotes }))}
        appeals={appeals}
      />
    </div>
  );
}
