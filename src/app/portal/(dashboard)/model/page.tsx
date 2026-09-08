import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClient } from "@/lib/supabase/server";
import { listMyEngagements, groupEngagementsByLifecycle } from "@/lib/portal/engagementPortalData";
import ExternalWorkforceEngagements from "@/components/portal/ExternalWorkforceEngagements";

export const metadata: Metadata = {
  title: "My Profile — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  active: "Active",
  inactive: "Inactive",
};

// TALENT-SYS-1 Foundation (2026-09-08).
const REPRESENTATION_LABELS: Record<string, string> = {
  unrepresented: "Not currently represented",
  exclusive: "Exclusive representation",
  non_exclusive: "Non-exclusive representation",
  lapsed: "Representation lapsed",
};

// Phase H.1/H.2 (2026-09-04) — Section 7: replaced the placeholder-only
// page with a real shared surface (bookings/compensation via the same
// engagement data every other relationship reads). Talent Management's
// full booking/application/portfolio platform remains out of scope —
// this shows real bookings if any exist, and a professional empty
// state if not, never an invented feature.
//
// Phase K.1 (2026-09-05) — brought up to the same depth as the
// contractor dashboard via the same shared component/grouping function
// as Vendor, with "Bookings"/"Booking" kept as the model-appropriate
// label (contextual copy only — modulesForRelationship("model") is what
// actually decides Files/Feedback stay absent, unchanged by this).
export default async function ModelPortalPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [{ data: profile }, engagements] = await Promise.all([
    user ? supabase.from("model_profiles").select("status, representation_status").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? listMyEngagements(user.id) : Promise.resolve([]),
  ]);
  const { active: activeEngagements, completed: completedEngagements, cancelled: cancelledEngagements } = groupEngagementsByLifecycle(engagements);

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Talent
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          My Profile
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {profile ? STATUS_LABELS[profile.status] ?? profile.status : "Not yet set up"}
        </p>
        {profile ? (
          <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
            {REPRESENTATION_LABELS[profile.representation_status] ?? profile.representation_status}
          </p>
        ) : null}
      </div>

      <ExternalWorkforceEngagements
        engagementBasePath="/portal/collaborator/engagement"
        active={activeEngagements}
        completed={completedEngagements}
        cancelled={cancelledEngagements}
        heading="Bookings"
        itemFallbackLabel="Booking"
        emptyActiveMessage="No active bookings yet. Ordift Studios manages your representation directly and will reach out when there's a booking to confirm."
      />
    </div>
  );
}
