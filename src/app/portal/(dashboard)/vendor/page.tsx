import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClient } from "@/lib/supabase/server";
import { listMyEngagements, groupEngagementsByLifecycle } from "@/lib/portal/engagementPortalData";
import ExternalWorkforceEngagements from "@/components/portal/ExternalWorkforceEngagements";

export const metadata: Metadata = {
  title: "Vendor — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  active: "Active",
  inactive: "Inactive",
};

// Phase H.1/H.2 (2026-09-04) — replaced the prior placeholder-only page
// with the real, shared engagement/compensation surface (same
// listMyEngagements() the collaborator dashboard uses — engagement
// ownership, not role, is what scopes this data).
//
// Phase K.1 (2026-09-05) — brought up to the same depth as the
// contractor dashboard using the same shared component and grouping
// function (ExternalWorkforceEngagements/groupEngagementsByLifecycle),
// not a re-implementation: Vendor now gets Completed/Cancelled history
// too, for free. Files remains correctly absent — not because this
// page omits a section, but because modulesForRelationship("vendor")
// itself says files: false, and the shared engagement detail page
// (Phase K.1) now actually consults that before rendering Files/
// Feedback, instead of rendering them unconditionally for any owner as
// it did before this phase.
export default async function VendorPortalPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [{ data: profile }, engagements] = await Promise.all([
    user ? supabase.from("vendor_profiles").select("company_name, status").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? listMyEngagements(user.id) : Promise.resolve([]),
  ]);
  const { active: activeEngagements, completed: completedEngagements, cancelled: cancelledEngagements } = groupEngagementsByLifecycle(engagements);

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Vendor / Partner
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {profile?.company_name || "My Account"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {profile ? STATUS_LABELS[profile.status] ?? profile.status : "Not yet set up"}
        </p>
      </div>

      <ExternalWorkforceEngagements
        engagementBasePath="/portal/collaborator/engagement"
        active={activeEngagements}
        completed={completedEngagements}
        cancelled={cancelledEngagements}
        emptyActiveMessage="No active engagements yet. Ordift Studios will coordinate directly with you when there's work to assign."
      />
    </div>
  );
}
